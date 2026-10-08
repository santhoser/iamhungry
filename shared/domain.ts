export type Role = "owner" | "cashier";
export type Status =
  "New" | "Accepted" | "InProgress" | "Ready" | "Closed" | "Cancelled";
export const transitions: Record<Status, Status[]> = {
  New: ["Accepted", "InProgress", "Cancelled"],
  Accepted: ["InProgress", "Ready", "Cancelled"],
  InProgress: ["Ready", "Cancelled"],
  Ready: ["Closed", "Cancelled"],
  Cancelled: ["New"],
  Closed: [],
};
export const statusLabel = (s: Status) =>
  s === "InProgress" ? "In progress" : s;
export interface Restaurant {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  gstin: string;
  gstRate: number;
  gstInclusive: boolean;
  currency: string;
  timezone: string;
  logo: string;
  qrBaseUrl: string;
  menuCodeSearch: boolean;
  upiEnabled: boolean;
  receiptFooter: string;
}
export interface Group {
  id: number;
  name: string;
  image: string;
  active: boolean;
  sort: number;
  linkedItemCount?: number;
}
export interface MenuItem {
  id: number;
  groupId: number;
  code: string;
  name: string;
  price: number;
  details: string;
  images: string[];
  video: string;
  active: boolean;
  ranOut: boolean;
  todaySpecial: boolean;
  dashboardFav: boolean;
}
export interface Totals {
  subtotal: number;
  taxable: number;
  gst: number;
  total: number;
}
export function totals(
  lines: { price: number; quantity: number }[],
  rate: number,
  inclusive: boolean,
): Totals {
  const subtotal = lines.reduce((sum, x) => sum + x.price * x.quantity, 0);
  const basisPoints = Math.round(rate * 100);
  const gst = inclusive
    ? Math.round((subtotal * basisPoints) / (10000 + basisPoints))
    : Math.round((subtotal * basisPoints) / 10000);
  return {
    subtotal,
    taxable: inclusive ? subtotal - gst : subtotal,
    gst,
    total: inclusive ? subtotal : subtotal + gst,
  };
}
export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
export function qrUrl(base: string, token: string) {
  const url = new URL(base);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Use an HTTP or HTTPS QR URL");
  url.searchParams.set("table", token);
  return url.toString();
}
export interface OrderLine {
  itemId: number;
  code: string;
  name: string;
  price: number;
  quantity: number;
}
export interface Order {
  id: number;
  number: string;
  tableNumber: number;
  name: string;
  email: string;
  phone: string;
  status: Status;
  createdAt: string;
  closedAt: string | null;
  version: number;
  paid: number;
  refunded: number;
  amounts: Totals;
  restaurant: Restaurant;
  items: OrderLine[];
  events: {
    status: string;
    previous: string | null;
    reason: string;
    actor: string;
    at: string;
  }[];
  payments: { kind: string; amount: number; actor: string; at: string }[];
}
