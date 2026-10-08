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
  return JSON.parse(readFileSync(configPath, "utf8"));
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
    CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS events_order ON events(order_id);
    CREATE INDEX IF NOT EXISTS payments_order ON payments(order_id);
    CREATE INDEX IF NOT EXISTS items_order ON order_items(order_id);
  `);
  // Upgrade existing local databases without removing historical rows.
  transaction(db, () => {
    for (const table of ["tables", "groups", "menu"]) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all();
      if (!columns.some((column) => column.name === "deleted_at")) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
      }
    }
    db.exec("CREATE INDEX IF NOT EXISTS menu_group ON menu(group_id)");
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
    [
      "Coffee & tea",
      "Small plates",
      "Cafe favourites",
      "Something sweet",
      "Coolers",
    ].forEach((name, i) =>
      db.prepare("INSERT INTO groups(name,sort) VALUES(?,?)").run(name, i),
    );
    const items: [
      number,
      string,
      string,
      number,
      string,
      string,
      number,
      number,
    ][] = [
      [
        1,
        "C01",
        "Filter coffee",
        80,
        "Freshly brewed, rich and comforting. A little pause in your day.",
        "coffee",
        1,
        1,
      ],
      [
        1,
        "C02",
        "Cappuccino",
        140,
        "A double espresso with silky steamed milk and a soft foam finish.",
        "coffee",
        0,
        0,
      ],
      [
        1,
        "C03",
        "Masala chai",
        60,
        "Our warming blend of tea, milk and fragrant Indian spices.",
        "tea",
        0,
        1,
      ],
      [
        2,
        "S01",
        "Chilli cheese toast",
        150,
        "Golden toast, melted cheese and a gentle chilli kick.",
        "toast",
        1,
        0,
      ],
      [
        2,
        "S02",
        "Classic French fries",
        120,
        "Crisp, golden fries, lightly salted and served with a dip.",
        "fries",
        0,
        0,
      ],
      [
        2,
        "S03",
        "Paneer bites",
        180,
        "Tender paneer, a crisp coating and a tangy house dip.",
        "paneer",
        0,
        0,
      ],
      [
        3,
        "F01",
        "Grilled paneer sandwich",
        220,
        "Grilled paneer, fresh vegetables and our house dressing.",
        "sandwich",
        1,
        1,
      ],
      [
        3,
        "F02",
        "Creamy white sauce pasta",
        240,
        "Pasta tossed in a creamy sauce with seasonal vegetables.",
        "pasta",
        0,
        0,
      ],
      [
        3,
        "F03",
        "Garden veggie burger",
        190,
        "A hearty vegetable patty, crunchy greens and a soft bun.",
        "burger",
        0,
        0,
      ],
      [
        4,
        "D01",
        "Chocolate brownie",
        160,
        "Rich chocolate, a fudgy centre and a beautifully crisp top.",
        "brownie",
        1,
        1,
      ],
      [
        4,
        "D02",
        "Cake of the day",
        180,
        "A little slice of happiness from the house of Cake Dew.",
        "cake",
        0,
        0,
      ],
      [
        5,
        "B01",
        "Fresh lime soda",
        100,
        "Fresh lime, bubbles and your choice of sweet or salted.",
        "lime",
        0,
        0,
      ],
    ];
    for (const [group, code, name, rupees, details, art, special, fav] of items)
      db.prepare(
        "INSERT INTO menu(group_id,code,name,price,details,images,today_special,dashboard_fav) VALUES(?,?,?,?,?,?,?,?)",
      ).run(
        group,
        code,
        name,
        rupees * 100,
        details,
        JSON.stringify(["/illustrations/" + art + ".svg"]),
        special,
        fav,
      );
  });
}
