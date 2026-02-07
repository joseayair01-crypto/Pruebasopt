// ============================================================ //
// ARCHIVO: main.js
// DESCRIPCIÓN: Inicializador global de funcionalidades del sitio
// AUTOR: RifaPlus
// ÚLTIMA ACTUALIZACIÓN: 1 de diciembre 2025
// ============================================================ //

/**
 * 🔥 CRÍTICO: Cargar boletos públicos al iniciar index.html
 * Esto llena window.rifaplusSoldNumbers y window.rifaplusReservedNumbers
 * que se usan en actualizarBarraProgreso() para mostrar el progreso
 */
(async function cargarBoletosEnIndexHtml() {
    try {
        const apiBase = (window.rifaplusConfig && window.rifaplusConfig.backend && window.rifaplusConfig.backend.apiBase) 
            ? window.rifaplusConfig.backend.apiBase 
            : 'http://localhost:3000';
        const endpoint = String(apiBase).replace(/\/+$/, '');
        
        console.debug('[main] Cargando boletos públicos para progreso bar...');
        
        // 🎯 INTENTAR CON CACHÉ PRIMERO
        const cacheKey = 'rifaplusBoletosCache';
        const cachedData = localStorage.getItem(cacheKey);
        
        if (cachedData && window.rifaplusBoletosLoaded) {
            try {
                const cached = JSON.parse(cachedData);
                const cacheAge = Date.now() - (cached.timestamp || 0);
                
                if (cacheAge < 300000) { // 5 minutos
                    console.debug('[main] Usando caché de boletos (edad: ' + Math.round(cacheAge/1000) + 's)');
                    window.rifaplusSoldNumbers = cached.sold || [];
                    window.rifaplusReservedNumbers = cached.reserved || [];
                    window.rifaplusBoletosLoaded = true;
                    
                    // 🔥 DISPARA EVENTO para que countdown.js actualice la barra
                    window.dispatchEvent(new CustomEvent('boletosListos', { detail: { origen: 'cache' } }));
                    return; // ✅ Datos listos desde caché
                }
            } catch (e) {
                console.warn('[main] Error parseando caché:', e.message);
            }
        }
        
        // 🎯 FALLBACK: Fetch desde backend
        console.debug('[main] Fetch desde backend para boletos públicos...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        try {
            const response = await fetch(`${endpoint}/api/public/boletos`, {
                signal: controller.signal,
                cache: 'no-store',
                headers: { 'Accept': 'application/json' }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                console.warn('[main] Error cargando boletos:', response.status);
                window.rifaplusSoldNumbers = [];
                window.rifaplusReservedNumbers = [];
                window.rifaplusBoletosLoaded = true;
                window.dispatchEvent(new CustomEvent('boletosListos', { detail: { origen: 'backend-error' } }));
                return;
            }
            
            const json = await response.json();
            const data = json.data || json;
            const sold = Array.isArray(data.sold) ? data.sold : [];
            const reserved = Array.isArray(data.reserved) ? data.reserved : [];
            
            window.rifaplusSoldNumbers = sold;
            window.rifaplusReservedNumbers = reserved;
            window.rifaplusBoletosLoaded = true;
            
            // Guardar en caché
            localStorage.setItem(cacheKey, JSON.stringify({
                sold: sold,
                reserved: reserved,
                timestamp: Date.now()
            }));
            
            console.debug('[main] ✅ Boletos cargados:', { sold: sold.length, reserved: reserved.length });
            
            // 🔥 DISPARA EVENTO para que countdown.js actualice la barra
            window.dispatchEvent(new CustomEvent('boletosListos', { detail: { origen: 'backend', sold: sold.length, reserved: reserved.length } }));
        } catch (error) {
            clearTimeout(timeoutId);
            console.warn('[main] Error fetch boletos:', error.message);
            window.rifaplusSoldNumbers = [];
            window.rifaplusReservedNumbers = [];
            window.rifaplusBoletosLoaded = true;
            window.dispatchEvent(new CustomEvent('boletosListos', { detail: { origen: 'error', message: error.message } }));
        }
    } catch (error) {
        console.error('[main] Error en cargarBoletosEnIndexHtml:', error);
    }
})();

/**
 * 🔥 CRÍTICO: Cargar oportunidades disponibles para el carrito
 * ARQUITECTURA ROBUSTA:
 * 1. IndexedDB (50MB disponible) - optimizado para datos grandes
 * 2. Memory cache - para acceso rápido dentro de la sesión
 * 3. Set de números - búsquedas O(1) en lugar de O(n)
 * 4. Reintentos exponenciales - con backoff automático
 */
(async function cargarOportunidadesDisponibles() {
    try {
        // Obtener API base desde config
        const apiBase = (window.rifaplusConfig && window.rifaplusConfig.backend && window.rifaplusConfig.backend.apiBase) 
            ? window.rifaplusConfig.backend.apiBase 
            : 'http://localhost:5001';
        const endpoint = String(apiBase).replace(/\/+$/, '');
        
        console.log('[main] 🚀 Iniciando carga robusta de oportunidades...');
        
    try {
        console.log('[main] ⏳ Esperando que OportunidadesCacheManager esté disponible...');
        
        // Step 1: Esperar a que boot-cache haya ejecutado
        let bootIntenta = 0;
        while (!window.oportunidadesCacheBootReady && bootIntenta < 50) {
            await new Promise(r => setTimeout(r, 100));
            bootIntenta++;
        }
        
        // Step 2: Esperar a que la instancia esté disponible
        let intentos = 0;
        while (!window.oportunidadesCache && intentos < 100) {
            await new Promise(r => setTimeout(r, 50));
            intentos++;
        }
        
        if (!window.oportunidadesCache) {
            console.error('[main] ❌ OportunidadesCacheManager no disponible después de 5000ms');
            console.error('[DEBUG] Window properties:', {
                oportunidadesCache: !!window.oportunidadesCache,
                OportunidadesCacheManager: !!window.OportunidadesCacheManager,
                oportunidadesCacheBootReady: window.oportunidadesCacheBootReady
            });
            // Fallback: marcar como cargado para no bloquear
            window.rifaplusOportunidadesLoaded = true;
            window.rifaplusOportunidadesDisponibles = [];
            window.dispatchEvent(new CustomEvent('oportunidadesListas', { detail: { origen: 'error', message: 'OportunidadesCacheManager not available' } }));
            return;
        }
        
        console.log('[main] ✅ OportunidadesCacheManager disponible (boot intento: ' + bootIntenta + ', cache intento: ' + intentos + ')');
        
        // Usar el gestor robusto
        const resultado = await window.oportunidadesCache.cargar(endpoint);
        
        console.log('[main] 📦 Resultado de carga:', resultado);
        
        // Establecer variables globales para compatibilidad
        window.rifaplusOportunidadesDisponibles = window.oportunidadesCache.obtenerTodos();
        window.rifaplusOportunidadesLoaded = true;
        
        console.log(`✅ [main] Oportunidades cargadas: ${resultado.cantidad} desde ${resultado.origen}`);
        
        // Disparar evento para otros componentes
        window.dispatchEvent(new CustomEvent('oportunidadesListas', { 
            detail: { 
                origen: resultado.origen, 
                cantidad: resultado.cantidad,
                status: 'success'
            } 
        }));
        
    } catch (error) {
        console.error('[main] ❌ Error crítico en cargarOportunidadesDisponibles:', error.message);
        console.error('[main] Stack:', error.stack);
        window.rifaplusOportunidadesLoaded = true;
        window.rifaplusOportunidadesDisponibles = [];
        window.dispatchEvent(new CustomEvent('oportunidadesListas', { 
            detail: { 
                origen: 'error', 
                message: error.message,
                status: 'failed'
            } 
        }));
    }
})();

/**
 * ESTRUCTURA DE PROMOCIONES (PAQUETES FIJOS):
 * - Paquete 10: 10 boletos por $450 (ahorro de $50)
 * - Paquete 20: 20 boletos por $800 (ahorro de $200)
 * - Boletos sueltos: Resto a precio normal $50 c/u
 * 
 * EJEMPLOS DE CÁLCULO:
 * - 10 boletos = $450 (promo)
 * - 11 boletos = $450 (promo 10) + $50 (1 suelto) = $500
 * - 15 boletos = $450 (promo 10) + $250 (5 sueltos) = $700
 * - 20 boletos = $800 (promo)
 * - 21 boletos = $800 (promo 20) + $50 (1 suelto) = $850
 * - 30 boletos = $800 (promo 20) + $500 (10 sueltos) = $1300
 */

// ============================================================ //
// SECCIÓN 1: NORMALIZACIÓN DE CONFIGURACIÓN
// NOTA: config.js debe estar cargado ANTES que main.js
// Todas las variables se leen desde config.js
// ============================================================ //

/**
 * Normalizar la fecha del sorteo a timestamp (milisegundos)
 * Maneja diferentes formatos y zonas horarias
 */
(function normalizarFechaSorteo() {
    try {
        const fechaSorteo = window.rifaplusConfig?.rifa?.fechaSorteo;
        if (!fechaSorteo) {
            console.warn('⚠️ fechaSorteo no encontrada en config');
            return;
        }

        let fechaParsada = new Date(fechaSorteo);

        // Si no se puede parsear, intentar agregando zona horaria
        if (isNaN(fechaParsada.getTime())) {
            const cadena = String(fechaSorteo).trim();
            const tieneZonaHoraria = /[zZ]|[\+\-][0-9]{2}(:?[0-9]{2})?$/.test(cadena);
            
            if (!tieneZonaHoraria) {
                const formatoISO = cadena.replace(' ', 'T') + '-06:00';
                fechaParsada = new Date(formatoISO);
            } else {
                fechaParsada = new Date(cadena.replace(' ', 'T'));
            }
        }

        // Guardar timestamp si es válido
        if (!isNaN(fechaParsada.getTime())) {
            window.rifaplusConfig.timestampSorteo = fechaParsada.getTime();
            console.log('✓ Timestamp del sorteo calculado:', fechaParsada.toISOString(), '(', fechaParsada.getTime(), ')');
        }
    } catch (error) {
        console.warn('⚠️ Error normalizando fecha del sorteo:', error);
    }
})();

// ============================================================
// SINCRONIZAR `sorteoActivo.fechaCierre` CON `rifa.fechaSorteo`
// Si el administrador actualizó la fecha en la sección `rifa`,
// forzamos que `sorteoActivo.fechaCierre` refleje la misma fecha
// para evitar inconsistencias entre countdown y modal.
// ============================================================
(function sincronizarSorteoActivoConRifa() {
    try {
        const rifaFecha = window.rifaplusConfig?.rifa?.fechaSorteo;
        const sorteo = window.rifaplusConfig?.sorteoActivo;

        if (!rifaFecha || !sorteo) return;

        const fechaRifa = new Date(rifaFecha);
        if (isNaN(fechaRifa.getTime())) return;

        const fechaSorteoActivo = new Date(sorteo.fechaCierre);

        // Si hay diferencia mayor a 1s o el valor actual no es válido, sincronizamos
        if (isNaN(fechaSorteoActivo.getTime()) || Math.abs(fechaSorteoActivo.getTime() - fechaRifa.getTime()) > 1000) {
            sorteo.fechaCierre = fechaRifa.toISOString();
            sorteo.fechaCierreFormato = window.rifaplusConfig?.rifa?.fechaSorteoFormato || fechaRifa.toLocaleString('es-MX');
            console.log('🔄 Sincronizado sorteoActivo.fechaCierre desde rifa.fechaSorteo ->', sorteo.fechaCierre);
        }
    } catch (err) {
        console.warn('⚠️ Error sincronizando sorteoActivo con rifa:', err && err.message);
    }
})();

/**
 * Normalizar la configuración de la API
 * Evita inconsistencias en la URL entre módulos
 */
(function normalizarConfiguracionAPI() {
    try {
        let puntoFinal = String(window.rifaplusConfig.apiEndpoint || 'http://localhost:3000');
        
        // Remover slashes al final
        puntoFinal = puntoFinal.replace(/\/+$/, '');

        window.rifaplusConfig.apiEndpoint = puntoFinal;
        window.rifaplusConfig.baseAPI = puntoFinal.replace(/\/api$/, '');

        /**
         * Helper para construir URLs de API
         * @param {string} ruta - Ruta del endpoint (ej: '/ordenes')
         * @returns {string} URL completa del endpoint
         */
        window.rifaplusConfig.construirURLAPI = function(ruta) {
            if (!ruta) return puntoFinal;
            
            const rutaNormalizada = ruta.startsWith('/') ? ruta : '/' + ruta;
            
            // Evitar duplicar /api
            if (rutaNormalizada.startsWith('/api')) {
                return window.rifaplusConfig.baseAPI + rutaNormalizada;
            }
            
            return window.rifaplusConfig.apiEndpoint + rutaNormalizada;
        };
    } catch (error) {
        console.warn('⚠️ Error normalizando configuración API:', error);
    }
})();

// ============================================================ //
// SECCIÓN 3: UTILIDADES GLOBALES
// ============================================================ //

/**
 * Sistema de utilidades disponible globalmente
 * Proporciona funciones comunes reutilizables
 */
window.utilidadesRifaPlus = {
    /**
     * Mostrar estado de carga
     * @param {HTMLElement} elemento - Elemento a marcar como cargando
     */
    mostrarCarga: function(elemento) {
        if (elemento) {
            elemento.classList.add('cargando');
        }
    },

    /**
     * Ocultar estado de carga
     * @param {HTMLElement} elemento - Elemento a dejar de marcar como cargando
     */
    ocultarCarga: function(elemento) {
        if (elemento) {
            elemento.classList.remove('cargando');
        }
    },

    /**
     * Mostrar mensaje de retroalimentación al usuario
     * @param {string} mensaje - Texto a mostrar
     * @param {string} tipo - Tipo: 'exito', 'error', 'advertencia'
     */
    mostrarRetroalimentacion: function(mensaje, tipo = 'exito') {
        const elemento = document.createElement('div');
        elemento.className = `retroalimentacion retroalimentacion--${tipo}`;
        elemento.textContent = mensaje;
        document.body.appendChild(elemento);

        setTimeout(() => {
            elemento.style.animation = 'desaparecerDerecha 0.2s forwards';
            setTimeout(() => elemento.remove(), 200);
        }, 3000);
    },

    /**
     * FUNCIÓN CRÍTICA: Calcula el precio con paquetes promocionales
     * Lee promociones dinámicamente desde config.js
     * 
     * ALGORITMO:
     * 1. Obtiene promociones de config.rifa.promociones (ordenadas por cantidad descendente)
     * 2. Aplica cada promoción de mayor a menor cantidad
     * 3. Boletos restantes se cobran a precio normal ($50)
     * 
     * @param {number} cantidad - Cantidad de boletos
     * @param {number} precioUnitario - Precio por boleto (default: $50)
     * @returns {object} Desglose completo del precio
     */
    calcularPrecioConDescuento: function(cantidad, precioUnitario = null) {
        if (!precioUnitario) {
            precioUnitario = (window.rifaplusConfig && window.rifaplusConfig.rifa && window.rifaplusConfig.rifa.precioBoleto) ? Number(window.rifaplusConfig.rifa.precioBoleto) : 50;
        }
        let precioTotal = 0;
        let montoDescuento = 0;
        let boletosRestantes = cantidad;

        // Obtener promociones de config.js y ordenarlas por cantidad (descendente)
        const promociones = (window.rifaplusConfig && window.rifaplusConfig.rifa && window.rifaplusConfig.rifa.promociones) 
            ? [...window.rifaplusConfig.rifa.promociones].sort((a, b) => b.cantidad - a.cantidad) 
            : [];

        // Aplicar cada promoción de mayor a menor cantidad
        for (const promo of promociones) {
            if (boletosRestantes >= promo.cantidad) {
                // Calcular cuántas promociones de este tipo caben
                const cantidadPromos = Math.floor(boletosRestantes / promo.cantidad);
                // Agregar precio de promociones aplicadas
                precioTotal += cantidadPromos * promo.precio;
                // Calcular descuento: precio normal vs precio promociónado
                montoDescuento += cantidadPromos * (promo.cantidad * precioUnitario - promo.precio);
                // Descontar boletos ya contabilizados
                boletosRestantes -= cantidadPromos * promo.cantidad;
            }
        }

        // Agregar boletos sueltos a precio normal
        precioTotal += boletosRestantes * precioUnitario;

        return {
            cantidadBoletos: cantidad,
            precioUnitario: precioUnitario,
            subtotal: cantidad * precioUnitario,
            montoDescuento: montoDescuento,
            porcentajeDescuento: montoDescuento > 0 
                ? ((montoDescuento / (cantidad * precioUnitario)) * 100).toFixed(2)
                : 0,
            precioFinal: precioTotal
        };
    },
    /**
     * Alias: calcularDescuento (para compatibilidad con otros módulos)
     */
    calcularDescuento: function(cantidad, precioUnitario = null) {
        if (!precioUnitario) {
            precioUnitario = (window.rifaplusConfig && window.rifaplusConfig.rifa && window.rifaplusConfig.rifa.precioBoleto) ? Number(window.rifaplusConfig.rifa.precioBoleto) : 50;
        }
        const resultado = this.calcularPrecioConDescuento(cantidad, precioUnitario);
        return {
            cantidadBoletos: resultado.cantidadBoletos,
            precioUnitario: resultado.precioUnitario,
            subtotal: resultado.subtotal,
            descuentoMonto: resultado.montoDescuento,
            descuentoPorcentaje: resultado.porcentajeDescuento,
            totalFinal: resultado.precioFinal
        };
    },

    /**
     * showFeedback - Mostrar mensaje de feedback al usuario
     * Alias compatible con compra.js
     * @param {string} mensaje - Mensaje a mostrar
     * @param {string} tipo - Tipo: 'info', 'success', 'warning', 'error'
     */
    showFeedback: function(mensaje, tipo = 'info') {
        // Mapear tipos de feedback
        const tipoMap = {
            'success': 'exito',
            'error': 'error',
            'warning': 'advertencia',
            'info': 'exito'
        };
        return this.mostrarRetroalimentacion(mensaje, tipoMap[tipo] || 'exito');
    }
};

// Alias para compatibilidad con código antiguo
window.rifaplusUtils = window.utilidadesRifaPlus;

// ============================================================ //
// SECCIÓN 4: INYECCIÓN DINÁMICA DE LOGO
// ============================================================ //

/**
 * inyectarLogoDinamico - Cambia dinámicamente el logo desde config.js
 * Actualiza todos los logos (clases con "logo" o "logo-image") con config.cliente.logo
 * Garantiza que la web sea 100% dinámica sin hardcodes
 */
function inyectarLogoDinamico() {
    try {
        const logoConfig = window.rifaplusConfig?.cliente?.logo || 'images/logo.png';
        
        // Estrategia 1: Buscar imágenes con clases que indiquen logo
        const logoSelectors = [
            'img.logo-image',           // Logo en header
            'img.admin-logo-img',       // Logo en admin
            'img.footer-logo-img',      // Logo en footer
            '.logo-circle img',         // Logo dentro de círculo
            '.admin-logo-container img', // Logo admin container
            'img[alt*="SORTEOS"]',      // Imágenes con SORTEOS en alt
            'img[alt*="logo"]'          // Imágenes con logo en alt
        ];
        
        logoSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(img => {
                const oldSrc = img.src;
                img.src = logoConfig;
                img.onerror = function() {
                    console.warn(`Logo no encontrado: ${logoConfig}. Usando fallback: images/logo.png`);
                    this.src = 'images/logo.png';
                };
                if (oldSrc !== logoConfig) {
                    console.debug(`✓ Logo actualizado: ${oldSrc.split('/').pop()} → ${logoConfig.split('/').pop()}`);
                }
            });
        });

        // Estrategia 2: Actualizar favicon si está en links
        document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(link => {
            const oldHref = link.href;
            link.href = logoConfig;
            console.debug(`✓ Favicon actualizado: ${oldHref.split('/').pop()} → ${logoConfig.split('/').pop()}`);
        });

        console.log('✅ Logo inyectado dinámicamente desde config:', logoConfig);
    } catch (error) {
        console.warn('⚠️ Error inyectando logo:', error);
    }
}

