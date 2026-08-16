import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (compatible; GBX-SiteEval/0.1; +https://gbxps.com)';

const TIMEOUT_MS = 15000;

/** Normalise whatever the user typed into a fetchable https URL. */
export function normaliseUrl(input) {
  let raw = String(input || '').trim();
  if (!raw) throw new Error('No URL provided.');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  const url = new URL(raw); // throws on garbage
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error('Only http(s) URLs are supported.');
  }
  return url;
}

async function timedFetch(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      ...opts,
    });
  } finally {
    clearTimeout(t);
  }
}

/** Fetch a single HTML doc for the crawler — lighter than fetchSite (no side probes). */
export async function fetchDoc(href) {
  const started = Date.now();
  try {
    const res = await timedFetch(href);
    const html = res.ok ? await res.text() : '';
    return {
      ok: res.ok,
      status: res.status,
      url: res.url || href,
      html,
      bytes: Buffer.byteLength(html, 'utf8'),
      ttfbMs: Date.now() - started,
      $: html ? cheerio.load(html) : null,
    };
  } catch {
    return { ok: false, status: 0, url: href, html: '', bytes: 0, ttfbMs: Date.now() - started, $: null };
  }
}

/** Best-effort GET that never throws for a non-200; returns {ok,status,text}. */
async function softGet(url) {
  try {
    const res = await timedFetch(url);
    const text = res.ok ? await res.text() : '';
    return { ok: res.ok, status: res.status, text, url: res.url };
  } catch {
    return { ok: false, status: 0, text: '', url };
  }
}

/**
 * Fetch a site and return a structured snapshot the checks can reason over.
 * Pulls the homepage plus robots.txt, sitemap.xml and an https reachability probe.
 */
export async function fetchSite(input) {
  const url = normaliseUrl(input);
  const started = Date.now();

  let res;
  try {
    res = await timedFetch(url.href);
  } catch (err) {
    throw new Error(
      `Could not reach ${url.href} — ${err.name === 'AbortError' ? 'request timed out' : err.message}.`
    );
  }

  const ttfbMs = Date.now() - started;
  const finalUrl = new URL(res.url || url.href);
  const html = await res.text();
  const bytes = Buffer.byteLength(html, 'utf8');
  const headers = Object.fromEntries(res.headers.entries());

  const $ = cheerio.load(html);

  // Side probes — run in parallel, all optional.
  const origin = finalUrl.origin;
  const [robots, sitemap, httpProbe] = await Promise.all([
    softGet(origin + '/robots.txt'),
    softGet(origin + '/sitemap.xml'),
    // Did the site serve over https, and does plain http redirect up?
    finalUrl.protocol === 'https:'
      ? softGet('http://' + finalUrl.host + '/')
      : Promise.resolve({ ok: false, status: 0, text: '', url: '' }),
  ]);

  return {
    input: String(input),
    url: finalUrl.href,
    origin,
    host: finalUrl.host,
    status: res.status,
    ok: res.ok,
    isHttps: finalUrl.protocol === 'https:',
    redirected: finalUrl.href !== url.href,
    ttfbMs,
    bytes,
    headers,
    html,
    $, // cheerio instance for the checks
    robots: { found: robots.ok, body: robots.text.slice(0, 20000) },
    sitemap: { found: sitemap.ok },
    httpProbe: { redirectsToHttps: httpProbe.ok && /^https:/i.test(httpProbe.url) },
    fetchedAt: new Date().toISOString(),
  };
}
