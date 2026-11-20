// Шлях покупців: для людей з оплаченими замовленнями з заданої дати бере їхні підписки, оплати та всі угоди
// (угоди — щоб віднести оплату до плану продажів і менеджера). Вхід: out/orders_full.json (alltime.mjs).
// Зберігає лише id, підписки (тунель, ЛГТ, дата), оплати й угоди — без імен і контактів.
// Запуск: node buyers.mjs 2026-01-01   (докачка: готові люди пропускаються)
import fs from "node:fs";
import { get, pool, journey } from "./lib.mjs";
const SINCE = process.argv[2] || "2026-01-01";
fs.mkdirSync("out/buyers", { recursive: true });
const orders = JSON.parse(fs.readFileSync("out/orders_full.json", "utf8")).filter((o) => o.status === "RESOLVED" && o.person_id && ((o.updatedAt || "") >= SINCE || (o.createdAt || "") >= SINCE));
const ids = [...new Set(orders.map((o) => o.person_id))].filter((id) => !fs.existsSync(`out/buyers/${id}.json`));
console.log("покупців з", SINCE + ":", new Set(orders.map((o) => o.person_id)).size, "лишилось", ids.length);
const cached = (dir, id) => { const f = `out/${dir}/${id}.json`; return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
await pool(ids, 4, async (id) => {
  const old = cached("leadp", id) || cached("journeys", id);
  const { touches, orders: ord } = old?.touches ? old : await journey(id);
  const deals = [];
  for (let off = 0; off < 2000; off += 100) {
    const d = await get(`/people/${id}/deals?limit=100&offset=${off}`);
    const rows = d?.data || [];
    rows.forEach((x) => deals.push({ plan: x.sales_plan_name, status: x.status_name, created: x.deal_created_at, manager: x.manager_name, value: x.value, currency: x.currency }));
    if (rows.length < 100) break;
  }
  fs.writeFileSync(`out/buyers/${id}.json`, JSON.stringify({ person_id: id, touches, orders: ord, deals }));
}, "покупців");
console.log("done", fs.readdirSync("out/buyers").length);
