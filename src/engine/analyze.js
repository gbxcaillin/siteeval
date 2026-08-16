import { fetchSite } from './fetchSite.js';
import { extractFacts } from './extract.js';
import { crawlSite } from './crawl.js';
import { letterGrade, band } from './grade.js';

import { checkSeo } from './checks/seo.js';
import { checkMessaging } from './checks/messaging.js';
import { checkConversion } from './checks/conversion.js';
import { checkPerformance } from './checks/performance.js';
import { checkPresence } from './checks/presence.js';

import { claudeCritique } from './adapters/claude.js';
import { pageSpeed } from './adapters/pagespeed.js';
import { searchPresence } from './adapters/search.js';
import { renderViews } from './adapters/render.js';

/** Guess a brand name from title / host for the search adapter. */
function brandName(facts, site) {
  const t = (facts.title || '').split(/[|\-–—:]/)[0].trim();
  if (t && t.length <= 40) return t;
  return site.host.replace(/^www\./, '').split('.')[0];
}

/**
 * Full evaluation pipeline.
 * Returns a report object ready to render as JSON or in the UI.
 */
export async function analyze(input, opts = {}) {
  const startedAt = Date.now();
  const site = await fetchSite(input);

  if (!site.ok && site.status !== 0) {
    // Reachable but error status — still analyse what we got, but flag it.
  }

  const facts = extractFacts(site);
  const brand = brandName(facts, site);

  // Optional deeper crawl + previews + adapters, all in parallel; none block the core.
  const [crawl, render, ps, search, critique] = await Promise.all([
    opts.crawl ? crawlSite(site, facts).catch(() => null) : null,
    opts.preview === false ? null : renderViews(site.url).catch(() => null),
    opts.skipAdapters ? null : pageSpeed(site.url).catch(() => null),
    opts.skipAdapters ? null : searchPresence(brand, site.host).catch(() => null),
    opts.skipAdapters ? null : claudeCritique(site, facts).catch(() => null),
  ]);

  const ext = { pageSpeed: ps, search, critique };
  const ctx = { ext, crawl, render };

  const categories = [
    checkSeo(site, facts, ctx),
    checkMessaging(site, facts, ctx),
    checkConversion(site, facts, ctx),
    checkPerformance(site, facts, ctx),
    checkPresence(site, facts, ctx),
  ];

  // If PageSpeed returned a real performance score, blend it into that category.
  if (ps && typeof ps.performanceScore === 'number') {
    const perf = categories.find((c) => c.id === 'performance');
    if (perf) {
      perf.score = Math.round(perf.score * 0.4 + ps.performanceScore * 0.6);
      perf.grade = letterGrade(perf.score);
      perf.band = band(perf.score);
      perf.metrics.pageSpeed = ps;
      perf.findings.unshift({
        severity: ps.performanceScore >= 80 ? 'good' : ps.performanceScore >= 50 ? 'warn' : 'bad',
        text: `Google PageSpeed (mobile) performance score: ${ps.performanceScore}/100${ps.lcp ? ` — LCP ${ps.lcp}` : ''}.`,
      });
    }
  }

  // Weighted overall score
  const totalWeight = categories.reduce((s, c) => s + c.weight, 0);
  const overallScore = Math.round(
    categories.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight
  );

  // Prioritised action plan — top recommendations across all categories.
  const actionPlan = categories
    .flatMap((c) =>
      c.recommendations.map((r) => ({
        category: c.label,
        categoryId: c.id,
        priority: r.priority,
        text: r.text,
        impact: r.points,
      }))
    )
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 10);

  const quickWins = categories
    .flatMap((c) => c.recommendations.filter((r) => r.points > 0 && r.points <= 6).map((r) => ({ category: c.label, text: r.text, impact: r.points })))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5);

  // Prospect "ease of win": how fast a big improvement is — used to rank leads.
  const prospect = computeProspect({ facts, crawl, overallScore, categories, render, actionPlan });

  return {
    meta: {
      input: String(input),
      url: site.url,
      host: site.host,
      brand,
      status: site.status,
      isHttps: site.isHttps,
      fetchedAt: site.fetchedAt,
      elapsedMs: Date.now() - startedAt,
      adapters: {
        pageSpeed: ps ? (ps.error ? `error: ${ps.error}` : 'active') : 'not configured',
        search: search ? (search.error ? `error: ${search.error}` : 'active') : 'not configured',
        claude: critique ? (critique.error ? `error: ${critique.error}` : 'active') : 'not configured',
      },
    },
    overall: {
      score: overallScore,
      grade: letterGrade(overallScore),
      band: band(overallScore),
      headline: overallHeadline(overallScore, categories),
    },
    categories,
    actionPlan,
    quickWins,
    editorial: critique && !critique.error ? critique : null,
    crawl: crawl && crawl.enabled
      ? {
          pagesCrawled: crawl.pagesCrawled,
          pages: crawl.pages.map((p) => ({ label: p.label, path: p.path, wordCount: p.wordCount, forms: p.forms })),
          found: crawl.found,
          seo: crawl.seo,
        }
      : null,
    render: render
      ? {
          desktop: render.desktop || null,
          mobile: render.mobile || null,
          readability: render.readability || null,
        }
      : null,
    prospect,
    snapshot: {
      title: facts.title,
      metaDescription: facts.metaDescription,
      headline: facts.headings.h1[0] || null,
      wordCount: facts.wordCount,
      platform: categories.find((c) => c.id === 'presence')?.metrics.platform,
      socials: facts.social,
    },
  };
}

