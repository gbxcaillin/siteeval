/**
 * Optional adapter: real online-presence signal via a web search API.
 * Providers: "serpapi" or "brave". Returns null if not configured.
 * Runs two queries: the brand name (presence, social profiles + a classified
 * SERP for the report) and `site:host` (pages the search engine has indexed).
 * Set SEARCH_ENDPOINT to point serpapi at a self-hosted/mock endpoint.
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

// Review / directory / listing sites — third-party results worth calling out.
const DIRECTORY_HOSTS = /(^|\.)(trustpilot\.com|yelp\.[a-z.]+|glassdoor\.[a-z.]+|productreview\.[a-z.]+|yellowpages\.[a-z.]+|truelocal\.[a-z.]+|whitepages\.[a-z.]+|bbb\.org|crunchbase\.com|indeed\.[a-z.]+|seek\.[a-z.]+|clutch\.co|g2\.com|tripadvisor\.[a-z.]+|maps\.google\.[a-z.]+|goo\.gl|wikipedia\.org)$/i;

function hostOf(u) {
  try { return new URL(u).host.toLowerCase(); } catch { return null; }
}
function sameSite(host, site) {
  return !!host && (host === site || host.endsWith('.' + site));
}
function displayUrl(u) {
  try {
    const url = new URL(u);
    const segs = url.pathname.split('/').filter(Boolean);
    return url.host.replace(/^www\./, '') + (segs.length ? ' › ' + segs.slice(0, 2).join(' › ') : '');
  } catch { return u; }
}

export async function searchPresence(brand, host) {
  const provider = (process.env.SEARCH_PROVIDER || '').toLowerCase();
  const key = process.env.SEARCH_API_KEY;
  if (!provider || !key) return null;

  try {
    const [brandRes, siteRes] = await Promise.all([
      runQuery(provider, key, brand),
      runQuery(provider, key, `site:${host}`),
    ]);
    if (brandRes.error) return { error: brandRes.error };

    const site = String(host).toLowerCase();
    const rows = brandRes.rows.filter((r) => r.link);
    const links = rows.map((r) => r.link);
    const ownDomain = links.filter((l) => sameSite(hostOf(l), site)).length;

    // Classify every organic result for the branded SERP view.
    const serpRows = rows.map((r, i) => {
      const h = hostOf(r.link);
      const social = h && SOCIAL_HOSTS.find((s) => s.re.test(h));
      let kind = 'third-party';
      if (sameSite(h, site)) kind = 'you';
      else if (social) kind = 'social';
      else if (h && DIRECTORY_HOSTS.test(h)) kind = 'directory';
      return {
        position: r.position || i + 1,
        title: r.title || displayUrl(r.link),
        link: r.link,
        display: displayUrl(r.link),
        snippet: (r.snippet || '').slice(0, 220),
        kind,
        platform: social ? social.platform : null,
      };
    });

    // Social profiles surfaced in the brand search.
    const socialProfiles = [];
    const seenP = new Set();
    for (const row of serpRows) {
      if (row.kind === 'social' && !seenP.has(row.platform)) { seenP.add(row.platform); socialProfiles.push({ platform: row.platform, url: row.link, source: 'search' }); }
    }

    const ownRank = serpRows.find((r) => r.kind === 'you')?.position || null;
    const highlights = buildHighlights(serpRows, ownRank, brand);

    const indexedPages = (siteRes.rows || []).map((r) => r.link).filter((l) => sameSite(hostOf(l), site));

    return {
      brandResults: links.length,
      ownDomainResults: ownDomain,
      thirdPartyResults: links.length - ownDomain,
      topLinks: links.slice(0, 5),
      socialProfiles,
      indexedPages: [...new Set(indexedPages)],
      serp: { query: brand, rows: serpRows.slice(0, 8), ownRank, highlights },
    };
  } catch (err) {
    return { error: err.message };
  }
}

/** Plain-language highlights about how the brand shows up in search. */
function buildHighlights(rows, ownRank, brand) {
  const out = [];
  if (!ownRank) {
    out.push({ tone: 'bad', text: `Your website does not appear on the first page for "${brand}" — you don't own your own brand search.` });
  } else if (ownRank === 1) {
    out.push({ tone: 'good', text: `You own the #1 result for "${brand}".` });
  } else {
    out.push({ tone: 'warn', text: `Your site ranks #${ownRank} for "${brand}" — ${ownRank - 1} result(s) sit above your own site.` });
  }
  const socials = [...new Set(rows.filter((r) => r.kind === 'social').map((r) => r.platform))];
  if (socials.length) out.push({ tone: 'good', text: `Social profiles show in results: ${socials.join(', ')}.` });
  else out.push({ tone: 'warn', text: 'No social profiles appear in your brand search — competitors or strangers can fill that space.' });

  const dirTop = rows.filter((r) => r.kind === 'directory' && r.position <= 5);
  if (dirTop.length) out.push({ tone: 'warn', text: `Third-party listings rank in your top 5: ${[...new Set(dirTop.map((r) => hostOf(r.link)))].join(', ')} — claim/optimise these profiles.` });
  return out;
}

async function runQuery(provider, key, q) {
  if (provider === 'serpapi') {
    const base = process.env.SEARCH_ENDPOINT || 'https://serpapi.com/search.json';
    const url = `${base}?engine=google&q=${encodeURIComponent(q)}&num=15&api_key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return { error: `SerpApi ${res.status}`, rows: [] };
    const data = await res.json();
    return { rows: (data.organic_results || []).map((r) => ({ position: r.position, title: r.title, link: r.link, snippet: r.snippet })) };
  }
  if (provider === 'brave') {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=15`;
    const res = await fetch(url, { headers: { 'X-Subscription-Token': key, Accept: 'application/json' } });
    if (!res.ok) return { error: `Brave ${res.status}`, rows: [] };
    const data = await res.json();
    return { rows: (data.web?.results || []).map((r, i) => ({ position: i + 1, title: r.title, link: r.url, snippet: r.description })) };
  }
  return { error: `Unknown SEARCH_PROVIDER "${provider}"`, rows: [] };
}
