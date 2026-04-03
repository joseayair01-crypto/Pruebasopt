const HTML_CONTENT_TYPE_REGEX = /text\/html/i;

function escapeHtmlAttr(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function upsertTitle(html, title) {
    const tag = `<title>${escapeHtmlAttr(title)}</title>`;
    if (/<title>.*?<\/title>/is.test(html)) {
        return html.replace(/<title>.*?<\/title>/is, tag);
    }
    return html.replace(/<\/head>/i, `    ${tag}\n</head>`);
}

function upsertMeta(html, attribute, name, content) {
    const safeContent = escapeHtmlAttr(content);
    const tag = `<meta ${attribute}="${name}" content="${safeContent}" />`;
    const regex = new RegExp(`<meta\\b[^>]*${attribute}=["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i');

    if (regex.test(html)) {
        return html.replace(regex, tag);
    }

    return html.replace(/<\/head>/i, `    ${tag}\n</head>`);
}

function upsertCanonical(html, href) {
    const tag = `<link rel="canonical" href="${escapeHtmlAttr(href)}" />`;
    if (/<link\b[^>]*rel=["']canonical["'][^>]*>/i.test(html)) {
        return html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/i, tag);
    }
    return html.replace(/<\/head>/i, `    ${tag}\n</head>`);
}

function injectMetadata(html, metadata) {
    let out = html;

    out = upsertTitle(out, metadata.title);
    out = upsertMeta(out, 'name', 'description', metadata.description);

    if (metadata.keywords) {
        out = upsertMeta(out, 'name', 'keywords', metadata.keywords);
    }

    if (metadata.author) {
        out = upsertMeta(out, 'name', 'author', metadata.author);
    }

    if (metadata.robots) {
        out = upsertMeta(out, 'name', 'robots', metadata.robots);
    }

    if (metadata.themeColor) {
        out = upsertMeta(out, 'name', 'theme-color', metadata.themeColor);
    }

    if (metadata.canonical) {
        out = upsertCanonical(out, metadata.canonical);
    }

    if (metadata.og) {
        out = upsertMeta(out, 'property', 'og:title', metadata.og.title);
        out = upsertMeta(out, 'property', 'og:description', metadata.og.description);
        out = upsertMeta(out, 'property', 'og:image', metadata.og.image);
        out = upsertMeta(out, 'property', 'og:url', metadata.og.url);
        out = upsertMeta(out, 'property', 'og:type', metadata.og.type || 'website');
        out = upsertMeta(out, 'property', 'og:locale', metadata.og.locale || 'es_MX');
        out = upsertMeta(out, 'property', 'og:site_name', metadata.og.site_name || 'Sorteos');
    }

    if (metadata.twitter) {
        out = upsertMeta(out, 'name', 'twitter:card', metadata.twitter.card || 'summary_large_image');
        out = upsertMeta(out, 'name', 'twitter:title', metadata.twitter.title);
        out = upsertMeta(out, 'name', 'twitter:description', metadata.twitter.description);
        out = upsertMeta(out, 'name', 'twitter:image', metadata.twitter.image);

        if (metadata.twitter.creator) {
            out = upsertMeta(out, 'name', 'twitter:creator', metadata.twitter.creator);
        }
    }

    return out;
}

function resolveApiBase(env, html) {
    const fromEnv = String(env.RIFAPLUS_API_BASE || '').trim().replace(/\/+$/, '');
    if (fromEnv) return fromEnv;

    const match = html.match(/<meta\s+name=["']rifaplus-api-base["']\s+content=["']([^"']+)["']/i);
    return match ? String(match[1] || '').trim().replace(/\/+$/, '') : '';
}

async function fetchMetadata(apiBase, requestUrl, pathname) {
    const url = new URL(`${apiBase}/api/og-metadata`);
    const publicUrl = new URL(requestUrl);
    url.searchParams.set('path', pathname || '/');
    url.searchParams.set('publicBase', publicUrl.origin);

    const response = await fetch(url.toString(), {
        headers: {
            'user-agent': 'Cloudflare-Pages-RifaPlus-Metadata/1.0'
        }
    });

    if (!response.ok) {
        throw new Error(`Metadata status ${response.status}`);
    }

    const payload = await response.json();
    return payload?.success ? payload.data : null;
}

function shouldHandleRequest(request) {
    if (request.method !== 'GET') return false;

    const url = new URL(request.url);
    if (/\.[a-z0-9]+$/i.test(url.pathname) && !url.pathname.endsWith('.html')) {
        return false;
    }

    const accept = request.headers.get('accept') || '';
    return accept.includes('text/html') || url.pathname.endsWith('.html') || !/\.[a-z0-9]+$/i.test(url.pathname);
}

export async function onRequest(context) {
    const { request, env } = context;

    if (!shouldHandleRequest(request)) {
        return env.ASSETS.fetch(request);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get('content-type') || '';

    if (!HTML_CONTENT_TYPE_REGEX.test(contentType)) {
        return assetResponse;
    }

    const html = await assetResponse.text();
    const apiBase = resolveApiBase(env, html);

    if (!apiBase) {
        return new Response(html, {
            status: assetResponse.status,
            statusText: assetResponse.statusText,
            headers: assetResponse.headers
        });
    }

    try {
        const pathname = new URL(request.url).pathname;
        const metadata = await fetchMetadata(apiBase, request.url, pathname);
        if (!metadata) {
            return new Response(html, {
                status: assetResponse.status,
                statusText: assetResponse.statusText,
                headers: assetResponse.headers
            });
        }

        const injectedHtml = injectMetadata(html, metadata);
        const headers = new Headers(assetResponse.headers);
        headers.delete('content-length');
        headers.set('x-rifaplus-og-injected', 'true');

        return new Response(injectedHtml, {
            status: assetResponse.status,
            statusText: assetResponse.statusText,
            headers
        });
    } catch (error) {
        const headers = new Headers(assetResponse.headers);
        headers.set('x-rifaplus-og-injected', 'fallback');
        headers.set('x-rifaplus-og-error', String(error.message || 'unknown'));

        return new Response(html, {
            status: assetResponse.status,
            statusText: assetResponse.statusText,
            headers
        });
    }
}
