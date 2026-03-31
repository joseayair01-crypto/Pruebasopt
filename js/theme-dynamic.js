/**
 * ============================================================
 * ARCHIVO: js/theme-dynamic.js
 * DESCRIPCIÓN: Inyección dinámica de logos y temas desde config
 * Se ejecuta después de config.js para actualizar todos los logos
 * automáticamente sin necesidad de hardcodear rutas
 * ============================================================
 */

(function aplicarLogoCacheadoTemprano() {
    let cachedLogo = window.__RIFAPLUS_CACHED_LOGO__ || '';

    if (!cachedLogo) {
        try {
            cachedLogo = localStorage.getItem('rifaplus_cached_logo') || '';
        } catch (error) {
            cachedLogo = '';
        }
    }

    if (!cachedLogo || cachedLogo === 'images/placeholder-logo.svg') {
        return;
    }

    if (window.rifaplusConfig?.cliente) {
        const logoActual = window.rifaplusConfig.cliente.logo || window.rifaplusConfig.cliente.logotipo || '';
        if (!logoActual || logoActual === 'images/placeholder-logo.svg') {
            window.rifaplusConfig.cliente.logo = cachedLogo;
            window.rifaplusConfig.cliente.logotipo = cachedLogo;
        }
    }

    const aplicarLogoCacheado = () => {
        try {
            const favicon = document.querySelector('link[rel="icon"]');
            if (favicon) favicon.href = cachedLogo;

            const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
            if (appleTouchIcon) appleTouchIcon.href = cachedLogo;

            const preloadLogo = document.querySelector('link[rel="preload"][as="image"]');
            if (preloadLogo) preloadLogo.href = cachedLogo;

            const candidatos = document.querySelectorAll(
                'img[data-dynamic-logo="true"], img.dynamic-logo, img.footer-logo-img, img.carrito-logo'
            );

            candidatos.forEach((img) => {
                if (!img || img.getAttribute('data-dynamic-logo') === 'false') return;
                img.src = cachedLogo;
                img.setAttribute('data-dynamic-logo', 'true');
                if (!img.classList.contains('dynamic-logo')) {
                    img.classList.add('dynamic-logo');
                }
            });
        } catch (error) {
            console.warn('⚠️ Error aplicando logo cacheado tempranamente:', error?.message || error);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', aplicarLogoCacheado, { once: true });
    } else {
        aplicarLogoCacheado();
    }
})();

function obtenerLogoCacheadoSeguro() {
    if (window.__RIFAPLUS_CACHED_LOGO__ && window.__RIFAPLUS_CACHED_LOGO__ !== 'images/placeholder-logo.svg') {
        return window.__RIFAPLUS_CACHED_LOGO__;
    }

    try {
        const cachedLogo = localStorage.getItem('rifaplus_cached_logo') || '';
        return cachedLogo && cachedLogo !== 'images/placeholder-logo.svg' ? cachedLogo : '';
    } catch (error) {
        return '';
    }
}

function resolverLogoPreferido(logoPath) {
    const logoNormalizado = String(logoPath || '').trim();
    const cachedLogo = obtenerLogoCacheadoSeguro();

    if (!logoNormalizado || logoNormalizado === 'images/placeholder-logo.svg') {
        return cachedLogo || 'images/placeholder-logo.svg';
    }

    return logoNormalizado;
}

(function initDynamicTheme() {
    // Esperar a que config esté cargado
    const waitForConfig = setInterval(() => {
        if (window.rifaplusConfig && window.rifaplusConfig.cliente) {
            clearInterval(waitForConfig);
            // Esperar a que el DOM esté listo antes de modificar elementos
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', applyDynamicTheme);
            } else {
                applyDynamicTheme();
            }
        }
    }, 50);

    // Timeout de seguridad (5 segundos)
    setTimeout(() => clearInterval(waitForConfig), 5000);
})();

/**
 * Aplicar tema dinámico: logo, colores, etc.
 */
