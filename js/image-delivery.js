(function inicializarImageDelivery(global) {
    const CLOUDINARY_UPLOAD_MARKER = '/upload/';
    const CLOUDINARY_HOST_PATTERN = /^https?:\/\/res\.cloudinary\.com\//i;

    const IMAGE_PROFILES = Object.freeze({
        logo: Object.freeze({
            width: 320,
            height: 180,
            crop: 'limit',
            quality: 'auto:best',
            format: 'auto',
            dpr: 'auto'
        }),
        logoPreload: Object.freeze({
            width: 320,
            height: 180,
            crop: 'limit',
            quality: 'auto:best',
            format: 'auto',
            dpr: 'auto'
        }),
        logoIcon: Object.freeze({
            width: 180,
            height: 180,
            crop: 'limit',
            quality: 'auto:best',
            format: 'auto',
            dpr: 'auto'
        }),
        carousel: Object.freeze({
            width: 1280,
            height: 1280,
            crop: 'limit',
            quality: 'auto:good',
            format: 'auto',
            dpr: 'auto'
        }),
        carouselPreload: Object.freeze({
            width: 960,
            height: 960,
            crop: 'limit',
            quality: 'auto:good',
            format: 'auto',
            dpr: 'auto'
        }),
        hero: Object.freeze({
            width: 1280,
            height: 720,
            crop: 'limit',
            quality: 'auto:best',
            format: 'auto',
            dpr: 'auto'
        }),
        cover: Object.freeze({
            width: 1200,
            height: 675,
            crop: 'limit',
            quality: 'auto:good',
            format: 'auto',
            dpr: 'auto'
        }),
        content: Object.freeze({
            width: 960,
            height: 960,
            crop: 'limit',
            quality: 'auto:good',
            format: 'auto',
            dpr: 'auto'
        }),
        thumbnail: Object.freeze({
            width: 480,
            height: 480,
            crop: 'limit',
            quality: 'auto:good',
            format: 'auto',
            dpr: 'auto'
        })
    });

    function obtenerPerfil(profile) {
        if (profile && typeof profile === 'object') {
            return profile;
        }

        return IMAGE_PROFILES[profile] || IMAGE_PROFILES.carousel;
    }

    function esUrlCloudinary(url) {
        const valor = String(url || '').trim();
        return Boolean(valor) && CLOUDINARY_HOST_PATTERN.test(valor) && valor.includes(CLOUDINARY_UPLOAD_MARKER);
    }

    function esArchivoVectorialOPdf(url) {
        const pathname = String(url || '').split('?')[0].split('#')[0].toLowerCase();
        return pathname.endsWith('.svg') || pathname.endsWith('.pdf');
    }

    function esSegmentoTransformacion(segment) {
        const valor = String(segment || '').trim();
        if (!valor) return false;
        if (valor.includes(',')) return true;
        return /^(?:[a-z]{1,3})_[^/]+$/i.test(valor);
    }

    function dividirUrlCloudinary(url) {
        const normalizedUrl = String(url || '').trim();
        if (!esUrlCloudinary(normalizedUrl)) {
            return null;
        }

        const markerIndex = normalizedUrl.indexOf(CLOUDINARY_UPLOAD_MARKER);
        const prefix = normalizedUrl.slice(0, markerIndex + CLOUDINARY_UPLOAD_MARKER.length);
        const suffix = normalizedUrl.slice(markerIndex + CLOUDINARY_UPLOAD_MARKER.length);
        return { prefix, suffix };
    }

    function limpiarTransformacionesExistentes(suffix) {
        const segmentos = String(suffix || '')
            .split('/')
            .filter(Boolean);

        let indice = 0;
        while (indice < segmentos.length && esSegmentoTransformacion(segmentos[indice])) {
            indice += 1;
        }

        return segmentos.slice(indice).join('/');
    }

    function construirTokensTransformacion(profile) {
        const perfil = obtenerPerfil(profile);
        const tokens = [];

        if (perfil.crop) tokens.push(`c_${perfil.crop}`);
        if (Number.isFinite(perfil.width) && perfil.width > 0) tokens.push(`w_${Math.round(perfil.width)}`);
        if (Number.isFinite(perfil.height) && perfil.height > 0) tokens.push(`h_${Math.round(perfil.height)}`);
        if (perfil.dpr) tokens.push(`dpr_${perfil.dpr}`);
        if (perfil.quality) tokens.push(`q_${perfil.quality}`);
        if (perfil.format) tokens.push(`f_${perfil.format}`);
        if (perfil.flags) tokens.push(`fl_${perfil.flags}`);

        return tokens;
    }

    function resolverUrlImagen(url, profile, overrides) {
        const originalUrl = String(url || '').trim();
        if (!originalUrl || !esUrlCloudinary(originalUrl) || esArchivoVectorialOPdf(originalUrl)) {
            return originalUrl;
        }

        const partes = dividirUrlCloudinary(originalUrl);
        if (!partes) {
            return originalUrl;
        }

        const suffixLimpio = limpiarTransformacionesExistentes(partes.suffix);
        if (!suffixLimpio) {
            return originalUrl;
        }

        const perfilFinal = Object.assign({}, obtenerPerfil(profile), overrides || {});
        const transformacion = construirTokensTransformacion(perfilFinal).join(',');
        if (!transformacion) {
            return originalUrl;
        }

        return `${partes.prefix}${transformacion}/${suffixLimpio}`;
    }

    function construirSrcset(url, widths, profile, overrides) {
        if (!esUrlCloudinary(url) || !Array.isArray(widths) || widths.length === 0 || esArchivoVectorialOPdf(url)) {
            return '';
        }

        return widths
            .filter((width) => Number.isFinite(width) && width > 0)
            .map((width) => `${resolverUrlImagen(url, profile, Object.assign({}, overrides, { width }))} ${Math.round(width)}w`)
            .join(', ');
    }

    function aplicarImagenOptimizada(img, options = {}) {
        if (!img || typeof img !== 'object') {
            return '';
        }

        const originalUrl = String(options.originalUrl || img.dataset?.rifaplusOriginalSrc || img.getAttribute('src') || '').trim();
        const profile = options.profile || 'carousel';
        const optimizedUrl = resolverUrlImagen(originalUrl, profile, options.overrides);
        const srcset = construirSrcset(originalUrl, options.widths, profile, options.overrides);

        if (img.dataset) {
            img.dataset.rifaplusOriginalSrc = originalUrl;
        }

        if (optimizedUrl) {
            img.src = optimizedUrl;
        }

        if (srcset) {
            img.srcset = srcset;
        } else if (img.hasAttribute('srcset')) {
            img.removeAttribute('srcset');
        }

        if (options.sizes) {
            img.sizes = options.sizes;
        }

        if (options.loading) {
            img.loading = options.loading;
        }

        if (options.fetchPriority) {
            img.fetchPriority = options.fetchPriority;
        }

        if (options.decoding) {
            img.decoding = options.decoding;
        }

        return optimizedUrl || originalUrl;
    }

    function obtenerProfileDesdeImagen(img) {
        if (!img || typeof img !== 'object') {
            return 'content';
        }

        const datasetProfile = String(img.dataset?.rifaplusImageProfile || '').trim();
        if (datasetProfile && IMAGE_PROFILES[datasetProfile]) {
            return datasetProfile;
        }

        if (img.matches?.('.dynamic-logo, .logo-image, .footer-logo-img, .carrito-logo, .rifaplus-shell-logo')) {
            return 'logo';
        }

        if (img.matches?.('.orden-imagen-dinamica, [data-imagen-tipo=\"cliente.imagenPrincipal\"], .sorteo-cover, .hero-image')) {
            return 'cover';
        }

        if (img.closest?.('.carrusel, .carrusel-item, .galeria, .galeria-slide')) {
            return img.fetchPriority === 'high' || img.loading === 'eager' ? 'carouselPreload' : 'carousel';
        }

        if (img.fetchPriority === 'high' || img.loading === 'eager') {
            return 'hero';
        }

        return 'content';
    }

    function obtenerWidthsDesdeImagen(img, profile) {
        if (!img || typeof img !== 'object') {
            return [];
        }

        if (Array.isArray(img.dataset?.rifaplusWidths) && img.dataset.rifaplusWidths.length > 0) {
            return img.dataset.rifaplusWidths;
        }

        const datasetWidths = String(img.dataset?.rifaplusWidths || '').trim();
        if (datasetWidths) {
            return datasetWidths
                .split(',')
                .map((value) => Number(value.trim()))
                .filter((value) => Number.isFinite(value) && value > 0);
        }

        switch (profile) {
        case 'logo':
            return [160, 240, 320];
        case 'logoIcon':
            return [64, 128, 180];
        case 'thumbnail':
            return [240, 360, 480];
        case 'cover':
            return [480, 768, 960, 1200];
        case 'hero':
            return [480, 768, 1024, 1280];
        case 'carousel':
        case 'carouselPreload':
            return [480, 768, 960, 1280, 1600];
        default:
            return [320, 480, 768, 960];
        }
    }

    function obtenerSizesDesdeImagen(img, profile) {
        const datasetSizes = String(img?.dataset?.rifaplusSizes || '').trim();
        if (datasetSizes) {
            return datasetSizes;
        }

        switch (profile) {
        case 'logo':
            return '(max-width: 768px) 160px, 320px';
        case 'logoIcon':
            return '180px';
        case 'cover':
        case 'hero':
            return '(max-width: 768px) 100vw, min(92vw, 1200px)';
        case 'carousel':
        case 'carouselPreload':
            return '(max-width: 768px) 100vw, min(92vw, 1200px)';
        default:
            return '(max-width: 768px) 100vw, 960px';
        }
    }

    function autoOptimizarImagen(img) {
        if (!img || img.dataset?.rifaplusOptimized === 'true') {
            return '';
        }

        const originalUrl = String(img.dataset?.rifaplusOriginalSrc || img.getAttribute('src') || '').trim();
        if (!esUrlCloudinary(originalUrl) || esArchivoVectorialOPdf(originalUrl)) {
            return originalUrl;
        }

        const profile = obtenerProfileDesdeImagen(img);
        const optimizedUrl = aplicarImagenOptimizada(img, {
            originalUrl,
            profile,
            widths: obtenerWidthsDesdeImagen(img, profile),
            sizes: obtenerSizesDesdeImagen(img, profile),
            loading: img.getAttribute('loading') || undefined,
            fetchPriority: img.getAttribute('fetchpriority') || img.fetchPriority || undefined,
            decoding: img.getAttribute('decoding') || img.decoding || 'async'
        });

        if (img.dataset) {
            img.dataset.rifaplusOptimized = 'true';
        }

        return optimizedUrl;
    }

    function autoOptimizarImagenes(root) {
        if (!root || typeof root.querySelectorAll !== 'function') {
            return 0;
        }

        const images = root.matches?.('img') ? [root] : Array.from(root.querySelectorAll('img'));
        images.forEach(autoOptimizarImagen);
        return images.length;
    }

    function observarNuevasImagenes() {
        if (typeof MutationObserver === 'undefined' || !global.document?.body) {
            return null;
        }

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (!node || node.nodeType !== 1) {
                        return;
                    }

                    autoOptimizarImagenes(node);
                });
            });
        });

        observer.observe(global.document.body, {
            childList: true,
            subtree: true
        });

        return observer;
    }

    const api = {
        IMAGE_PROFILES,
        esUrlCloudinary,
        resolverUrlImagen,
        construirSrcset,
        aplicarImagenOptimizada,
        autoOptimizarImagen,
        autoOptimizarImagenes
    };

    global.RifaPlusImageDelivery = api;

    if (typeof window !== 'undefined' && global.document) {
        const inicializarAutoOptimizacion = function() {
            autoOptimizarImagenes(global.document);

            if (!global.__RIFAPLUS_IMAGE_OBSERVER__) {
                global.__RIFAPLUS_IMAGE_OBSERVER__ = observarNuevasImagenes();
            }
        };

        if (global.document.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', inicializarAutoOptimizacion, { once: true });
        } else {
            inicializarAutoOptimizacion();
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
