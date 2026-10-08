import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("public/illustrations", { recursive: true });
const coffee = `<ellipse cx="260" cy="260" rx="138" ry="34" fill="#c7a07b" opacity=".3"/><ellipse cx="250" cy="242" rx="123" ry="27" fill="#faf0d6"/><ellipse cx="250" cy="240" rx="100" ry="19" fill="#dfceb0"/><path d="M342 126c82-19 82 109 0 91" fill="none" stroke="#eee2c6" stroke-width="23"/><path d="M149 117h203l-17 103c-8 52-159 52-171 0z" fill="url(#cup)"/><ellipse cx="250" cy="118" rx="101" ry="32" fill="#fff6db"/><ellipse cx="250" cy="119" rx="84" ry="23" fill="#805132"/><ellipse cx="250" cy="120" rx="73" ry="19" fill="#c49362"/><path d="M249 132c-68-26-36-46 0-18 38-29 64-8 0 18z" fill="#f3e1bb"/><path d="M209 79c-28-21 27-26 3-51m45 47c-28-24 26-29 0-51m44 56c-22-25 20-29 0-48" fill="none" stroke="#fff1cf" stroke-width="5" stroke-linecap="round" opacity=".65"/><path d="M383 232l42 17" stroke="#a88b68" stroke-width="9" stroke-linecap="round"/>`;
const plate =
  '<ellipse cx="250" cy="230" rx="160" ry="85" fill="#cfaf88" opacity=".25"/><ellipse cx="250" cy="214" rx="153" ry="78" fill="#fff8e4"/><ellipse cx="250" cy="213" rx="123" ry="58" fill="#eee0c0"/>';
