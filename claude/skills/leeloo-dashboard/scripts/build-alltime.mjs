// Набори даних для вкладки «Весь час»: оплати за місяцями й роками, продукти, тунелі, плани продажів, загальні лічильники.
// Вхід: out/orders_full.json, out/tunnels_all.json, out/plans_totals.json, out/people_total.json (alltime.mjs), meta_monthly.json.
// Вихід: dist/at_*.json — без id людей і особистих даних.
import fs from "node:fs";
const J = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const EUR_USD = 1.162;
const toUsd = (a, c) => (c === "EUR" ? a * EUR_USD : c === "UAH" ? a / 41.5 : c === "RUB" ? a / 90 : a);
const r2 = (x) => Math.round(x * 100) / 100;
const w = (n, d) => { fs.mkdirSync("dist", { recursive: true }); fs.writeFileSync("dist/" + n, JSON.stringify(d)); console.log(n.padEnd(18), String(d.length).padStart(5), "рядків", Math.round(fs.statSync("dist/" + n).size / 1024) + " КБ"); };

// ——— Оплати ———
const all = J("out/orders_full.json");
const paid = all.filter((o) => o.status === "RESOLVED" && o.createdAt && +o.price > 0).map((o) => ({ ...o, usd: toUsd(+o.price, o.currency), at: o.createdAt })).sort((a, b) => a.at.localeCompare(b.at));
const cur = {}; paid.forEach((o) => (cur[o.currency] = (cur[o.currency] || 0) + 1));
const first = new Map(); // людина → її перша оплата
for (const o of paid) if (o.person_id && !first.has(o.person_id)) first.set(o.person_id, o.id);
const meta = fs.existsSync("meta_monthly.json") ? J("meta_monthly.json").accounts : [];
const spend = {};
for (const a of meta) for (const [m, s, imp, cl] of a.rows) { const o = (spend[m] ||= { spend: 0, impressions: 0, clicks: 0 }); o.spend += toUsd(s, a.currency); o.impressions += imp; o.clicks += cl; }
const adFrom = Object.keys(spend).sort()[0] || null;

const bucket = (key) => {
  const g = new Map();
  for (const o of paid) {
    const k = key(o.at); const b = g.get(k) || { usd: 0, orders: 0, buyers: new Set(), new_buyers: 0, new_usd: 0 };
    b.usd += o.usd; b.orders += 1; if (o.person_id) b.buyers.add(o.person_id);
    if (first.get(o.person_id) === o.id) { b.new_buyers += 1; b.new_usd += o.usd; }
    g.set(k, b);
  }
  return g;
};
const months = [...bucket((t) => t.slice(0, 7)).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, b]) => ({
  month, usd: r2(b.usd), orders: b.orders, buyers: b.buyers.size, new_buyers: b.new_buyers, new_usd: r2(b.new_usd),
  spend: spend[month] ? r2(spend[month].spend) : null,
}));
const years = [...bucket((t) => t.slice(0, 4)).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([year, b]) => {
  const sp = Object.entries(spend).filter(([m]) => m.startsWith(year));
  return { year, usd: r2(b.usd), orders: b.orders, buyers: b.buyers.size, new_buyers: b.new_buyers, new_usd: r2(b.new_usd), check: r2(b.usd / b.orders),
    spend: sp.length ? r2(sp.reduce((a, [, x]) => a + x.spend, 0)) : null };
});

// ——— Продукти ———
const pg = new Map();
for (const o of paid) { const k = o.title || "Без назви"; const p = pg.get(k) || { product: k, orders: 0, usd: 0, first: o.at.slice(0, 4), last: o.at.slice(0, 4) }; p.orders += 1; p.usd += o.usd; p.last = o.at.slice(0, 4); pg.set(k, p); }
const products = [...pg.values()].sort((a, b) => b.usd - a.usd).slice(0, 100).map((p) => ({ ...p, usd: r2(p.usd) }));

