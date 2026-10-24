import TaxLines from "./TaxLines";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  History,
  UtensilsCrossed,
  QrCode,
  Settings,
  Users,
  LogOut,
  Plus,
  Minus,
  Check,
  X,
  ArrowRight,
  Search,
  Printer,
  ChevronLeft,
  ChevronRight,
  Menu as MenuIcon,
  Upload,
  RefreshCw,
  IndianRupee,
  ShoppingBag,
  Clock,
  MessageCircle,
  Download,
} from "lucide-react";
import QRCode from "qrcode";
import { api } from "./api";
import { useOrderAlerts } from "./useOrderAlerts";
import { exportHistory } from "./export-orders";
import { exportMenuHistory } from "./export-menu-history";
import { Brand, Receipt, indianTime } from "./App";
import ConfirmDialog, { type Confirmation } from "./ConfirmDialog";
import {
  money,
  qrUrl,
  statusLabel,
  orderTypeLabel,
  type OrderType,
  type PaymentMode,
  transitions,
  type Group,
  type MenuItem,
  type Tag,
  type MenuHistoryEntry,
  type CustomOrderItem,
  type Order,
  type Restaurant,
  type Role,
} from "../shared/domain";
type Staff = { id: number; username: string; role: Role };
type Tab =
  | "dashboard"
  | "orders"
  | "history"
  | "menu"
  | "menuReports"
  | "qr"
  | "settings"
  | "users";
const blankItem: MenuItem = {
  id: 0,
  groupId: 1,
  code: "",
  name: "",
  price: 0,
  details: "",
  calories: "",
  showCalories: false,
  ingredients: "",
  showIngredients: false,
  images: [],
  video: "",
  active: true,
  ranOut: false,
  todaySpecial: false,
  dashboardFav: false,
  tags: [],
};
const today = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
function presetRange(preset: string) {
  const end = today();
  const date = new Date(end + "T00:00:00Z");
  if (preset === "7days") date.setUTCDate(date.getUTCDate() - 6);
  if (preset === "month") date.setUTCDate(1);
  if (preset === "year") {
    date.setUTCMonth(0);
    date.setUTCDate(1);
  }
  return { from: date.toISOString().slice(0, 10), to: end };
}
function Toggle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="toggle-label">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="toggle" />
    </label>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  );
}
const nav = [
  { id: "dashboard", name: "Overview", icon: LayoutDashboard, owner: true },
  { id: "orders", name: "Current orders", icon: ClipboardList },
  { id: "history", name: "Order history", icon: History },
  { id: "menu", name: "Manage menu", icon: UtensilsCrossed },
  { id: "qr", name: "Table QR codes", icon: QrCode, owner: true },
  { id: "users", name: "Staff accounts", icon: Users, owner: true },
  { id: "settings", name: "Restaurant settings", icon: Settings, owner: true },
] as const;

