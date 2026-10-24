import { digest } from "./crypto.js";
import type { D1Database } from "./d1.js";
// Public/read polling must not consume D1 write allowance every five seconds.
// Read limits are best-effort per isolate; login and write limits persist globally.
const reads = new Map<string, { count: number; expires: number }>();
export async function enforceRateLimit(request: Request, db: D1Database) {
  const path = new URL(request.url).pathname;
  const lane =
    path.includes("login") || path === "/api/setup"
      ? "login"
      : request.method === "GET"
        ? "read"
        : "write";
  const max = lane === "login" ? 15 : lane === "read" ? 1200 : 120;
  const key = await digest(
    (request.headers.get("CF-Connecting-IP") || "local") + ":" + lane,
  );
  const now = Date.now();
  if (lane === "read") {
    if (reads.size > 10000)
      for (const [key, bucket] of reads)
        if (bucket.expires <= now) reads.delete(key);
    let bucket = reads.get(key);
    if (!bucket || bucket.expires <= now) {
      bucket = { count: 0, expires: now + 60000 };
      reads.set(key, bucket);
    }
    if (++bucket.count > max)
      throw Object.assign(
        new Error("Too many requests. Please try again in a minute."),
        { status: 429 },
      );
    return;
  }
  const row = await db
    .prepare(
      "INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count",
    )
    .bind(key, now + 60000, now, now)
    .first();
  if (row.count > max)
    throw Object.assign(
      new Error("Too many requests. Please try again in a minute."),
      { status: 429 },
    );
  if (crypto.getRandomValues(new Uint8Array(1))[0] === 0)
    await db.prepare("DELETE FROM rate_limits WHERE expires<?").bind(now).run();
}
