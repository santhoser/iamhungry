import type { UnitOfWork } from "./d1.js";
export interface Request {
  params: Record<string, string>;
  query: Record<string, string>;
  headers: { cookie?: string };
  body: any;
  secure: boolean;
}
export class Response {
  private code = 200;
  private headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
  });
  response?: globalThis.Response;
  status(code: number) {
    this.code = code;
    return this;
  }
  json(value: any) {
    this.response = globalThis.Response.json(value, {
      status: this.code,
      headers: this.headers,
    });
    return this;
  }
  end() {
    this.response = new globalThis.Response(null, {
      status: this.code,
      headers: this.headers,
    });
    return this;
  }
  cookie(name: string, value: string, options: any) {
    this.headers.append(
      "Set-Cookie",
      `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(options.maxAge / 1000)}${options.secure ? "; Secure" : ""}`,
    );
  }
  clearCookie(name: string, _options: any) {
    this.headers.append(
      "Set-Cookie",
      `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    );
  }
}
type Handler = (request: Request, response: Response) => unknown;
export class Router {
  private routes: { method: string; path: string; handler: Handler }[] = [];
  get(path: string, handler: Handler) {
    this.routes.push({ method: "GET", path, handler });
  }
  post(path: string, handler: Handler) {
    this.routes.push({ method: "POST", path, handler });
  }
  put(path: string, handler: Handler) {
    this.routes.push({ method: "PUT", path, handler });
  }
  delete(path: string, handler: Handler) {
    this.routes.push({ method: "DELETE", path, handler });
  }
  async dispatch(
    request: globalThis.Request,
    db: UnitOfWork,
  ): Promise<globalThis.Response> {
    const url = new URL(request.url);
    if (request.method !== "GET") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin)
        return globalThis.Response.json(
          { error: "Request origin is not allowed" },
          { status: 403 },
        );
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          request.headers.get("Content-Type") || "",
        )
      )
        return globalThis.Response.json(
          { error: "JSON requests required" },
          { status: 415 },
        );
    }
    const raw = request.method === "GET" ? "" : await readBody(request);
    const parts = url.pathname.split("/");
    for (const route of this.routes) {
      if (route.method !== request.method) continue;
      const pattern = route.path.split("/");
      if (pattern.length !== parts.length) continue;
      const params: Record<string, string> = {};
      if (
        !pattern.every((part, i) =>
          part.startsWith(":")
            ? ((params[part.slice(1)] = decodeURIComponent(parts[i])), true)
            : part === parts[i],
        )
      )
        continue;
      const req: Request = {
        params,
        query: Object.fromEntries(url.searchParams),
        headers: { cookie: request.headers.get("Cookie") || undefined },
        body: raw ? JSON.parse(raw) : undefined,
        secure: url.protocol === "https:",
      };
      const res = new Response();
      await route.handler(req, res);
      await db.flush();
      return (
        res.response ||
        globalThis.Response.json({ error: "No response" }, { status: 500 })
      );
    }
    return globalThis.Response.json(
      { error: "API endpoint not found" },
      { status: 404 },
    );
  }
}
async function readBody(request: globalThis.Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 3 * 1024 * 1024) {
      await reader.cancel();
      throw Object.assign(new Error("Upload is too large"), { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
