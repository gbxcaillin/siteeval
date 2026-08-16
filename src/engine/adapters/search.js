/**
 * Optional adapter: real online-presence signal via a web search API.
 * Providers: "serpapi" or "brave". Returns null if not configured.
 * Runs two queries: the brand name (presence + social profiles) and
 * `site:host` (pages the search engine has indexed).
 */
// Matched against the parsed HOST (anchored), never a substring of the URL,
// so mavex.com / webflex.com aren't mistaken for x.com.
const SOCIAL_HOSTS = [
  { platform: 'LinkedIn', re: /(^|\.)linkedin\.com$/i },
  { platform: 'Instagram', re: /(^|\.)instagram\.com$/i },
  { platform: 'Facebook', re: /(^|\.)facebook\.com$/i },
  { platform: 'X (Twitter)', re: /(^|\.)(twitter\.com|x\.com)$/i },
  { platform: 'YouTube', re: /(^|\.)(youtube\.com|youtu\.be)$/i },
  { platform: 'TikTok', re: /(^|\.)tiktok\.com$/i },
  { platform: 'Pinterest', re: /(^|\.)pinterest\.[a-z.]+$/i },
];

/** Parse a URL's host, lowercased; null if unparseable. */
function hostOf(u) {
  try { return new URL(u).host.toLowerCase(); } catch { return null; }
}
/** Is `host` the site's own domain (exact or a subdomain of it)? */
function sameSite(host, site) {
  return !!host && (host === site || host.endsWith('.' + site));
}

export async function searchPresence(brand, host) {
  const provider = (process.env.SEARCH_PROVIDER || '').toLowerCase();
  const key = process.env.SEARCH_API_KEY;
  if (!provider || !key) return null;

  try {
    const [brandLinks, siteLinks] = await Promise.all([
      runQuery(provider, key, brand),
      runQuery(provider, key, `site:${host}`),
    ]);
    if (brandLinks.error) return { error: brandLinks.error };

    const site = String(host).toLowerCase();
    const clean = brandLinks.links.filter(Boolean);
    const ownDomain = clean.filter((l) => sameSite(hostOf(l), site)).length;

    // Social profiles that surface when you search the brand (matched by host).
    const socialProfiles = [];
    const seen = new Set();
    for (const link of clean) {
      const h = hostOf(link);
      const hit = h && SOCIAL_HOSTS.find((s) => s.re.test(h));
      if (hit && !seen.has(hit.platform)) { seen.add(hit.platform); socialProfiles.push({ platform: hit.platform, url: link, source: 'search' }); }
    }

    const indexedPages = (siteLinks.links || []).filter((l) => sameSite(hostOf(l), site));

    return {
      brandResults: clean.length,
      ownDomainResults: ownDomain,
      thirdPartyResults: clean.length - ownDomain,
      topLinks: clean.slice(0, 5),
      socialProfiles,
      indexedPages: [...new Set(indexedPages)],
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function runQuery(provider, key, q) {
  if (provider === 'serpapi') {
    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&num=15&api_key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return { error: `SerpApi ${res.status}`, links: [] };
    const data = await res.json();
    return { links: (data.organic_results || []).map((r) => r.link) };
  }
  if (provider === 'brave') {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=15`;
    const res = await fetch(url, { headers: { 'X-Subscription-Token': key, Accept: 'application/json' } });
    if (!res.ok) return { error: `Brave ${res.status}`, links: [] };
    const data = await res.json();
    return { links: (data.web?.results || []).map((r) => r.url) };
  }
  return { error: `Unknown SEARCH_PROVIDER "${provider}"`, links: [] };
}
