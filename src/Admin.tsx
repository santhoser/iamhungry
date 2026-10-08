import { useEffect, useState } from "react";
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
} from "lucide-react";
import QRCode from "qrcode";
import { api } from "./api";
import { Brand, Receipt, indianTime } from "./App";
import ConfirmDialog, { type Confirmation } from "./ConfirmDialog";
import {
  money,
  qrUrl,
  statusLabel,
  transitions,
  type Group,
  type MenuItem,
  type Order,
  type Restaurant,
  type Role,
} from "../shared/domain";
type Staff = { id: number; username: string; role: Role };
type Tab =
  "dashboard" | "orders" | "history" | "menu" | "qr" | "settings" | "users";
const blankItem: MenuItem = {
  id: 0,
  groupId: 1,
  code: "",
  name: "",
  price: 0,
  details: "",
  images: [],
  video: "",
  active: true,
  ranOut: false,
  todaySpecial: false,
  dashboardFav: false,
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
  { id: "menu", name: "Menu & availability", icon: UtensilsCrossed },
  { id: "qr", name: "Table QR codes", icon: QrCode, owner: true },
  { id: "users", name: "Staff accounts", icon: Users, owner: true },
  { id: "settings", name: "Restaurant settings", icon: Settings, owner: true },
] as const;

