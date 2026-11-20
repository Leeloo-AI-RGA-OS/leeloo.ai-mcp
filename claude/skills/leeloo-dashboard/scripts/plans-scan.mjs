// Угоди всіх планів продажів, у яких був рух із заданої дати. У колонці угоди йдуть від найновішого руху,
// тому колонка читається лише до першої угоди, старішої за дату.
// Вхід: out/plans_all.json (список планів: id, name, created_at). Вихід: out/plans/<id>.json. Без особистих даних.
// Запуск: node plans-scan.mjs 2026-01-01   (докачка: готові плани пропускаються)
import fs from "node:fs";
import { get, pool, stat } from "./lib.mjs";
const SINCE = process.argv[2] || "2026-01-01";
const plans = JSON.parse(fs.readFileSync("out/plans_all.json", "utf8")).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
fs.mkdirSync("out/plans", { recursive: true });
const todo = plans.filter((p) => !fs.existsSync(`out/plans/${p.id}.json`));
console.log("планів", plans.length, "лишилось", todo.length);
await pool(todo, 4, async (p) => {
  const st = await get(`/sales-plans/${p.id}/statuses`);
  const rec = { id: p.id, name: p.name, created_at: p.created_at, statuses: [], deals: [], total: 0 };
  for (const s of st?.data?.statuses || []) {
    let total = null;
    for (let off = 0; ; off += 100) {
      const b = await get(`/statuses/${s.status_id}/deals?limit=100&offset=${off}`);
      const rows = b?.data || []; total ??= b?.meta?.totalCount ?? rows.length;
      let old = false;
      for (const d of rows) {
        if ((d.status_change_timestamp || "") >= SINCE) rec.deals.push({ deal_id: d.deal_id, person_id: d.person_id, status: s.status_name, order: s.order, fail: s.is_failure ? 1 : 0, at: d.status_change_timestamp });
        else old = true;
      }
      if (rows.length < 100 || old) break;
    }
    rec.statuses.push({ id: s.status_id, name: s.status_name, order: s.order, fail: s.is_failure ? 1 : 0, total });
    rec.total += total || 0;
  }
  fs.writeFileSync(`out/plans/${p.id}.json`, JSON.stringify(rec));
}, "планів");
const recs = fs.readdirSync("out/plans").map((f) => JSON.parse(fs.readFileSync("out/plans/" + f, "utf8")));
const act = recs.filter((r) => r.deals.length);
console.log("готово: планів", recs.length, "з рухом", act.length, "угод із рухом", act.reduce((a, r) => a + r.deals.length, 0), "запитів", stat.req);
