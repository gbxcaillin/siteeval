import { analyze } from './analyze.js';

/**
 * Compare 2–4 sites head to head.
 * Runs the full evaluation on each, then builds a per-dimension league table
 * with winners and gaps — the kind of view a prospect finds hard to argue with.
 */
export async function compare(urls, opts = {}) {
  const list = [...new Set(urls.map((u) => String(u || '').trim()).filter(Boolean))].slice(0, 4);
  if (list.length < 2) throw new Error('Provide at least two websites to compare.');

  const settled = await Promise.allSettled(list.map((u) => analyze(u, opts)));

  const sites = settled.map((s, i) => {
    if (s.status === 'fulfilled') {
      const r = s.value;
      return {
        ok: true,
        input: list[i],
        host: r.meta.host,
        url: r.meta.url,
        overall: r.overall,
        categories: r.categories.map((c) => ({ id: c.id, label: c.label, score: c.score, grade: c.grade })),
        actionPlan: r.actionPlan.slice(0, 3),
      };
    }
    return { ok: false, input: list[i], error: s.reason?.message || 'Could not evaluate.' };
  });

  const ok = sites.filter((s) => s.ok);
  if (ok.length < 2) {
    throw new Error('Could not evaluate enough of the sites to compare. ' + sites.filter((s) => !s.ok).map((s) => `${s.input}: ${s.error}`).join('; '));
  }

  // Category league table
  const catIds = ok[0].categories.map((c) => ({ id: c.id, label: c.label }));
  const table = catIds.map(({ id, label }) => {
    const row = ok.map((s) => {
      const c = s.categories.find((x) => x.id === id);
      return { host: s.host, score: c ? c.score : 0, grade: c ? c.grade : 'F' };
    });
    const best = Math.max(...row.map((r) => r.score));
    return {
      id,
      label,
      cells: row.map((r) => ({ ...r, leader: r.score === best })),
    };
  });

  // Overall ranking
  const ranking = [...ok]
    .map((s) => ({ host: s.host, url: s.url, score: s.overall.score, grade: s.overall.grade }))
    .sort((a, b) => b.score - a.score);

  const leader = ranking[0];
  const gaps = ranking.slice(1).map((r) => ({ host: r.host, behindBy: leader.score - r.score }));

  return {
    generatedAt: new Date().toISOString(),
    sites,
    table,
    ranking,
    leader,
    gaps,
    summary: buildSummary(ranking, table),
  };
}

function buildSummary(ranking, table) {
  const leader = ranking[0];
  const last = ranking[ranking.length - 1];
  const spread = leader.score - last.score;
  // Biggest single-dimension gap
  let widest = null;
  for (const row of table) {
    const scores = row.cells.map((c) => c.score);
    const gap = Math.max(...scores) - Math.min(...scores);
    if (!widest || gap > widest.gap) widest = { label: row.label, gap };
  }
  return `${leader.host} leads with ${leader.score}/100 (grade ${leader.grade})${spread > 0 ? `, ${spread} points ahead of ${last.host}` : ''}. The widest gap between these sites is in ${widest.label} (${widest.gap} points) — the clearest place to win or lose ground.`;
}
