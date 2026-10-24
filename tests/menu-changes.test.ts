import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDatabase, hashPassword } from "../server/db.js";
import { createApp } from "../server/app.js";

test("menu history, counter-only access, custom charges and appended payment", async () => {
  const db = openDatabase(":memory:");
  db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
    "owner",
    hashPassword("Test-owner-password-42"),
    "owner",
  );
  db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
    "cashier",
    hashPassword("Test-cashier-password-42"),
    "cashier",
  );
  const app = createApp(db);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      data: (await response.json()) as any,
      cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
    };
  }
  try {
    const owner = (
      await call("/auth/login", "POST", {
        username: "owner",
        password: "Test-owner-password-42",
      })
    ).cookie;
    const cashier = (
      await call("/auth/login", "POST", {
        username: "cashier",
        password: "Test-cashier-password-42",
      })
    ).cookie;
    const initial = await call("/admin/menu", "GET", undefined, owner);
    const item = initial.data.items[0];
    assert.equal(
      (
        await call(
          "/admin/tags",
          "POST",
          { name: "Eggless", image: "" },
          cashier,
        )
      ).status,
      403,
    );
    assert.equal(
      (await call("/admin/tags", "POST", { name: "Eggless", image: "" }, owner))
        .status,
      200,
    );
    assert.equal(
      (await call("/admin/tags", "POST", { name: "eggless", image: "" }, owner))
        .status,
      409,
    );
    const tag = (await call("/admin/menu", "GET", undefined, owner)).data
      .tags[0];
    assert.equal(
      (
        await call(
          `/admin/menu/${item.id}`,
          "PUT",
          { ...item, tagIds: [tag.id] },
          owner,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call("/menu")).data.items.find((i: any) => i.id === item.id)
        .tags[0].name,
      "Eggless",
    );
    assert.equal(
      (
        await call(
          `/admin/tags/${tag.id}`,
          "PUT",
          { name: "Vegan", image: "" },
          owner,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call("/menu")).data.items.find((i: any) => i.id === item.id)
        .tags[0].name,
      "Vegan",
    );
    assert.equal(
      (await call(`/admin/tags/${tag.id}`, "DELETE", {}, owner)).status,
      200,
    );
    assert.deepEqual(
      (await call("/menu")).data.items.find((i: any) => i.id === item.id).tags,
      [],
    );
    const price = item.price + 125;
    assert.equal(
      (
        await call(
          `/admin/menu/${item.id}`,
          "PUT",
          { ...item, price, userComments: "Supplier price changed" },
          owner,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          `/admin/menu/${item.id}`,
          "PUT",
          { ...item, price, userComments: "No actual change" },
          owner,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          `/admin/menu/${item.id}/stock`,
          "PUT",
          { ranOut: true },
          cashier,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          `/admin/menu/${item.id}/stock`,
          "PUT",
          { ranOut: true },
          cashier,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call("/admin/menu/history", "GET", undefined, cashier)).status,
      403,
    );
    const history = await call(
      "/admin/menu/history?filters=price,stock_out",
      "GET",
      undefined,
      owner,
    );
    assert.equal(history.data.total, 2);
    assert.equal(
      history.data.entries.find((e: any) => e.isPriceChange).userComments,
      "Supplier price changed",
    );
    assert.equal(
      history.data.entries.find((e: any) => e.changeType === "stock")
        .userComments,
      "",
    );
    assert.equal(
      history.data.entries.find((e: any) => e.isPriceChange).oldPrice,
      item.price,
    );
    assert.equal(
      (await call("/admin/menu/history?filters=bad", "GET", undefined, owner))
        .status,
      400,
    );
    assert.equal(
      (
        await call(
          "/admin/groups",
          "POST",
          {
            name: "Counter fees",
            image: "",
            active: true,
            sort: 99,
            counterOnly: true,
          },
          owner,
        )
      ).status,
      200,
    );
    const group = (
      await call("/admin/menu", "GET", undefined, owner)
    ).data.groups.find((g: any) => g.name === "Counter fees");
    assert.equal(group.counterOnly, true);
    assert.equal(
      (
        await call(
          "/admin/menu",
          "POST",
          {
            ...item,
            groupId: group.id,
            code: "FEE-1",
            name: "Service fee",
            price: 5000,
            ranOut: false,
            userComments: "",
          },
          owner,
        )
      ).status,
      200,
    );
    const fee = (
      await call("/admin/menu", "GET", undefined, owner)
    ).data.items.find((i: any) => i.code === "FEE-1");
    const token = (await call("/admin/tables", "GET", undefined, owner)).data[0]
      .token;
    assert.equal(
      (await call(`/menu?table=${token}`)).data.items.some(
        (i: any) => i.id === fee.id,
      ),
      false,
    );
    assert.equal(
      (
        await call(
          `/admin/groups/${group.id}`,
          "PUT",
          { ...group, customerVisible: true },
          owner,
        )
      ).status,
      200,
    );
    const visibleMenu = (await call(`/menu?table=${token}`)).data;
    assert.equal(
      visibleMenu.items.some((i: any) => i.id === fee.id),
      true,
    );
    assert.equal(
      visibleMenu.groups.find((g: any) => g.id === group.id).counterOnly,
      true,
    );
    assert.equal(
      (
        await call("/orders", "POST", {
          table: token,
          name: "Guest",
          phone: "9876543210",
          requestKey: randomUUID(),
          items: [{ id: fee.id, quantity: 1 }],
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call("/orders", "POST", {
          table: token,
          name: "Guest",
          phone: "9876543210",
          requestKey: randomUUID(),
          items: [{ id: initial.data.items[1].id, quantity: 1 }],
          customItems: [{ name: "Forged", price: 1, quantity: 1 }],
        })
      ).status,
      400,
    );
    const customOnly = await call(
      "/admin/orders",
      "POST",
      {
        table: 1,
        name: "Custom guest",
        requestKey: randomUUID(),
        items: [],
        customItems: [{ name: "One-off meal", price: 1234, quantity: 1 }],
      },
      cashier,
    );
    assert.equal(customOnly.status, 201);
    assert.equal(customOnly.data.order.items[0].name, "One-off meal");
    const created = await call(
      "/admin/orders",
      "POST",
      {
        table: 1,
        name: "Guest",
        phone: "9876543210",
        requestKey: randomUUID(),
        items: [{ id: fee.id, quantity: 1 }],
        customItems: [{ name: "Parcel fee", price: 275, quantity: 2 }],
      },
      cashier,
    );
    assert.equal(created.status, 201);
    let order = created.data.order;
    assert.equal(order.items.length, 2);
    assert.equal(order.items.find((i: any) => i.custom).price, 275);
    assert.equal(
      (
        await call(
          `/admin/orders/${order.id}/payment`,
          "POST",
          { kind: "payment", paymentMode: "Cash", version: order.version },
          cashier,
        )
      ).status,
      200,
    );
    order = (await call(`/admin/orders/${order.id}`, "GET", undefined, cashier))
      .data;
    const paid = order.paid;
    assert.equal(
      (
        await call(
          `/admin/orders/${order.id}/items`,
          "POST",
          { version: order.version - 1, items: [{ id: fee.id, quantity: 1 }] },
          cashier,
        )
      ).status,
      409,
    );
    const appended = await call(
      `/admin/orders/${order.id}/items`,
      "POST",
      {
        version: order.version,
        customItems: [{ name: "Extra sauce", price: 200, quantity: 1 }],
      },
      cashier,
    );
    assert.equal(appended.status, 200);
    order = appended.data;
    assert.equal(order.items.length, 3);
    assert.ok(order.amounts.total > paid);
    assert.equal(
      (
        await call(
          `/admin/orders/${order.id}/payment`,
          "POST",
          { kind: "payment", paymentMode: "Cash", version: order.version },
          cashier,
        )
      ).status,
      200,
    );
    order = (await call(`/admin/orders/${order.id}`, "GET", undefined, cashier))
      .data;
    assert.equal(order.paid, order.amounts.total);
    for (const status of ["Accepted", "InProgress", "Ready", "Closed"]) {
      const changed = await call(
        `/admin/orders/${order.id}/status`,
        "POST",
        { status, version: order.version },
        cashier,
      );
      assert.equal(changed.status, 200);
      order = changed.data;
    }
    assert.equal(
      (
        await call(
          `/admin/orders/${order.id}/items`,
          "POST",
          {
            version: order.version,
            customItems: [{ name: "Too late", price: 100, quantity: 1 }],
          },
          cashier,
        )
      ).status,
      409,
    );
    const newOnly = await call(
      "/admin/orders?current=false&statuses=New",
      "GET",
      undefined,
      cashier,
    );
    assert.equal(newOnly.data.total, 1);
    assert.equal(newOnly.data.orders[0].id, customOnly.data.order.id);
    const mixed = await call(
      "/admin/orders?current=false&statuses=New,Closed",
      "GET",
      undefined,
      cashier,
    );
    assert.equal(mixed.data.total, 2);
    assert.equal(
      (
        await call(
          "/admin/orders?current=false&statuses=Cancelled",
          "GET",
          undefined,
          cashier,
        )
      ).data.total,
      0,
    );
    assert.equal(
      (await call("/admin/orders?statuses=Unknown", "GET", undefined, cashier))
        .status,
      400,
    );
  } finally {
    server.close();
    db.close();
  }
});
