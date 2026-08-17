import { gunzipSync } from 'node:zlib';

const UA = 'Mozilla/5.0 (compatible; GBX-SiteEval/0.1; +https://gbxps.com)';
const MAX_SITEMAP_BYTES = 5_000_000; // don't parse more than ~5 MB per sitemap
const MAX_URLS = 2000; // cap total URLs collected
const MAX_LOCS_PER_FILE = 5000; // cap matches scanned per file
const MAX_CHILD_FETCHES = 12; // cap child-sitemap fetches

/*
 * Discovery: find pages that exist / are indexable but aren't linked from the
 * homepage (orphan pages via sitemap.xml + robots.txt), reveal paths the site
 * hides from crawlers, and collect social profiles (on-site + search-derived).
 */

const SOCIAL = [
  { platform: 'LinkedIn', re: /(^|\.)linkedin\.com$/i },
  { platform: 'Instagram', re: /(^|\.)instagram\.com$/i },
  { platform: 'Facebook', re: /(^|\.)facebook\.com$/i },
  { platform: 'X (Twitter)', re: /(^|\.)(twitter|x)\.com$/i },
  { platform: 'YouTube', re: /(^|\.)(youtube\.com|youtu\.be)$/i },
  { platform: 'TikTok', re: /(^|\.)tiktok\.com$/i },
  { platform: 'Pinterest', re: /(^|\.)pinterest\.[a-z.]+$/i },
  { platform: 'Threads', re: /(^|\.)threads\.net$/i },
];
// Share/intent widgets that aren't real profiles.
const SOCIAL_JUNK = /\/(sharer|share|intent|dialog|plugins|widgets)\b|[?&](u|url|text)=/i;

const NOTABLE_DISALLOW =
  /(admin|login|signin|staging|dev\b|test\b|old\b|backup|private|portal|account|checkout|cart|cgi|tmp|beta|internal|secret|dashboard|uploads?)/i;
// Universal CMS paths that appear on nearly every site — not worth flagging.
const STANDARD_DISALLOW = /^\/(wp-admin|wp-includes|wp-content|wp-json|wp-login|xmlrpc|cgi-bin|administrator\/?$)/i;

export async function discover(site, facts, searchResult, crawl) {
  // Paths reachable by clicking from the homepage OR from any crawled page
  // (so blog posts linked from a /blog index aren't counted as orphans).
  const linkedPaths = new Set([normPath(safePath(site.url))]);
  for (const l of facts.links.internal) linkedPaths.add(normPath(safePath(l.resolved)));
  if (crawl && crawl.enabled) {
    for (const p of crawl.linkedPaths || []) linkedPaths.add(normPath(p));
    for (const p of crawl.pages || []) linkedPaths.add(normPath(p.path)); // crawled pages themselves
  }

  const robots = parseRobots(site.robots);
  const sm = await parseSitemaps(site, robots.sitemaps);

  // Orphan pages: in the sitemap, on this host, not linked from the homepage,
  // and an actual page (not a nested sitemap file).
  const orphans = dedupe(
    sm.urls.filter((u) => {
      try {
        const url = new URL(u);
        if (url.host !== site.host) return false;
        if (/\.(xml|xml\.gz|gz)$/i.test(url.pathname)) return false; // sitemap files, not pages
        return !linkedPaths.has(normPath(url.pathname));
      } catch {
        return false;
      }
    })
  );

  const hiddenPaths = robots.disallow
    .filter((p) => p && p !== '/' && !p.includes('*'))
    .slice(0, 20);
  const notableHidden = hiddenPaths.filter((p) => NOTABLE_DISALLOW.test(p) && !STANDARD_DISALLOW.test(p));

  // Social profiles linked on the site itself.
  const onSite = collectSocials(facts.links.external, site.url);

  // Search-derived pages & socials (only when the search adapter is configured).
  const search = searchResult && !searchResult.error
    ? {
        indexedPages: (searchResult.indexedPages || []).slice(0, 15),
        socialProfiles: (searchResult.socialProfiles || []),
      }
    : null;

  const socialProfiles = mergeSocials(onSite, search ? search.socialProfiles : []);

  // Pages in search results that aren't linked from the homepage either.
  const searchOnlyPages = search
    ? dedupe(search.indexedPages.filter((u) => {
        try { return !linkedPaths.has(normPath(new URL(u).pathname)); } catch { return false; }
      }))
    : [];

  return {
    sitemap: {
      found: sm.found,
      urlCount: sm.urls.length,
      childSitemaps: sm.children,
    },
    unlinkedPages: orphans.slice(0, 30),
    unlinkedCount: orphans.length,
    hiddenPaths,
    notableHidden,
    robotsSitemaps: robots.sitemaps,
    socialProfiles,
    search: search
      ? { indexedCount: search.indexedPages.length, searchOnlyPages: searchOnlyPages.slice(0, 15), searchOnlyCount: searchOnlyPages.length }
      : null,
    serp: searchResult && !searchResult.error ? (searchResult.serp || null) : null,
  };
}

