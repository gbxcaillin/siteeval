import { buildResult } from '../grade.js';

/** Brand & online presence — analytics maturity, social reach, shareability. */
export function checkPresence(site, f, ext = {}) {
  const d = [];
  const credits = [];

  // Analytics / measurement maturity
  const measuring = f.tech.ga4 || f.tech.gtm || f.tech.hubspot;
  if (!measuring) {
    d.push({ points: 12, severity: 'bad', finding: 'No analytics detected — the business is marketing blind, with no way to measure what works.', rec: 'Install GA4 (via Google Tag Manager) so every channel and conversion is measurable.' });
  } else {
    credits.push({ finding: 'Web analytics is installed — activity is being measured.' });
  }

  // Retargeting / paid pixels
  const pixels = [f.tech.metaPixel && 'Meta', f.tech.linkedInInsight && 'LinkedIn'].filter(Boolean);
  if (pixels.length === 0) {
    d.push({ points: 5, severity: 'warn', finding: 'No advertising pixels (Meta/LinkedIn) — cannot retarget visitors or build paid audiences.', rec: 'Add the relevant ad pixels to unlock retargeting even before running campaigns.' });
  } else {
    credits.push({ finding: `Ad pixels present: ${pixels.join(', ')}.` });
  }

  // Social profiles
  const activeSocials = Object.entries(f.social).filter(([, v]) => v).map(([k]) => k);
  if (activeSocials.length === 0) {
    d.push({ points: 8, severity: 'warn', finding: 'No social profiles linked — no visible presence beyond the website.', rec: 'Link active LinkedIn/Instagram profiles; for B2B, LinkedIn is essential.' });
  } else if (activeSocials.length < 2) {
    d.push({ points: 3, severity: 'warn', finding: `Only one social channel linked (${activeSocials[0]}).`, rec: 'Broaden presence to the 2–3 channels where the audience actually is.' });
  } else {
    credits.push({ finding: `Linked social channels: ${activeSocials.join(', ')}.` });
  }

  // Open Graph / shareability
  if (!f.og.title || !f.og.image) {
    d.push({ points: 6, severity: 'warn', finding: 'Incomplete Open Graph tags — links shared on social/LinkedIn render as bland, low-click previews.', rec: 'Add og:title, og:description and a 1200×630 og:image for rich link previews.' });
  } else {
    credits.push({ finding: 'Open Graph tags set — links preview richly when shared.' });
  }
  if (!f.twitterCard) {
    d.push({ points: 2, severity: 'warn', finding: 'No Twitter/X card metadata.', rec: 'Add twitter:card summary_large_image metadata.' });
  }

  // Content freshness / blog signal
  const hasContentHub = f.links.internal.some((l) => /\/(blog|insights|resources|news|articles|guides)(\/|$)/i.test(l.resolved));
  if (!hasContentHub) {
    d.push({ points: 6, severity: 'warn', finding: 'No blog / insights / resources section — nothing to fuel organic search, email or social.', rec: 'Publish an insights hub to compound SEO and give sales something to share.' });
  } else {
    credits.push({ finding: 'Content hub (blog/insights/resources) present.' });
  }

  // Optional: real search-visibility signal from the search adapter
  if (ext.search && typeof ext.search.brandResults === 'number') {
    if (ext.search.brandResults < 3) {
      d.push({ points: 6, severity: 'warn', finding: `Thin search footprint — only ${ext.search.brandResults} notable results for the brand name.`, rec: 'Build citations, directory listings and PR so the brand owns its own search results.' });
    } else {
      credits.push({ finding: `Healthy brand search footprint (${ext.search.brandResults}+ results).` });
    }
  }

  return buildResult({
    id: 'presence',
    label: 'Brand & Online Presence',
    weight: 20,
    deductions: d,
    credits,
    metrics: {
      analytics: measuring,
      pixels,
      socials: activeSocials,
      openGraph: !!(f.og.title && f.og.image),
      contentHub: hasContentHub,
      platform: Object.entries(f.tech).filter(([k, v]) => v && ['wordpress', 'shopify', 'wix', 'squarespace'].includes(k)).map(([k]) => k)[0] || 'custom/unknown',
    },
  });
}
