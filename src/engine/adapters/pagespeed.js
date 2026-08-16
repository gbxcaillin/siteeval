/**
 * Optional adapter: Google PageSpeed Insights (real Lighthouse + field data).
 * Returns null if PAGESPEED_API_KEY is not set.
 */
export async function pageSpeed(url) {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) return null;

  const endpoint =
    'https://www.googleapis.com/pagespeedonline/v5/runPagespeed' +
    `?url=${encodeURIComponent(url)}` +
    '&strategy=mobile&category=performance&category=seo&category=best-practices' +
    `&key=${key}`;

  try {
    const res = await fetch(endpoint);
    if (!res.ok) return { error: `PageSpeed API ${res.status}` };
    const data = await res.json();
    const lh = data.lighthouseResult || {};
    const cats = lh.categories || {};
    const audits = lh.audits || {};
    const metric = (id) => audits[id]?.displayValue || null;

    return {
      performanceScore: cats.performance ? Math.round(cats.performance.score * 100) : null,
      seoScore: cats.seo ? Math.round(cats.seo.score * 100) : null,
      bestPracticesScore: cats['best-practices'] ? Math.round(cats['best-practices'].score * 100) : null,
      lcp: metric('largest-contentful-paint'),
      cls: metric('cumulative-layout-shift'),
      tbt: metric('total-blocking-time'),
      speedIndex: metric('speed-index'),
    };
  } catch (err) {
    return { error: err.message };
  }
}
