import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import worker, { type Env } from "../../workers/app.js";
import type { D1Database, D1Statement, D1Result } from "../../workers/d1.js";
import { seed } from "../../server/db.js";
export function openWorkersDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(
    readFileSync(
      new URL("../../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  db.exec(
    readFileSync(
      new URL(
        "../../migrations/0003_order_messages_menu_details.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  db.exec(
    readFileSync(
      new URL("../../migrations/0004_message_read_state.sql", import.meta.url),
      "utf8",
    ),
  );
  db.exec(
    readFileSync(
      new URL(
        "../../migrations/0005_menu_history_counter_orders.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  db.exec(
    readFileSync(
      new URL(
        "../../migrations/0006_tags_counter_visibility.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  seed(db);
  return db;
}
/** SQL integration double: real SQLite, D1-shaped async API and rollback semantics.
 * Enforces D1 parameter/query/row limits; it is not a workerd runtime substitute.
 */
export class LocalD1 implements D1Database {
  queries = 0;
  beforeBatch?: () => void;
  constructor(public db: DatabaseSync) {}
  prepare(sql: string): D1Statement {
    let values: any[] = [];
    const self = this;
    function execute(): D1Result {
      if (++self.queries > 50) throw Error("D1 Free query limit exceeded");
      if (values.length > 100) throw Error("D1 bound parameter limit exceeded");
      const statement = self.db.prepare(sql);
      const rows = statement.all(...values) as any[];
      for (const row of rows) {
        let size = 0;
        for (const [key, value] of Object.entries(row)) {
          size +=
            value instanceof Uint8Array
              ? value.byteLength
              : typeof value === "string"
                ? Buffer.byteLength(value)
                : 8;
          if (value instanceof Uint8Array) row[key] = Array.from(value);
        }
        if (size > 2000000) throw Error("D1 row size limit exceeded");
      }
      const meta = self.db
        .prepare(
          "SELECT changes() AS changes,last_insert_rowid() AS last_row_id",
        )
        .get() as any;
      return { results: rows, meta, success: true };
    }
    return {
      execute,
      bind(...bound: any[]) {
        values = bound;
        return this;
      },
      async all() {
        return execute();
      },
      async first() {
        return execute().results[0] ?? null;
      },
      async run() {
        return execute();
      },
    } as D1Statement;
  }
  async batch(statements: D1Statement[]) {
    this.beforeBatch?.();
    this.beforeBatch = undefined;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements)
        results.push((statement as any).execute());
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
export async function dispatch(
  db: DatabaseSync,
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
  extras: Record<string, string> = {},
  options: Partial<Env> = {},
) {
  const binding = new LocalD1(db);
  const request = new Request("https://cafe77.test" + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...extras,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const response = await worker.fetch(request, { DB: binding, ...options });
  return {
    status: response.status,
    data: response.status === 204 ? null : await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
    response,
    queries: binding.queries,
  };
}
export function createWorkerHttpApp(
  db: DatabaseSync,
  options: { setupToken?: string } = {},
) {
  return {
    listen(port: number, host: string) {
      return createServer(async (req, res) => {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          });
          const response = await worker.fetch(request, {
            DB: new LocalD1(db),
            SETUP_TOKEN: options.setupToken,
          });
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(error) }));
        }
      }).listen(port, host);
    },
  };
}
