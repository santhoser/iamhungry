import { api } from "./api";
import { buildWorkbook } from "./export-orders";
import type { MenuHistoryEntry } from "../shared/domain";

export async function exportMenuHistory(
  range: { from: string; to: string },
  query: string,
  filters: string[],
) {
  const entries: MenuHistoryEntry[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      ...range,
      q: query,
      filters: filters.join(","),
      page: String(page),
    });
    const result = await api<{ entries: MenuHistoryEntry[]; total: number }>(
      "/admin/menu/history?" + params,
    );
    entries.push(...result.entries);
    if (entries.length >= result.total || !result.entries.length) break;
  }
  const rows: (string | number)[][] = [
    [
      "Date and time (IST)",
      "Menu item ID",
      "Code",
      "Name",
      "Change type",
      "Changed by",
      "SystemComments",
      "UserComments",
      "IsPriceChange",
      "Old price (INR)",
      "New price (INR)",
      "Old out of stock",
      "New out of stock",
      "Old today special",
      "New today special",
      "Old dashboard favourite",
      "New dashboard favourite",
      "Old active",
      "New active",
    ],
    ...entries.map((entry) => [
      new Date(entry.changedAt).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour12: false,
      }),
      entry.menuItemId,
      entry.itemCode,
      entry.itemName,
      entry.changeType,
      entry.actor,
      entry.systemComments,
      entry.userComments,
      entry.isPriceChange ? "Yes" : "No",
      entry.oldPrice === null ? "" : entry.oldPrice / 100,
      entry.newPrice === null ? "" : entry.newPrice / 100,
      entry.oldRanOut === null ? "" : entry.oldRanOut ? "Yes" : "No",
      entry.newRanOut === null ? "" : entry.newRanOut ? "Yes" : "No",
      entry.oldTodaySpecial === null
        ? ""
        : entry.oldTodaySpecial
          ? "Yes"
          : "No",
      entry.newTodaySpecial === null
        ? ""
        : entry.newTodaySpecial
          ? "Yes"
          : "No",
      entry.oldDashboardFav === null
        ? ""
        : entry.oldDashboardFav
          ? "Yes"
          : "No",
      entry.newDashboardFav === null
        ? ""
        : entry.newDashboardFav
          ? "Yes"
          : "No",
      entry.oldActive === null ? "" : entry.oldActive ? "Yes" : "No",
      entry.newActive === null ? "" : entry.newActive ? "Yes" : "No",
    ]),
  ];
  const blob = new Blob([buildWorkbook(rows, "Menu history") as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cafe77-menu-history-${range.from}-to-${range.to}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
