// Modern Web Auditor - Using ES Modules and Modern Web Platform APIs
// Audit Configuration with semantic metadata
const AUDIT_ELEMENTS = {
    relevantParagraphs: {
        name: '<p> of relevant content (inside <main>)',
        weight: 4,
        description: 'Core paragraph texts in <main> containing primary information',
        impact: 'High - Direct source material for LLMs. Clarity and density affect synthesis quality.'
    },
    headings: {
        name: '<h1> (exactly 1) & <h2> (inside <main>)',
        weight: 4,
        description: 'Heading tags in <main>; requires exactly one <h1>',
        impact: 'High - LLMs rely on semantic structure for content chunking and context.'
    },
    title: {
        name: '<title>',
        weight: 4,
        description: 'HTML element defining the page title',
        impact: 'High - Carries semantic weight. Used for rapid entity establishment.'
    },
    hyperlinks: {
        name: 'Hyperlinks (<a> tags in <main>)',
        weight: 4,
        description: 'Links in <main> connecting pages and establishing topical relevance',
        impact: 'High - Internal links establish topical authority and context mapping.'
    },
    structuredData: {
        name: 'Structured data (schema.org)',
        weight: 4,
        description: 'Machine-readable code classifying content',
        impact: 'High - Powerful for LLMs. Direct extraction of facts, pricing, and reviews.'
    },
    breadcrumbs: {
        name: 'Breadcrumbs',
        weight: 3,
        description: 'Secondary navigation revealing user location in hierarchy',
        impact: 'Moderate-High - Help crawlers map hierarchical structure and authority.'
    },
    htmlLang: {
        name: 'HTML lang attribute',
        weight: 2,
        description: 'Declares the language of text content',
        impact: 'Moderate - Helps AI models match queries and improve semantic understanding.'
    },
    sitemaps: {
        name: 'Sitemaps (reference)',
        weight: 2,
        description: 'XML file listing website URLs for indexing',
        impact: 'Moderate - Facilitates rapid discovery of fresh content for real-time systems.'
    },
    metaDescription: {
        name: 'Meta description',
        weight: 1,
        description: 'Brief summary of page content',
        impact: 'Low - Provides initial semantic abstract during filtering phase.'
    }
};

const GATE_ELEMENTS = {
    robotsTxtGate: {
        name: 'robots.txt gate check',
        weight: 0,
        description: 'Checks whether robots.txt blocks crawling of this URL',
        impact: 'Critical - Incorrect rules can block crawl access to relevant pages.',
        isGate: true
    },
    noindexGate: {
        name: 'noindex gate check',
        weight: 0,
        description: 'Checks for noindex directives in meta robots or X-Robots-Tag',
        impact: 'Critical - noindex prevents this page from being used for indexing/citations.',
        isGate: true
    },
    canonicalGate: {
        name: 'Canonical tag gate check',
        weight: 0,
        description: 'Checks that canonical tag matches the tested URL',
        impact: 'Critical - Canonical mismatch indicates wrong page version is being tested.',
        isGate: true
    }
};

