# LLM Crawlability Auditor

A lightweight web auditing tool that checks how easily a page can be crawled and interpreted by search engines and LLM-driven systems.

It evaluates crawlability signals from raw HTML, computes a weighted score, and highlights what is present or missing with expandable evidence and manual verification guidance.

---

## What this tool does

The auditor analyzes a page through three input methods:

1. **URL fetch** — server-side fetch + analysis
2. **HTML file upload** — upload a saved `.html` file
3. **Raw HTML paste** — paste source directly

It then reports:

- A **0–100 crawlability score**
- Per-check **Pass / Fail** status with outcome summary
- Check **weight**, impact, and explanation
- **Source snippets** with line numbers where signals were detected
- Manual verification links and steps
- **CSV export** of the full audit result

It also includes:

- A **bookmarklet** for one-click auditing from any page
- **Gate checks** that force the score to `0` when blocking conditions are detected
- A **loading overlay** showing which check is currently running
- Browser history integration for Home / Results state navigation

---

## How it works (architecture)

### Frontend

The app UI and audit engine are in [index.html](index.html) and [auditor.js](auditor.js):

- Renders input panel and results panel
- Runs gate checks before weighted signal checks
- Computes weighted score
- Adds expandable check detail cards
- Builds downloadable CSV report
- Handles bookmarklet bootstrap behavior via `?url=...`

### Backend

The Node server in [server.js](server.js):

- Serves static app assets
- Serves a dynamic bookmarklet payload bound to the current host and protocol
- Exposes `/api/fetch?url=...` to fetch remote HTML/XML for analysis
- Handles compression decoding (`gzip` / `deflate` / `br`) and redirects
- Implements a dual-fetch strategy: primary Node.js `http`/`https` module with one retry on `ECONNRESET`, then falls back to native `fetch`

---

## Signals and scoring model

The audit is divided into two layers: **gate checks** (critical, run first) and **weighted signal checks**.

### Scoring formula

```
score = round( sum(weight of passing signals) / sum(all signal weights) × 100 )
```

If any gate check fails, the score is **forced to 0** regardless of signal results.

Maximum possible raw score across all weighted signals: **26 points**.

| Signal | Weight |
|---|---|
| Relevant paragraphs in `<main>` | 4 |
| Heading structure (`<h1>` + `<h2>`) | 4 |
| `<title>` tag | 4 |
| Hyperlinks in `<main>` | 4 |
| Structured data (schema.org) | 4 |
| Breadcrumbs | 3 |
| HTML lang attribute | 2 |
| Sitemap association | 2 |
| Meta description | 1 |

---

## Gate checks (critical — run first)

Gate checks are pass/fail blockers evaluated before any weighted signal. If any gate fails, the UI still shows all check details, but the final score is **forced to `0`**.

There are three gate checks, displayed in this order:

---

### Gate 1 — robots.txt

**What it checks:** fetches `robots.txt` from the page origin and evaluates whether any `Disallow` rule for `User-agent: *` matches the tested URL path.

**How it works:**
- Constructs `<origin>/robots.txt` from the tested URL
- Parses rules per `User-agent` group
- Matches the page path against `Disallow` and `Allow` rules using specificity-based precedence (longer, more specific patterns win)
- Wildcards (`*`) and end anchors (`$`) in patterns are supported

**Pass:** path is not blocked (or `robots.txt` is unreachable — treated as pass by default)

**Fail:** a `Disallow` rule with no overriding `Allow` matches the page path

---

### Gate 2 — noindex

**What it checks:** looks for `noindex` directives in the HTML and response headers.

**How it works:**
- Scans `<meta name="robots" content="...">` tags for the `noindex` token
- Scans `X-Robots-Tag` response headers for the `noindex` token
- Both sources are checked independently; either one triggers a fail

**Pass:** no `noindex` token found in either source

**Fail:** `noindex` detected in meta robots tag and/or `X-Robots-Tag` header

---

### Gate 3 — Canonical tag

**What it checks:** validates that a canonical tag exists, is correctly placed, and its URL matches the tested URL.

**How it works:**

The detector runs the following checks in order, failing fast on the first problem:

| Condition | Result |
|---|---|
| No canonical tag at all | ❌ Fail |
| More than one canonical tag found | ❌ Fail |
| Canonical tag exists but is outside `<head>` | ❌ Fail |
| Canonical tag has no `href` | ❌ Fail |
| No target URL available to compare | ✅ Pass (medium quality, no URL validation) |
| Canonical URL exactly matches tested URL (after normalization) | ✅ Pass — quality: high |
| Tested URL has parameters and canonical matches the base URL without parameters | ✅ Pass — quality: medium (⚠️ warning shown) |
| Canonical URL does not match tested URL | ❌ Fail |

