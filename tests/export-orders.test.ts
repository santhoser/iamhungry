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
    amounts: { total: 10500, gst: 500 },
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
    "GST (INR)",
    "Date and time (IST)",
    "Status",
  ])
    assert.ok(sheet.includes(label));
  assert.match(
    sheet,
    /<c r="C2" t="inlineStr"><is><t>=HYPERLINK\(&quot;bad&quot;\) &amp; &lt;Guest&gt;<\/t><\/is><\/c>/,
  );
  assert.match(sheet, /<c r="E2"><v>105<\/v><\/c>/);
  assert.match(sheet, /<c r="F2"><v>5<\/v><\/c>/);
  assert.match(sheet, /2026/);
});
