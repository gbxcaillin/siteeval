/** Shared scoring vocabulary so every check speaks the same language. */

export function letterGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  if (score >= 45) return 'E';
  return 'F';
}

export function band(score) {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'solid';
  if (score >= 40) return 'needs work';
  return 'critical';
}

/**
 * Build a category result. `deductions` is an array of
 * { points, severity, finding, rec } — points are subtracted from 100.
 * A check can also pass positive `credits` (findings worth celebrating).
 */
export function buildResult({ id, label, weight, deductions = [], credits = [], metrics = {} }) {
  let score = 100;
  const findings = [];
  const recommendations = [];

  for (const c of credits) {
    if (c.finding) findings.push({ severity: 'good', text: c.finding });
  }

  for (const d of deductions) {
    score -= d.points || 0;
    if (d.finding) {
      findings.push({ severity: d.severity || 'warn', text: d.finding });
    }
    if (d.rec) {
      recommendations.push({
        priority: d.priority || (d.points >= 12 ? 'high' : d.points >= 6 ? 'medium' : 'low'),
        text: d.rec,
        points: d.points || 0,
      });
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  recommendations.sort((a, b) => b.points - a.points);

  // Surface problems first (bad → warn → good). Consumers slice to the top few
  // findings, so ordering by severity keeps real issues from being crowded out
  // by positive credits. Stable within each severity (insertion order kept).
  const sev = { bad: 0, warn: 1, good: 2 };
  findings.sort((a, b) => (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3));

  return {
    id,
    label,
    weight,
    score,
    grade: letterGrade(score),
    band: band(score),
    findings,
    recommendations,
    metrics,
  };
}