function applyDynamicTheme() {
    if (!window.rifaplusConfig) {
        console.warn('⚠️  Config no disponible para tema dinámico');
        return;
    }

    const config = window.rifaplusConfig;
    const cliente = config.cliente;
    const temaConfig = config.tema || {};
    const tema = construirTemaNormalizado(temaConfig);
    const temaPersonalizadoActivo = temaConfig.personalizado === true;

    console.log('🎨 Aplicando tema dinámico desde config...');

    const logoCliente = resolverLogoPreferido(cliente.logo || cliente.logotipo);

    if (cliente && logoCliente && logoCliente !== 'images/placeholder-logo.svg') {
        cliente.logo = logoCliente;
        cliente.logotipo = logoCliente;
    }

    // 1. Actualizar favicon dinámicamente
    updateFavicon(logoCliente);

    // 2. Actualizar todos los logos en la página
    updateAllLogos(logoCliente);

    // 3. Actualizar CSS variables para colores
    if (temaPersonalizadoActivo) {
        updateCSSVariables(tema);
    } else {
        console.log('🎨 [Theme-Dynamic] Tema personalizado inactivo; se conserva la apariencia pública base');
    }

    // 4. Actualizar título de página
    updatePageTitle(cliente, config.rifa);

    // 5. Actualizar contenido de la página (hero, subtítulos, footer)
    updatePageContent(cliente, config.rifa);

    console.log('✅ Tema dinámico aplicado correctamente');
}

/**
 * ✅ Listener para actualizar UI cuando ocurre sincronización de backend
 * Escucha cambios en cliente.nombre y actualiza TODOS los elementos
 */
if (typeof window.rifaplusConfig !== 'undefined') {
    if (typeof window.rifaplusConfig.escucharEvento === 'function') {
        window.rifaplusConfig.escucharEvento('configuracionActualizada', function(datos) {
            console.log('🔄 [Theme-Dynamic] Evento configuracionActualizada detectado, reaplicando tema dinámico...');
            if (typeof window.rifaplusConfig.actualizarNombreClienteEnUI === 'function') {
                window.rifaplusConfig.actualizarNombreClienteEnUI();
            }
            applyDynamicTheme();
        });
    }
}

/**
 * Actualizar favicon dinámicamente
 * @param {String} logoPath - Ruta del logo desde config
 */
function updateFavicon(logoPath) {
    const logoResuelto = resolverLogoPreferido(logoPath);
    if (!logoResuelto) {
        console.warn('⚠️  Logo no especificado en config');
        return;
    }

    // Buscar o crear link del favicon
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
    }
    favicon.href = logoResuelto;

    // Actualizar apple-touch-icon
    let appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (!appleTouchIcon) {
        appleTouchIcon = document.createElement('link');
        appleTouchIcon.rel = 'apple-touch-icon';
        document.head.appendChild(appleTouchIcon);
    }
    appleTouchIcon.href = logoResuelto;

    console.log(`📱 Favicon actualizado: ${logoResuelto}`);
}

/**
 * Actualizar todos los logos en la página
 * Busca imágenes con clase o atributo especial y actualiza src
 * @param {String} logoPath - Ruta del logo
 */
