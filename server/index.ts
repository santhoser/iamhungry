import { createServer as createViteServer } from "vite";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import express from "express";
import { openDatabase } from "./db.js";
import { createApp } from "./app.js";
const db = openDatabase();
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const needsOwner = !db
  .prepare("SELECT id FROM users WHERE role='owner' AND is_admin=0")
  .get();
const needsAdmin = !db.prepare("SELECT id FROM users WHERE is_admin=1").get();
const setupToken =
  needsOwner || needsAdmin ? randomBytes(24).toString("hex") : undefined;
const app = createApp(db, {
  setupToken,
  trustLocalProxy: process.env.CAFE77_TRUST_LOCAL_PROXY === "1",
  uploadsPath: process.env.CAFE77_UPLOADS,
});
const server = createServer(app);
if (process.argv.includes("--production")) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
server.listen(port, host, () => {
  console.log(`Cafe77 running at http://${host}:${port}`);
  if (setupToken && needsOwner)
    console.log(
      `Create the first owner: http://localhost:${port}/admin?setup=${setupToken}`,
    );
  if (setupToken && needsAdmin)
    console.log(
      `Create the first admin: http://localhost:${port}/admin?setup-admin=${setupToken}`,
    );
});
function shutdown() {
  server.closeAllConnections();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