const arts = {
  coffee,
  tea: coffee.replaceAll("#805132", "#8b4e27").replaceAll("#c49362", "#c7914f"),
  toast:
    plate +
    '<path d="M145 210l65-125 137 69-69 126z" fill="#bd7136"/><path d="M157 205l60-103 112 56-56 106z" fill="#f5c45d"/><path d="M177 184l99 38m-76-73l99 38" stroke="#f7de86" stroke-width="13"/><g fill="#b84831"><circle cx="226" cy="146" r="6"/><circle cx="268" cy="207" r="6"/><circle cx="296" cy="166" r="6"/></g><g fill="#6e8450"><ellipse cx="249" cy="175" rx="10" ry="5"/><ellipse cx="194" cy="213" rx="10" ry="5"/></g>',
  fries:
    plate +
    '<g stroke="#e8ac46" stroke-width="17" stroke-linecap="round"><path d="M163 220l117-100m-97 128l119-113m-74 134l96-119m-129 81l-15-103m69 119l-24-109m-72 80l138 8m-51 15l-70-89"/></g><ellipse cx="339" cy="237" rx="28" ry="20" fill="#fff8e4"/><ellipse cx="339" cy="237" rx="21" ry="13" fill="#a43b25"/>',
  paneer:
    plate +
    '<g fill="#d99d51" stroke="#b66c33" stroke-width="3"><rect x="153" y="152" width="58" height="51" rx="10" transform="rotate(-13 182 178)"/><rect x="224" y="165" width="58" height="51" rx="10" transform="rotate(12 250 190)"/><rect x="289" y="154" width="58" height="51" rx="10" transform="rotate(-8 318 178)"/><rect x="188" y="211" width="58" height="51" rx="10"/><rect x="263" y="216" width="58" height="51" rx="10"/></g><path d="M175 142l-8-15m59 18l-6-14m92 57l17-6" stroke="#72864c" stroke-width="8"/>',
  sandwich:
    plate +
    '<path d="M137 200l124-103 110 120z" fill="#b8793c"/><path d="M141 190l121-98 108 110z" fill="#6e8c50"/><path d="M138 178l122-92 112 108z" fill="#f1d281"/><path d="M137 170l124-102 110 120z" fill="#e3b970"/><path d="M199 139l80 31m-56-59l80 31" stroke="#9b6034" stroke-width="6" opacity=".6"/>',
  pasta:
    plate +
    '<g fill="none" stroke="#e2bd7c" stroke-width="13" stroke-linecap="round"><path d="M158 210q90-130 176-1m-162 37q74-116 147-48m-147 26q73-76 159 16m-139 22q-45-80 49-87m22 97q65-64 31-89"/></g><g fill="#758b50"><ellipse cx="202" cy="150" rx="15" ry="8"/><ellipse cx="279" cy="216" rx="15" ry="8"/><ellipse cx="177" cy="246" rx="15" ry="8"/></g>',
  burger:
    plate +
    '<path d="M157 235h187q-3 33-92 35-91-3-95-35" fill="#cb8b43"/><path d="M149 209h207v28H149z" fill="#6b4226"/><path d="M151 202l33-19 26 20 29-21 36 20 29-19 44 22" stroke="#77944d" stroke-width="15" fill="none"/><path d="M157 176h189v14H157z" fill="#c85b38"/><path d="M153 169q5-82 101-82 91 0 95 82z" fill="#e5b468"/><g fill="#faf0ca"><ellipse cx="212" cy="123" rx="4" ry="2"/><ellipse cx="268" cy="113" rx="4" ry="2"/><ellipse cx="299" cy="140" rx="4" ry="2"/></g>',
  brownie:
    plate +
    '<path d="M157 163l143-43 63 73-149 53z" fill="#59362a"/><path d="M157 163v62l57 56v-35z" fill="#3d281f"/><path d="M214 246l149-53v62l-149 26z" fill="#704631"/><g fill="#a47b50"><rect x="221" y="160" width="15" height="10" rx="4"/><rect x="282" y="142" width="15" height="10" rx="4"/><rect x="285" y="188" width="15" height="10" rx="4"/></g>',
  cake:
    plate +
    '<path d="M185 150l142 58-142 57z" fill="#fff0cf"/><path d="M185 172l142 51-142 55z" fill="#b37a54"/><path d="M185 211l142 24-142 57z" fill="#f2d6a8"/><path d="M185 130l142 58-142 57z" fill="#fff6df"/><circle cx="226" cy="164" r="14" fill="#aa4533"/><path d="M227 152l5-18" stroke="#668348" stroke-width="4"/>',
  lime: '<ellipse cx="258" cy="280" rx="97" ry="23" fill="#ba9c70" opacity=".25"/><path d="M189 85h139l-17 181q-54 38-104 0z" fill="#eff1ca" stroke="#f9f7dd" stroke-width="5"/><path d="M202 155h113l-10 109q-46 26-91 0z" fill="#d5dfa4"/><g fill="#f9f8e0" opacity=".6"><rect x="216" y="131" width="30" height="32" rx="5" transform="rotate(12 230 145)"/><rect x="265" y="166" width="30" height="32" rx="5" transform="rotate(-10 280 180)"/></g><path d="M285 256l30-201" stroke="#b57c57" stroke-width="8"/><circle cx="196" cy="100" r="39" fill="#8eaa53"/><circle cx="196" cy="100" r="32" fill="#e9edb7"/><path d="M196 68v64m-32-32h64m-55-23l45 45m-45 0l45-45" stroke="#a7bc67" stroke-width="3"/>',
};
for (const [name, art] of Object.entries(arts))
  writeFileSync(
    "public/illustrations/" + name + ".svg",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#f4e9d3"/><stop offset="1" stop-color="#e8d3b6"/></linearGradient><linearGradient id="cup" x2="1" y2="1"><stop stop-color="#fff7de"/><stop offset="1" stop-color="#ddc79f"/></linearGradient></defs><rect width="500" height="350" fill="url(#bg)"/><circle cx="420" cy="42" r="118" fill="#e5cead" opacity=".4"/>${art}<path d="M65 283q-18-26-26-16 7 21 26 16m0 0q-9-33 3-30 8 21-3 30" fill="#8b9764" opacity=".55"/></svg>`,
  );
