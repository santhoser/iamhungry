// Isolated workerd/D1 browser fixture. Uses only local, temporary databases/accounts.
import express from "express";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
if (process.platform === "win32") {
  const target = resolve("data/tools/workerd.exe");
  mkdirSync(resolve("data/tools"), { recursive: true });
  if (!existsSync(target)) copyFileSync(require("workerd").default, target);
  process.env.MINIFLARE_WORKERD_PATH = target;
}
const token = randomUUID();
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: resolve("data/worker-bundle/app.js"),
    compatibilityDate: "2026-10-06",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    bindings: { SETUP_TOKEN: token },
  }),
);
const db = await mf.getD1Database("DB");
await db.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
await db.exec(
  readFileSync("migrations/0003_order_messages_menu_details.sql", "utf8"),
);
await db.exec(readFileSync("migrations/0004_message_read_state.sql", "utf8"));
await db.exec(
  readFileSync("migrations/0005_menu_history_counter_orders.sql", "utf8"),
);
await db.exec(
  readFileSync("migrations/0006_tags_counter_visibility.sql", "utf8"),
);
await db.exec(readFileSync("migrations/0007_admin_role.sql", "utf8"));
await db.exec(
  readFileSync("cloudflare/seed-demo.sql", "utf8")
    .split("\n")
    .filter((line) => !line.startsWith("--"))
    .join("\n"),
);
const setup = await mf.dispatchFetch("http://127.0.0.1:5176/api/setup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    token,
    username: "reviewowner",
    password: "Browser-Test-Password-42",
  }),
});
if (!setup.ok) throw Error(await setup.text());
const adminSetup = await mf.dispatchFetch(
  "http://127.0.0.1:5176/api/setup/admin",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      username: "reviewadmin",
      password: "Admin-Test-Password-42",
    }),
  },
);
if (!adminSetup.ok) throw Error(await adminSetup.text());
const login = await mf.dispatchFetch("http://127.0.0.1:5176/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: "reviewowner",
    password: "Browser-Test-Password-42",
  }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
const cashier = await mf.dispatchFetch(
  "http://127.0.0.1:5176/api/admin/users",
  {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      username: "reviewcashier",
      password: "Cashier-Test-Password-42",
      role: "cashier",
    }),
  },
);
if (!cashier.ok) throw Error(await cashier.text());
const app = express();
app.use(async (req, res, next) => {
  if (!req.path.startsWith("/api/") && !req.path.startsWith("/uploads/"))
    return next();
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const response = await mf.dispatchFetch(
      `http://${req.headers.host}${req.originalUrl}`,
      {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
      },
    );
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    next(error);
  }
});
app.use(express.static(resolve("dist")));
app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
const server = app.listen(5176, "127.0.0.1", () =>
  console.log(
    "Isolated actual Workers/D1 browser fixture on http://127.0.0.1:5176",
  ),
);
async function close() {
  server.closeAllConnections();
  server.close();
  await mf.dispose();
  process.exit(0);
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
