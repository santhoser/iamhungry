// Infrastructure smoke test only. Cafe77's application backend is not deployed here.
export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const headers = { "Cache-Control": "no-store" };
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { ...headers, Allow: "GET, HEAD" },
      });
    }
    if (pathname === "/health") {
      try {
        const result = await env.DB.prepare("SELECT 1 AS ok").first();
        if (result?.ok !== 1) throw new Error("Database check failed");
        return Response.json(
          {
            status: "ok",
            environment: "staging",
            database: "connected",
            application: "pending",
          },
          { headers },
        );
      } catch {
        return Response.json(
          { status: "unavailable", environment: "staging" },
          { status: 503, headers },
        );
      }
    }
    if (pathname !== "/")
      return new Response("Not found", { status: 404, headers });
    return new Response(
      "Cafe77 staging environment is ready. Application deployment is pending.",
      { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } },
    );
  },
};
