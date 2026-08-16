import { buildResult } from '../grade.js';

/** Conversion readiness — can a visitor easily take the next step? */
export function checkConversion(site, f, ctx = {}) {
  const d = [];
  const credits = [];

  // Primary CTA
  if (f.ctas.length === 0) {
    d.push({ points: 20, severity: 'bad', finding: 'No clear call-to-action found — visitors have no obvious next step, so traffic leaks away.', rec: 'Add one primary CTA above the fold ("Book a call", "Get a quote") and repeat it down the page.' });
  } else if (f.ctas.length === 1) {
    credits.push({ finding: `A clear primary CTA is present ("${f.ctas[0]}").` });
  } else {
    credits.push({ finding: `Multiple action prompts present (e.g. ${f.ctas.slice(0, 3).map((c) => `"${c}"`).join(', ')}).` });
  }

  // Lead capture
  if (f.forms === 0 && !f.hasBooking) {
    d.push({ points: 14, severity: 'bad', finding: 'No contact form or booking option — no way to capture a lead on-site.', rec: 'Add a short lead-capture form or an embedded booking link (Calendly/HubSpot).' });
  } else if (f.hasBooking) {
    credits.push({ finding: 'Direct booking / scheduling path detected.' });
  } else if (f.forms > 0) {
    credits.push({ finding: `${f.forms} form(s) available for enquiries.` });
  }

  // Contact reachability
  if (f.phones === 0 && f.emails.length === 0) {
    d.push({ points: 8, severity: 'warn', finding: 'No clickable phone or email — friction for prospects who want to reach out directly.', rec: 'Expose a tel: link and/or contact email prominently.' });
  } else {
    credits.push({ finding: 'Direct contact details are reachable.' });
  }

  // Trust / social proof signals
  const proof = /\b(testimonial|review|case study|client|trusted by|rated|\d+\s*(\+|plus)?\s*(clients|customers|years))\b/i.test(f.text);
  if (!proof) {
    d.push({ points: 10, severity: 'warn', finding: 'No visible social proof (testimonials, case studies, client logos, numbers).', rec: 'Add proof: named testimonials, case-study results, or client logos near the CTA.' });
  } else {
    credits.push({ finding: 'Social-proof language present (testimonials / clients / results).' });
  }

  // Newsletter / nurture
  if (!f.hasNewsletter) {
    d.push({ points: 4, severity: 'warn', finding: 'No newsletter or lead-magnet capture — no way to nurture visitors who are not ready to buy.', rec: 'Offer a lightweight opt-in (guide, checklist, newsletter) to capture not-yet-ready leads.' });
  }

  // Value-word density in CTAs
  const weakCta = f.ctas.some((c) => /learn more|read more|click here/i.test(c)) && !f.ctas.some((c) => /book|get|start|contact|demo|quote|call/i.test(c));
  if (weakCta) {
    d.push({ points: 5, severity: 'warn', finding: 'CTAs are passive ("Learn more") rather than action-driving.', rec: 'Use outcome-led CTA copy ("Book a strategy call", "Get your assessment").' });
  }

  // Crawl: dedicated contact page and whether it can actually capture a lead.
  const crawl = ctx.crawl;
  if (crawl && crawl.enabled) {
    if (!crawl.found.contact) {
      d.push({ points: 6, severity: 'warn', finding: 'No dedicated contact page found in the crawl.', rec: 'Add a clear /contact page linked from the main navigation.' });
    } else {
      const contactPage = crawl.pages.find((p) => p.type === 'contact');
      if (contactPage && contactPage.forms === 0) {
        d.push({ points: 5, severity: 'warn', finding: 'Contact page has no form — visitors must copy an email instead of submitting.', rec: 'Put a short enquiry form on the contact page.' });
      } else if (contactPage) {
        credits.push({ finding: 'Dedicated contact page with an enquiry form.' });
      }
    }
    if (crawl.found.caseStudies) {
      credits.push({ finding: 'Case-studies / client-work section present — strong bottom-of-funnel proof.' });
    }
  }

  return buildResult({
    id: 'conversion',
    label: 'Conversion Readiness',
    weight: 20,
    deductions: d,
    credits,
    metrics: {
      ctas: f.ctas.slice(0, 8),
      forms: f.forms,
      hasBooking: f.hasBooking,
      phoneLinks: f.phones,
      emails: f.emails.slice(0, 3),
      hasNewsletter: f.hasNewsletter,
      socialProof: proof,
    },
  });
}
