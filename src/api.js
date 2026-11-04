require("./env");
process.env.APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 8080}`;
// All calls the React page makes: cfg, login, logout, boot, submit, idle, list, act.
const crypto = require("crypto"), fs = require("fs"), path = require("path");
const { db, save, log, DATA } = require("./store");
const K = require("./constants");
const { today, nowStr, inr, km, dmy, addDays } = require("./util");
const { flagsFor, level, flagText } = require("./rules");
const mail = require("./mail");

const S = mail.S;
const roleOf = email => { email = String(email || "").toLowerCase(); if (!email) return "Viewer"; if (email === S("Owner email").toLowerCase()) return "Admin"; const p = db.people.find(x => x.email === email); return p ? p.role : "Viewer"; };
const can = (role, what) => (K.CAN[what] || []).includes(role);
const emailsWith = roles => db.people.filter(p => roles.includes(p.role) && p.email).map(p => p.email);
const fleetFuel = () => { const o = {}; db.fleet.forEach(f => { o[f.veh] = f.fuel === "CNG" ? "CNG" : "Diesel"; }); return o; };

const toRule = a => ({ id: a.id, veh: a.veh, date: a.date, type: K.TYPES[a.type] || "other", typeLabel: a.type, amount: +a.amount || 0, litres: +a.litres || 0, odo: +a.odo || 0, from: a.from || "", to: a.to || "",
  purpose: a.purpose || "", photo: a.photo || "", bill: a.bill || "", status: a.status, driverPhoto: a.driverPhoto || "", legacy: /legacy/i.test(a.source || "") });
function loadData() {
  const D = { gps: {}, erp: {}, fleet: {}, limits: {} };
  Object.values(db.gps).forEach(g => { D.gps[g.key] = { km: g.km, halts: g.halts, note: g.note }; });
  db.erp.forEach(e => { if (e.kind && e.kind !== "Own") return; const k = `${e.veh}_${e.date}`; (D.erp[k] = D.erp[k] || []).push({ cn: e.cn, route: e.route, km: e.km }); });
  db.fleet.forEach(f => { D.fleet[f.veh] = { cleaner: f.cleaner, kmpl: [f.kmin, f.kmax], fuel: f.fuel }; });
  Object.keys(db.settings).forEach(n => { if (n.startsWith("Branch limit · ")) D.limits[n.replace("Branch limit · ", "")] = +db.settings[n] || 0; });
  D.idleKm = +S("Idle day: GPS km at or below") || 15;
  D.leg = [+S("Trip leg: short lane up to km") || 100, +S("Trip leg: short lane days") || 1, +S("Trip leg: medium lane up to km") || 400, +S("Trip leg: medium lane days") || 2, +S("Trip leg: long lane days") || 5];
  D.cngMin = +S("CNG rate check: min ₹/kg") || 65; D.cngMax = +S("CNG rate check: max ₹/kg") || 100;
  return D;
}
function recheck(a, D, all) { D = D || loadData(); all = all || db.adv.map(toRule); const F = flagsFor(toRule(a), all, D); a.level = level(F); a.flags = flagText(F); return a.level; }
function recheckAll() { const D = loadData(), all = db.adv.map(toRule); db.adv.forEach(a => recheck(a, D, all)); save(); return db.adv.length; }
const trail = (a, s, who) => { a.trail = (a.trail ? a.trail + "\n" : "") + `${nowStr()} · ${s} · ${who}`; };

// ---------- views
const me = email => { const p = db.people.find(x => x.email === email) || {}, role = roleOf(email); return { email, name: p.name || email, role, canRaise: can(role, "raise"), test: role === "Admin" }; };
const openForBill = () => db.adv.filter(a => ["Approved", "Paid"].includes(a.status) && !a.bill && !/legacy|whatsapp/i.test(a.source || "")).map(a => ({ id: a.id, veh: a.veh, date: a.date, type: a.type, amt: a.amount })).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30);
const recent = who => { const r = roleOf(who); return db.adv.filter(a => !who || a.raisedBy === who || r !== "Ankleshwar branch").map(a => ({ id: a.id, veh: a.veh, date: a.date, type: a.type, amt: a.amount, status: a.status, level: a.level })).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12); };
const idleInfo = key => { const r = db.idle.find(x => x.key === key); if (!r) return null; return { key, date: r.date, veh: r.veh, status: r.status, km: r.km, where: r.where, loads: r.loads, hire: r.hire, done: r.state !== "Waiting for branch", reason: r.reason, reasons: key.startsWith("CN_") ? K.IW_CN_REASONS : K.IW_REASONS, isCn: key.startsWith("CN_") }; };

// ---------- login
const fails = new Map(), unlocks = new Map();
const maskMail = e => e.replace(/^(.).*?(@.*)$/, "$1***$2");
// finds the person by mobile or email and checks the PIN; wrong tries are counted per mobile / email (5 → 15 minutes)
function lookup(id, pin) {
  id = String(id || "").trim(); pin = String(pin || "").trim();
  const byMail = id.includes("@"), key = byMail ? id.toLowerCase() : id.replace(/\D/g, "").slice(-10), f = fails.get(key) || { n: 0, until: 0 };
  if (f.until > Date.now()) return { err: "Too many wrong tries. Wait 15 minutes, or call the FMS Helpdesk 95949 63357." };
  const p = key && (byMail ? db.people.find(x => x.email === key) : key.length === 10 && db.people.find(x => x.mobile === key));
  if (!p || !/^\d{4,6}$/.test(pin) || p.pin !== pin) { f.n++; if (f.n >= 5) { f.until = Date.now() + 900e3; f.n = 0; } fails.set(key, f); return { err: "Mobile number / email or PIN is wrong." }; }
  return { p, key, byMail };
}
function startSession(p, how) {
  const tok = crypto.randomBytes(20).toString("hex"); db.sessions[tok] = { email: p.email, exp: Date.now() + 30 * 864e5 }; save(); log(p.email, "App login", how);
  return { ok: true, token: tok, me: me(p.email) };
}
function auth(tok) {
  tok = String(tok || ""); const s = db.sessions[tok]; if (!s) return "";
  if (s.exp < Date.now()) { delete db.sessions[tok]; save(); return ""; }
  return K.LOGIN_ROLES.includes(roleOf(s.email)) ? s.email : "";
}
const RELOGIN = { ok: false, relogin: true, msg: "Please log in again." };

const API = {
  cfg: () => ({ ok: true, types: Object.keys(K.TYPES), need: K.RF_NEED, pay: K.RF_PAY, pumpBank: K.RF_PUMP_BANK, serverNow: Date.now() }),
  login(id, pin, device) { // id = 10-digit mobile OR email address
    const L = lookup(id, pin); if (L.err) return { ok: false, msg: L.err };
    const { p, key, byMail } = L; device = String(device || "").slice(0, 60);
    if (!K.LOGIN_ROLES.includes(p.role)) return { ok: false, msg: `${p.name} is not set up for the Fleet Desk. Ask the Director's office.` };
    if (p.device && device && p.device !== device) return { ok: false, locked: true, msg: "Your login is locked to another phone." };
    if (!p.device && device) p.device = device;
    fails.delete(key); return startSession(p, byMail ? "email" : "mobile");
  },
  // "This is my new phone": the correct PIN is not enough — a 6-digit code goes to the person's own registered email
  async requestUnlock(id, pin) {
    const L = lookup(id, pin); if (L.err) return { ok: false, msg: L.err }; const { p, key } = L;
    if (!/@/.test(p.email)) return { ok: false, msg: "No email is saved for this login. Call the FMS Helpdesk (95949 63357) to reset your phone." };
    const old = unlocks.get(key); if (old && Date.now() - old.sent < 60e3) return { ok: false, msg: "A code was just sent. Wait a minute before asking again." };
    const code = String(crypto.randomInt(100000, 1000000)); unlocks.set(key, { code, exp: Date.now() + 10 * 60e3, tries: 0, sent: Date.now() });
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;max-width:480px"><div style="background:#0f2747;color:#fff;padding:12px 16px;font-size:16px;font-weight:700;border-bottom:4px solid #c8102e">Ankleshwar Fleet Desk</div>
      <p>Someone asked to use <b>${p.name || p.email}</b>'s login on a new phone.</p><p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:12px 0">${code}</p>
      <p>Enter this code on the login screen within 10 minutes. If it was not you, ignore this mail and tell the FMS Helpdesk (95949 63357).</p></div>`;
    const sent = await mail.send(p.email, "Fleet Desk — code to use a new phone", html);
    if (!sent) { unlocks.delete(key); return { ok: false, msg: "The code could not be mailed. Call the FMS Helpdesk (95949 63357) to reset your phone." }; }
    log(p.email, "Phone change requested", "", ""); return { ok: true, to: maskMail(p.email) };
  },
  confirmUnlock(id, pin, code, device) {
    const L = lookup(id, pin); if (L.err) return { ok: false, msg: L.err }; const { p, key, byMail } = L; device = String(device || "").slice(0, 60);
    const u = unlocks.get(key); if (!u || u.exp < Date.now()) { unlocks.delete(key); return { ok: false, msg: "The code has expired. Ask for a new one." }; }
    if (String(code || "").trim() !== u.code) { if (++u.tries >= 5) unlocks.delete(key); return { ok: false, msg: "That code is not right." }; }
    unlocks.delete(key); p.device = device; fails.delete(key); save(); log(p.email, "Phone changed", "", "unlocked with an email code");
    mail.compose(emailsWith(["Admin"]), `Phone changed · ${p.name || p.email}`, [["Person", p.name || p.email], ["Email", p.email], ["When", nowStr()]], "This login was moved to a new phone after the person confirmed with a code sent to their own email. If this was not expected, clear the phone on Desk → People.", "", false);
    return startSession(p, byMail ? "email" : "mobile");
  },
  logout(tok) { delete db.sessions[String(tok || "")]; save(); return { ok: true }; },
  boot(tok, idleKey) {
    const who = auth(tok); if (!who) return RELOGIN;
    return { ok: true, me: me(who), fleet: db.fleet.map(f => f.veh), allVeh: require("./settle").allVeh(), fuel: fleetFuel(), open: openForBill(), recent: recent(who), idle: idleKey ? idleInfo(idleKey) : null, idleKey: idleKey || "", serverNow: Date.now() };
  },
  submit(tok, p) {
    const who = auth(tok); if (!who) return RELOGIN; const role = roleOf(who);
    if (!can(role, "raise")) throw new Error(`${who} is not on the People list with a raise role. Ask the Director's office to add you.`);
    const r = p.mode === "bill" ? attachBill(p, who) : newRequest(p, who, role);
    return Object.assign({ ok: true }, r, { open: openForBill(), recent: recent(who) });
  },
  list(tok) {
    const who = auth(tok); if (!who) return RELOGIN; const role = roleOf(who);
    const st = { "Sangwari approver": ["Raised", "Awaiting audit", "Approved", "Paid"], "Sangwari ops": ["Approved", "Paid"], "Internal Audit": ["Awaiting audit"], Admin: ["Raised", "Awaiting audit", "Approved", "Paid"] }[role] || [];
    const rows = db.adv.filter(a => st.includes(a.status)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 100);
    return { ok: true, rows: rows.map(a => ({ id: a.id, veh: a.veh, date: a.date, type: a.type, amount: a.amount, litres: a.litres, odo: a.odo, mode: a.mode, status: a.status, level: a.level, flags: a.flags, purpose: a.purpose, note: a.note, payref: a.payref, photo: a.photo, bill: a.bill, driverPhoto: a.driverPhoto, raisedBy: a.raisedBy, trail: a.trail, legacy: /legacy/i.test(a.source || "") })) };
  },
  act(tok, id, action, note, payref) {
    const who = auth(tok); if (!who) return RELOGIN; const role = roleOf(who);
    const a = db.adv.find(x => x.id === id); if (!a) throw new Error("Request not found.");
    note = String(note || "").trim(); const from = a.status; const lvl = recheck(a);
    const need = (c, msg) => { if (!c) throw new Error(msg); };
    if (note) a.note = note;
    if (action === "approve") {
      need(from === "Raised", "Only a Raised request can be approved."); need(can(role, "approve"), "Only Sitaram (Sangwari approver) approves."); need(a.raisedBy !== who, "Nobody approves their own request.");
      a.approvedBy = who; a.approvedAt = nowStr();
      if (lvl === "Red" || lvl === "Audit") { a.status = "Awaiting audit"; trail(a, `approved → sent to audit (${lvl} flag)`, who); } else { a.status = "Approved"; trail(a, "approved", who); }
    } else if (action === "reject") {
      need(["Raised", "Awaiting audit"].includes(from), "Can't reject at this step."); need(from === "Raised" ? can(role, "approve") : can(role, "audit"), "Your role can't reject at this step."); need(note, "Write the reason in the note first.");
      a.status = "Rejected"; trail(a, "rejected — " + note, who);
    } else if (action === "audit_clear") {
      need(from === "Awaiting audit", "Not waiting for audit."); need(can(role, "audit"), "Only Internal Audit clears a flagged request."); need(note, "Write the audit note first.");
      a.status = "Approved"; a.auditBy = who; a.auditAt = nowStr(); trail(a, "audit cleared — " + note, who);
    } else if (action === "pay") {
      need(from === "Approved", "Only an Approved request can be paid."); need(can(role, "pay"), "Only Sangwari records payment."); need(String(payref || "").trim(), "Enter the OTP / Happay / UTR reference first. No reference, no payment record.");
      a.payref = String(payref).trim(); a.status = "Paid"; a.paidBy = who; a.paidAt = nowStr(); trail(a, "paid · ref " + a.payref, who);
    } else if (action === "close") {
      need(from === "Paid", "Only a Paid request can be closed."); need(can(role, "close"), "Your role can't close requests.");
      const legacy = /legacy/i.test(a.source || ""), fuel = ["Diesel", "CNG"].includes(a.type);
      need(legacy || fuel || a.bill, "Attach the bill / slip before closing."); need(legacy || !fuel || a.bill || a.photo, "Attach the pump slip before closing.");
      a.status = "Closed"; a.closedBy = who; a.closedAt = nowStr(); trail(a, "closed", who);
    } else if (action === "audit_review") {
      need(can(role, "audit"), "Only Internal Audit marks a request reviewed."); need(a.note, "Write the audit note first."); a.reviewed = true; a.auditBy = who; a.auditAt = nowStr(); trail(a, "audit reviewed — " + a.note, who);
    } else if (action === "admin_set") {
      need(role === "Admin", "Admin only."); const to = String(payref || "").trim(); need(["Raised", "Awaiting audit", "Approved", "Paid", "Closed", "Rejected"].includes(to), "Pick a status in the reference box."); a.status = to; trail(a, `status set ${from} → ${to} by admin`, who);
    } else throw new Error("Unknown action.");
    recheck(a); save(); log(who, "Advance " + action, id, `${from} → ${a.status}`); notifyStatus(a, who);
    return { ok: true, status: a.status };
  },
  idle(tok, p) {
    const who = auth(tok); if (!who) return RELOGIN; const role = roleOf(who);
    if (!K.IDLE_ANSWER_ROLES.includes(role)) throw new Error(`${who} can't answer for the branch.`);
    const r = db.idle.find(x => x.key === p.key); if (!r) throw new Error("This day is not on the list any more. Open the link from the latest mail.");
    const norm = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (norm(p.vehicle) !== norm(r.veh)) throw new Error(`The vehicle number must be ${r.veh} — check the truck and type it again.`);
    if (!(p.key.startsWith("CN_") ? K.IW_CN_REASONS : K.IW_REASONS).includes(p.reason)) throw new Error("Pick the reason.");
    if (String(p.details || "").trim().length < 15) throw new Error("Write what happened in a full line — place, client, CN or job card.");
    if (String(p.action || "").trim().length < 5) throw new Error("Write what was done / will be done.");
    const saved = saveFiles("IDLE-" + r.key, p.files || []), hrs = Math.round((Date.now() - r.detected) / 36e5 * 10) / 10;
    Object.assign(r, { vehConfirmed: r.veh, reason: p.reason, details: String(p.details).trim() + (p.cn ? `\nCN: ${p.cn}` : ""), action: String(p.action).trim(), explainedBy: who, explainedAt: nowStr(), hours: hrs, photos: saved.map(f => f.url).join("\n"), state: hrs > 24 ? "Explained late" : "Explained" });
    const isCn = r.key.startsWith("CN_"), g = db.gps[isCn ? `${r.veh}_${r.date}` : r.key];
    if (g) { const n = (isCn ? `Market ${r.key.slice(3)}: ` : "") + `${p.reason.split(" · ")[0]} — ${String(p.details).trim()}`; g.note = isCn && g.note ? g.note + "\n" + n : n; g.noteBy = who; g.noteAt = nowStr(); }
    save(); log(who, "Idle day explained", r.key, `${p.reason} · ${hrs} h`);
    mail.compose(emailsWith(["Sangwari approver"]), `Explained · ${r.veh} ${r.status === "Idle" ? "idle" : "ran without CN"} on ${dmy(r.date)}${hrs > 24 ? " (late)" : ""}`, [["Vehicle", r.veh], ["Date", dmy(r.date)], ["Status", r.status], ["Reason", p.reason], ["What happened", String(p.details).replace(/\n/g, "<br>")], ["What is being done", p.action], ["CN", p.cn || ""], ["Explained by", who], ["Hours taken", hrs]],
      "The branch has explained an idle / no-CN day of our truck. Sitaram ji, please check it against GPS.", filesHtml(saved), true);
    return { ok: true, idle: idleInfo(r.key) };
  },
};

