'use strict';

const $ = (id) => document.getElementById(id);
const form = $('evalform');
const compareform = $('compareform');
const input = $('url');
const go = $('go');
const loading = $('loading');
const errorBox = $('error');
const results = $('results');
const compareResults = $('compare-results');

const GRADE_COLOR = { A: '#2E8B6E', B: '#3FA184', C: '#C9A24A', D: '#C9A24A', E: '#C7594B', F: '#C7594B' };
const SEV_ICON = { good: '●', warn: '▲', bad: '✕' };

let SERVER = { leadgen: false, adapters: {} };
let currentUrl = '';
let currentCrawl = false;

/* ── Boot: learn server config (leadgen on/off, adapters) ── */
fetch('/api/health').then((r) => r.json()).then((h) => { SERVER = h; }).catch(() => {});

/* ── Mode tabs ── */
$('tab-eval').addEventListener('click', () => switchMode('eval'));
$('tab-compare').addEventListener('click', () => switchMode('compare'));
function switchMode(mode) {
  const evalMode = mode === 'eval';
  $('tab-eval').classList.toggle('active', evalMode);
  $('tab-compare').classList.toggle('active', !evalMode);
  $('tab-eval').setAttribute('aria-selected', evalMode);
  $('tab-compare').setAttribute('aria-selected', !evalMode);
  form.style.display = evalMode ? '' : 'none';
  compareform.style.display = evalMode ? 'none' : '';
  $('formnote').innerHTML = evalMode
    ? 'Runs a live analysis across <b>five marketing dimensions</b> and ~40 checks. No account, no setup required.'
    : 'Scores every site the same way, then ranks them and shows the widest gaps. Up to four sites.';
  errorBox.classList.remove('on');
  results.classList.remove('on');
  compareResults.classList.remove('on');
}

/* ── Add-site button (compare) ── */
$('addsite').addEventListener('click', () => {
  const rows = $('compare-inputs');
  if (rows.children.length >= 4) return;
  const div = document.createElement('div');
  div.className = 'crow';
  div.innerHTML = '<span class="pre">https://</span><input class="curl" type="text" placeholder="another-site.com" aria-label="Site ' + (rows.children.length + 1) + '" />';
  rows.appendChild(div);
  if (rows.children.length >= 4) $('addsite').style.display = 'none';
});

/* ── Evaluate ── */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = input.value.trim();
  if (!raw) return;
  currentUrl = raw;
  currentCrawl = $('crawl').checked;

  beginLoading();
  go.disabled = true;
  try {
    const data = await postJSON('/api/evaluate', { url: raw, crawl: currentCrawl });
    stopSteps(true);
    if (data.gated) renderGate(data);
    else renderReport(data);
  } catch (err) {
    showError(err.message);
  } finally {
    go.disabled = false;
    setTimeout(() => loading.classList.remove('on'), 400);
  }
});

/* ── Lead capture ── */
$('gateform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('lead-go');
  const errEl = $('gate-error');
  errEl.classList.remove('err');
  errEl.textContent = '';
  btn.disabled = true;
  try {
    const full = await postJSON('/api/lead', {
      token: window.__gateToken,
      email: $('lead-email').value.trim(),
      name: $('lead-name').value.trim(),
      company: $('lead-company').value.trim(),
    });
    $('gate').style.display = 'none';
    $('fullreport').classList.remove('locked');
    renderReport(full, true);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('err');
  } finally {
    btn.disabled = false;
  }
});

/* ── Compare ── */
compareform.addEventListener('submit', async (e) => {
  e.preventDefault();
  const urls = [...document.querySelectorAll('#compare-inputs .curl')].map((i) => i.value.trim()).filter(Boolean);
  if (urls.length < 2) { showError('Enter at least two sites to compare.'); return; }
  currentCrawl = $('crawl').checked;
  beginLoading();
  $('cgo').disabled = true;
  try {
    const data = await postJSON('/api/compare', { urls });
    stopSteps(true);
    renderCompare(data);
  } catch (err) {
    showError(err.message);
  } finally {
    $('cgo').disabled = false;
    setTimeout(() => loading.classList.remove('on'), 400);
  }
});

