import React, { useEffect, useState } from "react";
import { api } from "./api.js";
export default function Mine({ token, onDone }) {
  const [rows, setRows] = useState(null), [ed, setEd] = useState(null), [msg, setMsg] = useState(null);
  const load = async () => { const r = await api("mine", token); if (!r.ok) return r.relogin ? onDone(r) : setMsg({ err: r.msg }); setRows(r.rows); };
  useEffect(() => { load(); }, []);
  async function save() {
    const r = await api("edit", token, ed.id, { amount: ed.amount, litres: ed.litres, odo: ed.odo, mode: ed.mode, from: ed.from, to: ed.to, cn: ed.cn, purpose: ed.purpose });
    if (!r.ok) return setMsg({ err: r.msg }); setMsg({ ok: `${ed.id} updated.` + (r.level !== "OK" ? `\nFlag (${r.level}):\n${r.flags}` : "") }); setEd(null); load(); onDone(r);
  }
  if (!rows) return <div className="card">Loading…</div>;
  const E = (k, label, t = "text") => <div><label>{label}</label><input type={t} value={ed[k] ?? ""} onChange={e => setEd({ ...ed, [k]: e.target.value })} /></div>;
  return (<>
    {msg && <div className={"msg " + (msg.ok ? "ok" : "err")}>{msg.ok || msg.err}</div>}
    {!rows.length && <div className="card">You have not raised any request yet.</div>}
    {rows.map(a => <div className="card" key={a.id}>
      <b>{a.id}</b> · {a.veh} · {a.type} · ₹{a.amount} <span className="pill">{a.status}</span> {a.level && <span className={"pill " + a.level}>{a.level}</span>}
      <div className="hint">{a.date}{a.note ? " · note: " + a.note : ""}</div>
      {a.level !== "OK" && a.flags && <div className="flags" style={{ color: "#7a2e0e" }}>{a.flags}</div>}
      <div className="hint" style={{ whiteSpace: "pre-line" }}>{a.trail}</div>
      {a.status === "Raised" && (ed?.id === a.id ? <div>
        <div className="row">{E("amount", "Amount ₹", "number")}{["Diesel", "CNG"].includes(a.type) && E("litres", a.type === "CNG" ? "CNG kg" : "Litres", "number")}</div>
        {["Diesel", "CNG"].includes(a.type) && E("odo", "Odometer km", "number")}{E("mode", "Pump / pay by")}{E("cn", "LR / CN")}
        <div className="row">{E("from", "Work date from", "date")}{E("to", "to", "date")}</div>
        <label>Purpose</label><textarea value={ed.purpose} onChange={e => setEd({ ...ed, purpose: e.target.value })} />
        <button className="btn ok" onClick={save}>Save</button><button className="btn" onClick={() => setEd(null)}>Cancel</button></div>
        : <button className="btn" onClick={() => setEd({ ...a })}>Edit (until approved)</button>)}
    </div>)}
  </>);
}
