import { test } from "node:test";
import assert from "node:assert/strict";
import { totals, qrUrl } from "../shared/domain.js";
test("inclusive GST splits ₹110 into ₹100 + ₹10", () =>
  assert.deepEqual(totals([{ price: 11000, quantity: 1 }], 10, true), {
    subtotal: 11000,
    taxable: 10000,
    gst: 1000,
    total: 11000,
  }));
test("exclusive GST adds ₹11 to ₹110", () =>
  assert.deepEqual(totals([{ price: 11000, quantity: 1 }], 10, false), {
    subtotal: 11000,
    taxable: 11000,
    gst: 1100,
    total: 12100,
  }));
test("multiple quantities and paise reconcile exactly", () => {
  const t = totals(
    [
      { price: 9999, quantity: 3 },
      { price: 1001, quantity: 2 },
    ],
    10,
    true,
  );
  assert.equal(t.taxable + t.gst, t.total);
  assert.equal(t.total, 31999);
});
test("zero GST does not change the amount", () =>
  assert.equal(totals([{ price: 11000, quantity: 1 }], 0, false).gst, 0));
test("short QR URL retains existing query and replaces table parameter", () =>
  assert.equal(
    qrUrl("https://c77.example/order?source=qr&table=old", "safe-token"),
    "https://c77.example/order?source=qr&table=safe-token",
  ));
test("unsafe QR schemes rejected", () =>
  assert.throws(() => qrUrl("javascript:alert(1)", "table")));