URL comparison is normalized: trailing slashes, hash fragments, and protocol casing are stripped before comparison.

**Pass:** canonical is present in `<head>`, has a valid `href`, and URL matches (exactly or base-match when parameters present)

**Fail:** any of the above fail conditions

---

## Weighted signal checks

These checks contribute to the crawlability score. They run after gate checks and are displayed in the order listed below.

---

### Check 1 — Relevant paragraphs

**Weight: 4** | **Impact: High**

**What it checks:** counts `<p>` tags containing substantive text content (at least 20 words after stripping inner tags).

**How it works:**
- Searches for the `<main>` element first
- If no `<main>` tag exists, falls back to `<body>` content with `<header>` and `<footer>` elements stripped out
- Filters `<p>` tags to those with at least 20 words of visible text

**Pass:** at least one relevant paragraph found

**Fail:** no paragraph reaches the 20-word threshold (if `<p>` tags exist, the summary states that and expandable source snippets still show them)

**Quality grading:**
- `high` — 5 or more qualifying paragraphs
- `medium` — 2 to 4 qualifying paragraphs
- `low` — 1 qualifying paragraph

**Warning:** if no `<main>` tag was found, the outcome note includes ⚠️ _no `<main>` tag found, checked `<body>` instead_.

---

### Check 2 — Headings

**Weight: 4** | **Impact: High**

**What it checks:** verifies that exactly one `<h1>` exists and counts `<h2>` tags.

**How it works:**
- Searches within `<main>` first; falls back to `<body>` (minus `<header>` and `<footer>`) if `<main>` is absent
- Counts `<h1>` and `<h2>` matches independently
- Passes only when there is **exactly one** `<h1>`

**Pass:** exactly 1 `<h1>` found in the content area

**Fail:** 0 or 2+ `<h1>` tags found

**Warning:** if `<main>` was not found, the outcome note includes ⚠️ _no `<main>` tag found, checked `<body>` instead_.

---

### Check 3 — Page title

**Weight: 4** | **Impact: High**

**What it checks:** verifies that a non-empty `<title>` tag exists anywhere in the document.

**How it works:**
- Matches `<title>...</title>` using a case-insensitive regex
- Trims whitespace and checks that the content is non-empty

**Pass:** `<title>` exists with non-empty content

**Fail:** `<title>` is missing or empty

---

### Check 4 — Hyperlinks

**Weight: 4** | **Impact: High**

**What it checks:** counts all `<a href="...">` elements in the content area and distinguishes internal links from external ones.

**How it works:**
- Searches within `<main>` first; falls back to `<body>` (minus `<header>` and `<footer>`) if `<main>` is absent
- Counts all anchor tags with an `href` attribute
- Internal links are those whose `href` does not start with `http://` or `https://`

**Pass:** at least one link found

**Quality grading:**
- `high` — at least one internal link present
- `medium` — only external links found

**Warning:** if `<main>` was not found, the outcome note includes ⚠️ _no `<main>` tag found, checked `<body>` instead_.

---

### Check 5 — Structured data

**Weight: 4** | **Impact: High**

**What it checks:** detects schema.org markup in JSON-LD and Microdata formats.

**How it works:**
- Scans the full document for `<script type="application/ld+json">` blocks and attempts to parse each as JSON
- Extracts `@type` values recursively (including nested objects)
- Also scans for `itemtype="..."` attributes (Microdata)
- Builds a hierarchy tree of detected schema types for display in the UI

**Pass:** at least one valid JSON-LD block or at least one `itemtype` attribute found

**Quality grading:**
- `high` — 2 or more schema blocks detected
- `medium` — exactly 1 schema block detected
- `low` — none found

---

### Check 6 — Breadcrumbs

**Weight: 3** | **Impact: Moderate-High**

**What it checks:** looks for breadcrumb navigation patterns anywhere in the HTML.

**How it works:**
- Matches elements where the `class` attribute contains the substring `breadcrumb` (case-insensitive)
- Covers common patterns such as `<nav class="breadcrumb">`, `<ol class="breadcrumbs">`, `<div class="breadcrumb-wrapper">`, etc.

**Pass:** at least one element with a class matching `breadcrumb` is found

**Fail:** no breadcrumb pattern detected

---

### Check 7 — HTML lang attribute

**Weight: 2** | **Impact: Moderate**

**What it checks:** verifies that the `<html>` element declares a language via the `lang` attribute.

**How it works:**
- Matches `<html ... lang="...">` (or without quotes) with a case-insensitive regex
- Extracts the language code value

**Pass:** `lang` attribute present on `<html>` with a non-empty value

**Fail:** `lang` attribute missing or empty

