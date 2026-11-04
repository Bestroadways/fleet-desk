// Upload from the app: GTropy Trip Summary export (.xls = HTML table) and e-Fleet CN Dump [8006] (.xlsx).
const XLSX = require("xlsx");
const { db, save, log } = require("./store");
const { iso } = require("./util");
const gt = require("./gtropy");
const erp = require("./erp");
function parseGtropyHtml(text) {
  const vm = text.match(/Vehicle\s*:\s*([A-Z0-9]+)/), strip = s => s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim(), legs = []; let total = null;
  (text.match(/<tr[\s\S]*?<\/tr>/gi) || []).forEach(tr => {
    const c = (tr.match(/<td[\s\S]*?<\/td>/gi) || []).map(strip); if (c.length < 8 || !c[2]) return;
    if (/^Comprehensive/i.test(c[0])) { total = parseFloat(c[4]); return; }
    legs.push({ from: c[0], to: c[1], start: c[2], end: c[3], km: c[4] });
  });
  return { vehNo: vm ? vm[1] : null, total, days: gt.legsToDays(legs) };
}
function loadGps(files) {
  const fleet = db.fleet.map(f => f.veh), msgs = [];
  files.forEach(f => {
    const P = parseGtropyHtml(Buffer.from(f.data, "base64").toString("utf8"));
    if (!P.vehNo || !Object.keys(P.days).length) return msgs.push(`${f.name}: not a GTropy Trip Summary (Location) export, skipped`);
    if (!fleet.includes(P.vehNo)) return msgs.push(`${f.name}: ${P.vehNo} is not on Fleet, skipped`);
    const sum = Object.values(P.days).reduce((s, D) => s + D.km, 0); gt.upsert(P.vehNo, P.days, "GTropy export · " + f.name);
    msgs.push(`${f.name}: ${P.vehNo}, ${Object.keys(P.days).length} days, ${Math.round(sum)} km` + (P.total != null && Math.abs(P.total - sum) >= 2 ? ` (GTropy total says ${P.total}, check)` : ""));
  });
  log("system", "GPS file loaded", "", msgs.join(" | ")); return msgs.join("\n");
}
function loadErp(file) {
  const wb = XLSX.read(Buffer.from(file.data, "base64"), { type: "buffer", cellDates: true }), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
  const hi = rows.findIndex(r => String(r[0] || "").trim() === "Sr. No"); if (hi < 0) throw new Error('No "Sr. No" header row — is this the CN Dump Register [8006]?');
  const H = {}; rows[hi].forEach((c, i) => { if (c) H[String(c).replace(/\n/g, " ").trim()] = i; }); const g = (r, n) => (H[n] != null ? r[H[n]] : null);
  const fleet = new Set(db.fleet.map(f => f.veh)), out = [], dates = new Set(); let read = 0;
  rows.slice(hi + 1).forEach(r => {
    if (!/^\d+(\.0)?$/.test(String(r[0] ?? "").trim())) return;
    const raw = g(r, "CN Date"); let d; if (raw instanceof Date) d = new Date(raw.getTime() + 19800e3).toISOString().slice(0, 10); else d = iso(String(raw || "").replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$1-$2-$3")); if (!d) return;
    read++; dates.add(d); const v = String(g(r, "Hire Vehicle No") || "").trim() || String(g(r, "Vehicle No") || "").trim();
    const row = erp.mkRow({ date: d, cn: String(g(r, "CN No.") || "").replace("ANKLESHWAR-", ""), veh: v, route: String(g(r, "Route") || "").trim().toUpperCase(), km: +g(r, "KM") || 0, party: String(g(r, "Billing Party") || "").split(" - ")[0].split("(")[0].trim().slice(0, 28),
      frt: Math.round(+g(r, "Total Freight") || 0), ownHc: Math.round(+g(r, "Own HC") || 0), hireHc: Math.round(+g(r, "Hire HC") || 0), wt: Math.round((+g(r, "Actual Weight") || 0) / 100) / 10, src: "ERP CN Dump [8006] · " + file.name }, fleet);
    if (row) out.push(row);
  });
  erp.replaceDates(out, dates);
  const msg = `${file.name}: ${read} CNs read, ${dates.size} days replaced, ${out.filter(r => r.kind === "Own").length} own, ${out.filter(r => r.kind !== "Own").length} belt market hires kept`; log("system", "ERP CN Dump loaded", file.name, msg); return msg;
}
module.exports = { loadGps, loadErp };