// ============================================================ //
// SECCIÓN 4B: INICIALIZACIÓN DEL DOCUMENTO
// ============================================================ //

/**
 * Ejecutar cuando el DOM esté completamente cargado
 * Inicializa todos los módulos disponibles
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inicializando RifaPlus...');

    // 🎉 Inicializar modal de sorteo finalizado (SI aplica)
    if (window.modalSorteoFinalizado) {
        window.modalSorteoFinalizado.inicializar();
    }

    // Inyectar logo dinámicamente desde config.js
    inyectarLogoDinamico();

    // Cada función verifica si sus elementos existen antes de ejecutarse
    // Esto permite cargar main.js en todas las páginas sin overhead

    inicializarCarrusel();       // Carrusel de imágenes
    inicializarCuentaRegresiva(); // Contador de tiempo del sorteo
    inicializarFAQ();             // Acordeón de ayuda
    inicializarScrollSuave();     // Scroll suave hacia secciones
    inicializarAnimacionesScroll();// Animaciones al hacer scroll
    inicializarNavegacion();      // Navegación activa
    inicializarMenuMovil();       // Menú responsivo móvil

    console.log('✅ RifaPlus inicializado correctamente');
});

// ============================================================ //
// SECCIÓN 5: CARRUSEL DE IMÁGENES
// ============================================================ //

/**
 * Inicializar carrusel con autoavance y controles
 * Genera dinámicamente los slides desde config.rifa.premios[0].imagenes
 */