// ——— Тунелі ———
const tunnels = J("out/tunnels_all.json").filter((t) => +t.subscribers || +t.orders).map((t) => ({
  tunnel: t.tunnel, created: (t.created || "").slice(0, 10), subscribers: +t.subscribers || 0, uniq: +t.uniqSubscribers || 0,
  reaches: +t.uniqReaches || 0, clicks: +t.uniqClicks || 0, orders: +t.orders || 0, sales: +t.uniqSales || 0, total: Math.round(+t.totalSale || 0),
})).sort((a, b) => b.total - a.total || b.subscribers - a.subscribers);

// ——— Плани продажів ———
const CFG = fs.existsSync("config.json") ? J("config.json") : {};
const DEPT_UA = { sales: "Відділ продажів", account: "Акаунт-відділ", support: "Підтримка", test: "test" };
const deptOf = (name) => (CFG.depts?.[name] ? DEPT_UA[CFG.depts[name]] || CFG.depts[name] : deptAuto(name));
const deptAuto = (name) => (/\[EXAMPLE\]|\btest\b|тест|найм|соискател|удалить|defuse|карен|skin care/i.test(name) ? "test"
  : /^\W*SUPPORT|^CHAT - CS|PPM ТЕХПОДДЕРЖКА|tech support/i.test(name) ? "Підтримка"
  : /ак+аунт|акплан|\b120|vip|онбординг|пролонгац|апгрейд|реактивац|cs - sales|клієнти|клиенты|на распределение/i.test(name) ? "Акаунт-відділ" : "Відділ продажів");
const pl = new Map();
for (const s of J("out/plans_totals.json")) { const p = pl.get(s.plan_id) || { plan: s.plan, created: (s.plan_created || "").slice(0, 4), st: [] }; p.st.push(s); pl.set(s.plan_id, p); }
const plans = [];
for (const p of pl.values()) {
  const dept = deptOf(p.plan); if (dept === "test") continue;
  const ok = p.st.filter((s) => !s.fail).sort((a, b) => a.order - b.order);
  const deals = p.st.reduce((a, s) => a + s.total, 0); if (!deals) continue;
  const won = ok.length > 1 ? ok[ok.length - 1].total : 0, closed = p.st.filter((s) => s.fail).reduce((a, s) => a + s.total, 0), entry = ok.length ? ok[0].total : 0;
  plans.push({ plan: p.plan, dept, created: p.created, deals, entry, work: deals - won - closed - entry, won, closed });
}
plans.sort((a, b) => b.won - a.won || b.deals - a.deals);

const people = fs.existsSync("out/people_total.json") ? J("out/people_total.json").total : null;
const totals = [{ contacts: people, tunnels: tunnels.length, plans: plans.length, deals: plans.reduce((a, p) => a + p.deals, 0), won: plans.reduce((a, p) => a + p.won, 0),
  orders_all: all.length, first_order: paid[0]?.at.slice(0, 10), last_order: paid[paid.length - 1]?.at.slice(0, 10), buyers: first.size, ad_from: adFrom, ad_accounts: meta.length }];

w("at_months.json", months); w("at_years.json", years); w("at_products.json", products); w("at_tunnels.json", tunnels); w("at_plans.json", plans); w("at_totals.json", totals);
console.log("оплат", paid.length, "з", all.length, "| валюти", JSON.stringify(cur), "| виручка $" + Math.round(paid.reduce((a, o) => a + o.usd, 0)), "| клієнтів", first.size);
console.log(years.map((y) => `${y.year}: $${Math.round(y.usd)} · ${y.orders} оплат · ${y.buyers} клієнтів · нових ${y.new_buyers} · реклама ${y.spend == null ? "—" : "$" + Math.round(y.spend)}`).join("\n"));
console.log("статуси замовлень:", JSON.stringify(all.reduce((a, o) => ((a[o.status] = (a[o.status] || 0) + 1), a), {})));
console.log("топ тунелів:", tunnels.slice(0, 5).map((t) => `${t.tunnel}: підписників ${t.subscribers}, продажів ${t.sales}, сума ${t.total}`).join(" | "));
console.log("топ планів:", plans.slice(0, 5).map((p) => `${p.plan}: угод ${p.deals}, виграно ${p.won}, закрито ${p.closed}`).join(" | "));
console.log(JSON.stringify(totals[0]));
