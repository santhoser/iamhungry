import { randomInt } from "node:crypto";

// Use restaurant time and a 24-hour clock, independent of the host timezone.
export function orderTimestamp(date: Date): string {
  const india = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    pad(india.getUTCFullYear() % 100) +
    pad(india.getUTCMonth() + 1) +
    pad(india.getUTCDate()) +
    pad(india.getUTCHours()) +
    pad(india.getUTCMinutes()) +
    pad(india.getUTCSeconds()) +
    pad(india.getUTCMilliseconds(), 3)
  );
}

export function generateOrderNumber(date = new Date()): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const suffix = Array.from(
    { length: 4 },
    () => alphabet[randomInt(alphabet.length)],
  ).join("");
  return `c77-${orderTimestamp(date)}-${suffix}`;
}
