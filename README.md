# GBX SiteEval — Marketing Potential Evaluator

Enter a company's website → get an instant, **GBX Professional Services–branded**
marketing scorecard with grades, findings, and a prioritised action plan.

Built the GBX way: **plain language, clear recommendations, no vague consulting
filler.** Dark, premium, results-led.

![Five marketing dimensions, scored A–F with prioritised fixes](docs/preview.png)

---

## What it does

Point it at any URL. SiteEval fetches the live site, reads its structure, copy
and marketing signals, and scores it across **five dimensions**:

| Dimension | What it measures | Weight |
|---|---|---|
| **Search Discoverability (SEO)** | Can search engines find, index and understand the page? Title, meta, headings, indexability, sitemap, structured data. | 22% |
| **Positioning & Messaging** | Does the hero say what they do, for whom, and to what outcome? Flags buzzwords and dense copy. | 20% |
| **Conversion Readiness** | Can a visitor take the next step? CTAs, lead capture, contact paths, social proof, nurture. | 20% |
| **Performance & Technical Health** | HTTPS, mobile viewport, page weight, server speed, script bloat, image hygiene. | 18% |
| **Brand & Online Presence** | Analytics maturity, ad pixels, social profiles, share previews, content hub. | 20% |

Each run returns an overall grade (A–F), per-dimension scorecards, a **top-10
prioritised action plan** ranked by impact, quick wins, and a snapshot of what
was seen.

### Also included

- **Deep crawl** — tick the toggle to also fetch and grade the key internal
  pages (about, services, contact, pricing, blog). Adds site-wide SEO hygiene
  (duplicate/missing titles & metas, thin pages) and confirms whether a real
  contact page, content hub and case-studies section exist.
- **Compare sites** — score up to four sites the same way and get a ranking, a
  per-dimension league table with the leader highlighted, and a plain-language
  summary of the widest gap. Ideal for a prospect-vs-competitor pitch.
- **Branded PDF export** — one click produces a GBX-branded PDF (dark cover
  page + readable interior). Server-side via headless Chromium when available,
  with an automatic fall back to a print-optimised `/report` view for
  browser "Save as PDF".
- **Desktop & mobile capture** — every evaluation renders the site headlessly
  at **desktop 16:9 (1280×720)** and **mobile (390×844)**, shows both
  screenshots in the report, and runs a **mobile-readability check** that flags
  sites which are *unreadable on mobile* (no viewport tag, horizontal overflow,
  tiny text). The verdict feeds the Performance score and appears in the PDF.
- **Lead-gen mode + Leads page** *(optional)* — set `LEADGEN_MODE=on` and the
  full scorecard, action plan and PDF are gated behind an email capture. The
  visitor sees the overall grade and a teaser; entering their details unlocks
  everything and files them on the internal **`/leads`** page. Leads are ranked
  so you always know who to call next, with four sorts:
  - **Most recent**
  - **Lowest score** *(default — biggest problems on top)*
  - **Uncontacted** *(hides contacted leads, lowest score first)*
  - **Easiest fix** *(fastest win first — e.g. a single-page site that just
    needs a quick redesign, or one that's broken on mobile)*

  Each lead carries an *ease-of-win* score, flags (single-page, mobile-broken,
  weakest area), the suggested fastest win, and a one-click **contacted**
  toggle. Stored in `data/leads.json` (kept local; nothing leaves the machine).

---

## Run it

```bash
npm install
npm start
# → http://localhost:3000
```

That's it. **Everything works with zero API keys** — the core engine is
~40 heuristic checks that run server-side against the live site.

### CLI

```bash
npm run cli -- stripe.com          # pretty terminal report
npm run cli -- stripe.com --json   # full JSON
```

---

## Optional API depth (hybrid engine)

The engine is **heuristics-first with optional adapters** that light up if you
add keys. Copy `.env.example` to `.env` and fill in any you want — each degrades
gracefully to "not configured" if absent.

| Key | Adds |
|---|---|
| `ANTHROPIC_API_KEY` | **Editorial read** — a GBX strategist's qualitative verdict on positioning, clarity and CTA strength, plus a proposed rewrite of the hero headline. Uses the Claude API. |
| `PAGESPEED_API_KEY` | Real Google **PageSpeed / Lighthouse** performance score + Core Web Vitals (LCP/CLS/TBT), blended into the Performance dimension. |
| `SEARCH_PROVIDER` + `SEARCH_API_KEY` | Real **search-footprint** signal (how discoverable the brand is beyond its own site). Supports `serpapi` or `brave`. |

Adapter status is shown live in the report header (on/off pills).

---

## How it's built

```
server.js                Express server + static UI + JSON/PDF endpoints
src/
  cli.js                 Terminal runner
  browser.js             Shared headless-Chromium launcher (graceful if absent)
  leads.js               Lead-gen gating + lead store, ranking & contacted state
  engine/
    analyze.js           Orchestrator: fetch → (crawl) → (render) → checks → plan
    fetchSite.js         Live fetch + robots/sitemap/https probes + fetchDoc
    crawl.js             Discover & grade key internal pages; site-wide signals
    extract.js           DOM → flat "facts" object
    compare.js           Run the engine on 2–4 sites → ranking + league table
    grade.js             Scoring vocabulary (letter grades, bands, result builder)
    checks/              One module per dimension (seo, messaging, conversion,
                         performance, presence)
    adapters/            Optional: claude.js, pagespeed.js, search.js,
                         render.js (desktop+mobile screenshots & readability)
  report/
    printTemplate.js     Standalone branded report HTML (dark cover + interior)
    pdf.js               Render report HTML → PDF (headless browser, graceful)
    leadsPage.js         Self-contained branded /leads admin page
public/
  index.html  styles.css  app.js   Branded single-page front end
```

### HTTP endpoints

| Method & path | Purpose |
|---|---|
| `POST /api/evaluate` | `{ url, crawl }` → full report (or teaser + token if lead-gen on) |
| `POST /api/lead` | `{ token, email, name, company }` → stores lead, returns full report |
| `POST /api/compare` | `{ urls: [...] }` → head-to-head ranking + league table |
| `GET  /report?url=` | Branded, print-optimised HTML report (browser "Save as PDF") |
| `POST /api/report.pdf` | `{ url, crawl }` → downloadable branded PDF (or 501 + fallback) |
| `GET  /leads` | Internal branded Leads admin page |
| `GET  /api/leads?sort=` | Ranked leads (`recent` / `score` / `uncontacted` / `ease`) |
| `POST /api/leads/:id/contacted` | `{ contacted }` → mark a lead contacted |
| `GET  /api/health` | Feature flags (lead-gen, which adapters are configured) |

**Design tokens** (GBX Brand Guide v1.0) live at the top of `public/styles.css`
in `:root` — re-skinning is a change to those variables only.

- GBX Teal `#2E8B6E` · Deep Teal `#1A5C4A` · Void Black `#0A0A0A` · Charcoal `#1A1A1A` · White `#FFFFFF`

---

## Notes & limits

- Analyses the **entered page** (usually the homepage). Point-in-time, live fetch.
- Heuristics infer intent from markup; some signals (e.g. first-party analytics,
  JS-rendered content) can't always be detected and may under-report. The
  optional adapters exist to close those gaps.
- Respects a soft per-IP rate limit on the API. For heavy use, add caching.

## Roadmap ideas

- Email the captured lead their PDF automatically (SMTP / SendGrid)
- Push leads into a CRM (HubSpot/Pipedrive) instead of a flat file
- Scheduled re-scans with change tracking over time
- White-label per-client sub-brands