function inicializarCarrusel() {
    // Buscar contenedor del carrusel
    const carruselInner = document.querySelector('.carrusel-inner');
    
    if (!carruselInner) {
        return;
    }

    // Obtener imágenes desde config
    const imagenes = window.rifaplusConfig?.rifa?.premios?.[0]?.imagenes || [];
    
    if (imagenes.length === 0) {
        console.warn('⚠️ No hay imágenes configuradas en config.rifa.premios[0].imagenes');
        return;
    }

    // Limpiar contenedor (remover slides existentes)
    carruselInner.innerHTML = '';

    // Generar dinámicamente los slides desde config
    imagenes.forEach((imagenPath, index) => {
        const slide = document.createElement('div');
        slide.className = `carrusel-item${index === 0 ? ' active' : ''}`;
        
        const img = document.createElement('img');
        img.src = imagenPath;
        img.alt = `Imagen ${index + 1} del premio`;
        img.loading = 'lazy';
        
        slide.appendChild(img);
        carruselInner.appendChild(slide);
    });

    // Obtener slides generados
    const slides = document.querySelectorAll('.carrusel-item');
    const botonSiguiente = document.querySelector('.carrusel-next');
    const botonAnterior = document.querySelector('.carrusel-prev');

    // No hay slides, salir
    if (slides.length === 0) {
        return;
    }

    let indexSlideActual = 0;
    const totalSlides = slides.length;
    let intervaloAutoavance;

    /**
     * Mostrar un slide específico
     * @param {number} indice - Índice del slide a mostrar
     */
    function mostrarSlide(indice) {
        slides.forEach(slide => {
            slide.classList.remove('activo');
            slide.style.opacity = '0';
        });

        slides[indice].classList.add('activo');
        slides[indice].style.opacity = '1';
        indexSlideActual = indice;
    }

    /**
     * Ir al siguiente slide
     */
    function siguienteSlide() {
        const siguiente = (indexSlideActual + 1) % totalSlides;
        mostrarSlide(siguiente);
    }

    /**
     * Ir al slide anterior
     */
    function slideAnterior() {
        const anterior = (indexSlideActual - 1 + totalSlides) % totalSlides;
        mostrarSlide(anterior);
    }

    // Event listeners para botones de navegación
    if (botonSiguiente) {
        botonSiguiente.addEventListener('click', siguienteSlide);
        botonSiguiente.addEventListener('touchstart', (e) => {
            e.preventDefault();
            siguienteSlide();
        });
    }

    if (botonAnterior) {
        botonAnterior.addEventListener('click', slideAnterior);
        botonAnterior.addEventListener('touchstart', (e) => {
            e.preventDefault();
            slideAnterior();
        });
    }

    /**
     * Iniciar autoavance automático
     * OPTIMIZACIÓN: Aumentado de 5 a 10 segundos (menos re-renders del DOM)
     */
    function iniciarAutoavance() {
        if (totalSlides > 1) {
            intervaloAutoavance = setInterval(siguienteSlide, 10000); // 10 segundos
        }
    }

    /**
     * Pausar autoavance
     */
    function pausarAutoavance() {
        if (intervaloAutoavance) {
            clearInterval(intervaloAutoavance);
            intervaloAutoavance = null;
        }
    }

    // Pausar autoavance al interactuar
    const carrusel = document.querySelector('.carrusel');
    if (carrusel) {
        carrusel.addEventListener('mouseenter', pausarAutoavance);
        carrusel.addEventListener('mouseleave', iniciarAutoavance);
        carrusel.addEventListener('touchstart', pausarAutoavance);
        carrusel.addEventListener('touchend', () => {
            setTimeout(iniciarAutoavance, 3000);
        });
    }

    // Iniciar
    iniciarAutoavance();
    mostrarSlide(0);
    
    // OPTIMIZACIÓN: Cleanup - detener carrusel cuando usuario abandona la página
    window.addEventListener('pagehide', function() {
        pausarAutoavance();
    }, true);
    
    console.log('✓ Carrusel inicializado');
}

