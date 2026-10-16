import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawn } from "node:child_process";
const require = createRequire(import.meta.url);
if (process.platform === "win32") {
  // Windows may deny execution from npm's package cache; use a workspace copy.
  const target = resolve("data/tools/workerd.exe");
  mkdirSync(resolve("data/tools"), { recursive: true });
  if (!existsSync(target)) copyFileSync(require("workerd").default, target);
  process.env.MINIFLARE_WORKERD_PATH = target;
}
const child = spawn(
  process.execPath,
  [
    resolve(
      dirname(require.resolve("wrangler/package.json")),
      "bin/wrangler.js",
    ),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: process.env },
);
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
