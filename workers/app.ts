import { z } from "zod";
import { randomBytes } from "node:crypto";
import { generateOrderNumber } from "../server/order-number.js";
import {
  totals,
  normalizeRestaurantConfig,
  transitions,
  type MenuItem,
  type Order,
  type Status,
} from "../shared/domain.js";
import { type Request, type Response, Router } from "./http.js";
import { UnitOfWork, transaction, type D1Database } from "./d1.js";
import { hashPassword, checkPassword, digest } from "./crypto.js";
import { storeUpload, serveUpload } from "./uploads.js";
import { Buffer } from "node:buffer";
import { enforceRateLimit } from "./rate-limit.js";
import {
  hydrateMenuHistory,
  menuHistoryFilterOptions,
  menuHistoryInsert,
  menuHistoryValues,
  menuHistoryWhere,
} from "../shared/menu-history.js";
import {
  appendItemsSchema,
  customItemsSchema,
  orderTotals,
} from "../shared/counter-items.js";
export interface Env {
  DB: D1Database;
  ASSETS?: {
    fetch(request: globalThis.Request): Promise<globalThis.Response>;
  };
  SETUP_TOKEN?: string;
}
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
const username = z.string().regex(/^[a-zA-Z0-9._-]{3,40}$/);
const newPassword = z.string().min(8).max(128);
const safeImage = z
  .string()
  .max(2000)
  .refine(
    (v) =>
      !v ||
      v.startsWith("/illustrations/") ||
      v.startsWith("/uploads/") ||
      /^https:\/\//.test(v),
    "Use an uploaded image or HTTPS image URL",
  );