// ============================================================ //
// SECCIÓN 6: CUENTA REGRESIVA DEL SORTEO
// ============================================================ //

/**
 * Mostrar cuenta regresiva del tiempo hasta el sorteo
 * Solo se ejecuta si existen los elementos de countdown
 * NOTA: Usa funciones centralizadas de config.js para obtener la fecha
 */
function inicializarCuentaRegresiva() {
    // Limpiar intervalo anterior para evitar duplicados
    if (window.intervaloConteoRegresivo) {
        clearInterval(window.intervaloConteoRegresivo);
        window.intervaloConteoRegresivo = null;
    }

    const elementoDias = document.getElementById('countdown-days');
    const elementoHoras = document.getElementById('countdown-hours');
    const elementoMinutos = document.getElementById('countdown-minutes');
    const elementoSegundos = document.getElementById('countdown-seconds');

    // Verificar que existen los elementos (silencioso si no existen - página sin countdown)
    if (!elementoDias || !elementoHoras || !elementoMinutos || !elementoSegundos) {
        return;
    }

    // Verificar que las funciones centralizadas existan
    if (!window.rifaplusConfig?.obtenerTimestampSorteo || !window.rifaplusConfig?.validarFechaSorteo) {
        console.error('❌ [Countdown] Funciones centralizadas de config no disponibles');
        return;
    }

    // Validar la fecha del sorteo
    const validacion = window.rifaplusConfig.validarFechaSorteo();
    if (!validacion.valida) {
        console.error('❌ [Countdown] Fecha del sorteo inválida:', validacion.mensaje);
        return;
    }

    console.log('✓ [Countdown] Fecha validada:', {
        fecha: window.rifaplusConfig.obtenerFechaSorteo(),
        formato: window.rifaplusConfig.obtenerFechaSorteoFormato(),
        diasRestantes: validacion.diasRestantes
    });

    /**
     * Actualizar el display de la cuenta regresiva
     * Obtiene el timestamp DINÁMICAMENTE cada vez (no lo cachea)
     * Esto permite que cambios en config.js se reflejen automáticamente
     */
    function actualizarCuentaRegresiva() {
        // Obtener timestamp dinámicamente cada segundo (nunca cached)
        const timestampObjetivo = window.rifaplusConfig.obtenerTimestampSorteo();
        if (!timestampObjetivo) {
            console.error('❌ [Countdown] No se pudo obtener timestamp');
            return;
        }

        const ahora = new Date().getTime();
        const diferencia = timestampObjetivo - ahora;

        if (diferencia > 0) {
            // Calcular unidades de tiempo
            const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));
            const horas = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));
            const segundos = Math.floor((diferencia % (1000 * 60)) / 1000);

            // Actualizar display con formato de 2 dígitos
            elementoDias.textContent = String(dias).padStart(2, '0');
            elementoHoras.textContent = String(horas).padStart(2, '0');
            elementoMinutos.textContent = String(minutos).padStart(2, '0');
            elementoSegundos.textContent = String(segundos).padStart(2, '0');

            // Animar cuando quedan 3 días o menos
            const textoUrgencia = document.querySelector('.urgency-text');
            if (dias <= 3 && textoUrgencia) {
                textoUrgencia.style.animation = 'pulse 1s ease-in-out infinite';
            }
        } else {
            // El sorteo ya ocurrió
            elementoDias.textContent = '00';
            elementoHoras.textContent = '00';
            elementoMinutos.textContent = '00';
            elementoSegundos.textContent = '00';

            // Mostrar mensaje de sorteo completado
            const contenedorCountdown = document.querySelector('.countdown-timer');
            if (contenedorCountdown && !contenedorCountdown.querySelector('.sorteo-terminado')) {
                contenedorCountdown.innerHTML = `
                    <div class="sorteo-terminado" style="
                        background: linear-gradient(135deg, var(--success) 0%, var(--success-dark) 100%);
                        color: white;
                        padding: 2rem;
                        border-radius: var(--radius-lg);
                        font-size: 1.5rem;
                        font-weight: 700;
                        text-align: center;
                    ">
                        🎉 ¡EL SORTEO HA TERMINADO!
                    </div>
                `;
            }
        }
    }

    // Actualizar inmediatamente y cada segundo
    actualizarCuentaRegresiva();
    window.intervaloConteoRegresivo = setInterval(actualizarCuentaRegresiva, 1000);
    console.log('✓ [Countdown] Cuenta regresiva inicializada - fecha de referencia: config.js rifa.fechaSorteo');
}

