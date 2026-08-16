'use strict';

const $ = (id) => document.getElementById(id);
const form = $('evalform');
const input = $('url');
const go = $('go');
const loading = $('loading');
const errorBox = $('error');
const results = $('results');

const GRADE_COLOR = {
  A: '#2E8B6E', B: '#3FA184', C: '#C9A24A', D: '#C9A24A', E: '#C7594B', F: '#C7594B',
};
const SEV_ICON = { good: '●', warn: '▲', bad: '✕' };

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = input.value.trim();
  if (!raw) return;

  errorBox.classList.remove('on');
  results.classList.remove('on');
  go.disabled = true;
  loading.classList.add('on');
  runSteps();

  try {
    const res = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: raw }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Evaluation failed.');
    stopSteps(true);
    render(data);
  } catch (err) {
    stopSteps(false);
    errorBox.textContent = err.message;
    errorBox.classList.add('on');
  } finally {
    go.disabled = false;
    setTimeout(() => loading.classList.remove('on'), 400);
  }
});

$('againbtn').addEventListener('click', () => {
  results.classList.remove('on');
  input.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('printbtn').addEventListener('click', () => window.print());

/* ── Loading step animation ─────────────────────────────── */
let stepTimer;
function runSteps() {
  const steps = [...document.querySelectorAll('#steps .step')];
  steps.forEach((s) => s.classList.remove('active', 'done'));
  let i = 0;
  const tick = () => {
    if (i > 0) steps[i - 1]?.classList.replace('active', 'done');
    if (i < steps.length) {
      steps[i].classList.add('active');
      i++;
      stepTimer = setTimeout(tick, 900 + Math.random() * 700);
    }
  };
  tick();
}
function stopSteps(done) {
  clearTimeout(stepTimer);
  if (done) document.querySelectorAll('#steps .step').forEach((s) => { s.classList.remove('active'); s.classList.add('done'); });
}

/* ── Render report ──────────────────────────────────────── */
function render(r) {
  $('r-url').textContent = r.meta.host;
  $('r-meta').innerHTML =
    `Analysed <a href="${r.meta.url}" target="_blank" rel="noopener">${r.meta.url}</a> · ${r.meta.elapsedMs} ms · ${new Date(r.meta.fetchedAt).toLocaleString()}`;

  // Adapter pills
  $('r-adapters').innerHTML = Object.entries(r.meta.adapters)
    .map(([k, v]) => {
      const on = v === 'active';
      const label = { pageSpeed: 'PageSpeed', search: 'Search', claude: 'Claude AI' }[k] || k;
      return `<span class="apill ${on ? 'active' : ''}" title="${v}">${label}: ${on ? 'on' : 'off'}</span>`;
    })
    .join('');

  // Ring gauge
  $('r-ring').innerHTML = ring(r.overall.score, r.overall.grade);
  $('r-band').textContent = r.overall.band;
  $('r-headline').textContent = r.overall.headline;

  // Category cards
  $('r-cats').innerHTML = r.categories.map(card).join('');
  document.querySelectorAll('.morebtn').forEach((b) =>
    b.addEventListener('click', () => {
      const recs = b.nextElementSibling;
      recs.classList.toggle('on');
      b.textContent = recs.classList.contains('on') ? 'Hide recommendations' : `Show ${b.dataset.n} recommendations`;
    })
  );

  // Editorial (Claude)
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

  // Action plan
  $('r-plan').innerHTML = r.actionPlan
    .map(
      (a, i) => `<div class="row">
        <div class="n">${i + 1}</div>
        <div class="body">
          <div class="txt">${esc(a.text)}</div>
          <div class="meta"><span class="pri ${a.priority}">${a.priority}</span> &nbsp;${esc(a.category)}</div>
        </div>
      </div>`
    )
    .join('');

  // Quick wins
  $('r-quick').innerHTML = r.quickWins.length
    ? r.quickWins.map((q) => `<li><span class="ic">✓</span><span>${esc(q.text)} <span style="color:var(--ink-faint)">— ${esc(q.category)}</span></span></li>`).join('')
    : '<li style="color:var(--ink-faint)">No quick wins — the fundamentals need attention first (see action plan).</li>';

  // Snapshot chips
  const s = r.snapshot;
  const socials = Object.entries(s.socials || {}).filter(([, v]) => v).map(([k]) => k);
  const chips = [
    ['Title', s.title ? clip(s.title, 40) : '—'],
    ['Headline', s.headline ? clip(s.headline, 40) : 'none found'],
    ['Words', s.wordCount],
    ['Platform', s.platform || 'unknown'],
    ['Socials', socials.length ? socials.join(', ') : 'none linked'],
  ];
  $('r-snapshot').innerHTML = chips
    .map(([k, v]) => `<span class="chip"><span class="k">${k}:</span> <b>${esc(String(v))}</b></span>`)
    .join('');

  results.classList.add('on');
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function ring(score, grade) {
  const R = 58, C = 2 * Math.PI * R;
  const off = C * (1 - score / 100);
  const col = GRADE_COLOR[grade] || '#2E8B6E';
  return `
    <svg width="132" height="132" viewBox="0 0 132 132">
      <circle cx="66" cy="66" r="${R}" stroke="rgba(255,255,255,.08)" stroke-width="9" fill="none"/>
      <circle cx="66" cy="66" r="${R}" stroke="${col}" stroke-width="9" fill="none"
        stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}"
        style="animation: none">
        <animate attributeName="stroke-dashoffset" from="${C}" to="${off}" dur="0.9s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" />
      </circle>
    </svg>
    <div class="val"><span class="g" style="color:${col}">${grade}</span><span class="s">${score}/100</span></div>`;
}

function card(c) {
  const col = GRADE_COLOR[c.grade] || '#2E8B6E';
  const findings = c.findings.slice(0, 4).map((f) =>
    `<li class="${f.severity}"><span class="ic">${SEV_ICON[f.severity] || '●'}</span><span>${esc(f.text)}</span></li>`
  ).join('');
  const recs = c.recommendations.length
    ? `<button class="morebtn" data-n="${c.recommendations.length}">Show ${c.recommendations.length} recommendations</button>
       <div class="recs"><h4>Recommendations</h4><ul>${c.recommendations
         .map((r) => `<li class="${r.priority === 'high' ? 'bad' : 'warn'}"><span class="ic">→</span><span>${esc(r.text)}</span></li>`)
         .join('')}</ul></div>`
    : '';
  return `<div class="card">
    <div class="top">
      <h3>${esc(c.label)}</h3>
      <div class="badge" style="color:${col};border-color:${col}55">${c.grade}</div>
    </div>
    <div class="barwrap">
      <div class="bar"><i style="width:${c.score}%;background:${col}"></i></div>
      <div class="scoreline"><span>${c.band}</span><span>${c.score}/100</span></div>
    </div>
    <ul>${findings}</ul>
    ${recs}
  </div>`;
}

/* ── helpers ── */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function clip(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// Prefill from ?url= for shareable links
const q = new URLSearchParams(location.search).get('url');
if (q) { input.value = q.replace(/^https?:\/\//, ''); form.requestSubmit(); }
