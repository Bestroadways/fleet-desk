import React, { useState } from "react";
import { api } from "./api.js";
import Slot from "./Files.jsx";

export default function NewRequest({ token, boot, cfg, onDone }) {
  const [veh, setVeh] = useState(boot.fleet[0] || "");
  const [type, setType] = useState("");
  const [f, setF] = useState({ amount: "", litres: "", odo: "", otpMobile: "", pay: "", pumpAcc: "", cn: "", route: "", from: new Date().toISOString().slice(0, 10), to: "", items: "", purpose: "", noReceipt: false, noReceiptWhy: "" });
  const [files, setFiles] = useState({}); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null); const [k, setK] = useState(0);
  const fuel = boot.fuel[veh] || "Diesel", types = cfg.types.filter(t => !["Diesel", "CNG"].includes(t) || t === fuel);
  const set = (n, v) => setF(o => ({ ...o, [n]: v }));
  const cng = type === "CNG", isFuel = type === "Diesel" || cng, trip = type === "Trip advance", need = cfg.need[type] || {};
  const payList = cng ? cfg.pay.cng : type === "Diesel" ? cfg.pay.diesel : cfg.pay.other;
  const pick = t => { setType(t); setFiles({}); setF(o => ({ ...o, pay: "" })); setK(x => x + 1); };

  async function send() {
    if (!type) return setMsg({ err: "Pick what the money is for." });
    setBusy(true); setMsg(null);
    const p = { mode: "new", vehicle: veh, type, amount: f.amount, litres: f.litres, odo: f.odo, otpMobile: cng ? "" : f.otpMobile, pay: f.pay || payList[0], pumpAcc: f.pumpAcc, cn: f.cn, route: f.route,
      from: isFuel || trip ? "" : f.from, to: isFuel || trip ? "" : f.to, items: f.items, purpose: f.purpose, noReceipt: f.noReceipt, noReceiptWhy: f.noReceiptWhy, files: Object.values(files).flat() };
    const r = await api("submit", token, p); setBusy(false);
    if (!r.ok) return r.relogin ? onDone(r) : setMsg({ err: r.msg });
    setMsg({ ok: `Request ${r.id} sent to Sitaram ji for approval.` + (r.level !== "OK" ? `\n\nFlag (${r.level}) — the desk will ask about this:\n${r.flags}` : "\n\nAll checks pass against GPS and the ERP register.") });
    setF(o => ({ ...o, amount: "", litres: "", odo: "", cn: "", route: "", items: "", purpose: "", noReceipt: false, noReceiptWhy: "", pumpAcc: "" })); setFiles({}); setK(x => x + 1); onDone(r);
  }
  return (<>
    <div className="card">
      <label>Vehicle</label>
      <select value={veh} onChange={e => { setVeh(e.target.value); setType(""); }}>{boot.fleet.map(v => <option key={v}>{v}</option>)}</select>
      {fuel === "CNG" && <div className="hint">CNG vehicle · CNG गाड़ी — fuel in kg</div>}
      <label>What is the money for?</label>
      <div className="types">{types.map(t => <button key={t} type="button" className={t === type ? "on" : ""} onClick={() => pick(t)}>{t}</button>)}</div>
    </div>
    {type && <div className="card">
      <div className="row"><div><label>Amount ₹</label><input type="number" inputMode="decimal" value={f.amount} onChange={e => set("amount", e.target.value)} /></div>
        {isFuel && <div><label>{cng ? "CNG kg" : "Litres"}</label><input type="number" inputMode="decimal" value={f.litres} onChange={e => set("litres", e.target.value)} /></div>}</div>
      {isFuel && <><label>Odometer km <small>— as in the photo</small></label><input type="number" inputMode="decimal" value={f.odo} onChange={e => set("odo", e.target.value)} />
        {!cng && <><label>Mobile for the OTP <small>— driver's number at the pump</small></label><input type="tel" value={f.otpMobile} onChange={e => set("otpMobile", e.target.value)} /></>}</>}
      <label>{cng ? "Pay to · भुगतान" : type === "Diesel" ? "Pump (OTP)" : "Pay by"}</label>
      <select value={f.pay || payList[0]} onChange={e => set("pay", e.target.value)}>{payList.map(x => <option key={x}>{x}</option>)}</select>
      {cng && (f.pay || payList[0]) === cfg.pumpBank && <><label>CNG pump name + account / UPI <small>— पंप का नाम + खाता / UPI</small></label>
        <input value={f.pumpAcc} placeholder="e.g. Gujarat Gas CNG, GIDC Ankleshwar · A/c 1234567890 IFSC HDFC0001234" onChange={e => set("pumpAcc", e.target.value)} /></>}
      {trip && <><label>LR / CN number</label><input value={f.cn} onChange={e => set("cn", e.target.value)} placeholder="e.g. E36271" /><label>Route</label><input value={f.route} onChange={e => set("route", e.target.value)} placeholder="e.g. Panvel → Vapi" /></>}
      {!isFuel && !trip && <><div className="row"><div><label>Work date — from</label><input type="date" value={f.from} onChange={e => set("from", e.target.value)} /></div><div><label>to</label><input type="date" value={f.to} onChange={e => set("to", e.target.value)} /></div></div>
        <label>Each line with amount <small>— e.g. Dala 600, Loading 400</small></label><textarea value={f.items} onChange={e => set("items", e.target.value)} /></>}
      <label>Purpose</label><textarea value={f.purpose} onChange={e => set("purpose", e.target.value)} placeholder="e.g. Ankleshwar → Bhiwandi load, fuel for the trip" />
    </div>}
    {type && <div className="card" key={k}><b>Photos / documents</b>
      <div className="hint">Take the photo with the phone camera or pick from the gallery. Readable numbers only.</div>
      {Object.keys(need).map(s => <Slot key={s} slot={s} label={need[s][0]} required={need[s][1]} onFiles={(sl, fl) => setFiles(o => ({ ...o, [sl]: fl }))} />)}
      {need.bills && <><label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={f.noReceipt} onChange={e => set("noReceipt", e.target.checked)} /> No receipt is available</label>
        {f.noReceipt && <input value={f.noReceiptWhy} placeholder="Why — e.g. hotel parking, no slip given" onChange={e => set("noReceiptWhy", e.target.value)} />}</>}
    </div>}
    <button className="send" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send request"}</button>
    {msg && <div className={"msg " + (msg.ok ? "ok" : "err")}>{msg.ok || msg.err}</div>}
  </>);
}
