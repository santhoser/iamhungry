import TaxLines from "./TaxLines";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  ShoppingBag,
  Plus,
  Minus,
  X,
  Search,
  Coffee,
  MapPin,
  Clock,
  Check,
  Printer,
  UtensilsCrossed,
  ArrowLeft,
  RefreshCw,
  MessageCircle,
} from "lucide-react";
import { api } from "./api";
import {
  money,
  totals,
  statusLabel,
  type MenuItem,
  type Group,
  type Restaurant,
  type Order,
} from "../shared/domain";
import Admin from "./Admin";
const getCart = (table: string) => {
  try {
    return JSON.parse(
      localStorage.getItem("cafe77.cart." + table) || "{}",
    ) as Record<string, number>;
  } catch {
    return {};
  }
};
export const indianTime = (date: string) =>
  new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export function Brand({
  config,
  small = false,
}: {
  config: Restaurant;
  small?: boolean;
}) {
  return (
    <a className={"brand " + (small ? "small" : "")} href="/">
      <img src={config.logo} alt={config.name + " logo"} />
      <span>
        <strong>{config.name}</strong>
        <small>{config.tagline}</small>
      </span>
    </a>
  );
}
export default function App() {
  if (location.pathname.startsWith("/admin")) return <Admin />;
  if (location.pathname.startsWith("/order/"))
    return <Tracking token={location.pathname.split("/")[2]} />;
  return <Menu />;
}

