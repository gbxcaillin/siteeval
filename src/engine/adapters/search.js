/**
 * Optional adapter: real online-presence signal via a web search API.
 * Providers: "serpapi" or "brave". Returns null if not configured.
 * Runs two queries: the brand name (presence + social profiles) and
 * `site:host` (pages the search engine has indexed).
 */
const SOCIAL_HOSTS = [
  { platform: 'LinkedIn', re: /linkedin\.com/i },
  { platform: 'Instagram', re: /instagram\.com/i },
  { platform: 'Facebook', re: /facebook\.com/i },
  { platform: 'X (Twitter)', re: /(twitter|x)\.com/i },
  { platform: 'YouTube', re: /(youtube\.com|youtu\.be)/i },
  { platform: 'TikTok', re: /tiktok\.com/i },
  { platform: 'Pinterest', re: /pinterest\./i },
];

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

    const clean = brandLinks.links.filter(Boolean);
    const ownDomain = clean.filter((l) => l.includes(host)).length;

    // Social profiles that surface when you search the brand.
    const socialProfiles = [];
    const seen = new Set();
    for (const link of clean) {
      const hit = SOCIAL_HOSTS.find((s) => s.re.test(link));
      if (hit && !seen.has(hit.platform)) { seen.add(hit.platform); socialProfiles.push({ platform: hit.platform, url: link, source: 'search' }); }
    }

    const indexedPages = (siteLinks.links || []).filter((l) => l && l.includes(host));

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
