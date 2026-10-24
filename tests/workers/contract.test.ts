import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../../workers/crypto.js";
import { openWorkersDatabase, createWorkerHttpApp } from "./fixture.js";

test("complete counter order lifecycle, permissions, audit, refunds and privacy", async () => {
  const db = openWorkersDatabase();
  db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
    "testowner",
    await hashPassword("Owner-Test-Password-42"),
    "owner",
  );
  db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
    "testcashier",
    await hashPassword("Cashier-Test-Password-42"),
    "cashier",
  );
  const app = createWorkerHttpApp(db);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address() as { port: number };
  const base = "http://127.0.0.1:" + address.port;
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) {
    const res = await fetch(base + "/api" + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0] || "",
    };
  }
  try {
    const owner = await request("/auth/login", "POST", {
      username: "testowner",
      password: "Owner-Test-Password-42",
    });
    assert.equal(owner.status, 200);
    assert.match(owner.cookie, /cafe77_session=/);
    const cashier = await request("/auth/login", "POST", {
      username: "testcashier",
      password: "Cashier-Test-Password-42",
    });
    assert.equal(cashier.status, 200);
    assert.equal((await request("/admin/orders")).status, 401);
    assert.equal((await request("/admin/order-alerts")).status, 401);
    assert.equal(
      (await request("/admin/config", "GET", undefined, cashier.cookie)).status,
      403,
    );
    assert.equal(
      (await request("/admin/dashboard", "GET", undefined, cashier.cookie))
        .status,
      403,
    );
    assert.equal(
      (
        await request(
          "/admin/users",
          "POST",
          {
            username: "blocked",
            password: "Long-Enough-Password",
            role: "owner",
          },
          cashier.cookie,
        )
      ).status,
      403,
    );
    const tables = await request(
      "/admin/tables",
      "GET",
      undefined,
      owner.cookie,
    );
    const token = tables.data[0].token;
    assert.equal((await request("/menu?table=invalid")).status, 404);
    const menu = await request("/menu?table=" + token);
    assert.equal(menu.data.table.number, 1);
    assert.equal(menu.data.config.upiEnabled, false);
    const input = {
      table: token,
      name: "Test customer",
      email: "customer@example.test",
      phone: "9876543210",
      requestKey: randomUUID(),
      items: [{ id: menu.data.items[0].id, quantity: 2 }],
    };
    const placed = await request("/orders", "POST", input);
    assert.equal(placed.status, 201);
    let order = placed.data.order;
    assert.equal(order.amounts.total, 20000);
    assert.equal(order.paid, 0);
    const retry = await request("/orders", "POST", input);
    assert.equal(retry.data.order.id, order.id);
    assert.equal(retry.data.token, placed.data.token);
    assert.equal(
      (await request("/orders", "POST", { ...input, name: "Different" }))
        .status,
      409,
    );
    assert.equal((await request("/orders/" + order.number)).status, 404);
    assert.equal((await request("/orders/" + placed.data.token)).status, 200);
    const alertSnapshot = async () =>
      (await request("/admin/order-alerts", "GET", undefined, cashier.cookie))
        .data;
    assert.deepEqual(
      (await alertSnapshot()).find((o: any) => o.id === order.id),
      {
        id: order.id,
        messageId: 0,
      },
    );
    await request("/orders/" + placed.data.token + "/messages", "POST", {
      text: "Bell contract message",
    });
    const messageAlert = (await alertSnapshot()).find(
      (o: any) => o.id === order.id,
    );
    assert.ok(messageAlert.messageId > 0);
    await request(
      "/admin/orders/" + order.id + "/messages/read",
      "POST",
      {},
      cashier.cookie,
    );
    assert.deepEqual(
      (await alertSnapshot()).find((o: any) => o.id === order.id),
      messageAlert,
    );
    const status = async (s: string, version = order.version) => {
      const r = await request(
        "/admin/orders/" + order.id + "/status",
        "POST",
        { status: s, version },
        cashier.cookie,
      );
      if (r.status === 200) order = r.data;
      return r;
    };
    assert.equal((await status("Ready")).status, 409);
    assert.equal((await status("Accepted")).status, 200);
    assert.equal((await status("Ready", 1)).status, 409);
    assert.equal((await status("InProgress")).status, 200);
    assert.equal((await status("Ready")).status, 200);
    assert.equal((await status("Closed")).status, 409);
    const pay = await request(
      "/admin/orders/" + order.id + "/payment",
      "POST",
      { kind: "payment", paymentMode: "Cash", version: order.version },
      cashier.cookie,
    );
    assert.equal(pay.status, 200);
    order = pay.data;
    assert.equal(
      (
        await request(
          "/admin/orders/" + order.id + "/payment",
          "POST",
          { kind: "payment", paymentMode: "Cash", version: order.version },
          cashier.cookie,
        )
      ).status,
      409,
    );
    assert.equal((await status("Closed")).status, 200);
    assert.equal(
      (await alertSnapshot()).some((o: any) => o.id === order.id),
      false,
    );
    assert.equal(order.events.length, 5);
    assert.equal(
      (
        await request(
          "/admin/orders?current=true",
          "GET",
          undefined,
          owner.cookie,
        )
      ).data.total,
      0,
    );
    assert.equal(
      (
        await request(
          "/admin/orders?q=customer%40example.test",
          "GET",
          undefined,
          owner.cookie,
        )
      ).data.total,
      1,
    );
    const dashboard = await request(
      "/admin/dashboard",
      "GET",
      undefined,
      owner.cookie,
    );
    assert.equal(dashboard.data.sales, 20000);
    assert.equal(dashboard.data.items[0].quantity, 2);
    assert.equal((await status("Cancelled")).status, 409);
    const m = menu.data.items[0];
    assert.equal(
      (
        await request(
          "/admin/menu/" + m.id + "/stock",
          "PUT",
          { ranOut: true },
          cashier.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request("/orders", "POST", { ...input, requestKey: randomUUID() }))
        .status,
      409,
    );
    await request(
      "/admin/menu/" + m.id + "/stock",
      "PUT",
      { ranOut: false },
      cashier.cookie,
    );
    const cancelled = await request("/orders", "POST", {
      ...input,
      requestKey: randomUUID(),
    });
    order = cancelled.data.order;
    const payment = await request(
      "/admin/orders/" + order.id + "/payment",
      "POST",
      { kind: "payment", paymentMode: "Cash", version: order.version },
      owner.cookie,
    );
    order = payment.data;
    assert.equal((await status("Cancelled")).status, 200);
    assert.equal(order.paid, 20000);
    assert.equal(order.refunded, 0);
    const refund = await request(
      "/admin/orders/" + order.id + "/payment",
      "POST",
      { kind: "refund", version: order.version },
      cashier.cookie,
    );
    assert.equal(refund.status, 200);
    order = refund.data;
    assert.equal(order.refunded, 20000);
    await request(
      "/admin/menu/" + m.id + "/stock",
      "PUT",
      { ranOut: true },
      cashier.cookie,
    );
    assert.equal((await status("New")).status, 409);
    await request(
      "/admin/menu/" + m.id + "/stock",
      "PUT",
      { ranOut: false },
      cashier.cookie,
    );
    assert.equal((await status("New")).status, 200);
    const updated = { ...m, price: 30000, active: false };
    assert.equal(
      (await request("/admin/menu/" + m.id, "PUT", updated, owner.cookie))
        .status,
      200,
    );
    const original = await request("/orders/" + placed.data.token);
    assert.equal(original.data.items[0].price, 10000);
    assert.equal(original.data.amounts.total, 20000);
    assert.equal(
      (await request("/menu")).data.items.some((x: any) => x.id === m.id),
      false,
    );
    assert.equal(
      (
        await request(
          "/admin/users/" + owner.data.id,
          "PUT",
          { active: false },
          owner.cookie,
        )
      ).status,
      400,
    );
    const invalidOrigin = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://untrusted.example",
      },
      body: JSON.stringify({
        username: "testowner",
        password: "Owner-Test-Password-42",
      }),
    });
    assert.equal(invalidOrigin.status, 403);
    assert.equal(
      (
        await request(
          "/admin/orders?from=2026-02-30",
          "GET",
          undefined,
          owner.cookie,
        )
      ).status,
      400,
    );
    await request("/auth/logout", "POST", {}, cashier.cookie);
    assert.equal(
      (await request("/auth/me", "GET", undefined, cashier.cookie)).status,
      401,
    );
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    db.close();
  }
});

test("bootstrap setup is token protected and one-time", async () => {
  const db = openWorkersDatabase();
  const app = createWorkerHttpApp(db, { setupToken: "test-setup-token" });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const port = (server.address() as { port: number }).port;
  const setup = async (token: string) =>
    fetch("http://127.0.0.1:" + port + "/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        username: "firstowner",
        password: "Long-Test-Password-42",
      }),
    });
  try {
    assert.equal((await setup("incorrect")).status, 403);
    assert.equal((await setup("test-setup-token")).status, 200);
    assert.equal((await setup("test-setup-token")).status, 403);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  }
});
