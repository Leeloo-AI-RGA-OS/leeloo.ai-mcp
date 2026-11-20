// Файл з API-ключем Leeloo: створити й відкрити (init), перевірити (check), дочекатися, поки людина вставить ключ (wait).
// Ключ ніколи не друкується: лише статус і останні 4 символи.
// Запуск: node token.mjs init | check | wait [хвилин]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const dir = path.join(os.homedir(), ".leeloo");
const file = path.join(dir, "token.txt");
const PLACEHOLDER = "PASTE_LEELOO_TOKEN_HERE";
const cmd = process.argv[2] || "check";

function read() {
  if (!fs.existsSync(file)) return { state: "missing" };
  const t = fs.readFileSync(file, "utf8").replace(/^﻿/, "").trim();
  if (!t || t === PLACEHOLDER) return { state: "empty" };
  if (/\s/.test(t)) return { state: "bad", why: "у файлі зайві пробіли або кілька рядків" };
  return { state: "filled", t };
}
async function check() {
  const r = read();
  if (r.state !== "filled") return r;
  const tail = "…" + r.t.slice(-4);
  // тимчасові збої API (5xx, 429, обрив мережі) не означають, що ключ поганий: пробуємо ще кілька разів
  let res, why = "";
  for (let a = 0; a < 4; a++) {
    try { res = await fetch("https://api.leeloo.ai/api/v2/users?limit=1&offset=0", { headers: { "X-Leeloo-AuthToken": r.t } }); } catch (e) { res = null; why = e.message; }
    if (res && res.status !== 429 && res.status < 500) break;
    if (res) why = "HTTP " + res.status;
    await new Promise((s) => setTimeout(s, 3000 * (a + 1)));
  }
  if (!res || res.status === 429 || res.status >= 500) return { state: "net", tail, why };
  if (res.status === 200) return { state: "ok", tail };
  if (res.status === 401 || res.status === 403) return { state: "invalid", tail, why: "HTTP " + res.status };
  return { state: "net", why: "HTTP " + res.status };
}
const say = (r) => ({
  ok: `STATUS: ok (ключ ${r.tail})`,
  missing: "STATUS: missing — файлу ще немає",
  empty: "STATUS: empty — ключ ще не вставлено",
  bad: "STATUS: bad — " + r.why,
  invalid: `STATUS: invalid — Leeloo не приймає цей ключ (${r.tail}, ${r.why})`,
  net: "STATUS: net — ключ у файлі є" + (r.tail ? " (" + r.tail + ")" : "") + ", але API Leeloo зараз не відповідає: " + r.why,
}[r.state]);

if (cmd === "init") {
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, PLACEHOLDER);
  // доступ до файлу лише для поточного користувача
  if (process.platform === "win32") spawnSync("icacls", [file, "/inheritance:r", "/grant:r", `${os.userInfo().username}:F`], { stdio: "ignore" });
  else { try { fs.chmodSync(file, 0o600); } catch {} }
  const r = await check();
  console.log("FILE: " + file);
  console.log(say(r));
  // редактор відкриваємо, лише коли ключ треба вставити або замінити; при збої API файл чіпати не треба
  if (["missing", "empty", "bad", "invalid"].includes(r.state)) {
    const [bin, args] = process.platform === "win32" ? ["notepad.exe", [file]] : process.platform === "darwin" ? ["open", ["-e", file]] : ["xdg-open", [file]];
    try { spawn(bin, args, { detached: true, stdio: "ignore" }).unref(); console.log("OPENED: файл відкрито в редакторі"); } catch { console.log("OPENED: не вдалося відкрити автоматично — відкрийте файл вручну"); }
  }
  process.exit(0);
}
if (cmd === "wait") {
  const until = Date.now() + (+process.argv[3] || 20) * 60000;
  let last = "";
  while (Date.now() < until) {
    const r = await check();
    if (r.state === "ok") { console.log(say(r)); process.exit(0); }
    if (r.state !== last) { console.log(say(r)); last = r.state; }
    await new Promise((s) => setTimeout(s, r.state === "invalid" || r.state === "net" ? 8000 : 3000));
  }
  console.log("STATUS: timeout — ключ так і не з'явився");
  process.exit(1);
}
const r = await check();
console.log(say(r));
process.exit(r.state === "ok" ? 0 : 1);
