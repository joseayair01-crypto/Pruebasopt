(() => {
    const SHOW_DELAY_MS = 180;
    const MIN_VISIBLE_MS = 320;
    const SOFT_FALLBACK_MS = 900;
    const MAX_WAIT_MS = 2400;
    const POLL_INTERVAL_MS = 120;
    const LEAVE_ANIMATION_MS = 320;
    const PLACEHOLDER_LOGO = 'images/placeholder-logo.svg';
    const LOGO_PLACEHOLDER_DATA_PREFIX = 'data:image/svg+xml';

    function cuandoDomEsteListo(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
            return;
        }

        callback();
    }

    function resolverLogoShell() {
        const imageDelivery = window.RifaPlusImageDelivery;
        const config = window.rifaplusConfig || {};
        const logoPreferido = config?.cliente?.logo || config?.cliente?.logotipo || '';
        let logoCacheado = window.__RIFAPLUS_CACHED_LOGO__ || '';

        if (!logoCacheado) {
            try {
                logoCacheado = localStorage.getItem('rifaplus_cached_logo') || '';
            } catch (error) {
                logoCacheado = '';
            }
        }

        const fallback = PLACEHOLDER_LOGO;
        const logo = String(logoPreferido || logoCacheado || fallback).trim() || fallback;
        return imageDelivery?.resolverUrlImagen(logo, 'logo') || logo;
    }

    function tieneConfigMinima() {
        const config = window.rifaplusConfig || {};
        const cliente = config.cliente || {};
        const rifa = config.rifa || {};

        return Boolean(
            String(cliente.nombre || '').trim()
            || String(cliente.logo || cliente.logotipo || '').trim()
            || String(rifa.nombreSorteo || '').trim()
            || Number(rifa.precioBoleto) > 0
            || String(rifa.fechaSorteo || '').trim()
        );
    }

    function actualizarLogoShell() {
        const logo = document.getElementById('rifaplusShellLogo');
        if (!logo) return;

        const siguienteSrc = resolverLogoShell();
        if (siguienteSrc && logo.getAttribute('src') !== siguienteSrc) {
            logo.setAttribute('src', siguienteSrc);
        }
    }

    function normalizarRutaLogo(valor) {
        const texto = String(valor || '').trim();
        if (!texto) return '';

        try {
            return new URL(texto, window.location.href).href;
        } catch (error) {
            return texto;
        }
    }

    function resolverLogoObjetivo() {
        return normalizarRutaLogo(resolverLogoShell());
    }

    function logoObjetivoVieneDeCacheReal() {
        const config = window.rifaplusConfig || {};
        const logoPreferido = String(config?.cliente?.logo || config?.cliente?.logotipo || '').trim();
        let logoCacheado = String(window.__RIFAPLUS_CACHED_LOGO__ || '').trim();

        if (!logoCacheado) {
            try {
                logoCacheado = String(localStorage.getItem('rifaplus_cached_logo') || '').trim();
            } catch (error) {
                logoCacheado = '';
            }
        }

        const logoObjetivo = resolverLogoObjetivo();
        const tieneCacheReal = Boolean(logoCacheado)
            && !logoCacheado.includes(PLACEHOLDER_LOGO)
            && !logoCacheado.startsWith(LOGO_PLACEHOLDER_DATA_PREFIX);

        if (!tieneCacheReal || !logoObjetivo) {
            return false;
        }

        if (!logoPreferido) {
            return normalizarRutaLogo(logoCacheado) === logoObjetivo;
        }

        return normalizarRutaLogo(logoCacheado) === logoObjetivo;
    }

    function logoObjetivoEsReal() {
        const logoObjetivo = resolverLogoObjetivo();
        return Boolean(logoObjetivo)
            && !logoObjetivo.includes(PLACEHOLDER_LOGO)
            && !logoObjetivo.startsWith(LOGO_PLACEHOLDER_DATA_PREFIX);
    }

    function obtenerLogoCabecera() {
        return document.querySelector('.logo-circle img.dynamic-logo, .logo-circle img[data-dynamic-logo="true"]');
    }

    function logoCabeceraListo() {
        const headerLogo = obtenerLogoCabecera();
        if (!headerLogo) {
            return !logoObjetivoEsReal();
        }

        const srcActual = normalizarRutaLogo(headerLogo.currentSrc || headerLogo.getAttribute('src'));
        const logoObjetivo = resolverLogoObjetivo();

        if (!logoObjetivoEsReal()) {
            return headerLogo.complete && headerLogo.naturalWidth > 0;
        }

        return Boolean(srcActual)
            && srcActual === logoObjetivo
            && headerLogo.complete
            && headerLogo.naturalWidth > 0;
    }

    function tieneEstructuraBase() {
        return Boolean(document.querySelector('header, main, .compra-hero, .hero, .mis-boletos-container, .sorteo-finalizado-page'));
    }

    function aplicarBodyReady(body) {
        body.classList.remove('rifaplus-shell-loading', 'rifaplus-shell-active');
        body.classList.add('rifaplus-shell-ready');
        body.removeAttribute('aria-busy');
    }

    function actualizarEstadoLogoHeader(body) {
        if (!body) return;

        if (logoCabeceraListo()) {
            body.classList.remove('rifaplus-logo-pending');
            body.classList.add('rifaplus-logo-ready');
            return;
        }

        body.classList.add('rifaplus-logo-pending');
        body.classList.remove('rifaplus-logo-ready');
    }

    cuandoDomEsteListo(() => {
        const body = document.body;
        const overlay = document.getElementById('rifaplusPublicShell');

        if (!body || !overlay || !body.classList.contains('rifaplus-shell-loading')) {
            return;
        }

        const estado = {
            inicio: performance.now(),
            visible: false,
            cerrado: false,
            mostradoEn: 0,
            configSincronizada: tieneConfigMinima(),
            ventanaCargada: document.readyState === 'complete',
            permitirFallbackLogo: false,
            noMostrarOverlay: false,
            intervalId: 0,
            showId: 0,
            softFallbackId: 0,
            forceCloseId: 0,
            cacheLogoRealDisponible: logoObjetivoVieneDeCacheReal()
        };

        overlay.setAttribute('hidden', 'hidden');

        const limpiarTimers = () => {
            if (estado.intervalId) {
                window.clearInterval(estado.intervalId);
                estado.intervalId = 0;
            }
            if (estado.showId) {
                window.clearTimeout(estado.showId);
                estado.showId = 0;
            }
            if (estado.softFallbackId) {
                window.clearTimeout(estado.softFallbackId);
                estado.softFallbackId = 0;
            }
            if (estado.forceCloseId) {
                window.clearTimeout(estado.forceCloseId);
                estado.forceCloseId = 0;
            }
        };

        const obtenerReadiness = () => {
            const elapsed = performance.now() - estado.inicio;
            const configReady = tieneConfigMinima() || estado.configSincronizada || estado.ventanaCargada;
            const structureReady = tieneEstructuraBase();
            const logoReady = logoCabeceraListo() || estado.permitirFallbackLogo;
            const canClose = (configReady && logoReady)
                || (elapsed >= SOFT_FALLBACK_MS && structureReady && (configReady || logoReady || estado.ventanaCargada))
                || elapsed >= MAX_WAIT_MS;
            const shouldShow = !estado.noMostrarOverlay
                && !canClose
                && elapsed >= SHOW_DELAY_MS
                && (!structureReady || (!configReady && !logoReady));

            return {
                elapsed,
                configReady,
                structureReady,
                logoReady,
                canClose,
                shouldShow
            };
        };

        const mostrarShell = () => {
            if (estado.cerrado || estado.visible || estado.noMostrarOverlay) {
                return;
            }

            estado.visible = true;
            estado.mostradoEn = performance.now();
            body.classList.add('rifaplus-shell-active');
            overlay.removeAttribute('hidden');
            requestAnimationFrame(() => {
                overlay.classList.add('is-visible');
            });
        };

        const cerrarShell = () => {
            if (estado.cerrado) return;
            estado.cerrado = true;
            limpiarTimers();
            actualizarLogoShell();

            if (!estado.visible) {
                requestAnimationFrame(() => {
                    aplicarBodyReady(body);
                });
                return;
            }

            const restante = Math.max(0, MIN_VISIBLE_MS - (performance.now() - estado.mostradoEn));
            window.setTimeout(() => {
                aplicarBodyReady(body);
                overlay.classList.remove('is-visible');
                overlay.classList.add('is-leaving');

                window.setTimeout(() => {
                    overlay.setAttribute('hidden', 'hidden');
                    overlay.classList.remove('is-leaving');
                }, LEAVE_ANIMATION_MS);
            }, restante);
        };

        const evaluar = () => {
            if (estado.cerrado) return true;

            actualizarLogoShell();
            actualizarEstadoLogoHeader(body);
            const readiness = obtenerReadiness();

            const puedeOmitirOverlayTemprano = readiness.structureReady
                && readiness.configReady
                && (readiness.logoReady || estado.cacheLogoRealDisponible);

            if (!estado.visible && puedeOmitirOverlayTemprano && readiness.elapsed < SHOW_DELAY_MS) {
                estado.noMostrarOverlay = true;
            }

            if (readiness.canClose) {
                cerrarShell();
                return true;
            }

            if (readiness.shouldShow) {
                mostrarShell();
            }

            return false;
        };

        const onConfigSync = () => {
            estado.configSincronizada = true;
            estado.cacheLogoRealDisponible = logoObjetivoVieneDeCacheReal();
            evaluar();
        };

        const onWindowLoad = () => {
            estado.ventanaCargada = true;
            evaluar();
        };

        actualizarLogoShell();
        actualizarEstadoLogoHeader(body);

        estado.showId = window.setTimeout(() => {
            evaluar();
        }, SHOW_DELAY_MS);

        estado.softFallbackId = window.setTimeout(() => {
            estado.permitirFallbackLogo = true;
            evaluar();
        }, SOFT_FALLBACK_MS);

        estado.forceCloseId = window.setTimeout(() => {
            cerrarShell();
        }, MAX_WAIT_MS);

        estado.intervalId = window.setInterval(() => {
            evaluar();
        }, POLL_INTERVAL_MS);

        window.addEventListener('configSyncCompleto', onConfigSync, { once: true });
        window.addEventListener('configuracionActualizada', onConfigSync);
        window.addEventListener('load', onWindowLoad, { once: true });
        window.addEventListener('pageshow', evaluar, { once: true });

        const headerLogo = obtenerLogoCabecera();
        if (headerLogo) {
            headerLogo.addEventListener('load', evaluar);
            headerLogo.addEventListener('error', () => {
                estado.permitirFallbackLogo = true;
                headerLogo.setAttribute('src', PLACEHOLDER_LOGO);
                actualizarEstadoLogoHeader(body);
                evaluar();
            });
        }

        const shellLogo = document.getElementById('rifaplusShellLogo');
        if (shellLogo) {
            shellLogo.addEventListener('load', evaluar);
            shellLogo.addEventListener('error', () => {
                estado.permitirFallbackLogo = true;
                shellLogo.setAttribute('src', PLACEHOLDER_LOGO);
                actualizarEstadoLogoHeader(body);
                evaluar();
            });
        }

        evaluar();
    });
})();