// ============================================================ //
// SECCIÓN 7: ACORDEÓN - AYUDA
// ============================================================ //

/**
 * Inicializar FAQ con comportamiento de acordeón
 * Solo se ejecuta si existen elementos .faq-item
 */
function inicializarFAQ() {
    const itemsFAQ = document.querySelectorAll('.faq-item');

    if (itemsFAQ.length === 0) {
        return;
    }

    itemsFAQ.forEach((item, indice) => {
        const pregunta = item.querySelector('.faq-pregunta');
        const respuesta = item.querySelector('.faq-respuesta');

        if (!pregunta || !respuesta) return;

        // Configurar altura inicial
        if (!item.classList.contains('activo')) {
            respuesta.style.maxHeight = '0';
            respuesta.style.overflow = 'hidden';
        }

        /**
         * Manejar click en pregunta
         */
        pregunta.addEventListener('click', () => {
            const estaActivo = item.classList.contains('activo');

            // Cerrar otros items del acordeón
            itemsFAQ.forEach(otroItem => {
                if (otroItem !== item) {
                    otroItem.classList.remove('activo');
                    const otraRespuesta = otroItem.querySelector('.faq-respuesta');
                    if (otraRespuesta) {
                        otraRespuesta.style.maxHeight = '0';
                    }
                }
            });

            // Alternar estado del item actual
            item.classList.toggle('activo');

            if (!estaActivo) {
                respuesta.style.maxHeight = respuesta.scrollHeight + 'px';
            } else {
                respuesta.style.maxHeight = '0';
            }
        });

        // Accesibilidad: manejo de teclado
        pregunta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                pregunta.click();
            }
        });

        // Atributos ARIA para accesibilidad
        pregunta.setAttribute('tabindex', '0');
        pregunta.setAttribute('role', 'button');
        pregunta.setAttribute('aria-expanded', 'false');
        pregunta.setAttribute('aria-controls', `faq-respuesta-${indice}`);
        respuesta.id = `faq-respuesta-${indice}`;
    });

    console.log('✓ FAQ inicializado');
}