function updateAllLogos(logoPath) {
    const logoResuelto = resolverLogoPreferido(logoPath);
    if (!logoResuelto) return;

    try {
        localStorage.setItem('rifaplus_cached_logo', logoResuelto);
        window.__RIFAPLUS_CACHED_LOGO__ = logoResuelto;
    } catch (error) {
        console.warn('⚠️ No se pudo guardar el logo en caché local:', error?.message || error);
    }

    // Actualizar imágenes con clase "dynamic-logo"
    const dynamicLogos = document.querySelectorAll('img[data-dynamic-logo="true"], img.dynamic-logo');
    dynamicLogos.forEach(img => {
        const oldSrc = img.src;
        img.src = logoResuelto;
        console.log(`🖼️  Logo actualizado: ${oldSrc} → ${logoResuelto}`);
    });

    // Fallback: si hay imágenes con src hardcodeado a logos antiguos, reemplazarlas
    const fallbackLogos = [
        'images/placeholder-logo.svg',
        'images/logo-anterior.png',
        'images/logo.webp'
    ];

    fallbackLogos.forEach(oldLogo => {
        const imgs = document.querySelectorAll(`img[src="${oldLogo}"]`);
        imgs.forEach(img => {
            if (img.getAttribute('data-dynamic-logo') !== 'false') { // Excluir si está marcado como estático
                img.src = logoResuelto;
                img.setAttribute('data-dynamic-logo', 'true');
                console.log(`🖼️  Logo fallback actualizado: ${oldLogo} → ${logoResuelto}`);
            }
        });
    });
}

/**
 * Actualizar variables CSS con colores del tema
 * @param {Object} tema - Objeto de colores del tema
 */
