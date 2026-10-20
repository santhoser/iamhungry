import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../../workers/crypto.js";
import { dispatch, openWorkersDatabase } from "./fixture.js";

test("D1 menu change history and counter charges survive guarded writes", async () => {
  const db = openWorkersDatabase();
  try {
    db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
      "owner",
      await hashPassword("Test-owner-password-42"),
      "owner",
    );
    db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
      "cashier",
      await hashPassword("Test-cashier-password-42"),
      "cashier",
    );
    const owner = (
      await dispatch(db, "/api/auth/login", "POST", {
        username: "owner",
        password: "Test-owner-password-42",
      })
    ).cookie;
    const cashier = (
      await dispatch(db, "/api/auth/login", "POST", {
        username: "cashier",
        password: "Test-cashier-password-42",
      })
    ).cookie;
    const menu = await dispatch(db, "/api/admin/menu", "GET", undefined, owner);
    const item = (menu.data as any).items[0];
    assert.equal(
      (
        await dispatch(
          db,
          "/api/admin/tags",
          "POST",
          { name: "Eggless", image: "" },
          cashier,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await dispatch(
          db,
          "/api/admin/tags",
          "POST",
          { name: "Eggless", image: "" },
          owner,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await dispatch(
          db,
          "/api/admin/tags",
          "POST",
          { name: "eggless", image: "" },
          owner,
        )
      ).status,
      409,
    );
    const tag = (
      (await dispatch(db, "/api/admin/menu", "GET", undefined, owner))
        .data as any
    ).tags[0];
    assert.equal(
      (
        await dispatch(
          db,
          `/api/admin/menu/${item.id}`,
          "PUT",
          { ...item, tagIds: [tag.id] },
          owner,
        )
      ).status,
      200,
    );
    assert.equal(
      ((await dispatch(db, "/api/menu")).data as any).items.find(
        (i: any) => i.id === item.id,
      ).tags[0].name,
      "Eggless",
    );
    assert.equal(
      (
        await dispatch(
          db,
          `/api/admin/tags/${tag.id}`,
          "PUT",
          { name: "Vegan", image: "" },
          owner,
        )
      ).status,
      200,
    );
    assert.equal(
      ((await dispatch(db, "/api/menu")).data as any).items.find(
        (i: any) => i.id === item.id,
      ).tags[0].name,
      "Vegan",
    );
    assert.equal(
      (await dispatch(db, `/api/admin/tags/${tag.id}`, "DELETE", {}, owner))
        .status,
      200,
    );
    assert.deepEqual(
      ((await dispatch(db, "/api/menu")).data as any).items.find(
        (i: any) => i.id === item.id,
      ).tags,
      [],
    );
    assert.equal(
      (
        await dispatch(
          db,
          `/api/admin/menu/${item.id}`,
          "PUT",
          { ...item, price: item.price + 100, userComments: "Cost adjustment" },
          owner,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await dispatch(
          db,
          `/api/admin/menu/${item.id}/stock`,
          "PUT",
          { ranOut: true },
          cashier,
        )
      ).status,
      200,
    );
    const report = await dispatch(
      db,
      "/api/admin/menu/history?filters=price,stock_out",
      "GET",
      undefined,
      owner,
    );
    assert.equal((report.data as any).total, 2);
    assert.equal(
      (report.data as any).entries.find((e: any) => e.isPriceChange)
        .userComments,
      "Cost adjustment",
    );
    assert.equal(
      (await dispatch(db, "/api/admin/menu/history", "GET", undefined, cashier))
        .status,
      403,
    );
    assert.equal(
      (
        await dispatch(
          db,
          "/api/admin/groups",
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
      await dispatch(db, "/api/admin/menu", "GET", undefined, owner)
    ).data as any;
    const feeGroup = group.groups.find((g: any) => g.name === "Counter fees");
    assert.equal(feeGroup.counterOnly, true);
    assert.equal(
      (
        await dispatch(
          db,
          "/api/admin/menu",
          "POST",
          {
            ...item,
            groupId: feeGroup.id,
            code: "FEE-D1",
            name: "Service fee",
            price: 500,
            ranOut: false,
          },
          owner,
        )
      ).status,
      200,
    );
    const fee = (
      (await dispatch(db, "/api/admin/menu", "GET", undefined, owner))
        .data as any
    ).items.find((i: any) => i.code === "FEE-D1");
    const publicMenu = (await dispatch(db, "/api/menu")).data as any;
    assert.equal(
      publicMenu.items.some((i: any) => i.id === fee.id),
      false,
    );
    assert.equal(
      (
        await dispatch(
          db,
          `/api/admin/groups/${feeGroup.id}`,
          "PUT",
          { ...feeGroup, customerVisible: true },
          owner,
        )
      ).status,
      200,
    );
    const visibleMenu = (await dispatch(db, "/api/menu")).data as any;
    assert.equal(
      visibleMenu.items.some((i: any) => i.id === fee.id),
      true,
    );
    assert.equal(
      visibleMenu.groups.find((g: any) => g.id === feeGroup.id).counterOnly,
      true,
    );
    const tableToken = (
      (await dispatch(db, "/api/admin/tables", "GET", undefined, owner))
        .data as any
    )[0].token;
    assert.equal(
      (
        await dispatch(db, "/api/orders", "POST", {
          table: tableToken,
          name: "Guest",
          requestKey: randomUUID(),
          items: [{ id: fee.id, quantity: 1 }],
        })
      ).status,
      409,
    );
    const customOnly = await dispatch(
      db,
      "/api/admin/orders",
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
    assert.equal((customOnly.data as any).order.items[0].name, "One-off meal");
    const placed = await dispatch(
      db,
      "/api/admin/orders",
      "POST",
      {
        table: 1,
        name: "Guest",
        requestKey: randomUUID(),
        items: [{ id: fee.id, quantity: 1 }],
        customItems: [{ name: "Parcel", price: 200, quantity: 1 }],
      },
      cashier,
    );
    assert.equal(placed.status, 201);
    let order = (placed.data as any).order;
    assert.equal(order.items.length, 2);
    const paid = await dispatch(
      db,
      `/api/admin/orders/${order.id}/payment`,
      "POST",
      { kind: "payment", version: order.version },
      cashier,
    );
    assert.equal(paid.status, 200);
    order = paid.data as any;
    const appended = await dispatch(
      db,
      `/api/admin/orders/${order.id}/items`,
      "POST",
      {
        version: order.version,
        customItems: [{ name: "Extra", price: 125, quantity: 1 }],
      },
      cashier,
    );
    assert.equal(appended.status, 200);
    order = appended.data as any;
    assert.equal(order.items.length, 3);
    assert.ok(order.amounts.total > order.paid);
    assert.equal(
      (
        await dispatch(
          db,
          `/api/admin/orders/${order.id}/payment`,
          "POST",
          { kind: "payment", version: order.version },
          cashier,
        )
      ).status,
      200,
    );
    const accepted = await dispatch(
      db,
      `/api/admin/orders/${order.id}/status`,
      "POST",
      { status: "Accepted", version: order.version + 1 },
      cashier,
    );
    assert.equal(accepted.status, 200);
    const newOnly = await dispatch(
      db,
      "/api/admin/orders?current=false&statuses=New",
      "GET",
      undefined,
      cashier,
    );
    assert.equal((newOnly.data as any).total, 1);
    assert.equal(
      (newOnly.data as any).orders[0].id,
      (customOnly.data as any).order.id,
    );
    assert.equal(
      (
        (
          await dispatch(
            db,
            "/api/admin/orders?current=false&statuses=New,Accepted",
            "GET",
            undefined,
            cashier,
          )
        ).data as any
      ).total,
      2,
    );
    assert.equal(
      (
        (
          await dispatch(
            db,
            "/api/admin/orders?current=false&statuses=Closed",
            "GET",
            undefined,
            cashier,
          )
        ).data as any
      ).total,
      0,
    );
    assert.equal(
      (
        await dispatch(
          db,
          "/api/admin/orders?statuses=Unknown",
          "GET",
          undefined,
          cashier,
        )
      ).status,
      400,
    );
  } finally {
    db.close();
  }
});
