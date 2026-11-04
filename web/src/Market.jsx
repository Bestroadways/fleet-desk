import React, { useEffect, useState } from "react";
import { api } from "./api.js";
const inr = n => "₹" + Math.round(n || 0).toLocaleString("en-IN");
export default function Market({ token, boot, onDone }) {
  const now = new Date(Date.now() + 19800e3).toISOString().slice(0, 7);
  const [veh, setVeh] = useState(boot.fleet[0] || ""), [month, setMonth] = useState(now), [d, setD] = useState(null), [msg, setMsg] = useState(null);
  useEffect(() => { api("market", token, veh, month).then(r => { if (!r.ok) return r.relogin ? onDone(r) : setMsg({ err: r.msg }); setMsg(null); setD(r); }); }, [veh, month]);
  return (<>
    <div className="card"><div className="row"><div><label>Vehicle</label><select value={veh} onChange={e => setVeh(e.target.value)}>{(boot.allVeh || boot.fleet).map(v => <option key={v}>{v}</option>)}</select></div>
      <div><label>Month</label><input type="month" value={month} onChange={e => setMonth(e.target.value)} /></div></div>
      <div className="hint">Belt-lane loads booked on market vehicles on days our truck was idle or running without a CN{d ? ` (up to ${d.maxKm} km, up to ${d.maxWt} T)` : ""}.</div></div>
    {msg && <div className="msg err">{msg.err}</div>}
    {d && <>
      <div className="card"><table><tbody><tr><td>Days truck free and market hired</td><td>{d.days}</td></tr><tr><td>Hire paid on those loads</td><td>{inr(d.hire)}</td></tr><tr><td>Loads listed</td><td>{d.loads}</td></tr></tbody></table></div>
      {!d.rows.length && <div className="card">No belt-lane market hires on this truck's free days this month.</div>}
      {d.rows.map((r, i) => <div className="card" key={i}><b>{r.date.split("-").reverse().join("-")}</b> · CN {r.cn} · {r.route}
        <div className="hint">{r.km} km · {r.wt} T · market vehicle {r.veh} · {r.party}</div>
        <div className="hint">Freight {inr(r.frt)} · Hire paid {inr(r.hire)} · Our truck that day: {r.truck}</div></div>)}</>}
  </>);
}