// Modern detector functions using optimized regex and DOM APIs
const DETECTORS = {
    mainContent: (html) => {
        const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
        return mainMatch ? mainMatch[1] : '';
    },
    getContentArea: (html) => {
        // First try <main> tag
        const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
        if (mainMatch && mainMatch[1]) {
            return { content: mainMatch[1], hasMain: true };
        }
        
        // Fallback to <body> but exclude header and footer
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch && bodyMatch[1]) {
            let bodyContent = bodyMatch[1];
            // Remove header and footer elements
            bodyContent = bodyContent.replace(/<header\b[^>]*>([\s\S]*?)<\/header>/gi, '');
            bodyContent = bodyContent.replace(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gi, '');
            return { content: bodyContent, hasMain: false };
        }
        
        return { content: '', hasMain: false };
    },
    relevantParagraphs: (html) => {
        const { content, hasMain } = DETECTORS.getContentArea(html);
        const pRegex = /<p(?=[\s>])[^>]*>([\s\S]*?)<\/p>/gi;
        const matches = content.match(pRegex) || [];
        const relevantPs = matches.filter(p => countWordsInHtmlFragment(p) >= 20);

        const baseMessage = relevantPs.length > 0
            ? `Found ${relevantPs.length} paragraph(s) with substantial content (20+ words)`
            : (matches.length > 0
                ? `Found ${matches.length} paragraph(s), but none reached 20 words`
                : 'No paragraph tags found');
        const locationMessage = hasMain ? 'inside <main>' : 'inside <body>';
        const warningMessage = !hasMain ? ' (⚠️ no <main> tag found, checked <body> instead)' : '';

        let sourceSnippets;
        if (relevantPs.length === 0 && matches.length > 0) {
            sourceSnippets = hasMain
                ? mainScopedSnippets(html, /<p(?=[\s>])[^>]*>[\s\S]*?<\/p>/gi, null, 6)
                : regexSnippets(html, /<p(?=[\s>])[^>]*>[\s\S]*?<\/p>/gi, 6);
        }
        
        return {
            found: relevantPs.length > 0,
            count: relevantPs.length,
            quality: relevantPs.length >= 5 ? 'high' : (relevantPs.length >= 2 ? 'medium' : 'low'),
            details: `${baseMessage} ${locationMessage}${warningMessage}`,
            sourceSnippets
        };
    },
    headings: (html) => {
        const { content, hasMain } = DETECTORS.getContentArea(html);
        const h1Regex = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
        const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
        const h1Matches = content.match(h1Regex) || [];
        const h2Matches = content.match(h2Regex) || [];
        const total = h1Matches.length + h2Matches.length;
        const exactlyOneH1 = h1Matches.length === 1;
        
        const locationMessage = hasMain ? 'inside <main>' : 'inside <body>';
        const warningMessage = !hasMain ? ' (⚠️ no <main> tag found, checked <body> instead)' : '';
        
        return {
            found: exactlyOneH1,
            count: total,
            quality: exactlyOneH1 ? 'high' : 'low',
            details: exactlyOneH1
                ? `Found exactly 1 <h1> and ${h2Matches.length} <h2> tag(s) ${locationMessage}${warningMessage}`
                : `Expected exactly 1 <h1> ${locationMessage}; found ${h1Matches.length}${warningMessage}`
        };
    },
    title: (html) => {
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const found = !!(titleMatch && titleMatch[1]?.trim());
        return {
            found,
            count: found ? 1 : 0,
            quality: found ? 'high' : 'low',
            details: found ? `Title: "${titleMatch[1].trim()}"` : 'No title found'
        };
    },
    hyperlinks: (html) => {
        const { content, hasMain } = DETECTORS.getContentArea(html);
        const linkRegex = /<a\s+[^>]*href=[^>]*>/gi;
        const matches = content.match(linkRegex) || [];
        const internalLinks = matches.filter(link => !link.match(/href=['"]https?:\/\//i));
        
        const locationMessage = hasMain ? 'inside <main>' : 'inside <body>';
        const warningMessage = !hasMain ? ' (⚠️ no <main> tag found, checked <body> instead)' : '';
        
        return {
            found: matches.length > 0,
            count: matches.length,
            quality: internalLinks.length > 0 ? 'high' : 'medium',
            details: `Found ${matches.length} link(s) ${locationMessage}, ${internalLinks.length} internal${warningMessage}`
        };
    },
    structuredData: (html) => {
        const jsonLdRegex = /<script[^>]*type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi;
        const itemTypeRegex = /itemtype=['"]([^'"]+)['"]/gi;
        const jsonLdMatches = [...html.matchAll(jsonLdRegex)];
        const jsonLdScripts = jsonLdMatches.map(match => match[1]);
        const schemaTypes = [];
        const hierarchy = [];

        for (let i = 0; i < jsonLdScripts.length; i++) {
            const script = jsonLdScripts[i];
            try {
                const parsed = JSON.parse(script);
                collectSchemaTypes(parsed, schemaTypes);
                const tree = buildSchemaHierarchy(parsed);
                if (tree.length > 0) {
                    hierarchy.push({
                        label: `JSON-LD block ${i + 1}`,
                        children: tree
                    });
                }
            } catch (e) {
                // ignore invalid JSON-LD blocks
            }
        }

        const microdataTypes = [];
        let itemTypeMatch;
        while ((itemTypeMatch = itemTypeRegex.exec(html)) !== null) {
            microdataTypes.push(itemTypeMatch[1]);
        }

        if (microdataTypes.length > 0) {
            const microdataTree = buildMicrodataHierarchy(html);
            hierarchy.push({
                label: 'Microdata',
                children: microdataTree.length > 0
                    ? microdataTree
                    : [...new Set(microdataTypes)].map(type => ({ label: type, children: [] }))
            });
        }

        const uniqueTypes = [...new Set([...schemaTypes, ...microdataTypes])];
        const total = jsonLdScripts.length + (microdataTypes.length > 0 ? 1 : 0);
        return {
            found: total > 0,
            count: total,
            quality: total >= 2 ? 'high' : (total === 1 ? 'medium' : 'low'),
            details: `Found ${jsonLdScripts.length} JSON-LD and ${microdataTypes.length > 0 ? 1 : 0} microdata schema(s)`,
            items: uniqueTypes,
            itemTree: hierarchy
        };
    },
    canonical: (html, context = {}) => {
        // Find all canonical tags anywhere in the document
        const allCanonicals = [...html.matchAll(/<link[^>]*rel=['"]?canonical['"]?[^>]*>/gi)];

        // Check how many are inside <head>
        const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
        const headHtml = headMatch ? headMatch[1] : '';
        const headCanonicals = [...headHtml.matchAll(/<link[^>]*rel=['"]?canonical['"]?[^>]*>/gi)];

        const totalCount = allCanonicals.length;
        const inHeadCount = headCanonicals.length;

        const canonicalHref = allCanonicals.length > 0
            ? (allCanonicals[0][0].match(/href=['"]([^'"]+)['"]/i)?.[1] || '')
            : '';

        const targetUrl = String(context.targetUrl || '').trim();

        const toBaseComparableUrl = (input) => {
            try {
                const u = new URL(String(input || '').trim());
                u.hash = '';
                u.search = '';
                const normalized = u.href;
                return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
            } catch {
                return '';
            }
        };

        // Fail conditions
        if (totalCount === 0) {
            return {
                found: false,
                count: 0,
                quality: 'low',
                summary: 'No canonical tag found',
                details: 'No canonical tag found',
                links: []
            };
        }

        if (totalCount > 1) {
            const hrefs = allCanonicals
                .map(m => m[0].match(/href=['"]([^'"]+)['"]/i)?.[1] || '(no href)')
                .join(', ');
            return {
                found: false,
                count: totalCount,
                quality: 'low',
                summary: `Multiple canonical tags found (${totalCount}) — only one is allowed`,
                details: `Multiple canonical tags found (${totalCount}) — only one is allowed. Found: ${hrefs}`,
                links: allCanonicals.map(m => m[0].match(/href=['"]([^'"]+)['"]/i)?.[1] || '').filter(Boolean)
            };
        }

        if (inHeadCount === 0 && totalCount === 1) {
            return {
                found: false,
                count: 1,
                quality: 'low',
                summary: `Canonical tag found outside <head>`,
                details: `Canonical tag found outside <head> — it must be placed inside <head> to be recognised. Href: ${canonicalHref || '(no href)'}`,
                links: canonicalHref ? [canonicalHref] : []
            };
        }

        if (!canonicalHref) {
            return {
                found: false,
                count: 1,
                quality: 'low',
                summary: 'Canonical tag missing href',
                details: 'Canonical tag is present but href is missing or empty.',
                links: []
            };
        }

        const resolvedCanonicalUrl = normalizeUrl(targetUrl || canonicalHref, canonicalHref) || canonicalHref;
        const normalizedCanonicalUrl = normalizeComparableUrl(resolvedCanonicalUrl);

        if (!targetUrl) {
            return {
                found: true,
                count: 1,
                quality: 'medium',
                summary: 'Canonical present (target URL not provided)',
                details: `Canonical tag present in <head>, but tested URL was not provided so URL match could not be validated. Canonical: ${resolvedCanonicalUrl}`,
                links: resolvedCanonicalUrl ? [resolvedCanonicalUrl] : []
            };
        }

        const normalizedTargetUrl = normalizeComparableUrl(targetUrl);
        const targetBaseUrl = toBaseComparableUrl(targetUrl);
        const canonicalBaseUrl = toBaseComparableUrl(resolvedCanonicalUrl);
        const hasParams = (() => {
            try {
                return new URL(targetUrl).search.length > 0;
            } catch {
                return false;
            }
        })();

        if (normalizedCanonicalUrl && normalizedTargetUrl && normalizedCanonicalUrl === normalizedTargetUrl) {
            return {
                found: true,
                count: 1,
                quality: 'high',
                summary: 'Canonical URL matches tested URL',
                details: `Canonical tag present in <head> and matches tested URL: ${resolvedCanonicalUrl}`,
                links: [resolvedCanonicalUrl]
            };
        }

        if (hasParams && canonicalBaseUrl && targetBaseUrl && canonicalBaseUrl === targetBaseUrl) {
            return {
                found: true,
                count: 1,
                quality: 'medium',
                summary: '⚠️ Canonical URL points to base URL without parameters',
                details: `⚠️ Canonical URL points to base URL without parameters. Tested URL: ${targetUrl}. Canonical: ${resolvedCanonicalUrl}`,
                links: [resolvedCanonicalUrl]
            };
        }

        return {
            found: false,
            count: 1,
            quality: 'low',
            summary: 'Canonical URL does not match tested URL',
            details: `Canonical URL does not match tested URL. Tested URL: ${targetUrl}. Canonical: ${resolvedCanonicalUrl}`,
            links: [resolvedCanonicalUrl]
        };
    },
    breadcrumbs: (html) => {
        const breadcrumbPattern = /<[^>]*\b(?:class|id)\s*=\s*['"]?[^'">]*breadcrumb[^'">]*['"]?[^>]*>/gi;
        const match = html.match(breadcrumbPattern);
        return {
            found: !!match,
            count: match ? 1 : 0,
            quality: match ? 'high' : 'low',
            details: match ? 'Breadcrumb navigation detected' : 'No breadcrumb navigation found'
        };
    },
    htmlLang: (html) => {
        const langMatch = html.match(/<html[^>]*lang=['"]?([^'">\s]+)/i);
        const found = !!langMatch;
        return {
            found,
            count: found ? 1 : 0,
            quality: found ? 'high' : 'low',
            details: found ? `Language: ${langMatch[1]}` : 'No lang attribute found'
        };
    },
    sitemaps: async (html, context = {}) => {
        const sitemapMatches = [...html.matchAll(/<link[^>]*href=['"]([^'">\s]*sitemap[^'">\s]*)['"]?[^>]*>/gi)];
        const htmlSitemapLinks = sitemapMatches.map(m => m[1]);

        const robotsTxt = String(context.robotsTxtContent || '');
        const robotsSitemapMatches = [...robotsTxt.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gmi)];
        const robotsSitemapLinks = robotsSitemapMatches.map(m => m[1]);

        const rawSitemapLinks = [...new Set([...htmlSitemapLinks, ...robotsSitemapLinks])];
        const targetUrl = String(context.targetUrl || '').trim();
        const sitemapLinks = rawSitemapLinks
            .map(link => normalizeUrl(targetUrl, link) || link)
            .filter(link => /^https?:\/\//i.test(link));

        if (!targetUrl) {
            return {
                found: false,
                count: 0,
                quality: 'low',
                details: 'Cannot validate sitemap inclusion because no target URL was provided',
                links: sitemapLinks
            };
        }

        if (sitemapLinks.length === 0) {
            return {
                found: false,
                count: 0,
                quality: 'low',
                details: 'No associated sitemap links found in HTML or robots.txt',
                links: []
            };
        }

        const sitemapCheck = await findUrlInAssociatedSitemaps(sitemapLinks, targetUrl);
        if (sitemapCheck.found) {
            return {
                found: true,
                count: 1,
                quality: 'high',
                details: `URL is listed in sitemap: ${sitemapCheck.matchedSitemap} (checked ${sitemapCheck.checkedCount} sitemap file(s))`,
                links: sitemapCheck.matchedSitemap ? [sitemapCheck.matchedSitemap] : []
            };
        }

        return {
            found: false,
            count: 0,
            quality: 'low',
            details: `URL not found in associated sitemaps after checking ${sitemapCheck.checkedCount} sitemap file(s)`,
            links: sitemapCheck.checkedSitemaps
        };
    },
    metaDescription: (html) => {
        const descMatch = html.match(/<meta[^>]*name=['"]?description['"]?[^>]*content=['"]?([^'"]+)/i);
        const found = !!descMatch;
        return {
            found,
            count: found ? 1 : 0,
            quality: found ? 'high' : 'low',
            details: found ? `Meta description: "${descMatch[1].substring(0, 60)}..."` : 'No meta description found'
        };
    }
};

// Runtime audit state
let lastAuditedSource = '';
let lastAuditedHtml = '';
let lastAuditResults = null;
let lastAuditScore = 0;

function getBookmarkletBaseUrl() {
    const hostname = window.location.hostname;
    const origin = window.location.origin;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:3000';
    }

    if (origin && origin !== 'null') {
        return origin;
    }

    return 'http://localhost:3000';
}

function escapeForSingleQuotedJsString(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

function buildBookmarkletCode() {
    const baseUrl = getBookmarkletBaseUrl();
    const bookmarkletUrl = escapeForSingleQuotedJsString(`${baseUrl}/?url=`);
    return `(function(){var u='${bookmarkletUrl}'+encodeURIComponent(location.href);window.location.href=u;})()`;
}

function getCleanAppUrl() {
    return `${window.location.pathname}${window.location.hash || ''}`;
}

function setAppHistoryState(view, { replace = false } = {}) {
    const state = { view };
    const url = getCleanAppUrl();

    if (replace) {
        history.replaceState(state, '', url);
    } else {
        history.pushState(state, '', url);
    }
}

function showHomeView({ updateHistory = false, focusUrlInput = true } = {}) {
    clearInput();
    if (updateHistory) {
        const currentView = history.state?.view;
        setAppHistoryState('home', { replace: currentView === 'results' || currentView === 'home' });
    }

    if (focusUrlInput) {
        const urlInput = document.getElementById('urlInput');
        if (urlInput) urlInput.focus();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Initialize the auditor on page load
 * Modern approach: event delegation, async/await, proper error handling
 */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        loadBookmarkletCode();
        setupEventListeners();
        setupMessageListener();

        // Read bookmarklet URL param before history normalization removes query params
        const params = new URLSearchParams(window.location.search);
        const sourceUrl = params.get('url');

        setAppHistoryState('home', { replace: true });

        window.addEventListener('popstate', () => {
            if (history.state?.view === 'results' && lastAuditResults) {
                displayResults(lastAuditResults, lastAuditScore, lastAuditedSource, { updateHistory: false });
            } else {
                showHomeView({ updateHistory: false, focusUrlInput: false });
            }
        });

        // Auto-analyze if ?url= param is present (from bookmarklet)
        if (sourceUrl) {
            const urlInput = document.getElementById('urlInput');
            if (urlInput) urlInput.value = sourceUrl;
            analyzeContent();
        }
    } catch (error) {
        console.error('Initialization error:', error);
    }
});

/**
 * Load bookmarklet code asynchronously using Fetch API
 */
function loadBookmarkletCode() {
    const bookmarkletLink = document.getElementById('bookmarkletLink');
    if (!bookmarkletLink) return;

    const currentHref = bookmarkletLink.getAttribute('href') || '';
    if (!currentHref.startsWith('javascript:')) {
        bookmarkletLink.href = 'javascript:' + buildBookmarkletCode();
    }
}

/**
 * Setup event listeners using modern delegation patterns
 */
function setupEventListeners() {
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', analyzeContent);
    }

    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearInput);
    }

    const homeReturnBtn = document.getElementById('homeReturnBtn');
    if (homeReturnBtn) {
        homeReturnBtn.addEventListener('click', goHome);
    }

    const fileInput = document.getElementById('fileInput');
    
    if (fileInput) {
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.addEventListener('load', (e) => {
                    const html = e.target?.result;
                    if (typeof html === 'string') {
                        document.getElementById('htmlInput').value = html;
                    }
                });
                reader.readAsText(file);
            }
        });
    }

    // Handle URL input Enter key
    const urlInput = document.getElementById('urlInput');
    if (urlInput) {
        urlInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                analyzeContent();
            }
        });
    }

    const metricsContainer = document.getElementById('metricsContainer');
    if (metricsContainer) {
        metricsContainer.addEventListener('click', (event) => {
            const toggleButton = event.target.closest('.metric-toggle');
            if (toggleButton) {
                const metricId = toggleButton.getAttribute('data-metric-id');
                if (metricId) toggleMetricDetails(metricId);
                return;
            }

            const sourceToggleButton = event.target.closest('.schema-source-toggle');
            if (sourceToggleButton) {
                toggleSchemaSource(sourceToggleButton);
            }
        });
    }
}

/**
 * Build audit context shared across detectors.
 */
function buildAuditContext(_htmlContent, _targetUrl, robotsTxtContent = '') {
    return {
        robotsTxtContent,
        targetUrl: _targetUrl || ''
    };
}

function decodeXmlEntities(value) {
    return String(value || '')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .trim();
}

function normalizeComparableUrl(input) {
    try {
        const u = new URL(String(input || '').trim());
        u.hash = '';
        const normalized = u.href;
        return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
    } catch {
        return '';
    }
}

function extractSitemapLocs(xmlText, max = 200) {
    const locRx = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
    const urls = [];
    let match;
    while ((match = locRx.exec(xmlText)) !== null && urls.length < max) {
        const decoded = decodeXmlEntities(match[1]);
        if (decoded) urls.push(decoded);
    }
    return urls;
}

function sitemapContainsTargetUrl(xmlText, sitemapUrl, targetNormalized, maxUrlsToCheck = 50000) {
    const locRx = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
    let match;
    let checked = 0;

    while ((match = locRx.exec(xmlText)) !== null && checked < maxUrlsToCheck) {
        checked += 1;
        const decoded = decodeXmlEntities(match[1]);
        const normalizedLoc = normalizeComparableUrl(normalizeUrl(sitemapUrl, decoded) || decoded);
        if (normalizedLoc && normalizedLoc === targetNormalized) {
            return true;
        }
    }

    return false;
}

async function fetchRemoteDocument(url) {
    try {
        const response = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`);
        if (!response.ok) return '';
        const data = await response.json();
        return String(data.html || '');
    } catch {
        return '';
    }
}

function extractLocalePath(url) {
    try {
        const parsed = new URL(String(url || ''));
        const pathname = parsed.pathname || '';
        // Extract locale path (e.g., /ch/fr/ from https://www.example.com/ch/fr/page)
        const match = pathname.match(/^(\/[a-z]{2}(?:\/[a-z]{2})?\/)/i);
        return match ? match[1].toLowerCase() : '';
    } catch {
        return '';
    }
}

function isLocaleMatchingSitemap(sitemapUrl, localePath) {
    if (!localePath) return false;
    return String(sitemapUrl || '').toLowerCase().includes(localePath.replace(/\/$/, ''));
}

function prioritizeSitemapsByLocale(sitemaps, targetUrl) {
    const localePath = extractLocalePath(targetUrl);
    if (!localePath) return sitemaps;
    
    const matching = [];
    const nonMatching = [];
    
    for (const sitemap of sitemaps) {
        if (isLocaleMatchingSitemap(sitemap, localePath)) {
            matching.push(sitemap);
        } else {
            nonMatching.push(sitemap);
        }
    }
    
    return [...matching, ...nonMatching];
}

async function findUrlInAssociatedSitemaps(initialSitemaps, targetUrl) {
    const targetNormalized = normalizeComparableUrl(targetUrl);
    if (!targetNormalized) {
        return {
            found: false,
            checkedCount: 0,
            matchedSitemap: '',
            checkedSitemaps: []
        };
    }

    const uniqueInitial = [...new Set(initialSitemaps)].filter(Boolean);
    const targetUrlObj = (() => { try { return new URL(String(targetUrl || '')); } catch { return null; } })();
    const isSeComOrigin = targetUrlObj && targetUrlObj.origin === 'https://www.se.com';

    const localePath = extractLocalePath(targetUrl);
    const localeQueue = [];
    const fallbackQueue = [];

    if (localePath) {
        for (const sitemap of uniqueInitial) {
            if (isLocaleMatchingSitemap(sitemap, localePath)) {
                localeQueue.push(sitemap);
            } else {
                fallbackQueue.push(sitemap);
            }
        }
    } else {
        fallbackQueue.push(...uniqueInitial);
    }

    const queued = new Set(uniqueInitial);
    const visited = new Set();
    const maxSitemapsToCheck = 80;
    let matchedSitemap = '';

    async function processPhase(seedQueue, deferredQueue, deferNonLocaleChildren) {
        const standardQueue = [];
        const indexQueue = [];

        while (visited.size < maxSitemapsToCheck && (seedQueue.length > 0 || standardQueue.length > 0 || indexQueue.length > 0)) {
            // Classify available sitemaps while favoring standard sitemap checks before index checks.
            while (standardQueue.length === 0 && seedQueue.length > 0 && visited.size < maxSitemapsToCheck) {
                const sitemapUrl = seedQueue.shift();
                if (!sitemapUrl || visited.has(sitemapUrl)) continue;

                visited.add(sitemapUrl);
                const xmlText = await fetchRemoteDocument(sitemapUrl);
                if (!xmlText) continue;

                if (/<sitemapindex\b/i.test(xmlText)) {
                    indexQueue.push({ sitemapUrl, xmlText });
                } else {
                    standardQueue.push({ sitemapUrl, xmlText });
                }
            }

            if (standardQueue.length > 0) {
                const { sitemapUrl, xmlText } = standardQueue.shift();
                const foundInStandardSitemap = sitemapContainsTargetUrl(xmlText, sitemapUrl, targetNormalized, 50000);
                if (foundInStandardSitemap) {
                    matchedSitemap = sitemapUrl;
                    return true;
                }
                continue;
            }

            if (indexQueue.length > 0) {
                const { sitemapUrl, xmlText } = indexQueue.shift();
                const childLocs = extractSitemapLocs(xmlText, 50000)
                    .map(loc => normalizeUrl(sitemapUrl, loc) || loc)
                    .filter(loc => /^https?:\/\//i.test(loc));

                const prioritizedChildren = prioritizeSitemapsByLocale(childLocs, targetUrl);
                for (const child of prioritizedChildren) {
                    if (!child || visited.has(child) || queued.has(child)) continue;

                    if (deferNonLocaleChildren && localePath && !isLocaleMatchingSitemap(child, localePath)) {
                        deferredQueue.push(child);
                    } else {
                        seedQueue.push(child);
                    }
                    queued.add(child);
                }
            }
        }

        return false;
    }

    // Phase 1: current /cc/lc/ only, with standard sitemaps before indexes.
    if (localeQueue.length > 0) {
        const foundInLocalePhase = await processPhase(localeQueue, fallbackQueue, true);
        if (foundInLocalePhase) {
            return {
                found: true,
                checkedCount: visited.size,
                matchedSitemap,
                checkedSitemaps: Array.from(visited)
            };
        }
    }

    // Phase 2: fallback (alphabetical seed order), still checking standard sitemaps before indexes.
    // Skip fallback phase for se.com origin - only check locale-matched sitemaps.
    if (!isSeComOrigin) {
        const foundInFallbackPhase = await processPhase(fallbackQueue, fallbackQueue, false);
        if (foundInFallbackPhase) {
            return {
                found: true,
                checkedCount: visited.size,
                matchedSitemap,
                checkedSitemaps: Array.from(visited)
            };
        }
    }

    return {
        found: false,
        checkedCount: visited.size,
        matchedSitemap: '',
        checkedSitemaps: Array.from(visited)
    };
}

/**
 * Modern message listener for bookmarklet data using postMessage API
 */
function setupMessageListener() {
    window.addEventListener('message', async (event) => {
        // Always validate origin in production
        if (event.data?.type === 'AUDITOR_DATA' && event.data?.html) {
            const { html, pageUrl } = event.data;
            const urlInput = document.getElementById('urlInput');
            if (urlInput && pageUrl) {
                urlInput.value = pageUrl;
            }

            const gateEvaluation = await runGateChecks({
                htmlContent: html,
                targetUrl: pageUrl,
                responseHeaders: {}
            });

            const auditContext = buildAuditContext(html, pageUrl, gateEvaluation.robotsTxtContent || '');
            await runAnalysis(html, pageUrl || 'Bookmarklet capture', gateEvaluation.results, auditContext, {
                forceZeroScore: !gateEvaluation.allPassed
            });
        }
    }, { once: false });
}

/**
 * Main analyze function with proper error handling
 */
async function analyzeContent() {
    const urlInput = document.getElementById('urlInput');
    const htmlInput = document.getElementById('htmlInput');
    const fileInput = document.getElementById('fileInput');

    let htmlContent = htmlInput.value.trim();
    const url = urlInput.value.trim();
    let responseHeaders = {};
    let finalUrl = url;

    try {
        if (url && !htmlContent) {
            // Fetch URL content
            showLoading(true, 'Fetching page content...');
            const response = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`);
            if (!response.ok) {
                let apiError = `HTTP ${response.status}`;
                try {
                    const errData = await response.json();
                    if (errData?.error) apiError = errData.error;
                } catch { /* ignore */ }
                throw new Error(`Failed to fetch: ${apiError}`);
            }
            const data = await response.json();
            htmlContent = data.html;
            responseHeaders = data.headers || {};
            finalUrl = data.finalUrl || url;
        } else if (!htmlContent && fileInput.files?.[0]) {
            // File upload is handled by change event
            showLoading(false);
            return;
        }

        if (!htmlContent) {
            showError('Please enter a URL, upload a file, or paste HTML content');
            return;
        }

        showLoading(true, 'Preparing audit checks...');
        const gateEvaluation = await runGateChecks({
            htmlContent,
            targetUrl: finalUrl || url,
            responseHeaders,
            onProgress: (message) => setLoadingMessage(message)
        });

        const auditContext = buildAuditContext(htmlContent, finalUrl || url, gateEvaluation.robotsTxtContent || '');
        await runAnalysis(htmlContent, finalUrl || url || 'Pasted content', gateEvaluation.results, auditContext, {
            forceZeroScore: !gateEvaluation.allPassed,
            onProgress: (message) => setLoadingMessage(message)
        });
    } catch (error) {
        const msg = String(error?.message || 'Unknown error');
        if (/Failed to fetch:/i.test(msg)) {
            showError(`Error: ${msg}. The target site is refusing/resetting the connection from this environment. Try again, or analyze using pasted HTML / bookmarklet capture.`);
        } else {
            showError(`Error: ${msg}`);
        }
        console.error('Analysis error:', error);
    } finally {
        showLoading(false);
    }
}

function parseRobotsRules(robotsTxt, userAgent = '*') {
    const lines = robotsTxt
        .split(/\r?\n/)
        .map(line => line.replace(/#.*/, '').trim())
        .filter(Boolean);

    const groups = [];
    let currentGroup = { agents: [], rules: [] };

    for (const line of lines) {
        const parts = line.split(':');
        if (parts.length < 2) continue;
        const key = parts[0].trim().toLowerCase();
        const value = parts.slice(1).join(':').trim();

        if (key === 'user-agent') {
            if (currentGroup.rules.length) {
                groups.push(currentGroup);
                currentGroup = { agents: [], rules: [] };
            }
            currentGroup.agents.push(value.toLowerCase());
        } else if (key === 'allow' || key === 'disallow') {
            currentGroup.rules.push({ type: key, pattern: value });
        }
    }

    if (currentGroup.agents.length || currentGroup.rules.length) {
        groups.push(currentGroup);
    }

    const normalizedAgent = userAgent.toLowerCase();
    const matchedGroup = groups.find(g => g.agents.includes(normalizedAgent))
        || groups.find(g => g.agents.includes('*'));

    return matchedGroup ? matchedGroup.rules : [];
}

function robotsPatternMatches(pathname, pattern) {
    if (!pattern) return false;
    if (pattern === '/') return true;

    const escaped = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
    const regexSource = pattern.endsWith('$') ? escaped : `${escaped}.*`;
    const regex = new RegExp(`^${regexSource}`);
    return regex.test(pathname);
}

function isBlockedByRobots(pathname, rules) {
    let bestMatch = null;

    for (const rule of rules) {
        if (!rule.pattern || !robotsPatternMatches(pathname, rule.pattern)) continue;
        const specificity = rule.pattern.replace(/\*/g, '').length;

        if (!bestMatch || specificity > bestMatch.specificity) {
            bestMatch = { ...rule, specificity };
        }
    }

    return bestMatch ? bestMatch.type === 'disallow' : false;
}

function hasNoindexDirective(htmlContent, responseHeaders = {}) {
    const metaRobotsRegex = /<meta[^>]+name=["'](?:robots|googlebot|bingbot)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
    const xRobotsTag = String(responseHeaders['x-robots-tag'] || '').toLowerCase();

    const metaMatches = [];
    let match;
    while ((match = metaRobotsRegex.exec(htmlContent)) !== null) {
        metaMatches.push(match[1].toLowerCase());
    }

    const metaHasNoindex = metaMatches.some(content => content.includes('noindex'));
    const headerHasNoindex = xRobotsTag.includes('noindex');

    return {
        failed: metaHasNoindex || headerHasNoindex,
        metaHasNoindex,
        headerHasNoindex
    };
}

async function runGateChecks({ htmlContent, targetUrl, responseHeaders, onProgress = null }) {
    const results = {};
    let robotsTxtContent = '';

    const reportProgress = (message) => {
        if (typeof onProgress === 'function') onProgress(message);
    };

    // Gate 1: robots.txt
    let robotsPass = true;
    let robotsDetails = 'URL not provided: robots.txt gate could not be validated.';
    let robotsTxtUrl = '';

    if (targetUrl) {
        try {
            reportProgress('Checking robots.txt gate...');
            const parsed = new URL(targetUrl);
            const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
            robotsTxtUrl = robotsUrl;
            const robotsResponse = await fetch(`/api/fetch?url=${encodeURIComponent(robotsUrl)}`);

            if (robotsResponse.ok) {
                const robotsData = await robotsResponse.json();
                robotsTxtContent = robotsData.html || '';
                const rules = parseRobotsRules(robotsData.html || '', '*');
                const blocked = isBlockedByRobots(parsed.pathname || '/', rules);

                robotsPass = !blocked;
                robotsDetails = blocked
                    ? `Blocked by robots.txt for path ${parsed.pathname || '/'} (User-agent: *).`
                    : `Not blocked by robots.txt for path ${parsed.pathname || '/'} (User-agent: *).`;
            } else {
                robotsPass = true;
                robotsDetails = 'robots.txt unavailable; treated as pass (default crawlable).';
            }
        } catch (err) {
            robotsPass = true;
            robotsDetails = 'robots.txt could not be evaluated; treated as pass.';
        }
    }

    results.robotsTxtGate = {
        ...GATE_ELEMENTS.robotsTxtGate,
        found: robotsPass,
        count: robotsPass ? 1 : 0,
        quality: robotsPass ? 'high' : 'low',
        details: robotsDetails,
        verificationUrl: robotsTxtUrl
    };

    // Gate 2: noindex
    reportProgress('Checking noindex gate...');
    const noindexCheck = hasNoindexDirective(htmlContent, responseHeaders);
    const noindexPass = !noindexCheck.failed;
    let noindexDetails = 'No noindex directive found in meta robots or X-Robots-Tag.';
    if (!noindexPass) {
        const sources = [];
        if (noindexCheck.metaHasNoindex) sources.push('meta robots');
        if (noindexCheck.headerHasNoindex) sources.push('X-Robots-Tag header');
        noindexDetails = `noindex detected in ${sources.join(' and ')}.`;
    }

    results.noindexGate = {
        ...GATE_ELEMENTS.noindexGate,
        found: noindexPass,
        count: noindexPass ? 1 : 0,
        quality: noindexPass ? 'high' : 'low',
        details: noindexDetails
    };

    // Gate 3: canonical URL validity (must pass canonical detector)
    reportProgress('Checking canonical gate...');
    const canonicalGateResult = DETECTORS.canonical(htmlContent, { targetUrl });
    const canonicalPass = !!canonicalGateResult?.found;
    let canonicalDetails = canonicalGateResult?.details || 'Canonical check failed.';

    results.canonicalGate = {
        ...GATE_ELEMENTS.canonicalGate,
        found: canonicalPass,
        count: canonicalPass ? 1 : 0,
        quality: canonicalPass ? (canonicalGateResult?.quality || 'high') : 'low',
        details: canonicalDetails,
        ...canonicalGateResult
    };

    return {
        allPassed: robotsPass && noindexPass && canonicalPass,
        results,
        robotsTxtContent
    };
}

/**
 * Execute the analysis with modern patterns
 */
async function runAnalysis(htmlContent, source, gateResults = {}, context = {}, options = {}) {
    try {
        lastAuditedHtml = htmlContent;
        const results = { ...gateResults };
        const maxScore = Object.values(AUDIT_ELEMENTS).reduce((sum, el) => sum + el.weight, 0);
        let totalScore = 0;
        const reportProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const auditEntries = Object.entries(AUDIT_ELEMENTS);

        // Analyze each element
        for (let index = 0; index < auditEntries.length; index += 1) {
            const [key, element] = auditEntries[index];
            if (reportProgress) {
                const readableName = String(element.name || key).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
                reportProgress(`Running check ${index + 1}/${auditEntries.length}: ${readableName}`);
            }

            const detection = await DETECTORS[key](htmlContent, context);
            results[key] = { ...element, ...detection };
            if (detection.found) {
                totalScore += element.weight;
            }
        }

        if (reportProgress) reportProgress('Finalizing audit results...');

        const computedScore = Math.round((totalScore / maxScore) * 100);
        const score = options.forceZeroScore ? 0 : computedScore;
        displayResults(results, score, source, { updateHistory: true });
    } catch (error) {
        showError(`Analysis error: ${error.message}`);
        console.error('Error during analysis:', error);
    }
}

/**
 * Display results using modern DOM manipulation
 */
function displayResults(results, score, source, { updateHistory = true } = {}) {
    const emptyState = document.getElementById('emptyState');
    const resultsContent = document.getElementById('resultsContent');
    const scoreCircle = document.getElementById('scoreCircle');
    const metricsContainer = document.getElementById('metricsContainer');
    const container = document.querySelector('.container');
    const resultsSection = container.querySelector('section:has(#auditedUrlLine)') || container.querySelector('section.card:last-of-type');
    
    lastAuditedSource = source || '';
    lastAuditResults = results;
    lastAuditScore = score;

    // Create or update top-right CSV download button
    let topRightCsvBtn = document.getElementById('csvDownloadBtnTopRight');
    if (!topRightCsvBtn) {
        topRightCsvBtn = document.createElement('button');
        topRightCsvBtn.id = 'csvDownloadBtnTopRight';
        topRightCsvBtn.type = 'button';
        topRightCsvBtn.textContent = '⬇ Download CSV';
        topRightCsvBtn.className = 'csv-download-btn top-right';
        topRightCsvBtn.addEventListener('click', downloadAuditCsv);
        resultsSection.appendChild(topRightCsvBtn);
    }

    // Create or update bottom-centered CSV download button
    let bottomCsvBtn = document.getElementById('csvDownloadBtnBottom');
    if (!bottomCsvBtn) {
        bottomCsvBtn = document.createElement('button');
        bottomCsvBtn.id = 'csvDownloadBtnBottom';
        bottomCsvBtn.type = 'button';
        bottomCsvBtn.textContent = '⬇ Download CSV';
        bottomCsvBtn.className = 'csv-download-btn bottom-center';
        bottomCsvBtn.addEventListener('click', downloadAuditCsv);
        resultsSection.appendChild(bottomCsvBtn);
    }

    // Hide empty state, show results and hide input section
    if (emptyState) emptyState.style.display = 'none';
    if (resultsContent) resultsContent.style.display = 'block';
    if (container) container.classList.add('results-showing');

    if (updateHistory) {
        const currentView = history.state?.view;
        setAppHistoryState('results', { replace: currentView === 'results' });
    }

    // Show audited page link
    const auditedUrlLine = document.getElementById('auditedUrlLine');
    if (auditedUrlLine) {
        if (source && /^https?:\/\//i.test(source)) {
            auditedUrlLine.innerHTML = `Audited: <a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source)}</a>`;
            auditedUrlLine.removeAttribute('hidden');
        } else if (source) {
            auditedUrlLine.textContent = `Audited: ${source}`;
            auditedUrlLine.removeAttribute('hidden');
        } else {
            auditedUrlLine.setAttribute('hidden', '');
        }
    }

    // Update score circle with appropriate class
    let scoreClass = 'poor';
    if (score >= 80) scoreClass = 'excellent';
    else if (score >= 60) scoreClass = 'good';
    else if (score >= 40) scoreClass = 'fair';

    if (scoreCircle) {
        scoreCircle.className = `score-circle ${scoreClass}`;
        scoreCircle.innerHTML = `<span>${score}</span><span class="score-label">%</span>`;
    }

    // Render metrics
    if (metricsContainer) {
        metricsContainer.innerHTML = Object.entries(results)
            .map(([key, data]) => createMetricElement(key, data))
            .join('');
    }

    // Update URL display
    const urlInput = document.getElementById('urlInput');
    if (urlInput && source !== 'Pasted content') {
        urlInput.value = source;
    }
    
    // Hide loading
    showLoading(false);
}

/**
 * Export the last audit as a CSV download
 */
function downloadAuditCsv() {
    if (!lastAuditResults) return;

    const GATE_KEYS = new Set(Object.keys(GATE_ELEMENTS));
    const csvRows = [];

    // Header
    csvRows.push(['Audit Date', 'Page / Source', 'Overall Score (%)'].join(','));
    csvRows.push([
        new Date().toISOString().slice(0, 10),
        csvQuote(lastAuditedSource || 'N/A'),
        lastAuditScore
    ].join(','));

    csvRows.push([]);

    // Checks header
    csvRows.push(['Check', 'Type', 'Weight / Impact', 'Pass / Fail', 'Outcome'].join(','));

    for (const [key, data] of Object.entries(lastAuditResults)) {
        const isGate = GATE_KEYS.has(key);
        const type = isGate ? 'Gate' : 'Signal';
        const weight = isGate ? 'GATE' : `Weight: ${data.weight}`;
        const passed = data.found ? 'Pass' : 'Fail';
        const outcome = data.summary || data.details || '';
        csvRows.push([
            csvQuote(data.name || key),
            type,
            weight,
            passed,
            csvQuote(outcome)
        ].join(','));
    }

    const csvContent = csvRows.map(r => Array.isArray(r) ? r.join(',') : r).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = `llm-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function csvQuote(value) {
    const str = String(value || '').replace(/"/g, '""');
    return `"${str}"`;
}

/**
 * Create metric element with semantic HTML
 */
/**
 * Escape HTML special characters to prevent tags from being rendered
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function collectSchemaTypes(node, accumulator) {
    if (!node) return;

    if (Array.isArray(node)) {
        for (const item of node) collectSchemaTypes(item, accumulator);
        return;
    }

    if (typeof node === 'object') {
        const typeValue = node['@type'];
        if (Array.isArray(typeValue)) {
            for (const t of typeValue) accumulator.push(String(t));
        } else if (typeValue) {
            accumulator.push(String(typeValue));
        }

        if (node['@graph']) {
            collectSchemaTypes(node['@graph'], accumulator);
        }

        for (const value of Object.values(node)) {
            if (typeof value === 'object') collectSchemaTypes(value, accumulator);
        }
    }
}

function buildSchemaHierarchy(node, keyName = '') {
    if (!node) return [];

    if (Array.isArray(node)) {
        return node.flatMap(item => buildSchemaHierarchy(item, keyName));
    }

    if (typeof node !== 'object') return [];

    const typeValue = node['@type'];
    const types = Array.isArray(typeValue)
        ? typeValue.map(String)
        : (typeValue ? [String(typeValue)] : []);

    const childNodes = [];
    for (const [childKey, childValue] of Object.entries(node)) {
        if (childKey === '@context' || childKey === '@type' || childKey === '@id') continue;
        childNodes.push(...buildSchemaHierarchy(childValue, childKey));
    }

    if (types.length > 0) {
        return [{
            label: types.join(' | '),
            rawCode: JSON.stringify(node, null, 2),
            children: childNodes
        }];
    }

    if (childNodes.length > 0 && keyName) {
        return [{
            label: keyName,
            children: childNodes
        }];
    }

    return childNodes;
}

function renderHierarchyNodes(nodes, path = 'root') {
    if (!Array.isArray(nodes) || nodes.length === 0) return '';

    const listItems = nodes.map((node, index) => {
        const nodePath = `${path}-${index}`;
        const codeBlockId = `schema-source-${nodePath}`;
        const toggleControl = node.rawCode
            ? `<button type="button" class="schema-source-toggle" data-target-id="${codeBlockId}" aria-expanded="false">View source</button>`
            : '';
        const codeBlock = node.rawCode
            ? `<pre id="${codeBlockId}" class="metric-code-block" hidden><code>${escapeHtml(node.rawCode)}</code></pre>`
            : '';

        return `
            <li>
                ${escapeHtml(node.label || 'item')}
                ${toggleControl}
                ${codeBlock}
                ${renderHierarchyNodes(node.children || [], nodePath)}
            </li>
        `;
    }).join('');

    return `<ul class="metric-detail-list">${listItems}</ul>`;
}

function toggleSchemaSource(button) {
    const targetId = button.getAttribute('data-target-id');
    if (!targetId) return;

    const codeBlock = document.getElementById(targetId);
    if (!codeBlock) return;

    const willExpand = codeBlock.hasAttribute('hidden');
    if (willExpand) {
        codeBlock.removeAttribute('hidden');
        button.setAttribute('aria-expanded', 'true');
        button.textContent = 'Hide source';
    } else {
        codeBlock.setAttribute('hidden', '');
        button.setAttribute('aria-expanded', 'false');
        button.textContent = 'View source';
    }
}

function buildMicrodataHierarchy(html) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const scopedElements = [...doc.querySelectorAll('[itemscope][itemtype]')];
        if (scopedElements.length === 0) return [];

        const nodeMap = new Map();
        for (const el of scopedElements) {
            const type = (el.getAttribute('itemtype') || '').trim();
            const prop = (el.getAttribute('itemprop') || '').trim();
            const label = prop ? `${prop} → ${type}` : type;
            nodeMap.set(el, {
                label,
                rawCode: el.outerHTML,
                children: []
            });
        }

        const roots = [];
        for (const el of scopedElements) {
            const node = nodeMap.get(el);
            let parent = el.parentElement;
            let parentScope = null;

            while (parent) {
                if (nodeMap.has(parent)) {
                    parentScope = parent;
                    break;
                }
                parent = parent.parentElement;
            }

            if (parentScope) {
                nodeMap.get(parentScope).children.push(node);
            } else {
                roots.push(node);
            }
        }

        return roots;
    } catch {
        return [];
    }
}

function lineNumberAtIndex(text, index) {
    if (!text || index < 0) return 1;
    return text.slice(0, index).split(/\r?\n/).length;
}

function countWordsInHtmlFragment(htmlFragment) {
    const text = String(htmlFragment || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&[a-z0-9#]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return text ? text.split(/\s+/).length : 0;
}

function createSourceSnippet(rawHtml, snippet, index) {
    const lineStart = lineNumberAtIndex(rawHtml, index);
    const lineCount = String(snippet || '').split(/\r?\n/).length;
    const lineEnd = Math.max(lineStart, lineStart + lineCount - 1);
    return {
        code: String(snippet || ''),
        lineStart,
        lineEnd
    };
}

function createSnippetPreview(snippetCode, maxLength = 140) {
    const text = String(snippetCode || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!text) return '';
    return text.length > maxLength ? `${text.substring(0, maxLength)}…` : text;
}

function getSnippetAttribute(snippetCode, attributeName) {
    const escapedName = String(attributeName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(snippetCode || '').match(new RegExp(`${escapedName}=["']([^"']+)["']`, 'i'));
    return match?.[1]?.trim() || '';
}

function createMetricSnippetLabel(key, snippetCode) {
    const preview = createSnippetPreview(snippetCode);
    const rawSnippet = String(snippetCode || '');

    if (key === 'headings') {
        const headingTag = rawSnippet.match(/<h([12])\b/i)?.[1];
        if (headingTag === '1') return preview ? `H1: ${preview}` : 'H1: Empty';
        if (headingTag === '2') return preview ? `H2: ${preview}` : 'H2: Empty';
        if (!preview) return '';
    }

    if (key === 'relevantParagraphs') {
        return preview;
    }

    if (key === 'title') {
        return preview ? `Title: ${preview}` : '';
    }

    if (key === 'metaDescription') {
        const content = getSnippetAttribute(rawSnippet, 'content') || preview;
        return content ? `Meta description: ${content}` : '';
    }

    if (key === 'canonical') {
        const href = getSnippetAttribute(rawSnippet, 'href');
        return href ? `Canonical: ${href}` : '';
    }

    if (key === 'htmlLang') {
        const lang = getSnippetAttribute(rawSnippet, 'lang');
        return lang ? `Language: ${lang}` : '';
    }

    if (key === 'hyperlinks') {
        const href = getSnippetAttribute(rawSnippet, 'href');
        if (preview && href) return `Link: ${preview} → ${href}`;
        if (href) return `Link URL: ${href}`;
        return preview ? `Link: ${preview}` : '';
    }

    if (key === 'breadcrumbs') {
        return preview ? `Breadcrumb: ${preview}` : '';
    }

    if (key === 'sitemaps') {
        const href = getSnippetAttribute(rawSnippet, 'href');
        return href ? `Sitemap: ${href}` : (preview ? `Sitemap reference: ${preview}` : '');
    }

    if (key === 'noindexGate') {
        const name = getSnippetAttribute(rawSnippet, 'name');
        const content = getSnippetAttribute(rawSnippet, 'content') || preview;
        if (name && content) return `${name}: ${content}`;
        return content ? `Robots directive: ${content}` : '';
    }

    return '';
}

function regexSnippets(rawHtml, regex, maxSnippets = 5) {
    if (!rawHtml || !regex) return [];

    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    const iterator = new RegExp(regex.source, flags);
    const snippets = [];
    let match;

    while ((match = iterator.exec(rawHtml)) !== null && snippets.length < maxSnippets) {
        snippets.push(createSourceSnippet(rawHtml, match[0], match.index));
        if (match.index === iterator.lastIndex) iterator.lastIndex++;
    }

    return snippets;
}

function mainScopedSnippets(rawHtml, tagRegex, filterFn = null, maxSnippets = 5) {
    if (!rawHtml) return [];

    const mainMatch = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(rawHtml);
    if (!mainMatch) return [];

    const mainStart = mainMatch.index;
    const mainHtml = mainMatch[0];
    const mainOpenTagLength = mainHtml.indexOf('>') + 1;
    const innerMain = mainHtml.slice(mainOpenTagLength, mainHtml.lastIndexOf('</main>'));

    const flags = tagRegex.flags.includes('g') ? tagRegex.flags : `${tagRegex.flags}g`;
    const iterator = new RegExp(tagRegex.source, flags);
    const snippets = [];
    let match;

    while ((match = iterator.exec(innerMain)) !== null && snippets.length < maxSnippets) {
        const candidate = match[0];
        if (typeof filterFn === 'function' && !filterFn(candidate)) continue;
        const absoluteIndex = mainStart + mainOpenTagLength + match.index;
        snippets.push(createSourceSnippet(rawHtml, candidate, absoluteIndex));
        if (match.index === iterator.lastIndex) iterator.lastIndex++;
    }

    return snippets;
}

function extractRelevantSourceSnippets(key, rawHtml) {
    if (!rawHtml) return [];

    switch (key) {
        case 'title':
            return regexSnippets(rawHtml, /<title\b[^>]*>[\s\S]*?<\/title>/i, 1);
        case 'metaDescription':
            return regexSnippets(rawHtml, /<meta[^>]*name=['"]?description['"]?[^>]*>/gi, 2);
        case 'canonical':
            return regexSnippets(rawHtml, /<link[^>]*rel=['"]?canonical['"]?[^>]*>/gi, 2);
        case 'htmlLang':
            return regexSnippets(rawHtml, /<html[^>]*lang=['"]?[^'">\s]+[^>]*>/i, 1);
        case 'headings':
            return mainScopedSnippets(rawHtml, /<h[12][^>]*>[\s\S]*?<\/h[12]>/gi, null, 8);
        case 'relevantParagraphs':
            return mainScopedSnippets(rawHtml, /<p(?=[\s>])[^>]*>[\s\S]*?<\/p>/gi, (p) => countWordsInHtmlFragment(p) >= 20, 6);
        case 'hyperlinks':
            return mainScopedSnippets(rawHtml, /<a\s+[^>]*href=[^>]*>[\s\S]*?<\/a>/gi, null, 8);
        case 'structuredData': {
            const jsonLd = regexSnippets(rawHtml, /<script[^>]*type=['"]application\/ld\+json['"][^>]*>[\s\S]*?<\/script>/gi, 5);
            const microdata = regexSnippets(rawHtml, /<[^>]*itemscope[^>]*itemtype=['"][^'"]+['"][^>]*>/gi, 5);
            return [...jsonLd, ...microdata].slice(0, 8);
        }
        case 'breadcrumbs':
            return regexSnippets(rawHtml, /<[^>]*\b(?:class|id)\s*=\s*['"]?[^'">]*breadcrumb[^'">]*['"]?[^>]*>/gi, 4);
        case 'sitemaps':
            return regexSnippets(rawHtml, /<link[^>]*href=['"]([^'">\s]*sitemap[^'">\s]*)['"]?[^>]*>/gi, 4);
        case 'noindexGate':
            return regexSnippets(rawHtml, /<meta[^>]+name=["'](?:robots|googlebot|bingbot)["'][^>]*content=["']([^"']+)["'][^>]*>/gi, 3);
        default:
            return [];
    }
}

function normalizeUrl(baseUrl, candidateUrl) {
    try {
        if (!candidateUrl) return '';
        const value = String(candidateUrl).trim();
        if (!value) return '';

        if (/^https?:\/\//i.test(value)) return value;

        if (value.startsWith('//')) {
            if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) return '';
            const baseProtocol = new URL(baseUrl).protocol;
            return `${baseProtocol}${value}`;
        }

        if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;

        if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) return '';
        return new URL(value, baseUrl).href;
    } catch {
        return '';
    }
}

function toViewSourceUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return /^https?:\/\//i.test(url) ? url : '';
}

function buildManualVerificationGuidance(key, data, sourceUrl) {
    const steps = [];
    const links = [];

    if (key !== 'sitemaps' && sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
        const sourceLink = toViewSourceUrl(sourceUrl);
        if (sourceLink) links.push({ label: 'Audited page', url: sourceLink });
    }

    if (data.verificationUrl) {
        const absoluteVerificationUrl = normalizeUrl(sourceUrl, data.verificationUrl);
        const verificationLink = toViewSourceUrl(absoluteVerificationUrl);
        if (verificationLink) links.push({ label: 'robots.txt', url: verificationLink });
    }

    const dataLinks = Array.isArray(data.links) ? data.links : [];
    for (const link of dataLinks) {
        const resolved = normalizeUrl(sourceUrl, link);
        const viewSourceLink = toViewSourceUrl(resolved);
        if (viewSourceLink) {
            links.push({ label: key === 'sitemaps' ? 'Sitemap checked' : 'Detected URL', url: viewSourceLink });
        }
    }

    switch (key) {
        case 'robotsTxtGate':
            steps.push('Open robots.txt and verify the page path is not blocked by a Disallow rule for User-agent: * (or your target crawler user-agent).');
            break;
        case 'noindexGate':
            steps.push('Check page source for meta robots directives and confirm no noindex token is present.');
            steps.push('Inspect response headers and confirm X-Robots-Tag does not contain noindex.');
            break;
        case 'structuredData':
            steps.push('Use schema validation tooling or inspect script[type="application/ld+json"] blocks in source.');
            break;
        case 'canonical':
            steps.push('Inspect the head section and verify canonical points to the preferred URL version.');
            break;
        case 'sitemaps':
            steps.push('Confirm sitemap URLs are reachable and include this page where appropriate.');
            break;
        case 'hyperlinks':
            steps.push('Inspect anchor links inside <main> and verify important internal pages are discoverable through crawlable links.');
            break;
        case 'title':
            steps.push('Check the <title> tag in source and ensure it is unique and descriptive.');
            break;
        case 'metaDescription':
            steps.push('Verify meta description exists and accurately summarizes the page intent.');
            break;
        case 'htmlLang':
            steps.push('Verify the lang attribute on the html element matches the primary page language.');
            break;
        case 'headings':
            steps.push('Review heading hierarchy inside <main> and confirm there is exactly one <h1>.');
            break;
        case 'relevantParagraphs':
            steps.push('Confirm the page contains substantial body copy inside <main> that explains the topic clearly.');
            break;
        case 'breadcrumbs':
            steps.push('Verify breadcrumb markup/navigation reflects the real content hierarchy.');
            break;
        default:
            steps.push('Inspect page source and rendered DOM to manually confirm this signal.');
            break;
    }

    steps.unshift('This audit is source-based. Use these links and view-page-source in your browser to validate raw HTML rather than rendered DOM.');

    const uniqueLinks = [];
    const seen = new Set();
    for (const item of links) {
        if (!item.url || seen.has(item.url)) continue;
        seen.add(item.url);
        uniqueLinks.push(item);
    }

    return { steps, links: uniqueLinks };
}

function createMetricDetailsContent(key, data) {
    const items = Array.isArray(data.items) ? data.items : [];
    const itemTree = Array.isArray(data.itemTree) ? data.itemTree : [];
    const sourceSnippets = Array.isArray(data.sourceSnippets) && data.sourceSnippets.length
        ? data.sourceSnippets
        : extractRelevantSourceSnippets(key, lastAuditedHtml);
    const itemsSection = items.length
        ? `
            <div class="metric-detail-block">
                <strong>Detected items:</strong>
                ${itemTree.length
                    ? renderHierarchyNodes(itemTree)
                    : `<ul class="metric-detail-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
                }
            </div>
        `
        : '';

    const verificationLinkSection = data.verificationUrl && key !== 'robotsTxtGate'
        ? `
            <div class="metric-detail-block">
                <strong>Manual verification:</strong>
                <a href="${escapeHtml(data.verificationUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.verificationUrl)}</a>
            </div>
        `
        : '';

    const guidance = buildManualVerificationGuidance(key, data, lastAuditedSource);
    const linksSection = guidance.links.length
        ? `
            <div class="metric-detail-block">
                <strong>Relevant links:</strong>
                <ul class="metric-detail-list">
                    ${guidance.links.map(link => `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}: ${escapeHtml(link.url)}</a></li>`).join('')}
                </ul>
            </div>
        `
        : '';

    const sourceSnippetsSection = sourceSnippets.length
        ? `
            <div class="metric-detail-block">
                <strong>Source snippets (raw HTML):</strong>
                <ul class="metric-detail-list">
                    ${sourceSnippets.map((snippet, index) => {
                        const snippetId = `source-snippet-${key}-${index}`;
                        const lineText = snippet.lineStart === snippet.lineEnd
                            ? `Line ${snippet.lineStart}`
                            : `Lines ${snippet.lineStart}-${snippet.lineEnd}`;
                        const snippetPreview = createMetricSnippetLabel(key, snippet.code);
                        return `
                            <li>
                                <div><strong><em>${escapeHtml(lineText)}</em>${snippetPreview ? ` — ${escapeHtml(snippetPreview)}` : ''}</strong></div>
                                <button type="button" class="schema-source-toggle" data-target-id="${snippetId}" aria-expanded="false">View source</button>
                                <pre id="${snippetId}" class="metric-code-block" hidden><code>${escapeHtml(snippet.code)}</code></pre>
                            </li>
                        `;
                    }).join('')}
                </ul>
            </div>
        `
        : '';

    const manualStepsSection = guidance.steps.length
        ? `
            <div class="metric-detail-block">
                <strong>How to verify manually:</strong>
                <ol class="metric-detail-list">
                    ${guidance.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
                </ol>
            </div>
        `
        : '';

    const manualVerificationContainer = (verificationLinkSection || manualStepsSection || linksSection)
        ? `
            <div class="metric-manual-container">
                ${verificationLinkSection}
                ${manualStepsSection}
                ${linksSection}
            </div>
        `
        : '';

    return `
        <div class="metric-detail-block"><strong>What this checks:</strong> ${escapeHtml(data.description || 'N/A')}</div>
        <div class="metric-detail-block"><strong>Impact:</strong> ${escapeHtml(data.impact || 'N/A')}</div>
        <div class="metric-detail-block"><strong>Quality:</strong> ${escapeHtml(data.quality || 'N/A')}</div>
        <div class="metric-detail-block"><strong>Summary:</strong> ${escapeHtml(data.details || 'N/A')}</div>
        ${itemsSection}
        ${sourceSnippetsSection}
        ${manualVerificationContainer}
    `;
}

function toggleMetricDetails(metricId) {
    const item = document.getElementById(metricId);
    if (!item) return;

    const details = item.querySelector('.metric-details');
    const toggle = item.querySelector('.metric-toggle');
    if (!details || !toggle) return;

    const willExpand = details.hasAttribute('hidden');
    if (willExpand) {
        details.removeAttribute('hidden');
        item.classList.add('expanded');
        toggle.setAttribute('aria-expanded', 'true');
    } else {
        details.setAttribute('hidden', '');
        item.classList.remove('expanded');
        toggle.setAttribute('aria-expanded', 'false');
    }
}

function createMetricElement(key, data) {
    const foundClass = data.found ? 'found' : 'not-found';
    const statusIcon = data.found ? '✓' : '✕';
    const statusClass = data.found ? 'status-found' : 'status-missing';
    const weightBadge = data.isGate
        ? '<span class="weight-badge">GATE</span>'
        : `<span class="weight-badge">Weight: ${data.weight}</span>`;
    const metricId = `metric-${key.replace(/[^a-zA-Z0-9_-]/g, '')}`;

    return `
        <article id="${metricId}" class="metric-item ${foundClass}">
            <button type="button" class="metric-toggle" data-metric-id="${metricId}" aria-expanded="false">
                <span class="status-icon ${statusClass}" aria-hidden="true">${statusIcon}</span>
                <div class="metric-content">
                    <div class="metric-name">
                        ${escapeHtml(data.name)}
                        <small>${escapeHtml(data.description)}</small>
                    </div>
                </div>
                <span class="metric-details-text">${escapeHtml(data.summary || data.details)}</span>
                <div class="metric-controls">
                    ${weightBadge}
                    <span class="expand-icon" aria-hidden="true">▾</span>
                </div>
            </button>
            <div class="metric-details" hidden>
                ${createMetricDetailsContent(key, data)}
            </div>
        </article>
    `;
}

/**
 * Show/hide loading indicator with accessibility support
 */
function setLoadingMessage(message) {
    const messageEl = document.getElementById('loadingMessage');
    if (messageEl) {
        messageEl.textContent = message || 'Analyzing content...';
    }
}

function showLoading(show, message = 'Analyzing content...') {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) {
        if (show) {
            setLoadingMessage(message);
            indicator.classList.add('active');
            indicator.setAttribute('role', 'status');
            indicator.setAttribute('aria-live', 'polite');
        } else {
            indicator.classList.remove('active');
            setLoadingMessage('Analyzing content...');
        }
    }
}

/**
 * Show error with accessible feedback
 */
function showError(message) {
    const resultsContent = document.getElementById('resultsContent');
    const emptyState = document.getElementById('emptyState');
    
    if (emptyState) {
        emptyState.innerHTML = `
            <div class="empty-state-icon">⚠️</div>
            <p>${message}</p>
        `;
        emptyState.style.display = 'block';
    }
    if (resultsContent) {
        resultsContent.style.display = 'none';
    }
    
    // Announce error to screen readers
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'alert');
    announcement.className = 'sr-only';
    announcement.textContent = `Error: ${message}`;
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 3000);
}

function clearInput() {
    document.getElementById('urlInput').value = '';
    document.getElementById('htmlInput').value = '';
    document.getElementById('fileInput').value = '';
    const container = document.querySelector('.container');
    if (container) container.classList.remove('results-showing');
    document.getElementById('resultsContent').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
}

function goHome() {
    showHomeView({ updateHistory: true, focusUrlInput: true });
}

// Add CSS class for screen reader only content
const style = document.createElement('style');
style.textContent = `.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0; }
.metric-code-block { margin: 0.5rem 0 0.75rem; padding: 0.75rem; border-radius: 0.5rem; background: #111827; color: #e5e7eb; overflow-x: auto; font-size: 0.8rem; line-height: 1.35; }
.metric-code-block code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; white-space: pre; }
.schema-source-toggle { margin: 0.4rem 0 0.4rem 0.5rem; padding: 0.28rem 0.55rem; border: 1px solid #4b5563; border-radius: 0.4rem; background: #1f2937; color: #e5e7eb; font-size: 0.75rem; cursor: pointer; }
.schema-source-toggle:hover { background: #374151; }
.schema-source-toggle:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }`;
document.head.appendChild(style);
