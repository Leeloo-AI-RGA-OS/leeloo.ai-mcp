// Дані за весь час, які API віддає повністю: усі замовлення, статистика всіх тунелів, справжні лічильники великих колонок планів.
// Вихід: out/orders_full.json, out/tunnels_all.json, out/plans_totals.json, out/people_total.json. Без імен, телефонів, email.
// Запуск: node alltime.mjs
import fs from "node:fs";
import { get, pool, stat } from "./lib.mjs";

// 1. Замовлення (нові спочатку)
const orders = []; let total = null;
for (let off = 0; ; off += 100) {
  const b = await get(`/orders?limit=100&offset=${off}`);
  const rows = b?.data || []; total ??= b?.meta?.totalCount;
  rows.forEach((o) => orders.push({ id: o.id, person_id: o.person_id, title: o.title, price: o.price, currency: o.currency, status: o.status, createdAt: o.createdAt, updatedAt: o.updatedAt }));
  if (off % 10000 === 0) console.log("замовлень", orders.length, "/", total);
  if (rows.length < 100) break;
}
fs.writeFileSync("out/orders_full.json", JSON.stringify(orders));
console.log("замовлень збережено", orders.length);

// 2. Тунелі та їхня статистика за весь час
const tunnels = [];
for (let off = 0; ; off += 100) {
  const b = await get(`/tunnels?limit=100&offset=${off}`);
  const rows = b?.data || []; tunnels.push(...rows);
  if (rows.length < 100) break;
}
const tstats = [];
await pool(tunnels, 4, async (t) => {
  const b = await get(`/tunnels/${t.id}/stats`);
  if (b?.data) tstats.push({ tunnel_id: t.id, tunnel: t.name, created: t.createdAt, ...b.data });
}, "тунелів");
fs.writeFileSync("out/tunnels_all.json", JSON.stringify(tstats));
console.log("тунелів зі статистикою", tstats.length);

// 3. Лічильники колонок планів: де перший обхід уперся в межу 10 000, беремо справжнє число з API
const totals = [];
for (const f of fs.readdirSync("out/plans")) {
  const p = JSON.parse(fs.readFileSync("out/plans/" + f, "utf8"));
  for (const s of p.statuses) {
    let n = s.total || 0;
    if (n >= 9900) { const b = await get(`/statuses/${s.id}/deals?limit=1&offset=0`); n = b?.meta?.totalCount ?? n; }
    totals.push({ plan_id: p.id, plan: p.name, plan_created: p.created_at, status: s.name, order: s.order, fail: s.fail, total: n });
  }
}
fs.writeFileSync("out/plans_totals.json", JSON.stringify(totals));

// 4. Скільки людей у платформі
const pe = await get("/people?limit=1&offset=0");
fs.writeFileSync("out/people_total.json", JSON.stringify({ total: pe?.meta?.totalCount ?? null, at: new Date().toISOString() }));
console.log("готово · запитів", stat.req, "· угод у колонках", totals.reduce((a, t) => a + t.total, 0), "· людей", pe?.meta?.totalCount);
