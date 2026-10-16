/** Minimal D1 contract shared by Workers and the local SQL integration harness. */
export interface D1Result {
  results: any[];
  meta: { changes: number; last_row_id: number };
  success: boolean;
}
export interface D1Statement {
  bind(...values: any[]): D1Statement;
  all(): Promise<D1Result>;
  first(): Promise<any>;
  run(): Promise<D1Result>;
}
export interface D1Database {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
}
interface Snapshot {
  sql: string;
  values: any[];
  rows: any[];
}
interface Write {
  sql: string;
  values: any[];
}
const identifier = (value: string) => '"' + value.replaceAll('"', '""') + '"';

/** Reads validate business rules; all writes and read guards commit in one atomic D1 batch.
 * A guard failure aborts the batch, including payments, events, and audit records.
 * This object belongs to one request, never to a Worker isolate or global connection.
 */
export class UnitOfWork {
  private snapshots: Snapshot[] = [];
  private writes: Write[] = [];
  constructor(public readonly database: D1Database) {}
  prepare(sql: string) {
    return {
      get: async (...values: any[]) =>
        (await this.read(`SELECT * FROM (${sql}) LIMIT 1`, values))[0],
      all: async (...values: any[]) => this.read(sql, values),
      run: async (...values: any[]) => {
        let changes = 1,
          lastInsertRowid = 0;
        const update = sql.match(
          /^UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i,
        );
        if (update) {
          const assigned = (update[2].match(/\?/g) || []).length;
          const count = await this.read(
            `SELECT count(*) AS n FROM ${update[1]} WHERE ${update[3]}`,
            values.slice(assigned),
          );
          changes = count[0].n;
        }
        if (/^INSERT INTO orders\(/i.test(sql)) {
          const result = await this.read(
            "SELECT coalesce(max(id),0)+1 AS id FROM orders",
            [],
          );
          lastInsertRowid = result[0].id;
          sql = sql
            .replace("orders(", "orders(id,")
            .replace("VALUES(", "VALUES(?,");
          values = [lastInsertRowid, ...values];
        }
        this.writes.push({ sql, values });
        return { changes, lastInsertRowid };
      },
    };
  }
  private async read(sql: string, values: any[]) {
    const result = await this.database
      .prepare(sql)
      .bind(...values)
      .all();
    this.snapshots.push({ sql, values, rows: result.results });
    return result.results;
  }
  async flush() {
    if (!this.writes.length) return;
    const guards: { check: string; values: any[] }[] = [];
    this.snapshots.forEach((snapshot) => {
      const values = [...snapshot.values];
      if (!snapshot.rows.length) {
        guards.push({
          check: `(SELECT count(*) FROM (${snapshot.sql}))=0`,
          values,
        });
        return;
      }
      const columns = Object.keys(snapshot.rows[0]);
      const pair = (column: string) =>
        `'${column.replaceAll("'", "''")}',snapshot.${identifier(column)}`;
      let object = `json_object(${columns.slice(0, 16).map(pair).join(",")})`;
      for (let offset = 16; offset < columns.length; offset += 15) {
        const additions = columns
          .slice(offset, offset + 15)
          .map(
            (column) =>
              `'$.' || '${JSON.stringify(column).replaceAll("'", "''")}',snapshot.${identifier(column)}`,
          )
          .join(",");
        object = `json_set(${object},${additions})`;
      }
      values.push(JSON.stringify(snapshot.rows));
      guards.push({
        check: `(SELECT json_group_array(${object}) FROM (${snapshot.sql}) AS snapshot)=?`,
        values,
      });
    });
    // Group repeated order-line inserts into one parameterized JSON statement to stay
    // within Workers Free's D1 query count, even for a 100-line checkout.
    const writes: Write[] = [];
    const lines = this.writes.filter((w) =>
      /^INSERT INTO order_items\(/i.test(w.sql),
    );
    for (const write of this.writes) {
      if (lines.includes(write)) {
        if (write !== lines[0]) continue;
        writes.push({
          sql: "INSERT INTO order_items(order_id,item_id,code,name,price,quantity) SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]'),json_extract(value,'$[4]'),json_extract(value,'$[5]') FROM json_each(?)",
          values: [JSON.stringify(lines.map((line) => line.values))],
        });
      } else writes.push(write);
    }
    const grouped: { checks: string[]; values: any[] }[] = [];
    for (const guard of guards) {
      let group = grouped[grouped.length - 1];
      if (!group || group.values.length + guard.values.length > 90) {
        group = { checks: [], values: [] };
        grouped.push(group);
      }
      group.checks.push(guard.check);
      group.values.push(...guard.values);
    }
    await this.database.batch([
      ...grouped.map((group) =>
        this.database
          .prepare(
            `INSERT INTO transaction_guard(ok) SELECT CASE WHEN ${group.checks.join(" AND ")} THEN 1 ELSE 0 END`,
          )
          .bind(...group.values),
      ),
      ...writes.map((w) => this.database.prepare(w.sql).bind(...w.values)),
      this.database.prepare("DELETE FROM transaction_guard"),
    ]);
    this.writes = [];
    this.snapshots = [];
  }
}
export async function transaction<T>(
  db: UnitOfWork,
  operation: () => Promise<T>,
): Promise<T> {
  const result = await operation();
  await db.flush();
  return result;
}