function updateCSSVariables(tema) {
    if (!tema || typeof tema !== 'object') return;

    const esAdmin = /\/admin-[^/]+\.html$/i.test(window.location.pathname) || /^admin-[^/]+\.html$/i.test(window.location.pathname.split('/').pop() || '');
    if (esAdmin) {
        console.log('🎛️ [Theme-Dynamic] Colores dinámicos omitidos en admin para preservar tema fijo');
        return;
    }

    const root = document.documentElement;

    // Mapear colores del config a variables CSS
    const colorMap = {
        primary: '--primary',
        primaryDark: '--primary-dark',
        primaryLight: '--primary-light',
        secondary: '--secondary',
        success: '--success',
        danger: '--danger',
        textDark: '--text-dark',
        textLight: '--text-light',
        bgLight: '--bg-light',
        bgWhite: '--bg-white',
        borderColor: '--border-color'
    };

    Object.entries(colorMap).forEach(([configKey, cssVar]) => {
        if (tema[configKey]) {
            root.style.setProperty(cssVar, tema[configKey]);
            console.log(`🎨 CSS var ${cssVar} = ${tema[configKey]}`);
        }
    });

    const primaryRgb = hexToRgbSeguro(tema.primary || '#27527e');
    root.style.setProperty('--primary-rgb', `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`);
    const secondaryRgb = hexToRgbSeguro(tema.secondary || '#e39a63');
    root.style.setProperty('--secondary-rgb', `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}`);
    [5, 8, 10, 12, 15, 18, 20, 25, 30, 35, 40].forEach((nivel) => {
        root.style.setProperty(`--primary-${String(nivel).padStart(2, '0')}`, `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, ${nivel / 100})`);
    });

    const bgWhite = normalizarHexColorSeguro(tema.bgWhite || '#ffffff');
    const bgLight = normalizarHexColorSeguro(tema.bgLight || '#f7fafc');
    const primary = normalizarHexColorSeguro(tema.primary || '#12324b');
    const primaryDark = normalizarHexColorSeguro(tema.primaryDark || ajustarLuminosidadHex(primary, -0.22));
    const secondary = normalizarHexColorSeguro(tema.secondary || '#24b8ff');

    root.style.setProperty('--surface-base', bgWhite);
    root.style.setProperty('--surface-soft', bgLight);
    root.style.setProperty('--surface-tint', mezclarColoresHex(primary, bgWhite, 0.9));
    root.style.setProperty('--surface-accent', mezclarColoresHex(secondary, bgWhite, 0.87));
    root.style.setProperty('--surface-header', primary);
    root.style.setProperty('--card-bg', bgWhite);
    root.style.setProperty('--card-bg-soft', `linear-gradient(180deg, ${bgWhite}, ${bgLight})`);
    root.style.setProperty(
        '--section-bg-primary',
        `linear-gradient(180deg, ${mezclarColoresHex(primary, bgWhite, 0.08)} 0%, ${mezclarColoresHex(primary, bgWhite, 0.18)} 42%, ${mezclarColoresHex(primary, bgWhite, 0.34)} 100%)`
    );
    root.style.setProperty(
        '--section-bg-soft',
        `linear-gradient(180deg, ${bgWhite} 0%, ${mezclarColoresHex(primary, bgWhite, 0.92)} 100%)`
    );
    root.style.setProperty(
        '--section-bg-warm',
        `linear-gradient(180deg, ${mezclarColoresHex(primary, bgWhite, 0.93)} 0%, ${mezclarColoresHex(primary, bgWhite, 0.88)} 100%)`
    );
    root.style.setProperty('--header-bg', primary);
    root.style.setProperty('--header-border', 'rgba(255, 255, 255, 0.14)');
    root.style.setProperty('--header-ink', asegurarContrasteTexto('#f8fbff', primary, 4.5));
    root.style.setProperty('--header-control-bg', 'rgba(255, 255, 255, 0.08)');
    root.style.setProperty('--header-control-border', 'rgba(255, 255, 255, 0.18)');
    root.style.setProperty('--header-hover-bg', 'rgba(255, 255, 255, 0.10)');
    root.style.setProperty('--header-hover-ink', '#ffffff');
    root.style.setProperty('--hero-tint-primary', `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.50)`);
    root.style.setProperty('--hero-tint-secondary', `rgba(${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}, 0.35)`);
    root.style.setProperty('--hero-cta-shadow', `0 12px 26px rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.18)`);
    root.style.setProperty('--hero-cta-shadow-hover', `0 14px 30px rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.22)`);
    root.style.setProperty('--price-badge-bg', primaryDark);
    root.style.setProperty('--price-highlight-bg', mezclarColoresHex(secondary, bgWhite, 0.87));
    root.style.setProperty('--price-card-bg', `linear-gradient(180deg, ${primary} 0%, ${primaryDark} 100%)`);
    root.style.setProperty('--price-card-border', `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.22)`);
    root.style.setProperty('--price-card-shadow', `0 18px 36px rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.24)`);
    root.style.setProperty('--price-card-shadow-hover', `0 24px 46px rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.34)`);

    const priceMainColor = asegurarContrasteTexto('#ffffff', primaryDark, 4.5);
    const priceKickerBg = mezclarColoresHex(primary, bgWhite, 0.12);
    const priceOfferPanelBg = mezclarColoresHex(primary, bgWhite, 0.18);
    const priceVigenciaBg = mezclarColoresHex(primary, bgWhite, 0.92);
    const priceVigenciaText = asegurarContrasteTexto(primaryDark, priceVigenciaBg, 4.5);

    root.style.setProperty('--price-kicker-color', asegurarContrasteTexto('#eef6ff', primary, 3.6));
    root.style.setProperty('--price-title-color', priceMainColor);
    root.style.setProperty('--price-main-color', priceMainColor);
    root.style.setProperty('--price-caption-color', asegurarContrasteTexto('#e5eef6', primaryDark, 3.2));
    root.style.setProperty('--price-old-color', asegurarContrasteTexto('#f3f6fb', primary, 3.1));
    root.style.setProperty('--price-offer-panel-bg', priceOfferPanelBg);
    root.style.setProperty('--price-offer-panel-border', `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.20)`);
    root.style.setProperty('--price-offer-label-color', asegurarContrasteTexto('#f6fbff', priceOfferPanelBg, 4.0));
    root.style.setProperty('--price-offer-value-color', asegurarContrasteTexto('#ffffff', priceOfferPanelBg, 4.5));
    root.style.setProperty('--price-vigencia-bg', priceVigenciaBg);
    root.style.setProperty('--price-vigencia-border', `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.14)`);
    root.style.setProperty('--price-vigencia-text', priceVigenciaText);
}