// ============================================================ //
// SECCIÓN 8: SCROLL SUAVE HACIA SECCIONES
// ============================================================ //

/**
 * Implementar scroll suave para enlaces internos
 * Detecta enlaces con href="#seccion" y scroll smoothly
 */
function inicializarScrollSuave() {
    const enlaces = document.querySelectorAll('a[href^="#"]');

    if (enlaces.length === 0) return;

    enlaces.forEach(enlace => {
        enlace.addEventListener('click', function(evento) {
            const href = this.getAttribute('href');

            // Ignorar enlaces vacíos
            if (href === '#' || href === '#0') return;

            const seccion = document.querySelector(href);
            if (!seccion) return;

            evento.preventDefault();

            // Calcular posición considerando header fijo
            const alturaHeader = document.querySelector('.header')?.offsetHeight || 0;
            const posicionSeccion = seccion.offsetTop - alturaHeader - 20;

            // Scroll suave a la sección
            window.scrollTo({
                top: posicionSeccion,
                behavior: 'smooth'
            });

            // Actualizar URL sin recargar la página
            history.pushState(null, null, href);
        });
    });

    console.log('✓ Scroll suave inicializado');
}

// ============================================================ //
// SECCIÓN 9: ANIMACIONES AL HACER SCROLL
// ============================================================ //

/**
 * Animar elementos cuando entran en el viewport
 * Usa Intersection Observer para eficiencia
 */
