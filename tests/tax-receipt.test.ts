import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TaxLines from "../src/TaxLines.js";
import { totals, type Restaurant } from "../shared/domain.js";

test("receipts render separate default components", () => {
  const restaurant = {
    cgstRate: 2.5,
    sgstRate: 2.5,
    gstInclusive: true,
  } as Restaurant;
  const html = renderToStaticMarkup(
    createElement(TaxLines, {
      restaurant,
      amounts: totals([{ price: 10500, quantity: 1 }], 2.5, 2.5, true),
    }),
  );
  assert.match(html, /CGST 2.5% \(included\)/);
  assert.match(html, /SGST 2.5% \(included\)/);
  assert.equal((html.match(/₹2.50/g) || []).length, 2);
});
test("historical combined GST receipts retain the original tax label and amount", () => {
  const html = renderToStaticMarkup(
    createElement(TaxLines, {
      restaurant: { gstRate: 10, gstInclusive: true } as Restaurant,
      amounts: {
        subtotal: 11000,
        taxable: 10000,
        gst: 1000,
        total: 11000,
      } as ReturnType<typeof totals>,
    }),
  );
  assert.match(html, />GST 10% \(included\)/);
  assert.match(html, /₹10.00/);
  assert.doesNotMatch(html, /CGST|SGST/);
});
