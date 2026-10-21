// Isolated, loopback-only UI test server. Never creates accounts in the real cafe database.
import express from "express";
import { createServer } from "vite";
import { openDatabase, hashPassword } from "../server/db.js";
import { createApp } from "../server/app.js";
const db = openDatabase(":memory:");
db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
  "reviewowner",
  hashPassword("Browser-Test-Password-42"),
  "owner",
);
db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
  "reviewcashier",
  hashPassword("Cashier-Test-Password-42"),
  "cashier",
);
db.prepare(
  "INSERT INTO users(username,password,role,is_admin) VALUES(?,?,?,1)",
).run("reviewadmin", hashPassword("Admin-Test-Password-42"), "owner");
const app = createApp(db);
const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "spa",
});
app.use(vite.middlewares);
app.listen(5174, "127.0.0.1", () =>
  console.log("Isolated browser fixture on http://127.0.0.1:5174"),
);
