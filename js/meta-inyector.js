/**
 * ============================================================
 * ARCHIVO: js/meta-inyector.js
 * DESCRIPCIÓN: Inyecta dinámicamente metadatos SEO
 * 
 * FLUJO MEJORADO:
 * 1. Intenta cargar desde /api/og-metadata (Backend SSR - dinámico)
 * 2. Si falla, usa config.js como fallback
 * 3. Actualiza metadatos OG, Twitter, SEO en tiempo real
 * 
 * IMPORTANTE PARA PRODUCCIÓN:
 * - Los bots (Facebook, WhatsApp, Twitter) reciben metadatos
 *   generados por el backend desde config.json ACTUAL
 * - Los usuarios ven metadatos actualizados en el navegador
 * - Coherencia 100% entre bots y usuarios
 * 
 * Este script DEBE cargarse ANTES que main.js
 * 
 * ============================================================
 */

(function InyectorMetadat() {
    'use strict';

    function esClienteHumano() {
        const userAgent = navigator.userAgent.toLowerCase();
        return !/facebookexternalhit|twitterbot|whatsapp|linkedinbot|slurp|googlebot|slackbot|discordbot/i.test(userAgent);
    }

    function resolverBaseUrl(config) {
        const desdeConfig = config?.seo?.urlBase || config?.backend?.apiBase || window.location.origin;
        return String(desdeConfig || window.location.origin).replace(/\/api\/?$/, '').replace(/\/+$/, '');
    }

    function resolverUrlPublica(valor, baseUrl) {
        const valorNormalizado = String(valor || '').trim();
        const baseNormalizada = String(baseUrl || '').replace(/\/+$/, '');

        if (!valorNormalizado) return `${baseNormalizada}/images/placeholder-cover.svg`;
        if (/^https?:\/\//i.test(valorNormalizado)) return valorNormalizado;
        if (valorNormalizado.startsWith('//')) return `${window.location.protocol}${valorNormalizado}`;
        if (valorNormalizado.startsWith('/')) return `${baseNormalizada}${valorNormalizado}`;
        return `${baseNormalizada}/${valorNormalizado.replace(/^\.?\//, '')}`;
    }

    function normalizarTemaColor(config) {
        return config?.tema?.colorPrimario ||
            config?.tema?.colores?.colorPrimario ||
            config?.tema?.colores?.primary ||
            '#1877F2';
    }

    function construirMetadatosDesdeConfig(config) {
        const seo = config?.seo || {};
        const cliente = config?.cliente || {};
        const rifa = config?.rifa || {};
        const og = seo.openGraph || {};
        const twitter = seo.twitter || {};
        const baseUrl = resolverBaseUrl(config);
        const tituloDerivado = rifa.nombreSorteo
            ? `${rifa.nombreSorteo}${cliente.nombre ? ` | ${cliente.nombre}` : ''}`
            : (cliente.nombre || document.title || 'Sorteos');
        const descripcionDerivada = rifa.descripcion || (rifa.nombreSorteo
            ? `Participa en el sorteo de ${rifa.nombreSorteo}.`
            : (cliente.eslogan || 'Compra tus boletos en linea.'));
        const title = seo.title || seo.titulo || og.titulo || twitter.titulo || tituloDerivado;
        const description = seo.description || seo.descripcion || og.descripcion || twitter.descripcion || descripcionDerivada;
        const imageRaw = seo.image || seo.imagen || og.imagen || twitter.imagen || cliente.imagenPrincipal || cliente.logo || cliente.logotipo || '/images/placeholder-cover.svg';

        return {
            title,
            description,
            keywords: seo.keywords || seo.palabrasLlave || `sorteo, rifa, ${rifa.nombreSorteo || ''}, ${cliente.nombre || 'Sorteos'}`,
            author: seo.author || seo.autor || cliente.nombre || 'Sorteos',
            og: {
                title: og.titulo || title,
                description: og.descripcion || description,
                image: resolverUrlPublica(og.imagen || imageRaw, baseUrl),
                url: baseUrl,
                type: og.tipo || 'website',
                locale: og.locale || 'es_MX',
                site_name: cliente.nombre || 'Sorteos'
            },
            twitter: {
                card: twitter.card || 'summary_large_image',
                title: twitter.titulo || title,
                description: twitter.descripcion || description,
                image: resolverUrlPublica(twitter.imagen || imageRaw, baseUrl),
                creator: twitter.creador || cliente.redesSociales?.twitter || ''
            },
            themeColor: normalizarTemaColor(config)
        };
    }

    function aplicarMetadatosConstruidos(metadatos) {
        if (!metadatos) return false;

        actualizarTitulo(metadatos.title);
        actualizarMeta('description', metadatos.description, 'name');

        if (metadatos.keywords) {
            actualizarMeta('keywords', metadatos.keywords, 'name');
        }

        if (metadatos.og) {
            actualizarMeta('og:title', metadatos.og.title);
            actualizarMeta('og:description', metadatos.og.description);
            actualizarMeta('og:image', metadatos.og.image);
            actualizarMeta('og:url', metadatos.og.url);
            actualizarMeta('og:type', metadatos.og.type || 'website');
            actualizarMeta('og:locale', metadatos.og.locale || 'es_MX');
            actualizarMeta('og:site_name', metadatos.og.site_name || 'Sorteos');
        }

        if (metadatos.twitter) {
            actualizarMeta('twitter:card', metadatos.twitter.card || 'summary_large_image', 'name');
            actualizarMeta('twitter:title', metadatos.twitter.title, 'name');
            actualizarMeta('twitter:description', metadatos.twitter.description, 'name');
            actualizarMeta('twitter:image', metadatos.twitter.image, 'name');
            if (metadatos.twitter.creator) {
                actualizarMeta('twitter:creator', metadatos.twitter.creator, 'name');
            }
        }

        if (metadatos.author) {
            actualizarMeta('author', metadatos.author, 'name');
        }

        if (metadatos.themeColor) {
            actualizarMeta('theme-color', metadatos.themeColor, 'name');
        }

        actualizarMeta('robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1', 'name');

        const urlActual = window.location.origin + window.location.pathname;
        let canonical = document.querySelector('link[rel="canonical"]');
        if (!canonical) {
            canonical = document.createElement('link');
            canonical.rel = 'canonical';
            document.head.appendChild(canonical);
        }
        canonical.href = urlActual;
        console.log('✅ Canonical actualizado:', urlActual);
        return true;
    }

    function reaplicarMetadatosDesdeConfigSincronizada() {
        if (!window.rifaplusConfig) return false;
        console.log('🔄 [Meta-Inyector] Reaplicando metadatos desde configuración sincronizada...');
        const metadatos = construirMetadatosDesdeConfig(window.rifaplusConfig);
        return aplicarMetadatosConstruidos(metadatos);
    }

    // Función para cargar metadatos desde Backend (/api/og-metadata)
    async function cargarMetadatosDelBackend() {
        const apiBasePreferida = (window.rifaplusConfig && window.rifaplusConfig.backend && window.rifaplusConfig.backend.apiBase)
            ? window.rifaplusConfig.backend.apiBase
            : (window.rifaplusConfig?.obtenerApiBase?.() || window.location.origin);

        const candidatas = [apiBasePreferida];
        if (/localhost:5001/i.test(apiBasePreferida)) {
            candidatas.push(apiBasePreferida.replace(/localhost:5001/i, '127.0.0.1:5001'));
        } else if (/127\.0\.0\.1:5001/i.test(apiBasePreferida)) {
            candidatas.push(apiBasePreferida.replace(/127\.0\.0\.1:5001/i, 'localhost:5001'));
        }

        const basesUnicas = [...new Set(candidatas)];
        let ultimoError = null;

        for (const apiBase of basesUnicas) {
            try {
                const url = `${String(apiBase).replace(/\/+$/, '')}/api/og-metadata`;
                console.debug(`🔗 [Meta-Inyector] Intentando cargar desde: ${url}`);

                const response = await fetch(url, {
                    method: 'GET',
                    cache: 'no-store'
                });

                if (response.ok) {
                    const resultado = await response.json();
                    if (resultado.success && resultado.data) {
                        console.log(`✅ [Meta-Inyector] Metadatos cargados desde BACKEND: ${apiBase}`);
                        return resultado.data;
                    }
                }
                console.warn(`⚠️  [Meta-Inyector] Backend respondió con status ${response.status} en ${apiBase}`);
            } catch (err) {
                ultimoError = err;
                console.warn(`⚠️  [Meta-Inyector] Falló ${apiBase}:`, err.message);
            }
        }

        if (ultimoError) {
            console.warn('⚠️  [Meta-Inyector] No se pudo cargar desde backend:', ultimoError.message);
        }
        return null;
    }

    // Función para esperar a que config.js cargue (Fallback)
    function esperarConfig(timeout = 5000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const verificar = () => {
                if (window.rifaplusConfig && window.rifaplusConfig.seo) {
                    console.log('✅ [Meta-Inyector] config.js detectado (fallback)');
                    resolve(window.rifaplusConfig);
                } else if (Date.now() - startTime > timeout) {
                    console.warn('⚠️  [Meta-Inyector] Timeout esperando config.js');
                    reject(new Error('config.js no cargó a tiempo'));
                } else {
                    setTimeout(verificar, 50);
                }
            };
            
            verificar();
        });
    }

    // Función para actualizar metadato existente O crear uno nuevo
    function actualizarMeta(propiedad, contenido, atributo = 'property') {
        if (!contenido) {
            console.warn(`⚠️  [Meta-Inyector] Contenido vacío para: ${propiedad}`);
            return false;
        }

        try {
            let meta = document.querySelector(`meta[${atributo}="${propiedad}"]`);
            
            if (meta) {
                // Actualizar existente
                meta.content = contenido;
                console.log(`✅ Actualizado: ${propiedad}`);
            } else {
                // Crear nuevo
                meta = document.createElement('meta');
                meta.setAttribute(atributo, propiedad);
                meta.content = contenido;
                document.head.appendChild(meta);
                console.log(`✅ Creado: ${propiedad}`);
            }
            
            return true;
        } catch (error) {
            console.error(`❌ Error actualizando ${propiedad}:`, error);
            return false;
        }
    }

    // Función para actualizar el título de la página
    function actualizarTitulo(titulo) {
        if (!titulo) {
            console.warn('⚠️  [Meta-Inyector] Título vacío');
            return false;
        }

        try {
            document.title = titulo;
            console.log(`✅ Título actualizado: ${titulo}`);
            return true;
        } catch (error) {
            console.error('❌ Error actualizando título:', error);
            return false;
        }
    }

    // Función principal para inyectar todos los metadatos
    async function inyectarMetadatos() {
        try {
            console.log('🔄 [Meta-Inyector] Iniciando inyección de metadatos...');
            
            let metadatosBackend = null;
            if (!esClienteHumano()) {
                metadatosBackend = await cargarMetadatosDelBackend();
            } else {
                console.log('ℹ️ [Meta-Inyector] Navegador normal detectado: se omite fetch de /api/og-metadata y se usa config sincronizable.');
            }
            
            // PASO 2: Si falla backend, usar config.js como fallback
            let metadatos;
            if (metadatosBackend) {
                metadatos = metadatosBackend;
                console.log('📊 Fuente: BACKEND (/api/og-metadata)');
            } else {
                console.log('📊 Fuente: CONFIG.JS (fallback)');
                const config = await esperarConfig();
                metadatos = construirMetadatosDesdeConfig(config);
            }

            console.log('📝 Inyectando metadatos...');
            aplicarMetadatosConstruidos(metadatos);

            // 10. VALIDACIÓN FINAL
            console.log('');
            console.log('═══════════════════════════════════════════════');
            console.log('✅ [Meta-Inyector] INYECCIÓN COMPLETADA CON ÉXITO');
            console.log('═══════════════════════════════════════════════');
            console.log('📄 Página:', document.title);
            console.log('🔗 URL: ', window.location.origin + window.location.pathname);
            console.log('═══════════════════════════════════════════════');
            console.log('');

            // Marcar como completado
            window.metadatosInyectados = true;

            if (window.rifaplusConfig && typeof window.rifaplusConfig.escucharEvento === 'function' && !window.__metaInyectorEventoRegistrado) {
                window.__metaInyectorEventoRegistrado = true;
                window.rifaplusConfig.escucharEvento('configuracionActualizada', reaplicarMetadatosDesdeConfigSincronizada);
            }

            return true;

        } catch (error) {
            console.error('❌ [Meta-Inyector] ERROR:', error);
            window.metadatosInyectados = false;
            return false;
        }
    }

    // EJECUTAR: Iniciar inyección cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inyectarMetadatos);
    } else {
        inyectarMetadatos();
    }

    window.reinyectarMetadatos = reaplicarMetadatosDesdeConfigSincronizada;

})();
