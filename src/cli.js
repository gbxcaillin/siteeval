#!/usr/bin/env node
import { analyze } from './engine/analyze.js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(join(__dirname, '..', '.env'));

const url = process.argv[2];
const asJson = process.argv.includes('--json');

if (!url) {
  console.error('Usage: npm run cli -- <url> [--json]');
  process.exit(1);
}

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  teal: '\x1b[38;5;36m', red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m',
};
const gradeColor = (g) => (['A', 'B'].includes(g) ? C.green : ['C', 'D'].includes(g) ? C.yellow : C.red);

const report = await analyze(url);

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const { overall, categories, actionPlan, meta } = report;
console.log(`\n${C.teal}${C.bold}GBX SiteEval${C.reset}  —  ${meta.url}`);
console.log(`${C.dim}Analysed in ${meta.elapsedMs} ms · ${meta.fetchedAt}${C.reset}\n`);
console.log(`  OVERALL  ${gradeColor(overall.grade)}${C.bold}${overall.grade}${C.reset}  ${overall.score}/100  ${C.dim}(${overall.band})${C.reset}`);
console.log(`  ${overall.headline}\n`);
console.log(`  ${C.bold}Category scores${C.reset}`);
for (const c of categories) {
  const bar = '█'.repeat(Math.round(c.score / 5)).padEnd(20, '░');
  console.log(`  ${gradeColor(c.grade)}${c.grade}${C.reset} ${bar} ${String(c.score).padStart(3)}  ${c.label}`);
}
console.log(`\n  ${C.bold}Top priorities${C.reset}`);
actionPlan.slice(0, 6).forEach((a, i) => {
  const tag = a.priority === 'high' ? `${C.red}HIGH${C.reset}` : a.priority === 'medium' ? `${C.yellow}MED ${C.reset}` : `${C.dim}LOW ${C.reset}`;
  console.log(`  ${i + 1}. [${tag}] ${a.text} ${C.dim}(${a.category})${C.reset}`);
});
console.log(`\n  ${C.dim}Adapters — Claude: ${meta.adapters.claude} · PageSpeed: ${meta.adapters.pageSpeed} · Search: ${meta.adapters.search}${C.reset}\n`);

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let val = m[2].trim().replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined && val !== '') process.env[m[1]] = val;
  }
}
