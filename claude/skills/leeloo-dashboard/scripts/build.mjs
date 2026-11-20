// Збирає з вивантаження все, що публікується в дашборд: набори даних (dist/*.json), сторінку (dist/page.json)
// і перелік джерел з описами (dist/store.json). Нічого не надсилає — лише готує файли.
// Запуск: node build.mjs --data <папка даних> --since 2026-01-01 [--title "Назва дашборда"]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const data = path.resolve(opt("--data", "leeloo-dashboard-data"));
const since = opt("--since", new Date().getFullYear() + "-01-01");
const title = opt("--title", "Аналітика: маркетинг і продажі");
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(data, "dist");
fs.mkdirSync(dist, { recursive: true });

for (const [script, a] of [["build-year.mjs", [since]], ["build-alltime.mjs", []]]) {
  console.log(`\n=== ${script} ===`);
  const r = spawnSync(process.execPath, [path.join(here, script), ...a], { cwd: data, stdio: "inherit" });
  if (r.status !== 0) { console.error("STOP: " + script + " завершився з помилкою."); process.exit(r.status || 1); }
}

const J = (f) => JSON.parse(fs.readFileSync(path.join(dist, f), "utf8"));
const ua = (d) => d.split("-").reverse().join(".");
const today = new Date().toISOString().slice(0, 10);
const metaFile = path.join(data, "meta_monthly.json"), campFile = path.join(data, "meta_campaign_months.json");
const accounts = [...new Set([
  ...(fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")).accounts.map((a) => a.account) : []),
  ...(fs.existsSync(campFile) ? JSON.parse(fs.readFileSync(campFile, "utf8")).map((r) => r.account) : []),
])];
const adNote = accounts.length ? "рекламні кабінети Meta: " + accounts.map((a) => "«" + a + "»").join(", ") + "." : "рекламу Meta не підключено, тому витрат, CAC і ROMI немає.";

// ——— сторінка ———
let page = fs.readFileSync(path.join(here, "..", "assets", "page.template.html"), "utf8");
const tokens = { FROM: since, TO: today, FROM_UA: ua(since), SNAPSHOT_UA: ua(today), AD_NOTE: adNote };
for (const [k, v] of Object.entries(tokens)) page = page.split("{{" + k + "}}").join(v);
if (title !== "Аналітика: маркетинг і продажі") page = page.split("<h1>Аналітика: маркетинг і продажі</h1>").join("<h1>" + title.replace(/[<>&]/g, "") + "</h1>");
const leftover = page.match(/\{\{[A-Z_]+\}\}/g);
if (leftover) { console.error("STOP: у шаблоні лишилися незаповнені місця: " + [...new Set(leftover)].join(", ")); process.exit(1); }
const now = new Date().toISOString();
fs.writeFileSync(path.join(dist, "index.html"), page);
fs.writeFileSync(path.join(dist, "page.json"), JSON.stringify({ text: page, edit: { via: "claude", at: now } }));

// ——— джерела ———
const how = "Оновлюється вручну: запустіть скіл leeloo-dashboard ще раз — він заново вивантажить дані з Leeloo і Meta та оновить дашборд.";
const DS = [
  ["deals", "Ліди планів продажів", "Кожна угода, створена за період у планах відділу продажів і акаунт-відділу: план, відділ, статус і спільний етап, дата, тунель і ЛГТ входу, менеджер, причина закриття, оплата, позначка SQL; без даних клієнтів."],
  ["sales", "Оплати за період", "Кожне оплачене замовлення за період: дата оплати, сума, продукт, тунель і ЛГТ входу покупця, план продажів і менеджер його останньої угоди, чи це перша оплата людини; без даних клієнтів."],
  ["contacts", "Нові контакти за період", "Кожна людина, створена в Leeloo за період: дата, канал, тунель і ЛГТ першої підписки, позначки за тегами, чи стала лідом і чи оплатила; без даних клієнтів."],
  ["sql", "SQL-ліди за період", "Кожна людина, чия угода вперше дійшла до кваліфікації за період: дата, план, менеджер, тунель і ЛГТ входу, чи має тег SQL, чи оплатила; без даних клієнтів."],
  ["support", "Звернення в підтримку за період", "Кожна угода, створена за період у планах підтримки: план, статус, менеджер, чи закрита, години до закриття; без даних клієнтів."],
  ["meta_lgt", "Meta Ads по днях", "Витрати, покази, кліки й результати кампаній Meta; місячні цифри рівномірно розкладені по днях. Кампанія зіставлена з ЛГТ з такою самою назвою і з його тунелем."],
  ["tunnel_stats", "Статистика тунелів за весь час", "Охоплення й кліки ЛГТ, підписки, замовлення й продажі кожного тунелю зі статистики Leeloo; API віддає їх лише за весь час."],
  ["at_months", "Виручка за місяцями", "Оплачені замовлення за місяцями за весь час: виручка, оплати, клієнти, перші оплати нових клієнтів і витрати Meta."],
  ["at_years", "Виручка за роками", "Оплачені замовлення за роками: виручка, оплати, середній чек, клієнти, нові клієнти і витрати Meta."],
  ["at_products", "Продукти за весь час", "Сто продуктів з найбільшою виручкою: оплати, виручка, роки продажу."],
  ["at_tunnels", "Тунелі за весь час", "Статистика кожного тунелю Leeloo за весь час: підписники, охоплення, кліки, замовлення, покупці й сума продажів."],
  ["at_plans", "Плани продажів за весь час", "Кожен план продажів: скільки угод зараз у вхідній колонці, у роботі, успішно завершених і закритих."],
  ["at_totals", "Підсумки платформи", "Скільки в Leeloo контактів, клієнтів, що платили, тунелів, планів і угод."],
];
const datasets = DS.map(([id, t, d]) => {
  const f = path.join(dist, id + ".json");
  if (!fs.existsSync(f)) { console.error("STOP: немає файлу " + id + ".json"); process.exit(1); }
  return { id, file: f, bytes: fs.statSync(f).size, doc: { title: t, description: d, schedule: how, fixed: true, source: { kind: "file", format: "json", name: id + ".json", url: "<<сюди /_blob/... після завантаження файлу>>" }, updated: { at: now, by: "Claude (Leeloo API" + (accounts.length ? " + Meta Ads" : "") + ")" }, edit: { via: "claude", at: now } } };
});
const store = {
  "dash/meta": { title, lang: "uk" },
  "dash/params": { by: "tunnel", pick: "", plan: "", status: "", sql: "", from: since, to: today },
  "files/index.html": { file_path: path.join(dist, "page.json") },
  datasets,
};
fs.writeFileSync(path.join(dist, "store.json"), JSON.stringify(store, null, 1));

// ——— підсумок для звіту ———
const sum = (rows, k) => rows.reduce((a, r) => a + (+r[k] || 0), 0);
const deals = J("deals.json"), sales = J("sales.json"), contacts = J("contacts.json"), sql = J("sql.json"), meta = J("meta_lgt.json"), sup = J("support.json"), tot = J("at_totals.json")[0] || {}, years = J("at_years.json");
console.log("\nSUMMARY " + JSON.stringify({
  period: since + " — " + today, plans: new Set(deals.map((d) => d.plan)).size, leads: deals.length, qualified: sum(deals, "qual"), sql_tag: sql.filter((r) => +r.tagged).length,
  lead_sales: sum(deals, "paid"), lead_revenue: Math.round(sum(deals, "revenue")), payments: sales.length, revenue: Math.round(sum(sales, "usd")), new_clients: sum(sales, "newc"),
  contacts: contacts.length, mql: sum(contacts, "mql"), ad_spend: Math.round(sum(meta, "spend")), ad_accounts: accounts, support: sup.length,
  alltime_revenue: Math.round(sum(years, "usd")), alltime_payments: sum(years, "orders"), contacts_total: tot.contacts ?? null,
}));
console.log("FILES " + dist + " · сторінка " + Math.round(fs.statSync(path.join(dist, "page.json")).size / 1024) + " КБ · наборів даних " + datasets.length + " (" + Math.round(datasets.reduce((a, d) => a + d.bytes, 0) / 1024) + " КБ)");
