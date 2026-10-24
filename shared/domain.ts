export type Role = "admin" | "owner" | "cashier";
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
  s === "InProgress" ? "Preparing" : s;
export type PaymentMode = "Cash" | "UPI";
export type OrderType = "DineIn" | "TakeAway";
export const orderTypeLabel = (type: OrderType) =>
  type === "TakeAway" ? "Take-away" : "Dine-in";
export interface Restaurant {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  gstin: string;
  cgstRate: number;
  sgstRate: number;
  gstRate?: number; // Legacy order snapshots only.
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
  counterOnly: boolean;
  customerVisible: boolean;
  linkedItemCount?: number;
}
export interface Tag {
  id: number;
  name: string;
  image: string;
}
export interface MenuItem {
  id: number;
  groupId: number;
  code: string;
  name: string;
  price: number;
  details: string;
  calories: string;
  showCalories: boolean;
  ingredients: string;
  showIngredients: boolean;
  images: string[];
  video: string;
  active: boolean;
  ranOut: boolean;
  todaySpecial: boolean;
  dashboardFav: boolean;
  tags: Tag[];
}
export interface Totals {
  subtotal: number;
  taxable: number;
  gst: number;
  cgst: number;
  sgst: number;
  total: number;
}
export function totals(
  lines: { price: number; quantity: number }[],
  cgstRate: number,
  sgstRate: number,
  inclusive: boolean,
): Totals {
  const subtotal = lines.reduce((sum, x) => sum + x.price * x.quantity, 0);
  const cgstPoints = Math.round(cgstRate * 100);
  const sgstPoints = Math.round(sgstRate * 100);
  const basisPoints = cgstPoints + sgstPoints;
  const includedTax = Math.round(
    (subtotal * basisPoints) / (10000 + basisPoints),
  );
  const cgst = inclusive
    ? basisPoints
      ? Math.round((includedTax * cgstPoints) / basisPoints)
      : 0
    : Math.round((subtotal * cgstPoints) / 10000);
  const sgst = inclusive
    ? includedTax - cgst
    : Math.round((subtotal * sgstPoints) / 10000);
  const gst = cgst + sgst;
  return {
    subtotal,
    taxable: inclusive ? subtotal - gst : subtotal,
    gst,
    cgst,
    sgst,
    total: inclusive ? subtotal : subtotal + gst,
  };
}
// New settings default to 2.5% each; do not apply this to historical order snapshots.
export function normalizeRestaurantConfig(
  raw: Record<string, unknown>,
): Restaurant {
  const { gstRate: _legacyRate, ...settings } = raw;
  return {
    ...settings,
    cgstRate: raw.cgstRate ?? 2.5,
    sgstRate: raw.sgstRate ?? 2.5,
  } as Restaurant;
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
  custom?: boolean;
}
export interface CustomOrderItem {
  name: string;
  price: number; // Integer paise.
  quantity: number;
}
export interface MenuHistoryEntry {
  id: number;
  menuItemId: number;
  itemCode: string;
  itemName: string;
  changedAt: string;
  actor: string;
  changeType: "created" | "updated" | "stock" | "deleted";
  systemComments: string;
  userComments: string;
  isPriceChange: boolean;
  oldPrice: number | null;
  newPrice: number | null;
  oldRanOut: boolean | null;
  newRanOut: boolean | null;
  oldTodaySpecial: boolean | null;
  newTodaySpecial: boolean | null;
  oldDashboardFav: boolean | null;
  newDashboardFav: boolean | null;
  oldActive: boolean | null;
  newActive: boolean | null;
  before: MenuItem | null;
  after: MenuItem | null;
}
export interface Order {
  orderType: OrderType;
  paymentMode: PaymentMode | null;
  id: number;
  number: string;
  trackingToken: string;
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
  payments: {
    kind: string;
    amount: number;
    actor: string;
    at: string;
    mode?: PaymentMode | null;
  }[];
  messages: {
    id: number;
    sender: "customer" | "staff";
    text: string;
    at: string;
    readAt: string | null;
  }[];
}
