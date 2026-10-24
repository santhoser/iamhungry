// Original Cafe77 vector artwork. Run before build-menu-seed.mjs after catalogue edits.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { arts, plate } from "./generate-assets.mjs";

const file = new URL("../shared/menu-catalogue.json", import.meta.url);
const catalogue = JSON.parse(readFileSync(file, "utf8"));
const directory = new URL("../public/illustrations/menu/", import.meta.url);
mkdirSync(directory, { recursive: true });
const cream = "#fff1d0";
const cocoa = "#744b35";
const green = "#7d9454";
const dot = (x, y, r, fill) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const ellipse = (x, y, rx, ry, fill) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const leaf = (x, y) =>
  `<path d="M${x} ${y}q-23-32-31-15 4 16 31 15q3-33 20-24 7 14-20 24" fill="${green}"/>`;
function palette(item) {
  const name = item.name.toLowerCase();
  if (/beetroot|watermelon|red guava|dragon/.test(name))
    return ["#db9290", "#b95d59"];
  if (/choco|mocca|mocha|brown|oreo|kitkat|snicker|belgian|ferrero/.test(name))
    return ["#986548", "#57372b"];
  if (/red.?velvet|chocored|red bee/.test(name)) return ["#bc5650", "#81352e"];
  if (
    /blue.?berry|black.?curr|blackcurr|black.?current|berry up|berries/.test(
      name,
    )
  )
    return ["#a58aaf", "#695078"];
  if (/straw|rooh|rose/.test(name)) return ["#e7a0a2", "#b95162"];
  if (/blue lagoon/.test(name)) return ["#83c6ce", "#438a98"];
  if (/mango|orange|sunset|passion|tropical/.test(name))
    return ["#edbd62", "#d48c3b"];
  if (/pista|apple|mint|lime|cucumber|gooseberry|nellikka|tzatziki/.test(name))
    return ["#c4cf94", "#7c9458"];
  if (/beet|red guava|watermelon|dragon/.test(name))
    return ["#db9290", "#b95d59"];
  if (/coconut|vanilla|white|milk|malai/.test(name))
    return ["#f4e7c7", "#c5a77d"];
  if (
    /caramel|biscoff|butter|dates|honey|almond|nut|sharj|banana|fig/.test(name)
  )
    return ["#d6b17b", "#a97d4e"];
  return ["#e4c791", "#b58a57"];
}
const nuts = (x = 250, y = 105) =>
  `<g fill="#a87b49"><ellipse cx="${x - 20}" cy="${y}" rx="8" ry="4" transform="rotate(25 ${x - 20} ${y})"/><ellipse cx="${x + 15}" cy="${y + 5}" rx="7" ry="4"/><ellipse cx="${x + 2}" cy="${y - 8}" rx="4" ry="7"/></g>`;
const cherry = (x = 250, y = 87) =>
  dot(x, y, 11, "#ad4d3c") +
  `<path d="M${x} ${y - 9}q1-18 10-22" fill="none" stroke="${green}" stroke-width="4"/>`;
