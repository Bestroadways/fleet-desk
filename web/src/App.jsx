import React, { useEffect, useState } from "react";
import { api, device } from "./api.js";
import NewRequest from "./NewRequest.jsx";
import Bill from "./Bill.jsx";
import Approvals from "./Approvals.jsx";
import Idle from "./Idle.jsx";
import Mine from "./Mine.jsx";
import Ledger from "./Ledger.jsx";
import Settlement from "./Settlement.jsx";
import Admin from "./Admin.jsx";
import Market from "./Market.jsx";

const idleKey = new URLSearchParams(location.search).get("idle") || "";
const STAFF = ["Sangwari approver", "Sangwari ops", "Internal Audit", "Admin"];

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("fd_tok") || ""); const [cfg, setCfg] = useState(null); const [boot, setBoot] = useState(null);
  const [tab, setTab] = useState("new"); const [m, setM] = useState({ mobile: "", pin: "" }); const [err, setErr] = useState("");
  const [lock, setLock] = useState(null); // null | { step: "ask" } | { step: "code", to } 
  const [code, setCode] = useState(""); const [info, setInfo] = useState("");
  const loadBoot = async t => { const r = await api("boot", t, idleKey); if (r.ok) setBoot(r); else { localStorage.removeItem("fd_tok"); setToken(""); setBoot(null); } };
  useEffect(() => { api("cfg").then(setCfg); }, []);
  useEffect(() => { if (token) loadBoot(token); }, [token]);
  const refresh = r => { if (r && r.relogin) { localStorage.removeItem("fd_tok"); setToken(""); setBoot(null); } else loadBoot(token); };
  async function login() {
    setErr(""); setInfo(""); setLock(null); const r = await api("login", m.mobile, m.pin, device());
    if (!r.ok) { if (r.locked) setLock({ step: "ask" }); return setErr(r.msg); } localStorage.setItem("fd_tok", r.token); setToken(r.token);
  }
  async function askCode() {
    setErr(""); const r = await api("requestUnlock", m.mobile, m.pin);
    if (!r.ok) return setErr(r.msg); setInfo(`A 6-digit code was sent to ${r.to}. Enter it below.`); setLock({ step: "code", to: r.to });
  }
  async function useThisPhone() {
    setErr(""); const r = await api("confirmUnlock", m.mobile, m.pin, code, device());
    if (!r.ok) return setErr(r.msg); localStorage.setItem("fd_tok", r.token); setToken(r.token); setLock(null); setCode("");
  }
  const head = <header><b>Ankleshwar Fleet Desk</b><span>Advance request · WhatsApp requests are not paid</span></header>;
  if (!cfg) return <>{head}<main>Loading…</main></>;
  if (!token || !boot) return <>{head}<main><div className="card"><b>Log in · लॉगिन</b>
    <label>Mobile number or email · मोबाइल नंबर या ईमेल</label><input type="text" autoCapitalize="none" autoComplete="username" value={m.mobile} onChange={e => setM({ ...m, mobile: e.target.value })} />
    <label>PIN</label><input type="password" inputMode="numeric" value={m.pin} onChange={e => setM({ ...m, pin: e.target.value })} onKeyDown={e => e.key === "Enter" && login()} />
    <button className="send" onClick={login}>Log in</button>{err && <div className="msg err">{err}</div>}
    {lock && lock.step === "ask" && <div className="msg" style={{ background: "#fff6e0", borderLeft: "4px solid #d39b00" }}>Using a new phone? <a href="#" onClick={e => { e.preventDefault(); askCode(); }}><b>Click here</b></a> and we will send a 6-digit code to your registered email. Enter it to use this phone instead.</div>}
    {lock && lock.step === "code" && <div className="card" style={{ marginTop: 12 }}>{info && <div className="hint" style={{ marginBottom: 6 }}>{info}</div>}
      <label>6-digit code</label><input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === "Enter" && useThisPhone()} />
      <button className="send" onClick={useThisPhone}>Use this phone</button>
      <div className="hint" style={{ marginTop: 8 }}>No mail? <a href="#" onClick={e => { e.preventDefault(); askCode(); }}>Send the code again</a> (after a minute) or call the FMS Helpdesk 95949 63357.</div></div>}
    </div></main></>;
  const me = boot.me, staff = STAFF.includes(me.role);
  return (<>{head}<main>
    <div className="hint" style={{ marginBottom: 10 }}>Signed in as {me.name} · {me.role}{me.test && " · TEST MODE — requests are marked TEST"} · <a href="#" onClick={e => { e.preventDefault(); api("logout", token); localStorage.removeItem("fd_tok"); setToken(""); setBoot(null); }}>Log out</a></div>
    {idleKey ? <Idle token={token} I={boot.idle} idleKey={idleKey} /> : <>
      <div className="tabs">
        {me.canRaise && <button className={tab === "new" ? "on" : ""} onClick={() => setTab("new")}>New request</button>}
        {me.canRaise && <button className={tab === "bill" ? "on" : ""} onClick={() => setTab("bill")}>Attach slip / bill</button>}
        {me.canRaise && <button className={tab === "mine" ? "on" : ""} onClick={() => setTab("mine")}>My requests</button>}
        {staff && <button className={tab === "appr" ? "on" : ""} onClick={() => setTab("appr")}>Approvals</button>}
        <button className={tab === "ledger" ? "on" : ""} onClick={() => setTab("ledger")}>Day ledger</button>
        {staff && <button className={tab === "mkt" ? "on" : ""} onClick={() => setTab("mkt")}>Market hire</button>}
        {staff && <button className={tab === "stl" ? "on" : ""} onClick={() => setTab("stl")}>Settlement</button>}
        {["Sangwari approver", "Sangwari ops", "Admin"].includes(me.role) && <button className={tab === "admin" ? "on" : ""} onClick={() => setTab("admin")}>Desk</button>}
      </div>
      {me.canRaise && tab === "new" && <NewRequest token={token} boot={boot} cfg={cfg} onDone={refresh} />}
      {me.canRaise && tab === "bill" && <Bill token={token} boot={boot} onDone={refresh} />}
      {me.canRaise && tab === "mine" && <Mine token={token} onDone={refresh} />}
      {(tab === "appr" || (!me.canRaise && !["ledger", "stl", "admin", "mkt"].includes(tab))) && staff && <Approvals token={token} me={me} onDone={refresh} />}
      {tab === "ledger" && <Ledger token={token} boot={boot} me={me} onDone={refresh} />}
      {tab === "mkt" && staff && <Market token={token} boot={boot} onDone={refresh} />}
      {tab === "stl" && staff && <Settlement token={token} boot={boot} onDone={refresh} />}
      {tab === "admin" && <Admin token={token} onDone={refresh} />}
      <div className="card" style={{ marginTop: 16 }}><b>Recent requests</b>
        <table><tbody><tr><th>Date</th><th>Vehicle</th><th>Type</th><th>₹</th><th>Status</th></tr>
          {boot.recent.map(r => <tr key={r.id}><td>{r.date.slice(8)}/{r.date.slice(5, 7)}</td><td>{String(r.veh).slice(-6)}</td><td>{r.type}</td><td>{r.amt}</td><td>{r.status}{r.level && r.level !== "OK" ? " · " + r.level : ""}</td></tr>)}</tbody></table></div></>}
  </main></>);
}
