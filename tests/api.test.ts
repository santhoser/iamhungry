import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDatabase, hashPassword } from "../server/db.js";
import { createApp } from "../server/app.js";

test("complete counter order lifecycle, permissions, audit, refunds and privacy", async () => {
  const db = openDatabase(":memory:");
  db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
    "testowner",
    hashPassword("Owner-Test-Password-42"),
    "owner",
  );
  db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
    "testcashier",
    hashPassword("Cashier-Test-Password-42"),
    "cashier",
  );
  const app = createApp(db);
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
    const menuItem = (
      await request("/admin/menu", "GET", undefined, owner.cookie)
    ).data.items[0];
    const privateDetails = {
      ...menuItem,
      calories: "500 kcal; protein 20g",
      ingredients: "milk, wheat",
      showCalories: false,
      showIngredients: false,
    };
    assert.equal(
      (
        await request(
          `/admin/menu/${menuItem.id}`,
          "PUT",
          privateDetails,
          owner.cookie,
        )
      ).status,
      200,
    );
    let publicItem = (await request("/menu?table=" + token)).data.items.find(
      (i: any) => i.id === menuItem.id,
    );
    assert.equal(publicItem.calories, "");
    assert.equal(publicItem.ingredients, "");
    assert.equal(
      (
        await request(
          `/admin/menu/${menuItem.id}`,
          "PUT",
          { ...privateDetails, showCalories: true, showIngredients: true },
          owner.cookie,
        )
      ).status,
      200,
    );
    publicItem = (await request("/menu?table=" + token)).data.items.find(
      (i: any) => i.id === menuItem.id,
    );
    assert.equal(publicItem.calories, privateDetails.calories);
    assert.equal(publicItem.ingredients, privateDetails.ingredients);
    const counterInput = {
      table: 1,
      name: "Walk-in guest",
      requestKey: randomUUID(),
      items: [{ id: menuItem.id, quantity: 1 }],
    };
    assert.equal(
      (await request("/admin/orders", "POST", counterInput)).status,
      401,
    );
    assert.equal(
      (
        await request(
          "/admin/orders",
          "POST",
          { ...counterInput, table: 999 },
          cashier.cookie,
        )
      ).status,
      400,
    );
    const counterOrder = await request(
      "/admin/orders",
      "POST",
      counterInput,
      cashier.cookie,
    );
    assert.equal(counterOrder.status, 201);
    assert.equal(counterOrder.data.order.tableNumber, 1);
    assert.equal(counterOrder.data.order.events[0].actor, "testcashier");
    assert.equal(
      (
        await request(`/orders/${counterOrder.data.token}/messages`, "POST", {
          text: "Please bring water",
        })
      ).status,
      201,
    );
    let conversation = await request(
      `/admin/orders/${counterOrder.data.order.id}`,
      "GET",
      undefined,
      cashier.cookie,
    );
    assert.equal(conversation.data.messages[0].text, "Please bring water");
    assert.equal(conversation.data.messages[0].readAt, null);
    assert.equal(
      (
        await request(
          `/admin/orders/${counterOrder.data.order.id}/messages/read`,
          "POST",
          {},
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await request(
          `/admin/orders/${counterOrder.data.order.id}/messages/read`,
          "POST",
          {},
          cashier.cookie,
        )
      ).status,
      200,
    );
    conversation = await request(
      `/admin/orders/${counterOrder.data.order.id}`,
      "GET",
      undefined,
      cashier.cookie,
    );
    assert.ok(conversation.data.messages[0].readAt);
    assert.equal(
      (
        await request(
          `/admin/orders/${counterOrder.data.order.id}/messages`,
          "POST",
          { text: "On our way" },
          cashier.cookie,
        )
      ).status,
      201,
    );
    conversation = await request(`/orders/${counterOrder.data.token}`);
    assert.equal(conversation.data.messages[1].text, "On our way");
    assert.equal(conversation.data.messages[1].readAt, null);
    assert.equal(
      (
        await request(
          `/orders/${counterOrder.data.token}/messages/read`,
          "POST",
          {},
        )
      ).status,
      200,
    );
    conversation = await request(`/orders/${counterOrder.data.token}`);
    assert.ok(conversation.data.messages[1].readAt);
    assert.equal(
      (
        await request(
          `/admin/orders/${counterOrder.data.order.id}/status`,
          "POST",
          { status: "Cancelled", version: 1, reason: "Test complete" },
          cashier.cookie,
        )
      ).status,
      200,
    );
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
    assert.equal(order.amounts.total, 16000);
    assert.equal(order.paid, 0);
    assert.equal(order.restaurant.cgstRate, 2.5);
    assert.equal(order.restaurant.sgstRate, 2.5);
    assert.equal(order.amounts.cgst, 381);
    assert.equal(order.amounts.sgst, 381);
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
      { kind: "payment", version: order.version },
      cashier.cookie,
    );
    assert.equal(pay.status, 200);
    order = pay.data;
    assert.equal(
      (
        await request(
          "/admin/orders/" + order.id + "/payment",
          "POST",
          { kind: "payment", version: order.version },
          cashier.cookie,
        )
      ).status,
      409,
    );
    assert.equal((await status("Closed")).status, 200);
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
    assert.equal(dashboard.data.sales, 16000);
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
      { kind: "payment", version: order.version },
      owner.cookie,
    );
    order = payment.data;
    assert.equal((await status("Cancelled")).status, 200);
    assert.equal(order.paid, 16000);
    assert.equal(order.refunded, 0);
    const refund = await request(
      "/admin/orders/" + order.id + "/payment",
      "POST",
      { kind: "refund", version: order.version },
      cashier.cookie,
    );
    assert.equal(refund.status, 200);
    order = refund.data;
    assert.equal(order.refunded, 16000);
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
    assert.equal(original.data.items[0].price, 8000);
    assert.equal(original.data.amounts.total, 16000);
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
  const db = openDatabase(":memory:");
  const app = createApp(db, { setupToken: "test-setup-token" });
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

test("HTTPS through an opt-in loopback proxy preserves origin checks and secure cookies", async () => {
  for (const trustLocalProxy of [false, true]) {
    const db = openDatabase(":memory:");
    db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
      "proxyowner",
      hashPassword("Proxy-Test-Password-42"),
      "owner",
    );
    const app = createApp(db, { trustLocalProxy });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const port = (server.address() as { port: number }).port;
    const login = (origin: string) =>
      fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",

          Origin: origin,
          "X-Forwarded-Proto": "https",
        },
        body: JSON.stringify({
          username: "proxyowner",
          password: "Proxy-Test-Password-42",
        }),
      });
    try {
      const response = await login(`https://127.0.0.1:${port}`);
      assert.equal(response.status, trustLocalProxy ? 200 : 403);
      if (trustLocalProxy)
        assert.match(response.headers.get("set-cookie") || "", /; Secure/);
      assert.equal((await login("https://untrusted.example")).status, 403);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      db.close();
    }
  }
});