/**
 * Estimate how quick and high-impact a win is for a prospect.
 * Higher easeScore = big improvement available with little site to change —
 * e.g. a small/single-page site scoring low that just needs a redesign.
 * Drives the "Easiest fix" sort on the Leads page.
 */
function computeProspect({ facts, crawl, overallScore, categories, render, actionPlan }) {
  // Rough page count — from the crawl if it ran, else distinct internal nav paths.
  const distinctPaths = new Set();
  for (const l of facts.links.internal) {
    try {
      distinctPaths.add(new URL(l.resolved).pathname.replace(/\/$/, '') || '/');
    } catch { /* ignore */ }
  }
  distinctPaths.delete('/');
  const pages = crawl && crawl.enabled ? crawl.pagesCrawled + 1 : Math.min(distinctPaths.size + 1, 12);
  const isSinglePage = pages <= 1 || distinctPaths.size <= 1;

  const mobileVerdict = render && render.readability ? render.readability.verdict : null;
  const mobileBroken = mobileVerdict === 'unreadable';
  const mobileSuboptimal = mobileVerdict === 'suboptimal';

  const headroom = 100 - overallScore; // how much there is to gain
  const simplicity = isSinglePage ? 100 : Math.max(20, 100 - pages * 9); // less site = simpler fix

  let easeScore = Math.round(headroom * 0.55 + simplicity * 0.45);
  if (mobileBroken) easeScore = Math.min(100, easeScore + 8); // obvious, sellable fix
  else if (mobileSuboptimal) easeScore = Math.min(100, easeScore + 4); // visible, easy optimise

  // Human-readable "fastest win" label.
  const weakest = [...categories].sort((a, b) => a.score - b.score)[0];
  let fastWin;
  if (isSinglePage && overallScore < 65) fastWin = 'Single-page site — a quick redesign is a fast, high-impact win';
  else if (mobileBroken) fastWin = 'Unreadable on mobile — a responsive rebuild is an easy sell';
  else if (mobileSuboptimal) fastWin = 'Mobile view is poorly optimised — a responsive tidy-up is a quick, visible win';
  else if (weakest && weakest.score < 55) fastWin = `Weakest area is ${weakest.label.toLowerCase()} — concentrated, fixable fast`;
  else fastWin = actionPlan[0] ? `Start with: ${actionPlan[0].text}` : 'Incremental improvements available';

  return {
    pages,
    isSinglePage,
    headroom,
    easeScore,
    mobileVerdict,
    mobileBroken: !!mobileBroken,
    mobileSuboptimal: !!mobileSuboptimal,
    fastWin,
  };
}

function overallHeadline(score, categories) {
  const weakest = [...categories].sort((a, b) => a.score - b.score)[0];
  const strongest = [...categories].sort((a, b) => b.score - a.score)[0];
  if (score >= 80)
    return `Strong marketing foundation. Biggest remaining lever: ${weakest.label.toLowerCase()}.`;
  if (score >= 60)
    return `Solid base with clear upside. ${strongest.label} is working; ${weakest.label.toLowerCase()} is holding you back.`;
  if (score >= 40)
    return `Meaningful gaps are costing you leads. Start with ${weakest.label.toLowerCase()}.`;
  return `Significant missed potential. The website is underselling the business — ${weakest.label.toLowerCase()} needs urgent attention.`;
}
