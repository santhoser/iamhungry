import catalogue from "../shared/menu-catalogue.json";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { Restaurant } from "../shared/domain.js";
import { normalizeRestaurantConfig } from "../shared/domain.js";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function checkPassword(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  return timingSafeEqual(
    Buffer.from(key, "hex"),
    scryptSync(password, salt, 64),
  );
}
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const configPath = resolve(
  process.env.CAFE77_CONFIG || "config/restaurant.json",
);
export function readConfig(): Restaurant {
  return normalizeRestaurantConfig(
    JSON.parse(readFileSync(configPath, "utf8")),
  );
}
export function openDatabase(
  path = process.env.CAFE77_DB || "data/cafe77.sqlite",
) {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','cashier')), active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tables(id INTEGER PRIMARY KEY,number INTEGER UNIQUE NOT NULL,token TEXT UNIQUE NOT NULL,active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS groups(id INTEGER PRIMARY KEY,name TEXT NOT NULL,image TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,sort INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS menu(id INTEGER PRIMARY KEY,group_id INTEGER NOT NULL REFERENCES groups(id),code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),details TEXT NOT NULL DEFAULT '',images TEXT NOT NULL DEFAULT '[]',video TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,ran_out INTEGER NOT NULL DEFAULT 0,today_special INTEGER NOT NULL DEFAULT 0,dashboard_fav INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,number TEXT UNIQUE NOT NULL,token TEXT UNIQUE NOT NULL,request_key TEXT UNIQUE NOT NULL,request_hash TEXT NOT NULL,table_id INTEGER NOT NULL REFERENCES tables(id),name TEXT NOT NULL,email TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'New',created_at TEXT NOT NULL,closed_at TEXT,version INTEGER NOT NULL DEFAULT 1,amounts TEXT NOT NULL,restaurant TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),item_id INTEGER NOT NULL REFERENCES menu(id),code TEXT NOT NULL,name TEXT NOT NULL,price INTEGER NOT NULL,quantity INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),previous TEXT,status TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',actor TEXT NOT NULL,at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),kind TEXT NOT NULL CHECK(kind IN ('payment','refund')),amount INTEGER NOT NULL CHECK(amount>0),actor TEXT NOT NULL,at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL,at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS order_messages(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),sender TEXT NOT NULL CHECK(sender IN ('customer','staff')),text TEXT NOT NULL,at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS order_custom_items(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),name TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),quantity INTEGER NOT NULL CHECK(quantity>0),actor TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS menu_history(id INTEGER PRIMARY KEY,menu_item_id INTEGER NOT NULL REFERENCES menu(id),item_code TEXT NOT NULL,item_name TEXT NOT NULL,changed_at TEXT NOT NULL,actor TEXT NOT NULL,change_type TEXT NOT NULL,system_comments TEXT NOT NULL,user_comments TEXT NOT NULL DEFAULT '',is_price_change INTEGER NOT NULL DEFAULT 0,old_price INTEGER,new_price INTEGER,old_ran_out INTEGER,new_ran_out INTEGER,old_today_special INTEGER,new_today_special INTEGER,old_dashboard_fav INTEGER,new_dashboard_fav INTEGER,old_active INTEGER,new_active INTEGER,before_json TEXT,after_json TEXT);
    CREATE TABLE IF NOT EXISTS tags(id INTEGER PRIMARY KEY,name TEXT NOT NULL,image TEXT NOT NULL DEFAULT '');
    CREATE UNIQUE INDEX IF NOT EXISTS tags_name_unique ON tags(lower(name));
    CREATE TABLE IF NOT EXISTS menu_tags(menu_item_id INTEGER NOT NULL REFERENCES menu(id),tag_id INTEGER NOT NULL REFERENCES tags(id),PRIMARY KEY(menu_item_id,tag_id));
    CREATE INDEX IF NOT EXISTS menu_tags_tag ON menu_tags(tag_id,menu_item_id);
    CREATE INDEX IF NOT EXISTS menu_history_date ON menu_history(changed_at DESC,id DESC);
    CREATE INDEX IF NOT EXISTS menu_history_item ON menu_history(menu_item_id,changed_at DESC);
    CREATE INDEX IF NOT EXISTS order_custom_items_order ON order_custom_items(order_id,id);
    CREATE INDEX IF NOT EXISTS messages_order ON order_messages(order_id,id);
    CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS events_order ON events(order_id);
    CREATE INDEX IF NOT EXISTS payments_order ON payments(order_id);
    CREATE INDEX IF NOT EXISTS items_order ON order_items(order_id);
  `);
  if (
    !db
      .prepare("PRAGMA table_info(users)")
      .all()
      .some((column) => column.name === "is_admin")
  )
    db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
  // Upgrade existing local databases without removing historical rows.
  transaction(db, () => {
    const orderColumns = db.prepare("PRAGMA table_info(orders)").all();
    if (!orderColumns.some((column) => column.name === "order_type"))
      db.exec(
        "ALTER TABLE orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'DineIn' CHECK(order_type IN ('DineIn','TakeAway'))",
      );
    if (!orderColumns.some((column) => column.name === "payment_mode"))
      db.exec(
        "ALTER TABLE orders ADD COLUMN payment_mode TEXT CHECK(payment_mode IN ('Cash','UPI'))",
      );
    if (
      !db
        .prepare("PRAGMA table_info(payments)")
        .all()
        .some((column) => column.name === "mode")
    )
      db.exec(
        "ALTER TABLE payments ADD COLUMN mode TEXT CHECK(mode IN ('Cash','UPI'))",
      );
    db.exec(
      "CREATE INDEX IF NOT EXISTS orders_payment_mode_date ON orders(payment_mode,created_at DESC)",
    );
    for (const table of ["tables", "groups", "menu"]) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all();
      if (!columns.some((column) => column.name === "deleted_at")) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
      }
    }
    db.exec("CREATE INDEX IF NOT EXISTS menu_group ON menu(group_id)");
    const menuColumns = db.prepare("PRAGMA table_info(menu)").all();
    for (const [name, definition] of [
      ["calories", "TEXT NOT NULL DEFAULT ''"],
      ["show_calories", "INTEGER NOT NULL DEFAULT 0"],
      ["ingredients", "TEXT NOT NULL DEFAULT ''"],
      ["show_ingredients", "INTEGER NOT NULL DEFAULT 0"],
    ])
      if (!menuColumns.some((column) => column.name === name))
        db.exec(`ALTER TABLE menu ADD COLUMN ${name} ${definition}`);
    const groupColumns = db.prepare("PRAGMA table_info(groups)").all();
    if (!groupColumns.some((column) => column.name === "counter_only"))
      db.exec(
        "ALTER TABLE groups ADD COLUMN counter_only INTEGER NOT NULL DEFAULT 0",
      );
    if (!groupColumns.some((column) => column.name === "customer_visible"))
      db.exec(
        "ALTER TABLE groups ADD COLUMN customer_visible INTEGER NOT NULL DEFAULT 0",
      );
    const messageColumns = db
      .prepare("PRAGMA table_info(order_messages)")
      .all();
    if (!messageColumns.some((column) => column.name === "read_at")) {
      db.exec("ALTER TABLE order_messages ADD COLUMN read_at TEXT");
      db.exec("UPDATE order_messages SET read_at=at");
    }
  });
  return db;
}
export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function seed(db: DatabaseSync) {
  if (!db.prepare("SELECT id FROM tables LIMIT 1").get()) {
    for (let n = 1; n <= 15; n++)
      db.prepare("INSERT INTO tables(number,token) VALUES(?,?)").run(
        n,
        randomBytes(12).toString("hex"),
      );
  }
  if (db.prepare("SELECT id FROM groups LIMIT 1").get()) return;
  transaction(db, () => {
    for (const group of catalogue.groups)
      db.prepare("INSERT INTO groups(id,name,image,sort) VALUES(?,?,?,?)").run(
        group.id,
        group.name,
        group.image,
        group.sort,
      );
    for (const item of catalogue.items)
      db.prepare(
        "INSERT INTO menu(id,group_id,code,name,price,images,today_special,dashboard_fav) VALUES(?,?,?,?,?,?,?,?)",
      ).run(
        item.id,
        item.groupId,
        item.code,
        item.name,
        item.price,
        JSON.stringify(item.images),
        Number(item.todaySpecial),
        Number(item.dashboardFav),
      );
  });
}
