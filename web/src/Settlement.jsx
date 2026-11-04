import React, { useEffect, useState } from "react";
import { api } from "./api.js";
const inr = n => "₹" + Math.round(n || 0).toLocaleString("en-IN");
export default function Settlement({ token, boot, onDone }) {
  const prev = new Date(Date.now() + 19800e3); prev.setUTCDate(1); prev.setUTCMonth(prev.getUTCMonth() - 1);
  const [veh, setVeh] = useState(boot.fleet[0] || ""), [month, setMonth] = useState(prev.toISOString().slice(0, 7)), [d, setD] = useState(null), [msg, setMsg] = useState(null), [note, setNote] = useState(""), [inp, setInp] = useState({});
  const load = async () => { const r = await api("stl", token, veh, month); if (!r.ok) return r.relogin ? onDone(r) : setMsg({ err: r.msg }); setD(r); const s = r.s; setInp({ salary: s.salary, tolls: s.tolls || "", odoOpen: s.odoOpen || "", odoClose: s.odoClose || "", legacyNote: s.legacyNote || "" }); };
  useEffect(() => { load(); }, [veh, month]);
  const act = async a => { const r = await api("stlAct", token, veh, month, a, note); if (!r.ok) return setMsg({ err: r.msg }); setMsg({ ok: `${veh} ${month}: ${r.status}` }); setNote(""); load(); };
  const save = async () => { const r = await api("stlSet", token, veh, month, inp); setMsg(r.ok ? { ok: "Inputs saved." } : { err: r.msg }); load(); };
  const s = d?.s, B = (a, l, c) => <button className={"btn " + (c || "")} onClick={() => act(a)}>{l}</button>, I = (k, l, t = "number") => <div><label>{l}</label><input type={t} value={inp[k] ?? ""} onChange={e => setInp({ ...inp, [k]: e.target.value })} /></div>;
  const editable = s && ["Draft", "Held"].includes(s.status) && d.canPrep;
  return (<>
    <div className="card"><div className="row"><div><label>Vehicle</label><select value={veh} onChange={e => setVeh(e.target.value)}>{(boot.allVeh || boot.fleet).map(v => <option key={v}>{v}</option>)}</select></div>
      <div><label>Month</label><input type="month" value={month} onChange={e => setMonth(e.target.value)} /></div></div></div>
    {msg && <div className={"msg " + (msg.ok ? "ok" : "err")}>{msg.ok || msg.err}</div>}
    {s && <>
      <div className="card"><b>Trip settlement · {s.veh} · {s.month}</b> <span className="pill">{s.status}</span>
        {s.legacyNote && <div className="hint" style={{ marginTop: 6 }}>Legacy note: {s.legacyNote}</div>}
        <table><tbody>
          <tr><td>Km Run (GPS, {s.days} days)</td><td>{s.kmRun} km</td></tr>
          <tr><td>Earned: Own HC on own CNs</td><td>{inr(s.earned)}</td></tr>
          <tr><td>Less advances (not rejected)</td><td>{inr(s.advances)}</td></tr>
          <tr><td>Less driver salary</td><td>{inr(s.salary)}</td></tr>
          <tr><td>Less FASTag tolls</td><td>{inr(s.tolls)}</td></tr>
          <tr><td><b>Operating result</b></td><td><b>{inr(s.result)}</b></td></tr>
          <tr><td>Odometer km (closing − opening)</td><td>{s.odoKm || "—"}</td></tr>
          <tr><td>Fuel bought (L diesel / kg CNG)</td><td>{s.fuelQty}</td></tr>
          <tr><td>km per L / kg on GPS km</td><td>{s.kmPerUnit || "—"}</td></tr>
          <tr><td>Market hire on free days</td><td>{inr(s.marketHire)}</td></tr></tbody></table>
        <div className="hint" style={{ marginTop: 8 }}>Advances by type: {s.byType.filter(x => x.amount).map(x => `${x.type} ${inr(x.amount)}`).join(" · ") || "none"}</div>
        {editable && <><div className="row" style={{ marginTop: 8 }}>{I("salary", "Driver salary ₹")}{I("tolls", "FASTag tolls ₹ (month total)")}</div>
          <div className="row">{I("odoOpen", "Odometer opening")}{I("odoClose", "Odometer closing")}</div>
          <label>Legacy note</label><input value={inp.legacyNote ?? ""} onChange={e => setInp({ ...inp, legacyNote: e.target.value })} /><button className="btn" onClick={save}>Save inputs</button></>}
      </div>
      <div className="card"><b>Before it can settle</b>
        {s.checks.map(c => <div key={c.label} style={{ margin: "6px 0", color: c.ok ? "#1f7a3f" : "#c8102e" }}>{c.ok ? "✓" : "✗"} {c.label}{!c.ok && c.detail && <div className="hint">{c.detail}</div>}</div>)}
        <div style={{ marginTop: 8, fontWeight: 700 }}>Ready to settle: {s.ready ? "YES" : "NO"} <span className="hint">(Internal Audit can clear only when this is YES)</span></div></div>
      <div className="card">
        {(d.canPrep || d.canClear) && <input placeholder="Reason (needed for hold)" value={note} onChange={e => setNote(e.target.value)} />}
        {d.canPrep && ["Draft", "Held", "Settled outside portal — void"].includes(s.status) && B("submit", "Send to Internal Audit")}
        {d.canClear && s.status === "With Internal Audit" && <>{B("clear", "Clear (audit)", "ok")}{B("hold", "Hold", "red")}</>}
        {d.canPrep && s.status === "Cleared by audit" && B("settle", "Mark settled", "ok")}
        {s.trail && <div className="hint" style={{ whiteSpace: "pre-line", marginTop: 8 }}>{s.trail}</div>}
      </div></>}
  </>);
}
