// Шлях нових контактів року, у яких немає угод: підписки (тунель, ЛГТ, дата) та оплати. Без імен і контактів.
// Запуск: node journeys.mjs   (після people-year.mjs і leads.mjs)
import fs from "node:fs";
import { pool, journey } from "./lib.mjs";
fs.mkdirSync("out/journeys", { recursive: true });
const has = (id) => ["leadp", "persons", "buyers", "journeys"].some((d) => fs.existsSync(`out/${d}/${id}.json`));
const ids = JSON.parse(fs.readFileSync("out/people_year.json", "utf8")).map((p) => p.id).filter((id) => !has(id));
console.log("контактів без шляху", ids.length);
await pool(ids, 4, async (id) => {
  fs.writeFileSync(`out/journeys/${id}.json`, JSON.stringify({ person_id: id, ...(await journey(id)) }));
}, "контактів");
console.log("done", fs.readdirSync("out/journeys").length);