// ---------- files (stored on this server, signed links)
const sign = n => crypto.createHmac("sha256", process.env.FILE_SECRET || "dev").update(n).digest("hex").slice(0, 24);
function saveFiles(id, files) {
  const n = {};
  return files.map(f => {
    if (!/^(image\/|application\/pdf)/.test(f.mime)) throw new Error("Only photos and PDFs.");
    const buf = Buffer.from(f.data, "base64"); if (buf.length > 10 * 1024 * 1024) throw new Error(f.name + " is over 10 MB.");
    n[f.slot] = (n[f.slot] || 0) + 1; const m = today().slice(0, 7); fs.mkdirSync(path.join(DATA, "files", m), { recursive: true });
    const name = `${m}/${id}_${f.slot}_${n[f.slot]}_${crypto.randomBytes(4).toString("hex")}.${f.mime === "application/pdf" ? "pdf" : "jpg"}`;
    fs.writeFileSync(path.join(DATA, "files", name), buf);
    return { slot: f.slot, url: `${process.env.APP_URL}/f/${name}?s=${sign(name)}` };
  });
}
const filesHtml = saved => (!saved || !saved.length ? "" : `<p style="margin:12px 0 4px;font-weight:600;">Attachments</p><ul style="margin:0;padding-left:18px;font-size:13px;">` + saved.map(f => `<li><a href="${f.url}">${f.slot}</a></li>`).join("") + "</ul>");

