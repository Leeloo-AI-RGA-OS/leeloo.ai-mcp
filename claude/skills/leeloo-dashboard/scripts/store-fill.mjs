// Готує запис у сховище дашборда після завантаження файлів даних.
// Бере DATA/dist/store.json, підставляє в кожен набір адресу завантаженого файлу (/_blob/<id>)
// і кладе готові документи в DATA/dist/docs/, щоб у пакеті ArtifactData їх можна було передати через file_path,
// не передруковуючи описи. Друкує готовий масив writes для ArtifactData action "batch".
// Запуск: node store-fill.mjs --data <папка даних> [--title "<назва>"] [--update] deals=<id файлу> sales=<id файлу> ...
//   <id файлу> — 32 символи з адреси /_blob/<id>, яку дала відповідь на завантаження. Саму адресу з косою рискою на початку
//   в Git Bash на Windows передавати не можна: оболонка перетворює її на шлях до диска.
//   --update — дашборд уже існує: набори пишуться через op "update"; до кожного запису, чий документ існує, додай if_version.
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const data = path.resolve(opt("--data", "leeloo-dashboard-data"));
const title = opt("--title", null);
const update = flag("--update");
const dist = path.join(data, "dist");
const storeFile = path.join(dist, "store.json");
if (!fs.existsSync(storeFile)) { console.error("STOP: немає " + storeFile + " — спершу запусти build.mjs"); process.exit(1); }
const store = JSON.parse(fs.readFileSync(storeFile, "utf8"));
const blobsFile = path.join(dist, "blobs.json");
const blobs = fs.existsSync(blobsFile) ? JSON.parse(fs.readFileSync(blobsFile, "utf8")) : {};
const known = new Set(store.datasets.map((d) => d.id));
for (const a of args) {
  const m = /^([\w-]+)=(?:.*\/_blob\/)?([0-9a-f]{32})$/.exec(a);
  if (!m) { console.error('STOP: не розумію "' + a + '" — чекаю <id набору>=<32 символи з адреси /_blob/...>'); process.exit(2); }
  if (!known.has(m[1])) { console.error('STOP: набору "' + m[1] + '" немає в store.json. Є: ' + [...known].join(", ")); process.exit(2); }
  blobs[m[1]] = "/_blob/" + m[2];
}
const missing = store.datasets.filter((d) => !blobs[d.id]).map((d) => d.id);
if (missing.length) { console.error("STOP: немає адреси файлу для: " + missing.join(", ") + " — завантаж ці файли й передай <id набору>=<id файлу>"); process.exit(1); }
const dup = Object.values(blobs).filter((u, i, a) => a.indexOf(u) !== i);
if (dup.length) { console.error("STOP: одна адреса вказана для кількох наборів: " + [...new Set(dup)].join(", ")); process.exit(1); }
fs.writeFileSync(blobsFile, JSON.stringify(blobs, null, 1));
const docs = path.join(dist, "docs");
fs.mkdirSync(docs, { recursive: true });
const put = (name, obj) => { const f = path.join(docs, name + ".json"); fs.writeFileSync(f, JSON.stringify(obj)); return f; };
const meta = { ...store["dash/meta"], ...(title ? { title } : {}) };
const writes = [
  { op: "set", collection: "dash", doc_id: "meta", file_path: put("_meta", meta) },
  { op: "set", collection: "dash", doc_id: "params", file_path: put("_params", store["dash/params"]) },
];
for (const d of store.datasets) {
  const doc = { ...d.doc, source: { ...d.doc.source, url: blobs[d.id] } };
  writes.push({ op: update ? "update" : "set", collection: "datasets", doc_id: d.id, file_path: put(d.id, doc) });
}
writes.push({ op: "set", collection: "files", doc_id: "index.html", file_path: store["files/index.html"].file_path });
console.log("WRITES " + JSON.stringify(writes));
console.log("OK: документів " + writes.length + " · назва «" + meta.title + "»" + (update ? " · оновлення: додай if_version до записів, чиї документи вже існують" : ""));
