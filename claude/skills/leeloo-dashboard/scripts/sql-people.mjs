// Люди з тегами SQL: для кожного тега зі словом «SQL» бере всіх людей з цим тегом (filter[tags]=назва).
// Зберігає id людини, дату створення, останнє повідомлення, канали і всі теги — без імен, телефонів, email.
// Запуск: node sql-people.mjs   → out/sql_people.json
import fs from "node:fs";
import { get, born } from "./lib.mjs";
const tg = await get("/tags?limit=1000&offset=0");
const sqlTags = (tg?.data?.tags || []).filter((t) => /sql/i.test(t.name));
const people = new Map();
const counts = [];
for (const t of sqlTags) {
  let n = 0, total = null;
  for (let off = 0; ; off += 100) {
    const r = await get(`/people?limit=100&offset=${off}&filter[tags]=${encodeURIComponent(t.name)}`);
    const rows = r?.data || []; total ??= r?.meta?.totalCount ?? null;
    for (const p of rows) {
      n++;
      if (!people.has(p.id)) people.set(p.id, { id: p.id, created: p.createdAt || new Date(born(p.id)).toISOString(), last_message: p.lastMessageTime || null,
        ch: [...new Set((p.accounts || []).map((a) => a.from).filter(Boolean))], tags: (p.tags || []).map((x) => (typeof x === "string" ? x : x?.name)).filter(Boolean) });
    }
    if (rows.length < 100 || (total != null && n >= total)) break;
  }
  counts.push({ tag: t.name, tag_created: new Date(born(t.id)).toISOString().slice(0, 10), people: n, total });
  console.log(t.name.padEnd(36), "створено", new Date(born(t.id)).toISOString().slice(0, 10), "людей", n, total !== n ? "(API каже " + total + ")" : "");
}
fs.writeFileSync("out/sql_people.json", JSON.stringify([...people.values()]));
fs.writeFileSync("out/sql_tags.json", JSON.stringify(counts, null, 1));
console.log("разом людей з тегами SQL:", people.size);
