import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const LEADS_FILE = join(DATA_DIR, 'leads.jsonl');

/** Is lead-gen gating switched on? */
export function leadgenOn() {
  return /^(1|on|true|yes)$/i.test(process.env.LEADGEN_MODE || '');
}

/* ── Short-lived cache of full reports, keyed by an opaque token ────── */
const cache = new Map(); // token -> { report, expires }
const TTL_MS = 30 * 60 * 1000;

export function stashReport(report) {
  const token = randomBytes(12).toString('hex');
  cache.set(token, { report, expires: Date.now() + TTL_MS });
  sweep();
  return token;
}

export function claimReport(token) {
  const hit = cache.get(token);
  if (!hit || hit.expires < Date.now()) return null;
  return hit.report;
}

function sweep() {
  const now = Date.now();
  for (const [k, v] of cache) if (v.expires < now) cache.delete(k);
}

/** Build the un-gated "teaser" a visitor sees before giving their email. */
export function teaser(report) {
  const weakest = [...report.categories].sort((a, b) => a.score - b.score)[0];
  return {
    gated: true,
    meta: report.meta,
    overall: report.overall,
    teaserCategory: weakest
      ? { label: weakest.label, grade: weakest.grade, score: weakest.score, band: weakest.band, findings: weakest.findings.slice(0, 3) }
      : null,
    lockedCount: {
      dimensions: report.categories.length,
      actions: report.actionPlan.length,
      quickWins: report.quickWins.length,
    },
    snapshot: { title: report.snapshot.title, headline: report.snapshot.headline },
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Persist a captured lead as one JSON line. Returns { ok } or throws on bad email. */
export function saveLead({ email, name, company, url, host, score, grade, ip, userAgent }) {
  if (!email || !EMAIL_RE.test(email)) {
    const e = new Error('Please enter a valid email address.');
    e.code = 'BAD_EMAIL';
    throw e;
  }
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const record = {
    at: new Date().toISOString(),
    email: String(email).trim().toLowerCase(),
    name: (name || '').toString().trim().slice(0, 120),
    company: (company || '').toString().trim().slice(0, 160),
    url: url || '',
    host: host || '',
    score: score ?? null,
    grade: grade ?? null,
    ip: ip || '',
    userAgent: (userAgent || '').toString().slice(0, 300),
  };
  appendFileSync(LEADS_FILE, JSON.stringify(record) + '\n');
  return { ok: true, record };
}

/** Read all captured leads (for a simple admin view). */
export function allLeads() {
  if (!existsSync(LEADS_FILE)) return [];
  return readFileSync(LEADS_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}
