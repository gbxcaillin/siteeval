import { fetchDoc } from './fetchSite.js';

/** Page types we care about, matched against URL path + link text. */
const PAGE_TYPES = [
  { key: 'about', re: /about|who-we-are|our-story|company/i, label: 'About' },
  { key: 'services', re: /services|solutions|what-we-do|products?|offer(ing)?s?|capabilities/i, label: 'Services' },
  { key: 'contact', re: /contact|get-in-touch|enquir|reach-us/i, label: 'Contact' },
  { key: 'pricing', re: /pricing|plans|packages|fees|rates/i, label: 'Pricing' },
  { key: 'blog', re: /blog|insights?|news|articles?|resources?|guides?/i, label: 'Blog / Insights' },
  { key: 'caseStudies', re: /case-stud|success-stor|portfolio|our-work|clients?/i, label: 'Case studies' },
  { key: 'team', re: /team|people|leadership|advisers?|advisors?|staff/i, label: 'Team' },
];

const MAX_PAGES = 6;

/**
 * Crawl a handful of high-value internal pages discovered from the homepage.
 * Returns aggregated, site-level signals the checks and report can use.
 */
export async function crawlSite(site, homeFacts) {
  const seen = new Set([stripHash(site.url)]);
  const picks = []; // { url, type, label }

  // Rank internal links by whether they match a known page type.
  for (const link of homeFacts.links.internal) {
    const u = stripHash(link.resolved);
    if (seen.has(u)) continue;
    if (!/^https?:/i.test(u)) continue;
    if (/\.(pdf|jpg|jpeg|png|gif|svg|zip|mp4|webp|doc|docx)(\?|$)/i.test(u)) continue;

    const hay = `${new URL(u).pathname} ${link.text}`;
    const match = PAGE_TYPES.find((t) => t.re.test(hay));
    if (match && !picks.some((p) => p.type === match.key)) {
      picks.push({ url: u, type: match.key, label: match.label });
      seen.add(u);
    }
    if (picks.length >= MAX_PAGES) break;
  }

  // Fetch the picked pages in parallel.
  const docs = await Promise.all(
    picks.map(async (p) => {
      const doc = await fetchDoc(p.url);
      return { ...p, doc };
    })
  );

  const pages = [];
  const found = {};
  for (const t of PAGE_TYPES) found[t.key] = false;

  // Internal link paths discovered ON the crawled pages — used so pages reachable
  // via a section index (e.g. blog posts under /blog) aren't mislabelled orphans.
  const linkedPaths = new Set();

  for (const { url, type, label, doc } of docs) {
    if (!doc.ok || !doc.$) continue;
    const $ = doc.$;
    found[type] = true;
    $('a[href]').each((_, el) => {
      try {
        const u = new URL($(el).attr('href'), url);
        if (u.host === site.host) linkedPaths.add((u.pathname.replace(/\/+$/, '') || '/'));
      } catch { /* ignore */ }
    });
    const title = $('title').first().text().trim();
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || '';
    const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
    const wordCount = ($('body').text().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)).length;
    pages.push({
      url,
      type,
      label,
      path: new URL(url).pathname,
      status: doc.status,
      title,
      metaDescription,
      h1,
      wordCount,
      forms: $('form').length,
    });
  }

  // Site-level SEO hygiene across crawled pages (+ homepage).
  const all = [
    { title: homeFacts.title, metaDescription: homeFacts.metaDescription, wordCount: homeFacts.wordCount, label: 'Homepage' },
    ...pages,
  ];
  const titles = all.map((p) => (p.title || '').trim().toLowerCase()).filter(Boolean);
  const dupTitleCount = titles.length - new Set(titles).size;

  return {
    enabled: true,
    pagesCrawled: pages.length,
    pages,
    found,
    linkedPaths: [...linkedPaths],
    seo: {
      missingTitles: all.filter((p) => !p.title).length,
      missingMetas: all.filter((p) => !p.metaDescription).length,
      duplicateTitles: dupTitleCount,
      thinPages: all.filter((p) => p.wordCount < 120).map((p) => p.label || p.path),
      pagesConsidered: all.length,
    },
  };
}

function stripHash(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    return url.href;
  } catch {
    return u;
  }
}
