import { test } from "node:test";
import assert from "node:assert/strict";
import { totals, qrUrl, normalizeRestaurantConfig } from "../shared/domain.js";
test("inclusive CGST/SGST splits ₹105 into ₹100 + ₹2.50 + ₹2.50", () =>
  assert.deepEqual(totals([{ price: 10500, quantity: 1 }], 2.5, 2.5, true), {
    subtotal: 10500,
    taxable: 10000,
    gst: 500,
    cgst: 250,
    sgst: 250,
    total: 10500,
  }));
test("exclusive CGST/SGST adds ₹2.50 + ₹2.50 to ₹100", () =>
  assert.deepEqual(totals([{ price: 10000, quantity: 1 }], 2.5, 2.5, false), {
    subtotal: 10000,
    taxable: 10000,
    gst: 500,
    cgst: 250,
    sgst: 250,
    total: 10500,
  }));
test("multiple quantities and paise reconcile exactly", () => {
  const t = totals(
    [
      { price: 9999, quantity: 3 },
      { price: 1001, quantity: 2 },
    ],
    2.5,
    2.5,
    true,
  );
  assert.equal(t.taxable + t.gst, t.total);
  assert.equal(t.taxable + t.cgst + t.sgst, t.total);
  assert.equal(t.total, 31999);
});
test("zero GST does not change the amount", () =>
  assert.equal(totals([{ price: 11000, quantity: 1 }], 0, 0, false).gst, 0));
test("unequal rates are calculated separately", () => {
  for (const inclusive of [true, false]) {
    const result = totals(
      [{ price: inclusive ? 10800 : 10000, quantity: 1 }],
      3,
      5,
      inclusive,
    );
    assert.equal(result.cgst, 300);
    assert.equal(result.sgst, 500);
    assert.equal(result.total, 10800);
  }
});
test("zero CGST and nonzero SGST are supported", () => {
  const result = totals([{ price: 10500, quantity: 1 }], 0, 5, true);
  assert.equal(result.cgst, 0);
  assert.equal(result.sgst, 500);
  assert.equal(result.taxable, 10000);
});
test("included tax rounding always reconciles to paise", () => {
  for (let price = 1; price < 1000; price++) {
    const result = totals([{ price, quantity: 1 }], 2.5, 2.5, true);
    assert.equal(result.taxable + result.cgst + result.sgst, price);
    assert.equal(result.gst, result.cgst + result.sgst);
  }
});
test("legacy current settings adopt the new defaults without touching snapshots", () => {
  const legacy = { name: "Cafe77", gstRate: 10, gstInclusive: false };
  const updated = normalizeRestaurantConfig(legacy);
  assert.equal(updated.cgstRate, 2.5);
  assert.equal(updated.sgstRate, 2.5);
  assert.equal(updated.gstInclusive, false);
  assert.equal("gstRate" in updated, false);
  assert.equal(legacy.gstRate, 10);
  assert.equal(
    normalizeRestaurantConfig({ ...legacy, cgstRate: 0, sgstRate: 4 }).cgstRate,
    0,
  );
});
test("short QR URL retains existing query and replaces table parameter", () =>
  assert.equal(
    qrUrl("https://c77.example/order?source=qr&table=old", "safe-token"),
    "https://c77.example/order?source=qr&table=safe-token",
  ));
test("unsafe QR schemes rejected", () =>
  assert.throws(() => qrUrl("javascript:alert(1)", "table")));