// ---------- new request / bill
function newRequest(p, who, role) {
  const type = p.type, need = K.RF_NEED[type]; if (!need) throw new Error("Pick a request type.");
  if (!db.fleet.some(f => f.veh === p.vehicle)) throw new Error("Pick a vehicle from the list.");
  const fuel = fleetFuel()[p.vehicle] || "Diesel", isF = type === "Diesel" || type === "CNG";
  if (isF && type !== fuel) throw new Error(`${p.vehicle} runs on ${fuel}. Pick ${fuel}. · ${p.vehicle} ${fuel === "CNG" ? "CNG" : "डीज़ल"} गाड़ी है।`);
  const amt = +p.amount || 0; if (amt <= 0) throw new Error("Enter the amount.");
  const files = p.files || [], has = s => files.some(f => f.slot === s), noRcpt = p.noReceipt && String(p.noReceiptWhy || "").trim().length >= 5;
  Object.keys(need).forEach(s => { if (!need[s][1] || has(s)) return; if (s === "bills" && noRcpt) return; throw new Error(`Attach: ${need[s][0]}.`); });
  if (isF) { if (!(+p.odo > 0)) throw new Error("Enter the odometer km shown in the photo."); if (!p.pay) throw new Error(type === "CNG" ? "Pick how it is paid: Happay card or the pump's account." : "Pick the pump."); }
  if (type === "CNG") { if (!(+p.litres > 0)) throw new Error("Enter the CNG kg shown on the pump."); if (p.pay === K.RF_PUMP_BANK && String(p.pumpAcc || "").trim().length < 8) throw new Error("Write the CNG pump's name and its account / UPI, so Sitaram ji pays the right account."); }
  if (type === "Trip advance" && !String(p.cn || "").trim()) throw new Error("Enter the LR / CN number.");
  if (!isF && type !== "Trip advance" && !p.from) throw new Error("Enter the work date (from).");
  if (!String(p.purpose || "").trim()) throw new Error("Write what the money is for.");

  const date = today(), id = "A" + date.replace(/-/g, "") + "-" + crypto.randomBytes(2).toString("hex").toUpperCase(), saved = saveFiles(id, files);
  const urls = f => f.map(x => x.url).join("\n");
  const purpose = [(role === "Admin" ? "TEST — please reject. " : "") + String(p.purpose).trim(), p.route ? "Route: " + p.route : "", p.items ? "Lines: " + p.items : "", p.noReceipt ? "No receipt — " + String(p.noReceiptWhy).trim() : "", p.otpMobile ? "OTP mobile: " + p.otpMobile : "", type === "CNG" && p.pay === K.RF_PUMP_BANK ? "Pay to CNG pump: " + String(p.pumpAcc).trim() : ""].filter(String).join("\n");
  const a = { id, veh: p.vehicle, date, type, amount: amt, litres: +p.litres || 0, odo: +p.odo || 0, mode: p.pay || "", from: p.from || "", to: p.to || p.from || "", cn: String(p.cn || "").trim(), purpose,
    photo: urls(saved.filter(f => !K.RF_BILL_SLOTS.includes(f.slot) && f.slot !== "driver")), bill: urls(saved.filter(f => K.RF_BILL_SLOTS.includes(f.slot))), status: "Raised", level: "", flags: "", note: "", payref: "", reviewed: false,
    raisedBy: who, raisedAt: nowStr(), approvedBy: "", approvedAt: "", auditBy: "", auditAt: "", paidBy: "", paidAt: "", closedBy: "", closedAt: "", source: (role === "Admin" ? "Form (TEST)" : "Form") + " · app", trail: "", driverPhoto: urls(saved.filter(f => f.slot === "driver")) };
  trail(a, `raised (app, ${saved.length} file${saved.length === 1 ? "" : "s"})`, who);
  db.adv.push(a); recheck(a); save(); log(who, "Request raised", id, `${p.vehicle} · ${type} · ${inr(amt)} · ${a.level}`);
  const flagHtml = a.level !== "OK" ? `<p style="margin:12px 0 0;padding:8px 10px;background:#fdecee;border-left:4px solid #c8102e;font-size:13px;white-space:pre-line;">${a.flags}</p>` : "";
  mail.compose(emailsWith(["Sangwari approver"]), `${role === "Admin" ? "TEST · " : ""}Advance request ${id} · ${a.veh} · ${type} · ${inr(amt)}` + (a.level !== "OK" ? ` · ${a.level} flag` : ""), [
    ["Request", id], ["Vehicle", a.veh], ["Type", type], ["Amount", inr(amt)], [type === "CNG" ? "CNG kg" : "Litres", a.litres || ""], ["Odometer", a.odo ? km(a.odo) : ""], [type === "CNG" ? "Pay to" : "Pump / pay by", a.mode], ["LR / CN", a.cn],
    ["Work dates", a.from ? (a.to && a.to !== a.from ? `${dmy(a.from)} → ${dmy(a.to)}` : dmy(a.from)) : ""], ["For", purpose.replace(/\n/g, "<br>")], ["Raised by", who], ["Check against GPS + ERP", a.level]],
    "A new advance request is on the Fleet Desk. Sitaram ji, please approve or reject it in the app (Approvals). Flagged requests go to Internal Audit before payment.", flagHtml + filesHtml(saved), a.level !== "OK");
  return { ok: true, id, level: a.level, flags: a.flags };
}
function attachBill(p, who) {
  const files = p.files || []; if (!files.length) throw new Error("Attach the slip / bill.");
  const a = db.adv.find(x => x.id === p.billFor); if (!a) throw new Error("Pick the request this bill belongs to.");
  const saved = saveFiles(a.id, files); a.bill = (a.bill ? a.bill + "\n" : "") + saved.map(f => f.url).join("\n"); if (+p.litres > 0 && !a.litres) a.litres = +p.litres;
  trail(a, `bill / slip attached (app, ${saved.length})` + (p.purpose ? " — " + p.purpose : ""), who); recheck(a); save(); log(who, "Bill attached", a.id, saved.length + " file(s)");
  return { ok: true, id: a.id, bill: true };
}
function notifyStatus(a, who) {
  const raiser = /@/.test(a.raisedBy) ? [a.raisedBy] : [];
  const rows = [["Request", a.id], ["Vehicle", a.veh], ["Type", a.type], ["Amount", inr(a.amount)], ["Status", a.status], ["Note", a.note], ["Payment ref", a.payref], ["By", who]];
  const map = { "Approved": [raiser.concat(emailsWith(["Sangwari ops", "Sangwari approver"])), "Approved — pay it and enter the OTP / Happay / UTR reference in the app before marking Paid."],
    "Awaiting audit": [emailsWith(["Internal Audit"]).concat(raiser), "Approved by Sitaram but flagged — Internal Audit clears it before payment."], "Rejected": [raiser, "Rejected. The reason is in the note. Raise a fresh request if needed."],
    "Paid": [raiser, "Paid. After the work, attach the pump slip / bills in the app (Attach slip / bill)."], "Closed": [raiser, "Closed."] }[a.status];
  if (map) mail.compose(map[0], `Advance ${a.id} · ${a.veh} · ${a.status}`, rows, map[1], "", a.status === "Awaiting audit" || a.status === "Rejected" || (a.level && a.level !== "OK"));
}
Object.assign(API, require("./api2")({ auth, roleOf, can, RELOGIN, trail, recheck, recheckAll, loadData, toRule, saveFiles, emailsWith }));
module.exports = { API, sign, recheckAll, emailsWith, loadData, roleOf };
