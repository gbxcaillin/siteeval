/**
 * Optional adapter: Claude API editorial critique.
 * Adds a qualitative read of positioning, clarity and CTA strength in GBX
 * plain-language tone. Returns null if ANTHROPIC_API_KEY is not set.
 */
export async function claudeCritique(site, facts) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

  const excerpt = facts.text.slice(0, 4000);
  const prompt = `You are a senior marketing strategist at GBX Professional Services. Brand voice: expert, direct, plain language, no vague consulting filler, results-led.

Review this company's homepage and return STRICT JSON only, no prose around it:
{
  "verdict": "one or two sentences: what this site does well and its single biggest missed opportunity",
  "positioning": "one sentence on how clearly it says what it does and for whom",
  "topFixes": ["3 to 5 concrete, specific fixes, each an imperative sentence"],
  "rewriteHeadline": "a stronger, plain-language hero headline you'd propose"
}

PAGE TITLE: ${facts.title}
META DESCRIPTION: ${facts.metaDescription}
H1: ${(facts.headings.h1[0] || '(none)')}
VISIBLE COPY (excerpt):
${excerpt}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return { error: `Claude API ${res.status}` };
    const data = await res.json();
    const text = (data.content || []).map((c) => c.text || '').join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { error: 'Could not parse Claude response' };
    return { ...JSON.parse(match[0]), model };
  } catch (err) {
    return { error: err.message };
  }
}