function inicializarAnimacionesScroll() {
    const elementosAnimados = document.querySelectorAll(
        '.precio-card, .info-item, .contacto-card'
    );

    if (elementosAnimados.length === 0) return;

    const observador = new IntersectionObserver((entradas) => {
        entradas.forEach(entrada => {
            if (entrada.isIntersecting) {
                entrada.target.classList.add('animate-in');
                observador.unobserve(entrada.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    elementosAnimados.forEach(elemento => {
        elemento.classList.add('will-animate');
        observador.observe(elemento);
    });

    console.log('✓ Animaciones de scroll inicializadas');
}

// ============================================================ //
// SECCIÓN 10: NAVEGACIÓN ACTIVA
// ============================================================ //

/**
 * Marcar el link de navegación activo según la sección visible
 * Solo para enlaces internos con href="#"
 */
function inicializarNavegacion() {
    const enlacesNav = document.querySelectorAll('.nav-link[href^="#"]');

    if (enlacesNav.length === 0) return;

    /**
     * Encontrar y marcar el link de navegación activo
     */
    function establecerLinkActivo() {
        const desdeArriba = window.scrollY + 100;
        let enlaceActivo = null;

        enlacesNav.forEach(enlace => {
            const seccion = document.querySelector(enlace.getAttribute('href'));
            if (!seccion) return;

            const tituloSeccion = seccion.offsetTop;
            const alturaSeccion = seccion.offsetHeight;

            // Verificar si estamos en esta sección
            if (desdeArriba >= tituloSeccion && desdeArriba < tituloSeccion + alturaSeccion) {
                enlaceActivo = enlace;
            }
        });

        // Solo actualizar si hay un cambio
        if (enlaceActivo && !enlaceActivo.classList.contains('activo')) {
            enlacesNav.forEach(e => e.classList.remove('activo'));
            enlaceActivo.classList.add('activo');
        }
    }

    /**
     * Throttle del evento scroll para mejor rendimiento
     */
    let timeoutScroll;
    function scrollThrottle() {
        if (!timeoutScroll) {
            timeoutScroll = setTimeout(() => {
                timeoutScroll = null;
                establecerLinkActivo();
            }, 100);
        }
    }

    window.addEventListener('scroll', scrollThrottle);
    establecerLinkActivo(); // Ejecutar al cargar

    console.log('✓ Navegación activa inicializada');
}

// ============================================================ //
// SECCIÓN 11: MENÚ MÓVIL (RESPONSIVO)
// ============================================================ //

/**
 * Implementar menú móvil con overlay y animaciones
 * Solo se ejecuta si existen los elementos del menú
 */
function inicializarMenuMovil() {
    const botonHamburguesa = document.getElementById('hamburger');
    const menuOverlay = document.getElementById('overlayMenu');
    const botonCerrar = document.getElementById('overlayClose');

    if (!botonHamburguesa || !menuOverlay) {
        return;
    }

    /**
     * Abrir el menú móvil
     */
    function abrirOverlay() {
        menuOverlay.classList.add('show');
        menuOverlay.removeAttribute('inert');
        botonHamburguesa.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';

        // Animar icono de hamburguesa a X
        const iconoInterno = botonHamburguesa.querySelector('.hamburger-inner');
        if (iconoInterno) {
            iconoInterno.style.transform = 'rotate(45deg)';
            iconoInterno.style.backgroundColor = 'var(--primary-light)';
        }
    }

    /**
     * Cerrar el menú móvil
     */
    function cerrarOverlay() {
        menuOverlay.classList.remove('show');
        menuOverlay.setAttribute('inert', '');
        botonHamburguesa.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';

        // Animar icono de X a hamburguesa
        const iconoInterno = botonHamburguesa.querySelector('.hamburger-inner');
        if (iconoInterno) {
            iconoInterno.style.transform = 'rotate(0)';
            iconoInterno.style.backgroundColor = 'white';
        }
    }

    // Click en botón hamburguesa
    botonHamburguesa.addEventListener('click', (e) => {
        e.stopPropagation();
        const estaAbierto = menuOverlay.classList.contains('show');
        estaAbierto ? cerrarOverlay() : abrirOverlay();
    });

    // Click en botón cerrar
    if (botonCerrar) {
        botonCerrar.addEventListener('click', cerrarOverlay);
    }

    // Cerrar con tecla Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menuOverlay.classList.contains('show')) {
            cerrarOverlay();
        }
    });

    // Cerrar al clickear fuera del menú
    menuOverlay.addEventListener('click', (e) => {
        if (e.target === menuOverlay) {
            cerrarOverlay();
        }
    });

    // Cerrar al clickear en un link del menú
    const enlacesOverlay = menuOverlay.querySelectorAll('.overlay-link');
    enlacesOverlay.forEach(enlace => {
        enlace.addEventListener('click', cerrarOverlay);
    });

    console.log('✓ Menú móvil inicializado');
}

// ============================================================ //
// SECCIÓN 12: MANEJO DE ERRORES GLOBAL
// ============================================================ //

/**
 * Capturar errores no manejados a nivel global
 * Útil para debugging en producción
 */
window.addEventListener('error', function(evento) {
    console.error('❌ Error no capturado:', evento.error);
});

/**
 * Prevenir errores de consola si no existe
 * Evita que el script falle en navegadores sin console
 */
if (typeof console === "undefined" || typeof console.log === "undefined") {
    console = {};
    console.log = console.warn = console.error = function(){};
}

// ============================================================ //
// SECCIÓN 7: ESTADÍSTICAS DE BOLETOS (CONSOLIDADO DE countdown.js)
// ============================================================ //

/**
 * Actualiza los datos de boletos vendidos desde la API
 * @async
 */
async function actualizarBarraProgreso() {
    try {
        const config = window.rifaplusConfig;
        if (!config || !config.backend) {
            console.warn('⚠️ Config no disponible');
            return;
        }
        
        // 🎯 PASO 1: Determinar total y rango de boletos a mostrar
        // Si oportunidades está habilitada, usar SOLO el rango visible
        // Si no, usar el totalBoletos configurado
        const oportunidadesConfig = config.rifa?.oportunidades;
        const totalBoletosConfiguracion = config.rifa?.totalBoletos || 10000;
        
        let totalParaMostrar = totalBoletosConfiguracion;
        let rangoVisible = null;
        
        if (oportunidadesConfig && oportunidadesConfig.enabled && oportunidadesConfig.rango_visible) {
            rangoVisible = oportunidadesConfig.rango_visible;
            // El total a mostrar es el TAMAÑO del rango visible, no el config.totalBoletos
            totalParaMostrar = (rangoVisible.fin - rangoVisible.inicio) + 1;
            console.debug('[main] Oportunidades enabled, usando rango visible:', rangoVisible, 'Total:', totalParaMostrar);
        } else {
            console.debug('[main] Oportunidades disabled, usando totalBoletos:', totalParaMostrar);
        }
        
        // 🎯 PASO 2: Obtener datos de boletos (PRIMERO en memoria, LUEGO backend)
        const sold = (window.rifaplusSoldNumbers && Array.isArray(window.rifaplusSoldNumbers)) ? window.rifaplusSoldNumbers : [];
        const reserved = (window.rifaplusReservedNumbers && Array.isArray(window.rifaplusReservedNumbers)) ? window.rifaplusReservedNumbers : [];
        
        // Si tenemos datos en memoria, usarlos
        if (window.rifaplusBoletosLoaded && (sold.length > 0 || reserved.length > 0)) {
            console.debug('[main] Usando datos en memoria (tiempo real)');
            actualizarInterfazProgreso(sold, reserved, totalParaMostrar, rangoVisible);
            return;
        }
        
        // 🎯 PASO 3: FALLBACK - Obtener del backend si no hay datos en memoria
        const apiBase = config.backend.apiBase;
        const url = `${apiBase}/api/public/ordenes-stats`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos timeout
        
        try {
            const respuesta = await fetch(url, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            
            clearTimeout(timeoutId);
            
            if (!respuesta.ok) {
                console.warn('⚠️ Backend no respondió correctamente');
                actualizarInterfazProgreso([], [], totalParaMostrar, rangoVisible);
                return;
            }

            const datos = await respuesta.json();
            if (datos.success && datos.data) {
                const boletosVendidos = datos.data.total_boletos_vendidos || 0;
                console.debug('[main] Usando datos del backend:', { boletosVendidos });
                actualizarInterfazProgreso([], [], totalParaMostrar, rangoVisible, boletosVendidos);
            } else {
                console.warn('⚠️ Respuesta inválida del backend');
                actualizarInterfazProgreso([], [], totalParaMostrar, rangoVisible);
            }
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                console.warn('⚠️ Timeout conectando a backend (URL:', url, ')');
            } else {
                console.warn('⚠️ No se puede conectar a backend:', apiBase);
            }
            actualizarInterfazProgreso([], [], totalParaMostrar, rangoVisible);
        }
    } catch (error) {
        console.warn('⚠️ Error en actualizarBarraProgreso:', error.message);
    }
}

/**
 * actualizarInterfazProgreso - Actualiza elementos UI con datos de boletos
 * 🎯 LÓGICA CORRECTA:
 * - Si oportunidades ESTÁ ENABLED: Mostrar solo boletos del rango visible
 *   * Vendidos: Contar solo boletos vendidos/reservados en el rango visible
 *   * Total: Tamaño del rango visible (ya ajustado en actualizarBarraProgreso)
 * 
 * - Si oportunidades NO ESTÁ: Mostrar todos los boletos
 *   * Vendidos: Todos los vendidos (sin filtrar)
 *   * Total: totalParaMostrar (que es totalBoletos)
 * 
 * @param {Array} sold - Array de boletos vendidos
 * @param {Array} reserved - Array de boletos reservados
 * @param {number} totalParaMostrar - Total de boletos a considerar
 * @param {Object|null} rangoVisible - Rango visible si oportunidades está enabled
 * @param {number} backendVendidos - (Opcional) Total de vendidos del backend (fallback)
 */
function actualizarInterfazProgreso(sold = [], reserved = [], totalParaMostrar = 10000, rangoVisible = null, backendVendidos = null) {
    // 🎯 CALCULAR BOLETOS VENDIDOS SEGÚN MODALIDAD
    // ⭐ IMPORTANTE: Contar SOLO boletos vendidos (sold), no apartados/reservados
    // Los reservados son boletos temporales sin pago confirmado
    let boletosVendidosParaMostrar = 0;
    
    if (rangoVisible && rangoVisible.inicio !== undefined && rangoVisible.fin !== undefined) {
        // 🎯 MODO OPORTUNIDADES: Contar solo boletos VENDIDOS del rango visible
        // NO incluir reservados (apartados sin pago)
        sold.forEach(num => {
            const n = Number(num);
            if (n >= rangoVisible.inicio && n <= rangoVisible.fin) {
                boletosVendidosParaMostrar++;
            }
        });
        
        console.debug('[main] MODO OPORTUNIDADES - Rango visible:', rangoVisible, 'Vendidos en rango:', boletosVendidosParaMostrar, 'Total sold:', sold.length, 'Total reserved:', reserved.length);
    } else if (backendVendidos !== null) {
        // FALLBACK: Si solo tenemos data del backend
        boletosVendidosParaMostrar = backendVendidos;
        console.debug('[main] FALLBACK BACKEND - Vendidos:', boletosVendidosParaMostrar);
    } else {
        // 🎯 MODO NORMAL (sin oportunidades): Contar SOLO los vendidos
        boletosVendidosParaMostrar = sold.length;
        console.debug('[main] MODO NORMAL - Total vendidos:', boletosVendidosParaMostrar, 'Total reserved:', reserved.length);
    }
    
    // 🎯 CALCULAR DISPONIBLES Y PORCENTAJE
    const boletosRestantes = totalParaMostrar - boletosVendidosParaMostrar;
    const porcentaje = totalParaMostrar > 0 ? Math.round((boletosVendidosParaMostrar / totalParaMostrar) * 100) : 0;

    console.debug('[main] RESULTADO FINAL:', {
        boletosVendidos: boletosVendidosParaMostrar,
        boletosRestantes,
        totalParaMostrar,
        porcentaje
    });

    const elemVendidos = document.getElementById('boletos-vendidos');
    const elemRestantes = document.getElementById('boletos-restantes');
    const elemPorcentaje = document.getElementById('porcentaje-vendido');
    const elemProgressFill = document.getElementById('progress-fill');

    if (elemVendidos) elemVendidos.textContent = boletosVendidosParaMostrar;
    if (elemRestantes) elemRestantes.textContent = boletosRestantes;
    if (elemPorcentaje) elemPorcentaje.textContent = `${porcentaje}%`;

    if (elemProgressFill) {
        elemProgressFill.style.width = `${porcentaje}%`;
        // Usar color primario (azul) de la paleta consistente
        elemProgressFill.style.background = 'linear-gradient(90deg, #0F3A7D 0%, #1B5FB8 100%)';
    }

    const urgencyText = document.querySelector('.urgency-text');
    const countdownCard = document.querySelector('.countdown-card');
    
    if (urgencyText) {
        let mensaje = '';
        if (porcentaje < 50) {
            mensaje = '💡 ¡No pierdas esta oportunidad! Aún hay muchos boletos disponibles - Participa ahora';
        } else if (porcentaje < 75) {
            mensaje = '⚠️ ¡SE AGOTAN LOS BOLETOS! Más del 50% ya vendido - ¡Asegura tu boleto ahora!';
        } else {
            mensaje = '🔥 ¡ÚLTIMAS OPORTUNIDADES! Más del 75% vendido - ¡Solo quedan ' + (100 - porcentaje) + '% disponibles!';
        }
        urgencyText.textContent = mensaje;
        
        if (countdownCard) {
            if (porcentaje >= 75) {
                countdownCard.classList.add('urgent-pulse');
            } else {
                countdownCard.classList.remove('urgent-pulse');
            }
        }
    }
}

/**
 * Actualiza el total de boletos en la interfaz
 */
function actualizarTotalBoletosEnUI() {
    // DINÁMICO: Usar obtenerRangoMaximoBoletos para considerar oportunidades
    const totalBoletos = window.rifaplusConfig?.obtenerRangoMaximoBoletos?.() || 10000;
    const elem = document.getElementById('total-boletos-info');
    if (elem) {
        elem.textContent = totalBoletos.toLocaleString();
    }
}

/**
 * Inicializa completamente el countdown y progreso
 */
(function initializeCountdownConsolidated() {
    let intervalId = null;
    let ultimaActualizacionProgreso = 0; // Cooldown para evitar 429
    
    function setupCountdown() {
        if (document.getElementById('countdown-days') || document.getElementById('boletos-vendidos')) {
            actualizarTotalBoletosEnUI();
            
            // OPTIMIZACIÓN: Solo actualizar barra de progreso si no se actualizó hace poco
            const ahora = Date.now();
            if (ahora - ultimaActualizacionProgreso > 60000) { // Mínimo 60 segundos entre actualizaciones
                actualizarBarraProgreso();
                ultimaActualizacionProgreso = ahora;
            }
            
            // Actualizar cada 5 minutos (300000 ms) para reducir API calls
            intervalId = setInterval(() => {
                actualizarBarraProgreso();
                ultimaActualizacionProgreso = Date.now();
            }, 300000);
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupCountdown);
    } else {
        setupCountdown();
    }
    
    // OPTIMIZACIÓN: Cleanup - detener polling cuando usuario abandona la página
    window.addEventListener('pagehide', function() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    }, true);
})();

console.log('✅ main.js completamente cargado con countdown consolidado');