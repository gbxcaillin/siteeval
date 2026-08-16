/**
 * Optional adapter: real online-presence signal via a web search API.
 * Providers: "serpapi" or "brave". Returns null if not configured.
 */
export async function searchPresence(brand, host) {
  const provider = (process.env.SEARCH_PROVIDER || '').toLowerCase();
  const key = process.env.SEARCH_API_KEY;
  if (!provider || !key) return null;

  const query = `${brand}`.trim();

  try {
    if (provider === 'serpapi') {
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${key}`;
      const res = await fetch(url);
      if (!res.ok) return { error: `SerpApi ${res.status}` };
      const data = await res.json();
      const organic = data.organic_results || [];
      return summarise(organic.map((r) => r.link), host);
    }

    if (provider === 'brave') {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`;
      const res = await fetch(url, {
        headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
      });
      if (!res.ok) return { error: `Brave ${res.status}` };
      const data = await res.json();
      const results = data.web?.results || [];
      return summarise(results.map((r) => r.url), host);
    }

    return { error: `Unknown SEARCH_PROVIDER "${provider}"` };
  } catch (err) {
    return { error: err.message };
  }
}

function summarise(links, host) {
  const clean = links.filter(Boolean);
  const ownDomain = clean.filter((l) => l.includes(host)).length;
  return {
    brandResults: clean.length,
    ownDomainResults: ownDomain,
    thirdPartyResults: clean.length - ownDomain,
    topLinks: clean.slice(0, 5),
  };
}
