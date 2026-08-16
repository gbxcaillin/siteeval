import { buildResult } from '../grade.js';

const VALUE_WORDS = /\b(help|grow|increase|reduce|save|improve|deliver|build|scale|win|convert|automate|streamline|results|revenue|roi|efficiency|performance)\b/i;
const FILLER = /\b(passionate|synergy|world-class|cutting-edge|best-in-class|leverage|holistic|bespoke solutions?|unlock your (full )?potential|next level|game[- ]chang|seamless(ly)?|innovat(e|ive)|empower)\b/gi;

/** Positioning & messaging clarity — does the hero say what they do and for whom? */
export function checkMessaging(site, f) {
  const d = [];
  const credits = [];

  const hero = [(f.headings.h1[0] || ''), (f.headings.h2[0] || ''), f.metaDescription]
    .join(' ')
    .trim();

  // Is there a clear headline at all?
  if (!f.headings.h1[0]) {
    d.push({ points: 14, severity: 'bad', finding: 'No headline to anchor the value proposition — visitors must guess what the company does.', rec: 'Lead with a plain-language headline: what you do + who it is for + the outcome.' });
  } else if (f.headings.h1[0].length < 12) {
    d.push({ points: 6, severity: 'warn', finding: `Headline is very short ("${f.headings.h1[0]}") and likely a brand name rather than a value proposition.`, rec: 'Make the headline describe the outcome, not just the brand.' });
  }

  // Does the hero communicate value?
  if (hero && !VALUE_WORDS.test(hero)) {
    d.push({ points: 10, severity: 'warn', finding: 'The headline/opening copy names no benefit or outcome — it describes the company, not what the customer gets.', rec: 'Rewrite the hero around a measurable customer outcome (e.g. "cut onboarding time by half").' });
  } else if (hero) {
    credits.push({ finding: 'Hero copy references a tangible benefit or outcome.' });
  }

  // Filler / vague consulting language (on-brand for GBX to flag)
  const fillerHits = [...new Set((f.text.match(FILLER) || []).map((s) => s.toLowerCase()))];
  if (fillerHits.length >= 3) {
    d.push({ points: 9, severity: 'warn', finding: `Copy leans on vague buzzwords (${fillerHits.slice(0, 4).join(', ')}) that say nothing concrete.`, rec: 'Replace buzzwords with specifics: real numbers, named services, concrete outcomes.' });
  } else if (fillerHits.length > 0) {
    d.push({ points: 4, severity: 'warn', finding: `Some filler language detected (${fillerHits.join(', ')}).`, rec: 'Swap filler phrases for plain, specific claims.' });
  } else if (f.wordCount > 120) {
    credits.push({ finding: 'Copy avoids empty buzzwords — direct and specific.' });
  }

  // Audience clarity
  if (!/\b(for|helping|we help|designed for|built for|trusted by)\b/i.test(f.text)) {
    d.push({ points: 6, severity: 'warn', finding: 'No explicit audience signal — unclear who this is for.', rec: 'State the target audience plainly ("for financial advisers", "for growing agencies").' });
  }

  // Readability proxy — average words per sentence
  const sentences = f.text.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);
  const avgWords = sentences.length ? f.wordCount / sentences.length : 0;
  if (avgWords > 28) {
    d.push({ points: 5, severity: 'warn', finding: `Long, dense sentences (avg ${Math.round(avgWords)} words) hurt readability.`, rec: 'Tighten sentences; aim for an average under 20 words.' });
  }

  return buildResult({
    id: 'messaging',
    label: 'Positioning & Messaging',
    weight: 20,
    deductions: d,
    credits,
    metrics: {
      headline: f.headings.h1[0] || null,
      fillerPhrases: fillerHits,
      avgSentenceWords: Math.round(avgWords),
      wordCount: f.wordCount,
    },
  });
}