const whipped = `<path d="M192 112q-8-20 17-25-4-20 20-25-2-13 17-20 5 17 27 22 22 5 17 22 27 7 18 26z" fill="${cream}"/>`;
const glassShadow = ellipse(252, 290, 82, 19, "#d9bd97");
function drink(item, type) {
  const [fill, dark] = palette(item);
  const n = item.name.toLowerCase();
  const straw = `<path d="M284 241l22-199h31" fill="none" stroke="#a96e50" stroke-width="7" stroke-linecap="round"/>`;
  const glass =
    glassShadow +
    `<path d="M177 85h146l-18 188q-54 31-110 0z" fill="#fff7df"/><path d="M187 113h126l-16 153q-45 25-94 0z" fill="${fill}"/>`;
  const shine = `<path d="M197 125l12 123" stroke="#fff9e9" stroke-width="7" opacity=".45" stroke-linecap="round"/>`;
  if (type === "falooda")
    return (
      glassShadow +
      `<path d="M182 104h138l-16 159q-51 32-106 0z" fill="#fff5d8"/><path d="M192 172h117l-6 49H198z" fill="${fill}"/><path d="M198 223h105l-4 39q-49 23-96 0z" fill="${dark}" opacity=".75"/><path d="M195 182q48-14 111 0m-108 15q50-14 107 0" fill="none" stroke="${cream}" stroke-width="4"/>` +
      dot(224, 127, 30, cream) +
      dot(272, 125, 32, fill) +
      dot(249, 96, 30, cream) +
      nuts(252, 104) +
      cherry(256, 65) +
      straw +
      shine
    );
  if (type === "shake")
    return (
      glass +
      `<path d="M189 212q45-13 112 0l-5 48q-46 25-91 0z" fill="${dark}" opacity=".25"/>` +
      (/sugar/.test(item.category || "") ? "" : whipped) +
      (/oreo|cookie|kitkat|biscoff/.test(n)
        ? `<path d="M268 58l40 12-14 62-39-12z" fill="${dark}"/><path d="M280 70l-10 42m16-38l-10 42" stroke="${fill}" stroke-width="3"/>`
        : nuts()) +
      straw +
      shine
    );
  if (type === "coffee")
    return (
      glassShadow +
      `<path d="M180 92h142l-18 181q-53 28-106 0z" fill="#fff4d8"/><path d="M190 122h122l-16 144q-44 22-90 0z" fill="#b38a62"/><path d="M196 205h108l-7 60q-45 22-90 0z" fill="${cocoa}"/><ellipse cx="251" cy="122" rx="61" ry="17" fill="#ead6b4"/>` +
      straw +
      shine
    );
  const ice = `<g fill="#fff9e6" opacity=".6"><rect x="205" y="131" width="29" height="29" rx="5" transform="rotate(12 220 145)"/><rect x="264" y="161" width="29" height="30" rx="5" transform="rotate(-12 279 175)"/></g>`;
  const citrus = `<circle cx="190" cy="100" r="31" fill="${dark}"/><circle cx="190" cy="100" r="25" fill="#fff0b9"/><path d="M190 77v46m-23-23h46m-39-16l32 32m-32 0l32-32" stroke="${fill}" stroke-width="3"/>`;
  return (
    glass +
    ice +
    straw +
    (type === "juice" ? leaf(194, 107) : citrus + leaf(205, 96)) +
    shine
  );
}
function cake(item, whole = false) {
  const [fill, dark] = palette(item);
  const n = item.name.toLowerCase();
  const icing = /red.?velvet|black forest|white|cheese|tres|rasmalai/.test(n)
    ? cream
    : fill;
  if (whole)
    return (
      plate +
      `<path d="M157 157h190v77q-95 57-190 0z" fill="${dark}"/><path d="M157 182q95 46 190 0v23q-95 46-190 0z" fill="${cream}"/><ellipse cx="252" cy="158" rx="95" ry="43" fill="${icing}"/><path d="M159 158v32q9 17 18 0v-8q9-17 18 0v11q9 17 18 0v-4q9-17 18 0" fill="${icing}"/>` +
      Array.from({ length: 7 }, (_, i) =>
        dot(185 + i * 22, 142 + (i % 2) * 17, 7, cream),
      ).join("") +
      (/forest/.test(n) ? cherry(219, 129) + cherry(281, 136) : nuts(252, 141))
    );
  return (
    plate +
    `<path d="M177 145l153 53v62l-153 23z" fill="${dark}"/><path d="M177 177l153 37v17l-153 10z" fill="${cream}"/><path d="M177 133l153 57-153 46z" fill="${icing}"/>` +
    (/cheese|biscoff/.test(n) ? nuts(225, 172) : cherry(223, 158))
  );
}
function loaf(item) {
  const [fill, dark] = palette(item);
  return (
    plate +
    `<path d="M149 164l62-61 123 22 23 50-63 79-145-31z" fill="${dark}"/><path d="M149 164l146 25 62-63-146-25z" fill="${fill}"/><path d="M149 164v59l146 31v-65z" fill="#efd5a3"/><path d="M180 176v52m36-46v54m37-47v56" stroke="${dark}" stroke-width="4" opacity=".4"/>` +
    nuts(247, 144)
  );
}
function muffin(item) {
  return (
    plate +
    `<path d="M183 174h137l-18 91q-49 24-99 0z" fill="#c18e59"/><path d="M210 189l10 70m26-67v73m29-76l-9 70m34-78l-13 70" stroke="#e4bd80" stroke-width="7"/><path d="M181 174q-16-18 5-38-2-42 38-42 20-28 52-4 35-4 43 30 25 10 10 52z" fill="#ddb16c"/>` +
    nuts(250, 121)
  );
}
function samosa(item) {
  const inner = item.name.toLowerCase().includes("chicken") ? "#9a6744" : green;
  return (
    plate +
    `<path d="M157 223l65-119 68 125q-64 32-133-6z" fill="#d69d4e" stroke="#b77a39" stroke-width="3"/><path d="M231 225l62-100 63 115q-59 33-125-15z" fill="#e6b363" stroke="#b77a39" stroke-width="3"/><path d="M179 208l43-77 39 78" fill="none" stroke="#f0ce87" stroke-width="5"/>` +
    ellipse(178, 259, 30, 14, cream) +
    ellipse(178, 258, 23, 10, inner) +
    dot(287, 195, 3, "#ba813e") +
    dot(307, 214, 3, "#ba813e")
  );
}
function sundae(item) {
  const [fill, dark] = palette(item);
  return (
    ellipse(250, 290, 68, 14, "#d4b58d") +
    `<path d="M180 166h140q-14 69-62 75v36h42v11H203v-11h39v-36q-50-8-62-75z" fill="#fff6dd"/><path d="M190 180h120q-16 48-59 50-46-4-61-50z" fill="#e5cda5"/>` +
    dot(216, 150, 35, cream) +
    dot(280, 147, 36, fill) +
    dot(249, 110, 36, cream) +
    `<path d="M203 140q42-36 94 0m-85 29q33-24 77-4" fill="none" stroke="${dark}" stroke-width="9" stroke-linecap="round"/>` +
    cherry(252, 71)
  );
}
function bowl(item, type = "smoothie") {
  const [fill, dark] = palette(item);
  const base = type === "yogurt" ? cream : fill;
  return (
    ellipse(251, 282, 85, 19, "#d7b992") +
    `<path d="M145 164h210q-7 112-104 113-98-3-106-113z" fill="#f7e9ca"/><ellipse cx="250" cy="165" rx="105" ry="39" fill="#fff6dd"/><ellipse cx="250" cy="163" rx="91" ry="29" fill="${base}"/>` +
    (type === "yogurt"
      ? leaf(243, 155) + dot(278, 161, 9, green)
      : Array.from({ length: 7 }, (_, i) =>
          dot(192 + i * 19, 154 + (i % 2) * 16, 8, i % 3 === 0 ? dark : cream),
        ).join("") + nuts(254, 146))
  );
}
function parfait(item) {
  const [fill, dark] = palette(item);
  return (
    glassShadow +
    `<path d="M182 118h138l-15 154q-54 28-107 0z" fill="#fff4d7"/><path d="M192 145h119l-4 35H195z" fill="${fill}"/><path d="M198 210h106l-5 51q-46 24-96 0z" fill="${fill}"/><path d="M197 182h110l-2 26H198z" fill="${dark}" opacity=".6"/><ellipse cx="251" cy="120" rx="68" ry="25" fill="${cream}"/>` +
    nuts(252, 112) +
    dot(224, 115, 9, dark) +
    dot(275, 125, 8, dark) +
    leaf(258, 103)
  );
}
function retail(item) {
  const n = item.name.toLowerCase();
  if (/water/.test(n))
    return (
      glassShadow +
      `<rect x="220" y="62" width="64" height="28" rx="6" fill="#a4b6a5"/><path d="M223 90h58v22l18 22v135q-47 29-94 0V134l18-22z" fill="#e7e9d2" stroke="#fff6dc" stroke-width="5"/><path d="M209 166h86v70h-86z" fill="#bac9ae"/><path d="M214 147v101" stroke="#fff9e8" stroke-width="6" opacity=".8"/>`
    );
  if (/walnut/.test(n))
    return (
      plate +
      Array.from(
        { length: 6 },
        (_, i) =>
          `<g transform="translate(${174 + (i % 3) * 62} ${172 + Math.floor(i / 3) * 54})"><ellipse rx="29" ry="21" fill="#b88b52"/><path d="M-15-8q22 6 5 17m17-23q-8 17 7 25m-4-28v29" stroke="#8c623d" stroke-width="3" fill="none"/></g>`,
      ).join("")
    );
  if (/kitkat/.test(n))
    return (
      plate +
      `<path d="M170 136h169v107H170z" fill="#ad4638"/><path d="M183 150h143v80H183z" fill="#f0d7a2"/>` +
      Array.from(
        { length: 4 },
        (_, i) =>
          `<rect x="${187 + i * 35}" y="157" width="28" height="65" rx="4" fill="#694530"/>`,
      ).join("")
    );
  if (/parcel/.test(n))
    return (
      plate +
      `<path d="M177 145l75-33 79 33v104l-79 31-75-31z" fill="#d3ac70"/><path d="M177 145l75 31 79-31m-79 31v104m-75-135l75-33 79 33" stroke="#aa7e4d" stroke-width="4" fill="none"/><path d="M224 126l77 32v34l-24 10v-33l-77-33z" fill="#efcf92"/>`
    );
  if (/pringles/.test(n))
    return (
      glassShadow +
      `<rect x="210" y="89" width="83" height="181" rx="16" fill="#c2814b"/><ellipse cx="251" cy="89" rx="41" ry="12" fill="#fff0d0"/><ellipse cx="251" cy="264" rx="41" ry="12" fill="#ac6d3f"/><ellipse cx="250" cy="172" rx="29" ry="37" fill="#f0d29a"/>` +
      nuts(250, 167)
    );
  if (/juice/.test(n))
    return (
      glassShadow +
      `<path d="M205 112l22-27h59l17 27v157h-98z" fill="#e9be6c"/><path d="M205 112h98l-17-27h-59z" fill="#f5d692"/><path d="M253 112l14-65h28" fill="none" stroke="#a67550" stroke-width="7"/>` +
      dot(253, 194, 29, "#f5df9b") +
      leaf(264, 161)
    );
  return (
    glassShadow +
    `<rect x="206" y="91" width="91" height="181" rx="20" fill="${/coke/.test(n) ? "#a95543" : "#a3ad83"}"/><ellipse cx="251" cy="91" rx="45" ry="12" fill="#e9d7b7"/><ellipse cx="251" cy="90" rx="15" ry="5" fill="#99856d"/><path d="M218 116v131" stroke="#fff0d1" stroke-width="6" opacity=".35"/><path d="M213 177q35-27 77 0m-77 15q35-27 77 0" stroke="#f6e5bf" stroke-width="8" fill="none"/>`
  );
}
function northIndian(item) {
  const n = item.name.toLowerCase();
  if (/lassi/.test(n)) return drink(item, "shake");
  if (/pav/.test(n))
    return (
      plate +
      `<ellipse cx="283" cy="204" rx="65" ry="39" fill="#b66d39"/><ellipse cx="283" cy="200" rx="58" ry="31" fill="#c58042"/><rect x="152" y="155" width="53" height="61" rx="15" fill="#dfb16d"/><rect x="199" y="164" width="51" height="59" rx="15" fill="#d49b54"/><path d="M161 168h33m13 10h31" stroke="#f8dca3" stroke-width="5"/>` +
      nuts(281, 199) +
      leaf(279, 196) +
      dot(316, 211, 5, cream)
    );
  return (
    plate +
    Array.from(
      { length: 7 },
      (_, i) =>
        `<ellipse cx="${176 + (i % 4) * 44}" cy="${180 + Math.floor(i / 4) * 46}" rx="26" ry="19" fill="#dbb574"/><path d="M${159 + (i % 4) * 44} ${174 + Math.floor(i / 4) * 46}q18-13 37 2" stroke="${cream}" stroke-width="10" fill="none"/>`,
    ).join("") +
    Array.from({ length: 10 }, (_, i) =>
      dot(
        170 + (i % 5) * 35,
        176 + Math.floor(i / 5) * 39,
        4,
        i % 2 ? green : "#b4653c",
      ),
    ).join("")
  );
}
function illustration(item) {
  const n = item.name.toLowerCase(),
    g = item.groupId;
  if (n.includes("extra for soda")) return drink(item, "juice");
  if (g === 1) {
    const plainCup = arts.coffee.replace(/<path d="M249 132[^>]+\/>/, "");
    if (/hot chocolate/.test(n))
      return (
        plainCup.replaceAll("#c49362", "#805132") +
        `<g fill="${cream}"><rect x="225" y="110" width="16" height="12" rx="3"/><rect x="258" y="115" width="16" height="12" rx="3"/></g>`
      );
    if (/tea|chai/.test(n))
      return plainCup
        .replaceAll("#805132", /green/.test(n) ? "#7e8f50" : "#7f4c29")
        .replaceAll("#c49362", /green/.test(n) ? "#a6b574" : "#a5743f");
    if (/espresso|americano|shot/.test(n))
      return arts.coffee
        .replaceAll("#c49362", "#65402d")
        .replace(/<path d="M249 132[^>]+\/>/, "");
    return arts.coffee;
  }
  if (g === 2 || g === 7) return drink(item, "juice");
  if (g === 4) return drink(item, "falooda");
  if (g === 5 || g === 12 || g === 14 || g === 10) return drink(item, "cooler");
  if (g === 6)
    return /affog/.test(n)
      ? plate +
          dot(251, 185, 57, cream) +
          `<path d="M215 156q42-22 73 17m-60 11q30-17 58 6" fill="none" stroke="${cocoa}" stroke-width="12" stroke-linecap="round"/>` +
          ellipse(330, 156, 30, 13, "#fff5d9") +
          ellipse(330, 155, 23, 8, cocoa)
      : drink(item, "coffee");
  if (g === 8) return bowl(item, /tzatziki/.test(n) ? "yogurt" : "smoothie");
  if ([9, 13, 24].includes(g))
    return drink({ ...item, category: g === 24 ? "sugar free" : "" }, "shake");
  if (g === 11) return /salad/.test(n) ? bowl(item) : sundae(item);
  if (g === 15) return parfait(item);
  if (g === 17)
    return /tiramisu/.test(n)
      ? arts.brownie
          .replaceAll("#59362a", "#a77d52")
          .replaceAll("#704631", "#d6b98b")
      : cake(item, true);
  if (g === 18) return retail(item);
  if (g === 19) return loaf(item);
  if (g === 20) return arts.burger;
  if (g === 21)
    return (
      arts.fries +
      (/loaded/.test(n)
        ? `<path d="M184 211q51-22 100 10" stroke="#d08649" stroke-width="18" fill="none"/>`
        : "")
    );
  if (g === 22) return cake(item);
  if (g === 23) return arts.sandwich;
  if (g === 25) return northIndian(item);
  if (/samosa/.test(n)) return samosa(item);
  if (/muffin/.test(n)) return muffin(item);
  if (/cookie/.test(n))
    return (
      plate +
      dot(251, 190, 65, "#ddb476") +
      Array.from({ length: 9 }, (_, i) =>
        dot(218 + (i % 3) * 33, 158 + Math.floor(i / 3) * 29, 6, cocoa),
      ).join("")
    );
  if (/garlic/.test(n)) return arts.toast.replaceAll("#b84831", green);
  if (/cutlet/.test(n))
    return (
      plate +
      ellipse(215, 185, 42, 29, "#bb7a40") +
      ellipse(284, 217, 43, 30, "#cf9650") +
      leaf(281, 171)
    );
  if (/buns/.test(n))
    return (
      plate +
      `<path d="M173 203q-9-81 79-81 84 0 79 81z" fill="#deb06b"/><path d="M173 203q79 44 158 0v18q-80 45-158 0z" fill="#be884c"/>` +
      nuts(249, 155)
    );
  if (/kesari/.test(n))
    return (
      plate +
      `<path d="M188 227q-5-110 63-111 65 3 62 111z" fill="#e5b451"/>` +
      nuts(252, 163)
    );
  if (/banana loaf/.test(n)) return loaf(item);
  if (/brown/.test(n))
    return (
      arts.brownie +
      (/icecream|sizzler/.test(n) ? dot(251, 146, 28, cream) : "")
    );
  if (/aval|berry/.test(n)) return drink(item, "shake");
  if (/mango sago|jar|pastry cup/.test(n)) return parfait(item);
  if (/kulfi/.test(n))
    return (
      plate +
      `<path d="M204 117h93l-17 117h-58z" fill="#ead4a4"/><path d="M249 234v47" stroke="#bd9767" stroke-width="13" stroke-linecap="round"/>` +
      nuts(252, 157)
    );
  if (/pudng/.test(n))
    return (
      plate +
      `<path d="M196 154h111l15 78q-71 41-142 0z" fill="#e9cf9d"/><ellipse cx="251" cy="153" rx="55" ry="22" fill="#b07b4b"/>`
    );
  return cake(item);
}
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
function wrap(title, art) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#f4e9d3"/><stop offset="1" stop-color="#e8d3b6"/></linearGradient><linearGradient id="cup" x2="1" y2="1"><stop stop-color="#fff7de"/><stop offset="1" stop-color="#ddc79f"/></linearGradient></defs><rect width="500" height="350" fill="url(#bg)"/><circle cx="420" cy="42" r="118" fill="#e5cead" opacity=".4"/>${art}<path d="M65 283q-18-26-26-16 7 21 26 16m0 0q-9-33 3-30 8 21-3 30" fill="#8b9764" opacity=".55"/></svg>\n`;
}
for (const item of catalogue.items) {
  const filename = item.code.toLowerCase() + ".svg";
  writeFileSync(
    new URL(filename, directory),
    wrap(item.name, illustration(item)),
  );
  item.images = ["/illustrations/menu/" + filename];
}
for (const group of catalogue.groups) {
  const item = catalogue.items.find((i) => i.groupId === group.id);
  const filename = "group" + String(group.id).padStart(2, "0") + ".svg";
  writeFileSync(
    new URL(filename, directory),
    wrap(group.name, illustration(item)),
  );
  group.image = "/illustrations/menu/" + filename;
}
writeFileSync(file, JSON.stringify(catalogue, null, 2) + "\n");
console.log(
  `Generated ${catalogue.items.length} item and ${catalogue.groups.length} group illustrations.`,
);
