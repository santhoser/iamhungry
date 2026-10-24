import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import worker from "../../workers/app.js";
import { UnitOfWork } from "../../workers/d1.js";
import { hashPassword } from "../../workers/crypto.js";
import { openWorkersDatabase, dispatch, LocalD1 } from "./fixture.js";
async function fixture() {
  const db = openWorkersDatabase();
  db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
    "owner-test",
    await hashPassword("Local-Test-Password-42"),
    "owner",
  );
  db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
    "cashier-test",
    await hashPassword("Local-Cashier-Password-42"),
    "cashier",
  );
  const owner = await dispatch(db, "/api/auth/login", "POST", {
    username: "owner-test",
    password: "Local-Test-Password-42",
  });
  const cashier = await dispatch(db, "/api/auth/login", "POST", {
    username: "cashier-test",
    password: "Local-Cashier-Password-42",
  });
  const table = db
    .prepare("SELECT token FROM tables WHERE number=1")
    .get() as any;
  return {
    db,
    owner: owner.cookie,
    cashier: cashier.cookie,
    input: {
      table: table.token,
      name: "Worker test",
      phone: "9876543210",
      requestKey: randomUUID(),
      items: [{ id: 1, quantity: 1 }],
    },
  };
}
test("concurrent checkout is idempotent and simultaneous payments record exactly once", async () => {
  const { db, owner, input } = await fixture();
  try {
    const results = await Promise.all([
      dispatch(db, "/api/orders", "POST", input),
      dispatch(db, "/api/orders", "POST", input),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
    assert.equal(results[0].data.order.id, results[1].data.order.id);
    const order = results[0].data.order;
    const payments = await Promise.all([
      dispatch(
        db,
        `/api/admin/orders/${order.id}/payment`,
        "POST",
        { kind: "payment", paymentMode: "Cash", version: 1 },
        owner,
      ),
      dispatch(
        db,
        `/api/admin/orders/${order.id}/payment`,
        "POST",
        { kind: "payment", paymentMode: "Cash", version: 1 },
        owner,
      ),
    ]);
    assert.deepEqual(payments.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      (db.prepare("SELECT count(*) AS n FROM payments").get() as any).n,
      1,
    );
  } finally {
    db.close();
  }
});
test("guard failure rolls back every write and audit record", async () => {
  const { db } = await fixture();
  try {
    const binding = new LocalD1(db),
      work = new UnitOfWork(binding);
    await work.prepare("SELECT id,price FROM menu WHERE id=?").get(1);
    await work
      .prepare("INSERT INTO audit(actor,action,details,at) VALUES(?,?,?,?)")
      .run("test", "rollback", "{}", "test");
    await work.prepare("UPDATE menu SET price=? WHERE id=?").run(500, 1);
    binding.beforeBatch = () =>
      db.prepare("UPDATE menu SET price=9000 WHERE id=1").run();
    await assert.rejects(work.flush(), /CHECK constraint/);
    assert.equal(
      (db.prepare("SELECT count(*) AS n FROM audit").get() as any).n,
      0,
    );
    assert.equal(
      (db.prepare("SELECT price FROM menu WHERE id=1").get() as any).price,
      9000,
    );
    assert.equal(
      (db.prepare("SELECT count(*) AS n FROM transaction_guard").get() as any)
        .n,
      0,
    );
  } finally {
    db.close();
  }
});
test("session revocation during a write prevents payment and retries to unauthorized", async () => {
  const { db, owner, input } = await fixture();
  try {
    const placed = await dispatch(db, "/api/orders", "POST", input);
    const binding = new LocalD1(db);
    binding.beforeBatch = () =>
      db.prepare("UPDATE users SET active=0 WHERE username='owner-test'").run();
    const request = new Request(
      `https://cafe77.test/api/admin/orders/${placed.data.order.id}/payment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: owner },
        body: JSON.stringify({
          kind: "payment",
          paymentMode: "Cash",
          version: 1,
        }),
      },
    );
    assert.equal((await worker.fetch(request, { DB: binding })).status, 401);
    assert.equal(
      (db.prepare("SELECT count(*) AS n FROM payments").get() as any).n,
      0,
    );
  } finally {
    db.close();
  }
});
test("uploads persist as chunks, retain exact bytes, and enforce roles/type/size", async () => {
  const { db, owner, cashier } = await fixture();
  try {
    const image = Buffer.alloc(2 * 1024 * 1024, 0);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
    const body = { data: "data:image/png;base64," + image.toString("base64") };
    assert.equal(
      (await dispatch(db, "/api/admin/uploads", "POST", body, cashier)).status,
      403,
    );
    const upload = await dispatch(
      db,
      "/api/admin/uploads",
      "POST",
      body,
      owner,
    );
    assert.equal(upload.status, 200, JSON.stringify(upload.data));
    const response = await worker.fetch(
      new Request("https://cafe77.test" + upload.data.url),
      { DB: new LocalD1(db) },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
    assert.equal(
      (db.prepare("SELECT count(*) AS n FROM upload_chunks").get() as any).n,
      8,
    );
    assert.equal(
      (
        await dispatch(
          db,
          "/api/admin/uploads",
          "POST",
          { data: "data:image/png;base64,aGVsbG8=" },
          owner,
        )
      ).status,
      400,
    );
    const tooLarge = Buffer.concat([image, Buffer.from([0])]);
    assert.equal(
      (
        await dispatch(
          db,
          "/api/admin/uploads",
          "POST",
          { data: "data:image/png;base64," + tooLarge.toString("base64") },
          owner,
        )
      ).status,
      400,
    );
  } finally {
    db.close();
  }
});
test("settings survive new Worker instances; table revival invalidates old QR; linked groups stay retained", async () => {
  const { db, owner, input } = await fixture();
  try {
    const config = await dispatch(
      db,
      "/api/admin/config",
      "GET",
      undefined,
      owner,
    );
    assert.equal(
      (
        await dispatch(
          db,
          "/api/admin/config",
          "PUT",
          { ...config.data, name: "Persisted cafe" },
          owner,
        )
      ).status,
      200,
    );
    assert.equal(
      (await dispatch(db, "/api/menu")).data.config.name,
      "Persisted cafe",
    );
    assert.equal(
      (await dispatch(db, "/api/admin/groups/1", "DELETE", {}, owner)).status,
      409,
    );
    assert.equal(
      (await dispatch(db, "/api/admin/tables/1", "DELETE", {}, owner)).status,
      200,
    );
    assert.equal(
      (await dispatch(db, "/api/orders", "POST", input)).status,
      400,
    );
    assert.equal(
      (await dispatch(db, "/api/admin/tables", "POST", { number: 1 }, owner))
        .status,
      200,
    );
    assert.equal(
      (await dispatch(db, "/api/menu?table=" + input.table)).status,
      404,
    );
    assert.notEqual(
      (db.prepare("SELECT token FROM tables WHERE number=1").get() as any)
        .token,
      input.table,
    );
  } finally {
    db.close();
  }
});
test("100-line checkout and 100 current orders stay inside the 50-query free limit", async () => {
  const { db, owner, input } = await fixture();
  try {
    const result = await dispatch(db, "/api/orders", "POST", {
      ...input,
      items: Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        quantity: 1,
      })),
    });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    assert.equal(result.data.order.items.length, 100);
    assert.ok(result.queries <= 50);
    for (let i = 0; i < 99; i++) {
      const created = await dispatch(db, "/api/orders", "POST", {
        ...input,
        requestKey: randomUUID(),
      });
      assert.equal(created.status, 201);
    }
    const list = await dispatch(
      db,
      "/api/admin/orders?current=true",
      "GET",
      undefined,
      owner,
    );
    assert.equal(list.status, 200);
    assert.equal(list.data.orders.length, 100);
    assert.ok(list.queries <= 50);
    assert.equal(
      (
        await dispatch(
          db,
          "/api/admin/orders?q=" + encodeURIComponent("a".repeat(100)),
          "GET",
          undefined,
          owner,
        )
      ).status,
      200,
    );
  } finally {
    db.close();
  }
});
test("secure cookies, CSRF, malformed JSON, persistent throttling and polling response", async () => {
  const { db, owner } = await fixture();
  try {
    const login = await dispatch(db, "/api/auth/login", "POST", {
      username: "owner-test",
      password: "Local-Test-Password-42",
    });
    assert.match(login.response.headers.get("set-cookie") || "", /; Secure/);
    assert.equal(
      (
        await dispatch(db, "/api/admin/config", "PUT", {}, owner, {
          Origin: "https://foreign.test",
        })
      ).status,
      403,
    );
    const malformed = await worker.fetch(
      new Request("https://cafe77.test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      { DB: new LocalD1(db) },
    );
    assert.equal(malformed.status, 400);
    assert.equal(
      (await dispatch(db, "/api/admin/events", "GET", undefined, owner)).status,
      204,
    );
    assert.equal((await dispatch(db, "/api/admin/events")).status, 401);
    for (let i = 0; i < 15; i++)
      await dispatch(db, "/api/auth/login", "POST", {
        username: "missing",
        password: "invalid",
      });
    assert.equal(
      (
        await dispatch(db, "/api/auth/login", "POST", {
          username: "missing",
          password: "invalid",
        })
      ).status,
      429,
    );
  } finally {
    db.close();
  }
});