function Menu() {
  const tableToken = new URLSearchParams(location.search).get("table") || "";
  const [data, setData] = useState<{
    config: Restaurant;
    groups: Group[];
    items: MenuItem[];
    table: { number: number; token: string } | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(0);
  const [cart, setCart] = useState<Record<string, number>>(() =>
    getCart(tableToken),
  );
  const [cartOpen, setCartOpen] = useState(false);
  const [detail, setDetail] = useState<MenuItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let alive = true;
    const load = () =>
      api(
        "/menu" +
          (tableToken ? "?table=" + encodeURIComponent(tableToken) : ""),
      )
        .then((d) => {
          if (alive) {
            setData(d);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [tableToken]);
  useEffect(() => {
    localStorage.setItem("cafe77.cart." + tableToken, JSON.stringify(cart));
  }, [cart, tableToken]);
  const change = (id: number, delta: number) => {
    setRequestKey(crypto.randomUUID());
    setCart((c) => ({
      ...c,
      [id]: Math.max(0, Math.min(50, (c[id] || 0) + delta)),
    }));
  };
  if (!data)
    return (
      <div className="loading">
        <Coffee size={42} />
        <h2>
          {error ? "Couldn’t open the menu" : "A little goodness is brewing…"}
        </h2>
        <p>{error || "Welcome to Cafe77"}</p>
        {error && (
          <a className="btn" href="/">
            Browse menu
          </a>
        )}
      </div>
    );
  const { config, items, groups, table } = data;
  const counterOnly = (item: MenuItem) =>
    !!groups.find((group) => group.id === item.groupId)?.counterOnly;
  const selectTag = (name: string) => {
    setCategory(0);
    setQuery(name);
    setDetail(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const lines = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, quantity]) => ({
      item: items.find((x) => x.id === Number(id)),
      id: Number(id),
      quantity,
    }));
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const amounts = totals(
    lines.map((l) => ({ price: l.item?.price || 0, quantity: l.quantity })),
    config.cgstRate,
    config.sgstRate,
    config.gstInclusive,
  );
  const filtered = items.filter(
    (i) =>
      (!category || i.groupId === category) &&
      (!query ||
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        i.tags.some((tag) =>
          tag.name.toLowerCase().includes(query.toLowerCase()),
        ) ||
        (config.menuCodeSearch &&
          i.code.toLowerCase().includes(query.toLowerCase()))),
  );
  async function checkout(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api("/orders", "POST", {
        table: tableToken,
        name,
        email,
        phone,
        requestKey,
        items: lines.map((l) => ({ id: l.id, quantity: l.quantity })),
      });
      localStorage.removeItem("cafe77.cart." + tableToken);
      location.href = "/order/" + r.token;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const product = (i: MenuItem, special = false) => (
    <article className={"product " + (special ? "featured" : "")} key={i.id}>
      <button
        className="product-image"
        onClick={() => setDetail(i)}
        aria-label={"Details for " + i.name}
      >
        <img
          src={i.images[0] || "/illustrations/coffee.svg"}
          alt={i.name}
          loading="lazy"
        />
        {i.todaySpecial && <span className="special-tag">TODAY’S PICK</span>}
        {i.ranOut && <span className="sold-tag">Out of stock</span>}
      </button>
      <div className="product-content">
        <div className="item-meta">
          {config.menuCodeSearch && <span>{i.code}</span>}
          <span>{groups.find((g) => g.id === i.groupId)?.name}</span>
        </div>
        <button className="text-button item-title" onClick={() => setDetail(i)}>
          {i.name}
        </button>
        <p>{i.details}</p>
        {!!i.tags.length && (
          <div className="item-tags">
            {i.tags.map((tag) => (
              <button
                type="button"
                className="item-tag"
                key={tag.id}
                onClick={() => selectTag(tag.name)}
              >
                {tag.image && <img src={tag.image} alt="" />}
                {tag.name}
              </button>
            ))}
          </div>
        )}
        <div className="product-bottom">
          <strong>{money(i.price)}</strong>
          {counterOnly(i) ? (
            <span className="counter-visit">Please visit the counter</span>
          ) : i.ranOut ? (
            <span className="muted">Sold out</span>
          ) : cart[i.id] ? (
            <div className="quantity">
              <button
                onClick={() => change(i.id, -1)}
                aria-label={"Remove one " + i.name}
              >
                <Minus size={15} />
              </button>
              <b>{cart[i.id]}</b>
              <button
                onClick={() => change(i.id, 1)}
                disabled={cart[i.id] >= 50}
                aria-label={"Add one " + i.name}
              >
                <Plus size={15} />
              </button>
            </div>
          ) : (
            <button className="add" onClick={() => change(i.id, 1)}>
              <Plus size={15} /> Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
  return (
    <>
      <header className="public-header">
        <div className="wrap header-inner">
          <Brand config={config} />
          <div className="header-actions">
            {table ? (
              <span className="table-pill">
                <MapPin size={15} /> Table {table.number}
              </span>
            ) : (
              <span className="table-pill">Browse our menu</span>
            )}
            <button
              className="bag-button"
              aria-label="Open cart"
              onClick={() => setCartOpen(true)}
            >
              <ShoppingBag size={21} />
              {count > 0 && <span>{count}</span>}
            </button>
          </div>
        </div>
      </header>
      <main className="wrap public-main">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span /> A LITTLE BREAK. A LOT OF GOODNESS.
            </span>
            <h1>
              Your table.
              <br />
              Your favourites.
              <br />
              <em>Freshly made.</em>
            </h1>
            <p>
              Good coffee, comforting bites and a little something sweet. Make
              yourself at home.
            </p>
            <a className="btn gold" href="#menu">
              Explore the menu <ArrowRight size={17} />
            </a>
            <div className="hero-note">
              <UtensilsCrossed size={16} />
              {table
                ? `Ordering for table ${table.number} · Pay at the counter`
                : "Scan your table QR when you’re ready to order"}
            </div>
          </div>
          <div className="hero-art">
            <div className="art-orbit" />
            <img
              src="/illustrations/coffee.svg"
              alt="A warm cup of Cafe77 coffee"
            />
            <span className="hero-stamp">
              made with
              <br />
              <b>a little love</b>
              <Coffee size={18} />
            </span>
          </div>
        </section>
        {error && (
          <div className="alert" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {!query && !category && items.some((i) => i.todaySpecial) && (
          <section className="specials">
            <div className="section-head">
              <div>
                <span className="eyebrow red">HANDPICKED FOR TODAY</span>
                <h2>A few favourites, just for you</h2>
              </div>
              <span className="section-note">
                A good place to start <ChevronRight size={16} />
              </span>
            </div>
            <div className="special-grid">
              {items.filter((i) => i.todaySpecial).map((i) => product(i, true))}
            </div>
          </section>
        )}
        <section id="menu">
          <div className="section-head menu-heading">
            <div>
              <span className="eyebrow red">FIND YOUR NEXT FAVOURITE</span>
              <h2>The Cafe77 menu</h2>
            </div>
            <label className="search">
              <Search size={18} />
              <input
                aria-label="Search menu"
                placeholder={
                  config.menuCodeSearch
                    ? "Search a dish or item code"
                    : "Search a dish"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search">
                  <X size={16} />
                </button>
              )}
            </label>
          </div>
          <div className="categories">
            <button
              className={!category ? "selected" : ""}
              onClick={() => setCategory(0)}
            >
              All favourites
            </button>
            {groups.map((g) => (
              <button
                className={category === g.id ? "selected" : ""}
                key={g.id}
                onClick={() => setCategory(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
          <p className="tax-note">
            {config.gstInclusive
              ? `Prices include CGST ${config.cgstRate}% + SGST ${config.sgstRate}%`
              : `CGST ${config.cgstRate}% + SGST ${config.sgstRate}% added at checkout`}
          </p>
          {filtered.length ? (
            groups
              .filter((g) => filtered.some((i) => i.groupId === g.id))
              .map((g) => (
                <section className="menu-group" key={g.id}>
                  <h3>
                    {g.name}
                    <span>
                      {filtered.filter((i) => i.groupId === g.id).length}{" "}
                      favourites
                    </span>
                  </h3>
                  <div className="menu-grid">
                    {filtered
                      .filter((i) => i.groupId === g.id)
                      .map((i) => product(i))}
                  </div>
                </section>
              ))
          ) : (
            <div className="empty">
              <Search size={32} />
              <h3>No dishes found</h3>
              <p>
                Try another name{config.menuCodeSearch ? " or menu code" : ""}.
              </p>
            </div>
          )}
        </section>
        <footer className="footer">
          <span>
            {config.name} · {config.tagline}
          </span>
          <a href="/admin">
            Staff login <ArrowRight size={13} />
          </a>
        </footer>
      </main>
      {count > 0 && !cartOpen && (
        <div className="cart-dock">
          <button onClick={() => setCartOpen(true)}>
            <span>
              <ShoppingBag size={19} />
              <b>{count}</b> {count === 1 ? "item" : "items"}
            </span>
            <span>
              View your order <ArrowRight size={16} />
            </span>
            <strong>{money(amounts.total)}</strong>
          </button>
        </div>
      )}
      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <section
            className="modal item-modal"
            role="dialog"
            aria-modal="true"
            aria-label={detail.name}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-modal"
              aria-label="Close item details"
              onClick={() => setDetail(null)}
            >
              <X />
            </button>
            <img
              className="detail-image"
              src={detail.images[0] || "/illustrations/coffee.svg"}
              alt={detail.name}
            />
            <div className="modal-body">
              <span className="eyebrow red">
                {groups.find((g) => g.id === detail.groupId)?.name}
              </span>
              <h2>{detail.name}</h2>
              <p>{detail.details}</p>
              {!!detail.tags.length && (
                <div className="item-tags">
                  {detail.tags.map((tag) => (
                    <button
                      type="button"
                      className="item-tag"
                      key={tag.id}
                      onClick={() => selectTag(tag.name)}
                    >
                      {tag.image && <img src={tag.image} alt="" />}
                      {tag.name}
                    </button>
                  ))}
                </div>
              )}
              {detail.calories && (
                <p>
                  <strong>Calories / nutrition:</strong> {detail.calories}
                </p>
              )}
              {detail.ingredients && (
                <p>
                  <strong>Ingredients:</strong> {detail.ingredients}
                </p>
              )}
              {detail.images.slice(1).map((url) => (
                <img
                  className="detail-extra"
                  key={url}
                  src={url}
                  alt={detail.name}
                />
              ))}
              {detail.video && (
                <a href={detail.video} target="_blank" rel="noreferrer">
                  Watch on YouTube
                </a>
              )}
              <div className="product-bottom">
                <strong>{money(detail.price)}</strong>
                {counterOnly(detail) ? (
                  <span className="counter-visit">
                    Please visit the counter
                  </span>
                ) : (
                  <button
                    className="btn"
                    disabled={detail.ranOut}
                    onClick={() => {
                      change(detail.id, 1);
                      setDetail(null);
                    }}
                  >
                    {detail.ranOut ? "Out of stock" : "Add to order"}{" "}
                    <Plus size={16} />
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
      {cartOpen && (
        <div className="overlay" onClick={() => !busy && setCartOpen(false)}>
          <section
            className="modal cart-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Your order"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow red">A LITTLE GOODNESS</span>
                <h2>Your order</h2>
              </div>
              <button
                disabled={busy}
                onClick={() => setCartOpen(false)}
                aria-label="Close cart"
              >
                <X />
              </button>
            </div>
            {!count ? (
              <div className="empty">
                <ShoppingBag size={40} />
                <h3>Something delicious awaits</h3>
                <p>Add a favourite from the menu.</p>
              </div>
            ) : (
              <form onSubmit={checkout}>
                <div className="cart-lines">
                  {lines.map((l) => (
                    <div className="cart-line" key={l.id}>
                      <img
                        src={l.item?.images[0] || "/illustrations/coffee.svg"}
                        alt=""
                      />
                      <div>
                        <strong>{l.item?.name || "Unavailable item"}</strong>
                        <small>
                          {l.item
                            ? money(l.item.price)
                            : "Please remove this item"}
                          {l.item?.ranOut ? " · Out of stock" : ""}
                          {l.item && counterOnly(l.item)
                            ? " · Please visit the counter"
                            : ""}
                        </small>
                      </div>
                      <div className="quantity">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => change(l.id, -1)}
                          aria-label={"Remove " + l.item?.name}
                        >
                          <Minus size={14} />
                        </button>
                        <b>{l.quantity}</b>
                        <button
                          type="button"
                          disabled={
                            busy ||
                            !l.item ||
                            l.item.ranOut ||
                            counterOnly(l.item) ||
                            l.quantity >= 50
                          }
                          onClick={() => change(l.id, 1)}
                          aria-label={"Add " + l.item?.name}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bill">
                  <div>
                    <span>Taxable amount</span>
                    <span>{money(amounts.taxable)}</span>
                  </div>
                  <TaxLines restaurant={config} amounts={amounts} />
                  <div className="bill-total">
                    <strong>Total</strong>
                    <strong>{money(amounts.total)}</strong>
                  </div>
                </div>
                <div className="checkout-fields">
                  <label>
                    Your name
                    <input
                      required
                      maxLength={80}
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setRequestKey(crypto.randomUUID());
                      }}
                      placeholder="So we know who to call"
                      autoComplete="name"
                    />
                  </label>
                  <details>
                    <summary>Add contact details (optional)</summary>
                    <p className="muted">
                      Order updates are available on the tracking page.
                    </p>
                    <label>
                      Email
                      <input
                        type="email"
                        maxLength={150}
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setRequestKey(crypto.randomUUID());
                        }}
                        autoComplete="email"
                      />
                    </label>
                    <label>
                      Phone
                      <input
                        type="tel"
                        maxLength={25}
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          setRequestKey(crypto.randomUUID());
                        }}
                        autoComplete="tel"
                      />
                    </label>
                  </details>
                </div>
                <div className="payment-note">
                  <MapPin size={18} />
                  <div>
                    <strong>Pay at the counter</strong>
                    <small>
                      Cash or counter UPI · Table {table?.number || "—"}
                    </small>
                  </div>
                </div>
                {!table && (
                  <p className="alert">
                    Scan the QR on your table to place an order.
                  </p>
                )}
                {error && (
                  <p className="alert" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="btn full"
                  disabled={
                    busy ||
                    !table ||
                    lines.some(
                      (l) => !l.item || l.item.ranOut || counterOnly(l.item),
                    )
                  }
                  type="submit"
                >
                  {busy ? "Placing your order…" : "Place order"}{" "}
                  {!busy && <ArrowRight size={18} />}
                </button>
                <p className="checkout-note">
                  Keep the tracking page open after placing your order.
                </p>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function Tracking({ token }: { token: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [reading, setReading] = useState(false);
  const messageSectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Order>("/orders/" + encodeURIComponent(token))
        .then((o) => {
          if (alive) {
            setOrder(o);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [token]);
  if (!order)
    return (
      <div className="loading">
        <Clock />
        <h2>{error || "Finding your order…"}</h2>
      </div>
    );
  const steps = ["New", "Accepted", "InProgress", "Ready", "Closed"];
  const index = steps.indexOf(order.status);
  const paid = order.paid - order.refunded >= order.amounts.total;
  const unreadMessages = order.messages.filter(
    (message) => message.sender === "staff" && !message.readAt,
  ).length;
  return (
    <>
      <header className="public-header">
        <div className="wrap header-inner">
          <Brand config={order.restaurant} />
          <span className="table-pill">Table {order.tableNumber}</span>
          {unreadMessages > 0 && (
            <button
              className="customer-message-alert unread-message-icon"
              aria-label={`${unreadMessages} unread messages`}
              disabled={reading}
              onClick={async () => {
                messageSectionRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
                setReading(true);
                try {
                  await api(
                    `/orders/${encodeURIComponent(token)}/messages/read`,
                    "POST",
                    {},
                  );
                  setOrder(
                    await api<Order>(`/orders/${encodeURIComponent(token)}`),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setReading(false);
                }
              }}
            >
              <MessageCircle size={20} />
              <span>{unreadMessages}</span>
            </button>
          )}
        </div>
      </header>
      <main className="tracking wrap">
        <a className="back-link" href="/">
          <ArrowLeft size={16} /> Browse menu
        </a>
        <section className="tracking-card">
          <div className="tracking-icon">
            {order.status === "Cancelled" ? (
              <X size={30} />
            ) : order.status === "Closed" ? (
              <Check size={30} />
            ) : (
              <Coffee size={30} />
            )}
          </div>
          <span className="eyebrow red">{order.number}</span>
          <h1>
            {order.status === "Cancelled"
              ? "Your order was cancelled"
              : order.status === "Closed"
                ? "Thanks for stopping by!"
                : order.status === "Ready"
                  ? "Your order is ready!"
                  : `Thanks, ${order.name}!`}
          </h1>
          <p>
            {order.status === "Cancelled"
              ? "Please speak to our team at the counter."
              : order.status === "Closed"
                ? order.restaurant.receiptFooter
                : "We’re taking care of your order. Settle in and make yourself at home."}
          </p>
          {order.status !== "Cancelled" && (
            <div className="progress-steps">
              {steps.map((s, n) => (
                <div className={n <= index ? "done" : ""} key={s}>
                  <span>{n < index ? <Check size={16} /> : n + 1}</span>
                  <small>{statusLabel(s as Order["status"])}</small>
                </div>
              ))}
            </div>
          )}
          <div className="order-facts">
            <span>
              <Clock size={15} />
              {indianTime(order.createdAt)}
            </span>
            <span className={paid ? "paid-label" : "unpaid-label"}>
              {paid
                ? "Paid at counter"
                : order.refunded
                  ? "Refund recorded"
                  : "Pay at counter"}
            </span>
          </div>
          <div className="tracking-items">
            {order.items.map((i, lineIndex) => (
              <div key={`${i.itemId}-${lineIndex}`}>
                <span>
                  <b>{i.quantity} ×</b> {i.name}
                </span>
                <strong>{money(i.quantity * i.price)}</strong>
              </div>
            ))}
          </div>
          <div className="bill">
            <div>
              <span>Taxable amount</span>
              <span>{money(order.amounts.taxable)}</span>
            </div>
            <TaxLines restaurant={order.restaurant} amounts={order.amounts} />
            <div className="bill-total">
              <strong>Total</strong>
              <strong>{money(order.amounts.total)}</strong>
            </div>
          </div>
          <section className="messages" ref={messageSectionRef}>
            <h2>Messages</h2>
            <div className="message-list">
              {order.messages.length ? (
                order.messages.map((message) => (
                  <div
                    className={`message message-${message.sender}`}
                    key={message.id}
                  >
                    <strong>
                      {message.sender === "staff" ? "Cafe77 team" : "You"}
                    </strong>
                    <p>{message.text}</p>
                    <small>{indianTime(message.at)}</small>
                  </div>
                ))
              ) : (
                <p className="muted">
                  Need anything? Send the counter a message.
                </p>
              )}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSending(true);
                setError("");
                try {
                  await api(
                    `/orders/${encodeURIComponent(token)}/messages`,
                    "POST",
                    { text: messageText },
                  );
                  setMessageText("");
                  setOrder(
                    await api<Order>(`/orders/${encodeURIComponent(token)}`),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setSending(false);
                }
              }}
            >
              <label className="field">
                Message to counter
                <textarea
                  required
                  rows={2}
                  maxLength={1000}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                />
              </label>
              <button
                className="btn secondary"
                disabled={sending || !messageText.trim()}
              >
                Send message
              </button>
            </form>
          </section>
          {order.status === "Cancelled" && order.paid > order.refunded && (
            <p className="alert">
              Payment is recorded. Contact the counter about your refund.
            </p>
          )}
          {paid && (
            <button className="btn full" onClick={() => setReceipt(true)}>
              <Printer size={17} /> View receipt
            </button>
          )}
          <p className="live-note">
            <span /> Updates automatically · Save this page’s link to return
          </p>
          {error && <p className="alert">{error}</p>}
        </section>
      </main>
      {receipt && <Receipt order={order} onClose={() => setReceipt(false)} />}
    </>
  );
}
export function Receipt({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  return (
    <div className="overlay receipt-overlay">
      <section
        className="modal receipt-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Payment receipt"
      >
        <div className="no-print modal-head">
          <h2>Your receipt</h2>
          <button onClick={onClose} aria-label="Close receipt">
            <X />
          </button>
        </div>
        <div className="receipt-paper">
          <img src={order.restaurant.logo} alt={order.restaurant.name} />
          <h2>{order.restaurant.name}</h2>
          <p>{order.restaurant.address}</p>
          {order.restaurant.gstin && <p>GSTIN: {order.restaurant.gstin}</p>}
          {order.restaurant.phone && <p>{order.restaurant.phone}</p>}
          <hr />
          <strong>Payment receipt · {order.number}</strong>
          <p>
            {indianTime(order.createdAt)} · Table {order.tableNumber}
          </p>
          <p>Customer: {order.name}</p>
          <div className="tracking-items">
            {order.items.map((i, lineIndex) => (
              <div key={`${i.itemId}-${lineIndex}`}>
                <span>
                  {i.name}
                  <small>
                    {i.quantity} × {money(i.price)}
                  </small>
                </span>
                <strong>{money(i.price * i.quantity)}</strong>
              </div>
            ))}
          </div>
          <div className="bill">
            <div>
              <span>Taxable amount</span>
              <span>{money(order.amounts.taxable)}</span>
            </div>
            <TaxLines restaurant={order.restaurant} amounts={order.amounts} />
            <div className="bill-total">
              <strong>Total</strong>
              <strong>{money(order.amounts.total)}</strong>
            </div>
            <div>
              <span>Paid at counter</span>
              <span>{money(order.paid)}</span>
            </div>
            {order.refunded > 0 && (
              <div>
                <span>Refund recorded</span>
                <span>{money(order.refunded)}</span>
              </div>
            )}
          </div>
          <p className="receipt-footer">{order.restaurant.receiptFooter}</p>
        </div>
        <button className="btn full no-print" onClick={() => window.print()}>
          <Printer size={17} /> Print / save as PDF
        </button>
      </section>
    </div>
  );
}
