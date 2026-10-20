import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, hashPassword } from "../server/db.js";
import { createApp } from "../server/app.js";
import { orderTimestamp } from "../server/order-number.js";
import { DatabaseSync } from "node:sqlite";

test("soft deletes preserve history, invalidate stale links, restrict cashiers and protect linked groups", async () => {
  const db = openDatabase(":memory:");
  for (const role of ["owner", "cashier"])
    db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
      role,
      hashPassword("Deletion-Test-Password-42"),
      role,
    );
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base =
    "http://127.0.0.1:" + (server.address() as { port: number }).port;
  async function req(
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
    const owner = (
      await req("/auth/login", "POST", {
        username: "owner",
        password: "Deletion-Test-Password-42",
      })
    ).cookie;
    const cashier = (
      await req("/auth/login", "POST", {
        username: "cashier",
        password: "Deletion-Test-Password-42",
      })
    ).cookie;
    const tables = (await req("/admin/tables", "GET", undefined, owner)).data;
    const token = tables[0].token;
    const menu = (await req("/menu")).data;
    const item = menu.items[0];
    const groupId = item.groupId;
    const input = {
      table: token,
      name: "History preservation",
      requestKey: randomUUID(),
      items: [{ id: item.id, quantity: 1 }],
    };
    const placed = await req("/orders", "POST", input);
    assert.equal(placed.status, 201);
    assert.match(
      placed.data.order.number,
      new RegExp(
        "^c77-" +
          orderTimestamp(new Date(placed.data.order.createdAt)) +
          "-[A-Z0-9]{4}$",
      ),
    );
    for (const path of [
      "/admin/tables/1",
      "/admin/menu/" + item.id,
      "/admin/groups/" + groupId,
    ])
      assert.equal((await req(path, "DELETE", {}, cashier)).status, 403);
    assert.equal(
      (await req("/admin/groups/" + groupId, "DELETE", {}, owner)).status,
      409,
    );
    assert.equal(
      (await req("/admin/menu/" + item.id, "DELETE", {}, owner)).status,
      200,
    );
    const retained: any = db
      .prepare("SELECT * FROM menu WHERE id=?")
      .get(item.id);
    assert.ok(retained.deleted_at);
    assert.equal(retained.active, 0);
    assert.equal(
      (await req("/menu")).data.items.some((i: any) => i.id === item.id),
      false,
    );
    assert.equal(
      (await req("/admin/menu", "GET", undefined, owner)).data.items.some(
        (i: any) => i.id === item.id,
      ),
      false,
    );
    assert.equal(
      (
        await req(
          "/admin/menu/" + item.id + "/stock",
          "PUT",
          { ranOut: false },
          cashier,
        )
      ).status,
      404,
    );
    assert.equal(
      (await req("/admin/menu/" + item.id, "PUT", item, owner)).status,
      404,
    );
    assert.equal(
      (await req("/orders", "POST", { ...input, requestKey: randomUUID() }))
        .status,
      409,
    );
    // Delete all other group items: retained discontinued records still block deleting the group.
    for (const other of menu.items.filter(
      (i: any) => i.groupId === groupId && i.id !== item.id,
    ))
      await req("/admin/menu/" + other.id, "DELETE", {}, owner);
    assert.equal(
      (await req("/admin/groups/" + groupId, "DELETE", {}, owner)).status,
      409,
    );
    await req(
      "/admin/groups",
      "POST",
      { name: "Empty discontinued group" },
      owner,
    );
    const empty: any = db
      .prepare("SELECT * FROM groups WHERE name=?")
      .get("Empty discontinued group");
    assert.equal(
      (await req("/admin/groups/" + empty.id, "DELETE", {}, owner)).status,
      200,
    );
    assert.ok(
      (
        db
          .prepare("SELECT deleted_at FROM groups WHERE id=?")
          .get(empty.id) as any
      ).deleted_at,
    );
    assert.equal(
      (await req("/menu")).data.groups.some((g: any) => g.id === empty.id),
      false,
    );
    assert.equal(
      (await req("/admin/menu", "GET", undefined, owner)).data.groups.some(
        (g: any) => g.id === empty.id,
      ),
      false,
    );
    assert.equal(
      (
        await req(
          "/admin/menu",
          "POST",
          { ...item, id: 0, code: "NEW", groupId: empty.id },
          owner,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await req(
          "/admin/groups/" + empty.id,
          "PUT",
          { ...empty, active: true },
          owner,
        )
      ).status,
      404,
    );
    assert.equal(
      (await req("/admin/tables/1", "DELETE", {}, owner)).status,
      200,
    );
    assert.ok(
      (db.prepare("SELECT deleted_at FROM tables WHERE number=1").get() as any)
        .deleted_at,
    );
    assert.equal(
      (await req("/admin/tables", "GET", undefined, owner)).data.some(
        (t: any) => t.number === 1,
      ),
      false,
    );
    assert.equal((await req("/menu?table=" + token)).status, 404);
    assert.equal(
      (
        await req("/orders", "POST", {
          ...input,
          items: [{ id: menu.items.at(-1).id, quantity: 1 }],
          requestKey: randomUUID(),
        })
      ).status,
      400,
    );
    let order = placed.data.order;
    const status = async (next: string) => {
      const r = await req(
        "/admin/orders/" + order.id + "/status",
        "POST",
        { status: next, version: order.version },
        cashier,
      );
      if (r.status === 200) order = r.data;
      return r;
    };
    assert.equal((await status("InProgress")).status, 200);
    assert.equal((await status("Ready")).status, 200);
    const paid = await req(
      "/admin/orders/" + order.id + "/payment",
      "POST",
      { kind: "payment", version: order.version },
      cashier,
    );
    assert.equal(paid.status, 200);
    order = paid.data;
    assert.equal((await status("Closed")).status, 200);
    const oldReceipt = await req("/orders/" + placed.data.token);
    assert.equal(oldReceipt.status, 200);
    assert.equal(oldReceipt.data.tableNumber, 1);
    assert.equal(oldReceipt.data.items[0].name, item.name);
    assert.equal(oldReceipt.data.items[0].price, item.price);
    assert.equal(
      (await req("/admin/orders", "GET", undefined, owner)).data.total,
      1,
    );
    assert.equal(
      (await req("/admin/tables", "POST", { number: 1 }, owner)).status,
      200,
    );
    const renewed = (
      await req("/admin/tables", "GET", undefined, owner)
    ).data.find((t: any) => t.number === 1);
    assert.notEqual(renewed.token, token);
    assert.equal((await req("/menu?table=" + token)).status, 404);
    assert.equal((await req("/menu?table=" + renewed.token)).status, 200);
    assert.equal(
      (
        db
          .prepare("SELECT count(*) AS n FROM tables WHERE number=1")
          .get() as any
      ).n,
      1,
    );
    assert.equal(
      (await req("/admin/tables", "POST", { number: 1 }, owner)).status,
      409,
    );
    const actions = db
      .prepare("SELECT action FROM audit")
      .all()
      .map((a) => a.action);
    assert.ok(actions.includes("menu.delete"));
    assert.ok(actions.includes("group.delete"));
    assert.ok(actions.includes("table.delete"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
});

test("existing database migration retains rows and is safe to run again", () => {
  const dir = mkdtempSync(join(tmpdir(), "cafe77-migration-"));
  const path = join(dir, "cafe77.sqlite");
  let db = openDatabase(path);
  try {
    db.prepare("INSERT INTO tables(number,token,active) VALUES(?,?,?)").run(
      7,
      "old-qr-token",
      0,
    );
    db.prepare("INSERT INTO groups(name) VALUES(?)").run("Existing group");
    db.prepare(
      "INSERT INTO menu(group_id,code,name,price) VALUES(?,?,?,?)",
    ).run(1, "EX1", "Existing item", 11000);
    for (const table of ["tables", "groups", "menu"])
      db.exec(`ALTER TABLE ${table} DROP COLUMN deleted_at`);
    db.exec("ALTER TABLE groups DROP COLUMN counter_only");
    db.close();
    db = openDatabase(path);
    assert.equal(
      (
        db
          .prepare("SELECT token,active,deleted_at FROM tables WHERE number=7")
          .get() as any
      ).token,
      "old-qr-token",
    );
    assert.equal(
      (db.prepare("SELECT active FROM tables WHERE number=7").get() as any)
        .active,
      0,
    );
    assert.equal(
      (
        db
          .prepare("SELECT price,deleted_at FROM menu WHERE code='EX1'")
          .get() as any
      ).price,
      11000,
    );
    for (const table of ["tables", "groups", "menu"])
      assert.ok(
        db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .some((c) => c.name === "deleted_at"),
      );
    assert.equal(
      (
        db
          .prepare(
            "SELECT counter_only FROM groups WHERE name='Existing group'",
          )
          .get() as any
      ).counter_only,
      0,
    );
    assert.ok(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='menu_history'",
        )
        .get(),
    );
    db.close();
    db = openDatabase(path);
    assert.equal(
      (db.prepare("SELECT count(*) AS n FROM menu").get() as any).n,
      1,
    );
  } finally {
    db.close();
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(path + suffix, { force: true });
    rmdirSync(dir);
  }
});

test("existing messages are backfilled as read during local migration", () => {
  const dir = mkdtempSync(join(tmpdir(), "cafe77-message-migration-"));
  const path = join(dir, "cafe77.sqlite");
  let db = new DatabaseSync(path);
  try {
    db.exec(
      "CREATE TABLE order_messages(id INTEGER PRIMARY KEY,order_id INTEGER,sender TEXT,text TEXT,at TEXT)",
    );
    db.prepare(
      "INSERT INTO order_messages(order_id,sender,text,at) VALUES(?,?,?,?)",
    ).run(1, "staff", "Existing message", "2026-10-14T00:00:00.000Z");
    db.close();
    db = openDatabase(path);
    const message = db
      .prepare("SELECT at,read_at FROM order_messages")
      .get() as any;
    assert.equal(message.read_at, message.at);
    db.close();
    db = openDatabase(path);
    assert.equal(
      (
        db
          .prepare(
            "SELECT count(*) AS n FROM order_messages WHERE read_at IS NULL",
          )
          .get() as any
      ).n,
      0,
    );
  } finally {
    db.close();
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(path + suffix, { force: true });
    rmdirSync(dir);
  }
});
