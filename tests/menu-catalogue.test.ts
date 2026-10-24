import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { openDatabase, seed } from "../server/db.js";
import catalogue from "../shared/menu-catalogue.json";

test("fresh SQLite and D1 baseline have the complete identical Excel catalogue", () => {
  const local = openDatabase(":memory:");
  const d1 = new DatabaseSync(":memory:");
  try {
    seed(local);
    d1.exec("PRAGMA foreign_keys=ON");
    assert.deepEqual(readdirSync("migrations"), [
      "0001_cafe77.sql",
      "0002_order_checkout.sql",
    ]);
    d1.exec(readFileSync("migrations/0001_cafe77.sql", "utf8"));
    d1.exec(readFileSync("migrations/0002_order_checkout.sql", "utf8"));
    const select =
      "SELECT id,group_id,code,name,price,images,today_special,dashboard_fav,active,ran_out FROM menu ORDER BY id";
    assert.deepEqual(local.prepare(select).all(), d1.prepare(select).all());
    assert.equal(catalogue.items.length, 228);
    assert.equal(catalogue.groups.length, 25);
    assert.deepEqual(
      d1
        .prepare(select)
        .all()
        .map((row) => ({
          id: row.id,
          groupId: row.group_id,
          code: row.code,
          name: row.name,
          price: row.price,
          images: JSON.parse(String(row.images)),
          todaySpecial: Boolean(row.today_special),
          dashboardFav: Boolean(row.dashboard_fav),
        })),
      catalogue.items,
    );
    assert.deepEqual(
      local
        .prepare(
          "SELECT id,name,image,sort,counter_only,customer_visible FROM groups ORDER BY sort",
        )
        .all(),
      d1
        .prepare(
          "SELECT id,name,image,sort,counter_only,customer_visible FROM groups ORDER BY sort",
        )
        .all(),
    );
    for (const db of [local, d1]) {
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      assert.equal(db.prepare("SELECT count(*) AS n FROM users").get()?.n, 0);
      assert.equal(
        db.prepare("SELECT count(DISTINCT token) AS n FROM tables").get()?.n,
        15,
      );
      assert.equal(
        db.prepare("SELECT count(*) AS n FROM menu WHERE today_special=1").get()
          ?.n,
        8,
      );
      assert.equal(
        db.prepare("SELECT count(*) AS n FROM menu WHERE dashboard_fav=1").get()
          ?.n,
        12,
      );
    }
    const settings = JSON.parse(
      String(
        d1.prepare("SELECT value FROM settings WHERE key='restaurant'").get()
          ?.value,
      ),
    );
    assert.equal(settings.cgstRate, 2.5);
    assert.equal(settings.sgstRate, 2.5);
    assert.equal(settings.upiEnabled, false);
    for (const item of catalogue.items) {
      assert.ok(Number.isSafeInteger(item.price));
      for (const image of item.images)
        assert.ok(existsSync("public" + image), image);
    }
    // Restart must retain owner changes, rather than restoring workbook defaults.
    local.prepare("UPDATE menu SET price=12345 WHERE id=1").run();
    seed(local);
    assert.equal(
      local.prepare("SELECT price FROM menu WHERE id=1").get()?.price,
      12345,
    );
    assert.equal(local.prepare("SELECT count(*) AS n FROM menu").get()?.n, 228);
  } finally {
    local.close();
    d1.close();
  }
});
