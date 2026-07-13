const http = require('http');
const https = require('https');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');

const PORT = 3000;

function escapeForSingleQuotedJsString(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

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
            let totalSize = 0;

            res.on('data', chunk => {
                if (totalSize < MAX_SIZE) {
                    chunks.push(chunk);
                    totalSize += chunk.length;
                }
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
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
}

function setNoCacheHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
}

function setAssetCacheHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=300');
}

/**
 * Modern HTTP server with proper error handling
 */
const server = http.createServer((req, res) => {
    const reqHost = req.headers.host || `localhost:${PORT}`;
    const requestUrl = new URL(req.url || '/', `http://${reqHost}`);
    const pathname = requestUrl.pathname;
    
    // CORS headers for cross-origin requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Security headers
    setSecurityHeaders(res);
    
    // Default to no-cache; routes can override for static assets
    setNoCacheHeaders(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Home page
    if (pathname === '/' || pathname === '/index.html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        setNoCacheHeaders(res);
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                console.error('Error reading index.html:', err);
                res.writeHead(500);
                res.end('Internal Server Error');
            } else {
                const proto = (req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim();
                const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
                const baseUrl = `${proto}://${host}`;
                const bookmarkletContent =
                    `(function(){var u='${escapeForSingleQuotedJsString(baseUrl + '/?url=')}'+encodeURIComponent(location.href);` +
                    `window.location.href=u;})()`;
                res.writeHead(200);
                res.end(String(data).replace('__BOOKMARKLET_HREF__', bookmarkletContent));
            }
        });
        return;
    }

    // Auditor script
    if (pathname === '/auditor.js') {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        setAssetCacheHeaders(res);
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
        setNoCacheHeaders(res);
        const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
        const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
        const baseUrl = `${proto}://${host}`;
        const bookmarkletContent =
            `(function(){var u='${escapeForSingleQuotedJsString(baseUrl + '/?url=')}'+encodeURIComponent(location.href);` +
            `window.location.href=u;})()`;
        res.writeHead(200);
        res.end(bookmarkletContent);
        return;
    }

    // API: Fetch remote URL
    if (pathname === '/api/fetch' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        setNoCacheHeaders(res);
        const targetUrl = requestUrl.searchParams.get('url');
        
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

    // 404 Not Found
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
    console.log(`✅ LLM Crawlability Auditor running on http://localhost:${PORT}`);
});
