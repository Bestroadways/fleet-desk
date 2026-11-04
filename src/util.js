const IST = 5.5 * 3600e3;
const today = () => new Date(Date.now() + IST).toISOString().slice(0, 10);
const nowStr = () => { const d = new Date(Date.now() + IST).toISOString(); return `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)} ${d.slice(11, 16)}`; };
const iso = v => {
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const s = String(v || "").trim(); let m;
  if ((m = s.match(/^(\d{4}-\d{2}-\d{2})/))) return m[1];
  if ((m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/))) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
};
const addDays = (s, n) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5);
const range = (a, b) => { const o = []; if (!a) return o; b = b || a; if (b < a) [a, b] = [b, a]; for (let d = a; d <= b; d = addDays(d, 1)) o.push(d); return o; };
const dmy = s => s ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : "—";
const inr = n => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const km = n => Math.round(n || 0).toLocaleString("en-IN") + " km";
const col = n => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
module.exports = { today, nowStr, iso, addDays, diffDays, range, dmy, inr, km, col };
