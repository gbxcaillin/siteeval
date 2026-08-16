/**
 * Render a full evaluation report as a standalone, GBX-branded HTML document.
 * Mostly-white, readable interior broken up by full-bleed teal / black banner
 * bands. Self-contained (inline CSS) so it prints to PDF anywhere.
 */
const GRADE_COLOR = { A: '#2E8B6E', B: '#3FA184', C: '#B8912F', D: '#B8912F', E: '#C7594B', F: '#C7594B' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

/** GBX lockup in one of three contexts: onLight, onTeal, onDark. */
function logoLockup(mode = 'onLight') {
  const conf = {
    onLight: { mark: '#0A0A0A', x: '#2E8B6E', sub: '#5b6360', border: 'rgba(0,0,0,.18)' },
    onTeal: { mark: '#ffffff', x: '#0A0A0A', sub: 'rgba(255,255,255,.85)', border: 'rgba(255,255,255,.5)' },
    onDark: { mark: '#ffffff', x: '#2E8B6E', sub: '#A7ABA9', border: 'rgba(255,255,255,.28)' },
  }[mode];
  return `<span style="display:inline-flex;align-items:center;gap:11px;border:1px solid ${conf.border};padding:8px 13px;border-radius:8px">
    <span style="font-family:Georgia,serif;font-weight:700;font-size:23px;letter-spacing:1px;color:${conf.mark};line-height:1">GB<span style="color:${conf.x}">X</span></span>
    <span style="width:1px;height:22px;background:${conf.border}"></span>
    <span style="font-size:9px;letter-spacing:2.2px;color:${conf.sub};text-transform:uppercase;line-height:1.25">Professional<br>Services</span>
  </span>`;
}

function ring(score, grade) {
  const R = 52, C = 2 * Math.PI * R, off = C * (1 - score / 100), col = GRADE_COLOR[grade] || '#2E8B6E';
  return `<svg width="128" height="128" viewBox="0 0 132 132" style="transform:rotate(-90deg)">
    <circle cx="66" cy="66" r="${R}" stroke="rgba(255,255,255,.16)" stroke-width="9" fill="none"/>
    <circle cx="66" cy="66" r="${R}" stroke="${col}" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${off}"/>
  </svg>`;
}

/** A full-bleed section header band (teal by default, black for emphasis). */
function sectionBand(label, title, tone = 'teal') {
  return `<div class="band band-${tone} section-band"><span class="sb-lbl">${esc(label)}</span><h2>${esc(title)}</h2></div>`;
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
        <p class="ev">${esc(r.editorial.verdict)}</p>
        ${Array.isArray(r.editorial.topFixes) ? `<ul>${r.editorial.topFixes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        ${r.editorial.rewriteHeadline ? `<div class="rw"><b>Suggested headline:</b> ${esc(r.editorial.rewriteHeadline)}</div>` : ''}
      </div>`
    : '';

  const crawlBlock = r.crawl
    ? `<div class="crawl"><b>Pages reviewed (${r.crawl.pagesCrawled + 1}):</b> Homepage, ${r.crawl.pages.map((p) => esc(p.label)).join(', ')}.</div>`
    : '';

  const disc = r.discovery;
  const path = (u) => { try { return new URL(u).pathname; } catch { return u; } };
  const hasDisc = disc && (disc.unlinkedCount || (disc.socialProfiles || []).length || (disc.notableHidden || []).length);
  const discBlock = hasDisc
    ? `${sectionBand('Off the map', 'Indexed pages & social footprint', 'teal')}
       <div class="disc">
        ${disc.unlinkedCount ? `<p><b>${disc.unlinkedCount} orphan page(s)</b> — in the sitemap but not linked from the homepage: ${disc.unlinkedPages.slice(0, 8).map((u) => `<code>${esc(path(u))}</code>`).join(' ')}${disc.unlinkedCount > 8 ? ` +${disc.unlinkedCount - 8} more` : ''}.</p>` : ''}
        ${(disc.notableHidden || []).length ? `<p><b>Hidden paths</b> (robots.txt): ${disc.notableHidden.slice(0, 8).map((h) => `<code>${esc(h)}</code>`).join(' ')} — confirm these are behind real auth.</p>` : ''}
        ${(disc.socialProfiles || []).length ? `<p><b>Social:</b> ${disc.socialProfiles.map((s) => `${esc(s.platform)} <span class="src">(${s.source === 'search' ? 'in search, not linked' : 'linked'})</span>`).join(' · ')}</p>` : `<p><b>Social:</b> none found.</p>`}
       </div>`
    : '';

  const serp = disc && disc.serp;
  const KIND = { you: ['Your site', '#e3f3ec', '#1A5C4A'], social: ['Social', '#f3ebd6', '#8a6d1e'], directory: ['Directory / reviews', '#eee', '#666'], 'third-party': ['Third-party', '#f0f1f3', '#5f6368'] };
  const serpBlock = serp && serp.rows && serp.rows.length
    ? `${sectionBand('Search results', 'How you show up in search', 'teal')}
       <div class="serp">
         <div class="serp-bar">${esc(serp.query)}<span>⌕</span></div>
         ${serp.rows.map((row) => {
           const k = KIND[row.kind] || KIND['third-party'];
           const label = row.kind === 'social' && row.platform ? row.platform : k[0];
           return `<div class="serp-row${row.kind === 'you' ? ' you' : ''}">
             <div class="serp-pos">${row.position}</div>
             <div>
               <div class="serp-url">${esc(row.display)} <span class="serp-tag" style="background:${k[1]};color:${k[2]}">${esc(label)}</span></div>
               <div class="serp-title">${esc(row.title)}</div>
               ${row.snippet ? `<div class="serp-snip">${esc(row.snippet)}</div>` : ''}
             </div></div>`;
         }).join('')}
       </div>
       <div class="serp-hi">${(serp.highlights || []).map((h) => `<p class="hi-${h.tone}">${esc(h.text)}</p>`).join('')}</div>`
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
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#20262e; font-size:11.5px; line-height:1.55; background:#fff; }

  /* Full-bleed bands (reach the page edge despite the 14mm page margin) */
  .band { margin-left:-14mm; margin-right:-14mm; padding-left:14mm; padding-right:14mm; }
  .band-teal { background:#2E8B6E; color:#fff; }
  .band-black { background:#0A0A0A; color:#fff; }
  .section-band { display:flex; align-items:baseline; gap:14px; padding-top:9px; padding-bottom:9px; margin-top:22px; margin-bottom:14px; page-break-after:avoid; break-after:avoid; }
  .section-band .sb-lbl { font-size:9px; letter-spacing:2.4px; text-transform:uppercase; opacity:.8; }
  .section-band h2 { font-family:Georgia,serif; font-weight:400; font-size:18px; margin:0; }

  /* Cover (page 1) */
  .cover { min-height:262mm; display:flex; flex-direction:column; page-break-after:always; }
  .cover-top { padding-top:12px; padding-bottom:12px; display:flex; align-items:center; justify-content:space-between; }
  .cover-top .tool { font-size:10px; letter-spacing:3px; text-transform:uppercase; color:rgba(255,255,255,.85); }
  .cover-mid { flex:1; display:flex; flex-direction:column; justify-content:center; padding:24px 0; }
  .cover-mid .eyebrow { color:#2E8B6E; letter-spacing:3px; text-transform:uppercase; font-size:11px; margin-bottom:14px; }
  .cover-mid h1 { font-family:Georgia,serif; font-weight:400; font-size:42px; line-height:1.08; color:#0A0A0A; margin:0 0 12px; }
  .cover-mid .host { font-family:Georgia,serif; font-size:22px; color:#2E8B6E; word-break:break-all; }
  .cover-score { padding-top:22px; padding-bottom:22px; display:flex; align-items:center; gap:26px; }
  .cover-score .val { position:relative; width:128px; height:128px; flex:none; }
  .cover-score .val .g { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .cover-score .val .g b { font-family:Georgia,serif; font-size:40px; line-height:1; }
  .cover-score .val .g span { font-size:11px; color:rgba(255,255,255,.6); margin-top:3px; }
  .cover-score .verdict { color:rgba(255,255,255,.82); }
  .cover-score .verdict .vb { color:#5fd0aa; letter-spacing:2px; text-transform:uppercase; font-size:10px; font-weight:700; }
  .cover-score .verdict p { margin:6px 0 0; font-size:14px; max-width:360px; }
  .cover-foot { padding-top:14px; display:flex; justify-content:space-between; color:#8a908d; font-size:10px; border-top:1px solid #eee; }

  /* Scorecard cards */
  .cats { display:grid; grid-template-columns:1fr 1fr; gap:11px; }
  .cat { border:1px solid #e6e6e3; border-radius:9px; padding:13px 14px; break-inside:avoid; }
  .cat-h { display:flex; justify-content:space-between; align-items:flex-start; }
  .cat-t { font-weight:700; font-size:12.5px; color:#1A1A1A; }
  .cat-b { color:#8a908d; font-size:10px; margin-top:2px; text-transform:capitalize; }
  .cat-g { font-family:Georgia,serif; font-size:22px; width:38px; height:38px; display:flex; align-items:center; justify-content:center; border:1px solid; border-radius:8px; }
  .bar { height:5px; background:#eee; border-radius:5px; margin:10px 0 0; overflow:hidden; }
  .bar i { display:block; height:100%; border-radius:5px; }
  .find { list-style:none; margin:10px 0 0; padding:0; }
  .find li { margin:5px 0; color:#3a3f3d; }

  /* Action plan */
  table { width:100%; border-collapse:collapse; }
  .plan td { border-bottom:1px solid #eee; padding:9px 4px; vertical-align:top; break-inside:avoid; }
  .plan .n { font-family:Georgia,serif; color:#b7bbb8; width:26px; font-size:16px; }
  .pt { font-size:12px; color:#1A1A1A; }
  .pm { font-size:9.5px; color:#8a908d; margin-top:3px; }
  .pri { font-size:8px; letter-spacing:.5px; padding:2px 6px; border-radius:10px; font-weight:700; }
  .pri.high { background:#f6ded9; color:#B0402F; } .pri.medium { background:#f3ebd6; color:#8a6d1e; } .pri.low { background:#eee; color:#777; }

  /* Editorial / notes / discovery / shots */
  .edit { background:#f4f8f6; border:1px solid #dceae4; border-radius:9px; padding:15px 17px; break-inside:avoid; }
  .edit .ev { font-family:Georgia,serif; font-size:15px; color:#0A0A0A; margin:0 0 10px; line-height:1.4; }
  .edit ul { margin:8px 0 0; padding-left:16px; } .edit li { margin:4px 0; }
  .edit .rw { border-left:2px solid #2E8B6E; padding-left:10px; margin-top:10px; font-style:italic; color:#3a3f3d; }
  .crawl { color:#5b6360; font-size:10.5px; margin:10px 0 0; }
  .partial { margin:14px 0 0; padding:11px 14px; border-radius:8px; font-size:11px; background:#f7f1de; border:1px solid #e6d9b0; color:#6b571f; }
  .disc { font-size:11px; color:#3a3f3d; } .disc p { margin:6px 0; } .disc code { background:#f1efe9; padding:1px 5px; border-radius:4px; font-size:10px; } .disc .src { color:#8a908d; }
  .serp { border:1px solid #e6e6e3; border-radius:10px; overflow:hidden; break-inside:avoid; }
  .serp-bar { display:flex; justify-content:space-between; padding:9px 14px; border-bottom:1px solid #eee; font-size:12px; color:#202124; }
  .serp-row { display:flex; gap:10px; padding:9px 14px; border-bottom:1px solid #f3f3f3; break-inside:avoid; }
  .serp-row.you { background:#f5fbf8; } .serp-row:last-child { border-bottom:0; }
  .serp-pos { font-family:Georgia,serif; color:#9aa0a6; width:16px; text-align:right; font-size:12px; }
  .serp-url { font-size:10px; color:#202124; display:flex; gap:7px; align-items:center; flex-wrap:wrap; }
  .serp-tag { font-size:8px; font-weight:700; padding:1px 6px; border-radius:10px; }
  .serp-title { color:#1a0dab; font-size:12.5px; margin:1px 0 2px; }
  .serp-snip { color:#4d5156; font-size:10px; line-height:1.45; }
  .serp-hi { margin-top:10px; } .serp-hi p { margin:4px 0; font-size:11px; padding-left:14px; position:relative; }
  .serp-hi p::before { content:''; position:absolute; left:0; top:5px; width:7px; height:7px; border-radius:50%; }
  .serp-hi .hi-good::before { background:#2E8B6E; } .serp-hi .hi-warn::before { background:#B8912F; } .serp-hi .hi-bad::before { background:#C7594B; }
  .serp-hi .hi-good { color:#1f5f49; } .serp-hi .hi-warn { color:#6b571f; } .serp-hi .hi-bad { color:#8a2f22; }
  .shots { display:flex; gap:14px; align-items:flex-start; break-inside:avoid; }
  .shots figure { margin:0; } .shots figure img { border:1px solid #e6e6e3; border-radius:7px; width:340px; max-width:100%; display:block; }
  .shots figure.m img { width:150px; border-radius:12px; }
  .shots figcaption { color:#8a908d; font-size:9.5px; margin-top:5px; }
  .mobile { margin:12px 0 0; padding:11px 14px; border-radius:8px; font-size:11px; color:#3a3f3d; background:#f4f8f6; border:1px solid #dceae4; break-inside:avoid; }
  .mobile.mob-unreadable { background:#f6ded9; border-color:#eec7bf; color:#7a2c1f; }
  .mobile.mob-suboptimal { background:#f3ebd6; border-color:#e6d9b0; }

  .pagefoot { margin-top:26px; }
  .pagefoot .band { padding-top:10px; padding-bottom:10px; display:flex; justify-content:space-between; font-size:9.5px; color:rgba(255,255,255,.75); }
</style></head><body>

<section class="cover">
  <div class="band band-teal cover-top">${logoLockup('onTeal')}<span class="tool">SiteEval Report</span></div>
  <div class="cover-mid">
    <div class="eyebrow">Marketing Potential Evaluation</div>
    <h1>Marketing scorecard<br>&amp; action plan</h1>
    <div class="host">${esc(r.meta.host)}</div>
  </div>
  <div class="band band-black cover-score">
    <div class="val">${ring(r.overall.score, r.overall.grade)}<div class="g"><b style="color:${oCol}">${r.overall.grade}</b><span>${r.overall.score}/100</span></div></div>
    <div class="verdict"><div class="vb">${esc(r.overall.band)}</div><p>${esc(r.overall.headline)}</p></div>
  </div>
  <div class="cover-foot"><span>Prepared ${esc(dateStr)}</span><span>GBX Professional Services — Sharper operations. Stronger commercial outcomes.</span></div>
</section>

${shots ? `${sectionBand('How it looks', 'Desktop & mobile', 'teal')}${shots}${mobileBlock}` : ''}

${r.meta.partialAnalysis ? `<div class="partial"><b>Note:</b> this site renders its content with JavaScript and could not be fully rendered for this report, so the findings below are based on the initial HTML and may understate the site.</div>` : ''}

${sectionBand('Scorecard', 'Five marketing dimensions', 'teal')}
<div class="cats">${cats}</div>
${crawlBlock}

${discBlock}

${serpBlock}

${editorial ? `${sectionBand('Editorial read', "Strategist's verdict", 'teal')}${editorial}` : ''}

${sectionBand('Do this next', 'Prioritised action plan', 'black')}
<table class="plan">${plan}</table>

<div class="pagefoot"><div class="band band-black"><span>${esc(r.meta.url)}</span><span>gbxps.com · SiteEval</span></div></div>
</body></html>`;
}
