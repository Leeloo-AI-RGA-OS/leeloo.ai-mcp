// Нові контакти компанії за період (за датою створення): день, канал, позначки з тегів. Без імен, телефонів, email.
// Запуск: node people-year.mjs 2026-01-01
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const t = fs.readFileSync(path.join(os.homedir(), ".leeloo", "token.txt"), "utf8").replace(/^\uFEFF/, "").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => { for (let a = 0; a < 6; a++) { await sleep(150); let r; try { r = await fetch("https://api.leeloo.ai/api/v2" + p, { headers: { "X-Leeloo-AuthToken": t } }); } catch { await sleep(2000 * (a + 1)); continue; } if (r.status === 429 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; } return r.json(); } throw new Error("fail " + p); };
const SINCE = process.argv[2] || "2026-01-01";
let LIMIT = 500;
const probe = await get(`/people?limit=${LIMIT}&offset=0`);
if ((probe?.data || []).length < LIMIT) LIMIT = (probe?.data || []).length >= 100 ? (probe.data.length) : 100;
console.log("page size", LIMIT, "total", probe?.meta?.totalCount);
const out = []; const tagCount = {};
let done = false;
for (let off = 0; !done; off += LIMIT) {
  const b = off === 0 && probe?.data?.length === LIMIT ? probe : await get(`/people?limit=${LIMIT}&offset=${off}`);
  const rows = b?.data || [];
  if (!rows.length) break;
  for (const p of rows) {
    const c = p.createdAt || "";
    if (c < SINCE) { done = true; continue; }
    const tags = (p.tags || []).map((x) => (typeof x === "string" ? x : x?.name || "")).filter(Boolean);
    tags.forEach((x) => (tagCount[x] = (tagCount[x] || 0) + 1));
    const tg = tags.filter((x) => !/дожим/i.test(x));
    out.push({ id: p.id, at: c, ch: [...new Set((p.accounts || []).map((a) => a.from).filter(Boolean))],
      mql: tg.some((x) => /mql/i.test(x)) ? 1 : 0, royal: tg.some((x) => /royal|super[-\s]?super/i.test(x)) ? 1 : 0,
      webinar: tg.some((x) => /webinar|вебинар|вебінар/i.test(x)) ? 1 : 0, razbor: tg.some((x) => /разбор|розбір/i.test(x)) ? 1 : 0, tags: tags.length });
  }
  if ((off / LIMIT) % 20 === 0) console.log("offset", off, "kept", out.length, "last", rows[rows.length - 1]?.createdAt);
  if (rows.length < LIMIT) break;
}
fs.writeFileSync("out/people_year.json", JSON.stringify(out));
fs.writeFileSync("out/people_year_tags.json", JSON.stringify(Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 300)));
console.log("saved", out.length, "range", out[out.length - 1]?.at, "→", out[0]?.at);
