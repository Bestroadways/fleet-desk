import React, { useEffect, useState } from "react";
import { api } from "./api.js";
const COL = { cn: "#1f7a3f", leg: "#1f7a3f", idle: "#8a6100", unbooked: "#c8102e", nogps: "#5b6675" };
const LAB = { cn: "Billed CN", leg: "On CN trip", idle: "Idle", unbooked: "Running, no CN", nogps: "No GPS" };
export default function Ledger({ token, boot, me, onDone }) {
  const now = new Date(Date.now() + 19800e3).toISOString().slice(0, 7);
  const [veh, setVeh] = useState(boot.fleet[0] || ""), [month, setMonth] = useState(now), [rows, setRows] = useState(null), [sum, setSum] = useState(null), [msg, setMsg] = useState(null), [ed, setEd] = useState({});
  const canNote = ["Ankleshwar branch", "Sangwari approver", "Sangwari ops", "Admin"].includes(me.role), canToll = ["Sangwari approver", "Sangwari ops", "Admin"].includes(me.role);
  const load = async () => { const r = await api("ledger", token, veh, month); if (!r.ok) return r.relogin ? onDone(r) : setMsg({ err: r.msg }); setRows(r.rows); setSum(r.summary); setEd({}); };
  useEffect(() => { load(); }, [veh, month]);
  async function note(d) { const r = await api("dayNote", token, veh, d, ed["n" + d]); setMsg(r.ok ? { ok: "Note saved." } : { err: r.msg }); load(); }
  async function toll(d) { const r = await api("dayTolls", token, veh, d, ed["t" + d]); setMsg(r.ok ? { ok: "Tolls saved." } : { err: r.msg }); load(); }
  return (<>
    <div className="card"><div className="row"><div><label>Vehicle</label><select value={veh} onChange={e => setVeh(e.target.value)}>{(boot.allVeh || boot.fleet).map(v => <option key={v}>{v}</option>)}</select></div>
      <div><label>Month</label><input type="month" value={month} onChange={e => setMonth(e.target.value)} /></div></div></div>
    {sum && <div className="card"><div className="hint" style={{ fontSize: 13, color: "var(--ink)" }}>GPS running <b>{sum.gpsKm} km</b> · Billed CN <b>{sum.billed}</b> · On CN trip <b>{sum.trip}</b> · Idle <b>{sum.idle}</b> · Running, no CN <b>{sum.unbooked}</b> · No-CN days without a note <b style={{ color: sum.noNote ? "#c8102e" : "inherit" }}>{sum.noNote}</b> · No GPS <b>{sum.noGps}</b></div></div>}
    {msg && <div className={"msg " + (msg.ok ? "ok" : "err")}>{msg.ok || msg.err}</div>}
    {!rows ? <div className="card">Loading…</div> : !rows.length ? <div className="card">No days yet for this month.</div> : rows.map(d => (
      <div className="card" key={d.date} style={{ borderLeft: `4px solid ${COL[d.status]}` }}>
        <b>{d.date.split("-").reverse().join("-")}</b> · <span style={{ color: COL[d.status], fontWeight: 700 }}>{d.label || LAB[d.status]}</span>{d.hasGps && ` · ${d.km} km`}
        {d.idle && <span className="pill" style={{ marginLeft: 6 }}>{d.idle}</span>}
        {d.cns.length > 0 && <div className="hint">Own CN: {d.cns.map(c => `${c.cn} ${c.route}`).join(" · ")}</div>}
        {d.market > 0 && <div className="hint" style={{ color: "#8a6100" }}>Market hires that day (belt lane): {d.market}</div>}
        {d.advs.length > 0 && <div className="hint">Advances: {d.advs.map(a => `${a.type} ₹${a.amount} (${a.status})`).join(" · ")}</div>}
        {(d.halts || d.places) && <div className="hint">{[d.halts, d.places].filter(Boolean).join(" · ").replace(/\n/g, " · ")}</div>}
        {d.note && <div className="flags">Note: {d.note}{d.noteBy ? ` — ${d.noteBy}` : ""}</div>}
        {canNote && d.hasGps && <div className="row" style={{ marginTop: 6 }}><div style={{ flex: 3 }}><input placeholder="Day note" value={ed["n" + d.date] ?? ""} onChange={e => setEd({ ...ed, ["n" + d.date]: e.target.value })} /></div><div><button className="btn" onClick={() => note(d.date)}>Save</button></div></div>}
        {canToll && d.hasGps && <div className="row" style={{ marginTop: 6 }}><div style={{ flex: 3 }}><input type="number" placeholder={`Tolls ₹ ${d.tollAmt || ""}`} value={ed["t" + d.date] ?? ""} onChange={e => setEd({ ...ed, ["t" + d.date]: e.target.value })} /></div><div><button className="btn" onClick={() => toll(d.date)}>Save</button></div></div>}
      </div>))}
  </>);
}
