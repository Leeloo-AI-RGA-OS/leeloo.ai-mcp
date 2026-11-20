// Спільне для скриптів вивантаження: токен, запити з дотриманням ліміту API (300 запитів/хв) і шлях людини.
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const PLACEHOLDER = "PASTE_LEELOO_TOKEN_HERE";
const file = path.join(os.homedir(), ".leeloo", "token.txt");
const token = process.env.LEELOO_API_TOKEN?.trim() || (fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/^﻿/, "").trim() : "");
if (!token || token === PLACEHOLDER) { console.error("Немає токена. Вставте його у " + file); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const stat = { req: 0, limited: 0 };
const GAP = 130; // мс між запитами; якщо API відповідає 429, пауза 4 с — темп сам підлаштовується під ліміт
let next = 0;
export async function get(p) {
  for (let a = 0; a < 200; a++) {
    const now = Date.now(); const at = Math.max(now, next); next = at + GAP; if (at > now) await sleep(at - now);
    stat.req++;
    let r; try { r = await fetch("https://api.leeloo.ai/api/v2" + p, { headers: { "X-Leeloo-AuthToken": token, Accept: "application/json" } }); } catch { await sleep(3000); continue; }
    if (r.status === 404) return null;
    if (r.status === 429) { stat.limited++; next = Date.now() + 4000; await sleep(4000); continue; }
    if (r.status >= 500) { await sleep(3000); continue; }
    try { return await r.json(); } catch { return null; }
  }
  throw new Error("не вдалося: " + p);
}
// Дата створення запису з його id
export const born = (id) => parseInt(String(id).slice(0, 8), 16) * 1000;
export async function pool(items, n, fn, label = "") {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const it = items[i++];
      try { await fn(it); } catch (e) { console.log("! " + e.message); }
      if (++done % 200 === 0 || done === items.length) console.log(`  ${label} ${done}/${items.length} · запитів ${stat.req} · очікувань ліміту ${stat.limited}`);
    }
  }));
}
// Шлях людини: підписки (тунель, ЛГТ, дата) та замовлення. Без імен і контактів.
export async function journey(id) {
  const touches = []; let orders = null, cursor = null;
  for (let pg = 0; pg < 10; pg++) {
    const j = await get(`/customer-journeys/${id}?limit=100${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`);
    (j?.data?.touches || []).forEach((x) => touches.push({ at: x.subscribedAt, tunnel: x.tunnelName, lgt: x.leadgentoolName, sys: !!x.isSystemLeadgentool }));
    orders ??= (j?.data?.orders || []).map((o) => ({ id: o.orderId, paidAt: o.paidAt, createdAt: o.createdAt, amount: o.amount, currency: o.currency, status: o.status, product: o.productName }));
    cursor = j?.data?.touches_pagination?.has_more ? j.data.touches_pagination.next_cursor : null;
    if (!cursor) break;
  }
  return { touches, orders: orders || [] };
}
