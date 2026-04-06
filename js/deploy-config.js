// Configuracion centralizada de despliegue.
// La idea es que aqui se defina el entorno y se propaguen valores
// comunes al frontend sin tocar multiples archivos cada vez.
(function configurarDeployRifaPlus() {
    const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
    const SOCKET_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.8.1/socket.io.min.js';

    function normalizarBaseUrl(url) {
        return String(url || '').trim().replace(/\/+$/, '');
    }

    function obtenerMeta(nombre) {
        try {
            const meta = document.querySelector(`meta[name="${nombre}"]`);
            return meta ? String(meta.content || '').trim() : '';
        } catch (error) {
            return '';
        }
    }

    function upsertMetaName(nombre, content) {
        try {
            let meta = document.querySelector(`meta[name="${nombre}"]`);
            if (!meta) {
                meta = document.createElement('meta');
                meta.setAttribute('name', nombre);
                document.head.appendChild(meta);
            }
            meta.setAttribute('content', content);
        } catch (error) {
            console.warn('⚠️ [DeployConfig] No se pudo sincronizar meta name:', nombre, error?.message || error);
        }
    }

    function upsertMetaProperty(nombre, content) {
        try {
            let meta = document.querySelector(`meta[property="${nombre}"]`);
            if (!meta) {
                meta = document.createElement('meta');
                meta.setAttribute('property', nombre);
                document.head.appendChild(meta);
            }
            meta.setAttribute('content', content);
        } catch (error) {
            console.warn('⚠️ [DeployConfig] No se pudo sincronizar meta property:', nombre, error?.message || error);
        }
    }

    const hostname = window.location.hostname;
    const isLocal = LOCAL_HOSTS.has(hostname);
    const protocol = window.location.protocol || 'http:';
    const origin = window.location.origin || `${protocol}//${hostname}`;

    // ============================================================
    // UNICO LUGAR QUE DEBERIAS TOCAR PARA CAMBIAR DE ENTORNO
    // ============================================================
    //
    // 1. MODO LOCAL
    //    No necesitas cambiar nada si vas a usar:
    //    - frontend en localhost / 127.0.0.1
    //    - backend en http://localhost:5001
    //
    // 2. MODO PRODUCCION
    //    Cuando vuelvas a hostear, cambia SOLO estos valores:
    //    - DEPLOY_TARGETS.production.apiBase
    //    - DEPLOY_TARGETS.production.publicBase
    //
    //    Ejemplo:
    //    apiBase: 'https://tu-backend.up.railway.app'
    //    publicBase: 'https://tu-frontend.pages.dev'
    //
    // 3. PRIORIDAD DE RESOLUCION
    //    Este archivo usa este orden:
    //    - window.__RIFAPLUS_DEPLOY__ si ya existe
    //    - preset local/production definido aqui
    //    - meta rifaplus-api-base si existiera
    //    - fallback por hostname/origin
    //
    // 4. REGLA PRACTICA
    //    Si una nueva copia del proyecto sera local:
    //    - deja esto como esta
    //
    //    Si una nueva copia sera para deploy:
    //    - edita SOLO el bloque `production`
    //
    const DEPLOY_TARGETS = {
        local: {
            apiBase: 'http://localhost:5001',
            publicBase: origin,
            socketScriptUrl: SOCKET_CDN_URL
        },
        production: {
            // Produccion actual:
            // Backend: Railway
            // Frontend: Cloudflare Pages
            apiBase: 'https://aleahot1-production.up.railway.app',
            publicBase: 'https://aleahot1.pages.dev',
            socketScriptUrl: SOCKET_CDN_URL
        }
    };

    const selectedPreset = isLocal ? DEPLOY_TARGETS.local : DEPLOY_TARGETS.production;
    const existingOverride = window.__RIFAPLUS_DEPLOY__ || {};

    const apiBase = normalizarBaseUrl(
        existingOverride.apiBase
        || selectedPreset.apiBase
        || obtenerMeta('rifaplus-api-base')
        || (isLocal ? 'http://localhost:5001' : origin)
    );

    const publicBase = normalizarBaseUrl(
        existingOverride.publicBase
        || selectedPreset.publicBase
        || origin
    );

    const socketScriptUrl = String(
        existingOverride.socketScriptUrl
        || selectedPreset.socketScriptUrl
        || SOCKET_CDN_URL
    ).trim();

    const resolvedConfig = {
        mode: isLocal ? 'local' : 'production',
        apiBase,
        publicBase,
        socketScriptUrl
    };

    window.__RIFAPLUS_DEPLOY__ = Object.assign({}, resolvedConfig, existingOverride || {});
    window.RIFAPLUS_ENV = Object.assign({}, window.RIFAPLUS_ENV || {}, {
        apiBase: resolvedConfig.apiBase,
        publicBase: resolvedConfig.publicBase,
        socketUrl: resolvedConfig.socketScriptUrl,
        hostname,
        protocol,
        isDevelopment: isLocal,
        isProduction: !isLocal
    });

    // Mantener metas importantes alineadas con el entorno actual.
    upsertMetaName('rifaplus-api-base', resolvedConfig.apiBase);

    const pathname = window.location.pathname || '/';
    const normalizedPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    const currentPageUrl = `${resolvedConfig.publicBase}${normalizedPath || '/'}`;
    upsertMetaProperty('og:url', currentPageUrl);

    console.log('⚙️ [DeployConfig] Entorno resuelto:', {
        mode: resolvedConfig.mode,
        apiBase: resolvedConfig.apiBase,
        publicBase: resolvedConfig.publicBase,
        socketScriptUrl: resolvedConfig.socketScriptUrl
    });
})();