---

### Check 8 — Sitemap association

**Weight: 2** | **Impact: Moderate**

**What it checks:** verifies that the tested URL appears in at least one sitemap associated with the page.

**How it works (two-phase recursive crawl):**

1. **Collect sitemap references:**
   - Scans HTML for `<link href="...sitemap...">` tags
   - Parses `Sitemap:` directives from the `robots.txt` fetched during the robots gate check

2. **Phase 1 — Locale-matched crawl:**
   - Identifies the locale path segment from the tested URL (e.g. `/us/en/`)
   - Prioritizes sitemaps whose URL contains that locale segment
   - Traverses sitemap index files recursively, deferring non-locale child sitemaps to Phase 2
   - Stops as soon as the tested URL is found

3. **Phase 2 — Fallback crawl (non-se.com origins):**
   - If Phase 1 did not find the URL, expands the search to all remaining sitemaps
   - Skipped for `se.com` origin to avoid excessive crawl scope

4. **URL matching:**
   - Compares the tested URL to sitemap `<loc>` entries after normalization (trailing slashes stripped, fragment removed)
   - Checks up to 50,000 `<loc>` entries per sitemap file
   - Caps total sitemaps checked at 80

**Pass:** tested URL found in at least one sitemap

**Fail:** URL not found after exhausting all associated sitemaps, or no sitemap references found

---

### Check 9 — Meta description

**Weight: 1** | **Impact: Low**

**What it checks:** verifies that a `<meta name="description">` tag with a non-empty `content` attribute exists.

**How it works:**
- Matches `<meta name="description" content="...">` (attribute order flexible) using a case-insensitive regex
- Extracts and displays the first 60 characters of the description

**Pass:** meta description tag present with non-empty content

**Fail:** meta description tag missing or empty

---

## Bookmarklet flow

1. Drag **Audit This Page** from the app to your browser bookmarks bar.
2. Navigate to any page you want to audit.
3. Click the bookmarklet — it redirects to this app with `?url=<current-page>` appended.
4. The app auto-fetches and runs the full audit.

This provides a quick "audit current page" workflow without copy/paste.

---

## Project structure

| File | Purpose |
|---|---|
| [index.html](index.html) | UI shell, styles, loading overlay |
| [auditor.js](auditor.js) | Detection logic, score engine, result rendering, CSV export |
| [server.js](server.js) | HTTP server, fetch proxy, bookmarklet generation |
| [sample.html](sample.html) | Sample page for local testing |
| [package.json](package.json) | Scripts and metadata |
| [bookmarklet.js](bookmarklet.js) | Legacy placeholder (dynamic bookmarklet is served by server) |

---

## Requirements

- **Node.js 18+** recommended

---

## Installation and usage

```bash
npm start
# or
node server.js
```

Open `http://localhost:3000` in your browser.

### Input methods

| Method | Steps |
|---|---|
| URL | Paste a page URL and click **Analyze Crawlability** |
| File upload | Save a page as `.html`, upload it, click **Analyze Crawlability** |
| Paste HTML | Paste raw source into the textarea, click **Analyze Crawlability** |

### Export

After analysis, click **⬇ Download CSV** to export the full audit report.

---

## Reading the results

Each result card shows:

- ✅ / ❌ status icon
- Signal name and short description
- Outcome summary (with ⚠️ warnings where applicable)
- Weight (or **GATE** label for gate checks)
- Expandable detail section:
  - Impact explanation
  - Quality rating
  - Source snippets with line numbers
  - Manual verification steps
  - Related links

---

## Troubleshooting

### "Failed to fetch" or ECONNRESET errors

Some sites block automated fetch requests at the network or WAF level. If this occurs:

- Use the bookmarklet to capture the rendered page from your browser
- Save the page as HTML and upload it
- Paste the page source directly

### Score is `0` unexpectedly

Check the three gate metrics first (shown at the top of results):

1. **robots.txt gate** — is the URL path blocked by a `Disallow` rule?
2. **noindex gate** — is there a `noindex` directive in meta robots or `X-Robots-Tag`?
3. **Canonical gate** — does the canonical URL match the tested URL?

Any failing gate forces the score to `0`.

### Bookmarklet not working

- Ensure the app is running and reachable at the URL shown
- Re-drag the bookmarklet after changing the server port or deployment URL
- Some browsers restrict bookmarklet execution — verify browser settings

---

## Notes for production usage

The server is intentionally minimal for local and self-hosted use. Before exposing publicly, consider:

- Restricting CORS policy
- Tightening `/api/fetch` target validation (allowlist origins)
- Adding security headers (CSP, HSTS, etc.)

---

## License

No license file is currently included in this repository.
