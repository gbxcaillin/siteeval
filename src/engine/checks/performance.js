import { buildResult } from '../grade.js';

/** On-page performance & technical hygiene (heuristic; PageSpeed adapter can override). */
export function checkPerformance(site, f, ctx = {}) {
  const d = [];
  const credits = [];

  // HTTPS
  if (!site.isHttps) {
    d.push({ points: 20, severity: 'bad', finding: 'Site is not served over HTTPS — browsers flag it "Not secure" and it hurts ranking and trust.', rec: 'Install a TLS certificate and force HTTPS.' });
  } else {
    credits.push({ finding: 'Served securely over HTTPS.' });
    if (!site.httpProbe.redirectsToHttps) {
      d.push({ points: 3, severity: 'warn', finding: 'Plain http:// does not redirect to https:// — duplicate, insecure entry point.', rec: 'Add a 301 redirect from http to https.' });
    }
  }

  // Mobile viewport
  if (!f.viewport) {
    d.push({ points: 15, severity: 'bad', finding: 'No mobile viewport tag — the site will not render correctly on phones (most traffic).', rec: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' });
  } else {
    credits.push({ finding: 'Mobile viewport configured.' });
  }

  // Page weight
  const kb = Math.round(site.bytes / 1024);
  if (kb > 1500) {
    d.push({ points: 10, severity: 'warn', finding: `HTML document is heavy (${kb} KB) — slow first paint, especially on mobile.`, rec: 'Reduce page weight: defer non-critical scripts, compress markup, lazy-load below-the-fold content.' });
  } else if (kb > 700) {
    d.push({ points: 5, severity: 'warn', finding: `HTML document is somewhat large (${kb} KB).`, rec: 'Trim unused markup and inline assets.' });
  }

  // TTFB
  if (site.ttfbMs > 1200) {
    d.push({ points: 8, severity: 'warn', finding: `Slow server response (${site.ttfbMs} ms to first byte) — hosting or backend is a bottleneck.`, rec: 'Improve TTFB with caching/CDN or better hosting; aim under 600 ms.' });
  } else if (site.ttfbMs < 600) {
    credits.push({ finding: `Fast server response (${site.ttfbMs} ms TTFB).` });
  }

  // Script bloat
  if (f.scriptCount > 30) {
    d.push({ points: 6, severity: 'warn', finding: `${f.scriptCount} script tags — heavy JavaScript load slows interactivity.`, rec: 'Audit and remove unused scripts; defer or async the rest.' });
  }

  // Render-blocking stylesheets (rough)
  if (f.stylesheetCount > 8) {
    d.push({ points: 3, severity: 'warn', finding: `${f.stylesheetCount} stylesheets — each is a render-blocking request.`, rec: 'Combine and minify CSS; inline critical styles.' });
  }

  // Image alt / lazy-load hygiene
  const imgs = f.images.length;
  if (imgs > 0) {
    const noAlt = f.images.filter((i) => i.alt === undefined || i.alt === '').length;
    if (noAlt / imgs > 0.4) {
      d.push({ points: 5, severity: 'warn', finding: `${noAlt}/${imgs} images have no alt text — hurts accessibility and image SEO.`, rec: 'Add descriptive alt text to meaningful images.' });
    }
    const lazy = f.images.filter((i) => i.loading === 'lazy').length;
    if (imgs > 6 && lazy === 0) {
      d.push({ points: 3, severity: 'warn', finding: 'No images use lazy-loading despite several on the page.', rec: 'Add loading="lazy" to below-the-fold images.' });
    }
  }

  // Real mobile-readability verdict from the render adapter (when available).
  const mob = ctx.render && ctx.render.readability;
  if (mob && mob.verdict && mob.verdict !== 'unknown') {
    if (mob.verdict === 'unreadable') {
      d.push({ points: 18, severity: 'bad', priority: 'high', finding: `Effectively unreadable on mobile — ${mob.issues[0] || 'the layout breaks on a phone screen.'}`, rec: 'Rebuild the site responsively so it is legible on mobile — most visitors are on phones.' });
    } else if (mob.verdict === 'poor') {
      d.push({ points: 8, severity: 'warn', finding: `Poor mobile experience — ${mob.issues[0] || 'text or layout issues on small screens.'}`, rec: 'Fix mobile layout: remove horizontal scrolling and increase small text.' });
    } else {
      credits.push({ finding: 'Renders cleanly and legibly on mobile.' });
    }
  }

  return buildResult({
    id: 'performance',
    label: 'Performance & Technical Health',
    weight: 18,
    deductions: d,
    credits,
    metrics: {
      https: site.isHttps,
      viewport: !!f.viewport,
      htmlKB: kb,
      ttfbMs: site.ttfbMs,
      scripts: f.scriptCount,
      stylesheets: f.stylesheetCount,
      images: imgs,
    },
  });
}
