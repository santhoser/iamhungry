// Regenerate the baseline menu SQL after editing the reviewed catalogue.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const catalogue = JSON.parse(
  readFileSync(new URL("shared/menu-catalogue.json", root), "utf8"),
);
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const statements = [];
const ids = new Set(catalogue.groups.map((group) => group.id));
const codes = new Set();
for (const group of catalogue.groups) {
  statements.push(
    `INSERT INTO groups(id,name,image,sort) VALUES(${group.id},${quote(group.name)},${quote(group.image)},${group.sort});`,
  );
}
for (const item of catalogue.items) {
  if (
    !ids.has(item.groupId) ||
    !Number.isSafeInteger(item.price) ||
    item.price < 0 ||
    codes.has(item.code)
  )
    throw Error("Invalid catalogue item: " + item.code);
  codes.add(item.code);
  statements.push(
    `INSERT INTO menu(id,group_id,code,name,price,images,today_special,dashboard_fav) VALUES(${item.id},${item.groupId},${quote(item.code)},${quote(item.name)},${item.price},${quote(JSON.stringify(item.images))},${Number(item.todaySpecial)},${Number(item.dashboardFav)});`,
  );
}
const path = new URL("migrations/0001_cafe77.sql", root);
const schema = readFileSync(path, "utf8").split("-- BEGIN GENERATED MENU")[0];
writeFileSync(
  path,
  schema + "-- BEGIN GENERATED MENU\n" + statements.join("\n") + "\n",
);
console.log(
  `Updated ${fileURLToPath(path)}: ${ids.size} groups, ${codes.size} items.`,
);
