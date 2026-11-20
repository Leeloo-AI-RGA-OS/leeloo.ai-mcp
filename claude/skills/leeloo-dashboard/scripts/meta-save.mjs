// Зберігає відповіді конектора Meta Ads (ads_get_ad_entities з time_increment "monthly") для дашборда.
//   campaigns — рівень campaign: витрати, покази, кліки, результати кожної кампанії за місяцями → meta_daily.json
//   account   — рівень ad_account: витрати кабінету за місяцями за весь доступний період → meta_monthly.json
// Місячні цифри кампаній рівномірно розкладаються по днях місяця (до сьогодні), щоб працював фільтр дат.
// Вхід — або файл з відповіддю інструмента як є (об'єкт з полем ad_entities), або стислий файл, який Claude записує сам,
// коли відповідь прийшла в чат, а не у файл (щоб не переписувати її цілком):
//   кампанії: {"currency":"USD","rows":[["2026-08","<id кампанії>","<назва>",660.57,18468,168,3], ...]}  — місяць, id, назва, витрати, покази, кліки, результати
//   кабінет:  {"currency":"EUR","rows":[["2023-11",238.12], ...]}                                        — місяць, витрати
// Рядки з нульовими витратами в стислий файл не пишуться. Дані одного кабінету при повторі замінюються.
// Запуск: node meta-save.mjs campaigns|account --data <папка даних> --account "<назва кабінету>" <файл> [<файл> ...]
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const kind = args.shift();
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const data = opt("--data", "leeloo-dashboard-data");
let account = opt("--account", null);
if (!["campaigns", "account"].includes(kind) || !args.length) { console.error('Запуск: node meta-save.mjs campaigns|account --data <папка> --account "<кабінет>" <файл...>'); process.exit(2); }
const num = (v) => (v == null || v === "" || isNaN(+v) ? 0 : +v);
const rowsOf = (text) => {
  const i = text.search(/[\[{]/); if (i < 0) return [];
  let j = JSON.parse(text.slice(i));
  if (Array.isArray(j?.content) && typeof j.content[0]?.text === "string") j = JSON.parse(j.content[0].text);
  if (Array.isArray(j?.rows) && Array.isArray(j.rows[0])) {
    // стислий формат → такі самі рядки, як у відповіді інструмента
    const last = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10);
    return j.rows.map((r) => (r.length <= 2
      ? { date_start: r[0] + "-01", date_stop: last(r[0]), amount_spent: { value: r[1], unit: j.currency || "USD" } }
      : { date_start: r[0] + "-01", date_stop: last(r[0]), id: String(r[1]), name: r[2], amount_spent: { value: r[3], unit: j.currency || "USD" }, impressions: r[4], link_click: r[5], results: { value: r[6] } }));
  }
  let e = Array.isArray(j) ? j : j.ad_entities ?? j.data ?? [];
  if (typeof e === "string") e = JSON.parse(e);
  return Array.isArray(e) ? e : [];
};
const raw = args.flatMap((f) => rowsOf(fs.readFileSync(f, "utf8")));
if (!raw.length) { console.error("У файлах немає рядків Meta."); process.exit(1); }
const unit = raw.find((r) => r.amount_spent?.unit)?.amount_spent.unit || "USD";
const subs = (r) => num(r.results?.values?.[0]?.value ?? r.results?.value);
const rd = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d);
fs.mkdirSync(data, { recursive: true });

if (kind === "account") {
  account ||= raw[0].name || "Meta Ads";
  const file = path.join(data, "meta_monthly.json");
  const m = rd(file, { accounts: [] });
  m.accounts = m.accounts.filter((a) => a.account !== account);
  const rows = raw.filter((r) => r.date_start).map((r) => [r.date_start.slice(0, 7), num(r.amount_spent?.value), num(r.impressions), num(r.link_click)]).filter((r) => r[1] || r[2]);
  m.accounts.push({ account, currency: unit, rows });
  fs.writeFileSync(file, JSON.stringify(m));
  console.log("ACCOUNT:", account, "| місяців з витратами", rows.length, "| разом", Math.round(rows.reduce((a, r) => a + r[1], 0)), unit, "| з", rows[0]?.[0] || "—");
} else {
  account ||= "Meta Ads";
  const file = path.join(data, "meta_campaign_months.json");
  const all = rd(file, []).filter((r) => r.account !== account);
  for (const r of raw) {
    if (!r.date_start || !(num(r.amount_spent?.value) || num(r.impressions))) continue;
    all.push({ account, currency: unit, month: r.date_start.slice(0, 7), from: r.date_start, to: r.date_stop, campaign_id: r.id, campaign: r.name,
      spend: num(r.amount_spent?.value), impressions: num(r.impressions), clicks: num(r.link_click), subs: subs(r) });
  }
  fs.writeFileSync(file, JSON.stringify(all));
  // у доларах і по днях
  const EUR_USD = 1.162, toUsd = (a, c) => (c === "EUR" ? a * EUR_USD : c === "UAH" ? a / 41.5 : a);
  const today = new Date().toISOString().slice(0, 10), DAY = 864e5, r3 = (x) => Math.round(x * 1000) / 1000;
  const daily = [];
  for (const r of all) {
    const days = [];
    for (let t = Date.parse(r.from); t <= Date.parse(r.to); t += DAY) { const d = new Date(t).toISOString().slice(0, 10); if (d <= today) days.push(d); }
    for (const d of days) daily.push({ date: d, campaign_id: r.campaign_id, campaign: r.campaign, spend: r3(toUsd(r.spend, r.currency) / days.length), impressions: r3(r.impressions / days.length), clicks: r3(r.clicks / days.length), subs: r3(r.subs / days.length) });
  }
  daily.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(path.join(data, "meta_daily.json"), JSON.stringify(daily));
  const mine = all.filter((r) => r.account === account);
  console.log("CAMPAIGNS:", account, "| кампаній", new Set(mine.map((r) => r.campaign_id)).size, "| рядків-місяців", mine.length, "| витрати", Math.round(mine.reduce((a, r) => a + r.spend, 0)), unit, "| усіх кабінетів разом у meta_daily.json:", daily.length, "рядків");
}
