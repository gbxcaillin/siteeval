import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { analyze } from './src/engine/analyze.js';
import { compare } from './src/engine/compare.js';
import { renderReportHTML } from './src/report/printTemplate.js';
import { renderPDF } from './src/report/pdf.js';
import { leadgenOn, stashReport, claimReport, teaser, saveLead, listLeads, setContacted, isClaimed, unlockToken, unlockedHost } from './src/leads.js';
import { normaliseUrl } from './src/engine/fetchSite.js';

/** Host of a requested URL, or null if it won't parse. */
function reqHost(url) {
  try { return normaliseUrl(url).host.toLowerCase(); } catch { return null; }
}
import { renderLeadsPage } from './src/report/leadsPage.js';

// Load .env if present (tiny loader — no dependency needed).
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(join(__dirname, '.env'));

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.static(join(__dirname, 'public')));

// Simple in-memory rate limit to keep the demo honest.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const win = 60_000;
  const arr = (hits.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 12;
}

app.post('/api/evaluate', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests — please wait a minute.' });
  }
  const url = (req.body && req.body.url) || '';
  const crawl = !!(req.body && req.body.crawl);
  if (!url) return res.status(400).json({ error: 'Please provide a website URL.' });

  try {
    const report = await analyze(url, { crawl });
    if (leadgenOn()) {
      // Withhold the full report; hand back a teaser + a token to redeem after email capture.
      const token = stashReport(report);
      return res.json({ ...teaser(report), token });
    }
    res.json(report);
  } catch (err) {
    res.status(422).json({ error: err.message || 'Evaluation failed.' });
  }
});

// Capture a lead and release the full report held against the token.
app.post('/api/lead', async (req, res) => {
  const { token, email, name, company } = req.body || {};
  const report = token ? claimReport(token) : null;
  if (!report) {
    return res.status(410).json({ error: 'This report link has expired — please run the evaluation again.' });
  }
  try {
    // Idempotent: a resubmitted/replayed token unlocks without a duplicate row.
    if (!isClaimed(token)) {
      const rec = saveLead({
        email, name, company, report,
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
      });
      unlockToken(token, rec.id);
    } else {
      unlockToken(token);
    }
    res.json(report);
  } catch (err) {
    const status = err.code === 'BAD_EMAIL' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Could not save your details.' });
  }
});

// ── Leads (internal) ──
app.get('/leads', (_req, res) => {
  res.type('html').send(renderLeadsPage());
});
app.get('/api/leads', (req, res) => {
  const sort = ['recent', 'score', 'uncontacted', 'ease'].includes(req.query.sort) ? req.query.sort : 'score';
  res.json(listLeads(sort));
});
app.post('/api/leads/:id/contacted', (req, res) => {
  const updated = setContacted(req.params.id, req.body?.contacted !== false);
  if (!updated) return res.status(404).json({ error: 'Lead not found.' });
  res.json(updated);
});

app.post('/api/compare', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests — please wait a minute.' });
  }
  const urls = (req.body && req.body.urls) || [];
  if (!Array.isArray(urls) || urls.length < 2) {
    return res.status(400).json({ error: 'Provide at least two website URLs to compare.' });
  }
  try {
    const result = await compare(urls.slice(0, 4), { preview: false });
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: err.message || 'Comparison failed.' });
  }
});

// Branded, print-optimised HTML report — open and "Save as PDF" from any browser.
app.get('/report', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing ?url=');
  if (leadgenOn()) {
    const host = unlockedHost(req.query.token);
    if (!host || host !== reqHost(url)) {
      return res.status(403).send('This report is locked. Please unlock it via the evaluator first.');
    }
  }
  try {
    const report = await analyze(url, { crawl: req.query.crawl === '1' });
    res.type('html').send(renderReportHTML(report));
  } catch (err) {
    res.status(422).send(`Could not generate report: ${err.message}`);
  }
});

// One-click server-side PDF (uses playwright-core if a browser is available).
app.post('/api/report.pdf', async (req, res) => {
  const url = (req.body && req.body.url) || '';
  if (!url) return res.status(400).json({ error: 'Please provide a website URL.' });
  if (leadgenOn()) {
    const host = unlockedHost(req.body && req.body.token);
    if (!host || host !== reqHost(url)) {
      return res.status(403).json({ error: 'This report is locked. Please unlock it via the evaluator first.' });
    }
  }
  try {
    const report = await analyze(url, { crawl: !!(req.body && req.body.crawl) });
    const html = renderReportHTML(report);
    const pdf = await renderPDF(html);
    if (!pdf) {
      // Graceful fallback — tell the client to use the print view instead.
      return res.status(501).json({
        error: 'Server-side PDF is not available in this environment.',
        fallback: `/report?url=${encodeURIComponent(url)}${req.body.crawl ? '&crawl=1' : ''}`,
      });
    }
    const name = (report.meta.host || 'report').replace(/[^a-z0-9.-]/gi, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="GBX-SiteEval-${name}.pdf"`);
    res.send(pdf);
  } catch (err) {
    res.status(422).json({ error: err.message || 'PDF generation failed.' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    leadgen: leadgenOn(),
    adapters: {
      claude: !!process.env.ANTHROPIC_API_KEY,
      pageSpeed: !!process.env.PAGESPEED_API_KEY,
      search: !!(process.env.SEARCH_PROVIDER && process.env.SEARCH_API_KEY),
    },
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  GBX SiteEval running →  http://localhost:${PORT}\n`);
});

/** Minimal .env parser so `npm start` works with zero extra deps. */
function loadEnv(path) {
  if (!existsSync(path)) return;
  const body = readFileSync(path, 'utf8');
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined && val !== '') process.env[key] = val;
  }
}
