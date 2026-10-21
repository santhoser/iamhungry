import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../server/db.js";
import { createApp } from "../server/app.js";

test("existing SQLite users and sessions survive the admin-role upgrade", () => {
  const dir = mkdtempSync(join(tmpdir(), "cafe77-admin-"));
  const path = join(dir, "cafe77.sqlite");
  let db = new DatabaseSync(path);
  try {
    db.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
    db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
      "legacyowner",
      "legacy-hash",
      "owner",
    );
    db.prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)").run(
      "session-hash",
      1,
      Date.now() + 100000,
    );
    db.close();
    db = openDatabase(path);
    assert.equal(
      (db.prepare("SELECT username FROM users WHERE id=1").get() as any)
        .username,
      "legacyowner",
    );
    assert.equal(
      (
        db
          .prepare("SELECT user_id FROM sessions WHERE token='session-hash'")
          .get() as any
      ).user_id,
      1,
    );
    db.prepare(
      "INSERT INTO users(username,password,role,is_admin) VALUES(?,?,?,1)",
    ).run("firstadmin", "hash", "owner");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    db.close();
    db = openDatabase(path);
    assert.equal(
      (db.prepare("SELECT count(*) AS n FROM users").get() as any).n,
      2,
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("admin bootstrap and role permissions apply to account creation and password reset", async () => {
  const db = openDatabase(":memory:");
  const app = createApp(db, { setupToken: "private-setup-token" });
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
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      data: (await response.json()) as any,
      cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
    };
  };
  try {
    const setup = {
      token: "private-setup-token",
      username: "ownerone",
      password: "Eight888",
    };
    assert.equal(
      (await call("/setup", "POST", { ...setup, password: "Seven77" })).status,
      400,
    );
    assert.equal((await call("/setup", "POST", setup)).status, 200);
    assert.equal(
      (
        await call("/setup/admin", "POST", {
          ...setup,
          username: "adminone",
          token: "wrong",
        })
      ).status,
      403,
    );
    assert.equal(
      (await call("/setup/admin", "POST", { ...setup, username: "adminone" }))
        .status,
      200,
    );
    assert.equal(
      (await call("/setup/admin", "POST", { ...setup, username: "admintwo" }))
        .status,
      403,
    );
    const owner = (
      await call("/auth/login", "POST", {
        username: "ownerone",
        password: "Eight888",
      })
    ).cookie;
    const admin = (
      await call("/auth/login", "POST", {
        username: "adminone",
        password: "Eight888",
      })
    ).cookie;
    const adminId = (
      db.prepare("SELECT id FROM users WHERE is_admin=1").get() as any
    ).id;
    assert.equal(
      (await call("/admin/users", "GET", undefined, owner)).data.some(
        (u: any) => u.role === "admin",
      ),
      false,
    );
    assert.equal(
      (
        await call(
          `/admin/users/${adminId}`,
          "PUT",
          { active: true, password: "NewAdmin8" },
          owner,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          "/admin/users",
          "POST",
          { username: "hiddenadmin", password: "Eight888", role: "admin" },
          owner,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          "/admin/users",
          "POST",
          { username: "secondowner", password: "Eight888", role: "owner" },
          owner,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          "/admin/users",
          "POST",
          { username: "shortpass", password: "Seven77", role: "cashier" },
          owner,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/admin/users",
          "POST",
          { username: "cashierone", password: "Eight888", role: "cashier" },
          owner,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          "/admin/users",
          "POST",
          { username: "admintwo", password: "Eight888", role: "admin" },
          admin,
        )
      ).status,
      200,
    );
    const ownerId = (
      db.prepare("SELECT id FROM users WHERE username='ownerone'").get() as any
    ).id;
    assert.equal(
      (
        await call(
          `/admin/users/${ownerId}`,
          "PUT",
          { active: true, password: "Seven77" },
          admin,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          `/admin/users/${ownerId}`,
          "PUT",
          { active: true, password: "Reset888" },
          admin,
        )
      ).status,
      200,
    );
    assert.equal((await call("/auth/me", "GET", undefined, owner)).status, 401);
    assert.equal(
      (
        await call("/auth/login", "POST", {
          username: "ownerone",
          password: "Reset888",
        })
      ).status,
      200,
    );
    assert.equal(
      (await call(`/admin/users/${adminId}`, "PUT", { active: false }, admin))
        .status,
      400,
    );
  } finally {
    server.close();
    db.close();
  }
});
