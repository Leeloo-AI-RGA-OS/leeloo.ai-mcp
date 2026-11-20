// Дані дашборда для всієї компанії за рік: угоди всіх планів продажів, оплати, нові контакти, підтримка.
// Вхід: out/plans (plans-scan.mjs), out/leadp (leads.mjs), out/buyers (buyers.mjs), out/journeys (journeys.mjs),
//       out/people_year.json (people-year.mjs), out/sql_people.json (sql-people.mjs), out/tunnels_all.json (alltime.mjs), meta_daily.json (meta-save.mjs).
//       config.json (необов'язково): { "depts": { "Назва плану": "sales|account|support|test" } } — якщо відділ плану визначився неправильно.
// Вихід: dist/*.json — без імен, телефонів, email та id людей.
import fs from "node:fs";
import path from "node:path";

const OUT = "out", DASH = "dist";
const SINCE = process.argv[2] || "2026-01-01";
const S = Date.parse(SINCE), DAY = 864e5, NOW = Date.now();
const EUR_USD = 1.162;
fs.mkdirSync(DASH, { recursive: true });
const J = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const dir = (d) => (fs.existsSync(path.join(OUT, d)) ? fs.readdirSync(path.join(OUT, d)).map((f) => J(path.join(OUT, d, f))) : []);
const r2 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
const day = (t) => new Date(t).toISOString().slice(0, 10);
const toUsd = (a, c) => (c === "EUR" ? a * EUR_USD : c === "UAH" ? a / 41.5 : a);
const norm = (s) => String(s || "").toLowerCase().replace(/[\s_\-\/().]+/g, "").replace(/с/g, "c");
const w = (n, d) => { fs.writeFileSync(path.join(DASH, n), JSON.stringify(d)); console.log(n.padEnd(20), String(d.length).padStart(6), "рядків", Math.round(fs.statSync(path.join(DASH, n)).size / 1024) + " КБ"); };
// Прибирає порожні поля, щоб файл був меншим: null завжди, 0 — лише для позначок 0/1
const slim = (o, flags) => { const r = {}; for (const k in o) { if (o[k] == null) continue; if (flags.has(k) && !o[k]) continue; r[k] = o[k]; } return r; };

// ——— Плани продажів: відділ і етап кожної колонки ———
const CFG = fs.existsSync("config.json") ? JSON.parse(fs.readFileSync("config.json", "utf8")) : {};
const deptOf = (name) => CFG.depts?.[name] || deptAuto(name);
const deptAuto = (name) => (/\[EXAMPLE\]|\btest\b|тест|найм|соискател|удалить|defuse|карен|skin care/i.test(name) ? "test"
  : /^\W*SUPPORT|^CHAT - CS|PPM ТЕХПОДДЕРЖКА|tech support/i.test(name) ? "support"
  : /ак+аунт|акплан|\b120|vip|онбординг|пролонгац|апгрейд|реактивац|cs - sales|клієнти|клиенты|на распределение/i.test(name) ? "account" : "sales");