const menuSchema = z.object({
  groupId: z.number().int().positive(),
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(100),
  price: z.number().int().min(0).max(10000000),
  details: z.string().max(2000).default(""),
  calories: z.string().max(500).default(""),
  showCalories: z.boolean().default(false),
  ingredients: z.string().max(2000).default(""),
  showIngredients: z.boolean().default(false),
  images: z.array(safeImage).max(6).default([]),
  video: z
    .string()
    .max(500)
    .refine(
      (v) =>
        !v || /^https:\/\/(www\.)?(youtube\.com\/watch\?|youtu\.be\/)/.test(v),
      "Use a YouTube video link",
    )
    .default(""),
  active: z.boolean(),
  ranOut: z.boolean(),
  todaySpecial: z.boolean(),
  dashboardFav: z.boolean(),
  tagIds: z.array(z.number().int().positive()).max(20).default([]),
  userComments: z.string().trim().max(1000).default(""),
});
const tagSchema = z.object({
  name: z.string().trim().min(1).max(60),
  image: safeImage.default(""),
});
const menuColumns = `m.*,(SELECT json_group_array(json_object('id',t.id,'name',t.name,'image',t.image)) FROM (SELECT t.id,t.name,t.image FROM tags t JOIN menu_tags mt ON mt.tag_id=t.id WHERE mt.menu_item_id=m.id ORDER BY lower(t.name),t.id) t) AS tags_json`;
const configSchema = z.object({
  name: z.string().trim().min(1).max(100),
  tagline: z.string().max(150),
  address: z.string().max(300),
  phone: z.string().max(30),
  gstin: z.string().max(20),
  cgstRate: z
    .number()
    .min(0)
    .max(100)
    .refine(
      (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-8,
      "Use at most two decimal places",
    ),
  sgstRate: z
    .number()
    .min(0)
    .max(100)
    .refine(
      (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-8,
      "Use at most two decimal places",
    ),
  gstInclusive: z.boolean(),
  currency: z.literal("INR"),
  timezone: z.literal("Asia/Kolkata"),
  logo: z
    .string()
    .refine((v) => v === "/cafe77-logo.jpg" || v.startsWith("/uploads/")),
  qrBaseUrl: z
    .string()
    .url()
    .refine((v) => /^https?:\/\//.test(v)),
  menuCodeSearch: z.boolean(),
  upiEnabled: z.literal(false),
  receiptFooter: z.string().max(300),
});
function item(row: any): MenuItem {
  return {
    id: row.id,
    groupId: row.group_id,
    code: row.code,
    name: row.name,
    price: row.price,
    details: row.details,
    calories: row.calories,
    showCalories: !!row.show_calories,
    ingredients: row.ingredients,
    showIngredients: !!row.show_ingredients,
    images: JSON.parse(row.images),
    video: row.video,
    active: !!row.active,
    ranOut: !!row.ran_out,
    todaySpecial: !!row.today_special,
    dashboardFav: !!row.dashboard_fav,
    tags: JSON.parse(row.tags_json || "[]"),
  };
}
export async function handleApi(request: globalThis.Request, env: Env) {
  const db = new UnitOfWork(env.DB);
  const app = new Router();
  const options = { setupToken: env.SETUP_TOKEN };
  const publicConfig = async () => {
    const row = await db
      .prepare("SELECT value FROM settings WHERE key='restaurant'")
      .get();
    if (!row) fail(503, "Database initialization required");
    return {
      ...normalizeRestaurantConfig(JSON.parse(row.value)),
      upiEnabled: false,
    };
  };
  const audit = async (actor: string, action: string, details: unknown) =>
    await db
      .prepare("INSERT INTO audit(actor,action,details,at) VALUES(?,?,?,?)")
      .run(actor, action, JSON.stringify(details), new Date().toISOString());
  async function staff(req: Request) {
    const token = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("cafe77_session="))
      ?.slice(15);
    const user = token
      ? await db
          .prepare(
            "SELECT u.id,u.username,CASE WHEN u.is_admin=1 THEN 'admin' ELSE u.role END AS role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1",
          )
          .get(await digest(token), Date.now())
      : null;
    if (!user) fail(401, "Please sign in");
    return user as {
      id: number;
      username: string;
      role: "admin" | "owner" | "cashier";
    };
  }
  const owner = async (req: Request) => {
    const user = await staff(req);
    if (user.role === "cashier") fail(403, "Owner access required");
    return user;
  };
  app.get("/api/admin/events", async (req, res) => {
    await staff(req);
    res.status(204).end();
  });
  const orderSelect = `SELECT o.*,t.number AS table_number,
      (SELECT json_group_array(json_object('kind',p.kind,'amount',p.amount,'actor',p.actor,'at',p.at)) FROM (SELECT * FROM payments WHERE order_id=o.id ORDER BY id) p) AS payment_rows,
      (SELECT json_group_array(json_object('itemId',i.item_id,'code',i.code,'name',i.name,'price',i.price,'quantity',i.quantity)) FROM (SELECT * FROM order_items WHERE order_id=o.id ORDER BY id) i) AS item_rows,
      (SELECT json_group_array(json_object('itemId',-i.id,'code','CUSTOM','name',i.name,'price',i.price,'quantity',i.quantity,'custom',1)) FROM (SELECT * FROM order_custom_items WHERE order_id=o.id ORDER BY id) i) AS custom_item_rows,
      (SELECT json_group_array(json_object('previous',e.previous,'status',e.status,'reason',e.reason,'actor',e.actor,'at',e.at)) FROM (SELECT * FROM events WHERE order_id=o.id ORDER BY id) e) AS event_rows,
      (SELECT json_group_array(json_object('id',m.id,'sender',m.sender,'text',m.text,'at',m.at,'readAt',m.read_at)) FROM (SELECT * FROM order_messages WHERE order_id=o.id ORDER BY id) m) AS message_rows
      FROM orders o JOIN tables t ON t.id=o.table_id`;
  function hydrateOrder(row: any): Order {
    const payments = JSON.parse(row.payment_rows);
    return {
      id: row.id,
      number: row.number,
      trackingToken: row.token,
      tableNumber: row.table_number,
      name: row.name,
      email: row.email,
      phone: row.phone,
      status: row.status,
      createdAt: row.created_at,
      closedAt: row.closed_at,
      version: row.version,
      paid: payments
        .filter((p: any) => p.kind === "payment")
        .reduce((sum: number, p: any) => sum + p.amount, 0),
      refunded: payments
        .filter((p: any) => p.kind === "refund")
        .reduce((sum: number, p: any) => sum + p.amount, 0),
      amounts: JSON.parse(row.amounts),
      restaurant: JSON.parse(row.restaurant),
      items: [
        ...JSON.parse(row.item_rows),
        ...JSON.parse(row.custom_item_rows),
      ],
      events: JSON.parse(row.event_rows),
      payments,
      messages: JSON.parse(row.message_rows),
    };
  }
  async function getOrder(id: number): Promise<Order> {
    await db.flush();
    const row = await db.prepare(orderSelect + " WHERE o.id=?").get(id);
    if (!row) fail(404, "Order not found");
    return hydrateOrder(row);
  }
  const idParam = (req: Request) =>
    z.coerce.number().int().positive().parse(req.params.id);
  function range(req: Request) {
    const schema = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (v) =>
          !Number.isNaN(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v,
        "Invalid date",
      );
    const from = req.query.from ? schema.parse(req.query.from) : null;
    const to = req.query.to ? schema.parse(req.query.to) : null;
    if (from && to && from > to) fail(400, "Start date must precede end date");
    return {
      from: from ? new Date(from + "T00:00:00+05:30").toISOString() : "0000",
      to: to
        ? new Date(
            new Date(to + "T00:00:00+05:30").getTime() + 86400000,
          ).toISOString()
        : "9999",
    };
  }
  app.get("/api/menu", async (req, res) => {
    const cfg = await publicConfig();
    const table = req.query.table
      ? await db
          .prepare(
            "SELECT number,token FROM tables WHERE token=? AND active=1 AND deleted_at IS NULL",
          )
          .get(String(req.query.table))
      : null;
    if (req.query.table && !table)
      fail(
        404,
        "This table link is not valid. Please scan the QR on your table.",
      );
    res.json({
      config: cfg,
      table,
      groups: (
        await db
          .prepare(
            "SELECT id,name,image,active,sort,counter_only,customer_visible FROM groups WHERE active=1 AND (counter_only=0 OR customer_visible=1) AND deleted_at IS NULL ORDER BY sort,id",
          )
          .all()
      ).map((g: any) => ({
        ...g,
        active: !!g.active,
        counterOnly: !!g.counter_only,
        customerVisible: !!g.customer_visible,
      })),
      items: (
        await db
          .prepare(
            `SELECT ${menuColumns} FROM menu m JOIN groups g ON g.id=m.group_id WHERE m.active=1 AND g.active=1 AND (g.counter_only=0 OR g.customer_visible=1) AND m.deleted_at IS NULL AND g.deleted_at IS NULL ORDER BY m.id`,
          )
          .all()
      )
        .map(item)
        .map((m: MenuItem) => ({
          ...m,
          calories: m.showCalories ? m.calories : "",
          ingredients: m.showIngredients ? m.ingredients : "",
        })),
    });
  });
  const createOrder = async (req: Request, res: Response, counter = false) => {
    const actor = counter ? (await staff(req)).username : "Customer";
    const input = z
      .object({
        table: counter
          ? z.number().int().min(1).max(999)
          : z.string().min(1).max(100),
        name: z.string().trim().min(1).max(80),
        email: z
          .union([z.string().email().max(150), z.literal("")])
          .default(""),
        phone: z
          .string()
          .max(25)
          .regex(/^[+\d\s()-]*$/)
          .default(""),
        requestKey: z.string().uuid(),
        items: z
          .array(
            z.object({
              id: z.number().int().positive(),
              quantity: z.number().int().min(1).max(50),
            }),
          )
          .min(counter ? 0 : 1)
          .max(100),
        customItems: counter
          ? customItemsSchema.default([])
          : z.array(z.never()).max(0).default([]),
      })
      .parse(req.body);
    const requestHash = await digest(JSON.stringify(input));
    const existing: any = await db
      .prepare("SELECT id,token,request_hash FROM orders WHERE request_key=?")
      .get(input.requestKey);
    if (existing) {
      if (existing.request_hash !== requestHash)
        fail(409, "This checkout reference was already used");
      return res.json({
        token: existing.token,
        order: await getOrder(existing.id),
      });
    }
    const result = await transaction(db, async () => {
      const table: any = await db
        .prepare(
          `SELECT id FROM tables WHERE ${counter ? "number" : "token"}=? AND active=1 AND deleted_at IS NULL`,
        )
        .get(input.table);
      if (!table)
        fail(
          400,
          counter
            ? "Choose an active table"
            : "Please scan a valid table QR before ordering",
        );
      if (new Set(input.items.map((x) => x.id)).size !== input.items.length)
        fail(400, "Duplicate menu items");
      if (input.items.length + input.customItems.length === 0)
        fail(400, "Add at least one item");
      const available = await db
        .prepare(
          `SELECT m.* FROM menu m JOIN groups g ON g.id=m.group_id WHERE m.id IN (SELECT value FROM json_each(?)) AND m.active=1 AND m.ran_out=0 AND g.active=1 ${counter ? "" : "AND g.counter_only=0"} AND m.deleted_at IS NULL AND g.deleted_at IS NULL ORDER BY m.id`,
        )
        .all(JSON.stringify(input.items.map((x) => x.id)));
      const lines = input.items.map((x) => {
        const m = available.find((m) => m.id === x.id);
        if (!m) fail(409, "An item is unavailable. Please refresh your menu.");
        return {
          itemId: m.id,
          code: m.code,
          name: m.name,
          price: m.price,
          quantity: x.quantity,
        };
      });
      const cfg = await publicConfig();
      const amounts = totals(
        [...lines, ...input.customItems],
        cfg.cgstRate,
        cfg.sgstRate,
        cfg.gstInclusive,
      );
      const token = randomBytes(24).toString("hex");
      const placedAt = new Date();
      let number = generateOrderNumber(placedAt);
      let attempts = 0;
      while (
        await db.prepare("SELECT id FROM orders WHERE number=?").get(number)
      ) {
        if (++attempts >= 10) fail(503, "Please try placing your order again.");
        number = generateOrderNumber(placedAt);
      }
      const now = placedAt.toISOString();
      const row = await db
        .prepare(
          "INSERT INTO orders(number,token,request_key,request_hash,table_id,name,email,phone,created_at,amounts,restaurant) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          number,
          token,
          input.requestKey,
          requestHash,
          table.id,
          input.name,
          input.email,
          input.phone,
          now,
          JSON.stringify(amounts),
          JSON.stringify(cfg),
        );
      const id = Number(row.lastInsertRowid);
      for (const line of lines)
        await db
          .prepare(
            "INSERT INTO order_items(order_id,item_id,code,name,price,quantity) VALUES(?,?,?,?,?,?)",
          )
          .run(
            id,
            line.itemId,
            line.code,
            line.name,
            line.price,
            line.quantity,
          );
      for (const line of input.customItems)
        await db
          .prepare(
            "INSERT INTO order_custom_items(order_id,name,price,quantity,actor,created_at) VALUES(?,?,?,?,?,?)",
          )
          .run(id, line.name, line.price, line.quantity, actor, now);
      await db
        .prepare("INSERT INTO events(order_id,status,actor,at) VALUES(?,?,?,?)")
        .run(id, "New", actor, now);
      if (counter) await audit(actor, "order.counter.create", { id });
      return { token, order: await getOrder(id) };
    });
    res.status(201).json(result);
  };
  app.post("/api/orders", (req, res) => createOrder(req, res));
  app.post("/api/admin/orders", (req, res) => createOrder(req, res, true));
  app.get("/api/orders/:token", async (req, res) => {
    const row: any = await db
      .prepare("SELECT id FROM orders WHERE token=?")
      .get(req.params.token);
    if (!row) fail(404, "Order not found");
    const order = await getOrder(row.id);
    res.json({
      ...order,
      events: order.events.map((e) => ({
        ...e,
        actor: e.actor === "Customer" ? "Customer" : "Cafe77 team",
      })),
      payments: order.payments.map((p) => ({ ...p, actor: "Cafe77 team" })),
    });
  });
  app.post("/api/orders/:token/messages", async (req, res) => {
    const row: any = await db
      .prepare("SELECT id FROM orders WHERE token=?")
      .get(req.params.token);
    if (!row) fail(404, "Order not found");
    const { text } = z
      .object({ text: z.string().trim().min(1).max(1000) })
      .parse(req.body);
    await db
      .prepare(
        "INSERT INTO order_messages(order_id,sender,text,at) VALUES(?,?,?,?)",
      )
      .run(row.id, "customer", text, new Date().toISOString());
    res.status(201).json({ ok: true });
  });
  app.post("/api/orders/:token/messages/read", async (req, res) => {
    const row: any = await db
      .prepare("SELECT id FROM orders WHERE token=?")
      .get(req.params.token);
    if (!row) fail(404, "Order not found");
    await db
      .prepare(
        "UPDATE order_messages SET read_at=? WHERE order_id=? AND sender='staff' AND read_at IS NULL",
      )
      .run(new Date().toISOString(), row.id);
    res.json({ ok: true });
  });
  app.get("/api/auth/me", async (req, res) => res.json(await staff(req)));
  app.post("/api/auth/login", async (req, res) => {
    const input = z
      .object({ username, password: z.string().min(1).max(128) })
      .parse(req.body);
    const u: any = await db
      .prepare("SELECT * FROM users WHERE username=? AND active=1")
      .get(input.username);
    const valid = await checkPassword(
      input.password,
      u?.password || (await hashPassword("invalid-account-dummy-password")),
    );
    if (!u || !valid) fail(401, "Username or password is incorrect");
    const token = randomBytes(32).toString("hex");
    await db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    await db
      .prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)")
      .run(await digest(token), u.id, Date.now() + 8 * 3600000);
    res.cookie("cafe77_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: req.secure,
      maxAge: 8 * 3600000,
      path: "/",
    });
    res.json({
      id: u.id,
      username: u.username,
      role: u.is_admin ? "admin" : u.role,
    });
  });
  app.post("/api/auth/logout", async (req, res) => {
    const u = await staff(req);
    const token = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("cafe77_session="))
      ?.slice(15);
    if (token)
      await db
        .prepare("DELETE FROM sessions WHERE token=?")
        .run(await digest(token));
    res.clearCookie("cafe77_session", { path: "/" });
    res.json({ ok: true });
  });
  app.post("/api/setup", async (req, res) => {
    const input = z
      .object({
        token: z.string(),
        username,
        password: newPassword,
      })
      .parse(req.body);
    if (
      !options.setupToken ||
      (await digest(input.token)) !== (await digest(options.setupToken)) ||
      (await db
        .prepare("SELECT id FROM users WHERE role='owner' AND is_admin=0")
        .get())
    )
      fail(403, "Setup link unavailable");
    await db
      .prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)")
      .run(input.username, await hashPassword(input.password), "owner");
    await audit(input.username, "owner.setup", {});
    res.json({ ok: true });
  });
  app.post("/api/setup/admin", async (req, res) => {
    const input = z
      .object({ token: z.string(), username, password: newPassword })
      .parse(req.body);
    if (
      !options.setupToken ||
      (await digest(input.token)) !== (await digest(options.setupToken))
    )
      fail(403, "Admin setup link unavailable");
    await transaction(db, async () => {
      if (await db.prepare("SELECT id FROM users WHERE is_admin=1").get())
        fail(403, "Admin setup link unavailable");
      await db
        .prepare(
          "INSERT INTO users(username,password,role,is_admin) VALUES(?,?,?,1)",
        )
        .run(input.username, await hashPassword(input.password), "owner");
      await audit(input.username, "admin.setup", {});
    });
    res.json({ ok: true });
  });
  app.get("/api/admin/menu", async (req, res) => {
    await staff(req);
    res.json({
      groups: (
        await db
          .prepare(
            "SELECT g.*,(SELECT count(*) FROM menu m WHERE m.group_id=g.id) AS linkedItemCount FROM groups g WHERE g.deleted_at IS NULL ORDER BY g.sort,g.id",
          )
          .all()
      ).map((g: any) => ({
        ...g,
        active: !!g.active,
        counterOnly: !!g.counter_only,
        customerVisible: !!g.customer_visible,
      })),
      items: (
        await db
          .prepare(
            `SELECT ${menuColumns} FROM menu m WHERE m.deleted_at IS NULL ORDER BY m.id`,
          )
          .all()
      ).map(item),
      tags: await db
        .prepare("SELECT id,name,image FROM tags ORDER BY lower(name),id")
        .all(),
    });
  });
  app.post("/api/admin/tags", async (req, res) => {
    const u = await owner(req);
    const tag = tagSchema.parse(req.body);
    await transaction(db, async () => {
      if (
        await db
          .prepare("SELECT id FROM tags WHERE lower(name)=lower(?)")
          .get(tag.name)
      )
        fail(409, "Tag name already exists");
      const next: any = await db
        .prepare("SELECT coalesce(max(id),0)+1 AS id FROM tags")
        .get();
      await db
        .prepare("INSERT INTO tags(id,name,image) VALUES(?,?,?)")
        .run(next.id, tag.name, tag.image);
      await audit(u.username, "tag.create", { id: next.id, name: tag.name });
    });
    res.json({ ok: true });
  });
  app.put("/api/admin/tags/:id", async (req, res) => {
    const u = await owner(req);
    const id = idParam(req);
    const tag = tagSchema.parse(req.body);
    await transaction(db, async () => {
      if (
        await db
          .prepare("SELECT id FROM tags WHERE lower(name)=lower(?) AND id<>?")
          .get(tag.name, id)
      )
        fail(409, "Tag name already exists");
      if (
        !(
          await db
            .prepare("UPDATE tags SET name=?,image=? WHERE id=?")
            .run(tag.name, tag.image, id)
        ).changes
      )
        fail(404, "Tag not found");
      await audit(u.username, "tag.update", { id, name: tag.name });
    });
    res.json({ ok: true });
  });
  app.delete("/api/admin/tags/:id", async (req, res) => {
    const u = await owner(req);
    const id = idParam(req);
    await transaction(db, async () => {
      if (!(await db.prepare("SELECT id FROM tags WHERE id=?").get(id)))
        fail(404, "Tag not found");
      await db.prepare("DELETE FROM menu_tags WHERE tag_id=?").run(id);
      await db.prepare("DELETE FROM tags WHERE id=?").run(id);
      await audit(u.username, "tag.delete", { id });
    });
    res.json({ ok: true });
  });
  app.get("/api/admin/menu/history", async (req, res) => {
    await owner(req);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(req.query.page || 1);
    const { from, to } = range(req);
    const q = z
      .string()
      .max(100)
      .parse(req.query.q || "");
    const filters = z
      .string()
      .max(250)
      .parse(req.query.filters || "")
      .split(",")
      .filter(Boolean);
    if (filters.some((filter) => !menuHistoryFilterOptions.includes(filter)))
      fail(400, "Invalid menu history filter");
    const { sql, params } = menuHistoryWhere(from, to, q, filters);
    const count: any = await db
      .prepare("SELECT count(*) AS n FROM menu_history WHERE " + sql)
      .get(...params);
    const rows = await db
      .prepare(
        "SELECT * FROM menu_history WHERE " +
          sql +
          " ORDER BY changed_at DESC,id DESC LIMIT 50 OFFSET ?",
      )
      .all(...params, (page - 1) * 50);
    res.json({ entries: rows.map(hydrateMenuHistory), total: count.n, page });
  });
  app.put("/api/admin/menu/:id/stock", async (req, res) => {
    const u = await staff(req);
    const { ranOut } = z.object({ ranOut: z.boolean() }).parse(req.body);
    const id = idParam(req);
    await transaction(db, async () => {
      const row = await db
        .prepare(
          `SELECT ${menuColumns} FROM menu m WHERE m.id=? AND m.deleted_at IS NULL`,
        )
        .get(id);
      if (!row) fail(404, "Item not found");
      const before = item(row);
      if (before.ranOut === ranOut) return;
      await db.prepare("UPDATE menu SET ran_out=? WHERE id=?").run(+ranOut, id);
      await db
        .prepare(menuHistoryInsert)
        .run(
          ...menuHistoryValues(
            before,
            { ...before, ranOut },
            u.username,
            "stock",
          ).values,
        );
      await audit(u.username, "menu.stock", { id, ranOut });
    });
    res.json({ ok: true });
  });
  const saveMenu = async (req: Request, res: Response) => {
    const u = await owner(req);
    const m = menuSchema.parse(req.body);
    const { userComments, tagIds, ...menuInput } = m;
    if (new Set(tagIds).size !== tagIds.length) fail(400, "Duplicate tags");
    const tags = await db
      .prepare(
        "SELECT id,name,image FROM tags WHERE id IN (SELECT value FROM json_each(?)) ORDER BY lower(name),id",
      )
      .all(JSON.stringify(tagIds));
    if (tags.length !== tagIds.length) fail(400, "Choose valid tags");
    if (
      !(await db
        .prepare("SELECT id FROM groups WHERE id=? AND deleted_at IS NULL")
        .get(m.groupId))
    )
      fail(400, "Group not found");
    const values = [
      m.groupId,
      m.code,
      m.name,
      m.price,
      m.details,
      m.calories,
      +m.showCalories,
      m.ingredients,
      +m.showIngredients,
      JSON.stringify(m.images),
      m.video,
      +m.active,
      +m.ranOut,
      +m.todaySpecial,
      +m.dashboardFav,
    ];
    await transaction(db, async () => {
      const id = req.params.id ? idParam(req) : 0;
      const old = id
        ? await db
            .prepare(
              `SELECT ${menuColumns} FROM menu m WHERE m.id=? AND m.deleted_at IS NULL`,
            )
            .get(id)
        : null;
      if (id && !old) fail(404, "Item not found");
      const before = old ? item(old) : null;
      const after = { ...menuInput, id, tags };
      if (
        !menuHistoryValues(
          before,
          after,
          u.username,
          id ? "updated" : "created",
          userComments,
        ).changed
      )
        return;
      let savedId = id;
      if (id)
        await db
          .prepare(
            "UPDATE menu SET group_id=?,code=?,name=?,price=?,details=?,calories=?,show_calories=?,ingredients=?,show_ingredients=?,images=?,video=?,active=?,ran_out=?,today_special=?,dashboard_fav=? WHERE id=? AND deleted_at IS NULL",
          )
          .run(...values, id);
      else {
        const next: any = await db
          .prepare("SELECT coalesce(max(id),0)+1 AS id FROM menu")
          .get();
        savedId = next.id;
        await db
          .prepare(
            "INSERT INTO menu(id,group_id,code,name,price,details,calories,show_calories,ingredients,show_ingredients,images,video,active,ran_out,today_special,dashboard_fav) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .run(savedId, ...values);
      }
      await db
        .prepare("DELETE FROM menu_tags WHERE menu_item_id=?")
        .run(savedId);
      await db
        .prepare(
          "INSERT INTO menu_tags(menu_item_id,tag_id) SELECT ?,value FROM json_each(?)",
        )
        .run(savedId, JSON.stringify(tagIds));
      await db
        .prepare(menuHistoryInsert)
        .run(
          ...menuHistoryValues(
            before,
            { ...after, id: savedId },
            u.username,
            id ? "updated" : "created",
            userComments,
          ).values,
        );
      await audit(u.username, "menu.save", { id: savedId, code: m.code });
    });
    res.json({ ok: true });
  };
  app.post("/api/admin/menu", saveMenu);
  app.put("/api/admin/menu/:id", saveMenu);
  app.delete("/api/admin/menu/:id", async (req, res) => {
    const u = await owner(req);
    const id = idParam(req);
    await transaction(db, async () => {
      const row = await db
        .prepare(
          `SELECT ${menuColumns} FROM menu m WHERE m.id=? AND m.deleted_at IS NULL`,
        )
        .get(id);
      if (!row) fail(404, "Item not found");
      const before = item(row);
      await db
        .prepare("UPDATE menu SET active=0,deleted_at=? WHERE id=?")
        .run(new Date().toISOString(), id);
      await db
        .prepare(menuHistoryInsert)
        .run(...menuHistoryValues(before, null, u.username, "deleted").values);
      await audit(u.username, "menu.delete", { id });
    });
    res.json({ ok: true });
  });
  app.post("/api/admin/groups", async (req, res) => {
    const u = await owner(req);
    const g = z
      .object({
        name: z.string().trim().min(1).max(100),
        image: safeImage.default(""),
        active: z.boolean().default(true),
        sort: z.number().int().min(0).max(10000).default(0),
        counterOnly: z.boolean().default(false),
        customerVisible: z.boolean().default(false),
      })
      .parse(req.body);
    await db
      .prepare(
        "INSERT INTO groups(name,image,active,sort,counter_only,customer_visible) VALUES(?,?,?,?,?,?)",
      )
      .run(
        g.name,
        g.image,
        +g.active,
        g.sort,
        +g.counterOnly,
        +g.customerVisible,
      );
    await audit(u.username, "group.create", g);
    res.json({ ok: true });
  });
  app.put("/api/admin/groups/:id", async (req, res) => {
    const u = await owner(req);
    const g = z
      .object({
        name: z.string().trim().min(1).max(100),
        image: safeImage,
        active: z.boolean(),
        sort: z.number().int().min(0).max(10000),
        counterOnly: z.boolean().default(false),
        customerVisible: z.boolean().default(false),
      })
      .parse(req.body);
    if (
      !(
        await db
          .prepare(
            "UPDATE groups SET name=?,image=?,active=?,sort=?,counter_only=?,customer_visible=? WHERE id=? AND deleted_at IS NULL",
          )
          .run(
            g.name,
            g.image,
            +g.active,
            g.sort,
            +g.counterOnly,
            +g.customerVisible,
            idParam(req),
          )
      ).changes
    )
      fail(404, "Group not found");
    await audit(u.username, "group.update", { id: req.params.id });
    res.json({ ok: true });
  });
  app.delete("/api/admin/groups/:id", async (req, res) => {
    const u = await owner(req);
    const id = idParam(req);
    await transaction(db, async () => {
      if (
        !(await db
          .prepare("SELECT id FROM groups WHERE id=? AND deleted_at IS NULL")
          .get(id))
      )
        fail(404, "Group not found");
      if (
        await db.prepare("SELECT id FROM menu WHERE group_id=? LIMIT 1").get(id)
      )
        fail(
          409,
          "This group has linked menu item records, including discontinued items, and cannot be deleted.",
        );
      await db
        .prepare("UPDATE groups SET active=0,deleted_at=? WHERE id=?")
        .run(new Date().toISOString(), id);
      await audit(u.username, "group.delete", { id });
    });
    res.json({ ok: true });
  });
  app.get("/api/admin/orders", async (req, res) => {
    await staff(req);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(req.query.page || 1);
    const { from, to } = range(req);
    const q = z
      .string()
      .max(100)
      .parse(req.query.q || "");
    const statuses = z
      .string()
      .max(100)
      .parse(req.query.statuses || "")
      .split(",")
      .filter(Boolean)
      .map((status) =>
        z
          .enum([
            "New",
            "Accepted",
            "InProgress",
            "Ready",
            "Closed",
            "Cancelled",
          ])
          .parse(status),
      );
    if (new Set(statuses).size !== statuses.length)
      fail(400, "Duplicate order status filter");
    const pattern = q;
    const active = req.query.current === "true";
    const where =
      "o.created_at>=? AND o.created_at<? AND (instr(lower(o.number),lower(?))>0 OR instr(lower(o.name),lower(?))>0 OR instr(lower(o.email),lower(?))>0 OR instr(lower(o.phone),lower(?))>0)" +
      (active ? " AND o.status NOT IN ('Closed','Cancelled')" : "") +
      (statuses.length
        ? ` AND o.status IN (${statuses.map(() => "?").join(",")})`
        : "");
    const params = [from, to, pattern, pattern, pattern, pattern, ...statuses];
    const count: any = await db
      .prepare("SELECT count(*) AS count FROM orders o WHERE " + where)
      .get(...params);
    const rows = await db
      .prepare(
        orderSelect +
          " WHERE " +
          where +
          " ORDER BY o.id DESC LIMIT ? OFFSET ?",
      )
      .all(...params, active ? 100 : 20, (page - 1) * (active ? 100 : 20));
    res.json({
      orders: rows.map(hydrateOrder),
      total: count.count,
      page,
    });
  });
  app.get("/api/admin/orders/:id", async (req, res) => {
    await staff(req);
    res.json(await getOrder(idParam(req)));
  });
  app.post("/api/admin/orders/:id/items", async (req, res) => {
    const u = await staff(req);
    const input = appendItemsSchema.parse(req.body);
    res.json(
      await transaction(db, async () => {
        const order = await getOrder(idParam(req));
        if (order.version !== input.version)
          fail(409, "Order changed. Refresh and try again.");
        if (["Closed", "Cancelled"].includes(order.status))
          fail(409, "Items cannot be added to this order status");
        if (new Set(input.items.map((x) => x.id)).size !== input.items.length)
          fail(400, "Duplicate menu items");
        const available = await db
          .prepare(
            "SELECT m.* FROM menu m JOIN groups g ON g.id=m.group_id WHERE m.id IN (SELECT value FROM json_each(?)) AND m.active=1 AND m.ran_out=0 AND g.active=1 AND m.deleted_at IS NULL AND g.deleted_at IS NULL ORDER BY m.id",
          )
          .all(JSON.stringify(input.items.map((x) => x.id)));
        const lines = input.items.map((x) => {
          const row = available.find((candidate) => candidate.id === x.id);
          if (!row) fail(409, "An item is unavailable. Refresh the menu.");
          return {
            itemId: row.id,
            code: row.code,
            name: row.name,
            price: row.price,
            quantity: x.quantity,
          };
        });
        const amounts = orderTotals(
          [
            ...order.items,
            ...lines,
            ...input.customItems.map((x) => ({
              ...x,
              itemId: 0,
              code: "CUSTOM",
            })),
          ],
          order.restaurant,
        );
        const now = new Date().toISOString();
        for (const line of lines)
          await db
            .prepare(
              "INSERT INTO order_items(order_id,item_id,code,name,price,quantity) VALUES(?,?,?,?,?,?)",
            )
            .run(
              order.id,
              line.itemId,
              line.code,
              line.name,
              line.price,
              line.quantity,
            );
        for (const line of input.customItems)
          await db
            .prepare(
              "INSERT INTO order_custom_items(order_id,name,price,quantity,actor,created_at) VALUES(?,?,?,?,?,?)",
            )
            .run(
              order.id,
              line.name,
              line.price,
              line.quantity,
              u.username,
              now,
            );
        await db
          .prepare("UPDATE orders SET amounts=?,version=version+1 WHERE id=?")
          .run(JSON.stringify(amounts), order.id);
        await audit(u.username, "order.items.add", {
          id: order.id,
          menuItems: lines.length,
          customItems: input.customItems.length,
        });
        return await getOrder(order.id);
      }),
    );
  });
  app.post("/api/admin/orders/:id/messages", async (req, res) => {
    const u = await staff(req);
    const id = idParam(req);
    const { text } = z
      .object({ text: z.string().trim().min(1).max(1000) })
      .parse(req.body);
    if (!(await db.prepare("SELECT id FROM orders WHERE id=?").get(id)))
      fail(404, "Order not found");
    await db
      .prepare(
        "INSERT INTO order_messages(order_id,sender,text,at) VALUES(?,?,?,?)",
      )
      .run(id, "staff", text, new Date().toISOString());
    await audit(u.username, "order.message", { id });
    res.status(201).json({ ok: true });
  });
  app.post("/api/admin/orders/:id/messages/read", async (req, res) => {
    await staff(req);
    const id = idParam(req);
    if (!(await db.prepare("SELECT id FROM orders WHERE id=?").get(id)))
      fail(404, "Order not found");
    await db
      .prepare(
        "UPDATE order_messages SET read_at=? WHERE order_id=? AND sender='customer' AND read_at IS NULL",
      )
      .run(new Date().toISOString(), id);
    res.json({ ok: true });
  });
  app.post("/api/admin/orders/:id/status", async (req, res) => {
    const u = await staff(req);
    const input = z
      .object({
        status: z.enum([
          "New",
          "Accepted",
          "InProgress",
          "Ready",
          "Closed",
          "Cancelled",
        ]),
        reason: z.string().max(500).default(""),
        version: z.number().int(),
      })
      .parse(req.body);
    res.json(
      await transaction(db, async () => {
        const o = await getOrder(idParam(req));
        if (o.version !== input.version)
          fail(409, "Order changed. Refresh and try again.");
        if (!transitions[o.status as Status].includes(input.status))
          fail(409, "This status transition is not allowed");
        if (input.status === "Closed" && o.paid - o.refunded < o.amounts.total)
          fail(409, "Record full payment before closing");
        if (input.status === "New") {
          if (
            !(await db
              .prepare(
                "SELECT t.id FROM tables t JOIN orders o ON o.table_id=t.id WHERE o.id=? AND t.active=1 AND t.deleted_at IS NULL",
              )
              .get(o.id))
          )
            fail(
              409,
              "This table has been removed; the order cannot be reopened.",
            );
          const available = await db
            .prepare(
              "SELECT m.id FROM menu m JOIN groups g ON g.id=m.group_id WHERE m.id IN (SELECT value FROM json_each(?)) AND m.active=1 AND m.ran_out=0 AND g.active=1 AND m.deleted_at IS NULL AND g.deleted_at IS NULL ORDER BY m.id",
            )
            .all(
              JSON.stringify(
                o.items
                  .filter((line) => !line.custom)
                  .map((line) => line.itemId),
              ),
            );
          if (
            available.length !== o.items.filter((line) => !line.custom).length
          )
            fail(409, "An item is unavailable; this order cannot be reopened.");
        }
        const now = new Date().toISOString();
        await db
          .prepare(
            "UPDATE orders SET status=?,closed_at=?,version=version+1 WHERE id=?",
          )
          .run(input.status, input.status === "Closed" ? now : null, o.id);
        await db
          .prepare(
            "INSERT INTO events(order_id,previous,status,reason,actor,at) VALUES(?,?,?,?,?,?)",
          )
          .run(o.id, o.status, input.status, input.reason, u.username, now);
        return await getOrder(o.id);
      }),
    );
  });
  app.post("/api/admin/orders/:id/payment", async (req, res) => {
    const u = await staff(req);
    const input = z
      .object({
        kind: z.enum(["payment", "refund"]),
        version: z.number().int(),
      })
      .parse(req.body);
    res.json(
      await transaction(db, async () => {
        const o = await getOrder(idParam(req));
        if (o.version !== input.version)
          fail(409, "Order changed. Refresh and try again.");
        const net = o.paid - o.refunded;
        const amount = input.kind === "refund" ? net : o.amounts.total - net;
        if (amount <= 0) fail(409, "No outstanding amount");
        if (input.kind === "refund" && o.status !== "Cancelled")
          fail(409, "Cancel the order before recording a refund");
        if (
          input.kind === "payment" &&
          ["Cancelled", "Closed"].includes(o.status)
        )
          fail(409, "Payments cannot be recorded for this order status");
        await db
          .prepare(
            "INSERT INTO payments(order_id,kind,amount,actor,at) VALUES(?,?,?,?,?)",
          )
          .run(o.id, input.kind, amount, u.username, new Date().toISOString());
        await db
          .prepare("UPDATE orders SET version=version+1 WHERE id=?")
          .run(o.id);
        return await getOrder(o.id);
      }),
    );
  });
  app.get("/api/admin/dashboard", async (req, res) => {
    await owner(req);
    const { from, to } = range(req);
    const total: any = await db
      .prepare(
        "SELECT count(*) AS total,sum(CASE WHEN status='Cancelled' THEN 1 ELSE 0 END) AS cancelled FROM orders WHERE created_at>=? AND created_at<?",
      )
      .get(from, to);
    const rows: any[] = await db
      .prepare(
        "SELECT id,amounts FROM orders WHERE status='Closed' AND closed_at>=? AND closed_at<?",
      )
      .all(from, to);
    const items = await db
      .prepare(
        "SELECT i.item_id AS id,i.name,sum(i.quantity) AS quantity,m.dashboard_fav AS favourite FROM order_items i JOIN orders o ON o.id=i.order_id JOIN menu m ON m.id=i.item_id WHERE o.status='Closed' AND o.closed_at>=? AND o.closed_at<? GROUP BY i.item_id,i.name ORDER BY quantity DESC",
      )
      .all(from, to);
    const daily: Record<
      string,
      {
        orders: number;
        sales: number;
      }
    > = {};
    for (const o of (await db
      .prepare(
        "SELECT created_at FROM orders WHERE created_at>=? AND created_at<?",
      )
      .all(from, to)) as any[]) {
      const day = new Date(new Date(o.created_at).getTime() + 19800000)
        .toISOString()
        .slice(0, 10);
      daily[day] ??= { orders: 0, sales: 0 };
      daily[day].orders++;
    }
    for (const o of (await db
      .prepare(
        "SELECT closed_at,amounts FROM orders WHERE status='Closed' AND closed_at>=? AND closed_at<?",
      )
      .all(from, to)) as any[]) {
      const day = new Date(new Date(o.closed_at).getTime() + 19800000)
        .toISOString()
        .slice(0, 10);
      daily[day] ??= { orders: 0, sales: 0 };
      daily[day].sales += JSON.parse(o.amounts).total;
    }
    res.json({
      orders: total.total,
      cancelled: total.cancelled || 0,
      closed: rows.length,
      sales: rows.reduce((sum, o) => sum + JSON.parse(o.amounts).total, 0),
      items,
      daily: Object.entries(daily)
        .sort()
        .map(([date, v]) => ({ date, ...v })),
    });
  });
  app.get("/api/admin/tables", async (req, res) => {
    await owner(req);
    res.json(
      await db
        .prepare(
          "SELECT number,token,active FROM tables WHERE deleted_at IS NULL ORDER BY number",
        )
        .all(),
    );
  });
  app.post("/api/admin/tables", async (req, res) => {
    const u = await owner(req);
    const { number } = z
      .object({ number: z.number().int().min(1).max(999) })
      .parse(req.body);
    const previous: any = await db
      .prepare("SELECT id,deleted_at FROM tables WHERE number=?")
      .get(number);
    if (previous && !previous.deleted_at)
      fail(409, "That table already exists");
    if (previous)
      await db
        .prepare(
          "UPDATE tables SET deleted_at=NULL,active=1,token=? WHERE id=?",
        )
        .run(randomBytes(12).toString("hex"), previous.id);
    else
      await db
        .prepare("INSERT INTO tables(number,token) VALUES(?,?)")
        .run(number, randomBytes(12).toString("hex"));
    await audit(u.username, "table.create", { number });
    res.json({ ok: true });
  });
  app.delete("/api/admin/tables/:id", async (req, res) => {
    const u = await owner(req);
    const number = idParam(req);
    if (
      !(
        await db
          .prepare(
            "UPDATE tables SET active=0,deleted_at=? WHERE number=? AND deleted_at IS NULL",
          )
          .run(new Date().toISOString(), number)
      ).changes
    )
      fail(404, "Table not found");
    await audit(u.username, "table.delete", { number });
    res.json({ ok: true });
  });
  app.get("/api/admin/config", async (req, res) => {
    await owner(req);
    res.json(await publicConfig());
  });
  app.put("/api/admin/config", async (req, res) => {
    const u = await owner(req);
    const c = configSchema.parse(req.body);
    await db
      .prepare("UPDATE settings SET value=? WHERE key='restaurant'")
      .run(JSON.stringify(c));
    await audit(u.username, "config.update", {});
    res.json(c);
  });
  app.get("/api/admin/users", async (req, res) => {
    const u = await owner(req);
    res.json(
      await db
        .prepare(
          "SELECT id,username,CASE WHEN is_admin=1 THEN 'admin' ELSE role END AS role,active FROM users WHERE is_admin=0 OR ?='admin' ORDER BY id",
        )
        .all(u.role),
    );
  });
  app.post("/api/admin/users", async (req, res) => {
    const u = await owner(req);
    const v = z
      .object({
        username,
        password: newPassword,
        role: z.enum(["admin", "owner", "cashier"]),
      })
      .parse(req.body);
    if (v.role === "admin" && u.role !== "admin")
      fail(403, "Admin access required");
    await db
      .prepare(
        "INSERT INTO users(username,password,role,is_admin) VALUES(?,?,?,?)",
      )
      .run(
        v.username,
        await hashPassword(v.password),
        v.role === "admin" ? "owner" : v.role,
        +(v.role === "admin"),
      );
    await audit(u.username, "user.create", {
      username: v.username,
      role: v.role,
    });
    res.json({ ok: true });
  });
  app.put("/api/admin/users/:id", async (req, res) => {
    const u = await owner(req);
    const id = idParam(req);
    const v = z
      .object({
        active: z.boolean(),
        password: newPassword.optional(),
      })
      .parse(req.body);
    if (id === u.id && !v.active)
      fail(400, "You cannot deactivate your own account");
    const target: any = await db
      .prepare(
        "SELECT id,CASE WHEN is_admin=1 THEN 'admin' ELSE role END AS role FROM users WHERE id=?",
      )
      .get(id);
    if (!target || (target.role === "admin" && u.role !== "admin"))
      fail(404, "User not found");
    if (!v.active && target.role === "owner") {
      const n: any = await db
        .prepare(
          "SELECT count(*) AS n FROM users WHERE role='owner' AND is_admin=0 AND active=1 AND id<>?",
        )
        .get(id);
      if (!n.n) fail(400, "Keep at least one active owner");
    }
    if (!v.active && target.role === "admin") {
      const n: any = await db
        .prepare(
          "SELECT count(*) AS n FROM users WHERE is_admin=1 AND active=1 AND id<>?",
        )
        .get(id);
      if (!n.n) fail(400, "Keep at least one active admin");
    }
    await db.prepare("UPDATE users SET active=? WHERE id=?").run(+v.active, id);
    if (v.password)
      await db
        .prepare("UPDATE users SET password=? WHERE id=?")
        .run(await hashPassword(v.password), id);
    if (!v.active || v.password)
      await db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
    await audit(u.username, "user.update", { id, active: v.active });
    res.json({ ok: true });
  });
  app.post("/api/admin/uploads", async (req, res) => {
    const u = await owner(req);
    const { data } = z
      .object({ data: z.string().max(2900000) })
      .parse(req.body);
    const match = data.match(
      /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/,
    );
    if (!match) fail(400, "Upload a PNG, JPEG or WebP");
    const bytes = Buffer.from(match![2], "base64");
    const ext = match![1];
    const valid =
      ext === "png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : ext === "jpeg"
          ? bytes[0] === 255 && bytes[1] === 216
          : bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP";
    if (!valid || bytes.length > 2 * 1024 * 1024)
      fail(400, "Invalid image or exceeds 2 MB");
    const name = randomBytes(16).toString("hex") + "." + ext;
    await storeUpload(db, name, "image/" + ext, bytes);
    await audit(u.username, "image.upload", {});
    res.json({ url: "/uploads/" + name });
  });
  return await app.dispatch(request, db);
}
const worker = {
  async fetch(
    request: globalThis.Request,
    env: Env,
  ): Promise<globalThis.Response> {
    try {
      const path = new URL(request.url).pathname;
      if (path.startsWith("/uploads/"))
        return await serveUpload(request, env.DB);
      if (!path.startsWith("/api/"))
        return env.ASSETS
          ? await env.ASSETS.fetch(request)
          : new globalThis.Response("Not found", { status: 404 });
      await enforceRateLimit(request, env.DB);
      for (let attempt = 0; ; attempt++) {
        try {
          return await handleApi(request.clone(), env);
        } catch (error) {
          if (
            attempt >= 2 ||
            !(error instanceof Error) ||
            !/CHECK constraint.*(?:transaction_guard|ok=1)/.test(error.message)
          )
            throw error;
        }
      }
    } catch (error) {
      let status = 500,
        message = "Something went wrong. Please try again.";
      if (error instanceof z.ZodError) {
        status = 400;
        message = error.issues
          .map((x) => x.path.join(".") + ": " + x.message)
          .join("; ");
      } else if (error instanceof HttpError) {
        status = error.status;
        message = error.message;
      } else if (
        error instanceof Error &&
        "status" in error &&
        (error.status === 413 || error.status === 429)
      ) {
        status = Number(error.status);
        message = error.message;
      } else if (error instanceof SyntaxError) {
        status = 400;
        message = "Invalid JSON";
      } else if (
        error instanceof Error &&
        /CHECK constraint|UNIQUE constraint|FOREIGN KEY constraint/.test(
          error.message,
        )
      ) {
        status = 409;
        message = "A record changed or already exists. Refresh and try again.";
      } else {
        console.error(
          "Workers API failure",
          error instanceof Error ? error.message : "unknown",
        );
      }
      return globalThis.Response.json(
        { error: message },
        {
          status,
          headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
  },
};

export default {
  async fetch(
    request: globalThis.Request,
    env: Env,
  ): Promise<globalThis.Response> {
    const response = await worker.fetch(request, env);
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "same-origin");
    if (new URL(request.url).pathname.startsWith("/api/"))
      headers.set("Cache-Control", "no-store");
    if (new URL(request.url).protocol === "https:")
      headers.set("Strict-Transport-Security", "max-age=31536000");
    return new globalThis.Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
