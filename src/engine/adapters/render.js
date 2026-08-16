import { launchBrowser } from '../../browser.js';

const NAV_TIMEOUT = 15000;
const DESKTOP = { width: 1280, height: 720 }; // 16:9
const MOBILE = { width: 390, height: 844 }; // iPhone-ish

/**
 * Render the site at desktop (16:9) and mobile viewports.
 * Returns screenshots (JPEG data URIs) plus a mobile-readability verdict, or
 * null if no headless browser is available. Never throws.
 */
export async function renderViews(url) {
  const browser = await launchBrowser();
  if (!browser) return null;

  try {
    const desktop = await shoot(browser, url, DESKTOP, false);
    const mobileCtx = await browser.newContext({
      viewport: MOBILE,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    });
    const mobile = await shootContext(mobileCtx, url, MOBILE);
    await mobileCtx.close().catch(() => {});

    return {
      desktop: desktop.shot ? { shot: desktop.shot, ...DESKTOP } : null,
      mobile: mobile.shot ? { shot: mobile.shot, ...MOBILE } : null,
      readability: mobile.readability || { verdict: 'unknown', issues: ['Could not render mobile view.'] },
    };
  } catch {
    return null;
  } finally {
    await browser.close().catch(() => {});
  }
}

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function shoot(browser, url, viewport, isMobile) {
  // Use a real desktop UA — a HeadlessChrome UA gets blocked by many WAFs.
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile, userAgent: DESKTOP_UA });
  const out = await shootContext(ctx, url, viewport);
  await ctx.close().catch(() => {});
  return out;
}

async function shootContext(ctx, url, viewport) {
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);

  // Navigate with one retry — transient resets shouldn't leave us on an error page.
  let ok = false;
  for (let attempt = 0; attempt < 2 && !ok; attempt++) {
    try {
      if (attempt) await page.waitForTimeout(600);
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
      ok = !!resp && resp.status() < 400 && !page.url().startsWith('chrome-error://');
    } catch {
      ok = false;
    }
  }

  // If we never got a real page (blocked, reset, DNS), don't screenshot the
  // browser's error page or measure it — report the view as unavailable.
  if (!ok || page.url().startsWith('chrome-error://')) {
    return { shot: null, readability: null, failed: true };
  }

  await page.waitForTimeout(1200); // let late layout/fonts settle

  let shot = null;
  for (let attempt = 0; attempt < 2 && !shot; attempt++) {
    try {
      if (attempt) await page.waitForTimeout(800); // brief settle, then retry once
      // Default (no fullPage/clip) captures exactly the viewport, padding short pages.
      const buf = await page.screenshot({ type: 'jpeg', quality: 55, timeout: 8000 });
      shot = 'data:image/jpeg;base64,' + buf.toString('base64');
    } catch {
      /* retry once, then give up */
    }
  }

  let readability = null;
  try {
    readability = assess(await page.evaluate(measureInPage), viewport);
  } catch {
    /* no metrics */
  }

  return { shot, readability };
}

/* Runs inside the page (mobile context). Must be self-contained. */
function measureInPage() {
  const de = document.documentElement;
  const vw = window.innerWidth || de.clientWidth;
  const docWidth = Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0);

  const bodyFont = parseFloat(getComputedStyle(document.body || de).fontSize) || 16;
  const vpEl = document.querySelector('meta[name="viewport"]');
  const hasViewportMeta = !!vpEl;
  const viewportContent = (vpEl && vpEl.getAttribute('content')) || '';
  // Zoom disabled is a classic "poorly configured" mobile anti-pattern.
  const zoomDisabled = /user-scalable\s*=\s*(no|0)/i.test(viewportContent) || /maximum-scale\s*=\s*1(\.0+)?\b/i.test(viewportContent);

  // Sample visible text elements for small-font detection (two tiers).
  let tiny = 0, small = 0, sampled = 0;
  const nodes = document.querySelectorAll('p,li,span,a,td,div,h1,h2,h3,h4,button,label');
  for (let i = 0; i < nodes.length && sampled < 500; i++) {
    const el = nodes[i];
    const txt = (el.textContent || '').trim();
    if (!txt || txt.length < 2) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    sampled++;
    const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
    if (fs < 12) tiny++;
    else if (fs < 14) small++; // borderline — legible but not comfortable
  }

  // Tap-target check: interactive elements that are too small for a finger (<40px).
  let tapTotal = 0, tapSmall = 0;
  const inter = document.querySelectorAll('a,button,input,select,[role="button"],[onclick]');
  for (let i = 0; i < inter.length && tapTotal < 400; i++) {
    const el = inter[i];
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.top > 2000) continue; // only judge what's near the top
    tapTotal++;
    if (Math.min(r.width, r.height) < 40) tapSmall++;
  }

  // Does the page ship any responsive breakpoints at all? (same-origin sheets only)
  let mediaQueries = 0, readableSheets = 0;
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules; // throws for cross-origin
      readableSheets++;
      for (const rule of Array.from(rules)) {
        if (rule.type === CSSRule.MEDIA_RULE && /max-width|min-width/i.test(rule.conditionText || rule.media?.mediaText || '')) mediaQueries++;
      }
    } catch { /* cross-origin sheet — can't inspect */ }
  }

  // Elements that push beyond the viewport (cause horizontal scroll).
  let widestOverflow = 0;
  const all = document.body ? document.body.querySelectorAll('*') : [];
  for (let i = 0; i < all.length && i < 2500; i++) {
    const r = all[i].getBoundingClientRect();
    if (r.right > vw + 2) widestOverflow = Math.max(widestOverflow, r.right - vw);
  }

  return {
    vw,
    docWidth,
    bodyFont,
    hasViewportMeta,
    zoomDisabled,
    tinyPct: sampled ? Math.round((tiny / sampled) * 100) : 0,
    smallPct: sampled ? Math.round((small / sampled) * 100) : 0,
    tapTotal,
    tapSmallPct: tapTotal ? Math.round((tapSmall / tapTotal) * 100) : 0,
    mediaQueries,
    readableSheets,
    widestOverflow: Math.round(widestOverflow),
  };
}

