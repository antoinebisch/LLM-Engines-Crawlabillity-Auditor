# LLM Crawlability Auditor

A lightweight web auditing tool that checks how easily a page can be crawled and interpreted by search engines and LLM-driven systems.

It evaluates crawlability signals from raw HTML, computes a weighted score, and highlights what is present/missing with expandable evidence and manual verification guidance.

## What this tool does

The auditor analyzes a page through three input methods:

1. **URL fetch** (server-side fetch + analysis)
2. **HTML file upload**
3. **Raw HTML paste**

It then reports:

- A **0–100 crawlability score**
- Per-check **Pass/Fail** status
- Check **weight**, impact, and explanation
- **Source snippets** with line numbers where signals were detected
- Manual verification links/steps
- **CSV export** of the audit result

It also includes:

- A **bookmarklet** for one-click auditing from any page
- Two **gate checks** that can force score to `0` when blocking directives are found
- Browser history integration for Home/Results state navigation

## Signals and scoring model

The scoring model uses weighted checks defined in [auditor.js](auditor.js).

### Weighted signals

- Relevant paragraphs in `<main>`
- Heading structure in `<main>` (`<h1>` exactly one + `<h2>` support)
- `<title>`
- Hyperlinks in `<main>`
- Structured data (JSON-LD / microdata)
- Canonical tag (strict rules)
- Breadcrumb signal
- `<html lang="...">`
- Sitemap association check (from HTML + `robots.txt`, recursive sitemap crawling)
- Meta description

### Gate checks (critical)

Gate checks are pass/fail blockers:

- `robots.txt` path blocking
- `noindex` directives (meta or `X-Robots-Tag`)

If gate checks fail, the UI still shows all details, but final score is forced to `0`.

## How it works (architecture)

### Frontend

The app UI and audit engine are in [index.html](index.html) and [auditor.js](auditor.js):

- Renders input panel and results panel
- Runs detector functions per signal
- Computes weighted score
- Adds expandable check details
- Builds downloadable CSV report
- Handles bookmarklet bootstrap behavior (`?url=...`)

### Backend

The Node server in [server.js](server.js):

- Serves static app assets
- Serves a dynamic bookmarklet payload bound to current host/protocol
- Exposes `/api/fetch?url=...` to fetch remote HTML/XML for analysis
- Handles compression decoding (`gzip`/`deflate`/`br`) and redirects

## Bookmarklet flow

1. User drags **Audit This Page** to bookmarks.
2. On any target page, clicking the bookmarklet navigates to this app with `?url=<current-page>`.
3. App auto-fetches and audits that URL.

This provides a quick “audit current page” workflow without copy/paste.

## Project structure

- [index.html](index.html): UI shell and styles
- [auditor.js](auditor.js): analysis logic, detector engine, score computation, result rendering
- [server.js](server.js): HTTP server + fetch proxy endpoint + bookmarklet generation
- [sample.html](sample.html): sample page for testing
- [package.json](package.json): scripts and metadata
- [bookmarklet.js](bookmarklet.js): legacy placeholder file (dynamic bookmarklet is served by server)

## Requirements

- **Node.js 18+** (recommended)

## Installation

From the project root:

1. Install Node.js if not already installed.
2. Install dependencies (none currently required beyond Node runtime).

## Run locally

### Start server

Use one of:

- `npm start`
- `npm run dev`
- `node server.js`

Then open:

- `http://localhost:3000`

## How to use

### Method 1: URL

1. Paste a page URL in the URL field.
2. Click **Analyze Crawlability**.

### Method 2: Upload HTML

1. Save a webpage as `.html`.
2. Upload it using the file input.
3. Click **Analyze Crawlability**.

### Method 3: Paste HTML

1. Paste raw HTML into the textarea.
2. Click **Analyze Crawlability**.

### Export results

After analysis, click **Download CSV** to export a summary report.

## Reading the results

Each metric card shows:

- Status icon (pass/fail)
- Signal name + description
- Short summary
- Weight (or GATE label)
- Expandable details:
  - impact
  - quality
  - source snippets
  - manual verification steps
  - related links (when available)

## Canonical and sitemap behavior (strict)

### Canonical

The canonical check passes only when:

- Exactly **one** canonical tag exists
- It is located inside `<head>`

It fails when canonical is missing, duplicated, or outside `<head>`.

### Sitemaps

The sitemap check:

- Collects sitemap references from page HTML and `robots.txt`
- Resolves relative references
- Traverses sitemap indexes and leaf sitemaps recursively
- Stops early as soon as target URL is found

Pass = URL appears in at least one associated sitemap.

## Troubleshooting

### “Failed to fetch” errors

Some websites block automated fetches or reset connections. If that happens:

- Retry once
- Use bookmarklet capture flow
- Paste/upload HTML manually

### Score is `0` unexpectedly

Check gate metrics first:

- `robots.txt gate check`
- `noindex gate check`

Either failing gate will force score to `0`.

### Bookmarklet not working

- Ensure app is running and reachable
- Re-drag the bookmarklet after deployment URL changes
- Verify browser allows bookmarklets

## Notes for production usage

Current server is intentionally simple for local/self-hosted usage. Before exposing publicly, consider hardening:

- Restrict CORS policy
- Tighten `/api/fetch` target validation
- Add stricter security headers (for example CSP/HSTS policy rollout)

## License

No license file is currently included in this repository.
