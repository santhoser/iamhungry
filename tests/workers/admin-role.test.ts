import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch, openWorkersDatabase } from "./fixture.js";

test("D1 admin bootstrap and owner account boundaries", async () => {
  const db = openWorkersDatabase();
  const token = "private-worker-token";
  const call = (path: string, method = "GET", body?: unknown, cookie = "") =>
    dispatch(
      db,
      "/api" + path,
      method,
      body,
      cookie,
      {},
      { SETUP_TOKEN: token },
    );
  try {
    const setup = { token, username: "ownerone", password: "Eight888" };
    assert.equal((await call("/setup", "POST", setup)).status, 200);
    assert.equal(
      (
        await call("/setup/admin", "POST", {
          ...setup,
          username: "adminone",
          password: "Seven77",
        })
      ).status,
      400,
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
    const visible = (await call("/admin/users", "GET", undefined, owner))
      .data as any[];
    assert.equal(
      visible.some((u) => u.role === "admin"),
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
          { username: "cashierone", password: "Eight888", role: "cashier" },
          owner,
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
    db.close();
  }
});
