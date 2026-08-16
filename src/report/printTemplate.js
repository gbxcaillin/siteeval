/**
 * Render a full evaluation report as a standalone, GBX-branded HTML document.
 * Dark premium cover page + readable light interior. Self-contained (inline CSS),
 * so it can be printed to PDF in any browser or rendered server-side.
 */
const GRADE_COLOR = { A: '#2E8B6E', B: '#3FA184', C: '#B8912F', D: '#B8912F', E: '#C7594B', F: '#C7594B' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

function logoLockup(dark) {
  const sub = dark ? '#A7ABA9' : '#5b6360';
  const mark = dark ? '#fff' : '#0A0A0A';
  return `<span style="display:inline-flex;align-items:center;gap:11px;border:1px solid ${dark ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.18)'};padding:8px 13px;border-radius:8px">
    <span style="font-family:Georgia,serif;font-weight:700;font-size:23px;letter-spacing:1px;color:${mark};line-height:1">GB<span style="color:#2E8B6E">X</span></span>
    <span style="width:1px;height:22px;background:${dark ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.18)'}"></span>
    <span style="font-size:9px;letter-spacing:2.2px;color:${sub};text-transform:uppercase;line-height:1.25">Professional<br>Services</span>
  </span>`;
}

function ring(score, grade) {
  const R = 52, C = 2 * Math.PI * R, off = C * (1 - score / 100), col = GRADE_COLOR[grade] || '#2E8B6E';
  return `<svg width="132" height="132" viewBox="0 0 132 132" style="transform:rotate(-90deg)">
    <circle cx="66" cy="66" r="${R}" stroke="rgba(255,255,255,.14)" stroke-width="9" fill="none"/>
    <circle cx="66" cy="66" r="${R}" stroke="${col}" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${off}"/>
  </svg>`;
}

export function renderReportHTML(r) {
  const dt = new Date(r.meta.fetchedAt);
  const dateStr = dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const oCol = GRADE_COLOR[r.overall.grade] || '#2E8B6E';

  const cats = r.categories
    .map((c) => {
      const col = GRADE_COLOR[c.grade] || '#2E8B6E';
      const findings = c.findings.slice(0, 5).map((f) => {
        const ic = f.severity === 'good' ? '●' : f.severity === 'bad' ? '✕' : '▲';
        const fc = f.severity === 'good' ? '#2E8B6E' : f.severity === 'bad' ? '#C7594B' : '#B8912F';
        return `<li><span style="color:${fc};font-size:10px">${ic}</span> ${esc(f.text)}</li>`;
      }).join('');
      return `<div class="cat">
        <div class="cat-h">
          <div><div class="cat-t">${esc(c.label)}</div><div class="cat-b">${esc(c.band)} · ${c.score}/100</div></div>
          <div class="cat-g" style="color:${col};border-color:${col}">${c.grade}</div>
        </div>
        <div class="bar"><i style="width:${c.score}%;background:${col}"></i></div>
        <ul class="find">${findings}</ul>
      </div>`;
    })
    .join('');

  const plan = r.actionPlan
    .map((a, i) => `<tr>
      <td class="n">${i + 1}</td>
      <td><div class="pt">${esc(a.text)}</div><div class="pm"><span class="pri ${a.priority}">${a.priority.toUpperCase()}</span> ${esc(a.category)}</div></td>
    </tr>`)
    .join('');

  const editorial = r.editorial && r.editorial.verdict
    ? `<div class="edit">
        <div class="tag">Strategist's read</div>
        <p class="ev">${esc(r.editorial.verdict)}</p>
        ${Array.isArray(r.editorial.topFixes) ? `<ul>${r.editorial.topFixes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        ${r.editorial.rewriteHeadline ? `<div class="rw"><b>Suggested headline:</b> ${esc(r.editorial.rewriteHeadline)}</div>` : ''}
      </div>`
    : '';

  const crawlBlock = r.crawl
    ? `<div class="crawl"><b>Pages reviewed (${r.crawl.pagesCrawled + 1}):</b> Homepage, ${r.crawl.pages.map((p) => esc(p.label)).join(', ')}.</div>`
    : '';

  const rb = r.render && r.render.readability;
  const mobileBlock = rb && rb.verdict && rb.verdict !== 'unknown'
    ? `<div class="mobile mob-${rb.verdict}">
        <b>Mobile: ${rb.verdict === 'ok' ? 'Reads well' : rb.verdict === 'suboptimal' ? 'Poorly optimised' : 'Unreadable'}.</b>
        ${(rb.issues || []).length ? esc(rb.issues.join(' ')) : 'No blocking mobile issues detected.'}
      </div>`
    : '';
  const shots = r.render && (r.render.desktop || r.render.mobile)
    ? `<div class="shots">
        ${r.render.desktop ? `<figure><img src="${r.render.desktop.shot}"><figcaption>Desktop · 16:9</figcaption></figure>` : ''}
        ${r.render.mobile ? `<figure class="m"><img src="${r.render.mobile.shot}"><figcaption>Mobile</figcaption></figure>` : ''}
      </div>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>GBX SiteEval — ${esc(r.meta.host)}</title>
<style>
  @page { size: A4; margin: 16mm 15mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1A1A1A; font-size:11.5px; line-height:1.5; }
  h2 { font-family:Georgia,serif; font-weight:400; font-size:19px; color:#0A0A0A; margin:26px 0 12px; }
  .lbl { display:block; font-size:9px; letter-spacing:2px; text-transform:uppercase; color:#8a908d; margin-bottom:3px; }

  /* Cover */
  .cover { background:#0A0A0A; color:#EDEDED; height:calc(100vh - 0px); min-height:245mm; margin:-16mm -15mm 0; padding:30mm 22mm; display:flex; flex-direction:column; page-break-after:always;
    background-image: radial-gradient(600px 300px at 85% 8%, rgba(46,139,110,.18), transparent 60%); }
  .cover .top { display:flex; justify-content:space-between; align-items:center; }
  .cover .tool { font-size:10px; letter-spacing:3px; text-transform:uppercase; color:#6E7370; }
  .cover .mid { margin-top:auto; margin-bottom:auto; }
  .cover .eyebrow { color:#2E8B6E; letter-spacing:3px; text-transform:uppercase; font-size:11px; margin-bottom:16px; }
  .cover h1 { font-family:Georgia,serif; font-weight:400; font-size:40px; line-height:1.1; color:#fff; margin:0 0 10px; }
  .cover .host { font-family:Georgia,serif; font-size:22px; color:#2E8B6E; word-break:break-all; }
  .cover .scorewrap { display:flex; align-items:center; gap:22px; margin-top:34px; }
  .cover .scorewrap .val { position:relative; width:132px; height:132px; }
  .cover .scorewrap .val .g { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .cover .scorewrap .val .g b { font-family:Georgia,serif; font-size:38px; color:#fff; line-height:1; }
  .cover .scorewrap .val .g span { font-size:11px; color:#8a908d; margin-top:3px; }
  .cover .scorewrap .verdict { max-width:300px; color:#A7ABA9; }
  .cover .scorewrap .verdict .band { color:#2E8B6E; letter-spacing:2px; text-transform:uppercase; font-size:10px; }
  .cover .foot { color:#6E7370; font-size:10px; border-top:1px solid rgba(255,255,255,.1); padding-top:14px; display:flex; justify-content:space-between; }

  /* Body */
  .cats { display:grid; grid-template-columns:1fr 1fr; gap:11px; }
  .cat { border:1px solid #e6e6e3; border-radius:9px; padding:13px 14px; break-inside:avoid; }
  .cat-h { display:flex; justify-content:space-between; align-items:flex-start; }
  .cat-t { font-weight:700; font-size:12.5px; }
  .cat-b { color:#8a908d; font-size:10px; margin-top:2px; text-transform:capitalize; }
  .cat-g { font-family:Georgia,serif; font-size:22px; width:38px; height:38px; display:flex; align-items:center; justify-content:center; border:1px solid; border-radius:8px; }
  .bar { height:5px; background:#eee; border-radius:5px; margin:10px 0 0; overflow:hidden; }
  .bar i { display:block; height:100%; border-radius:5px; }
  .find { list-style:none; margin:10px 0 0; padding:0; }
  .find li { margin:5px 0; color:#3a3f3d; }
  table { width:100%; border-collapse:collapse; }
  .plan td { border-bottom:1px solid #eee; padding:9px 4px; vertical-align:top; break-inside:avoid; }
  .plan .n { font-family:Georgia,serif; color:#b7bbb8; width:26px; font-size:16px; }
  .pt { font-size:12px; color:#1A1A1A; }
  .pm { font-size:9.5px; color:#8a908d; margin-top:3px; }
  .pri { font-size:8px; letter-spacing:.5px; padding:2px 6px; border-radius:10px; font-weight:700; }
  .pri.high { background:#f6ded9; color:#B0402F; } .pri.medium { background:#f3ebd6; color:#8a6d1e; } .pri.low { background:#eee; color:#777; }
  .edit { background:#f4f8f6; border:1px solid #dceae4; border-radius:9px; padding:15px 17px; break-inside:avoid; }
  .edit .tag { font-size:9px; letter-spacing:2px; text-transform:uppercase; color:#2E8B6E; }
  .edit .ev { font-family:Georgia,serif; font-size:15px; color:#0A0A0A; margin:8px 0 10px; line-height:1.4; }
  .edit ul { margin:8px 0 0; padding-left:16px; } .edit li { margin:4px 0; }
  .edit .rw { border-left:2px solid #2E8B6E; padding-left:10px; margin-top:10px; font-style:italic; color:#3a3f3d; }
  .crawl { color:#5b6360; font-size:10.5px; margin:10px 0 0; }
  .partial { margin:0 0 6px; padding:11px 14px; border-radius:8px; font-size:11px; background:#f7f1de; border:1px solid #e6d9b0; color:#6b571f; }
  .shots { display:flex; gap:14px; align-items:flex-start; break-inside:avoid; }
  .shots figure { margin:0; } .shots figure img { border:1px solid #e6e6e3; border-radius:7px; width:340px; max-width:100%; display:block; }
  .shots figure.m img { width:150px; border-radius:12px; }
  .shots figcaption { color:#8a908d; font-size:9.5px; margin-top:5px; }
  .mobile { margin:12px 0 0; padding:11px 14px; border-radius:8px; font-size:11px; color:#3a3f3d; background:#f4f8f6; border:1px solid #dceae4; break-inside:avoid; }
  .mobile.mob-unreadable { background:#f6ded9; border-color:#eec7bf; color:#7a2c1f; }
  .mobile.mob-suboptimal { background:#f3ebd6; border-color:#e6d9b0; }
  .pagefoot { margin-top:30px; border-top:1px solid #eee; padding-top:12px; color:#9aa09d; font-size:9.5px; display:flex; justify-content:space-between; }
</style></head><body>

<section class="cover">
  <div class="top">${logoLockup(true)}<span class="tool">SiteEval Report</span></div>
  <div class="mid">
    <div class="eyebrow">Marketing Potential Evaluation</div>
    <h1>Marketing scorecard<br>& action plan</h1>
    <div class="host">${esc(r.meta.host)}</div>
    <div class="scorewrap">
      <div class="val">${ring(r.overall.score, r.overall.grade)}<div class="g"><b style="color:${oCol}">${r.overall.grade}</b><span>${r.overall.score}/100</span></div></div>
      <div class="verdict"><div class="band">${esc(r.overall.band)}</div><p>${esc(r.overall.headline)}</p></div>
    </div>
  </div>
  <div class="foot"><span>Prepared ${esc(dateStr)}</span><span>GBX Professional Services — Sharper operations. Stronger commercial outcomes.</span></div>
</section>

${shots ? `<h2><span class="lbl">How it looks</span>Desktop &amp; mobile</h2>${shots}${mobileBlock}` : ''}

${r.meta.partialAnalysis ? `<div class="partial"><b>Note:</b> this site renders its content with JavaScript and could not be fully rendered for this report, so the findings below are based on the initial HTML and may understate the site.</div>` : ''}

<h2><span class="lbl">Scorecard</span>Five marketing dimensions</h2>
<div class="cats">${cats}</div>
${crawlBlock}

${editorial ? `<h2><span class="lbl">Editorial read</span>Strategist's verdict</h2>${editorial}` : ''}

<h2><span class="lbl">Do this next</span>Prioritised action plan</h2>
<table class="plan">${plan}</table>

<div class="pagefoot"><span>${esc(r.meta.url)}</span><span>gbxps.com · SiteEval</span></div>
</body></html>`;
}
