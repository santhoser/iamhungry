import { money, type MenuHistoryEntry, type MenuItem } from "./domain.js";

export function menuChange(before: MenuItem | null, after: MenuItem | null) {
  const changed: string[] = [];
  if (!before && after) changed.push("Item created");
  else if (before && !after) changed.push("Item discontinued");
  else if (before && after) {
    const describe: [keyof MenuItem, string, (value: any) => string][] = [
      ["groupId", "Group", String],
      ["code", "Code", String],
      ["name", "Name", String],
      ["price", "Price", money],
      ["details", "Details", String],
      ["calories", "Nutrition", String],
      ["showCalories", "Show nutrition", String],
      ["ingredients", "Ingredients", String],
      ["showIngredients", "Show ingredients", String],
      ["images", "Images", (value) => JSON.stringify(value)],
      ["video", "Video", String],
      ["active", "Active", String],
      ["ranOut", "Out of stock", String],
      ["todaySpecial", "Today's special", String],
      ["dashboardFav", "Dashboard favourite", String],
      [
        "tags",
        "Tags",
        (value) => value.map((tag: { name: string }) => tag.name).join(", "),
      ],
    ];
    for (const [key, label, format] of describe)
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
        changed.push(
          `${label}: ${format(before[key])} → ${format(after[key])}`,
        );
  }
  return {
    changed,
    systemComments: changed.join("; "),
    isPriceChange: !!before && !!after && before.price !== after.price,
  };
}

export const menuHistoryInsert =
  "INSERT INTO menu_history(menu_item_id,item_code,item_name,changed_at,actor,change_type,system_comments,user_comments,is_price_change,old_price,new_price,old_ran_out,new_ran_out,old_today_special,new_today_special,old_dashboard_fav,new_dashboard_fav,old_active,new_active,before_json,after_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
export function menuHistoryValues(
  before: MenuItem | null,
  after: MenuItem | null,
  actor: string,
  changeType: MenuHistoryEntry["changeType"],
  userComments = "",
  changedAt = new Date().toISOString(),
) {
  const change = menuChange(before, after);
  const item = after ?? before!;
  return {
    changed: change.changed.length > 0,
    values: [
      item.id,
      item.code,
      item.name,
      changedAt,
      actor,
      changeType,
      change.systemComments,
      userComments,
      +change.isPriceChange,
      before?.price ?? null,
      after?.price ?? null,
      before ? +before.ranOut : null,
      after ? +after.ranOut : null,
      before ? +before.todaySpecial : null,
      after ? +after.todaySpecial : null,
      before ? +before.dashboardFav : null,
      after ? +after.dashboardFav : null,
      before ? +before.active : null,
      after ? +after.active : null,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
    ],
  };
}

export function hydrateMenuHistory(row: any): MenuHistoryEntry {
  return {
    id: row.id,
    menuItemId: row.menu_item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    changedAt: row.changed_at,
    actor: row.actor,
    changeType: row.change_type,
    systemComments: row.system_comments,
    userComments: row.user_comments,
    isPriceChange: !!row.is_price_change,
    oldPrice: row.old_price,
    newPrice: row.new_price,
    oldRanOut: row.old_ran_out === null ? null : !!row.old_ran_out,
    newRanOut: row.new_ran_out === null ? null : !!row.new_ran_out,
    oldTodaySpecial:
      row.old_today_special === null ? null : !!row.old_today_special,
    newTodaySpecial:
      row.new_today_special === null ? null : !!row.new_today_special,
    oldDashboardFav:
      row.old_dashboard_fav === null ? null : !!row.old_dashboard_fav,
    newDashboardFav:
      row.new_dashboard_fav === null ? null : !!row.new_dashboard_fav,
    oldActive: row.old_active === null ? null : !!row.old_active,
    newActive: row.new_active === null ? null : !!row.new_active,
    before: row.before_json ? JSON.parse(row.before_json) : null,
    after: row.after_json ? JSON.parse(row.after_json) : null,
  };
}

const menuHistoryFilters: Record<string, string> = {
  price: "is_price_change=1",
  stock_out: "old_ran_out=0 AND new_ran_out=1",
  stock_in: "old_ran_out=1 AND new_ran_out=0",
  today_special:
    "old_today_special IS NOT NULL AND new_today_special IS NOT NULL AND old_today_special IS NOT new_today_special",
  dashboard_fav:
    "old_dashboard_fav IS NOT NULL AND new_dashboard_fav IS NOT NULL AND old_dashboard_fav IS NOT new_dashboard_fav",
  visibility:
    "old_active IS NOT NULL AND new_active IS NOT NULL AND old_active IS NOT new_active",
  created: "change_type='created'",
  deleted: "change_type='deleted'",
};
export const menuHistoryFilterOptions = Object.keys(menuHistoryFilters);
export function menuHistoryWhere(
  from: string,
  to: string,
  search: string,
  filters: string[],
) {
  const where = [
    "changed_at>=?",
    "changed_at<?",
    "(instr(lower(item_code),lower(?))>0 OR instr(lower(item_name),lower(?))>0)",
  ];
  if (filters.length)
    where.push(
      `(${filters.map((filter) => `(${menuHistoryFilters[filter]})`).join(" OR ")})`,
    );
  return { sql: where.join(" AND "), params: [from, to, search, search] };
}
