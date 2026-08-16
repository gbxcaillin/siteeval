/**
 * Turn a raw site snapshot into a flat "facts" object the checks read from.
 * Keeps DOM traversal in one place so individual checks stay declarative.
 */
export function extractFacts(site) {
  const $ = site.$;
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').filter(Boolean) : [];

  const metaByName = (name) =>
    $(`meta[name="${name}"]`).attr('content')?.trim() || '';
  const metaByProp = (prop) =>
    $(`meta[property="${prop}"]`).attr('content')?.trim() || '';

  const headings = {};
  for (let i = 1; i <= 6; i++) {
    headings['h' + i] = $('h' + i)
      .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean);
  }

  const links = $('a[href]')
    .map((_, el) => ({
      href: $(el).attr('href') || '',
      text: $(el).text().replace(/\s+/g, ' ').trim(),
    }))
    .get();

  const internal = [];
  const external = [];
  for (const l of links) {
    if (/^(mailto:|tel:|javascript:|#)/i.test(l.href)) continue;
    try {
      const u = new URL(l.href, site.url);
      (u.host === site.host ? internal : external).push({ ...l, resolved: u.href });
    } catch {
      /* ignore unparseable */
    }
  }

  const images = $('img')
    .map((_, el) => ({
      src: $(el).attr('src') || '',
      alt: $(el).attr('alt'),
      loading: $(el).attr('loading') || '',
    }))
    .get();

  // Structured data (JSON-LD) types present
  const jsonLdTypes = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).contents().text());
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of arr) {
        const t = node && node['@type'];
        if (Array.isArray(t)) jsonLdTypes.push(...t);
        else if (t) jsonLdTypes.push(t);
      }
    } catch {
      /* malformed json-ld */
    }
  });

  const bodyHtml = $.html().toLowerCase();
  const has = (re) => re.test(bodyHtml);

  // Contact / conversion signals
  const emails = [...new Set((site.html.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []))];
  const phones = $('a[href^="tel:"]').length;
  const forms = $('form').length;
  const hasNewsletter = has(/newsletter|subscribe|sign\s*up|mailing list/);
  const hasBooking =
    has(/calendly|hubspot|acuity|book\s*a\s*(call|demo|meeting)|schedule\s*a/) ||
    $('a,button').filter((_, el) =>
      /book|demo|get started|contact us|request|enquire|talk to/i.test($(el).text())
    ).length > 0;

  // CTA buttons — actionable, verby, above-ish the fold heuristic
  const ctas = $('a,button')
    .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter((t) => t && /\b(get|start|book|buy|try|request|contact|demo|call|sign|join|download|schedule|enquire|quote|learn more)\b/i.test(t));

  // Marketing / analytics tooling fingerprints
  const tech = {
    ga4: has(/gtag\('config'|googletagmanager\.com\/gtag|www\.google-analytics\.com/),
    gtm: has(/googletagmanager\.com\/gtm|dataLayer/),
    metaPixel: has(/connect\.facebook\.net|fbq\(/),
    linkedInInsight: has(/snap\.licdn\.com|_linkedin_partner_id/),
    hubspot: has(/js\.hs-scripts\.com|hubspot/),
    hotjar: has(/static\.hotjar\.com|hotjar/),
    wordpress: has(/wp-content|wp-includes/),
    shopify: has(/cdn\.shopify\.com|shopify/),
    wix: has(/static\.wixstatic\.com|wix\.com/),
    squarespace: has(/squarespace/),
  };

  // Social profile links — match on the link's HOST with anchored domains so
  // e.g. netflix.com / wix.com don't get mistaken for x.com. Only real linked
  // profiles count (not any mention of the string anywhere in the HTML).
  const socialHostPatterns = {
    linkedin: /(^|\.)linkedin\.com$/i,
    instagram: /(^|\.)instagram\.com$/i,
    facebook: /(^|\.)facebook\.com$/i,
    x: /(^|\.)(twitter\.com|x\.com)$/i,
    youtube: /(^|\.)(youtube\.com|youtu\.be)$/i,
    tiktok: /(^|\.)tiktok\.com$/i,
  };
  const social = { linkedin: false, instagram: false, facebook: false, x: false, youtube: false, tiktok: false };
  for (const l of external) {
    let host;
    try {
      host = new URL(l.resolved || l.href).host;
    } catch {
      continue;
    }
    for (const [k, re] of Object.entries(socialHostPatterns)) {
      if (re.test(host)) social[k] = true;
    }
  }

  return {
    title: $('title').first().text().trim(),
    metaDescription: metaByName('description'),
    canonical: $('link[rel="canonical"]').attr('href') || '',
    robotsMeta: metaByName('robots'),
    viewport: metaByName('viewport'),
    lang: $('html').attr('lang') || '',
    favicon: $('link[rel~="icon"]').attr('href') || '',
    og: {
      title: metaByProp('og:title'),
      description: metaByProp('og:description'),
      image: metaByProp('og:image'),
      type: metaByProp('og:type'),
    },
    twitterCard: metaByName('twitter:card'),
    headings,
    wordCount: words.length,
    text,
    links: { internal, external, all: links },
    images,
    jsonLdTypes: [...new Set(jsonLdTypes)],
    emails,
    phones,
    forms,
    hasNewsletter,
    hasBooking,
    ctas: [...new Set(ctas)],
    tech,
    social,
    scriptCount: $('script').length,
    stylesheetCount: $('link[rel="stylesheet"]').length,
    inlineStyleBytes: $('style')
      .map((_, el) => $(el).text().length)
      .get()
      .reduce((a, b) => a + b, 0),
  };
}
