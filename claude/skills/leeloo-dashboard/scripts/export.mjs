// Вивантаження всього, що потрібно дашборду, з Leeloo REST API — одна команда, етапи йдуть по черзі.
// Кожен етап уміє докачувати: якщо вивантаження перервалося, просто запустіть цю саму команду ще раз.
// Потрібні: файл з ключем (token.mjs) і out/plans_all.json (save-plans.mjs).
// Запуск: node export.mjs --data <папка даних> --since 2026-01-01
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const data = path.resolve(opt("--data", "leeloo-dashboard-data"));
const since = opt("--since", new Date().getFullYear() + "-01-01");
const here = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(data, "out"), { recursive: true });
if (!fs.existsSync(path.join(data, "out", "plans_all.json"))) { console.error("STOP: немає out/plans_all.json — спершу збережіть список планів (save-plans.mjs)."); process.exit(2); }

const STAGES = [
  ["people-year", [since], "нові контакти періоду"],
  ["plans-scan", [since], "угоди всіх планів, у яких був рух"],
  ["leads", [since], "угоди періоду: менеджер, причина закриття, історія колонок, шлях людини"],
  ["alltime", [], "усі замовлення, статистика тунелів, лічильники планів"],
  ["buyers", [since], "покупці періоду: підписки та угоди"],
  ["journeys", [], "шлях нових контактів без угод"],
  ["sql-people", [], "люди з тегами SQL"],
];
const t0 = Date.now();
for (const [name, a, what] of STAGES) {
  const mark = path.join(data, "out", `.done-${name}-${since}`);
  if (fs.existsSync(mark) && Date.now() - fs.statSync(mark).mtimeMs < 20 * 36e5) { console.log(`— ${name}: уже зроблено, пропускаю`); continue; }
  console.log(`\n=== ${name}: ${what} ===`);
  const t1 = Date.now();
  const r = spawnSync(process.execPath, [path.join(here, name + ".mjs"), ...a], { cwd: data, stdio: "inherit" });
  if (r.status !== 0) { console.error(`STOP: етап ${name} завершився з помилкою (код ${r.status}). Запустіть команду ще раз — вивантаження продовжиться з цього місця.`); process.exit(r.status || 1); }
  fs.writeFileSync(mark, new Date().toISOString());
  console.log(`— ${name}: готово за ${Math.round((Date.now() - t1) / 60000)} хв`);
}
console.log(`\nEXPORT DONE за ${Math.round((Date.now() - t0) / 60000)} хв · дані в ${data}`);