/*
 * Turns raw metrics into a plain-language verdict across three tiers:
 *   ok           — renders well on mobile
 *   suboptimal   — works, but poorly configured / looks awful; an easy optimise
 *   unreadable   — effectively broken on a phone
 */
function assess(m, viewport) {
  const vw = m.vw || viewport.width;
  const overflowPx = Math.max(0, Math.round((m.docWidth || vw) - vw));
  const overflowPct = Math.round((overflowPx / vw) * 100);
  const hasHorizontalScroll = overflowPx > 8;

  // Genuine layout / legibility problems — these drive the verdict.
  const problems = [];
  if (!m.hasViewportMeta) problems.push('No mobile viewport tag — the desktop layout is squeezed onto the phone screen.');
  if (hasHorizontalScroll) problems.push(`Page is ${overflowPx}px wider than the screen (${overflowPct}% overflow) — users must pinch and scroll sideways.`);
  if (m.bodyFont && m.bodyFont < 12) problems.push(`Base text is only ${Math.round(m.bodyFont)}px — too small to read comfortably on mobile.`);
  if (m.tinyPct >= 25) problems.push(`${m.tinyPct}% of the text is under 12px.`);
  if (m.smallPct >= 55) problems.push(`${m.smallPct}% of text sits at 12–13px — legible but cramped; 16px reads better on mobile.`);
  if (m.hasViewportMeta && m.readableSheets > 0 && m.mediaQueries === 0)
    problems.push('No responsive breakpoints — the mobile view is essentially the desktop layout scaled down, not designed for the screen.');

  // Soft advisories — worth mentioning, but not enough on their own to fail a site.
  const notes = [];
  if (m.zoomDisabled) notes.push('Pinch-zoom is disabled (user-scalable=no) — a poor, inaccessible setting.');
  if (m.tapSmallPct >= 50 && m.tapTotal >= 6) notes.push(`${m.tapSmallPct}% of buttons/links are under a comfortable 40px tap target.`);
  if (m.smallPct >= 35 && m.smallPct < 55) notes.push(`Some text sits at 12–13px — a touch small for mobile.`);
  if (m.hasViewportMeta && overflowPx > 0 && overflowPx <= 8) notes.push('A stray element pokes slightly past the screen edge.');

  // Verdict — severe = broken; a real layout problem = poorly optimised; else ok.
  const severeOverflow = overflowPct >= 20 || overflowPx >= 120;
  const severe = !m.hasViewportMeta || severeOverflow || (m.bodyFont && m.bodyFont < 10);
  const verdict = severe ? 'unreadable' : problems.length ? 'suboptimal' : 'ok';

  // Problems first (they explain the verdict), then advisory notes.
  const issues = problems.concat(notes);

  return {
    verdict,
    hasHorizontalScroll,
    overflowPx,
    overflowPct,
    bodyFontPx: Math.round(m.bodyFont || 0),
    tinyTextPct: m.tinyPct,
    smallTextPct: m.smallPct,
    tapSmallPct: m.tapSmallPct,
    zoomDisabled: m.zoomDisabled,
    responsive: m.mediaQueries > 0,
    hasViewportMeta: m.hasViewportMeta,
    issues,
  };
}