export default function Admin() {
  const [user, setUser] = useState<Staff | null>(null);
  const [config, setConfig] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("orders");
  const { soundEnabled, soundError, toggleSound } = useOrderAlerts(
    !!user && tab === "orders",
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [login, setLogin] = useState({ username: "", password: "" });
  const setupToken = new URLSearchParams(location.search).get("setup");
  const setupAdminToken = new URLSearchParams(location.search).get(
    "setup-admin",
  );
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [historyPaymentMode, setHistoryPaymentMode] = useState("");
  const [closing, setClosing] = useState(false);
  const [closePaymentMode, setClosePaymentMode] = useState<PaymentMode | "">(
    "",
  );
  const [counterOrderType, setCounterOrderType] = useState<OrderType>("DineIn");
  const [historyStatuses, setHistoryStatuses] = useState<string[]>([]);
  const [range, setRange] = useState(presetRange("today"));
  const [preset, setPreset] = useState("today");
  const [selected, setSelected] = useState<Order | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);
  const [counter, setCounter] = useState({
    table: 1,
    name: "",
    email: "",
    phone: "",
  });
  const [counterItems, setCounterItems] = useState<Record<number, number>>({});
  const [counterCustom, setCounterCustom] = useState<CustomOrderItem[]>([]);
  const [customDraft, setCustomDraft] = useState({
    name: "",
    price: "",
    quantity: 1,
  });
  const [appendOrder, setAppendOrder] = useState<Order | null>(null);
  const [counterRequestKey, setCounterRequestKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [counterMenu, setCounterMenu] = useState<MenuItem[]>([]);
  const [counterSearch, setCounterSearch] = useState("");
  const counterSearchRef = useRef<HTMLInputElement>(null);
  const counterMatches = counterSearch.trim()
    ? counterMenu
        .filter((item) =>
          `${item.code} ${item.name}`
            .toLowerCase()
            .includes(counterSearch.trim().toLowerCase()),
        )
        .sort(
          (a, b) =>
            Number(
              b.code.toLowerCase() === counterSearch.trim().toLowerCase(),
            ) -
            Number(a.code.toLowerCase() === counterSearch.trim().toLowerCase()),
        )
        .slice(0, 10)
    : [];
  const [messageText, setMessageText] = useState("");
  const addCounterItem = (id: number) => {
    setCounterItems((items) => ({
      ...items,
      [id]: Math.min(50, (items[id] || 0) + 1),
    }));
    setCounterSearch("");
    counterSearchRef.current?.focus();
  };
  const [reason, setReason] = useState("");
  const [receipt, setReceipt] = useState<Order | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [menu, setMenu] = useState<{
    items: MenuItem[];
    groups: Group[];
    tags: Tag[];
  }>({
    items: [],
    groups: [],
    tags: [],
  });
  const [menuSearch, setMenuSearch] = useState("");
  const [menuStock, setMenuStock] = useState("all");
  const [menuActivity, setMenuActivity] = useState("all");
  const [menuSpecialOnly, setMenuSpecialOnly] = useState(false);
  const [menuFavouriteOnly, setMenuFavouriteOnly] = useState(false);
  const menuSearchTerms = menuSearch
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const menuFiltering =
    menuSearchTerms.length > 0 ||
    menuStock !== "all" ||
    menuActivity !== "all" ||
    menuSpecialOnly ||
    menuFavouriteOnly;
  const filteredMenuItems = menu.items.filter((item) => {
    const text =
      `${item.name} ${item.code} ${item.tags.map((tag) => tag.name).join(" ")}`.toLocaleLowerCase();
    return (
      menuSearchTerms.every((term) => text.includes(term)) &&
      (menuStock === "all" || item.ranOut === (menuStock === "out")) &&
      (menuActivity === "all" || item.active === (menuActivity === "active")) &&
      (!menuSpecialOnly || item.todaySpecial) &&
      (!menuFavouriteOnly || item.dashboardFav)
    );
  });
  const filteredMenuGroups = menu.groups.filter(
    (group) =>
      !menuFiltering ||
      filteredMenuItems.some((item) => item.groupId === group.id),
  );
  const clearMenuFilters = () => {
    setMenuSearch("");
    setMenuStock("all");
    setMenuActivity("all");
    setMenuSpecialOnly(false);
    setMenuFavouriteOnly(false);
  };
  const [tagsOpen, setTagsOpen] = useState(false);
  const [editTag, setEditTag] = useState<Tag | null>(null);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [menuUserComments, setMenuUserComments] = useState("");
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [menuHistory, setMenuHistory] = useState<MenuHistoryEntry[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyFilters, setHistoryFilters] = useState<string[]>([]);
  const [dash, setDash] = useState<any>(null);
  const [tables, setTables] = useState<
    { number: number; token: string; active: number }[]
  >([]);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [tableInput, setTableInput] = useState("16");
  const [printTable, setPrintTable] = useState("all");
  const [staffUsers, setStaffUsers] = useState<any[]>([]);
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "cashier",
  });
  useEffect(() => {
    Promise.all([
      api("/menu").then((d) => setConfig(d.config)),
      api<Staff>("/auth/me")
        .then((u) => {
          setUser(u);
          setTab(u.role === "cashier" ? "orders" : "dashboard");
        })
        .catch(() => {}),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function run(work: () => Promise<void>, message = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      if (message) setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    if (!user) return;
    const params = new URLSearchParams({
      page: String(page),
      q: query,
      ...(tab === "history" ? range : {}),
      ...(tab === "history" && historyStatuses.length
        ? { statuses: historyStatuses.join(",") }
        : {}),
      ...(tab === "history" && historyPaymentMode
        ? { paymentMode: historyPaymentMode }
        : {}),
      current: String(tab === "orders"),
    });
    if (tab === "orders" || tab === "history") {
      const d = await api("/admin/orders?" + params);
      setOrders(d.orders);
      setTotal(d.total);
    }
    if (tab === "menu") setMenu(await api("/admin/menu"));
    if (tab === "menuReports") {
      const d = await api(
        "/admin/menu/history?" +
          new URLSearchParams({
            ...range,
            q: query,
            filters: historyFilters.join(","),
            page: String(page),
          }),
      );
      setMenuHistory(d.entries);
      setHistoryTotal(d.total);
    }
    if (tab === "dashboard")
      setDash(await api("/admin/dashboard?" + new URLSearchParams(range)));
    if (tab === "qr") setTables(await api("/admin/tables"));
    if (tab === "settings") setConfig(await api("/admin/config"));
    if (tab === "users") setStaffUsers(await api("/admin/users"));
  }
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (alive) load().catch((e) => alive && setError(e.message));
    };
    refresh();
    const live = user && tab === "orders";
    const timer = live ? setInterval(refresh, 5000) : null;
    const events = live ? new EventSource("/api/admin/events") : null;
    events?.addEventListener("change", refresh);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      events?.close();
    };
  }, [
    user,
    tab,
    page,
    query,
    range.from,
    range.to,
    historyFilters.join(","),
    historyPaymentMode,
    historyStatuses.join(","),
  ]);
  useEffect(() => {
    if (!selected || tab !== "orders") return;
    let alive = true;
    const id = selected.id;
    const refresh = async () => {
      try {
        let order = await api<Order>("/admin/orders/" + id);
        if (!alive) return;
        if (
          order.messages.some(
            (message) => message.sender === "customer" && !message.readAt,
          )
        ) {
          await api(`/admin/orders/${id}/messages/read`, "POST", {});
          order = await api<Order>("/admin/orders/" + id);
          await load();
        }
        if (alive) setSelected(order);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selected?.id, tab]);
  useEffect(() => {
    if (!config || !tables.length) return;
    let alive = true;
    Promise.all(
      tables.map(
        async (t) =>
          [
            t.token,
            await QRCode.toDataURL(qrUrl(config.qrBaseUrl, t.token), {
              width: 280,
              margin: 2,
              errorCorrectionLevel: "M",
              color: { dark: "#30201c", light: "#ffffff" },
            }),
          ] as const,
      ),
    )
      .then((values) => alive && setQrImages(Object.fromEntries(values)))
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
    };
  }, [tables, config?.qrBaseUrl]);
  function navigate(id: Tab) {
    setTab(id);
    setPage(1);
    setQuery("");
    setError("");
    setNotice("");
    setMenuOpen(false);
  }
  const dateControls = (
    <div className="date-controls">
      <select
        aria-label="Date preset"
        value={preset}
        onChange={(e) => {
          setPreset(e.target.value);
          setPage(1);
          if (e.target.value !== "custom")
            setRange(presetRange(e.target.value));
        }}
      >
        <option value="today">Today</option>
        <option value="7days">Last 7 days</option>
        <option value="month">Month to date</option>
        <option value="year">Year to date</option>
        <option value="custom">Custom dates</option>
      </select>
      <input
        type="date"
        aria-label="Start date"
        value={range.from}
        onChange={(e) => {
          setPreset("custom");
          setPage(1);
          setRange((r) => ({ ...r, from: e.target.value }));
        }}
      />
      <span>to</span>
      <input
        type="date"
        aria-label="End date"
        value={range.to}
        onChange={(e) => {
          setPreset("custom");
          setPage(1);
          setRange((r) => ({ ...r, to: e.target.value }));
        }}
      />
    </div>
  );
  const addCustomItem = () => {
    const name = customDraft.name.trim();
    if (
      !name ||
      !/^\d+(\.\d{1,2})?$/.test(customDraft.price) ||
      Number(customDraft.price) > 100000 ||
      !Number.isInteger(customDraft.quantity) ||
      customDraft.quantity < 1 ||
      customDraft.quantity > 50
    )
      return setError(
        "Enter a custom item name, a valid price (up to ₹100,000), and a quantity from 1 to 50.",
      );
    if (counterCustom.length >= 10)
      return setError("Add at most 10 custom items.");
    setCounterCustom((items) => [
      ...items,
      {
        name,
        price: Math.round(Number(customDraft.price) * 100),
        quantity: customDraft.quantity,
      },
    ]);
    setCustomDraft({ name: "", price: "", quantity: 1 });
    setError("");
  };
  const customItemsEditor = (
    <section className="counter-selected">
      <h3>Custom items and fees</h3>
      <div className="form-grid">
        <Field label="Item or fee name">
          <input
            maxLength={100}
            value={customDraft.name}
            onChange={(e) =>
              setCustomDraft((d) => ({ ...d, name: e.target.value }))
            }
            placeholder="e.g. Parcel fee"
          />
        </Field>
        <Field label="Price (₹)">
          <input
            type="number"
            min={0}
            max={100000}
            step="0.01"
            value={customDraft.price}
            onChange={(e) =>
              setCustomDraft((d) => ({ ...d, price: e.target.value }))
            }
          />
        </Field>
        <Field label="Quantity">
          <input
            type="number"
            min={1}
            max={50}
            value={customDraft.quantity}
            onChange={(e) =>
              setCustomDraft((d) => ({
                ...d,
                quantity: Number(e.target.value),
              }))
            }
          />
        </Field>
      </div>
      <button className="btn secondary" type="button" onClick={addCustomItem}>
        <Plus size={15} /> Add custom item
      </button>
      {counterCustom.map((item, index) => (
        <div className="counter-selected-row" key={index}>
          <span>
            {item.quantity} × {item.name} · {money(item.price)}
          </span>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setCounterCustom((items) => items.filter((_, n) => n !== index))
            }
          >
            Remove
          </button>
        </div>
      ))}
    </section>
  );
  if (loading || !config)
    return (
      <div className="loading">
        <Clock />
        <p>{error || "Opening Cafe77…"}</p>
      </div>
    );
  if (!user)
    return (
      <main className="login-page">
        <section className="login-brand">
          <Brand config={config} />
          <span className="eyebrow">BEHIND THE COUNTER</span>
          <h1>
            A good day
            <br />
            starts <em>here.</em>
          </h1>
          <p>A little care in every order.</p>
          <img src="/illustrations/coffee.svg" alt="Cafe77 coffee" />
        </section>
        <section className="login-form">
          <a className="back-link" href="/">
            ← Back to the menu
          </a>
          <span className="eyebrow red">CAFE77 STAFF</span>
          <h2>
            {setupAdminToken
              ? "Welcome, admin"
              : setupToken
                ? "Welcome, owner"
                : "Welcome back"}
          </h2>
          <p>
            {setupAdminToken
              ? "Create the first admin account."
              : setupToken
                ? "Create your first owner account."
                : "Sign in to look after your cafe."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                if (setupToken || setupAdminToken) {
                  await api(
                    setupAdminToken ? "/setup/admin" : "/setup",
                    "POST",
                    { ...login, token: setupAdminToken || setupToken },
                  );
                  history.replaceState(null, "", "/admin");
                }
                const u = await api<Staff>("/auth/login", "POST", login);
                setUser(u);
                setNewUser({ username: "", password: "", role: "cashier" });
                setTab(u.role === "cashier" ? "orders" : "dashboard");
                setLogin({ username: "", password: "" });
              });
            }}
          >
            <Field label="Username">
              <input
                required
                autoComplete="username"
                pattern="[a-zA-Z0-9._-]{3,40}"
                value={login.username}
                onChange={(e) =>
                  setLogin((l) => ({ ...l, username: e.target.value }))
                }
              />
            </Field>
            <Field label="Password">
              <input
                required
                type="password"
                minLength={setupToken || setupAdminToken ? 8 : 1}
                maxLength={128}
                autoComplete={
                  setupToken || setupAdminToken
                    ? "new-password"
                    : "current-password"
                }
                value={login.password}
                onChange={(e) =>
                  setLogin((l) => ({ ...l, password: e.target.value }))
                }
              />
            </Field>
            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}
            <button className="btn full" disabled={busy}>
              {busy
                ? "Please wait…"
                : setupAdminToken
                  ? "Create admin & sign in"
                  : setupToken
                    ? "Create owner & sign in"
                    : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
        </section>
      </main>
    );
  const canManage = user.role !== "cashier";
  const title =
    tab === "menuReports"
      ? "Menu reports"
      : nav.find((n) => n.id === tab)?.name || "";
  const orderAction = (path: string, body: any) =>
    run(async () => {
      const o = await api<Order>(
        "/admin/orders/" + selected!.id + "/" + path,
        "POST",
        { ...body, version: selected!.version },
      );
      setSelected(o);
      setReason("");
      await load();
    }, "Order updated");
  const renderStatusAction = (s: Order["status"]) => (
    <button
      key={s}
      className={
        "btn " +
        (s === "Cancelled" ? "danger" : s === "Closed" ? "" : "secondary")
      }
      disabled={busy}
      onClick={() => {
        if (s === "Closed") {
          setClosePaymentMode(selected!.paymentMode || "");
          setClosing(true);
          return;
        }

        if (
          (s === "Cancelled" || s === "New") &&
          !window.confirm(
            s === "New"
              ? "Reopen this cancelled order? Review availability and payment first."
              : "Cancel this order? Recorded payment is preserved.",
          )
        )
          return;
        orderAction("status", { status: s, reason });
      }}
    >
      {s === "New"
        ? "Reopen order"
        : s === "Closed"
          ? "Complete Order"
          : statusLabel(s)}
    </button>
  );
  const upload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024)
      throw new Error("Choose an image smaller than 2 MB");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return (await api("/admin/uploads", "POST", { data })).url as string;
  };
  return (
    <div className="admin-layout">
      <aside className={"sidebar " + (menuOpen ? "open" : "")}>
        <Brand config={config} small />
        <span className="sidebar-label">YOUR CAFE, AT A GLANCE</span>
        <nav>
          {nav
            .filter((n) => !("owner" in n) || canManage)
            .map((n) => (
              <button
                key={n.id}
                className={tab === n.id ? "active" : ""}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={19} />
                {n.name}
                {tab === n.id && <ChevronRight size={14} />}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <a href="/" target="_blank" rel="noreferrer">
            View customer menu <ArrowRight size={15} />
          </a>
          <div className="staff-badge">
            <span>{user.username.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{user.username}</strong>
              <small>{user.role}</small>
            </div>
            <button
              aria-label="Sign out"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api("/auth/logout", "POST", {});
                  setUser(null);
                  setNewUser({ username: "", password: "", role: "cashier" });
                  setSelected(null);
                })
              }
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <button
            className="mobile-menu"
            aria-label="Open staff navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <MenuIcon />
          </button>
          <span>
            Cafe77 <ChevronRight size={14} /> <strong>{title}</strong>
          </span>
          <a className="table-pill" href="/" target="_blank" rel="noreferrer">
            Customer menu <ArrowRight size={14} />
          </a>
        </header>
        <main className="admin-main">
          <div className="page-heading">
            <div>
              <span className="eyebrow red">
                {tab === "dashboard"
                  ? "A GOOD DAY AT CAFE77"
                  : "BEHIND THE COUNTER"}
              </span>
              <h1>{title}</h1>
              <p>
                {tab === "orders"
                  ? "Fresh orders, ready for your attention."
                  : tab === "menu"
                    ? "A little care goes into every favourite."
                    : tab === "dashboard"
                      ? "Here’s how your cafe is doing."
                      : tab === "qr"
                        ? "A simple scan. A delicious start."
                        : "Keep your cafe running smoothly."}
              </p>
            </div>
            {["orders", "history", "dashboard", "menuReports"].includes(
              tab,
            ) && (
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => run(load)}
              >
                <RefreshCw size={15} /> Refresh
              </button>
            )}
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <Check size={16} />
              {notice}
            </div>
          )}
          {tab === "dashboard" && (
            <>
              {dateControls}
              {dash && (
                <>
                  <div className="stat-grid">
                    {[
                      {
                        label: "Orders placed",
                        value: dash.orders,
                        icon: ShoppingBag,
                        note: `${dash.cancelled} cancelled`,
                      },
                      {
                        label: "Sales",
                        value: money(dash.sales),
                        icon: IndianRupee,
                        note: "Served and paid orders",
                      },
                      {
                        label: "Orders completed",
                        value: dash.closed,
                        icon: Check,
                        note: "Closed during this period",
                      },
                    ].map((s) => (
                      <article className="stat-card" key={s.label}>
                        <div>
                          <span>{s.label}</span>
                          <s.icon size={20} />
                        </div>
                        <strong>{s.value}</strong>
                        <small>{s.note}</small>
                      </article>
                    ))}
                  </div>
                  <div className="dashboard-grid">
                    <section className="panel">
                      <h3>Orders over time</h3>
                      <p className="muted">Orders placed · India time</p>
                      {dash.daily.length ? (
                        <div className="bar-chart">
                          {dash.daily.map((d: any) => (
                            <div key={d.date}>
                              <strong>{d.orders}</strong>
                              <span
                                style={{
                                  height: Math.max(
                                    3,
                                    (140 * d.orders) /
                                      Math.max(
                                        ...dash.daily.map((x: any) => x.orders),
                                        1,
                                      ),
                                  ),
                                }}
                              />
                              <small>{d.date.slice(5)}</small>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty
                          title="Your next good day awaits"
                          text="Order activity will appear here."
                        />
                      )}
                    </section>
                    <section className="panel">
                      <h3>Sales over time</h3>
                      <p className="muted">Closed orders · India time</p>
                      {dash.daily.length ? (
                        <div className="bar-chart sales-chart">
                          {dash.daily.map((d: any) => (
                            <div key={d.date}>
                              <strong>{money(d.sales)}</strong>
                              <span
                                style={{
                                  height: Math.max(
                                    3,
                                    (140 * d.sales) /
                                      Math.max(
                                        ...dash.daily.map((x: any) => x.sales),
                                        1,
                                      ),
                                  ),
                                }}
                              />
                              <small>{d.date.slice(5)}</small>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty
                          title="No sales yet"
                          text="Record payment and close orders to see sales."
                        />
                      )}
                    </section>
                    <section className="panel">
                      <h3>Top menu items</h3>
                      <RankList items={dash.items.slice(0, 8)} />
                    </section>
                    <section className="panel">
                      <h3>Your dashboard favourites</h3>
                      <RankList
                        items={dash.items.filter((i: any) => i.favourite)}
                      />
                    </section>
                  </div>
                </>
              )}
            </>
          )}
          {(tab === "orders" || tab === "history") && (
            <>
              {tab === "history" && (
                <div className="filter-bar">
                  {dateControls}
                  <label className="search">
                    <Search size={16} />
                    <input
                      placeholder="Order ID, name, email or phone"
                      aria-label="Search orders"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(1);
                      }}
                    />
                  </label>
                  <Field label="Payment mode filter">
                    <select
                      aria-label="Payment mode filter"
                      value={historyPaymentMode}
                      onChange={(e) => {
                        setHistoryPaymentMode(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All payment modes</option>
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Unknown">Not recorded / unpaid</option>
                    </select>
                  </Field>
                  <div
                    className="order-status-filters"
                    aria-label="Order status filters"
                  >
                    {(["Closed", "Cancelled"] as const).map((status) => (
                      <label key={status}>
                        <input
                          type="checkbox"
                          checked={historyStatuses.includes(status)}
                          onChange={(e) => {
                            setHistoryStatuses((selected) =>
                              e.target.checked
                                ? [...selected, status]
                                : selected.filter((value) => value !== status),
                            );
                            setPage(1);
                          }}
                        />
                        {statusLabel(status)}
                      </label>
                    ))}
                  </div>
                  <button
                    className="btn secondary"
                    onClick={() =>
                      run(
                        () =>
                          exportHistory(
                            range,
                            query,
                            historyStatuses,
                            historyPaymentMode,
                          ),
                        "Excel export downloaded",
                      )
                    }
                    disabled={busy}
                  >
                    <Download size={16} /> Export to Excel
                  </button>
                </div>
              )}
              <div className="list-heading">
                <span>
                  {total} {tab === "orders" ? "current" : "matching"} orders
                </span>
                {tab === "orders" && (
                  <div className="list-actions">
                    <button
                      className="btn"
                      aria-pressed={soundEnabled}
                      onClick={() => void toggleSound()}
                      title="Bell for new orders and customer messages. Enabling plays a test bell."
                    >
                      {soundEnabled
                        ? "Mute sound alerts"
                        : "Enable sound alerts"}
                    </button>
                    {soundError && <span role="status">{soundError}</span>}
                    <span className="live-note">
                      <span /> Updates every 5 seconds
                    </span>
                    <button
                      className="btn"
                      onClick={() =>
                        run(async () => {
                          const d = await api("/admin/menu");
                          setCounterMenu(
                            d.items.filter(
                              (i: MenuItem) =>
                                i.active &&
                                !i.ranOut &&
                                d.groups.some(
                                  (g: Group) => g.id === i.groupId && g.active,
                                ),
                            ),
                          );
                          setCounterItems({});
                          setCounterCustom([]);
                          setCustomDraft({ name: "", price: "", quantity: 1 });
                          setCounterSearch("");
                          setCounterOpen(true);
                        })
                      }
                      disabled={busy}
                    >
                      <Plus size={17} /> Add order
                    </button>
                  </div>
                )}
              </div>
              {orders.length ? (
                <div className="order-list">
                  {orders.map((o) => (
                    <button
                      className={
                        "order-row" +
                        (tab === "orders" ? " order-status-" + o.status : "") +
                        (o.messages.some(
                          (m) => m.sender === "customer" && !m.readAt,
                        )
                          ? " has-unread-message"
                          : "")
                      }
                      key={o.id}
                      onClick={() => {
                        setSelected(o);
                        setReason("");
                      }}
                    >
                      <span className="order-table">
                        {o.tableNumber}
                        <small>TABLE</small>
                      </span>
                      <div className="order-person">
                        <strong>{o.name}</strong>
                        <small>
                          {orderTypeLabel(o.orderType)} ·{" "}
                          {o.paymentMode || "Unpaid / not recorded"} ·{" "}
                          {o.number} ·{" "}
                          {o.items.reduce((s, l) => s + l.quantity, 0)} items
                        </small>
                      </div>
                      <span className="order-time">
                        {indianTime(o.createdAt)}
                      </span>
                      <strong>{money(o.amounts.total)}</strong>
                      <span
                        className={
                          o.paid - o.refunded >= o.amounts.total
                            ? "paid-label"
                            : "unpaid-label"
                        }
                      >
                        {o.paid - o.refunded >= o.amounts.total
                          ? "Paid"
                          : o.refunded
                            ? "Refunded"
                            : "Unpaid"}
                      </span>
                      <span className={"status status-" + o.status}>
                        {statusLabel(o.status)}
                      </span>
                      {o.messages.length > 0 && (
                        <span
                          className={
                            o.messages.some(
                              (m) => m.sender === "customer" && !m.readAt,
                            )
                              ? "unread-message-icon"
                              : ""
                          }
                          title={`${o.messages.length} messages`}
                        >
                          <MessageCircle size={18} /> {o.messages.length}
                        </span>
                      )}
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  title={tab === "orders" ? "All caught up" : "No orders found"}
                  text={
                    tab === "orders"
                      ? "New orders will appear here as customers place them."
                      : "Try a different date range or search."
                  }
                />
              )}
              <Pagination
                page={page}
                total={total}
                size={tab === "orders" ? 100 : 20}
                onChange={setPage}
              />
            </>
          )}
          {tab === "menu" && (
            <>
              <div className="menu-toolbar">
                <span>
                  {menu.items.length} menu items · {menu.groups.length} groups
                </span>
                {canManage && (
                  <div>
                    <button
                      className="btn secondary"
                      onClick={() => navigate("menuReports")}
                    >
                      <History size={15} /> Menu reports
                    </button>
                    <button
                      className="btn secondary"
                      onClick={() => setTagsOpen(true)}
                    >
                      Tags
                    </button>
                    <button
                      className="btn secondary"
                      onClick={() =>
                        setEditGroup({
                          id: 0,
                          name: "",
                          image: "",
                          active: true,
                          sort: menu.groups.length,
                          counterOnly: false,
                          customerVisible: false,
                        })
                      }
                    >
                      <Plus size={15} /> New group
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        setMenuUserComments("");
                        setEditItem({
                          ...blankItem,
                          groupId: menu.groups[0]?.id || 1,
                        });
                      }}
                    >
                      <Plus size={15} /> Add item
                    </button>
                  </div>
                )}
              </div>
              <section className="panel menu-filters" aria-label="Menu filters">
                <div className="menu-filter-fields">
                  <label className="search menu-filter-search">
                    <Search size={16} aria-hidden="true" />
                    <input
                      type="search"
                      aria-label="Search menu items"
                      placeholder="Search by name, code or tag"
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                    />
                  </label>
                  <Field label="Stock">
                    <select
                      aria-label="Stock filter"
                      value={menuStock}
                      onChange={(e) => setMenuStock(e.target.value)}
                    >
                      <option value="all">All stock</option>
                      <option value="out">Out of stock</option>
                      <option value="in">In stock</option>
                    </select>
                  </Field>
                  <Field label="Item status">
                    <select
                      aria-label="Item status filter"
                      value={menuActivity}
                      onChange={(e) => setMenuActivity(e.target.value)}
                    >
                      <option value="all">All items</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </Field>
                </div>
                <div className="menu-filter-flags">
                  <label>
                    <input
                      type="checkbox"
                      checked={menuSpecialOnly}
                      onChange={(e) => setMenuSpecialOnly(e.target.checked)}
                    />
                    Today’s special
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={menuFavouriteOnly}
                      onChange={(e) => setMenuFavouriteOnly(e.target.checked)}
                    />
                    Dashboard favourite
                  </label>
                  <button
                    className="text-button"
                    disabled={!menuFiltering}
                    onClick={clearMenuFilters}
                  >
                    Clear filters
                  </button>
                </div>
                <p className="muted menu-filter-summary" role="status">
                  {filteredMenuItems.length} of {menu.items.length} items ·
                  Items must match all selected filters.
                </p>
              </section>
              {menuFiltering && filteredMenuItems.length === 0 && (
                <Empty
                  title="No menu items found"
                  text="Try a different name, code, tag or filter, or clear the filters."
                />
              )}
              {filteredMenuGroups.map((g) => (
                <section className="panel admin-menu-group" key={g.id}>
                  <div className="section-head">
                    <h3>
                      {g.name}{" "}
                      {!g.active && <span className="status">Inactive</span>}
                      {g.counterOnly && (
                        <span className="status">Counter only</span>
                      )}
                    </h3>
                    {canManage && (
                      <div className="group-actions">
                        <button
                          className="text-button"
                          onClick={() => setEditGroup(g)}
                        >
                          Edit group
                        </button>
                        <button
                          className="text-button delete-button"
                          disabled={busy || !!g.linkedItemCount}
                          title={
                            g.linkedItemCount
                              ? "Group has linked menu items, including discontinued items"
                              : "Delete empty group"
                          }
                          aria-label={"Delete group " + g.name}
                          onClick={() =>
                            setConfirmation({
                              title: "Delete menu group?",
                              message: `${g.name} will be removed from the menu. Its record will be retained.`,
                              confirmLabel: "Delete group",
                              destructive: true,
                              onConfirm: () =>
                                run(async () => {
                                  await api(
                                    "/admin/groups/" + g.id,
                                    "DELETE",
                                    {},
                                  );
                                  await load();
                                }, "Menu group deleted"),
                            })
                          }
                        >
                          Delete group
                        </button>
                      </div>
                    )}
                  </div>
                  {filteredMenuItems
                    .filter((i) => i.groupId === g.id)
                    .map((i) => (
                      <div className="admin-menu-row" key={i.id}>
                        <img
                          src={i.images[0] || "/illustrations/coffee.svg"}
                          alt=""
                        />
                        <div>
                          <strong>{i.name}</strong>
                          <small>
                            {i.code} · {money(i.price)}
                            {i.todaySpecial ? " · Today’s special" : ""}
                            {i.dashboardFav ? " · Dashboard favourite" : ""}
                            {!i.active ? " · Inactive" : ""}
                          </small>
                          {i.tags.length > 0 && (
                            <small>
                              {i.tags.map((tag) => tag.name).join(" · ")}
                            </small>
                          )}
                        </div>
                        <Toggle
                          label={i.ranOut ? "Out of stock" : "Available"}
                          value={!i.ranOut}
                          disabled={busy}
                          onChange={(v) =>
                            run(async () => {
                              setMenu((m) => ({
                                ...m,
                                items: m.items.map((x) =>
                                  x.id === i.id ? { ...x, ranOut: !v } : x,
                                ),
                              }));
                              try {
                                await api(
                                  "/admin/menu/" + i.id + "/stock",
                                  "PUT",
                                  { ranOut: !v },
                                );
                                await load();
                              } catch (e) {
                                setMenu((m) => ({
                                  ...m,
                                  items: m.items.map((x) =>
                                    x.id === i.id
                                      ? { ...x, ranOut: i.ranOut }
                                      : x,
                                  ),
                                }));
                                throw e;
                              }
                            }, "Availability updated")
                          }
                        />
                        {canManage && (
                          <>
                            <button
                              className="btn secondary small-btn"
                              onClick={() => {
                                setMenuUserComments("");
                                setEditItem(i);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="text-button delete-button"
                              disabled={busy}
                              aria-label={"Delete item " + i.name}
                              onClick={() =>
                                setConfirmation({
                                  title: "Delete menu item?",
                                  message: `${i.name} will be discontinued and removed from the menu. Existing orders and receipts will be preserved.`,
                                  confirmLabel: "Delete item",
                                  destructive: true,
                                  onConfirm: () =>
                                    run(async () => {
                                      await api(
                                        "/admin/menu/" + i.id,
                                        "DELETE",
                                        {},
                                      );
                                      await load();
                                    }, "Menu item deleted"),
                                })
                              }
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                </section>
              ))}
            </>
          )}
          {tab === "menuReports" && canManage && (
            <>
              <button className="text-button" onClick={() => navigate("menu")}>
                ← Manage menu
              </button>
              <div className="filter-bar">
                {dateControls}
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label="Search menu history"
                    placeholder="Item name or code"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => exportMenuHistory(range, query, historyFilters),
                      "Excel export downloaded",
                    )
                  }
                >
                  <Download size={16} /> Export to Excel
                </button>
              </div>
              <div
                className="menu-report-filters"
                aria-label="Menu change filters"
              >
                {(
                  [
                    ["price", "Price changes"],
                    ["stock_out", "Out of stock"],
                    ["stock_in", "Back in stock"],
                    ["today_special", "Today's special"],
                    ["dashboard_fav", "Dashboard favourite"],
                    ["visibility", "Visibility"],
                    ["created", "Created"],
                    ["deleted", "Discontinued"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={historyFilters.includes(key)}
                      onChange={(e) => {
                        setHistoryFilters((filters) =>
                          e.target.checked
                            ? [...filters, key]
                            : filters.filter((f) => f !== key),
                        );
                        setPage(1);
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="list-heading">
                <span>{historyTotal} matching changes</span>
              </div>
              {menuHistory.length ? (
                <div className="menu-report-list">
                  {menuHistory.map((entry) => (
                    <article className="panel menu-report-entry" key={entry.id}>
                      <div className="section-head">
                        <h3>
                          {entry.itemName} <small>({entry.itemCode})</small>
                        </h3>
                        <span>{indianTime(entry.changedAt)}</span>
                      </div>
                      <p>
                        <strong>{entry.changeType}</strong> · {entry.actor}
                        {entry.isPriceChange ? " · Price changed" : ""}
                      </p>
                      <p>{entry.systemComments}</p>
                      {entry.userComments && (
                        <p>
                          <strong>User comment:</strong> {entry.userComments}
                        </p>
                      )}
                      {entry.isPriceChange && (
                        <p>
                          {entry.oldPrice === null
                            ? "—"
                            : money(entry.oldPrice)}{" "}
                          →{" "}
                          {entry.newPrice === null
                            ? "—"
                            : money(entry.newPrice)}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No menu changes found"
                  text="Try a different date range or filter."
                />
              )}
              <Pagination
                page={page}
                total={historyTotal}
                size={50}
                onChange={setPage}
              />
            </>
          )}
          {tab === "qr" && (
            <>
              <section className="panel qr-controls">
                <Field label="Add table number">
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={tableInput}
                    onChange={(e) => setTableInput(e.target.value)}
                  />
                </Field>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("/admin/tables", "POST", {
                        number: Number(tableInput),
                      });
                      await load();
                    }, "Table created")
                  }
                >
                  <Plus size={16} /> Add table
                </button>
                <Field label="Print selection">
                  <select
                    value={printTable}
                    onChange={(e) => setPrintTable(e.target.value)}
                  >
                    <option value="all">All tables</option>
                    {tables.map((t) => (
                      <option key={t.token} value={String(t.number)}>
                        Table {t.number}
                      </option>
                    ))}
                  </select>
                </Field>
                <button
                  className="btn secondary"
                  onClick={() => window.print()}
                >
                  <Printer size={17} /> Print QR sheets
                </button>
              </section>
              <p className="muted no-print">
                QR destination: {config.qrBaseUrl} · Change it in restaurant
                settings.
              </p>
              <div className="qr-grid">
                {tables
                  .filter(
                    (t) =>
                      printTable === "all" || String(t.number) === printTable,
                  )
                  .map((t) => (
                    <article className="qr-sheet" key={t.token}>
                      <img
                        className="qr-logo"
                        src={config.logo}
                        alt={config.name}
                      />
                      <h2>{config.name}</h2>
                      <span className="eyebrow red">
                        GOOD FOOD IS A SCAN AWAY
                      </span>
                      <h3>Table {t.number}</h3>
                      {qrImages[t.token] && (
                        <img
                          className="qr-image"
                          src={qrImages[t.token]}
                          alt={"Ordering QR for table " + t.number}
                        />
                      )}
                      <ol>
                        <li>Scan the QR with your phone</li>
                        <li>Pick your favourites & place your order</li>
                        <li>Relax. Pay at the counter.</li>
                      </ol>
                      <a
                        className="btn secondary no-print"
                        href={qrUrl(config.qrBaseUrl, t.token)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open table menu <ArrowRight size={15} />
                      </a>
                      <button
                        className="btn danger no-print table-delete"
                        disabled={busy}
                        aria-label={"Delete table " + t.number}
                        onClick={() =>
                          setConfirmation({
                            title: "Remove table?",
                            message: `Table ${t.number} will be removed and its QR link will stop accepting new orders. Existing orders will remain available.`,
                            confirmLabel: "Remove table",
                            destructive: true,
                            onConfirm: () =>
                              run(async () => {
                                await api(
                                  "/admin/tables/" + t.number,
                                  "DELETE",
                                  {},
                                );
                                setPrintTable("all");
                                await load();
                              }, "Table removed"),
                          })
                        }
                      >
                        Remove table
                      </button>
                    </article>
                  ))}
              </div>
            </>
          )}
          {tab === "settings" && (
            <form
              className="panel settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  setConfig(await api("/admin/config", "PUT", config));
                }, "Restaurant settings saved");
              }}
            >
              <h3>Restaurant details</h3>
              <div className="form-grid">
                {(
                  [
                    "name",
                    "tagline",
                    "gstin",
                    "phone",
                    "address",
                    "receiptFooter",
                  ] as const
                ).map((k) => (
                  <Field
                    key={k}
                    label={
                      {
                        name: "Restaurant name",
                        tagline: "Tagline",
                        gstin: "GSTIN",
                        phone: "Phone",
                        address: "Address",
                        receiptFooter: "Receipt footer",
                      }[k]
                    }
                  >
                    <input
                      value={config[k]}
                      required={k === "name"}
                      onChange={(e) =>
                        setConfig((c) =>
                          c ? { ...c, [k]: e.target.value } : c,
                        )
                      }
                    />
                  </Field>
                ))}
              </div>
              <h3>Pricing & ordering</h3>
              <div className="form-grid">
                <Field label="CGST rate (%)">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    required
                    value={config.cgstRate}
                    onChange={(e) =>
                      setConfig((c) =>
                        c ? { ...c, cgstRate: Number(e.target.value) } : c,
                      )
                    }
                  />
                </Field>
                <Field label="SGST rate (%)">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    required
                    value={config.sgstRate}
                    onChange={(e) =>
                      setConfig((c) =>
                        c ? { ...c, sgstRate: Number(e.target.value) } : c,
                      )
                    }
                  />
                </Field>
                <Field label="QR ordering base URL">
                  <input
                    type="url"
                    required
                    value={config.qrBaseUrl}
                    onChange={(e) =>
                      setConfig((c) =>
                        c ? { ...c, qrBaseUrl: e.target.value } : c,
                      )
                    }
                  />
                </Field>
              </div>
              <Toggle
                label="Item prices include CGST and SGST"
                value={config.gstInclusive}
                onChange={(v) =>
                  setConfig((c) => (c ? { ...c, gstInclusive: v } : c))
                }
              />
              <Toggle
                label="Allow customers to search by item code"
                value={config.menuCodeSearch}
                onChange={(v) =>
                  setConfig((c) => (c ? { ...c, menuCodeSearch: v } : c))
                }
              />
              <div className="payment-note">
                <IndianRupee size={18} />
                <div>
                  <strong>Counter payments</strong>
                  <small>
                    Online UPI will be available after payment integration.
                  </small>
                </div>
              </div>
              <p className="muted">
                New orders use these settings. Existing receipts retain their
                original prices and tax details.
              </p>
              <button className="btn" disabled={busy}>
                Save settings <Check size={16} />
              </button>
            </form>
          )}
          {tab === "users" && (
            <>
              <form
                className="panel staff-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    await api("/admin/users", "POST", newUser);
                    setNewUser({ username: "", password: "", role: "cashier" });
                    await load();
                  }, "Staff account created");
                }}
              >
                <h3>Add a staff account</h3>
                <div className="form-grid">
                  <Field label="Username">
                    <input
                      required
                      pattern="[a-zA-Z0-9._-]{3,40}"
                      value={newUser.username}
                      onChange={(e) =>
                        setNewUser((u) => ({ ...u, username: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Password (8+ characters)">
                    <input
                      type="password"
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      value={newUser.password}
                      onChange={(e) =>
                        setNewUser((u) => ({ ...u, password: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Role">
                    <select
                      value={newUser.role}
                      onChange={(e) =>
                        setNewUser((u) => ({ ...u, role: e.target.value }))
                      }
                    >
                      <option value="cashier">Cashier</option>
                      <option value="owner">Owner</option>
                      {user.role === "admin" && (
                        <option value="admin">Admin</option>
                      )}
                    </select>
                  </Field>
                </div>
                <button className="btn" disabled={busy}>
                  <Plus size={16} /> Create account
                </button>
              </form>
              <section className="panel">
                <h3>Your team</h3>
                {staffUsers.map((u) => (
                  <div className="staff-row" key={u.id}>
                    <div>
                      <strong>{u.username}</strong>
                      <small>
                        {u.role}
                        {u.id === user.id ? " · You" : ""}
                      </small>
                    </div>
                    <span className={u.active ? "paid-label" : "status"}>
                      {u.active ? "Active" : "Inactive"}
                    </span>
                    <button
                      className="btn secondary small-btn"
                      disabled={busy || u.id === user.id}
                      onClick={() =>
                        run(async () => {
                          await api("/admin/users/" + u.id, "PUT", {
                            active: !u.active,
                          });
                          await load();
                        }, "Account updated")
                      }
                    >
                      {u.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        const password = window.prompt(
                          "Enter a new password (8–128 characters). It is visible in this dialog.",
                        );
                        if (password)
                          run(async () => {
                            await api("/admin/users/" + u.id, "PUT", {
                              active: !!u.active,
                              password,
                            });
                            if (u.id === user.id) {
                              setUser(null);
                            } else await load();
                          }, "Password changed");
                      }}
                    >
                      Reset password
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}
        </main>
      </div>
      {counterOpen && (
        <div className="overlay" onClick={() => !busy && setCounterOpen(false)}>
          <section
            className="modal edit-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add counter order"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>Add counter order</h2>
              <button
                type="button"
                aria-label="Close counter order"
                disabled={busy}
                onClick={() => setCounterOpen(false)}
              >
                <X />
              </button>
            </div>
            <form
              className="modal-body"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  const items = Object.entries(counterItems)
                    .filter(([, quantity]) => quantity > 0)
                    .map(([id, quantity]) => ({ id: Number(id), quantity }));
                  if (!items.length && !counterCustom.length)
                    throw new Error("Add at least one item");
                  const result = await api<{ order: Order }>(
                    "/admin/orders",
                    "POST",
                    {
                      ...counter,
                      orderType: counterOrderType,
                      requestKey: counterRequestKey,
                      items,
                      customItems: counterCustom,
                    },
                  );
                  setCounterOpen(false);
                  setCounter({ table: 1, name: "", email: "", phone: "" });
                  setCounterOrderType("DineIn");
                  setCounterItems({});
                  setCounterCustom([]);
                  setCounterSearch("");
                  setCounterRequestKey(crypto.randomUUID());
                  setSelected(result.order);
                  await load();
                }, "Counter order created");
              }}
            >
              <div className="form-grid">
                <Field label="Table number">
                  <input
                    type="number"
                    min={1}
                    max={999}
                    required
                    value={counter.table}
                    onChange={(e) =>
                      setCounter({ ...counter, table: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Customer name">
                  <input
                    required
                    maxLength={80}
                    value={counter.name}
                    onChange={(e) =>
                      setCounter({ ...counter, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Order type">
                  <select
                    aria-label="Order type"
                    value={counterOrderType}
                    onChange={(e) =>
                      setCounterOrderType(e.target.value as OrderType)
                    }
                  >
                    <option value="DineIn">Dine-in</option>
                    <option value="TakeAway">Take-away</option>
                  </select>
                </Field>
                <Field label="Phone (optional)">
                  <input
                    type="tel"
                    maxLength={10}
                    pattern="[0-9]{10}"
                    inputMode="numeric"
                    value={counter.phone}
                    onChange={(e) =>
                      setCounter({ ...counter, phone: e.target.value })
                    }
                  />
                </Field>
                <Field label="Email (optional)">
                  <input
                    type="email"
                    maxLength={150}
                    value={counter.email}
                    onChange={(e) =>
                      setCounter({ ...counter, email: e.target.value })
                    }
                  />
                </Field>
              </div>
              <Field label="Find item by code or name">
                <input
                  ref={counterSearchRef}
                  type="search"
                  placeholder="Start typing an item code or name"
                  value={counterSearch}
                  onChange={(e) => setCounterSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (counterMatches[0])
                        addCounterItem(counterMatches[0].id);
                    }
                  }}
                />
              </Field>
              {counterSearch.trim() && (
                <div
                  className="counter-search-results"
                  role="listbox"
                  aria-label="Matching menu items"
                >
                  {counterMatches.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="counter-pick"
                      onClick={() => addCounterItem(item.id)}
                      aria-label={`Add ${item.name}`}
                    >
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.code}</small>
                      </span>
                      <span>
                        {money(item.price)} <Plus size={15} />
                      </span>
                    </button>
                  ))}
                  {!counterMatches.length && (
                    <p className="muted">No matching available items.</p>
                  )}
                </div>
              )}
              {(
                [
                  [
                    "Today's picks",
                    counterMenu.filter((item) => item.todaySpecial),
                  ],
                  [
                    "Dashboard favourites",
                    counterMenu.filter((item) => item.dashboardFav),
                  ],
                ] as const
              ).map(
                ([title, items]) =>
                  items.length > 0 && (
                    <section className="counter-quick-picks" key={title}>
                      <h3>{title}</h3>
                      <div>
                        {items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="counter-pick"
                            onClick={() => addCounterItem(item.id)}
                            aria-label={`Add ${item.name}`}
                          >
                            <span>
                              <strong>{item.name}</strong>
                              <small>{item.code}</small>
                            </span>
                            <span>
                              {money(item.price)} <Plus size={15} />
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ),
              )}
              <section className="counter-selected">
                <h3>Order items</h3>
                {counterMenu
                  .filter((item) => counterItems[item.id] > 0)
                  .map((item) => (
                    <div className="counter-selected-row" key={item.id}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.code} · {money(item.price)}
                        </small>
                      </span>
                      <div className="quantity">
                        <button
                          type="button"
                          aria-label={`Remove one ${item.name}`}
                          onClick={() =>
                            setCounterItems((items) => ({
                              ...items,
                              [item.id]: Math.max(0, items[item.id] - 1),
                            }))
                          }
                        >
                          <Minus size={15} />
                        </button>
                        <b>{counterItems[item.id]}</b>
                        <button
                          type="button"
                          aria-label={`Add one ${item.name}`}
                          disabled={counterItems[item.id] >= 50}
                          onClick={() => addCounterItem(item.id)}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                {!Object.values(counterItems).some((n) => n > 0) && (
                  <p className="muted">
                    Search or select a quick pick to add items.
                  </p>
                )}
              </section>
              {customItemsEditor}
              {error && (
                <p className="alert" role="alert">
                  {error}
                </p>
              )}
              <button className="btn full" disabled={busy}>
                <Plus size={16} /> Create order
              </button>
            </form>
          </section>
        </div>
      )}
      {selected && (
        <div className="overlay" onClick={() => !busy && setSelected(null)}>
          <section
            className="modal order-modal"
            role="dialog"
            aria-modal="true"
            aria-label={"Order " + selected.number}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow red">
                  TABLE {selected.tableNumber} · {selected.number}
                </span>
                <h2>{selected.name}</h2>
                <button
                  className="text-button"
                  onClick={() =>
                    run(async () => {
                      await navigator.clipboard.writeText(
                        `${location.origin}/order/${selected.trackingToken}`,
                      );
                    }, "Customer tracking link copied")
                  }
                >
                  Copy customer tracking link
                </button>
              </div>
              <button
                disabled={busy}
                aria-label="Close order"
                onClick={() => setSelected(null)}
              >
                <X />
              </button>
            </div>
            <div className="modal-body">
              <div className="order-facts">
                <span>{indianTime(selected.createdAt)}</span>
                <span>{orderTypeLabel(selected.orderType)}</span>
                <span>Payment: {selected.paymentMode || "Not recorded"}</span>
                <span className={"status status-" + selected.status}>
                  {statusLabel(selected.status)}
                </span>
              </div>
              {(selected.email || selected.phone) && (
                <p className="muted order-contact">
                  {selected.email} {selected.phone}
                </p>
              )}
              {transitions[selected.status].some(
                (s) => s !== "Cancelled" && s !== "New",
              ) && (
                <div
                  className="status-actions order-primary-actions"
                  role="group"
                  aria-label="Order status actions"
                >
                  {transitions[selected.status]
                    .filter((s) => s !== "Cancelled" && s !== "New")
                    .map(renderStatusAction)}
                </div>
              )}
              <div className="tracking-items">
                {selected.items.map((i, lineIndex) => (
                  <div key={`${i.itemId}-${lineIndex}`}>
                    <span>
                      <b>{i.quantity} ×</b> {i.name}
                      <small>{i.code}</small>
                    </span>
                    <strong>{money(i.price * i.quantity)}</strong>
                  </div>
                ))}
              </div>
              <div className="bill">
                <div>
                  <span>Taxable amount</span>
                  <span>{money(selected.amounts.taxable)}</span>
                </div>
                <TaxLines
                  restaurant={selected.restaurant}
                  amounts={selected.amounts}
                />
                <div className="bill-total">
                  <strong>Total</strong>
                  <strong>{money(selected.amounts.total)}</strong>
                </div>
                <div>
                  <span>Payment recorded</span>
                  <span>{money(selected.paid)}</span>
                </div>
                {selected.refunded > 0 && (
                  <div>
                    <span>Refund recorded</span>
                    <span>{money(selected.refunded)}</span>
                  </div>
                )}
              </div>
              {!["Closed", "Cancelled"].includes(selected.status) && (
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const d = await api("/admin/menu");
                      setCounterMenu(
                        d.items.filter(
                          (i: MenuItem) =>
                            i.active &&
                            !i.ranOut &&
                            d.groups.some(
                              (g: Group) => g.id === i.groupId && g.active,
                            ),
                        ),
                      );
                      setCounterItems({});
                      setCounterCustom([]);
                      setCounterSearch("");
                      setCustomDraft({ name: "", price: "", quantity: 1 });
                      setAppendOrder(selected);
                      setSelected(null);
                    })
                  }
                >
                  <Plus size={16} /> Add items or fees
                </button>
              )}
              <section className="messages">
                <h3>
                  <MessageCircle size={18} /> Messages
                </h3>
                <div className="message-list">
                  {selected.messages.length ? (
                    selected.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`message message-${message.sender}`}
                      >
                        <strong>
                          {message.sender === "staff"
                            ? "Cafe77 team"
                            : "Customer"}
                        </strong>
                        <p>{message.text}</p>
                        <small>{indianTime(message.at)}</small>
                      </div>
                    ))
                  ) : (
                    <p className="muted">No messages yet.</p>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await api(
                        `/admin/orders/${selected.id}/messages`,
                        "POST",
                        { text: messageText },
                      );
                      setMessageText("");
                      setSelected(
                        await api<Order>(`/admin/orders/${selected.id}`),
                      );
                      await load();
                    });
                  }}
                >
                  <label className="field">
                    Reply to customer
                    <textarea
                      maxLength={1000}
                      required
                      rows={2}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                    />
                  </label>
                  <button
                    className="btn secondary"
                    disabled={busy || !messageText.trim()}
                  >
                    Send message
                  </button>
                </form>
              </section>
              {error && (
                <p className="alert" role="alert">
                  {error}
                </p>
              )}
              <div className="order-actions">
                {selected.status === "Cancelled" &&
                  selected.paid > selected.refunded && (
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Confirm that the money has actually been refunded at the counter.",
                          )
                        )
                          orderAction("payment", { kind: "refund" });
                      }}
                    >
                      Record counter refund
                    </button>
                  )}
                {selected.paid - selected.refunded >=
                  selected.amounts.total && (
                  <button
                    className="btn secondary"
                    onClick={() => setReceipt(selected)}
                  >
                    <Printer size={16} /> Receipt
                  </button>
                )}
              </div>
              {transitions[selected.status].length > 0 && (
                <>
                  <Field label="Status change reason (optional)">
                    <input
                      maxLength={500}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </Field>
                  <div className="status-actions">
                    {transitions[selected.status]
                      .filter((s) => s === "Cancelled" || s === "New")
                      .map(renderStatusAction)}
                  </div>
                </>
              )}
              <h3 className="audit-title">Order timeline</h3>
              <ol className="audit-list">
                {[
                  ...selected.events.map((e) => ({
                    at: e.at,
                    title: statusLabel(e.status as Order["status"]),
                    text: e.actor + (e.reason ? " · " + e.reason : ""),
                  })),
                  ...selected.payments.map((p) => ({
                    at: p.at,
                    title:
                      p.kind === "payment"
                        ? "Counter payment recorded"
                        : "Counter refund recorded",
                    text: p.actor + " · " + money(p.amount),
                  })),
                ]
                  .sort((a, b) => a.at.localeCompare(b.at))
                  .map((e, n) => (
                    <li key={n}>
                      <span />
                      <div>
                        <strong>{e.title}</strong>
                        <small>
                          {e.text} · {indianTime(e.at)}
                        </small>
                      </div>
                    </li>
                  ))}
              </ol>
            </div>
          </section>
        </div>
      )}
      {appendOrder && (
        <div
          className="overlay"
          onClick={() => {
            if (!busy) {
              setAppendOrder(null);
              setSelected(appendOrder);
            }
          }}
        >
          <section
            className="modal edit-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add items to order"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>Add to {appendOrder.number}</h2>
              <button
                type="button"
                disabled={busy}
                aria-label="Close add items"
                onClick={() => {
                  setAppendOrder(null);
                  setSelected(appendOrder);
                }}
              >
                <X />
              </button>
            </div>
            <form
              className="modal-body"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  const items = Object.entries(counterItems)
                    .filter(([, quantity]) => quantity > 0)
                    .map(([id, quantity]) => ({ id: Number(id), quantity }));
                  if (!items.length && !counterCustom.length)
                    throw new Error("Add at least one item");
                  const updated = await api<Order>(
                    `/admin/orders/${appendOrder.id}/items`,
                    "POST",
                    {
                      version: appendOrder.version,
                      items,
                      customItems: counterCustom,
                    },
                  );
                  setAppendOrder(null);
                  setSelected(updated);
                  setCounterItems({});
                  setCounterCustom([]);
                  await load();
                }, "Items added to order");
              }}
            >
              <p className="muted">
                Added items will update the bill. Any extra amount can be
                recorded before closing the order.
              </p>
              <Field label="Find item by code or name">
                <input
                  ref={counterSearchRef}
                  type="search"
                  value={counterSearch}
                  onChange={(e) => setCounterSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (counterMatches[0])
                        addCounterItem(counterMatches[0].id);
                    }
                  }}
                />
              </Field>
              {counterSearch.trim() && (
                <div
                  className="counter-search-results"
                  role="listbox"
                  aria-label="Matching menu items"
                >
                  {counterMatches.map((item) => (
                    <button
                      type="button"
                      className="counter-pick"
                      key={item.id}
                      onClick={() => addCounterItem(item.id)}
                    >
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.code}</small>
                      </span>
                      <span>
                        {money(item.price)} <Plus size={15} />
                      </span>
                    </button>
                  ))}
                  {!counterMatches.length && (
                    <p className="muted">No matching available items.</p>
                  )}
                </div>
              )}
              {(
                [
                  ["Today's picks", counterMenu.filter((i) => i.todaySpecial)],
                  [
                    "Dashboard favourites",
                    counterMenu.filter((i) => i.dashboardFav),
                  ],
                ] as const
              ).map(
                ([title, items]) =>
                  items.length > 0 && (
                    <section className="counter-quick-picks" key={title}>
                      <h3>{title}</h3>
                      <div>
                        {items.map((item) => (
                          <button
                            type="button"
                            className="counter-pick"
                            key={item.id}
                            onClick={() => addCounterItem(item.id)}
                          >
                            <span>
                              <strong>{item.name}</strong>
                              <small>{item.code}</small>
                            </span>
                            <span>
                              {money(item.price)} <Plus size={15} />
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ),
              )}
              <section className="counter-selected">
                <h3>Items to add</h3>
                {counterMenu
                  .filter((i) => counterItems[i.id] > 0)
                  .map((item) => (
                    <div className="counter-selected-row" key={item.id}>
                      <span>
                        {item.name} · {money(item.price)}
                      </span>
                      <div className="quantity">
                        <button
                          type="button"
                          onClick={() =>
                            setCounterItems((items) => ({
                              ...items,
                              [item.id]: Math.max(0, items[item.id] - 1),
                            }))
                          }
                        >
                          <Minus size={15} />
                        </button>
                        <b>{counterItems[item.id]}</b>
                        <button
                          type="button"
                          disabled={counterItems[item.id] >= 50}
                          onClick={() => addCounterItem(item.id)}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
              </section>
              {customItemsEditor}
              {error && (
                <p className="alert" role="alert">
                  {error}
                </p>
              )}
              <button className="btn full" disabled={busy}>
                <Plus size={16} /> Add to order
              </button>
            </form>
          </section>
        </div>
      )}
      {tagsOpen && (
        <div className="overlay">
          <section
            className="modal edit-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Manage tags"
          >
            <div className="modal-head">
              <h2>Tags</h2>
              <button
                disabled={busy}
                aria-label="Close tags"
                onClick={() => {
                  setTagsOpen(false);
                  setEditTag(null);
                }}
              >
                <X />
              </button>
            </div>
            <div className="modal-body">
              <div className="tag-list">
                {menu.tags.map((tag) => (
                  <div className="tag-row" key={tag.id}>
                    {tag.image ? (
                      <img src={tag.image} alt="" />
                    ) : (
                      <span className="tag-image-empty" />
                    )}
                    <strong>{tag.name}</strong>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setEditTag(tag)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-button delete-button"
                      onClick={() =>
                        setConfirmation({
                          title: "Delete tag?",
                          message: `${tag.name} will be removed from every menu item.`,
                          confirmLabel: "Delete tag",
                          destructive: true,
                          onConfirm: () =>
                            run(async () => {
                              await api("/admin/tags/" + tag.id, "DELETE", {});
                              if (editTag?.id === tag.id) setEditTag(null);
                              await load();
                            }, "Tag deleted"),
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                ))}
                {!menu.tags.length && <p className="muted">No tags yet.</p>}
              </div>
              {!editTag ? (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setEditTag({ id: 0, name: "", image: "" })}
                >
                  <Plus size={15} /> Add tag
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await api(
                        "/admin/tags" + (editTag.id ? "/" + editTag.id : ""),
                        editTag.id ? "PUT" : "POST",
                        editTag,
                      );
                      setEditTag(null);
                      await load();
                    }, "Tag saved");
                  }}
                >
                  <Field label="Tag name">
                    <input
                      required
                      maxLength={60}
                      value={editTag.name}
                      onChange={(e) =>
                        setEditTag((tag) =>
                          tag ? { ...tag, name: e.target.value } : tag,
                        )
                      }
                    />
                  </Field>
                  <Field label="Tag image URL (optional)">
                    <input
                      value={editTag.image}
                      onChange={(e) =>
                        setEditTag((tag) =>
                          tag ? { ...tag, image: e.target.value } : tag,
                        )
                      }
                    />
                  </Field>
                  <label className="upload">
                    <Upload size={18} /> Upload tag image
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          run(async () => {
                            const image = await upload(file);
                            setEditTag((tag) =>
                              tag ? { ...tag, image } : tag,
                            );
                          });
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <div className="group-actions">
                    <button className="btn" disabled={busy}>
                      Save tag
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setEditTag(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
              {error && <p className="alert">{error}</p>}
            </div>
          </section>
        </div>
      )}
      {editItem && (
        <div className="overlay">
          <section
            className="modal edit-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit menu item"
          >
            <div className="modal-head">
              <h2>{editItem.id ? "Edit favourite" : "A new favourite"}</h2>
              <button
                disabled={busy}
                onClick={() => {
                  setEditItem(null);
                  setMenuUserComments("");
                }}
                aria-label="Close editor"
              >
                <X />
              </button>
            </div>
            <form
              className="modal-body"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api(
                    "/admin/menu" + (editItem.id ? "/" + editItem.id : ""),
                    editItem.id ? "PUT" : "POST",
                    {
                      ...editItem,
                      tagIds: editItem.tags.map((tag) => tag.id),
                      userComments: menuUserComments,
                    },
                  );
                  setEditItem(null);
                  setMenuUserComments("");
                  await load();
                }, "Menu item saved");
              }}
            >
              <div className="form-grid">
                <Field label="Name">
                  <input
                    required
                    maxLength={100}
                    value={editItem.name}
                    onChange={(e) =>
                      setEditItem((i) =>
                        i ? { ...i, name: e.target.value } : i,
                      )
                    }
                  />
                </Field>
                <Field label="Item code">
                  <input
                    required
                    maxLength={30}
                    value={editItem.code}
                    onChange={(e) =>
                      setEditItem((i) =>
                        i ? { ...i, code: e.target.value } : i,
                      )
                    }
                  />
                </Field>
                <Field label="Group">
                  <select
                    value={editItem.groupId}
                    onChange={(e) =>
                      setEditItem((i) =>
                        i ? { ...i, groupId: Number(e.target.value) } : i,
                      )
                    }
                  >
                    {menu.groups.map((g) => (
                      <option value={g.id} key={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Price (₹)">
                  <input
                    required
                    type="number"
                    min={0}
                    max={100000}
                    step="0.01"
                    value={editItem.price / 100}
                    onChange={(e) =>
                      setEditItem((i) =>
                        i
                          ? {
                              ...i,
                              price: Math.round(Number(e.target.value) * 100),
                            }
                          : i,
                      )
                    }
                  />
                </Field>
              </div>
              <Field label="Details">
                <textarea
                  maxLength={2000}
                  rows={3}
                  value={editItem.details}
                  onChange={(e) =>
                    setEditItem((i) =>
                      i ? { ...i, details: e.target.value } : i,
                    )
                  }
                />
              </Field>
              <Field label="Calories or nutrition (optional)">
                <textarea
                  maxLength={500}
                  rows={2}
                  value={editItem.calories}
                  onChange={(e) =>
                    setEditItem((i) =>
                      i ? { ...i, calories: e.target.value } : i,
                    )
                  }
                />
              </Field>
              <Toggle
                label="Show calories or nutrition to customers"
                value={editItem.showCalories}
                onChange={(v) =>
                  setEditItem((i) => (i ? { ...i, showCalories: v } : i))
                }
              />
              <Field label="Ingredients (comma-separated, optional)">
                <textarea
                  maxLength={2000}
                  rows={2}
                  value={editItem.ingredients}
                  onChange={(e) =>
                    setEditItem((i) =>
                      i ? { ...i, ingredients: e.target.value } : i,
                    )
                  }
                />
              </Field>
              <Toggle
                label="Show ingredients to customers"
                value={editItem.showIngredients}
                onChange={(v) =>
                  setEditItem((i) => (i ? { ...i, showIngredients: v } : i))
                }
              />
              <Field label="YouTube video URL (optional)">
                <input
                  type="url"
                  value={editItem.video}
                  onChange={(e) =>
                    setEditItem((i) =>
                      i ? { ...i, video: e.target.value } : i,
                    )
                  }
                />
              </Field>
              <div className="image-editor">
                {editItem.images.map((url, n) => (
                  <div key={n}>
                    <img src={url} alt={"Item image " + (n + 1)} />
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={() =>
                        setEditItem((i) =>
                          i
                            ? {
                                ...i,
                                images: i.images.filter(
                                  (_, index) => index !== n,
                                ),
                              }
                            : i,
                        )
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {editItem.images.length < 6 && (
                  <label className="upload">
                    <Upload size={20} /> Add image
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f)
                          run(async () => {
                            const url = await upload(f);
                            setEditItem((i) =>
                              i ? { ...i, images: [...i.images, url] } : i,
                            );
                          });
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
              <div className="field">
                <span>Tags</span>
                <div className="tag-choices">
                  {menu.tags.map((tag) => (
                    <label key={tag.id} className="tag-choice">
                      <input
                        type="checkbox"
                        checked={editItem.tags.some(
                          (selected) => selected.id === tag.id,
                        )}
                        onChange={(e) =>
                          setEditItem((current) =>
                            current
                              ? {
                                  ...current,
                                  tags: e.target.checked
                                    ? [...current.tags, tag]
                                    : current.tags.filter(
                                        (selected) => selected.id !== tag.id,
                                      ),
                                }
                              : current,
                          )
                        }
                      />
                      {tag.image && <img src={tag.image} alt="" />}
                      {tag.name}
                    </label>
                  ))}
                  {!menu.tags.length && (
                    <span className="muted">Create tags from Manage menu.</span>
                  )}
                </div>
              </div>
              <p className="muted">
                Up to 6 images · PNG/JPEG/WebP · 2 MB each
              </p>
              {(
                ["active", "ranOut", "todaySpecial", "dashboardFav"] as const
              ).map((k) => (
                <Toggle
                  key={k}
                  label={
                    {
                      active: "Visible on menu",
                      ranOut: "Out of stock",
                      todaySpecial: "Today’s special",
                      dashboardFav: "Dashboard favourite",
                    }[k]
                  }
                  value={editItem[k]}
                  onChange={(v) =>
                    setEditItem((i) => (i ? { ...i, [k]: v } : i))
                  }
                />
              ))}
              <Field label="Comment on this change (optional)">
                <textarea
                  maxLength={1000}
                  rows={2}
                  value={menuUserComments}
                  onChange={(e) => setMenuUserComments(e.target.value)}
                />
              </Field>
              {error && (
                <p className="alert" role="alert">
                  {error}
                </p>
              )}
              <button className="btn full" disabled={busy}>
                Save menu item <Check size={16} />
              </button>
            </form>
          </section>
        </div>
      )}
      {editGroup && (
        <div className="overlay">
          <section
            className="modal edit-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit menu group"
          >
            <div className="modal-head">
              <h2>{editGroup.id ? "Edit menu group" : "New menu group"}</h2>
              <button
                disabled={busy}
                aria-label="Close group editor"
                onClick={() => setEditGroup(null)}
              >
                <X />
              </button>
            </div>
            <form
              className="modal-body"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api(
                    "/admin/groups" + (editGroup.id ? "/" + editGroup.id : ""),
                    editGroup.id ? "PUT" : "POST",
                    editGroup,
                  );
                  setEditGroup(null);
                  await load();
                }, "Group saved");
              }}
            >
              <Field label="Group name">
                <input
                  required
                  maxLength={100}
                  value={editGroup.name}
                  onChange={(e) =>
                    setEditGroup((g) =>
                      g ? { ...g, name: e.target.value } : g,
                    )
                  }
                />
              </Field>
              <Field label="Display order">
                <input
                  type="number"
                  required
                  min={0}
                  max={10000}
                  value={editGroup.sort}
                  onChange={(e) =>
                    setEditGroup((g) =>
                      g ? { ...g, sort: Number(e.target.value) } : g,
                    )
                  }
                />
              </Field>
              <Field label="Group image URL (optional)">
                <input
                  value={editGroup.image}
                  onChange={(e) =>
                    setEditGroup((g) =>
                      g ? { ...g, image: e.target.value } : g,
                    )
                  }
                />
              </Field>
              <label className="upload">
                <Upload size={18} /> Upload group image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      run(async () => {
                        const url = await upload(f);
                        setEditGroup((g) => (g ? { ...g, image: url } : g));
                      });
                    e.target.value = "";
                  }}
                />
              </label>
              <Toggle
                label="Active group"
                value={editGroup.active}
                onChange={(v) =>
                  setEditGroup((g) => (g ? { ...g, active: v } : g))
                }
              />
              <Toggle
                label="Counter only"
                value={editGroup.counterOnly}
                onChange={(v) =>
                  setEditGroup((g) => (g ? { ...g, counterOnly: v } : g))
                }
              />
              {editGroup.counterOnly && (
                <Toggle
                  label="Show at customer menu (ordering at counter only)"
                  value={editGroup.customerVisible}
                  onChange={(v) =>
                    setEditGroup((g) => (g ? { ...g, customerVisible: v } : g))
                  }
                />
              )}
              {error && <p className="alert">{error}</p>}
              <button className="btn full" disabled={busy}>
                Save group
              </button>
            </form>
          </section>
        </div>
      )}
      {receipt && <Receipt order={receipt} onClose={() => setReceipt(null)} />}
      {closing && selected && (
        <ConfirmDialog
          busy={busy}
          confirmDisabled={!closePaymentMode}
          onClose={() => setClosing(false)}
          confirmation={{
            title: "Complete Order",
            message: `Confirm ${money(Math.max(0, selected.amounts.total - selected.paid + selected.refunded))} received for ${selected.number}, Table ${selected.tableNumber}, and that the order has been served.`,
            confirmLabel: "Confirm payment & close",
            onConfirm: () =>
              orderAction("status", {
                status: "Closed",
                reason,
                paymentMode: closePaymentMode,
              }),
          }}
        >
          <Field label="Payment mode">
            <select
              aria-label="Payment mode"
              autoFocus
              value={closePaymentMode}
              disabled={busy}
              onChange={(e) =>
                setClosePaymentMode(e.target.value as PaymentMode)
              }
            >
              <option value="">Choose payment mode</option>
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
            </select>
          </Field>
          <p className="muted">Record payment received at the counter.</p>
        </ConfirmDialog>
      )}
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          busy={busy}
          onClose={() => setConfirmation(null)}
        />
      )}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <CoffeeIcon />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function CoffeeIcon() {
  return <UtensilsCrossed size={30} />;
}
function RankList({ items }: { items: any[] }) {
  return items.length ? (
    <div className="rank-list">
      {items.map((i, n) => (
        <div key={i.id + "-" + i.name}>
          <span>{String(n + 1).padStart(2, "0")}</span>
          <strong>{i.name}</strong>
          <b>
            {i.quantity}
            <small> ordered</small>
          </b>
        </div>
      ))}
    </div>
  ) : (
    <Empty
      title="No completed orders yet"
      text="Your customers’ favourites will appear here."
    />
  );
}
function Pagination({
  page,
  total,
  size,
  onChange,
}: {
  page: number;
  total: number;
  size: number;
  onChange: (n: number) => void;
}) {
  return total > size ? (
    <div className="pagination">
      <button
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={18} />
      </button>
      <span>
        Page {page} of {Math.ceil(total / size)}
      </span>
      <button
        aria-label="Next page"
        disabled={page >= Math.ceil(total / size)}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  ) : null;
}
