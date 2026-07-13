const http = require('http');
const https = require('https');
const zlib = require('zlib');
const url = require('url');
const path = require('path');
const fs = require('fs');

const PORT = 3000;

// Temporary in-memory store for bookmarklet-submitted pages
const pageStore = {};
let storeCounter = 0;

/**
 * Modern fetch with proper decompression and error handling
 */
function fetchUrl(targetUrl, callback, redirectCount = 0, retryCount = 0) {
    try {
        const parsed = new URL(targetUrl);
        const protocol = parsed.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'close'
            },
            timeout: 10000
        };

        const req = protocol.request(options);
        
        let finished = false;
        const MAX_SIZE = 5000000;

        req.on('response', (res) => {
            // Follow redirects
            if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location) {
                if (!finished) {
                    finished = true;
                    if (redirectCount > 10) {
                        callback(new Error('Too many redirects'));
                        return;
                    }
                    const redirectUrl = res.headers.location.startsWith('http')
                        ? res.headers.location
                        : new URL(res.headers.location, targetUrl).href;
                    fetchUrl(redirectUrl, callback, redirectCount + 1, retryCount);
                }
                return;
            }

            const encoding = res.headers['content-encoding'] || '';
            const chunks = [];

            res.on('data', chunk => {
                let totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
                if (totalSize < MAX_SIZE) chunks.push(chunk);
            });

            res.on('end', () => {
                if (finished) return;
                finished = true;

                const buffer = Buffer.concat(chunks);

                // Decompress based on Content-Encoding
                if (encoding === 'br') {
                    zlib.brotliDecompress(buffer, (err, result) => {
                        callback(err, err ? null : {
                            body: result.toString('utf8'),
                            headers: res.headers,
                            statusCode: res.statusCode,
                            finalUrl: targetUrl
                        });
                    });
                } else if (encoding === 'gzip') {
                    zlib.gunzip(buffer, (err, result) => {
                        callback(err, err ? null : {
                            body: result.toString('utf8'),
                            headers: res.headers,
                            statusCode: res.statusCode,
                            finalUrl: targetUrl
                        });
                    });
                } else if (encoding === 'deflate') {
                    zlib.inflate(buffer, (err, result) => {
                        callback(err, err ? null : {
                            body: result.toString('utf8'),
                            headers: res.headers,
                            statusCode: res.statusCode,
                            finalUrl: targetUrl
                        });
                    });
                } else {
                    callback(null, {
                        body: buffer.toString('utf8'),
                        headers: res.headers,
                        statusCode: res.statusCode,
                        finalUrl: targetUrl
                    });
                }
            });

            res.on('error', (err) => {
                if (!finished) {
                    finished = true;
                    callback(new Error(`Response error: ${err.message}`));
                }
            });
        });

        req.on('error', (err) => { 
            if (!finished) {
                finished = true;
                if ((err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') && retryCount < 1) {
                    fetchUrl(targetUrl, callback, redirectCount, retryCount + 1);
                    return;
                }
                callback(new Error(`Fetch error: ${err.message}`));
            }
        });

        req.on('timeout', () => { 
            req.destroy();
            if (!finished) {
                finished = true;
                callback(new Error('Request timeout'));
            }
        });
        
        req.end();
    } catch (err) {
        callback(new Error(`Invalid URL: ${err.message}`));
    }
}

/**
 * Set security and performance headers
 */
function setSecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
}

/**
 * Modern HTTP server with proper error handling
 */
const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;
    
    // CORS headers for cross-origin requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Security headers
    setSecurityHeaders(res);
    
    // Cache headers for static assets
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Home page
    if (pathname === '/' || pathname === '/index.html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                console.error('Error reading index.html:', err);
                res.writeHead(500);
                res.end('Internal Server Error');
            } else {
                res.writeHead(200);
                res.end(data);
            }
        });
        return;
    }

    // Auditor script
    if (pathname === '/auditor.js') {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        fs.readFile(path.join(__dirname, 'auditor.js'), (err, data) => {
            if (err) {
                console.error('Error reading auditor.js:', err);
                res.writeHead(500);
                res.end('Internal Server Error');
            } else {
                res.writeHead(200);
                res.end(data);
            }
        });
        return;
    }

    // Bookmarklet script — dynamically inject the correct base URL from the request host
    if (pathname === '/bookmarklet.js') {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
        const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
        const baseUrl = `${proto}://${host}`;
        const bookmarkletContent =
            `(function(){var u=${JSON.stringify(baseUrl + '/?url=')}+encodeURIComponent(location.href);` +
            `var w=window.open(u,'_blank','noopener,noreferrer');if(!w){window.location.href=u;}})()`;
        res.writeHead(200);
        res.end(bookmarkletContent);
        return;
    }

    // API: Fetch remote URL
    if (pathname === '/api/fetch' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        const targetUrl = parsed.query.url;
        
        if (!targetUrl) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'URL parameter required' }));
            return;
        }

        // Validate URL
        try {
            new URL(targetUrl);
        } catch {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid URL format' }));
            return;
        }

        fetchUrl(targetUrl, (err, result) => {
            if (err) {
                (async () => {
                    try {
                        const fallbackResp = await fetch(targetUrl, {
                            redirect: 'follow',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                                'Accept-Language': 'en-US,en;q=0.9'
                            }
                        });
                        const body = await fallbackResp.text();
                        res.writeHead(200);
                        res.end(JSON.stringify({
                            html: body,
                            headers: Object.fromEntries(fallbackResp.headers.entries()),
                            statusCode: fallbackResp.status,
                            finalUrl: fallbackResp.url || targetUrl,
                            fetchedVia: 'fallback-fetch'
                        }));
                    } catch (fallbackErr) {
                        res.writeHead(502);
                        res.end(JSON.stringify({ error: `${err.message}; fallback failed: ${fallbackErr.message}` }));
                    }
                })();
            } else {
                res.writeHead(200);
                res.end(JSON.stringify({
                    html: result.body,
                    headers: result.headers,
                    statusCode: result.statusCode,
                    finalUrl: result.finalUrl
                }));
            }
        });
        return;
    }

    // API: Submit HTML for analysis
    if (pathname === '/api/submit' && req.method === 'POST') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        let body = '';
        
        req.on('data', chunk => {
            body += chunk;
            // Prevent large payloads
            if (body.length > 5000000) {
                req.destroy();
                res.writeHead(413);
                res.end(JSON.stringify({ error: 'Payload too large' }));
            }
        });
        
        req.on('end', () => {
            try {
                const { html, pageUrl } = JSON.parse(body);
                if (!html || typeof html !== 'string') {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'HTML content required' }));
                    return;
                }
                const id = ++storeCounter;
                pageStore[id] = { html, pageUrl, ts: Date.now() };
                
                // Clean up entries older than 10 minutes
                for (const key of Object.keys(pageStore)) {
                    if (Date.now() - pageStore[key].ts > 600000) {
                        delete pageStore[key];
                    }
                }
                
                res.writeHead(200);
                res.end(JSON.stringify({ id }));
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
        return;
    }

    // API: Retrieve stored HTML
    if (pathname === '/api/get' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        const id = parsed.query.id;
        
        if (!id) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'ID parameter required' }));
            return;
        }
        
        const entry = pageStore[id];
        if (!entry) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found or expired' }));
        } else {
            res.writeHead(200);
            res.end(JSON.stringify({ html: entry.html, pageUrl: entry.pageUrl }));
        }
        return;
    }

    // 404 Not Found
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
    console.log(`✅ LLM Crawlability Auditor running on http://localhost:${PORT}`);
});
