// loads ./.env (next to package.json) once, before anything reads process.env
const fs = require("fs"), path = require("path");
try { fs.readFileSync(path.join(__dirname, "../.env"), "utf8").split(/\r?\n/).forEach(l => { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !l.trim().startsWith("#") && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }); } catch (e) {}
