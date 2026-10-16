import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { generateOrderNumber } from "./order-number.js";
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  checkPassword,
  hashPassword,
  digest,
  readConfig,
  configPath,
  transaction,
  seed,
} from "./db.js";
import {
  totals,
  transitions,
  type MenuItem,
  type Order,
  type Status,
} from "../shared/domain.js";

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
});
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
  };
}
const publicConfig = () => ({ ...readConfig(), upiEnabled: false });

export function createApp(
  db: DatabaseSync,
  options: {
    setupToken?: string;
    trustLocalProxy?: boolean;
    uploadsPath?: string;
  } = {},
) {
  seed(db);
  const app = express();
  app.disable("x-powered-by");
  if (options.trustLocalProxy) app.set("trust proxy", "loopback");
  const uploadsPath = resolve(options.uploadsPath || "data/uploads");
  const changes = new EventEmitter();
  changes.setMaxListeners(100);
  app.use(
    helmet({ contentSecurityPolicy: false, strictTransportSecurity: false }),
  );
  app.use(express.json({ limit: "3mb" }));
  const limits = new Map<string, { count: number; until: number }>();
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (req.method !== "GET") {
      const origin = req.get("origin");
      if (origin && origin !== `${req.protocol}://${req.get("host")}`)
        return res.status(403).json({ error: "Request origin is not allowed" });
      if (!req.is("application/json"))
        return res.status(415).json({ error: "JSON requests required" });
    }
    const key =
      (req.ip || req.socket.remoteAddress || "local") +
      ":" +
      (req.path.includes("login")
        ? "login"
        : req.method === "GET"
          ? "read"
          : "write");
    const now = Date.now();
    if (limits.size > 10000)
      for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    let bucket = limits.get(key);
    if (!bucket || bucket.until < now) {
      bucket = { count: 0, until: now + 60000 };
      limits.set(key, bucket);
    }
    bucket.count++;
    const max = req.path.includes("login")
      ? 15
      : req.method === "GET"
        ? 1200
        : 120;
    if (bucket.count > max)
      return res
        .status(429)
        .json({ error: "Too many requests. Please try again in a minute." });
    if (req.method !== "GET")
      res.on("finish", () => {
        if (res.statusCode < 400) changes.emit("change");
      });
    next();
  });
  const audit = (actor: string, action: string, details: unknown) =>
    db
      .prepare("INSERT INTO audit(actor,action,details,at) VALUES(?,?,?,?)")
      .run(actor, action, JSON.stringify(details), new Date().toISOString());
  function staff(req: Request) {
    const token = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("cafe77_session="))
      ?.slice(15);
    const user = token
      ? db
          .prepare(
            "SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1",
          )
          .get(digest(token), Date.now())
      : null;
    if (!user) fail(401, "Please sign in");
    return user as { id: number; username: string; role: "owner" | "cashier" };
  }
  const owner = (req: Request) => {
    const user = staff(req);
    if (user.role !== "owner") fail(403, "Owner access required");
    return user;
  };
  app.get("/api/admin/events", (req, res) => {
    const u = staff(req);
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    res.write(": connected\n\n");
    const changed = () => res.write("event: change\ndata: {}\n\n");
    changes.on("change", changed);
    const heartbeat = setInterval(() => {
      try {
        staff(req);
        res.write(": heartbeat\n\n");
      } catch {
        res.end();
      }
    }, 25000);
    req.on("close", () => {
      clearInterval(heartbeat);
      changes.off("change", changed);
    });
  });
  function getOrder(id: number): Order {
    const row: any = db
      .prepare(
        "SELECT o.*,t.number AS table_number FROM orders o JOIN tables t ON t.id=o.table_id WHERE o.id=?",
      )
      .get(id);
    if (!row) return fail(404, "Order not found");
    const payments: any[] = db
      .prepare(
        "SELECT kind,amount,actor,at FROM payments WHERE order_id=? ORDER BY id",
      )
      .all(id);
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
        .filter((p) => p.kind === "payment")
        .reduce((s, p) => s + p.amount, 0),
      refunded: payments
        .filter((p) => p.kind === "refund")
        .reduce((s, p) => s + p.amount, 0),
      amounts: JSON.parse(row.amounts),
      restaurant: JSON.parse(row.restaurant),
      items: db
        .prepare(
          "SELECT item_id AS itemId,code,name,price,quantity FROM order_items WHERE order_id=?",
        )
        .all(id) as unknown as Order["items"],
      events: db
        .prepare(
          "SELECT previous,status,reason,actor,at FROM events WHERE order_id=? ORDER BY id",
        )
        .all(id) as unknown as Order["events"],
      payments,
      messages: db
        .prepare(
          "SELECT id,sender,text,at,read_at AS readAt FROM order_messages WHERE order_id=? ORDER BY id",
        )
        .all(id) as Order["messages"],
    };
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

  app.get("/api/menu", (req, res) => {
    const cfg = publicConfig();
    const table = req.query.table
      ? db
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
      groups: db
        .prepare(
          "SELECT id,name,image,active,sort FROM groups WHERE active=1 AND deleted_at IS NULL ORDER BY sort,id",
        )
        .all()
        .map((g: any) => ({ ...g, active: !!g.active })),
      items: db
        .prepare(
          "SELECT m.* FROM menu m JOIN groups g ON g.id=m.group_id WHERE m.active=1 AND g.active=1 AND m.deleted_at IS NULL AND g.deleted_at IS NULL ORDER BY m.id",
        )
        .all()
        .map(item)
        .map((m: MenuItem) => ({
          ...m,
          calories: m.showCalories ? m.calories : "",
          ingredients: m.showIngredients ? m.ingredients : "",
        })),
    });
  });
  const createOrder = (req: Request, res: Response, counter = false) => {
    const actor = counter ? staff(req).username : "Customer";
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
          .min(1)
          .max(100),
      })
      .parse(req.body);
    const requestHash = digest(JSON.stringify(input));
    const existing: any = db
      .prepare("SELECT id,token,request_hash FROM orders WHERE request_key=?")
      .get(input.requestKey);
    if (existing) {
      if (existing.request_hash !== requestHash)
        fail(409, "This checkout reference was already used");
      return res.json({ token: existing.token, order: getOrder(existing.id) });
    }
    const result = transaction(db, () => {
      const table: any = db
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
      const lines = input.items.map((x) => {
        const m: any = db
          .prepare(
            "SELECT m.* FROM menu m JOIN groups g ON g.id=m.group_id WHERE m.id=? AND m.active=1 AND m.ran_out=0 AND g.active=1 AND m.deleted_at IS NULL AND g.deleted_at IS NULL",
          )
          .get(x.id);
        if (!m) fail(409, "An item is unavailable. Please refresh your menu.");
        return {
          itemId: m.id,
          code: m.code,
          name: m.name,
          price: m.price,
          quantity: x.quantity,
        };
      });
      const cfg = publicConfig();
      const amounts = totals(
        lines,
        cfg.cgstRate,
        cfg.sgstRate,
        cfg.gstInclusive,
      );
      const token = randomBytes(24).toString("hex");
      const placedAt = new Date();
      let number = generateOrderNumber(placedAt);
      let attempts = 0;
      while (db.prepare("SELECT id FROM orders WHERE number=?").get(number)) {
        if (++attempts >= 10) fail(503, "Please try placing your order again.");
        number = generateOrderNumber(placedAt);
      }
      const now = placedAt.toISOString();
      const row = db
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
        db.prepare(
          "INSERT INTO order_items(order_id,item_id,code,name,price,quantity) VALUES(?,?,?,?,?,?)",
        ).run(id, line.itemId, line.code, line.name, line.price, line.quantity);
      db.prepare(
        "INSERT INTO events(order_id,status,actor,at) VALUES(?,?,?,?)",
      ).run(id, "New", actor, now);
      if (counter) audit(actor, "order.counter.create", { id });
      return { token, order: getOrder(id) };
    });
    res.status(201).json(result);
  };
  app.post("/api/orders", (req, res) => createOrder(req, res));
  app.post("/api/admin/orders", (req, res) => createOrder(req, res, true));
  app.get("/api/orders/:token", (req, res) => {
    const row: any = db
      .prepare("SELECT id FROM orders WHERE token=?")
      .get(req.params.token);
    if (!row) fail(404, "Order not found");
    const order = getOrder(row.id);
    res.json({
      ...order,
      events: order.events.map((e) => ({
        ...e,
        actor: e.actor === "Customer" ? "Customer" : "Cafe77 team",
      })),
      payments: order.payments.map((p) => ({ ...p, actor: "Cafe77 team" })),
    });
  });
  app.post("/api/orders/:token/messages", (req, res) => {
    const row: any = db
      .prepare("SELECT id FROM orders WHERE token=?")
      .get(req.params.token);
    if (!row) fail(404, "Order not found");
    const { text } = z
      .object({ text: z.string().trim().min(1).max(1000) })
      .parse(req.body);
    const at = new Date().toISOString();
    db.prepare(
      "INSERT INTO order_messages(order_id,sender,text,at) VALUES(?,?,?,?)",
    ).run(row.id, "customer", text, at);
    res.status(201).json({ ok: true });
  });
  app.post("/api/orders/:token/messages/read", (req, res) => {
    const row: any = db
      .prepare("SELECT id FROM orders WHERE token=?")
      .get(req.params.token);
    if (!row) fail(404, "Order not found");
    db.prepare(
      "UPDATE order_messages SET read_at=? WHERE order_id=? AND sender='staff' AND read_at IS NULL",
    ).run(new Date().toISOString(), row.id);
    res.json({ ok: true });
  });
  app.get("/api/auth/me", (req, res) => res.json(staff(req)));
  app.post("/api/auth/login", (req, res) => {
    const input = z
      .object({ username, password: z.string().min(1).max(128) })
      .parse(req.body);
    const u: any = db
      .prepare("SELECT * FROM users WHERE username=? AND active=1")
      .get(input.username);
    const valid = checkPassword(
      input.password,
      u?.password || hashPassword("invalid-account-dummy-password"),
    );
    if (!u || !valid) fail(401, "Username or password is incorrect");
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    db.prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)").run(
      digest(token),
      u.id,
      Date.now() + 8 * 3600000,
    );
    res.cookie("cafe77_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: req.secure,
      maxAge: 8 * 3600000,
      path: "/",
    });
    res.json({ id: u.id, username: u.username, role: u.role });
  });
  app.post("/api/auth/logout", (req, res) => {
    const u = staff(req);
    const token = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("cafe77_session="))
      ?.slice(15);
    if (token)
      db.prepare("DELETE FROM sessions WHERE token=?").run(digest(token));
    res.clearCookie("cafe77_session", { path: "/" });
    res.json({ ok: true });
  });
  app.post("/api/setup", (req, res) => {
    const input = z
      .object({
        token: z.string(),
        username,
        password: z.string().min(12).max(128),
      })
      .parse(req.body);
    if (
      !options.setupToken ||
      digest(input.token) !== digest(options.setupToken) ||
      db.prepare("SELECT id FROM users WHERE role='owner'").get()
    )
      fail(403, "Setup link unavailable");
    db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
      input.username,
      hashPassword(input.password),
      "owner",
    );
    audit(input.username, "owner.setup", {});
    res.json({ ok: true });
  });
  app.get("/api/admin/menu", (req, res) => {
    staff(req);
    res.json({
      groups: db
        .prepare(
          "SELECT g.*,(SELECT count(*) FROM menu m WHERE m.group_id=g.id) AS linkedItemCount FROM groups g WHERE g.deleted_at IS NULL ORDER BY g.sort,g.id",
        )
        .all()
        .map((g: any) => ({ ...g, active: !!g.active })),
      items: db
        .prepare("SELECT * FROM menu WHERE deleted_at IS NULL ORDER BY id")
        .all()
        .map(item),
    });
  });
  app.put("/api/admin/menu/:id/stock", (req, res) => {
    const u = staff(req);
    const { ranOut } = z.object({ ranOut: z.boolean() }).parse(req.body);
    const id = idParam(req);
    if (
      !db
        .prepare("UPDATE menu SET ran_out=? WHERE id=? AND deleted_at IS NULL")
        .run(+ranOut, id).changes
    )
      fail(404, "Item not found");
    audit(u.username, "menu.stock", { id, ranOut });
    res.json({ ok: true });
  });
  const saveMenu = (req: Request, res: Response) => {
    const u = owner(req);
    const m = menuSchema.parse(req.body);
    if (
      !db
        .prepare("SELECT id FROM groups WHERE id=? AND deleted_at IS NULL")
        .get(m.groupId)
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
    if (req.params.id) {
      if (
        !db
          .prepare(
            "UPDATE menu SET group_id=?,code=?,name=?,price=?,details=?,calories=?,show_calories=?,ingredients=?,show_ingredients=?,images=?,video=?,active=?,ran_out=?,today_special=?,dashboard_fav=? WHERE id=? AND deleted_at IS NULL",
          )
          .run(...values, idParam(req)).changes
      )
        fail(404, "Item not found");
    } else {
      db.prepare(
        "INSERT INTO menu(group_id,code,name,price,details,calories,show_calories,ingredients,show_ingredients,images,video,active,ran_out,today_special,dashboard_fav) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(...values);
    }
    audit(u.username, "menu.save", { id: req.params.id, code: m.code });
    res.json({ ok: true });
  };
  app.post("/api/admin/menu", saveMenu);
  app.put("/api/admin/menu/:id", saveMenu);
  app.delete("/api/admin/menu/:id", (req, res) => {
    const u = owner(req);
    const id = idParam(req);
    if (
      !db
        .prepare(
          "UPDATE menu SET active=0,deleted_at=? WHERE id=? AND deleted_at IS NULL",
        )
        .run(new Date().toISOString(), id).changes
    )
      fail(404, "Item not found");
    audit(u.username, "menu.delete", { id });
    res.json({ ok: true });
  });
  app.post("/api/admin/groups", (req, res) => {
    const u = owner(req);
    const g = z
      .object({
        name: z.string().trim().min(1).max(100),
        image: safeImage.default(""),
        active: z.boolean().default(true),
        sort: z.number().int().min(0).max(10000).default(0),
      })
      .parse(req.body);
    db.prepare(
      "INSERT INTO groups(name,image,active,sort) VALUES(?,?,?,?)",
    ).run(g.name, g.image, +g.active, g.sort);
    audit(u.username, "group.create", g);
    res.json({ ok: true });
  });
  app.put("/api/admin/groups/:id", (req, res) => {
    const u = owner(req);
    const g = z
      .object({
        name: z.string().trim().min(1).max(100),
        image: safeImage,
        active: z.boolean(),
        sort: z.number().int().min(0).max(10000),
      })
      .parse(req.body);
    if (
      !db
        .prepare(
          "UPDATE groups SET name=?,image=?,active=?,sort=? WHERE id=? AND deleted_at IS NULL",
        )
        .run(g.name, g.image, +g.active, g.sort, idParam(req)).changes
    )
      fail(404, "Group not found");
    audit(u.username, "group.update", { id: req.params.id });
    res.json({ ok: true });
  });
  app.delete("/api/admin/groups/:id", (req, res) => {
    const u = owner(req);
    const id = idParam(req);
    transaction(db, () => {
      if (
        !db
          .prepare("SELECT id FROM groups WHERE id=? AND deleted_at IS NULL")
          .get(id)
      )
        fail(404, "Group not found");
      if (db.prepare("SELECT id FROM menu WHERE group_id=? LIMIT 1").get(id))
        fail(
          409,
          "This group has linked menu item records, including discontinued items, and cannot be deleted.",
        );
      db.prepare("UPDATE groups SET active=0,deleted_at=? WHERE id=?").run(
        new Date().toISOString(),
        id,
      );
      audit(u.username, "group.delete", { id });
    });
    res.json({ ok: true });
  });
  app.get("/api/admin/orders", (req, res) => {
    staff(req);
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
    const pattern = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
    const active = req.query.current === "true";
    const where =
      "created_at>=? AND created_at<? AND (number LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')" +
      (active ? " AND status NOT IN ('Closed','Cancelled')" : "");
    const params = [from, to, pattern, pattern, pattern, pattern];
    const count: any = db
      .prepare("SELECT count(*) AS count FROM orders WHERE " + where)
      .get(...params);
    const rows = db
      .prepare(
        "SELECT id FROM orders WHERE " +
          where +
          " ORDER BY id DESC LIMIT ? OFFSET ?",
      )
      .all(...params, active ? 100 : 20, (page - 1) * (active ? 100 : 20));
    res.json({
      orders: rows.map((x: any) => getOrder(x.id)),
      total: count.count,
      page,
    });
  });
  app.get("/api/admin/orders/:id", (req, res) => {
    staff(req);
    res.json(getOrder(idParam(req)));
  });
  app.post("/api/admin/orders/:id/messages", (req, res) => {
    const u = staff(req);
    const id = idParam(req);
    const { text } = z
      .object({ text: z.string().trim().min(1).max(1000) })
      .parse(req.body);
    if (!db.prepare("SELECT id FROM orders WHERE id=?").get(id))
      fail(404, "Order not found");
    db.prepare(
      "INSERT INTO order_messages(order_id,sender,text,at) VALUES(?,?,?,?)",
    ).run(id, "staff", text, new Date().toISOString());
    audit(u.username, "order.message", { id });
    res.status(201).json({ ok: true });
  });
  app.post("/api/admin/orders/:id/messages/read", (req, res) => {
    staff(req);
    const id = idParam(req);
    if (!db.prepare("SELECT id FROM orders WHERE id=?").get(id))
      fail(404, "Order not found");
    db.prepare(
      "UPDATE order_messages SET read_at=? WHERE order_id=? AND sender='customer' AND read_at IS NULL",
    ).run(new Date().toISOString(), id);
    res.json({ ok: true });
  });
  app.post("/api/admin/orders/:id/status", (req, res) => {
    const u = staff(req);
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
      transaction(db, () => {
        const o = getOrder(idParam(req));
        if (o.version !== input.version)
          fail(409, "Order changed. Refresh and try again.");
        if (!transitions[o.status].includes(input.status))
          fail(409, "This status transition is not allowed");
        if (input.status === "Closed" && o.paid - o.refunded < o.amounts.total)
          fail(409, "Record full payment before closing");
        if (input.status === "New") {
          if (
            !db
              .prepare(
                "SELECT t.id FROM tables t JOIN orders o ON o.table_id=t.id WHERE o.id=? AND t.active=1 AND t.deleted_at IS NULL",
              )
              .get(o.id)
          )
            fail(
              409,
              "This table has been removed; the order cannot be reopened.",
            );
          for (const line of o.items) {
            const m: any = db
              .prepare(
                "SELECT m.active,m.ran_out,g.active AS group_active FROM menu m JOIN groups g ON g.id=m.group_id WHERE m.id=? AND m.deleted_at IS NULL AND g.deleted_at IS NULL",
              )
              .get(line.itemId);
            if (!m?.active || m.ran_out || !m.group_active)
              fail(
                409,
                line.name + " is unavailable; this order cannot be reopened.",
              );
          }
        }
        const now = new Date().toISOString();
        db.prepare(
          "UPDATE orders SET status=?,closed_at=?,version=version+1 WHERE id=?",
        ).run(input.status, input.status === "Closed" ? now : null, o.id);
        db.prepare(
          "INSERT INTO events(order_id,previous,status,reason,actor,at) VALUES(?,?,?,?,?,?)",
        ).run(o.id, o.status, input.status, input.reason, u.username, now);
        return getOrder(o.id);
      }),
    );
  });
  app.post("/api/admin/orders/:id/payment", (req, res) => {
    const u = staff(req);
    const input = z
      .object({
        kind: z.enum(["payment", "refund"]),
        version: z.number().int(),
      })
      .parse(req.body);
    res.json(
      transaction(db, () => {
        const o = getOrder(idParam(req));
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
        db.prepare(
          "INSERT INTO payments(order_id,kind,amount,actor,at) VALUES(?,?,?,?,?)",
        ).run(o.id, input.kind, amount, u.username, new Date().toISOString());
        db.prepare("UPDATE orders SET version=version+1 WHERE id=?").run(o.id);
        return getOrder(o.id);
      }),
    );
  });
  app.get("/api/admin/dashboard", (req, res) => {
    owner(req);
    const { from, to } = range(req);
    const total: any = db
      .prepare(
        "SELECT count(*) AS total,sum(CASE WHEN status='Cancelled' THEN 1 ELSE 0 END) AS cancelled FROM orders WHERE created_at>=? AND created_at<?",
      )
      .get(from, to);
    const rows: any[] = db
      .prepare(
        "SELECT id,amounts FROM orders WHERE status='Closed' AND closed_at>=? AND closed_at<?",
      )
      .all(from, to);
    const items = db
      .prepare(
        "SELECT i.item_id AS id,i.name,sum(i.quantity) AS quantity,m.dashboard_fav AS favourite FROM order_items i JOIN orders o ON o.id=i.order_id JOIN menu m ON m.id=i.item_id WHERE o.status='Closed' AND o.closed_at>=? AND o.closed_at<? GROUP BY i.item_id,i.name ORDER BY quantity DESC",
      )
      .all(from, to);
    const daily: Record<string, { orders: number; sales: number }> = {};
    for (const o of db
      .prepare(
        "SELECT created_at FROM orders WHERE created_at>=? AND created_at<?",
      )
      .all(from, to) as any[]) {
      const day = new Date(new Date(o.created_at).getTime() + 19800000)
        .toISOString()
        .slice(0, 10);
      daily[day] ??= { orders: 0, sales: 0 };
      daily[day].orders++;
    }
    for (const o of db
      .prepare(
        "SELECT closed_at,amounts FROM orders WHERE status='Closed' AND closed_at>=? AND closed_at<?",
      )
      .all(from, to) as any[]) {
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
  app.get("/api/admin/tables", (req, res) => {
    owner(req);
    res.json(
      db
        .prepare(
          "SELECT number,token,active FROM tables WHERE deleted_at IS NULL ORDER BY number",
        )
        .all(),
    );
  });
  app.post("/api/admin/tables", (req, res) => {
    const u = owner(req);
    const { number } = z
      .object({ number: z.number().int().min(1).max(999) })
      .parse(req.body);
    const previous: any = db
      .prepare("SELECT id,deleted_at FROM tables WHERE number=?")
      .get(number);
    if (previous && !previous.deleted_at)
      fail(409, "That table already exists");
    if (previous)
      db.prepare(
        "UPDATE tables SET deleted_at=NULL,active=1,token=? WHERE id=?",
      ).run(randomBytes(12).toString("hex"), previous.id);
    else
      db.prepare("INSERT INTO tables(number,token) VALUES(?,?)").run(
        number,
        randomBytes(12).toString("hex"),
      );
    audit(u.username, "table.create", { number });
    res.json({ ok: true });
  });
  app.delete("/api/admin/tables/:id", (req, res) => {
    const u = owner(req);
    const number = idParam(req);
    if (
      !db
        .prepare(
          "UPDATE tables SET active=0,deleted_at=? WHERE number=? AND deleted_at IS NULL",
        )
        .run(new Date().toISOString(), number).changes
    )
      fail(404, "Table not found");
    audit(u.username, "table.delete", { number });
    res.json({ ok: true });
  });
  app.get("/api/admin/config", (req, res) => {
    owner(req);
    res.json(publicConfig());
  });
  app.put("/api/admin/config", (req, res) => {
    const u = owner(req);
    const c = configSchema.parse(req.body);
    writeFileSync(configPath + ".tmp", JSON.stringify(c, null, 2) + "\n");
    renameSync(configPath + ".tmp", configPath);
    audit(u.username, "config.update", {});
    res.json(c);
  });
  app.get("/api/admin/users", (req, res) => {
    owner(req);
    res.json(
      db.prepare("SELECT id,username,role,active FROM users ORDER BY id").all(),
    );
  });
  app.post("/api/admin/users", (req, res) => {
    const u = owner(req);
    const v = z
      .object({
        username,
        password: z.string().min(12).max(128),
        role: z.enum(["owner", "cashier"]),
      })
      .parse(req.body);
    db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
      v.username,
      hashPassword(v.password),
      v.role,
    );
    audit(u.username, "user.create", { username: v.username, role: v.role });
    res.json({ ok: true });
  });
  app.put("/api/admin/users/:id", (req, res) => {
    const u = owner(req);
    const id = idParam(req);
    const v = z
      .object({
        active: z.boolean(),
        password: z.string().min(12).max(128).optional(),
      })
      .parse(req.body);
    if (id === u.id && !v.active)
      fail(400, "You cannot deactivate your own account");
    const target: any = db
      .prepare("SELECT id,role FROM users WHERE id=?")
      .get(id);
    if (!target) fail(404, "User not found");
    if (!v.active && target.role === "owner") {
      const n: any = db
        .prepare(
          "SELECT count(*) AS n FROM users WHERE role='owner' AND active=1 AND id<>?",
        )
        .get(id);
      if (!n.n) fail(400, "Keep at least one active owner");
    }
    db.prepare("UPDATE users SET active=? WHERE id=?").run(+v.active, id);
    if (v.password)
      db.prepare("UPDATE users SET password=? WHERE id=?").run(
        hashPassword(v.password),
        id,
      );
    if (!v.active || v.password)
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
    audit(u.username, "user.update", { id, active: v.active });
    res.json({ ok: true });
  });
  app.post("/api/admin/uploads", (req, res) => {
    const u = owner(req);
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
    mkdirSync(uploadsPath, { recursive: true });
    const name = randomBytes(16).toString("hex") + "." + ext;
    writeFileSync(resolve(uploadsPath, name), bytes);
    audit(u.username, "image.upload", {});
    res.json({ url: "/uploads/" + name });
  });
  app.use(
    "/uploads",
    express.static(uploadsPath, {
      dotfiles: "deny",
      immutable: true,
      maxAge: "1y",
    }),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API endpoint not found" }),
  );
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: err.issues
          .map((x) => x.path.join(".") + ": " + x.message)
          .join("; "),
      });
    if (err instanceof HttpError)
      return res.status(err.status).json({ error: err.message });
    if (err instanceof Error && err.message.includes("UNIQUE constraint"))
      return res
        .status(409)
        .json({ error: "That code, username or table already exists" });
    if ((err as any)?.type === "entity.too.large")
      return res.status(413).json({ error: "Upload is too large" });
    if (err instanceof SyntaxError)
      return res.status(400).json({ error: "Invalid JSON" });
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });
  return app;
}
