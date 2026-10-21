import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
test("owner deletion uses app confirmations and linked groups stay protected", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const browserDialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    browserDialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.goto("/admin");
  await page.getByLabel("Username", { exact: true }).fill("reviewowner");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-Test-Password-42");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open staff navigation" }).click();
  await page.getByRole("button", { name: "Manage menu", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Delete group Coffee & tea",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "New group", exact: true }).click();
  await page
    .getByLabel("Group name", { exact: true })
    .fill("Temporary empty group");
  await page.getByRole("button", { name: "Save group", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Delete group Temporary empty group",
      exact: true,
    })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete group", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Temporary empty group", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Delete item Cake of the day", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Delete item Cake of the day",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete item Cake of the day", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete item", exact: true })
    .click();
  await expect(
    page.locator(".admin-menu-row").filter({ hasText: "Cake of the day" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Open staff navigation" }).click();
  await page
    .getByRole("button", { name: "Table QR codes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete table 15", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/cafe77-delete-confirmation.png",
    fullPage: true,
  });
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove table", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Table 15", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(browserDialogs).toEqual([]);
  await context.close();
});
test("mobile table checkout through staff payment, receipt and close", async ({
  browser,
}) => {
  const staff = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const admin = await staff.newPage();
  admin.on("dialog", (d) => d.accept());
  await admin.goto("/admin");
  await admin.getByLabel("Username", { exact: true }).fill("reviewowner");
  await admin
    .getByLabel("Password", { exact: true })
    .fill("Browser-Test-Password-42");
  await admin.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    admin.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await admin.screenshot({
    path: "test-results/cafe77-dashboard.png",
    fullPage: true,
  });
  await admin
    .getByRole("button", { name: "Table QR codes", exact: true })
    .click();
  await expect(
    admin.getByRole("heading", { name: "Table 1", exact: true }),
  ).toBeVisible();
  await expect(
    admin.getByAltText("Ordering QR for table 1", { exact: true }),
  ).toBeVisible();
  const href = await admin
    .getByRole("link", { name: "Open table menu" })
    .first()
    .getAttribute("href");
  const url = new URL(href!);
  const fixtureOrigin = new URL(admin.url());
  url.host = fixtureOrigin.host;
  url.protocol = fixtureOrigin.protocol;
  const customerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const customer = await customerContext.newPage();
  const consoleErrors: string[] = [];
  customer.on("pageerror", (e) => consoleErrors.push(e.message));
  admin.on("pageerror", (e) => consoleErrors.push(e.message));
  await customer.goto(url.toString());
  await expect(customer.getByText("Table 1", { exact: true })).toBeVisible();
  await customer.screenshot({
    path: "test-results/cafe77-mobile-menu.png",
    fullPage: true,
  });
  expect(
    await customer.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await customer
    .getByRole("textbox", { name: "Search menu" })
    .fill("Filter coffee");
  await customer.getByRole("button", { name: "Add", exact: true }).click();
  await customer
    .getByRole("button", { name: "Open cart", exact: true })
    .click();
  await customer.getByLabel("Your name", { exact: true }).fill("UI customer");
  await customer
    .getByRole("button", { name: "Place order", exact: true })
    .click();
  await expect(
    customer.getByRole("heading", { name: "Thanks, UI customer!" }),
  ).toBeVisible();
  const token = customer.url().split("/order/")[1];
  await customer.screenshot({
    path: "test-results/cafe77-mobile-tracking.png",
    fullPage: true,
  });
  await admin
    .getByRole("button", { name: "Current orders", exact: true })
    .click();
  await expect(
    admin.getByRole("button").filter({ hasText: "UI customer" }),
  ).toBeVisible();
  await admin.getByRole("button").filter({ hasText: "UI customer" }).click();
  const modal = admin.getByRole("dialog");
  await modal.getByRole("button", { name: "Accepted", exact: true }).click();
  await modal.getByRole("button", { name: "In progress", exact: true }).click();
  await modal.getByRole("button", { name: "Ready", exact: true }).click();
  await expect(
    modal.getByRole("button", { name: "Served & paid — close" }),
  ).toBeDisabled();
  await modal
    .getByRole("button", { name: "Mark as Paid", exact: true })
    .click();
  const paidConfirmation = admin.getByRole("alertdialog", {
    name: "Mark as Paid?",
  });
  await expect(paidConfirmation).toBeVisible();
  await expect(paidConfirmation).toContainText("₹80.00");
  await paidConfirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(
    modal.getByRole("button", { name: "Served & paid — close" }),
  ).toBeDisabled();
  await modal
    .getByRole("button", { name: "Mark as Paid", exact: true })
    .click();
  await admin
    .getByRole("alertdialog")
    .getByRole("button", { name: "Mark as Paid", exact: true })
    .click();
  await expect(
    modal.getByRole("button", { name: "Served & paid — close" }),
  ).toBeEnabled();
  await customer.reload();
  await customer
    .getByRole("button", { name: "View receipt", exact: true })
    .click();
  await expect(
    customer.getByRole("dialog", { name: "Payment receipt" }),
  ).toBeVisible();
  await expect(
    customer
      .getByRole("dialog", { name: "Payment receipt" })
      .getByText("CGST 2.5% (included)", { exact: true }),
  ).toBeVisible();
  await expect(
    customer
      .getByRole("dialog", { name: "Payment receipt" })
      .getByText("SGST 2.5% (included)", { exact: true }),
  ).toBeVisible();
  await customer.emulateMedia({ media: "print" });
  await expect(customer.locator(".receipt-paper")).toBeVisible();
  await customer.screenshot({
    path: "test-results/cafe77-receipt.png",
    fullPage: true,
  });
  await customer.emulateMedia({ media: "screen" });
  await modal.getByRole("button", { name: "Served & paid — close" }).click();
  await modal.getByRole("button", { name: "Close order", exact: true }).click();
  await expect(
    admin.getByRole("button").filter({ hasText: "UI customer" }),
  ).toHaveCount(0);
  await customer.goto("/order/" + token);
  await expect(
    customer.getByRole("heading", { name: "Thanks for stopping by!" }),
  ).toBeVisible();
  await admin
    .getByRole("button", { name: "Order history", exact: true })
    .click();
  await expect(
    admin.getByRole("button").filter({ hasText: "UI customer" }),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    admin.getByText("Orders completed", { exact: true }),
  ).toBeVisible();
  await expect(
    admin
      .locator(".stat-card")
      .filter({ hasText: "Sales" })
      .getByText("₹80.00", { exact: true }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
  await customerContext.close();
  await staff.close();
});
test("cashier stock controls and narrow staff layout", async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const p = await ctx.newPage();
  await p.goto("/admin");
  await p.getByLabel("Username", { exact: true }).fill("reviewcashier");
  await p
    .getByLabel("Password", { exact: true })
    .fill("Cashier-Test-Password-42");
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    p.getByRole("heading", { name: "Current orders", exact: true }),
  ).toBeVisible();
  expect(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await p.getByRole("button", { name: "Open staff navigation" }).click();
  await expect(
    p.getByRole("button", { name: "Restaurant settings", exact: true }),
  ).toHaveCount(0);
  await p.getByRole("button", { name: "Manage menu", exact: true }).click();
  await expect(
    p.getByRole("heading", { name: "Manage menu", exact: true }),
  ).toBeVisible();
  const row = p.locator(".admin-menu-row").filter({ hasText: "Filter coffee" });
  await row.getByRole("checkbox", { name: "Available", exact: true }).uncheck();
  await expect(
    row.getByRole("checkbox", { name: "Out of stock", exact: true }),
  ).not.toBeChecked();
  await row
    .getByRole("checkbox", { name: "Out of stock", exact: true })
    .check();
  await expect(
    row.getByRole("checkbox", { name: "Available", exact: true }),
  ).toBeChecked();
  await expect(
    p.getByRole("button", { name: "Add item", exact: true }),
  ).toHaveCount(0);
  expect(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await p.screenshot({
    path: "test-results/cafe77-mobile-cashier.png",
    fullPage: true,
  });
  await ctx.close();
});

test("counter order, customer conversation, and Excel history export", async ({
  browser,
}) => {
  const staff = await browser.newContext();
  const admin = await staff.newPage();
  await admin.goto("/admin");
  await admin.getByLabel("Username", { exact: true }).fill("reviewcashier");
  await admin
    .getByLabel("Password", { exact: true })
    .fill("Cashier-Test-Password-42");
  await admin.getByRole("button", { name: "Sign in", exact: true }).click();
  await admin.getByRole("button", { name: "Add order" }).click();
  const dialog = admin.getByRole("dialog", { name: "Add counter order" });
  await dialog.getByLabel("Customer name").fill("Counter guest");
  await expect(
    dialog.getByRole("heading", { name: "Today's picks" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Dashboard favourites" }),
  ).toBeVisible();
  await dialog
    .locator(".counter-quick-picks")
    .filter({ hasText: "Today's picks" })
    .getByRole("button", { name: "Add Filter coffee" })
    .click();
  await dialog.getByLabel("Find item by code or name").fill("C01");
  await expect(
    dialog
      .getByRole("listbox", { name: "Matching menu items" })
      .getByRole("button", { name: "Add Filter coffee" }),
  ).toBeVisible();
  await dialog.getByLabel("Find item by code or name").press("Enter");
  await expect(
    dialog
      .locator(".counter-selected-row")
      .filter({ hasText: "Filter coffee" })
      .locator("b"),
  ).toHaveText("2");
  const orderResponse = admin.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/orders") &&
      response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Create order" }).click();
  const created = await (await orderResponse).json();
  expect(created.order.tableNumber).toBe(1);
  await expect(
    admin.getByRole("dialog", { name: `Order ${created.order.number}` }),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Close order" }).click();
  const customer = await browser.newPage();
  await customer.goto(`/order/${created.token}`);
  await customer.getByLabel("Message to counter").fill("Please make it hot");
  await customer.getByRole("button", { name: "Send message" }).click();
  const row = admin.locator(".order-row").filter({ hasText: "Counter guest" });
  await expect(row).toHaveClass(/has-unread-message/, { timeout: 10000 });
  await expect(row.locator(".unread-message-icon")).toBeVisible();
  await row.click();
  await expect(admin.getByText("Please make it hot")).toBeVisible({
    timeout: 10000,
  });
  await expect(row).not.toHaveClass(/has-unread-message/, { timeout: 10000 });
  await admin.getByLabel("Reply to customer").fill("Sure, coming up");
  await admin.getByRole("button", { name: "Send message" }).click();
  await expect(customer.getByText("Sure, coming up")).toBeVisible({
    timeout: 10000,
  });
  await customer.getByRole("button", { name: "1 unread messages" }).click();
  await expect(
    customer.getByRole("button", { name: "1 unread messages" }),
  ).toHaveCount(0);
  await expect(customer.locator(".messages")).toBeInViewport();
  await admin.getByRole("button", { name: "Close order" }).click();
  await admin
    .getByRole("button", { name: "Order history", exact: true })
    .click();
  const download = admin.waitForEvent("download");
  await admin.getByRole("button", { name: "Export to Excel" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  await customer.close();
  await staff.close();
});

test("owner menu report and counter-only fee can be added to an open bill", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.goto("/admin");
  await page.getByLabel("Username", { exact: true }).fill("reviewowner");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-Test-Password-42");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Manage menu", exact: true }).click();
  await page.getByRole("button", { name: "New group" }).click();
  const groupDialog = page.getByRole("dialog", { name: "Edit menu group" });
  await groupDialog.getByLabel("Group name").fill("Browser counter fees");
  await groupDialog.getByRole("checkbox", { name: /Counter only/ }).check();
  await groupDialog.getByRole("button", { name: "Save group" }).click();
  await page.getByRole("button", { name: "Add item" }).click();
  const itemDialog = page.getByRole("dialog", { name: "Edit menu item" });
  await itemDialog
    .getByLabel("Name", { exact: true })
    .fill("Browser service fee");
  await itemDialog.getByLabel("Item code").fill("BROWSER-FEE");
  await itemDialog
    .getByRole("combobox", { name: "Group" })
    .selectOption({ label: "Browser counter fees" });
  await itemDialog.getByLabel("Price (₹)").fill("7.50");
  await itemDialog.getByRole("button", { name: "Save menu item" }).click();
  const feeRow = page
    .locator(".admin-menu-row")
    .filter({ hasText: "Browser service fee" });
  await feeRow.getByRole("button", { name: "Edit", exact: true }).click();
  await itemDialog.getByLabel("Price (₹)").fill("8.25");
  await itemDialog
    .getByLabel("Comment on this change (optional)")
    .fill("Browser price review");
  await itemDialog.getByRole("button", { name: "Save menu item" }).click();
  await page.getByRole("button", { name: "Menu reports" }).click();
  await page.getByLabel("Search menu history").fill("BROWSER-FEE");
  await page.getByRole("checkbox", { name: "Price changes" }).check();
  await expect(page.getByText("Browser price review")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export to Excel" }).click();
  expect((await download).suggestedFilename()).toMatch(/menu-history.*\.xlsx$/);
  await page
    .getByRole("button", { name: "Current orders", exact: true })
    .click();
  await page.getByRole("button", { name: "Add order" }).click();
  const createDialog = page.getByRole("dialog", { name: "Add counter order" });
  await createDialog.getByLabel("Customer name").fill("Browser fee guest");
  await createDialog
    .getByLabel("Find item by code or name")
    .fill("BROWSER-FEE");
  await createDialog
    .getByRole("listbox", { name: "Matching menu items" })
    .getByRole("button", { name: "Add Browser service fee" })
    .click();
  await createDialog.getByLabel("Item or fee name").fill("Custom parcel fee");
  await createDialog.getByLabel("Price (₹)").fill("2.25");
  await createDialog.getByRole("button", { name: "Add custom item" }).click();
  await createDialog.getByRole("button", { name: "Create order" }).click();
  const orderDialog = page.getByRole("dialog", { name: /^Order c77-/ });
  await expect(orderDialog.getByText("Custom parcel fee")).toBeVisible();
  await orderDialog.getByRole("button", { name: "Add items or fees" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add items to order" });
  await addDialog.getByLabel("Item or fee name").fill("Late service fee");
  await addDialog.getByLabel("Price (₹)").fill("1.00");
  await addDialog.getByRole("button", { name: "Add custom item" }).click();
  await addDialog.getByRole("button", { name: "Add to order" }).click();
  await expect(orderDialog.getByText("Late service fee")).toBeVisible();
  await page.close();
});

test("tags filter customer items and visible counter-only items require a counter visit", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.goto("/admin");
  await page.getByLabel("Username", { exact: true }).fill("reviewowner");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-Test-Password-42");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Manage menu", exact: true }).click();
  await page.getByRole("button", { name: "Tags", exact: true }).click();
  const tags = page.getByRole("dialog", { name: "Manage tags" });
  await tags.getByRole("button", { name: "Add tag" }).click();
  await tags.getByLabel("Tag name").fill("Browser Eggless");
  await tags.getByRole("button", { name: "Save tag" }).click();
  await expect(tags.getByText("Browser Eggless")).toBeVisible();
  await tags.getByRole("button", { name: "Close tags" }).click();
  await page.getByRole("button", { name: "Add item" }).click();
  const itemDialog = page.getByRole("dialog", { name: "Edit menu item" });
  await itemDialog.getByLabel("Name", { exact: true }).fill("Browser tagged item");
  await itemDialog.getByLabel("Item code").fill("BROWSER-TAGGED-ITEM");
  await itemDialog.getByLabel("Price (₹)").fill("4.00");
  await itemDialog.getByRole("checkbox", { name: "Browser Eggless" }).check();
  await itemDialog.getByRole("button", { name: "Save menu item" }).click();
  await page.getByRole("button", { name: "New group" }).click();
  const groupDialog = page.getByRole("dialog", { name: "Edit menu group" });
  await groupDialog.getByLabel("Group name").fill("Browser visible fees");
  await groupDialog
    .getByRole("checkbox", { name: "Counter only", exact: true })
    .check();
  await groupDialog
    .getByRole("checkbox", { name: /Show at customer menu/ })
    .check();
  await groupDialog.getByRole("button", { name: "Save group" }).click();
  await page.getByRole("button", { name: "Add item" }).click();
  await itemDialog
    .getByLabel("Name", { exact: true })
    .fill("Browser visible fee");
  await itemDialog.getByLabel("Item code").fill("BROWSER-VISIBLE-FEE");
  await itemDialog
    .getByRole("combobox", { name: "Group" })
    .selectOption({ label: "Browser visible fees" });
  await itemDialog.getByLabel("Price (₹)").fill("3.00");
  await itemDialog.getByRole("button", { name: "Save menu item" }).click();
  const customer = await browser.newPage();
  await customer.goto("/");
  await customer
    .getByRole("textbox", { name: "Search menu" })
    .fill("Browser Eggless");
  await expect(
    customer.getByRole("button", { name: "Browser tagged item", exact: true }),
  ).toBeVisible();
  await customer
    .getByRole("textbox", { name: "Search menu" })
    .fill("Browser visible fee");
  const feeCard = customer
    .locator(".product")
    .filter({ hasText: "Browser visible fee" });
  await expect(feeCard.getByText("Please visit the counter")).toBeVisible();
  await expect(
    feeCard.getByRole("button", { name: "Add", exact: true }),
  ).toHaveCount(0);
  await customer.close();
  await page.close();
});

test("order history status filters and polling stay scoped to current orders", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.goto("/admin");
  await page.getByLabel("Username", { exact: true }).fill("reviewowner");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-Test-Password-42");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  async function post(path: string, body: unknown) {
    return page.evaluate(
      async ({ path, body }) => {
        const response = await fetch("/api" + path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: response.status, data: await response.json() };
      },
      { path, body },
    );
  }
  async function create(name: string) {
    const response = await post("/admin/orders", {
      table: 1,
      name,
      requestKey: randomUUID(),
      items: [],
      customItems: [{ name: "Test fee", price: 100, quantity: 1 }],
    });
    expect(response.status).toBe(201);
    return response.data.order;
  }
  const newOrder = await create("History new guest");
  const acceptedOrder = await create("History accepted guest");
  const accepted = await post(`/admin/orders/${acceptedOrder.id}/status`, {
    status: "Accepted",
    version: acceptedOrder.version,
  });
  expect(accepted.status).toBe(200);
  const requests = { orders: 0, details: 0, menu: 0 };
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/admin/orders") requests.orders++;
    if (/^\/api\/admin\/orders\/\d+$/.test(path)) requests.details++;
    if (path === "/api/admin/menu") requests.menu++;
  });
  await page
    .getByRole("button", { name: "Order history", exact: true })
    .click();
  const filters = page.locator(".order-status-filters");
  await filters.getByRole("checkbox", { name: "New" }).check();
  await expect(
    page.locator(".order-row").filter({ hasText: "History new guest" }),
  ).toBeVisible();
  await expect(
    page.locator(".order-row").filter({ hasText: "History accepted guest" }),
  ).toHaveCount(0);
  await filters.getByRole("checkbox", { name: "Accepted" }).check();
  await expect(
    page.locator(".order-row").filter({ hasText: "History accepted guest" }),
  ).toBeVisible();
  await filters.getByRole("checkbox", { name: "New" }).uncheck();
  await expect(
    page.locator(".order-row").filter({ hasText: "History new guest" }),
  ).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export to Excel" }).click();
  const downloaded = await download;
  const workbook = unzipSync(readFileSync(await downloaded.path()));
  const sheet = new TextDecoder().decode(workbook["xl/worksheets/sheet1.xml"]);
  expect(sheet).toContain(acceptedOrder.number);
  expect(sheet).not.toContain(newOrder.number);
  await page
    .locator(".order-row")
    .filter({ hasText: "History accepted guest" })
    .click();
  await expect(
    page.getByRole("dialog", { name: `Order ${acceptedOrder.number}` }),
  ).toBeVisible();
  const historyCalls = { ...requests };
  await page.waitForTimeout(5500);
  expect(requests.orders).toBe(historyCalls.orders);
  expect(requests.details).toBe(historyCalls.details);
  await page.getByRole("button", { name: "Close order" }).click();
  await page.getByRole("button", { name: "Manage menu", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Manage menu" }),
  ).toBeVisible();
  const menuCalls = requests.menu;
  await page.waitForTimeout(5500);
  expect(requests.menu).toBe(menuCalls);
  await page
    .getByRole("button", { name: "Current orders", exact: true })
    .click();
  await expect(
    page.locator(".order-row").filter({ hasText: "History new guest" }),
  ).toBeVisible();
  const currentCalls = requests.orders;
  await page.waitForTimeout(5500);
  expect(requests.orders).toBeGreaterThan(currentCalls);
  await page.close();
});

test("owner staff view hides admin accounts while admin can manage owners", async ({
  browser,
}) => {
  const owner = await browser.newPage();
  await owner.goto("/admin");
  await owner.getByLabel("Username", { exact: true }).fill("reviewowner");
  await owner
    .getByLabel("Password", { exact: true })
    .fill("Browser-Test-Password-42");
  await owner.getByRole("button", { name: "Sign in", exact: true }).click();
  await owner.getByRole("button", { name: "Staff accounts" }).click();
  await expect(owner.getByRole("option", { name: "Admin" })).toHaveCount(0);
  await expect(owner.getByText("reviewadmin")).toHaveCount(0);
  await owner.close();
  const admin = await browser.newPage();
  await admin.goto("/admin");
  await admin.getByLabel("Username", { exact: true }).fill("reviewadmin");
  await admin
    .getByLabel("Password", { exact: true })
    .fill("Admin-Test-Password-42");
  await admin.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(admin.getByRole("heading", { name: "Overview" })).toBeVisible();
  await admin.getByRole("button", { name: "Staff accounts" }).click();
  await expect(admin.getByRole("option", { name: "Admin" })).toHaveCount(1);
  await expect(
    admin.locator(".staff-row").filter({ hasText: "reviewadmin" }),
  ).toBeVisible();
  await expect(
    admin.locator(".staff-row").filter({ hasText: "reviewowner" }),
  ).toBeVisible();
  await admin.close();
});