function normalizarHexColorSeguro(valor, fallback = '#27527e') {
    const limpio = String(valor || '').trim();
    const match = limpio.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (!match) return fallback;
    const hex = match[1];
    if (hex.length === 3) {
        return `#${hex.split('').map((char) => char + char).join('').toLowerCase()}`;
    }
    return `#${hex.toLowerCase()}`;
}

function hexToRgbSeguro(hex) {
    const normalizado = normalizarHexColorSeguro(hex);
    const valor = normalizado.slice(1);
    return {
        r: parseInt(valor.slice(0, 2), 16),
        g: parseInt(valor.slice(2, 4), 16),
        b: parseInt(valor.slice(4, 6), 16)
    };
}

function rgbToHexSeguro({ r, g, b }) {
    const toHex = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mezclarColoresHex(colorA, colorB, porcentajeB = 0.5) {
    const a = hexToRgbSeguro(colorA);
    const b = hexToRgbSeguro(colorB);
    const ratio = Math.max(0, Math.min(1, porcentajeB));
    return rgbToHexSeguro({
        r: a.r + ((b.r - a.r) * ratio),
        g: a.g + ((b.g - a.g) * ratio),
        b: a.b + ((b.b - a.b) * ratio)
    });
}

function ajustarLuminosidadHex(color, factor = 0) {
    return factor >= 0
        ? mezclarColoresHex(color, '#ffffff', factor)
        : mezclarColoresHex(color, '#000000', Math.abs(factor));
}

function luminanciaRelativa(color) {
    const { r, g, b } = hexToRgbSeguro(color);
    const canal = (valor) => {
        const normalizado = valor / 255;
        return normalizado <= 0.03928
            ? normalizado / 12.92
            : ((normalizado + 0.055) / 1.055) ** 2.4;
    };
    return (0.2126 * canal(r)) + (0.7152 * canal(g)) + (0.0722 * canal(b));
}

function obtenerContraste(colorA, colorB) {
    const l1 = luminanciaRelativa(colorA);
    const l2 = luminanciaRelativa(colorB);
    const claro = Math.max(l1, l2);
    const oscuro = Math.min(l1, l2);
    return (claro + 0.05) / (oscuro + 0.05);
}

function asegurarContrasteTexto(textoPreferido, fondo, minimo = 4.5) {
    const preferido = normalizarHexColorSeguro(textoPreferido, '#0f172a');
    if (obtenerContraste(preferido, fondo) >= minimo) return preferido;

    const opcionOscura = '#0f172a';
    const opcionClara = '#ffffff';
    return obtenerContraste(opcionClara, fondo) > obtenerContraste(opcionOscura, fondo)
        ? opcionClara
        : opcionOscura;
}

function construirTemaNormalizado(temaRaw = {}) {
    const coloresRaw = temaRaw.colores || {};
    const colorPrimario = normalizarHexColorSeguro(
        temaRaw.colorPrimario || coloresRaw.colorPrimario || coloresRaw.primary,
        '#27527e'
    );
    const colorAcento = normalizarHexColorSeguro(
        temaRaw.colorAcento || coloresRaw.colorAccento || coloresRaw.colorSecundario || coloresRaw.secondary,
        '#e39a63'
    );
    const colorFondo = normalizarHexColorSeguro(
        temaRaw.colorFondo || coloresRaw.colorFondo || coloresRaw.bgLight,
        '#f8f6f2'
    );
    const colorSuperficie = normalizarHexColorSeguro(
        temaRaw.colorSuperficie || coloresRaw.colorSuperficie || coloresRaw.bgWhite,
        '#ffffff'
    );
    const colorTexto = asegurarContrasteTexto(
        temaRaw.colorTexto || coloresRaw.colorTexto || coloresRaw.textDark || colorAcento,
        colorSuperficie
    );
    const colorTextoSecundario = asegurarContrasteTexto(
        coloresRaw.colorTextoSecundario || coloresRaw.textLight || mezclarColoresHex(colorTexto, colorSuperficie, 0.42),
        colorSuperficie,
        3.6
    );

    return {
        personalizado: temaRaw.personalizado === true,
        colorPrimario,
        colorAcento,
        colorFondo,
        colorSuperficie,
        colorTexto,
        primary: coloresRaw.primary || colorPrimario,
        primaryDark: coloresRaw.primaryDark || ajustarLuminosidadHex(colorPrimario, -0.22),
        primaryLight: coloresRaw.primaryLight || mezclarColoresHex(colorPrimario, colorSuperficie, 0.82),
        secondary: coloresRaw.secondary || colorAcento,
        success: coloresRaw.success || '#5f9270',
        danger: coloresRaw.danger || '#c66f6f',
        textDark: coloresRaw.textDark || colorTexto,
        textLight: coloresRaw.textLight || colorTextoSecundario,
        bgLight: coloresRaw.bgLight || colorFondo,
        bgWhite: coloresRaw.bgWhite || colorSuperficie,
        borderColor: coloresRaw.borderColor || mezclarColoresHex(colorTexto, colorSuperficie, 0.84)
    };
}

/**
 * Actualizar título de la página dinámicamente
 * @param {Object} cliente - Datos del cliente
 * @param {Object} rifa - Datos de la rifa
 */
function updatePageTitle(cliente, rifa) {
    // Usar exactamente lo que está en `rifa.nombreSorteo` como título de la página
    if (rifa && rifa.nombreSorteo) {
        document.title = rifa.nombreSorteo;
    } else if (cliente && cliente.nombre) {
        document.title = cliente.nombre;
    }

    // Actualizar meta description usando la descripción del sorteo si existe
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
        if (rifa && rifa.descripcion) {
            metaDesc.content = rifa.descripcion;
        } else if (cliente && cliente.nombre) {
            metaDesc.content = `${cliente.nombre} - Rifas 100% Transparentes`;
        }
    }

    console.log('📄 Título actualizado:', document.title);
}

