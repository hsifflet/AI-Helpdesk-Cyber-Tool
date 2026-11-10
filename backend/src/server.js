import bcrypt from "bcrypt";
import cors from "cors";
import crypto from "node:crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import session from "express-session";
import helmet from "helmet";
import pg from "pg";
import connectPgSimple from "connect-pg-simple";
import { runAgent, seedAgentDemo } from "./agent.js";

const { Pool } = pg;
const PgSession = connectPgSimple(session);
const app = express();
const port = Number(process.env.PORT || 4000);
const isProduction = process.env.NODE_ENV === "production";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "100kb" }));

// Store sessions in PostgreSQL instead of the default in-memory store.
app.use(session({
  store: new PgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: isProduction, sameSite: "lax", maxAge: 1000 * 60 * 60 * 8 },
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
});

const seedTickets = [
  { title: "Laptop will not connect to VPN", description: "User can sign in locally, but VPN fails after multi-factor approval.", status: "In Progress", priority: "High", category: "Network", requester: "Maya Chen", employee_number: "EMP-1042", workstation_number: "WS-018", assigned_to: "Jordan Lee", due_at: "2026-10-13T17:00:00.000Z" },
  { title: "New employee software setup", description: "Install standard productivity tools and grant access to shared drives.", status: "New", priority: "Medium", category: "Onboarding", requester: "Alex Morgan", employee_number: "EMP-1088", workstation_number: "WS-024", assigned_to: "Unassigned", due_at: "2026-10-15T17:00:00.000Z" },
  { title: "Printer queue stuck in accounting", description: "Several print jobs are paused and cannot be cancelled by users.", status: "Waiting", priority: "Low", category: "Hardware", requester: "Priya Patel", employee_number: "EMP-1021", workstation_number: "WS-011", assigned_to: "Sam Rivera", due_at: "2026-10-14T17:00:00.000Z" },
  { title: "Payroll application access denied", description: "Manager receives an authorization error after the latest role update.", status: "Critical", priority: "Critical", category: "Access", requester: "Chris Walker", employee_number: "EMP-1007", workstation_number: "WS-003", assigned_to: "Jordan Lee", due_at: "2026-10-12T23:00:00.000Z" },
  { title: "Replace damaged docking station", description: "USB-C dock intermittently disconnects monitors and keyboard.", status: "Resolved", priority: "Medium", category: "Hardware", requester: "Elena Brooks", employee_number: "EMP-1064", workstation_number: "WS-029", assigned_to: "Sam Rivera", due_at: "2026-10-11T17:00:00.000Z" },
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /^[A-Za-z0-9!@#$%^&*]+$/;
const MAX_EMAIL_LENGTH = 20;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 12;
const publicUser = (row) => ({ id: row.id, email: row.email, role: row.role });

function mapTicket(row) {
  return { id: row.id, ticketNumber: `IT-${String(row.id).padStart(4, "0")}`, title: row.title, description: row.description, status: row.status, priority: row.priority, category: row.category, requester: row.requester, employeeNumber: row.employee_number, workstationNumber: row.workstation_number, assignedTo: row.assigned_to, dueAt: row.due_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapComment(row) {
  return { id: row.id, ticketId: row.ticket_id, author: row.author, body: row.body, createdAt: row.created_at };
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL,
      priority TEXT NOT NULL, category TEXT NOT NULL, requester TEXT NOT NULL,
      employee_number TEXT, workstation_number TEXT, assigned_to TEXT NOT NULL,
      due_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ticket_comments (
      id SERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      author TEXT NOT NULL, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS employee_number TEXT");
  await pool.query("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS workstation_number TEXT");
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM tickets");
  if (rows[0].count === 0) for (const ticket of seedTickets) await pool.query(`INSERT INTO tickets (title, description, status, priority, category, requester, employee_number, workstation_number, assigned_to, due_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [ticket.title, ticket.description, ticket.status, ticket.priority, ticket.category, ticket.requester, ticket.employee_number, ticket.workstation_number, ticket.assigned_to, ticket.due_at]);
  await seedAgentDemo(pool);
}

// CSRF protection uses a token stored in the session and echoed in a custom header.
function getCsrfToken(request) {
  if (!request.session.csrfToken) request.session.csrfToken = crypto.randomBytes(32).toString("hex");
  return request.session.csrfToken;
}

function requireCsrf(request, response, next) {
  const supplied = request.get("X-CSRF-Token");
  const expected = request.session.csrfToken;
  if (!supplied || !expected || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return response.status(403).json({ message: "Invalid CSRF token." });
  next();
}

function requireAuth(request, response, next) {
  if (!request.session.user) return response.status(401).json({ message: "Please sign in to continue." });
  request.user = request.session.user;
  next();
}

function validateCredentials(request, response) {
  const email = String(request.body.email || "").trim().toLowerCase();
  const password = String(request.body.password || "");
  if (email.length > MAX_EMAIL_LENGTH) { response.status(400).json({ message: "Email must be 20 characters or fewer." }); return null; }
  if (!emailPattern.test(email)) { response.status(400).json({ message: "Enter a valid email address." }); return null; }
  if (!password) { response.status(400).json({ message: "Password is required." }); return null; }
  if (password.length > MAX_PASSWORD_LENGTH) { response.status(400).json({ message: "Password must be 12 characters or fewer." }); return null; }
  if (!passwordPattern.test(password)) { response.status(400).json({ message: "Password may only use letters, numbers, and ! @ # $ % ^ & *." }); return null; }
  return { email, password };
}

function validateNewPassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH) return "Password must be at least 8 characters.";
  if (password.length > MAX_PASSWORD_LENGTH) return "Password must be 12 characters or fewer.";
  if (!passwordPattern.test(password)) return "Password may only use letters, numbers, and ! @ # $ % ^ & *.";
  return null;
}

app.get("/health", (_request, response) => response.json({ ok: true }));
app.get("/api", (_request, response) => response.json({ name: "Capstone IT Ticketing API", endpoints: ["/login", "/api/auth", "/api/tickets", "/api/metrics"] }));

// The React app is the login page; this endpoint provides its session-bound CSRF token.
app.get("/login", (request, response) => response.json({ message: "Use the React login page at http://localhost:5173.", csrfToken: getCsrfToken(request) }));
app.get("/api/auth/csrf", (request, response) => response.json({ csrfToken: getCsrfToken(request) }));

async function loginHandler(request, response, next) {
  try {
    const credentials = validateCredentials(request, response);
    if (!credentials) return;
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [credentials.email]);
    const valid = rows[0] && await bcrypt.compare(credentials.password, rows[0].password_hash);
    if (!valid) return response.status(401).json({ message: "Email or password is incorrect." });
    request.session.user = publicUser(rows[0]);
    response.json({ user: request.session.user });
  } catch (error) { next(error); }
}

// Rate limiting reduces password-guessing attempts against both login entry points.
app.post("/login", loginLimiter, requireCsrf, loginHandler);
app.post("/api/auth/signin", loginLimiter, requireCsrf, loginHandler);

app.post("/api/auth/signup", loginLimiter, requireCsrf, async (request, response, next) => {
  try {
    const credentials = validateCredentials(request, response);
    if (!credentials) return;
    const passwordError = validateNewPassword(credentials.password);
    if (passwordError) return response.status(400).json({ message: passwordError });
    const passwordHash = await bcrypt.hash(credentials.password, 12);
    const { rows } = await pool.query("INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role", [credentials.email, passwordHash]);
    response.status(201).json({ user: publicUser(rows[0]) });
  } catch (error) { if (error.code === "23505") return response.status(409).json({ message: "An account with that email already exists." }); next(error); }
});

app.post("/api/auth/forgot", loginLimiter, requireCsrf, async (request, response, next) => {
  try {
    const email = String(request.body.email || "").trim().toLowerCase();
    const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (!rows[0]) return response.json({ message: "If an account exists, a reset code is ready." });
    const resetToken = crypto.randomBytes(20).toString("hex");
    request.session.reset = { userId: rows[0].id, resetToken, expiresAt: Date.now() + 15 * 60 * 1000 };
    // A real deployment should email this token; returning it is limited to local development.
    response.json({ message: "Reset code created. Use it below for this local demo.", ...(isProduction ? {} : { resetToken }) });
  } catch (error) { next(error); }
});

app.post("/api/auth/reset", requireCsrf, async (request, response, next) => {
  try {
    const password = String(request.body.password || ""); const reset = request.session.reset;
    if (!reset || reset.resetToken !== String(request.body.resetToken || "") || reset.expiresAt < Date.now()) return response.status(400).json({ message: "That reset code is invalid or expired." });
    const passwordError = validateNewPassword(password);
    if (passwordError) return response.status(400).json({ message: passwordError });
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(password, 12), reset.userId]);
    delete request.session.reset;
    response.json({ message: "Password updated. You can sign in now." });
  } catch (error) { next(error); }
});

app.get("/api/auth/me", requireAuth, (request, response) => response.json({ user: request.user }));
app.post("/api/auth/signout", requireAuth, requireCsrf, (request, response, next) => request.session.destroy((error) => { if (error) return next(error); response.clearCookie("connect.sid"); response.json({ ok: true }); }));

app.get("/api/tickets", requireAuth, async (_request, response, next) => { try { const { rows } = await pool.query("SELECT * FROM tickets ORDER BY updated_at DESC, id DESC"); response.json(rows.map(mapTicket)); } catch (error) { next(error); } });
app.post("/api/tickets", requireAuth, requireCsrf, async (request, response, next) => {
  try {
    const { title, description, priority = "Medium", category = "General", requester = "Self Service User", employeeNumber = "", workstationNumber = "" } = request.body;
    if (!title || !description || !employeeNumber || !workstationNumber) return response.status(400).json({ message: "Title, description, employee number, and workstation number are required." });
    const { rows } = await pool.query(`INSERT INTO tickets (title, description, status, priority, category, requester, employee_number, workstation_number, assigned_to, due_at) VALUES ($1,$2,'New',$3,$4,$5,$6,$7,'Unassigned',NOW()+INTERVAL '2 days') RETURNING *`, [title, description, priority, category, requester, employeeNumber, workstationNumber]);
    response.status(201).json(mapTicket(rows[0]));
  } catch (error) { next(error); }
});
app.patch("/api/tickets/:id", requireAuth, requireCsrf, async (request, response, next) => {
  try {
    const fields = []; const values = [];
    for (const key of ["status", "priority", "assignedTo"]) if (request.body[key] !== undefined) { fields.push(`${key === "assignedTo" ? "assigned_to" : key} = $${values.length + 1}`); values.push(request.body[key]); }
    if (!fields.length) return response.status(400).json({ message: "No changes supplied." });
    values.push(request.params.id); const { rows } = await pool.query(`UPDATE tickets SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values);
    if (!rows[0]) return response.status(404).json({ message: "Ticket not found." }); response.json(mapTicket(rows[0]));
  } catch (error) { next(error); }
});
app.get("/api/tickets/:id/comments", requireAuth, async (request, response, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM ticket_comments WHERE ticket_id = $1 ORDER BY created_at ASC, id ASC", [request.params.id]);
    response.json(rows.map(mapComment));
  } catch (error) { next(error); }
});
app.post("/api/tickets/:id/comments", requireAuth, requireCsrf, async (request, response, next) => {
  try {
    const body = String(request.body.body || "").trim();
    if (!body) return response.status(400).json({ message: "Comment text is required." });
    if (body.length > 2000) return response.status(400).json({ message: "Comments must be 2,000 characters or fewer." });
    const ticket = await pool.query("SELECT id FROM tickets WHERE id = $1", [request.params.id]);
    if (!ticket.rows[0]) return response.status(404).json({ message: "Ticket not found." });
    const { rows } = await pool.query("INSERT INTO ticket_comments (ticket_id, author, body) VALUES ($1, $2, $3) RETURNING *", [request.params.id, request.user.email, body]);
    response.status(201).json(mapComment(rows[0]));
  } catch (error) { next(error); }
});
const agentLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
app.post("/api/tickets/:id/agent", requireAuth, requireCsrf, agentLimiter, async (request, response, next) => {
  try {
    const result = await runAgent(pool, Number(request.params.id));
    if (!result) return response.status(404).json({ message: "Ticket not found." });
    response.json(result);
  } catch (error) { console.error(error); response.status(502).json({ message: "The agent could not answer." }); }
});
app.get("/api/metrics", requireAuth, async (_request, response, next) => { try { const { rows } = await pool.query("SELECT status, priority, assigned_to FROM tickets"); response.json({ total: rows.length, open: rows.filter((ticket) => ticket.status !== "Resolved").length, urgent: rows.filter((ticket) => ticket.priority === "Critical").length, assigned: rows.filter((ticket) => ticket.assigned_to !== "Unassigned").length, resolved: rows.filter((ticket) => ticket.status === "Resolved").length }); } catch (error) { next(error); } });

app.use((error, _request, response, _next) => { console.error(error); response.status(500).json({ message: "Something went wrong." }); });
await initializeDatabase();
app.listen(port, () => console.log(`Ticket API listening on port ${port}`));
