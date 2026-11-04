const fs = require("fs"), path = require("path");
require("./env");
const Fastify = require("fastify");
const { db, DATA, flush } = require("./store");
const { API, sign } = require("./api");
const jobs = require("./jobs");

const app = Fastify({ bodyLimit: 60 * 1024 * 1024, logger: { level: "warn" } });
app.register(require("@fastify/cors"), { origin: true, methods: ["GET", "POST"] });
app.addContentTypeParser("text/plain", { parseAs: "string" }, (req, body, done) => { try { done(null, JSON.parse(body || "{}")); } catch (e) { done(e); } });
app.post("/api", async req => {
  const b = req.body || {}; const fn = Object.prototype.hasOwnProperty.call(API, b.fn) ? API[b.fn] : null; if (!fn) return { ok: false, msg: "Unknown call." };
  try { return await fn(...(b.args || [])); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
});
app.get("/f/*", (req, reply) => {
  const name = req.params["*"], full = path.join(DATA, "files", name);
  if (name.includes("..") || req.query.s !== sign(name) || !fs.existsSync(full)) return reply.code(404).send("Not found");
  return reply.type(name.endsWith(".pdf") ? "application/pdf" : "image/jpeg").header("Cache-Control", "private, max-age=86400").send(fs.createReadStream(full));
});
app.get("/health", () => ({ ok: true, requests: db.adv.length, people: db.people.length, fleet: db.fleet.length, idleWaiting: db.idle.filter(r => r.state === "Waiting for branch").length, lastMorning: db.meta.lastMorning || null }));
const PUB = path.join(__dirname, "../public");
if (fs.existsSync(PUB)) app.register(require("@fastify/static"), { root: PUB });
jobs.start();
app.listen({ port: +process.env.PORT || 8080, host: "0.0.0.0" });