/* ── sitemap parsing (handles sitemap-index files, gzip, size caps) ──── */
async function parseSitemaps(site, robotsSitemaps) {
  const roots = [];
  if (site.sitemap.found && site.sitemap.body) roots.push(site.sitemap.body);

  // Follow up to 3 extra sitemaps declared in robots.txt (incl. .xml.gz).
  for (const u of dedupe(robotsSitemaps).filter((u) => u && !/\/sitemap\.xml$/i.test(u)).slice(0, 3)) {
    const t = await getSitemapText(u);
    if (t) roots.push(t);
  }

  const budget = { fetches: MAX_CHILD_FETCHES, children: 0 };
  const urls = [];
  for (const body of roots) {
    const got = await collectFromSitemap(body, 2, budget); // depth 2 = nested index
    for (const u of got) {
      urls.push(u);
      if (urls.length >= MAX_URLS) break;
    }
    if (urls.length >= MAX_URLS) break;
  }
  return { found: site.sitemap.found, urls: dedupe(urls).slice(0, MAX_URLS), children: budget.children };
}

/** Recursively collect page URLs from a sitemap or sitemap-index body. */
async function collectFromSitemap(body, depth, budget) {
  const out = [];
  if (/<sitemapindex/i.test(body)) {
    if (depth <= 0) return out;
    for (const child of extractLocs(body).slice(0, MAX_CHILD_FETCHES)) {
      if (budget.fetches <= 0 || out.length >= MAX_URLS) break;
      budget.fetches--;
      budget.children++;
      const t = await getSitemapText(child);
      if (!t) continue;
      for (const u of await collectFromSitemap(t, depth - 1, budget)) {
        out.push(u);
        if (out.length >= MAX_URLS) break;
      }
    }
  } else {
    for (const u of extractLocs(body)) {
      out.push(u);
      if (out.length >= MAX_URLS) break;
    }
  }
  return out;
}

/** Fetch a sitemap, transparently gunzipping .gz, with a hard size cap. */
async function getSitemapText(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return '';
    const buf = Buffer.from(await res.arrayBuffer());
    const gzip = /\.gz(\?|$)/i.test(url) || (buf[0] === 0x1f && buf[1] === 0x8b);
    let text = '';
    if (gzip) {
      try { text = gunzipSync(buf).toString('utf8'); } catch { return ''; }
    } else {
      text = buf.toString('utf8');
    }
    return text.slice(0, MAX_SITEMAP_BYTES);
  } catch {
    return '';
  }
}

function extractLocs(xml) {
  const out = [];
  const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const u = decodeEntities(m[1].trim());
    if (/^https?:\/\//i.test(u)) out.push(u);
    if (out.length >= MAX_LOCS_PER_FILE) break; // never build an unbounded array
  }
  return out;
}

/* ── robots parsing ─────────────────────────────────────────────────── */
function parseRobots(robots) {
  const sitemaps = [];
  const disallow = [];
  if (robots && robots.found && robots.body) {
    for (const line of robots.body.split('\n')) {
      const s = line.match(/^\s*sitemap:\s*(\S+)/i);
      if (s) { sitemaps.push(s[1].trim()); continue; }
      const d = line.match(/^\s*disallow:\s*(\S+)/i);
      if (d) disallow.push(d[1].trim());
    }
  }
  return { sitemaps: dedupe(sitemaps), disallow: dedupe(disallow) };
}

/* ── social profile collection ──────────────────────────────────────── */
function collectSocials(externalLinks, baseUrl) {
  const byPlatform = new Map();
  for (const l of externalLinks) {
    const href = l.resolved || l.href;
    const p = classifySocial(href);
    if (p && !byPlatform.has(p)) byPlatform.set(p, cleanSocialUrl(href));
  }
  return [...byPlatform].map(([platform, url]) => ({ platform, url, source: 'website' }));
}

function classifySocial(href) {
  let host;
  try {
    const u = new URL(href);
    if (SOCIAL_JUNK.test(u.pathname + u.search)) return null;
    host = u.host;
    // A bare profile needs a path (facebook.com/name), not just the domain.
    if (!u.pathname || u.pathname === '/') return null;
  } catch {
    return null;
  }
  const hit = SOCIAL.find((s) => s.re.test(host));
  return hit ? hit.platform : null;
}

function cleanSocialUrl(href) {
  try {
    const u = new URL(href);
    return (u.origin + u.pathname).replace(/\/$/, '');
  } catch {
    return href;
  }
}

function mergeSocials(onSite, fromSearch = []) {
  const map = new Map();
  for (const s of onSite) map.set(s.platform, s);
  for (const s of fromSearch || []) {
    if (!map.has(s.platform)) map.set(s.platform, { ...s, source: 'search' });
  }
  return [...map.values()];
}

/* ── helpers ────────────────────────────────────────────────────────── */
function normPath(p) {
  return (p || '/').replace(/\/+$/, '') || '/';
}
function safePath(u) {
  try { return new URL(u).pathname; } catch { return '/'; }
}
function dedupe(arr) {
  return [...new Set(arr)];
}
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
