import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const LEADS_FILE = join(DATA_DIR, 'leads.json');

/** Is lead-gen gating switched on? */
export function leadgenOn() {
  return /^(1|on|true|yes)$/i.test(process.env.LEADGEN_MODE || '');
}

/* ── Short-lived cache of full reports, keyed by an opaque token ────── */
const cache = new Map(); // token -> { report, expires, unlocked, leadId }
const TTL_MS = 30 * 60 * 1000; // teaser token lifetime before capture
const UNLOCK_TTL_MS = 24 * 60 * 60 * 1000; // keep alive after email capture

export function stashReport(report) {
  const token = randomBytes(12).toString('hex');
  cache.set(token, { report, expires: Date.now() + TTL_MS, unlocked: false, leadId: null });
  for (const [k, v] of cache) if (v.expires < Date.now()) cache.delete(k);
  return token;
}
function entryFor(token) {
  const hit = token ? cache.get(token) : null;
  if (!hit || hit.expires < Date.now()) return null;
  return hit;
}
export function claimReport(token) {
  return entryFor(token)?.report || null;
}
/** Has this token already produced a lead? (idempotent /api/lead) */
export function isClaimed(token) {
  return !!entryFor(token)?.leadId;
}
/** Mark a token as unlocked (email captured) and record its lead id. */
export function unlockToken(token, leadId) {
  const e = entryFor(token);
  if (!e) return;
  e.unlocked = true;
  e.expires = Date.now() + UNLOCK_TTL_MS; // extend so a returning lead can re-download
  if (leadId) e.leadId = leadId;
}
/** Is this token unlocked — i.e. has the visitor given their email? */
export function isUnlocked(token) {
  return !!entryFor(token)?.unlocked;
}
/** The host an unlocked token was issued for (null if not unlocked/expired). */
export function unlockedHost(token) {
  const e = entryFor(token);
  return e && e.unlocked ? (e.report?.meta?.host || null) : null;
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

/* ── Lead store (updatable JSON array) ──────────────────────────────── */
function readAll() {
  if (!existsSync(LEADS_FILE)) return [];
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(LEADS_FILE, 'utf8'));
  } catch {
    parsed = null;
  }
  if (Array.isArray(parsed)) return parsed;
  // Corrupt or unexpected shape — preserve it (don't let the next save clobber
  // every existing lead) by moving it aside, then start clean.
  try {
    renameSync(LEADS_FILE, LEADS_FILE.replace(/\.json$/, `.corrupt-${Date.now()}.json`));
  } catch {
    /* best effort */
  }
  return [];
}
function writeAll(list) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = LEADS_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(list, null, 2));
  renameSync(tmp, LEADS_FILE); // atomic-ish replace
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Persist a captured lead, enriched with prospecting signals pulled from the
 * report (overall score, ease-of-win, single-page flag, mobile-broken flag,
 * the fastest win and the top fix). Returns the stored record.
 */
export function saveLead({ email, name, company, report, ip, userAgent }) {
  if (!email || !EMAIL_RE.test(email)) {
    const e = new Error('Please enter a valid email address.');
    e.code = 'BAD_EMAIL';
    throw e;
  }
  const p = report.prospect || {};
  const record = {
    id: randomBytes(8).toString('hex'),
    at: new Date().toISOString(),
    email: String(email).trim().toLowerCase(),
    name: (name || '').toString().trim().slice(0, 120),
    company: (company || '').toString().trim().slice(0, 160),
    url: report.meta.url,
    host: report.meta.host,
    score: report.overall.score,
    grade: report.overall.grade,
    // Prospecting signals
    easeScore: p.easeScore ?? null,
    isSinglePage: !!p.isSinglePage,
    pages: p.pages ?? null,
    mobileBroken: !!p.mobileBroken,
    mobileSuboptimal: !!p.mobileSuboptimal,
    mobileVerdict: p.mobileVerdict || null,
    fastWin: p.fastWin || null,
    topFix: report.actionPlan?.[0]?.text || null,
    weakest: [...report.categories].sort((a, b) => a.score - b.score)[0]?.label || null,
    // CRM state
    contacted: false,
    contactedAt: null,
    ip: ip || '',
    userAgent: (userAgent || '').toString().slice(0, 300),
  };
  const list = readAll();
  list.push(record);
  writeAll(list);
  return record;
}

/** Toggle / set the contacted state of a lead. Returns the updated record or null. */
export function setContacted(id, contacted) {
  const list = readAll();
  const lead = list.find((l) => l.id === id);
  if (!lead) return null;
  lead.contacted = !!contacted;
  lead.contactedAt = lead.contacted ? new Date().toISOString() : null;
  writeAll(list);
  return lead;
}

/**
 * List leads with a sort mode:
 *   recent    — newest first
 *   score     — lowest overall score first (default: biggest problems on top)
 *   uncontacted — only not-yet-contacted, lowest score first
 *   ease      — easiest/fastest win first (highest easeScore)
 */
export function listLeads(sort = 'score') {
  let list = readAll();
  const byScoreAsc = (a, b) => (a.score ?? 999) - (b.score ?? 999);

  switch (sort) {
    case 'recent':
      list.sort((a, b) => (a.at < b.at ? 1 : -1));
      break;
    case 'uncontacted':
      list = list.filter((l) => !l.contacted).sort(byScoreAsc);
      break;
    case 'ease':
      list.sort((a, b) => (b.easeScore ?? -1) - (a.easeScore ?? -1) || byScoreAsc(a, b));
      break;
    case 'score':
    default:
      list.sort(byScoreAsc);
  }

  const all = readAll();
  return {
    sort,
    total: all.length,
    contacted: all.filter((l) => l.contacted).length,
    uncontacted: all.filter((l) => !l.contacted).length,
    leads: list,
  };
}
