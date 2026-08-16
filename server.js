import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { analyze } from './src/engine/analyze.js';

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
  if (!url) return res.status(400).json({ error: 'Please provide a website URL.' });

  try {
    const report = await analyze(url);
    res.json(report);
  } catch (err) {
    res.status(422).json({ error: err.message || 'Evaluation failed.' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
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
