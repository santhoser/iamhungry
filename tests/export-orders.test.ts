import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { buildOrderWorkbook } from "../src/export-orders.js";
import type { Order } from "../shared/domain.js";

test("Excel export contains every requested column and treats customer text as text", () => {
  const order = {
    number: "c77-test",
    tableNumber: 1,
    name: '=HYPERLINK("bad") & <Guest>',
    items: [{ quantity: 2 }],
    orderType: "TakeAway",
    paymentMode: "UPI",
    amounts: { total: 10500, gst: 500, cgst: 250, sgst: 250 },
    createdAt: "2026-10-15T00:00:00.000Z",
    status: "Closed",
  } as Order;
  const files = unzipSync(buildOrderWorkbook([order]));
  assert.ok(files["xl/workbook.xml"]);
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  for (const label of [
    "Order ID",
    "Table no",
    "Name",
    "Number of items",
    "Total amount (INR)",
    "CGST (INR)",
    "SGST (INR)",
    "Payment mode",
    "Order type",
    "Date and time (IST)",
    "Status",
  ])
    assert.ok(sheet.includes(label));
  assert.match(
    sheet,
    /<c r="C2" t="inlineStr"><is><t>=HYPERLINK\(&quot;bad&quot;\) &amp; &lt;Guest&gt;<\/t><\/is><\/c>/,
  );
  assert.match(sheet, /<c r="E2"><v>105<\/v><\/c>/);
  assert.match(sheet, /<c r="F2"><v>2.5<\/v><\/c>/);
  assert.match(sheet, /<c r="G2"><v>2.5<\/v><\/c>/);
  assert.ok(!sheet.includes("<t>GST (INR)</t>"));
  assert.match(sheet, /2026/);
});

test("history export labels Preparing and does not invent historical split tax", () => {
  const legacy = {
    number: "old",
    tableNumber: 1,
    name: "Historical",
    items: [],
    amounts: { total: 11000, gst: 1000 },
    createdAt: "2026-10-01T00:00:00Z",
    status: "InProgress",
    orderType: "DineIn",
    paymentMode: null,
  } as unknown as Order;
  const sheet = strFromU8(
    unzipSync(buildOrderWorkbook([legacy]))["xl/worksheets/sheet1.xml"],
  );
  assert.ok(sheet.includes("<t>Preparing</t>"));
  assert.match(sheet, /<c r="F2" t="inlineStr"><is><t><\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="G2" t="inlineStr"><is><t><\/t><\/is><\/c>/);
});
