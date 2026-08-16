import { buildResult } from '../grade.js';

/** Trim a full URL to a readable path for findings. */
function shortPath(u) {
  try { return new URL(u).pathname || u; } catch { return u; }
}

/**
 * Does robots.txt actually block SEARCH engines from the whole site?
 * User-agent-aware: a `Disallow: /` under GPTBot / CCBot / Google-Extended etc.
 * (AI-training bots) does NOT block Google/Bing search. Only a root Disallow for
 * `*` or a named search crawler — with no `Allow: /` override — counts.
 */
function robotsBlocksSearch(body) {
  if (!body) return false;
  const searchAgents = new Set(['*', 'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider', 'yandex']);
  const groups = [];
  let cur = null;
  for (const raw of body.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^(user-agent|disallow|allow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const val = m[2].trim();
    if (field === 'user-agent') {
      if (cur && cur.rules.length > 0) { groups.push(cur); cur = null; }
      if (!cur) cur = { agents: [], rules: [] };
      cur.agents.push(val.toLowerCase());
    } else {
      if (!cur) cur = { agents: ['*'], rules: [] };
      cur.rules.push({ type: field, path: val });
    }
  }
  if (cur) groups.push(cur);

  const rules = groups
    .filter((g) => g.agents.some((a) => searchAgents.has(a)))
    .flatMap((g) => g.rules);
  if (!rules.length) return false;
  const disallowRoot = rules.some((r) => r.type === 'disallow' && r.path === '/');
  const allowRoot = rules.some((r) => r.type === 'allow' && r.path === '/');
  return disallowRoot && !allowRoot;
}

/** Search discoverability: can Google find, index and understand this page? */
export function checkSeo(site, f, ctx = {}) {
  const d = [];
  const credits = [];

  // Title tag
  const titleLen = f.title.length;
  if (!f.title) {
    d.push({ points: 18, severity: 'bad', finding: 'No <title> tag — the single most important on-page SEO signal is missing.', rec: 'Add a descriptive 50–60 character title tag with the primary keyword and brand name.' });
  } else if (titleLen < 15 || titleLen > 65) {
    d.push({ points: 7, severity: 'warn', finding: `Title tag is ${titleLen} characters (ideal is 50–60).`, rec: titleLen > 65 ? 'Shorten the title so it does not truncate in search results.' : 'Lengthen the title to describe the offer and include the brand.' });
  } else {
    credits.push({ finding: `Title tag is well-sized (${titleLen} chars).` });
  }

  // Meta description
  const mdLen = f.metaDescription.length;
  if (!f.metaDescription) {
    d.push({ points: 12, severity: 'bad', finding: 'No meta description — Google will auto-generate the search snippet, losing your pitch and click-through.', rec: 'Write a 140–160 character meta description that sells the click, not just describes the page.' });
  } else if (mdLen < 70 || mdLen > 165) {
    d.push({ points: 5, severity: 'warn', finding: `Meta description is ${mdLen} characters (ideal is 140–160).`, rec: 'Tune the meta description length so the whole message shows in results.' });
  } else {
    credits.push({ finding: 'Meta description present and well-sized.' });
  }

  // H1
  const h1s = f.headings.h1 || [];
  if (h1s.length === 0) {
    d.push({ points: 12, severity: 'bad', finding: 'No H1 heading — the page has no clear topical anchor for search or screen readers.', rec: 'Add exactly one H1 that states what the business does in plain language.' });
  } else if (h1s.length > 1) {
    d.push({ points: 4, severity: 'warn', finding: `${h1s.length} H1 headings found — dilutes the page's primary topic.`, rec: 'Keep a single H1; demote the rest to H2.' });
  } else {
    credits.push({ finding: 'Single, clear H1 heading present.' });
  }

  // Heading hierarchy depth
  const usesSubheads = (f.headings.h2 || []).length > 0;
  if (!usesSubheads && f.wordCount > 250) {
    d.push({ points: 5, severity: 'warn', finding: 'Content has no H2 subheadings — long copy with no structure is harder to scan and rank.', rec: 'Break the page into scannable sections with H2 subheadings.' });
  }

  // Indexability
  if (/noindex/i.test(f.robotsMeta)) {
    d.push({ points: 25, severity: 'bad', finding: 'Page is set to NOINDEX — it is actively hidden from search engines.', rec: 'Remove the noindex directive unless this page is deliberately private.' });
  }
  if (site.robots.found && robotsBlocksSearch(site.robots.body)) {
    d.push({ points: 15, severity: 'bad', finding: 'robots.txt blocks search engines from the whole site — Google and Bing are told not to crawl any page.', rec: 'Remove the site-wide Disallow for search crawlers (User-agent: *) so public pages can be indexed.' });
  }

  // Canonical
  if (!f.canonical) {
    d.push({ points: 3, severity: 'warn', finding: 'No canonical URL — risks duplicate-content dilution across www/non-www or query variants.', rec: 'Add a self-referencing canonical link tag.' });
  }

  // Sitemap & robots
  if (!site.sitemap.found) {
    d.push({ points: 4, severity: 'warn', finding: 'No sitemap.xml found — slows discovery of deeper pages.', rec: 'Publish a sitemap.xml and reference it in robots.txt.' });
  } else {
    credits.push({ finding: 'sitemap.xml present.' });
  }
  if (!site.robots.found) {
    d.push({ points: 2, severity: 'warn', finding: 'No robots.txt found.', rec: 'Add a robots.txt (even a permissive one) and link the sitemap.' });
  }

  // Structured data
  if (f.jsonLdTypes.length === 0) {
    d.push({ points: 6, severity: 'warn', finding: 'No structured data (JSON-LD) — misses rich results like ratings, breadcrumbs and org info.', rec: 'Add Organization and, where relevant, Service/FAQ JSON-LD schema.' });
  } else {
    credits.push({ finding: `Structured data present: ${f.jsonLdTypes.slice(0, 5).join(', ')}.` });
  }

  // lang + thin content
  if (!f.lang) {
    d.push({ points: 2, severity: 'warn', finding: 'No lang attribute on <html>.', rec: 'Set <html lang="en"> (or the correct locale).' });
  }
  if (f.wordCount < 120) {
    d.push({ points: 8, severity: 'warn', finding: `Very thin homepage copy (${f.wordCount} words) — little for search engines to rank on.`, rec: 'Expand the homepage to clearly explain the offer, audience and proof (aim 300+ words).' });
  }

  // Site-wide hygiene from the crawl (only when crawl ran).
  const crawl = ctx.crawl;
  if (crawl && crawl.enabled && crawl.seo.pagesConsidered > 1) {
    const s = crawl.seo;
    if (s.missingMetas > 0) {
      d.push({ points: Math.min(8, 2 + s.missingMetas * 2), severity: 'warn', finding: `${s.missingMetas} of ${s.pagesConsidered} crawled pages have no meta description.`, rec: 'Give every key page a unique, benefit-led meta description.' });
    }
    if (s.duplicateTitles > 0) {
      d.push({ points: Math.min(8, 3 + s.duplicateTitles * 2), severity: 'warn', finding: `${s.duplicateTitles} duplicate page title(s) across the site — pages compete with each other in search.`, rec: 'Make each page title unique to its topic.' });
    }
    if (s.thinPages.length > 0) {
      d.push({ points: Math.min(6, s.thinPages.length * 2), severity: 'warn', finding: `Thin content on: ${s.thinPages.slice(0, 4).join(', ')}.`, rec: 'Add substantive copy to thin pages so they can rank and convert.' });
    }
    if (s.missingMetas === 0 && s.duplicateTitles === 0) {
      credits.push({ finding: `Consistent titles & metas across ${s.pagesConsidered} pages.` });
    }
  }

  // Discovery: pages that are indexable but not linked from the homepage.
  const disc = ctx.discovery;
  if (disc) {
    if (disc.unlinkedCount > 0) {
      d.push({ points: Math.min(7, 2 + disc.unlinkedCount), severity: 'warn', finding: `${disc.unlinkedCount} page(s) are in the sitemap but not linked from the homepage — orphan pages users can't find by clicking${disc.unlinkedPages[0] ? ` (e.g. ${shortPath(disc.unlinkedPages[0])})` : ''}.`, rec: 'Review orphan pages: link the ones that matter into the navigation, and noindex or remove the rest.' });
    }
    if (disc.search && disc.search.searchOnlyCount > 0) {
      d.push({ points: 3, severity: 'warn', finding: `${disc.search.searchOnlyCount} page(s) show up in search results but aren't linked from the homepage.`, rec: 'Make sure search-visible pages are either linked and on-brand, or removed if outdated.' });
    }
    if (disc.notableHidden.length > 0) {
      d.push({ points: 2, severity: 'warn', finding: `robots.txt hides paths that may reveal admin/staging areas: ${disc.notableHidden.slice(0, 4).join(', ')}.`, rec: 'Confirm sensitive areas are protected by auth, not just hidden from crawlers (robots.txt is public).' });
    }
    if (disc.sitemap.found && disc.sitemap.urlCount > 0 && disc.unlinkedCount === 0) {
      credits.push({ finding: `Sitemap lists ${disc.sitemap.urlCount} pages, all reachable from the site.` });
    }
  }

  return buildResult({
    id: 'seo',
    label: 'Search Discoverability (SEO)',
    weight: 22,
    deductions: d,
    credits,
    metrics: {
      titleLength: titleLen,
      metaDescriptionLength: mdLen,
      h1Count: h1s.length,
      wordCount: f.wordCount,
      structuredData: f.jsonLdTypes,
      hasSitemap: site.sitemap.found,
      hasRobots: site.robots.found,
    },
  });
}
