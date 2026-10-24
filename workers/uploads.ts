import { Buffer } from "node:buffer";
import type { UnitOfWork, D1Database } from "./d1.js";
export async function storeUpload(
  db: UnitOfWork,
  name: string,
  contentType: string,
  bytes: Buffer,
) {
  await db
    .prepare("INSERT INTO uploads(name,content_type,size) VALUES(?,?,?)")
    .run(name, contentType, bytes.length);
  for (let offset = 0; offset < bytes.length; offset += 256 * 1024)
    await db
      .prepare("INSERT INTO upload_chunks(name,position,data) VALUES(?,?,?)")
      .run(
        name,
        offset / (256 * 1024),
        bytes.subarray(offset, offset + 256 * 1024),
      );
}
export async function serveUpload(request: Request, db: D1Database) {
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, { status: 405 });
  const name = new URL(request.url).pathname.slice("/uploads/".length);
  if (!/^[a-f0-9]{32}\.(png|jpeg|webp)$/.test(name))
    return new Response("Not found", { status: 404 });
  const header = await db
    .prepare("SELECT content_type,size FROM uploads WHERE name=?")
    .bind(name)
    .first();
  if (!header) return new Response("Not found", { status: 404 });
  const headers = {
    "Content-Type": header.content_type,
    "Content-Length": String(header.size),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  };
  if (request.method === "HEAD") return new Response(null, { headers });
  const result = await db
    .prepare("SELECT data FROM upload_chunks WHERE name=? ORDER BY position")
    .bind(name)
    .all();
  const bytes = new Uint8Array(header.size);
  let offset = 0;
  for (const row of result.results) {
    const chunk = new Uint8Array(row.data);
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (offset !== header.size)
    return new Response("Image unavailable", { status: 503 });
  return new Response(bytes, { headers });
}
