require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use("/api/", rateLimit({ windowMs: 15 * 60 * 1000, limit: 120 }));
app.use(express.static(path.join(__dirname, "..", "public")));

async function initDb() {
  if (!process.env.DATABASE_URL) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user',
      demo_balance NUMERIC(14,2) NOT NULL DEFAULT 10000,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS payment_events (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id),
      provider TEXT NOT NULL, amount NUMERIC(14,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD', status TEXT NOT NULL DEFAULT 'pending',
      provider_reference TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGSERIAL PRIMARY KEY, actor_user_id BIGINT, action TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  try {
    if (!h.startsWith("Bearer ") || !process.env.JWT_SECRET) throw new Error();
    req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET); next();
  } catch { res.status(401).json({ error: "Please sign in again." }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  next();
}
function ready(req, res, next) {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET)
    return res.status(503).json({ error: "Configure DATABASE_URL and JWT_SECRET in Render." });
  next();
}
app.get("/api/health", (_req, res) => res.json({
  ok: true, service: "tradewise-inspired", paymentsEnabled: process.env.PAYMENTS_ENABLED === "true"
}));
app.post("/api/auth/register", ready, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))
      return res.status(400).json({ error: "Enter a valid email." });
    if (password.length < 10)
      return res.status(400).json({ error: "Password must contain at least 10 characters." });
    const hash = await bcrypt.hash(password, 12);
    const role = email === String(process.env.ADMIN_EMAIL || "").trim().toLowerCase() ? "admin" : "user";
    const r = await pool.query(
      "INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3) RETURNING id,email,role,demo_balance",
      [email, hash, role]
    );
    const user = r.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "12h" });
    await pool.query("INSERT INTO audit_log(actor_user_id,action,details) VALUES($1,'register',$2)", [user.id, {email}]);
    res.status(201).json({ token, user });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Email already registered." });
    console.error(e); res.status(500).json({ error: "Could not register." });
  }
});
app.post("/api/auth/login", ready, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const r = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    const u = r.rows[0];
    if (!u || !(await bcrypt.compare(String(req.body.password || ""), u.password_hash)))
      return res.status(401).json({ error: "Email or password is incorrect." });
    const token = jwt.sign({ id:u.id, email:u.email, role:u.role }, process.env.JWT_SECRET, {expiresIn:"12h"});
    await pool.query("INSERT INTO audit_log(actor_user_id,action,details) VALUES($1,'login',$2)", [u.id, {email}]);
    res.json({ token, user:{id:u.id,email:u.email,role:u.role,demo_balance:u.demo_balance} });
  } catch (e) { console.error(e); res.status(500).json({error:"Could not log in."}); }
});
app.get("/api/me", ready, auth, async (req,res) => {
  const r = await pool.query("SELECT id,email,role,demo_balance,created_at FROM users WHERE id=$1", [req.user.id]);
  if (!r.rowCount) return res.status(404).json({error:"Account not found."});
  res.json({user:r.rows[0]});
});
app.post("/api/demo/reset", ready, auth, async (req,res) => {
  await pool.query("UPDATE users SET demo_balance=10000 WHERE id=$1", [req.user.id]);
  await pool.query("INSERT INTO audit_log(actor_user_id,action,details) VALUES($1,'demo_reset','{}'::jsonb)", [req.user.id]);
  res.json({demo_balance:10000, message:"Demo balance reset. This is not real money."});
});
app.post("/api/payments/intent", ready, auth, async (req,res) => {
  if (process.env.PAYMENTS_ENABLED !== "true")
    return res.status(503).json({error:"Payments are disabled pending provider approval, legal review and secure webhook verification."});
  const provider = String(req.body.provider || "");
  const amount = Number(req.body.amount);
  const currency = String(req.body.currency || "USD").toUpperCase();
  if (!["mpesa","stripe"].includes(provider)) return res.status(400).json({error:"Unsupported provider."});
  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) return res.status(400).json({error:"Amount must be 1–10,000."});
  if (!["USD","KES"].includes(currency)) return res.status(400).json({error:"Currency must be USD or KES."});
  const r = await pool.query(
    "INSERT INTO payment_events(user_id,provider,amount,currency,status) VALUES($1,$2,$3,$4,'pending') RETURNING id,provider,amount,currency,status,created_at",
    [req.user.id,provider,amount,currency]);
  res.status(202).json({payment:r.rows[0],message:"Pending record only. No money was collected and no balance was credited."});
});
app.get("/api/payments/history", ready, auth, async (req,res) => {
  const r = await pool.query("SELECT id,provider,amount,currency,status,provider_reference,created_at FROM payment_events WHERE user_id=$1 ORDER BY id DESC LIMIT 50",[req.user.id]);
  res.json({payments:r.rows});
});
app.get("/api/admin/summary", ready, auth, adminOnly, async (_req,res) => {
  const [u,p,a] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS total_users FROM users"),
    pool.query("SELECT status,COUNT(*)::int AS count FROM payment_events GROUP BY status"),
    pool.query("SELECT id,actor_user_id,action,details,created_at FROM audit_log ORDER BY id DESC LIMIT 50")
  ]);
  res.json({totalUsers:u.rows[0].total_users,payments:p.rows,audit:a.rows});
});
app.post("/api/payments/mpesa/callback", (_req,res) =>
  res.status(501).json({ResultCode:1,ResultDesc:"Callback verification is not implemented; no account balance was changed."}));
app.get("*", (req,res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({error:"API route not found."});
  res.sendFile(path.join(__dirname,"..","public","index.html"));
});
initDb().then(() => app.listen(PORT, () => console.log(`TradeWise demo listening on ${PORT}`)))
  .catch(e => { console.error("Database initialization failed",e); process.exit(1); });