const DEPT = { sales: "Відділ продажів", account: "Акаунт-відділ", support: "Підтримка" };
const CAT = [
  [6, /плат[её]ж получен|платіж отриман|оплату отримано|^оплачено|\bsold\b|успешно реализ|проект завершено|чат закрито|closed chat|^оплата$/i],
  [5, /ожидание оплаты|очікування оплати|очікую оплату|ожоп|attesa di pagamento|waiting for payment/i],
  [4, /п[р]?огрев|прогрів|^продаж|selling|пропозицію зроблено|переговори|приймає рішення/i],
  [3, /квалиф|кваліф|qualif|потребу виявлено|проведений аудит/i],
  [2, /дозвон|св[яь]зался|зв'язався|contacted|связь с менеджером|онбординг проведено/i],
  [1, /взято в р|виконується|выполняется|в роботі|in progress|transferred/i],
];
const plans = new Map(); // id → { name, dept, rank: {status → 0..6}, order: {status → n}, fail: Set }
for (const p of dir("plans")) {
  const st = p.statuses.slice().sort((a, b) => a.order - b.order);
  const ok = st.filter((s) => !s.fail);
  const rank = {}, order = {}, fail = new Set();
  let cur = 0;
  ok.forEach((s, i) => {
    const m = CAT.find(([, re]) => re.test(s.name));
    cur = m ? Math.max(cur, m[0]) : cur; // колонка без відомої назви успадковує етап попередньої
    if (i === ok.length - 1 && ok.length > 1) cur = 6; // остання не-відмовна колонка плану — успішне завершення
    rank[s.name] = cur;
  });
  st.forEach((s) => { order[s.name] = s.order; if (s.fail) fail.add(s.name); });
  plans.set(p.id, { name: p.name, dept: deptOf(p.name), rank, order, fail, moved: p.deals.length, last: ok.length ? ok[ok.length - 1].name : null });
}
const deptByName = new Map([...plans.values()].map((p) => [p.name, p.dept]));

// ——— Люди: угоди року з історією, підписки, оплати ———
const leadp = dir("leadp");
const buyers = new Map(dir("buyers").map((b) => [b.person_id, b]));
const journeys = new Map(dir("journeys").map((b) => [b.person_id, b]));
const contactsRaw = fs.existsSync(path.join(OUT, "people_year.json")) ? J(path.join(OUT, "people_year.json")) : [];
const tagOf = new Map(contactsRaw.map((p) => [p.id, p]));
const metaDaily = fs.existsSync("meta_daily.json") ? J("meta_daily.json") : [];
const campByLgt = new Map(metaDaily.map((m) => [norm(m.campaign), m.campaign]));
const beh = new Map(); // deal_id → лічильники чату (є лише для плану, де їх збирав enrich.mjs)
for (const b of dir("behavior")) for (const d of b.deals || []) beh.set(d.deal_id, d);

const entryTouch = (touches, at) => (touches || []).filter((t) => !t.sys && t.at && Date.parse(t.at) <= at + DAY).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
const firstTouch = (touches) => (touches || []).filter((t) => !t.sys && t.at).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
const paidOrders = (orders) => (orders || []).filter((o) => o.status === "RESOLVED" && o.paidAt).map((o) => ({ ...o, at: Date.parse(o.paidAt), usd: toUsd(+o.amount || 0, o.currency) }));

// Оплата належить одній угоді людини: найпізнішій, створеній не пізніше ніж через день після оплати (тестові плани й підтримка не рахуються)
const attributed = new Map(); // `${person}|${created}` → [orders]
const salesRows = [];
const people = new Map(); // person → { touches, orders, deals(all known) }
for (const l of leadp) people.set(l.person_id, { touches: l.touches, orders: l.orders, deals: l.deals.map((d) => ({ ...d, dept: plans.get(d.plan_id)?.dept || deptOf(d.plan) })) });
for (const [id, b] of buyers) {
  const p = people.get(id) || { touches: b.touches, orders: b.orders, deals: [] };
  // у покупців є всі угоди за всі роки (без історії) — додаємо ті, яких немає серед угод року
  const have = new Set(p.deals.map((d) => d.created));
  for (const d of b.deals) if (!have.has(d.created)) p.deals.push({ plan: d.plan, status: d.status, created: d.created, manager: d.manager, dept: deptByName.get(d.plan) || deptOf(d.plan), old: true });
  if (!p.orders?.length) p.orders = b.orders;
  people.set(id, p);
}
for (const [id, p] of people) {
  const po = paidOrders(p.orders).sort((a, b) => a.at - b.at);
  const firstEver = po[0]?.at;
  for (const o of po) {
    if (o.at < S) continue;
    const cand = p.deals.filter((d) => d.dept !== "test" && d.dept !== "support" && Date.parse(d.created) <= o.at + DAY).sort((a, b) => Date.parse(b.created) - Date.parse(a.created))[0];
    if (cand) { const k = id + "|" + cand.created; (attributed.get(k) || attributed.set(k, []).get(k)).push(o); }
    const t = entryTouch(p.touches, Date.parse(o.createdAt || o.paidAt));
    const fresh = cand && o.at - Date.parse(cand.created) <= 365 * DAY;
    salesRows.push({
      date: day(o.at), usd: r2(o.usd), product: o.product || "Без назви",
      tunnel: t ? t.tunnel : "Без підписки", lgt: t ? t.lgt : "Без підписки",
      plan: fresh ? cand.plan : "Без угоди за останній рік", dept: fresh ? DEPT[cand.dept] : "Без угоди",
      manager: fresh && cand.manager && cand.manager !== "Unassigned" ? cand.manager : "Не призначено",
      newc: o.at === firstEver ? 1 : 0,
    });
  }
}

// ——— Рядок на угоду ———
// SQL — це тег людини (sql-people.mjs). Дати тега в API немає, тому «став SQL» — перший перехід угоди в колонку кваліфікації.
const sqlTagged = new Map((fs.existsSync(path.join(OUT, "sql_people.json")) ? J(path.join(OUT, "sql_people.json")) : []).map((p) => [p.id, p.tags.filter((t) => /sql/i.test(t))]));
const QUAL_COL = /квалиф|кваліф|qualif/i;
const qualAt = (d) => (d.history || []).filter((h) => QUAL_COL.test(h.s)).map((h) => h.t).sort()[0] || null;
const NO_CONTACT = /нет связи|немає зв|неправильн|пропал|зник|сброс|скид|недозвон|не виходить/i;
const dealRows = [], supportRows = [];
let skippedTest = 0;
for (const l of leadp) {
  const p = people.get(l.person_id);
  const tg = tagOf.get(l.person_id);
  for (const d of l.deals) {
    const pl = plans.get(d.plan_id);
    const dept = pl?.dept || deptOf(d.plan);
    if (dept === "test") { skippedTest++; continue; }
    const created = Date.parse(d.created);
    const hist = (d.history || []).map((x) => ({ s: x.s, t: Date.parse(x.t) })).filter((x) => isFinite(x.t)).sort((a, b) => a.t - b.t);
    const rk = (s) => (pl?.fail.has(s) ? -1 : pl?.rank[s] ?? 0);
    const isFail = pl ? pl.fail.has(d.status) : /закр/i.test(d.status);
    const reach = Math.max(0, rk(d.status), ...hist.map((x) => rk(x.s)));
    // у планах підтримки «виконано» — лише остання колонка; у продажах — будь-яка колонка оплати
    const isWon = !isFail && (dept === "support" ? d.status === pl?.last : rk(d.status) === 6);
    const open = !isFail && !isWon;
    const lastMove = hist.length ? hist[hist.length - 1].t : created;
    const tk = hist.find((x) => rk(x.s) >= 1);
    const inCol = [0, 0, 0, 0, 0, 0];
    hist.forEach((x, i) => {
      const r = rk(x.s); if (r < 0 || r > 5) return;
      const end = i + 1 < hist.length ? hist[i + 1].t : open ? NOW : null;
      if (end != null && end >= x.t) inCol[r] += (end - x.t) / DAY;
    });
    const seen = new Set(hist.map((x) => rk(x.s)));
    const dcol = (r) => (seen.has(r) ? r2(inCol[r]) : null);
    const mgr = d.manager && d.manager !== "Unassigned" ? d.manager : "Не призначено";

    if (dept === "support") {
      const doneAt = isWon || isFail ? lastMove : null;
      supportRows.push(slim({
        date: day(created), plan: d.plan, status: d.status, manager: mgr,
        done: isWon ? 1 : 0, bad: isFail ? 1 : 0, open: open ? 1 : 0,
        hours: doneAt != null ? r2(Math.max(0, (doneAt - created) / 36e5)) : null,
        taken_h: tk ? r2(Math.max(0, (tk.t - created) / 36e5)) : null,
        idle_days: open ? r2((NOW - lastMove) / DAY) : null,
      }, new Set(["done", "bad", "open"])));
      continue;
    }

    const e = entryTouch(p.touches, created);
    const orders = attributed.get(l.person_id + "|" + d.created) || [];
    const revenue = orders.reduce((a, o) => a + o.usd, 0);
    const firstPaid = orders.slice().sort((a, b) => a.at - b.at)[0];
    const anyOrder = (p.orders || []).some((o) => Date.parse(o.createdAt || o.paidAt) >= created - DAY);
    const b = beh.get(d.deal_id);
    const reason = isFail ? (d.failure || "Без причини").replace(/\.$/, "") : null;
    dealRows.push(slim({
      date: day(created), plan: d.plan, dept: DEPT[dept], status: d.status, status_order: pl?.order[d.status] ?? 99,
      stage: isFail ? "closed" : ["entry", "taken", "dozvon", "qual", "progrev", "ozhop", "won"][Math.max(0, rk(d.status))],
      tunnel: e?.tunnel || "Без підписки", lgt: e?.lgt || "Без підписки",
      campaign: (e && campByLgt.get(norm(e.lgt))) || "Без рекламної кампанії",
      taken: reach >= 1 ? 1 : 0, dozvon: reach >= 2 ? 1 : 0, qual: reach >= 3 ? 1 : 0, progrev: reach >= 4 ? 1 : 0, ozhop: reach >= 5 ? 1 : 0, won: reach >= 6 ? 1 : 0,
      paid: orders.length ? 1 : 0, revenue: r2(revenue), ordered: anyOrder ? 1 : 0,
      closed: isFail ? 1 : 0, reason, no_contact: isFail && NO_CONTACT.test(reason) ? 1 : 0,
      days_to_pay: firstPaid ? r2(Math.max(0, (firstPaid.at - created) / DAY)) : null,
      manager: mgr, taken_h: tk ? r2(Math.max(0, (tk.t - created) / 36e5)) : null,
      open: open ? 1 : 0, idle_days: open ? r2((NOW - lastMove) / DAY) : null,
      // Теги відомі лише для контактів, створених цього року (people-year.mjs); для старіших — немає даних
      mql: tg ? tg.mql : null, royal: tg ? tg.royal : null, webinar: tg ? tg.webinar : null, razbor: tg ? tg.razbor : null,
      newcontact: tg ? 1 : 0,
      sql: sqlTagged.has(l.person_id) && qualAt(d) ? 1 : 0,
      // Чат: лише там, де його збирав enrich.mjs
      bot_msgs: b ? b.bot_before ?? null : null, replied: b ? (b.client_before > 0 ? 1 : 0) : null,
      crm_replied: b ? (b.client_after > 0 ? 1 : 0) : null, manager_wrote: b ? (b.manager_after > 0 ? 1 : 0) : null,
      d_entry: dcol(0), d_taken: dcol(1), d_dozvon: dcol(2), d_qual: dcol(3), d_progrev: dcol(4), d_ozhop: dcol(5),
    }, new Set(["taken", "dozvon", "qual", "progrev", "ozhop", "won", "paid", "ordered", "closed", "no_contact", "open", "newcontact", "revenue", "sql"])));
  }
}
dealRows.sort((a, b) => a.date.localeCompare(b.date));

// ——— SQL-ліди: рядок на людину за датою першої кваліфікації цього року ———
const sqlRows = [];
for (const l of leadp) {
  let best = null;
  for (const d of l.deals) {
    const dept = plans.get(d.plan_id)?.dept || deptOf(d.plan);
    if (dept === "test" || dept === "support") continue;
    const t = qualAt(d);
    if (t && (!best || t < best.t)) best = { t, d, dept };
  }
  if (!best || Date.parse(best.t) < S) continue;
  const d = best.d, created = Date.parse(d.created), p = people.get(l.person_id);
  const e = entryTouch(p.touches, created);
  const po = paidOrders(p.orders).filter((o) => o.at >= created - DAY);
  const tags = sqlTagged.get(l.person_id);
  sqlRows.push(slim({
    date: best.t.slice(0, 10), plan: d.plan, dept: DEPT[best.dept], status: d.status,
    manager: d.manager && d.manager !== "Unassigned" ? d.manager : "Не призначено",
    tunnel: e?.tunnel || "Без підписки", lgt: e?.lgt || "Без підписки",
    tagged: tags ? 1 : 0, tags: tags ? tags.join("; ") : null,
    newcontact: tagOf.has(l.person_id) ? 1 : 0, paid: po.length ? 1 : 0, usd: r2(po.reduce((a, o) => a + o.usd, 0)),
  }, new Set(["tagged", "newcontact", "paid", "usd"])));
}
sqlRows.sort((a, b) => a.date.localeCompare(b.date));
supportRows.sort((a, b) => a.date.localeCompare(b.date));
salesRows.sort((a, b) => a.date.localeCompare(b.date));

// ——— Нові контакти року ———
const leadPeople = new Map(leadp.map((l) => [l.person_id, l]));
const contactRows = contactsRaw.map((c) => {
  const p = people.get(c.id) || journeys.get(c.id);
  const t = p ? firstTouch(p.touches) : null;
  const l = leadPeople.get(c.id);
  const lead = l ? l.deals.some((d) => { const dp = plans.get(d.plan_id)?.dept || deptOf(d.plan); return dp === "sales" || dp === "account"; }) : false;
  const po = p ? paidOrders(p.orders).filter((o) => o.at >= Date.parse(c.at) - DAY) : [];
  return slim({
    date: c.at.slice(0, 10), ch: c.ch[0] || "Невідомо",
    tunnel: t ? t.tunnel : p ? "Без підписки" : "Немає даних", lgt: t ? t.lgt : p ? "Без підписки" : "Немає даних",
    mql: c.mql, royal: c.royal, webinar: c.webinar, razbor: c.razbor, lead: lead ? 1 : 0, paid: po.length ? 1 : 0, usd: r2(po.reduce((a, o) => a + o.usd, 0)),
  }, new Set(["mql", "royal", "webinar", "razbor", "lead", "paid", "usd"]));
}).sort((a, b) => a.date.localeCompare(b.date));

// ——— Meta по днях → ЛГТ і тунель ———
const lgtTunnel = {};
for (const p of people.values()) for (const t of p.touches || []) { const k = norm(t.lgt); (lgtTunnel[k] ||= {})[t.tunnel] = (lgtTunnel[k][t.tunnel] || 0) + 1; }
const tunnelOf = (name) => { const m = lgtTunnel[norm(name)]; return m ? Object.entries(m).sort((a, b) => b[1] - a[1])[0][0] : null; };
const metaRows = metaDaily.filter((r) => r.date >= SINCE && (r.spend || r.impressions)).map((r) => ({ date: r.date, lgt: r.campaign, tunnel: tunnelOf(r.campaign) || "Тунель не знайдено", spend: r.spend, impressions: r.impressions, clicks: r.clicks, subs: r.subs }));

w("deals.json", dealRows); w("sales.json", salesRows); w("contacts.json", contactRows); w("support.json", supportRows); w("sql.json", sqlRows); w("meta_lgt.json", metaRows);
// Статистика тунелів за весь час — для блоку «Тунель» у воронці
w("tunnel_stats.json", fs.existsSync(path.join(OUT, "tunnels_all.json")) ? J(path.join(OUT, "tunnels_all.json")).filter((t) => +t.subscribers || +t.uniqReaches) : []);

// ——— Звірка ———
const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
const grp = (rows, key, val = () => 1) => Object.entries(rows.reduce((a, r) => ((a[key(r)] = (a[key(r)] || 0) + val(r)), a), {})).sort((a, b) => b[1] - a[1]);
console.log("\nлюдей з угодами року", leadp.length, "· тестових угод пропущено", skippedTest);
console.log("угоди:", dealRows.length, "| взято", sum(dealRows, (d) => d.taken), "| дозвон", sum(dealRows, (d) => d.dozvon), "| квал", sum(dealRows, (d) => d.qual), "| прогрів", sum(dealRows, (d) => d.progrev), "| ожоп", sum(dealRows, (d) => d.ozhop), "| won", sum(dealRows, (d) => d.won), "| оплатили", sum(dealRows, (d) => d.paid), "| виручка $" + Math.round(sum(dealRows, (d) => d.revenue)), "| закрито", sum(dealRows, (d) => d.closed), "| відкрито", sum(dealRows, (d) => d.open));
console.log("за планом:", grp(dealRows, (d) => d.plan).slice(0, 14).map((x) => x.join(":")).join(" | "));
console.log("за відділом:", grp(dealRows, (d) => d.dept).map((x) => x.join(":")).join(" | "));
console.log("оплати:", salesRows.length, "$" + Math.round(sum(salesRows, (s) => s.usd)), "| нові клієнти", sum(salesRows, (s) => s.newc), "$" + Math.round(sum(salesRows.filter((s) => s.newc), (s) => s.usd)));
console.log("оплати за відділом:", grp(salesRows, (s) => s.dept, (s) => s.usd).map(([k, v]) => k + ":$" + Math.round(v)).join(" | "));
console.log("оплати за планом:", grp(salesRows, (s) => s.plan, (s) => s.usd).slice(0, 12).map(([k, v]) => k + ":$" + Math.round(v)).join(" | "));
console.log("оплати за менеджером:", grp(salesRows, (s) => s.manager, (s) => s.usd).slice(0, 10).map(([k, v]) => k + ":$" + Math.round(v)).join(" | "));
console.log("контакти:", contactRows.length, "| MQL", sum(contactRows, (c) => c.mql), "| ліди", sum(contactRows, (c) => c.lead), "| оплатили", sum(contactRows, (c) => c.paid), "| без даних про тунель", contactRows.filter((c) => c.tunnel === "Немає даних").length);
console.log("контакти за тунелем:", grp(contactRows, (c) => c.tunnel).slice(0, 10).map((x) => x.join(":")).join(" | "));
console.log("SQL за рік:", sqlRows.length, "| з тегом", sum(sqlRows, (r) => r.tagged), "| 16.09–11.11 з тегом", sqlRows.filter((r) => r.tagged && r.date >= "2026-09-16" && r.date <= "2026-11-11").length, "без тега", sqlRows.filter((r) => !r.tagged && r.date >= "2026-09-16" && r.date <= "2026-11-11").length, "| за місяцем з тегом:", grp(sqlRows.filter((r) => r.tagged), (r) => r.date.slice(0, 7)).sort().map((x) => x.join(":")).join(" "), "| угод з позначкою sql", sum(dealRows, (d) => d.sql));
console.log("підтримка:", supportRows.length, grp(supportRows, (s) => s.plan).map((x) => x.join(":")).join(" | "));
console.log("meta:", metaRows.length, "$" + Math.round(sum(metaRows, (m) => m.spend)), "тунелі:", grp(metaRows, (m) => m.tunnel, (m) => m.spend).map(([k, v]) => k + ":$" + Math.round(v)).join(" | "));
const noRank = [...plans.values()].filter((p) => p.moved && p.dept !== "test").map((p) => p.name + " [" + p.dept + "] " + Object.entries(p.rank).map(([s, r]) => s + "=" + r).join(", "));
fs.writeFileSync(path.join(DASH, "_plan_stages.txt"), noRank.join("\n"));
