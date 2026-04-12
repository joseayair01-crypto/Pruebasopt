(() => {
    const SHOW_DELAY_MS = 320;
    const MIN_VISIBLE_MS = 420;
    const SOFT_FALLBACK_MS = 1200;
    const MAX_WAIT_MS = 3600;
    const PLACEHOLDER_LOGO = 'images/placeholder-logo.svg';

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
        const fallback = 'images/placeholder-logo.svg';
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

    function logoObjetivoEsReal() {
        const logoObjetivo = resolverLogoObjetivo();
        return Boolean(logoObjetivo) && !logoObjetivo.includes(PLACEHOLDER_LOGO);
    }

    function logoCabeceraListo() {
        const headerLogo = document.querySelector('.logo-circle img.dynamic-logo, .logo-circle img[data-dynamic-logo="true"]');
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

    cuandoDomEsteListo(() => {
        const body = document.body;
        const overlay = document.getElementById('rifaplusPublicShell');
        if (!body || !overlay || !body.classList.contains('rifaplus-shell-loading')) {
            return;
        }

        let mostradoEn = 0;
        let cerrado = false;
        let shellVisible = false;
        let pollId = 0;
        let forceCloseId = 0;
        let permitirFallbackLogo = false;

        const shellPuedeCerrar = () => {
            return tieneConfigMinima() && (logoCabeceraListo() || permitirFallbackLogo);
        };

        overlay.setAttribute('hidden', 'hidden');

        const mostrarShell = () => {
            if (cerrado || shellVisible) {
                return;
            }

            shellVisible = true;
            mostradoEn = Date.now();
            overlay.removeAttribute('hidden');
            requestAnimationFrame(() => {
                overlay.classList.add('is-visible');
            });
        };

        const cerrarShell = () => {
            if (cerrado) return;
            cerrado = true;
            if (pollId) {
                window.clearInterval(pollId);
                pollId = 0;
            }
            if (forceCloseId) {
                window.clearTimeout(forceCloseId);
                forceCloseId = 0;
            }
            actualizarLogoShell();

            if (!shellVisible) {
                body.classList.remove('rifaplus-shell-loading');
                body.classList.add('rifaplus-shell-ready');
                body.removeAttribute('aria-busy');
                return;
            }

            const restante = Math.max(0, MIN_VISIBLE_MS - (Date.now() - mostradoEn));
            window.setTimeout(() => {
                body.classList.remove('rifaplus-shell-loading');
                body.classList.add('rifaplus-shell-ready');
                body.removeAttribute('aria-busy');
                overlay.classList.remove('is-visible');
                overlay.classList.add('is-leaving');

                window.setTimeout(() => {
                    overlay.setAttribute('hidden', 'hidden');
                }, 320);
            }, restante);
        };

        const evaluarCierre = () => {
            actualizarLogoShell();
            if (shellPuedeCerrar()) {
                cerrarShell();
                return true;
            }
            return false;
        };

        actualizarLogoShell();
        window.setTimeout(mostrarShell, SHOW_DELAY_MS);

        window.addEventListener('configSyncCompleto', () => {
            if (!evaluarCierre()) {
                mostrarShell();
            }
        }, { once: true });
        window.addEventListener('configuracionActualizada', () => {
            if (!evaluarCierre()) {
                mostrarShell();
            }
        });
        window.addEventListener('load', () => {
            if (!evaluarCierre()) {
                mostrarShell();
            }
        }, { once: true });

        const headerLogo = document.querySelector('.logo-circle img.dynamic-logo, .logo-circle img[data-dynamic-logo="true"]');
        if (headerLogo) {
            headerLogo.addEventListener('load', () => {
                evaluarCierre();
            }, { once: false });

            headerLogo.addEventListener('error', () => {
                permitirFallbackLogo = true;
                headerLogo.setAttribute('src', PLACEHOLDER_LOGO);
                if (!shellVisible) {
                    mostrarShell();
                }
                evaluarCierre();
            });
        }

        window.setTimeout(() => {
            if (!evaluarCierre()) {
                mostrarShell();
            }
        }, SOFT_FALLBACK_MS);

        pollId = window.setInterval(() => {
            evaluarCierre();
        }, 180);

        forceCloseId = window.setTimeout(cerrarShell, MAX_WAIT_MS);
    });
})();