/**
 * Actualizar contenido visible en la página: hero, subtítulos y footer
 */
function updatePageContent(cliente, rifa) {
    try {
        // Hero
        const heroTitle = document.getElementById('heroTitle');
        const heroHighlight = document.getElementById('heroHighlight');
        const heroDescription = document.getElementById('heroDescription');
        if (heroTitle && rifa && rifa.nombreSorteo) {
            // Usar exactamente el título definido en config (sin prefijos)
            heroTitle.innerHTML = `<span class="highlight" id="heroHighlight">${rifa.nombreSorteo}</span>`;
        } else if (heroHighlight && rifa && rifa.nombreSorteo) {
            heroHighlight.textContent = rifa.nombreSorteo;
        }
        if (heroDescription && rifa && rifa.descripcion) {
            heroDescription.textContent = rifa.descripcion;
        }

        // Countdown subtitle
        const countdownSubtitle = document.getElementById('countdownSubtitle');
        if (countdownSubtitle && rifa && rifa.descripcion) {
            countdownSubtitle.innerHTML = `La cuenta regresiva para el sorteo: ${rifa.nombreSorteo} ya está en marcha. <strong>Asegura tu participación antes del cierre del sorteo.</strong>`;
        }

        // Footer nombre y copyright
        const footerNombre = document.getElementById('footerNombre');
        if (footerNombre && cliente && cliente.nombre) {
            footerNombre.textContent = cliente.nombre;
        }
        const footerCopyright = document.getElementById('footerCopyright');
        if (footerCopyright && cliente && cliente.nombre) {
            const year = (new Date()).getFullYear();
            footerCopyright.innerHTML = `&copy; ${year} <strong>${cliente.nombre}</strong>. Todos los derechos reservados.`;
        }

    } catch (err) {
        console.warn('⚠️ Error actualizando contenido de la página:', err && err.message);
    }
}

// Exportar funciones para uso manual si es necesario
window.applyDynamicTheme = applyDynamicTheme;
window.updateAllLogos = updateAllLogos;
window.updateCSSVariables = updateCSSVariables;
