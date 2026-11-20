// Ліди року: для людей, у яких є угода, створена з заданої дати (у будь-якому плані продажів),
// бере їхні угоди (менеджер, причина закриття), історію колонок цих угод і шлях людини (підписки, оплати).
// Джерело списку — out/plans/*.json (plans-scan.mjs). Дата створення угоди — з її id. Без імен, телефонів, email.
// Запуск: node leads.mjs 2026-01-01   (докачка: готові люди пропускаються)
import fs from "node:fs";
import { get, pool, born, journey } from "./lib.mjs";
const SINCE = Date.parse(process.argv[2] || "2026-01-01");
fs.mkdirSync("out/leadp", { recursive: true });
const want = new Set();
for (const f of fs.readdirSync("out/plans")) for (const d of JSON.parse(fs.readFileSync("out/plans/" + f, "utf8")).deals) if (born(d.deal_id) >= SINCE) want.add(d.person_id);
const ids = [...want].filter((id) => !fs.existsSync(`out/leadp/${id}.json`));
console.log("людей з угодами року", want.size, "лишилось", ids.length);
const cached = (dir, id) => { const f = `out/${dir}/${id}.json`; return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
await pool(ids, 4, async (id) => {
  const old = cached("persons", id) || cached("buyers", id) || cached("journeys", id);
  const { touches, orders } = old?.touches ? old : await journey(id);
  const deals = [];
  for (let off = 0; off < 2000; off += 100) {
    const d = await get(`/people/${id}/deals?limit=100&offset=${off}`);
    const rows = d?.data || [];
    for (const x of rows) if (born(x.deal_id) >= SINCE) deals.push({ deal_id: x.deal_id, plan_id: x.sales_plan_id, plan: x.sales_plan_name, status: x.status_name, created: x.deal_created_at, manager: x.manager_name, value: x.value, currency: x.currency, source: x.source, failure: x.failure_reason?.failure_reason_name ?? null });
    if (rows.length < 100) break;
  }
  for (const d of deals) {
    const h = await get(`/people/${id}/deals/${d.deal_id}/history?limit=100&offset=0`);
    d.history = (h?.data || []).map((x) => ({ s: x.status_name, t: x.status_change_timestamp, m: x.manager_name }));
  }
  fs.writeFileSync(`out/leadp/${id}.json`, JSON.stringify({ person_id: id, touches, orders, deals }));
}, "людей");
console.log("done", fs.readdirSync("out/leadp").length);