export default function Admin() {
  const [user, setUser] = useState<Staff | null>(null);
  const [config, setConfig] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("orders");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [login, setLogin] = useState({ username: "", password: "" });
  const setupToken = new URLSearchParams(location.search).get("setup");
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState(presetRange("today"));
  const [preset, setPreset] = useState("today");
  const [selected, setSelected] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const [receipt, setReceipt] = useState<Order | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [menu, setMenu] = useState<{ items: MenuItem[]; groups: Group[] }>({
    items: [],
    groups: [],
  });
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
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
          setTab(u.role === "owner" ? "dashboard" : "orders");
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
      current: String(tab === "orders"),
    });
    if (tab === "orders" || tab === "history") {
      const d = await api("/admin/orders?" + params);
      setOrders(d.orders);
      setTotal(d.total);
    }
    if (tab === "menu") setMenu(await api("/admin/menu"));
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
    const live =
      user && ["orders", "history", "dashboard", "menu"].includes(tab);
    const timer = live ? setInterval(refresh, 5000) : null;
    const events = live ? new EventSource("/api/admin/events") : null;
    events?.addEventListener("change", refresh);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      events?.close();
    };
  }, [user, tab, page, query, range.from, range.to]);
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    const timer = setInterval(
      () =>
        api<Order>("/admin/orders/" + selected.id)
          .then((o) => alive && setSelected(o))
          .catch((e) => alive && setError(e.message)),
      5000,
    );
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selected?.id]);
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
          <h2>{setupToken ? "Welcome, owner" : "Welcome back"}</h2>
          <p>
            {setupToken
              ? "Create your first owner account."
              : "Sign in to look after your cafe."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                if (setupToken) {
                  await api("/setup", "POST", { ...login, token: setupToken });
                  history.replaceState(null, "", "/admin");
                }
                const u = await api<Staff>("/auth/login", "POST", login);
                setUser(u);
                setTab(u.role === "owner" ? "dashboard" : "orders");
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
                minLength={setupToken ? 12 : 1}
                maxLength={128}
                autoComplete={setupToken ? "new-password" : "current-password"}
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
                : setupToken
                  ? "Create owner & sign in"
                  : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="muted">Owner and cashier access · Cafe77</p>
        </section>
      </main>
    );
  const title = nav.find((n) => n.id === tab)?.name || "";
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
            .filter((n) => !("owner" in n) || user.role === "owner")
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
            {["orders", "history", "dashboard"].includes(tab) && (
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
                </div>
              )}
              <div className="list-heading">
                <span>
                  {total} {tab === "orders" ? "current" : "matching"} orders
                </span>
                {tab === "orders" && (
                  <span className="live-note">
                    <span /> Updates every 5 seconds
                  </span>
                )}
              </div>
              {orders.length ? (
                <div className="order-list">
                  {orders.map((o) => (
                    <button
                      className="order-row"
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
                {user.role === "owner" && (
                  <div>
                    <button
                      className="btn secondary"
                      onClick={() =>
                        setEditGroup({
                          id: 0,
                          name: "",
                          image: "",
                          active: true,
                          sort: menu.groups.length,
                        })
                      }
                    >
                      <Plus size={15} /> New group
                    </button>
                    <button
                      className="btn"
                      onClick={() =>
                        setEditItem({
                          ...blankItem,
                          groupId: menu.groups[0]?.id || 1,
                        })
                      }
                    >
                      <Plus size={15} /> Add item
                    </button>
                  </div>
                )}
              </div>
              {menu.groups.map((g) => (
                <section className="panel admin-menu-group" key={g.id}>
                  <div className="section-head">
                    <h3>
                      {g.name}{" "}
                      {!g.active && <span className="status">Inactive</span>}
                    </h3>
                    {user.role === "owner" && (
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
                  {menu.items
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
                            {!i.active ? " · Inactive" : ""}
                          </small>
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
                        {user.role === "owner" && (
                          <>
                            <button
                              className="btn secondary small-btn"
                              onClick={() => setEditItem(i)}
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
                <Field label="GST rate (%)">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    required
                    value={config.gstRate}
                    onChange={(e) =>
                      setConfig((c) =>
                        c ? { ...c, gstRate: Number(e.target.value) } : c,
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
                label="Item prices include GST"
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
                  <Field label="Password (12+ characters)">
                    <input
                      type="password"
                      required
                      minLength={12}
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
                          "Enter a new password (12–128 characters). It is visible in this dialog.",
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
                <span className={"status status-" + selected.status}>
                  {statusLabel(selected.status)}
                </span>
              </div>
              {(selected.email || selected.phone) && (
                <p className="muted">
                  {selected.email} {selected.phone}
                </p>
              )}
              <div className="tracking-items">
                {selected.items.map((i) => (
                  <div key={i.itemId}>
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
                <div>
                  <span>GST ({selected.restaurant.gstRate}%)</span>
                  <span>{money(selected.amounts.gst)}</span>
                </div>
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
              {error && (
                <p className="alert" role="alert">
                  {error}
                </p>
              )}
              <div className="order-actions">
                {selected.paid - selected.refunded < selected.amounts.total &&
                  !["Closed", "Cancelled"].includes(selected.status) && (
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() =>
                        setConfirmation({
                          title: "Mark as Paid?",
                          message: `Confirm that ${money(selected.amounts.total - selected.paid + selected.refunded)} has been received at the counter for ${selected.number}, Table ${selected.tableNumber}.`,
                          confirmLabel: "Mark as Paid",
                          onConfirm: () =>
                            orderAction("payment", { kind: "payment" }),
                        })
                      }
                    >
                      <IndianRupee size={16} /> Mark as Paid
                    </button>
                  )}
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
                    {transitions[selected.status].map((s) => (
                      <button
                        key={s}
                        className={
                          "btn " +
                          (s === "Cancelled"
                            ? "danger"
                            : s === "Closed"
                              ? ""
                              : "secondary")
                        }
                        disabled={
                          busy ||
                          (s === "Closed" &&
                            selected.paid - selected.refunded <
                              selected.amounts.total)
                        }
                        onClick={() => {
                          if (
                            (s === "Cancelled" ||
                              s === "Closed" ||
                              s === "New") &&
                            !window.confirm(
                              s === "Closed"
                                ? "Confirm this order is served and fully paid."
                                : s === "New"
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
                            ? "Served & paid — close"
                            : statusLabel(s)}
                      </button>
                    ))}
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
                onClick={() => setEditItem(null)}
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
                    editItem,
                  );
                  setEditItem(null);
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
              {error && <p className="alert">{error}</p>}
              <button className="btn full" disabled={busy}>
                Save group
              </button>
            </form>
          </section>
        </div>
      )}
      {receipt && <Receipt order={receipt} onClose={() => setReceipt(null)} />}
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