/* ── Buttons ── */
$('againbtn').addEventListener('click', reset);
$('c-againbtn').addEventListener('click', reset);
$('pdfbtn').addEventListener('click', downloadPDF);
function reset() {
  results.classList.remove('on');
  compareResults.classList.remove('on');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  input.focus();
}

async function downloadPDF() {
  const btn = $('pdfbtn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Preparing PDF…';
  try {
    const res = await fetch('/api/report.pdf', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: currentUrl, crawl: currentCrawl }),
    });
    if (res.ok && res.headers.get('content-type')?.includes('pdf')) {
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `GBX-SiteEval-${currentUrl.replace(/[^a-z0-9.-]/gi, '_')}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } else {
      // Fallback: open the branded print view for browser "Save as PDF".
      const data = await res.json().catch(() => ({}));
      const url = data.fallback || `/report?url=${encodeURIComponent(currentUrl)}${currentCrawl ? '&crawl=1' : ''}`;
      window.open(url, '_blank');
    }
  } catch {
    window.open(`/report?url=${encodeURIComponent(currentUrl)}${currentCrawl ? '&crawl=1' : ''}`, '_blank');
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}

/* ── Shared request/loading helpers ── */
async function postJSON(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function beginLoading() {
  errorBox.classList.remove('on');
  results.classList.remove('on');
  compareResults.classList.remove('on');
  loading.classList.add('on');
  runSteps();
}
function showError(msg) {
  stopSteps(false);
  errorBox.textContent = msg;
  errorBox.classList.add('on');
}

let stepTimer;
function runSteps() {
  const steps = [...document.querySelectorAll('#steps .step')];
  steps.forEach((s) => s.classList.remove('active', 'done'));
  let i = 0;
  const tick = () => {
    if (i > 0) steps[i - 1]?.classList.replace('active', 'done');
    if (i < steps.length) { steps[i].classList.add('active'); i++; stepTimer = setTimeout(tick, 900 + Math.random() * 700); }
  };
  tick();
}
function stopSteps(done) {
  clearTimeout(stepTimer);
  if (done) document.querySelectorAll('#steps .step').forEach((s) => { s.classList.remove('active'); s.classList.add('done'); });
}

/* ── Lead-gen gate ── */
function renderGate(t) {
  window.__gateToken = t.token;
  $('r-url').textContent = t.meta.host;
  $('r-meta').innerHTML = `Analysed <a href="${t.meta.url}" target="_blank" rel="noopener">${t.meta.url}</a> · ${t.meta.elapsedMs} ms`;
  $('r-adapters').innerHTML = '';
  $('r-ring').innerHTML = ring(t.overall.score, t.overall.grade);
  $('r-band').textContent = t.overall.band;
  $('r-headline').textContent = t.overall.headline;

  $('gate').style.display = '';
  $('gate-sub').textContent = `We analysed ${t.lockedCount.dimensions} dimensions and built a ${t.lockedCount.actions}-step action plan for ${t.meta.host}. Enter your details to see all of it — and download the branded PDF.`;

  // Render a blurred teaser behind the gate using the one weakest dimension.
  const cat = t.teaserCategory;
  $('r-cats').innerHTML = cat ? card({ ...cat, recommendations: [] }) : '';
  $('r-plan').innerHTML = '';
  $('r-quick').innerHTML = '';
  $('r-snapshot').innerHTML = '';
  $('r-editorial-wrap').style.display = 'none';
  $('r-crawl-wrap').style.display = 'none';
  $('fullreport').classList.add('locked');

  results.classList.add('on');
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Single-site report ── */
function renderReport(r, keepScroll) {
  $('gate').style.display = 'none';
  $('fullreport').classList.remove('locked');

  $('r-url').textContent = r.meta.host;
  $('r-meta').innerHTML = `Analysed <a href="${r.meta.url}" target="_blank" rel="noopener">${r.meta.url}</a> · ${r.meta.elapsedMs} ms · ${new Date(r.meta.fetchedAt).toLocaleString()}`;
  $('r-adapters').innerHTML = Object.entries(r.meta.adapters).map(([k, v]) => {
    const on = v === 'active';
    const label = { pageSpeed: 'PageSpeed', search: 'Search', claude: 'Claude AI' }[k] || k;
    return `<span class="apill ${on ? 'active' : ''}" title="${v}">${label}: ${on ? 'on' : 'off'}</span>`;
  }).join('');

  $('r-ring').innerHTML = ring(r.overall.score, r.overall.grade);
  $('r-band').textContent = r.overall.band;
  $('r-headline').textContent = r.overall.headline;

  $('r-cats').innerHTML = r.categories.map(card).join('');
  wireMoreButtons();

  // Crawl block
  if (r.crawl && r.crawl.pages.length) {
    $('r-crawl-wrap').style.display = '';
    $('r-crawl').innerHTML = `<div class="pagelist">${r.crawl.pages.map((p) =>
      `<div class="pg"><div class="pl">${esc(p.label)}</div><div class="pp">${esc(p.path)}</div><div class="pw">${p.wordCount} words${p.forms ? ` · ${p.forms} form(s)` : ''}</div></div>`
    ).join('')}</div>`;
  } else {
    $('r-crawl-wrap').style.display = 'none';
  }

  // Editorial
  const ed = r.editorial;
  if (ed && ed.verdict) {
    $('r-editorial-wrap').style.display = '';
    $('r-editorial').innerHTML = `
      <span class="tag">GBX strategist · AI-assisted</span>
      <p class="verdict">${esc(ed.verdict)}</p>
      ${ed.positioning ? `<p style="color:var(--ink-dim);margin:0 0 10px"><b style="color:var(--white)">Positioning.</b> ${esc(ed.positioning)}</p>` : ''}
      ${Array.isArray(ed.topFixes) ? `<ul style="margin:10px 0 0;padding-left:18px;color:var(--ink-dim)">${ed.topFixes.map((f) => `<li style="margin:6px 0">${esc(f)}</li>`).join('')}</ul>` : ''}
      ${ed.rewriteHeadline ? `<div class="rewrite"><b>Try this headline:</b> ${esc(ed.rewriteHeadline)}</div>` : ''}`;
  } else {
    $('r-editorial-wrap').style.display = 'none';
  }

  $('r-plan').innerHTML = r.actionPlan.map((a, i) => `<div class="row">
    <div class="n">${i + 1}</div>
    <div class="body"><div class="txt">${esc(a.text)}</div>
    <div class="meta"><span class="pri ${a.priority}">${a.priority}</span> &nbsp;${esc(a.category)}</div></div>
  </div>`).join('');

  $('r-quick').innerHTML = r.quickWins.length
    ? r.quickWins.map((q) => `<li><span class="ic">✓</span><span>${esc(q.text)} <span style="color:var(--ink-faint)">— ${esc(q.category)}</span></span></li>`).join('')
    : '<li style="color:var(--ink-faint)">No quick wins — the fundamentals need attention first (see action plan).</li>';

  const s = r.snapshot;
  const socials = Object.entries(s.socials || {}).filter(([, v]) => v).map(([k]) => k);
  const chips = [
    ['Title', s.title ? clip(s.title, 40) : '—'],
    ['Headline', s.headline ? clip(s.headline, 40) : 'none found'],
    ['Words', s.wordCount],
    ['Platform', s.platform || 'unknown'],
    ['Socials', socials.length ? socials.join(', ') : 'none linked'],
  ];
  $('r-snapshot').innerHTML = chips.map(([k, v]) => `<span class="chip"><span class="k">${k}:</span> <b>${esc(String(v))}</b></span>`).join('');

  results.classList.add('on');
  if (!keepScroll) results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Comparison report ── */
function renderCompare(c) {
  $('c-meta').textContent = `${c.ranking.length} sites · ${new Date(c.generatedAt).toLocaleString()}`;
  $('c-summary').textContent = c.summary;

  $('c-ranking').innerHTML = c.ranking.map((r, i) => {
    const col = GRADE_COLOR[r.grade] || '#2E8B6E';
    return `<div class="rrow ${i === 0 ? 'win' : ''}">
      <div class="pos">${i + 1}</div>
      <div class="rhost">${esc(r.host)}</div>
      <div class="rscore" style="color:${col}">${r.score}<span class="rgrade">/100 · ${r.grade}</span></div>
    </div>`;
  }).join('');

  const hosts = c.table[0].cells.map((x) => x.host);
  const head = `<tr><th>Dimension</th>${hosts.map((h) => `<th style="text-align:center">${esc(h)}</th>`).join('')}</tr>`;
  const rows = c.table.map((row) => `<tr>
    <td class="dim">${esc(row.label)}</td>
    ${row.cells.map((cell) => `<td class="cell ${cell.leader ? 'lead' : ''}">${cell.score}<div class="cg">${cell.grade}</div></td>`).join('')}
  </tr>`).join('');
  $('c-table').innerHTML = head + rows;

  compareResults.classList.add('on');
  compareResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Render helpers ── */
function wireMoreButtons() {
  document.querySelectorAll('.morebtn').forEach((b) =>
    b.addEventListener('click', () => {
      const recs = b.nextElementSibling;
      recs.classList.toggle('on');
      b.textContent = recs.classList.contains('on') ? 'Hide recommendations' : `Show ${b.dataset.n} recommendations`;
    })
  );
}
function ring(score, grade) {
  const R = 58, C = 2 * Math.PI * R, off = C * (1 - score / 100), col = GRADE_COLOR[grade] || '#2E8B6E';
  return `<svg width="132" height="132" viewBox="0 0 132 132">
    <circle cx="66" cy="66" r="${R}" stroke="rgba(255,255,255,.08)" stroke-width="9" fill="none"/>
    <circle cx="66" cy="66" r="${R}" stroke="${col}" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}">
      <animate attributeName="stroke-dashoffset" from="${C}" to="${off}" dur="0.9s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" />
    </circle></svg>
    <div class="val"><span class="g" style="color:${col}">${grade}</span><span class="s">${score}/100</span></div>`;
}
function card(c) {
  const col = GRADE_COLOR[c.grade] || '#2E8B6E';
  const findings = (c.findings || []).slice(0, 4).map((f) =>
    `<li class="${f.severity}"><span class="ic">${SEV_ICON[f.severity] || '●'}</span><span>${esc(f.text)}</span></li>`
  ).join('');
  const recs = (c.recommendations && c.recommendations.length)
    ? `<button class="morebtn" data-n="${c.recommendations.length}">Show ${c.recommendations.length} recommendations</button>
       <div class="recs"><h4>Recommendations</h4><ul>${c.recommendations.map((r) =>
         `<li class="${r.priority === 'high' ? 'bad' : 'warn'}"><span class="ic">→</span><span>${esc(r.text)}</span></li>`).join('')}</ul></div>`
    : '';
  return `<div class="card">
    <div class="top"><h3>${esc(c.label)}</h3><div class="badge" style="color:${col};border-color:${col}55">${c.grade}</div></div>
    <div class="barwrap"><div class="bar"><i style="width:${c.score}%;background:${col}"></i></div>
    <div class="scoreline"><span>${c.band}</span><span>${c.score}/100</span></div></div>
    <ul>${findings}</ul>${recs}
  </div>`;
}
function esc(s) { return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function clip(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// Prefill from ?url=
const q = new URLSearchParams(location.search).get('url');
if (q) { input.value = q.replace(/^https?:\/\//, ''); form.requestSubmit(); }
