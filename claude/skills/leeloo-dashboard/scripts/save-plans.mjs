// Зберігає список планів продажів, отриманий з Leeloo MCP (list_sales_plans), у out/plans_all.json.
// REST API не вміє перелічувати плани, тому їхні id беруться з MCP. Вхід — один або кілька файлів з відповіддю інструмента
// (як її зберіг Claude: файл tool-results або файл, куди відповідь записано вручну). Зберігаються лише id, назва й дата.
// Запуск: node save-plans.mjs --data <папка даних> <файл> [<файл> ...]
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const di = args.indexOf("--data");
const data = di >= 0 ? args.splice(di, 2)[1] : "leeloo-dashboard-data";
if (!args.length) { console.error("Вкажіть хоча б один файл з відповіддю list_sales_plans."); process.exit(2); }
const parse = (text) => {
  const i = text.search(/[\[{]/);
  if (i < 0) throw new Error("у файлі немає JSON");
  let j = JSON.parse(text.slice(i));
  // відповідь може бути загорнута: {content:[{text:"..."}]} або рядок з JSON
  if (Array.isArray(j?.content) && typeof j.content[0]?.text === "string") j = JSON.parse(j.content[0].text);
  if (typeof j === "string") j = JSON.parse(j);
  return j;
};
const all = new Map(); let amount = null;
for (const f of args) {
  const j = parse(fs.readFileSync(f, "utf8"));
  const rows = Array.isArray(j) ? j : j.result || j.data || [];
  if (j.amount != null) amount = Math.max(amount ?? 0, j.amount);
  for (const p of rows) { const id = p.id || p._id; if (id) all.set(id, { id, name: p.name || "Без назви", created_at: p.created_at || p.createdAt || null }); }
}
fs.mkdirSync(path.join(data, "out"), { recursive: true });
fs.writeFileSync(path.join(data, "out", "plans_all.json"), JSON.stringify([...all.values()]));
console.log("PLANS:", all.size, amount != null ? "з " + amount : "");
if (amount != null && all.size < amount) { console.log("INCOMPLETE: отримано не всі плани — запитайте наступні сторінки (skip) і запустіть скрипт ще раз з усіма файлами"); process.exit(1); }
