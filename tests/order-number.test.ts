import { test } from "node:test";
import assert from "node:assert/strict";
import { generateOrderNumber, orderTimestamp } from "../server/order-number.js";

test("order timestamp uses India time, 24-hour clock and 3-digit milliseconds", () => {
  assert.equal(
    orderTimestamp(new Date("2026-10-03T16:27:08.009Z")),
    "261003215708009",
  );
});
test("India timestamp rolls into the next day and year", () => {
  assert.equal(
    orderTimestamp(new Date("2026-12-31T18:30:00.000Z")),
    "270101000000000",
  );
});
test("generated order number has the requested prefix, timestamp and alphanumeric suffix", () => {
  assert.match(
    generateOrderNumber(new Date("2026-10-03T16:27:08.123Z")),
    /^c77-261003215708123-[A-Z0-9]{4}$/,
  );
});
