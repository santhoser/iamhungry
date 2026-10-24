import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { openDatabase, hashPassword } from "../server/db.js";
import { createApp } from "../server/app.js";
import { openWorkersDatabase, createWorkerHttpApp } from "./workers/fixture.js";
import { hashPassword as workerPassword } from "../workers/crypto.js";

for (const runtime of ["SQLite", "D1"] as const) {
  test(`${runtime}: phone/type validation, atomic close/payment, mode filtering and stale retries`, async () => {
    const db =
      runtime === "SQLite" ? openDatabase(":memory:") : openWorkersDatabase();
    const hash = await (runtime === "SQLite" ? hashPassword : workerPassword)(
      "Checkout-Test-42",
    );
    db.prepare(
      "INSERT INTO users(username,password,role) VALUES('checkoutowner',?,'owner')",
    ).run(hash);
    const app = runtime === "SQLite" ? createApp(db) : createWorkerHttpApp(db);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
    const call = async (
      path: string,
      method = "GET",
      body?: unknown,
      cookie = "",
    ) => {
      const response = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        data: (await response.json()) as any,
        cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
      };
    };
    try {
      const cookie = (
        await call("/auth/login", "POST", {
          username: "checkoutowner",
          password: "Checkout-Test-42",
        })
      ).cookie;
      const table = (await call("/admin/tables", "GET", undefined, cookie))
        .data[0];
      const input = {
        table: table.token,
        name: "Checkout customer",
        phone: "9876543210",
        requestKey: randomUUID(),
        items: [{ id: 1, quantity: 1 }],
        orderType: "TakeAway",
      };
      for (const phone of [
        undefined,
        "",
        "123456789",
        "12345678901",
        "+919876543210",
        "98765abcde",
      ])
        assert.equal(
          (await call("/orders", "POST", { ...input, phone })).status,
          400,
        );
      assert.equal(
        (await call("/orders", "POST", { ...input, orderType: "Delivery" }))
          .status,
        400,
      );
      const placed = await call("/orders", "POST", input);
      assert.equal(placed.status, 201, JSON.stringify(placed.data));
      assert.equal(placed.data.order.orderType, "TakeAway");
      assert.equal(
        (await call("/orders/" + placed.data.token)).data.orderType,
        "TakeAway",
      );
      const counter = await call(
        "/admin/orders",
        "POST",
        {
          ...input,
          table: 1,
          phone: undefined,
          orderType: undefined,
          requestKey: randomUUID(),
        },
        cookie,
      );
      assert.equal(counter.status, 201);
      assert.equal(counter.data.order.orderType, "DineIn");
      assert.equal(counter.data.order.phone, "");
      assert.equal(
        (
          await call(
            "/admin/orders",
            "POST",
            { ...input, table: 1, phone: "123", requestKey: randomUUID() },
            cookie,
          )
        ).status,
        400,
      );
      let order = placed.data.order;
      for (const status of ["InProgress", "Ready"])
        order = (
          await call(
            `/admin/orders/${order.id}/status`,
            "POST",
            { status, version: order.version },
            cookie,
          )
        ).data;
      const close = {
        status: "Closed",
        version: order.version,
        paymentMode: "UPI",
      };
      assert.equal(
        (await call(`/admin/orders/${order.id}/status`, "POST", close)).status,
        401,
      );
      assert.equal(
        (
          await call(
            `/admin/orders/${order.id}/status`,
            "POST",
            { ...close, paymentMode: undefined },
            cookie,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await call(
            `/admin/orders/${order.id}/status`,
            "POST",
            { ...close, paymentMode: "Card" },
            cookie,
          )
        ).status,
        400,
      );
      const results = await Promise.all([
        call(`/admin/orders/${order.id}/status`, "POST", close, cookie),
        call(`/admin/orders/${order.id}/status`, "POST", close, cookie),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      const closed = results.find((r) => r.status === 200)!.data;
      assert.equal(closed.status, "Closed");
      assert.equal(closed.paymentMode, "UPI");
      assert.equal(closed.paid, closed.amounts.total);
      assert.equal(closed.payments.length, 1);
      assert.equal(closed.payments[0].mode, "UPI");
      assert.equal(
        closed.events.filter((e: any) => e.status === "Closed").length,
        1,
      );
      let cash = counter.data.order;
      for (const status of ["Accepted", "Ready"])
        cash = (
          await call(
            `/admin/orders/${cash.id}/status`,
            "POST",
            { status, version: cash.version },
            cookie,
          )
        ).data;
      cash = (
        await call(
          `/admin/orders/${cash.id}/status`,
          "POST",
          { status: "Closed", paymentMode: "Cash", version: cash.version },
          cookie,
        )
      ).data;
      assert.equal(cash.paymentMode, "Cash");
      for (const mode of ["Cash", "UPI"]) {
        const filtered = (
          await call(
            `/admin/orders?paymentMode=${mode}&statuses=Closed`,
            "GET",
            undefined,
            cookie,
          )
        ).data;
        assert.equal(filtered.total, 1);
        assert.equal(filtered.orders[0].paymentMode, mode);
      }
      assert.equal(
        (await call("/admin/orders?paymentMode=Card", "GET", undefined, cookie))
          .status,
        400,
      );
      assert.equal(
        (
          await call(
            "/admin/orders?paymentMode=Unknown",
            "GET",
            undefined,
            cookie,
          )
        ).data.total,
        0,
      );
      // A cancelled paid order retains its tender when the manual refund is recorded.
      const paid = await call(
        "/admin/orders",
        "POST",
        { ...input, table: 1, requestKey: randomUUID() },
        cookie,
      );
      let legacy = (
        await call(
          `/admin/orders/${paid.data.order.id}/payment`,
          "POST",
          { kind: "payment", paymentMode: "Cash", version: 1 },
          cookie,
        )
      ).data;
      legacy = (
        await call(
          `/admin/orders/${legacy.id}/status`,
          "POST",
          { status: "Cancelled", version: legacy.version },
          cookie,
        )
      ).data;
      legacy = (
        await call(
          `/admin/orders/${legacy.id}/payment`,
          "POST",
          { kind: "refund", version: legacy.version },
          cookie,
        )
      ).data;
      assert.equal(legacy.payments[1].mode, "Cash");
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      db.close();
    }
  });
}

test("D1 additive checkout migration preserves existing snapshots and leaves historical payment mode unknown", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("migrations/0001_cafe77.sql", "utf8"));
    db.exec(
      "INSERT INTO orders(number,token,request_key,request_hash,table_id,name,created_at,amounts,restaurant) VALUES('old','old','old','old',1,'Historical','2026-10-01','{\"total\":10500,\"gst\":500}','{}'); INSERT INTO payments(order_id,kind,amount,actor,at) VALUES(1,'payment',10500,'staff','2026-10-01');",
    );
    db.exec(readFileSync("migrations/0002_order_checkout.sql", "utf8"));
    const order = db.prepare("SELECT * FROM orders").get()!;
    assert.equal(order.order_type, "DineIn");
    assert.equal(order.payment_mode, null);
    assert.equal(order.amounts, '{"total":10500,"gst":500}');
    assert.equal(db.prepare("SELECT mode FROM payments").get()?.mode, null);
  } finally {
    db.close();
  }
});
