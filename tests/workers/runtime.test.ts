import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
const require = createRequire(import.meta.url);
if (process.platform === "win32") {
  const path = resolve("data/tools/workerd.exe");
  mkdirSync(resolve("data/tools"), { recursive: true });
  if (!existsSync(path)) copyFileSync(require("workerd").default, path);
  process.env.MINIFLARE_WORKERD_PATH = path;
}
test("actual workerd/D1 runtime: setup, auth, atomic order/payment, uploads and settings", async () => {
  const setupToken = randomUUID();
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: resolve("data/worker-bundle/app.js"),
      compatibilityDate: "2026-10-06",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      bindings: { SETUP_TOKEN: setupToken },
    }),
  );
  try {
    const db = await mf.getD1Database("DB");
    await db.exec(
      readFileSync("migrations/0001_cafe77.sql", "utf8")
        .split("\n")
        .filter((line) => !line.startsWith("--"))
        .join("\n"),
    );
    await db.exec(readFileSync("migrations/0002_order_checkout.sql", "utf8"));
    const request = async (
      path: string,
      method = "GET",
      body?: unknown,
      cookie = "",
    ) => {
      const res = await mf.dispatchFetch("https://cafe77.test/api" + path, {
        method,
        headers: {
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return {
        status: res.status,
        data: res.status === 204 ? null : ((await res.json()) as any),
        cookie: res.headers.get("set-cookie")?.split(";")[0] || "",
        headers: res.headers,
      };
    };
    assert.equal(
      (
        await request("/setup", "POST", {
          token: setupToken,
          username: "runtimeowner",
          password: "Runtime-Test-Password-42",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/setup", "POST", {
          token: setupToken,
          username: "runtimeother",
          password: "Runtime-Test-Password-42",
        })
      ).status,
      403,
    );
    const login = await request("/auth/login", "POST", {
      username: "runtimeowner",
      password: "Runtime-Test-Password-42",
    });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    assert.match(login.headers.get("set-cookie") || "", /Secure/);
    const tables = await request(
      "/admin/tables",
      "GET",
      undefined,
      login.cookie,
    );
    assert.equal(tables.data.length, 15);
    const menu = await request("/menu?table=" + tables.data[0].token);
    assert.equal(menu.data.items.length, 228);
    const input = {
      table: tables.data[0].token,
      name: "Runtime customer",
      phone: "9876543210",
      requestKey: randomUUID(),
      items: [{ id: 1, quantity: 2 }],
    };
    const placed = await request("/orders", "POST", input);
    assert.equal(placed.status, 201, JSON.stringify(placed.data));
    assert.equal(placed.data.order.amounts.total, 20000);
    assert.equal(placed.data.order.restaurant.cgstRate, 2.5);
    assert.equal(placed.data.order.restaurant.sgstRate, 2.5);
    assert.equal(placed.data.order.amounts.cgst, 476);
    assert.equal(placed.data.order.amounts.sgst, 476);
    const counterOrder = await request(
      "/admin/orders",
      "POST",
      {
        table: 1,
        name: "Walk-in guest",
        requestKey: randomUUID(),
        items: [{ id: 1, quantity: 1 }],
      },
      login.cookie,
    );
    assert.equal(counterOrder.status, 201, JSON.stringify(counterOrder.data));
    assert.equal(counterOrder.data.order.tableNumber, 1);
    assert.equal(
      (
        await request(`/orders/${counterOrder.data.token}/messages`, "POST", {
          text: "Extra napkins",
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await request(
          `/admin/orders/${counterOrder.data.order.id}/messages`,
          "POST",
          { text: "Coming soon" },
          login.cookie,
        )
      ).status,
      201,
    );
    const messages = await request(`/orders/${counterOrder.data.token}`);
    assert.deepEqual(
      messages.data.messages.map((m: any) => m.text),
      ["Extra napkins", "Coming soon"],
    );
    assert.equal(messages.data.messages[0].readAt, null);
    assert.equal(messages.data.messages[1].readAt, null);
    assert.equal(
      (
        await request(
          `/admin/orders/${counterOrder.data.order.id}/messages/read`,
          "POST",
          {},
          login.cookie,
        )
      ).status,
      200,
    );
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
    const readMessages = await request(`/orders/${counterOrder.data.token}`);
    assert.ok(readMessages.data.messages[0].readAt);
    assert.ok(readMessages.data.messages[1].readAt);
    const persistedTax = JSON.parse(
      (
        (await db
          .prepare("SELECT value FROM settings WHERE key='restaurant'")
          .first()) as any
      ).value,
    );
    assert.equal(persistedTax.cgstRate, 2.5);
    assert.equal(persistedTax.sgstRate, 2.5);
    assert.equal("gstRate" in persistedTax, false);
    const afterMigration = (await request("/orders/" + placed.data.token)).data;
    assert.deepEqual(afterMigration.amounts, placed.data.order.amounts);
    assert.deepEqual(afterMigration.restaurant, placed.data.order.restaurant);
    assert.equal(
      (await request("/orders", "POST", input)).data.order.id,
      placed.data.order.id,
    );
    const payments = await Promise.all([
      request(
        `/admin/orders/${placed.data.order.id}/payment`,
        "POST",
        { kind: "payment", paymentMode: "Cash", version: 1 },
        login.cookie,
      ),
      request(
        `/admin/orders/${placed.data.order.id}/payment`,
        "POST",
        { kind: "payment", paymentMode: "Cash", version: 1 },
        login.cookie,
      ),
    ]);
    assert.deepEqual(payments.map((p) => p.status).sort(), [200, 409]);
    const current = await request(
      "/admin/orders?current=true",
      "GET",
      undefined,
      login.cookie,
    );
    assert.equal(current.status, 200);
    assert.equal(
      current.data.orders.find((o: any) => o.id === placed.data.order.id).paid,
      20000,
    );
    const config = await request(
      "/admin/config",
      "GET",
      undefined,
      login.cookie,
    );
    assert.equal(
      (
        await request(
          "/admin/config",
          "PUT",
          {
            ...config.data,
            name: "Runtime persisted",
            cgstRate: 2.55,
            sgstRate: 3.25,
            gstInclusive: false,
          },
          login.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request("/menu")).data.config.name,
      "Runtime persisted",
    );
    const exclusive = await request("/orders", "POST", {
      ...input,
      requestKey: randomUUID(),
    });
    assert.equal(exclusive.status, 201);
    assert.equal(exclusive.data.order.amounts.cgst, 510);
    assert.equal(exclusive.data.order.amounts.sgst, 650);
    assert.equal(exclusive.data.order.amounts.total, 21160);
    const originalTax = (await request("/orders/" + placed.data.token)).data;
    assert.equal(originalTax.restaurant.cgstRate, 2.5);
    assert.equal(originalTax.restaurant.sgstRate, 2.5);
    assert.equal(originalTax.amounts.total, 20000);
    const image = Buffer.alloc(2 * 1024 * 1024);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
    const upload = await request(
      "/admin/uploads",
      "POST",
      { data: "data:image/png;base64," + image.toString("base64") },
      login.cookie,
    );
    assert.equal(upload.status, 200, JSON.stringify(upload.data));
    const bytes = await mf.dispatchFetch(
      "https://cafe77.test" + upload.data.url,
    );
    assert.equal(bytes.status, 200);
    assert.deepEqual(Buffer.from(await bytes.arrayBuffer()), image);
    assert.equal(
      (await request("/admin/events", "GET", undefined, login.cookie)).status,
      204,
    );
    let toClose = exclusive.data.order;
    for (const status of ["InProgress", "Ready"]) {
      const updated = await request(
        `/admin/orders/${toClose.id}/status`,
        "POST",
        { status, version: toClose.version },
        login.cookie,
      );
      assert.equal(updated.status, 200);
      toClose = updated.data;
    }
    const closures = await Promise.all(
      [1, 2].map(() =>
        request(
          `/admin/orders/${toClose.id}/status`,
          "POST",
          { status: "Closed", paymentMode: "UPI", version: toClose.version },
          login.cookie,
        ),
      ),
    );
    assert.deepEqual(closures.map((r) => r.status).sort(), [200, 409]);
    const closed = closures.find((r) => r.status === 200)!.data;
    assert.equal(closed.paymentMode, "UPI");
    assert.equal(closed.payments[0].mode, "UPI");
    assert.equal(closed.paid, closed.amounts.total);
    const filtered = await request(
      "/admin/orders?paymentMode=UPI&statuses=Closed",
      "GET",
      undefined,
      login.cookie,
    );
    assert.equal(filtered.data.total, 1);
    assert.equal(filtered.data.orders[0].id, closed.id);
    assert.equal(
      ((await db.prepare("SELECT count(*) AS n FROM payments").first()) as any)
        .n,
      2,
    );
  } finally {
    await mf.dispose();
  }
});
