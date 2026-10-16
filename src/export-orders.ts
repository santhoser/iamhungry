import { zipSync, strToU8 } from "fflate";
import type { Order } from "../shared/domain";
import { api } from "./api";
const exportTime = (date: string) =>
  new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const col = (index: number) => {
  let result = "";
  for (let n = index + 1; n; n = Math.floor((n - 1) / 26))
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
};

export async function exportHistory(
  range: { from: string; to: string },
  query: string,
) {
  const orders: Order[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      ...range,
      q: query,
      page: String(page),
      current: "false",
    });
    const result = await api<{ orders: Order[]; total: number }>(
      "/admin/orders?" + params,
    );
    orders.push(...result.orders);
    if (orders.length >= result.total || !result.orders.length) break;
  }
  const blob = new Blob([buildOrderWorkbook(orders) as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cafe77-orders-${range.from}-to-${range.to}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildOrderWorkbook(orders: Order[]) {
  const rows: (string | number)[][] = [
    [
      "Order ID",
      "Table no",
      "Name",
      "Number of items",
      "Total amount (INR)",
      "GST (INR)",
      "Date and time (IST)",
      "Status",
    ],
    ...orders.map((o) => [
      o.number,
      o.tableNumber,
      o.name,
      o.items.reduce((sum, item) => sum + item.quantity, 0),
      o.amounts.total / 100,
      o.amounts.gst / 100,
      exportTime(o.createdAt),
      o.status,
    ]),
  ];
  const sheetRows = rows
    .map(
      (row, i) =>
        `<row r="${i + 1}">${row
          .map((value, j) => {
            const ref = col(j) + (i + 1);
            return typeof value === "number"
              ? `<c r="${ref}"><v>${value}</v></c>`
              : `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
          })
          .join("")}</row>`,
    )
    .join("");
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Order history" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
  };
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, xml]) => [name, strToU8(xml)]),
    ),
  );
}
