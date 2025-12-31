/**
 * ============================================================
 * ARCHIVO: js/compra.js
 * DESCRIPCIÓN: Lógica de compra y selección de boletos
 * Gestiona la interfaz de compra, máquina de suerte,
 * selección de números y sincronización con el carrito
 * ÚLTIMA ACTUALIZACIÓN: 2025
 * ============================================================
 */

/* ============================================================ */
/* SECCIÓN 1: CONFIGURACIÓN GLOBAL Y VARIABLES DE ESTADO         */
/* ============================================================ */

// Función para obtener precio dinámico desde config (robusta)
function obtenerPrecioDinamico() {
    const cfg = window.rifaplusConfig || {};
    const price = Number(cfg && cfg.rifa && cfg.rifa.precioBoleto);
    return (!Number.isNaN(price) && isFinite(price) && price > 0) ? price : 0;
}

// Almacenar selecciones globales (persiste al cambiar rangos)
var selectedNumbersGlobal = new Set();

// Guardar estado del filtro de disponibles (persiste al cambiar rangos)
var filtroDisponiblesActivo = false;

/* ============================================================ */
/* INFINITE SCROLL STATE */
/* ============================================================ */
var infiniteScrollState = {
    rangoActual: { inicio: 1, fin: 100 },
    boletosCargados: 0,
    BOLETOS_POR_CARGA: 500,  // ⭐ OPTIMIZACIÓN: Reducido de 1000 a 500 para mejor performance
    isLoading: false,
    hasMore: true,
    observer: null,
    lastRenderTime: 0,  // ⭐ Para debounce
    renderDebounceMs: 300  // ⭐ Debounce render calls
};

// Fallback defensivo para utilidades (evitar crash si main.js no se cargó correctamente)
if (!window.rifaplusUtils) {
    window.rifaplusUtils = {
        /**
         * Mostrar feedback visual al usuario
         * @param {string} mensaje - Mensaje a mostrar
         * @param {string} tipo - Tipo de feedback (info, success, warning, error)
         */
        showFeedback: function(mensaje, tipo = 'info') {
            // mínimo feedback no intrusivo
            console.log('[rifaplusUtils.showFeedback]', tipo, mensaje);
        },
        /**
         * Calcular descuentos por cantidad de boletos
         * Lee promociones dinámicamente desde config.js
         * @param {number} cantidad - Cantidad de boletos
         * @param {number} precioUnitario - Precio por unidad
         * @returns {Object} Datos de cálculo (subtotal, descuento, total)
         */
        calcularDescuento: function(cantidad, precioUnitario = null) {
            if (!precioUnitario) {
                // Obtener precio dinámico si no se proporciona
                    precioUnitario = obtenerPrecioDinamico();
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

            const subtotal = cantidad * precioUnitario;
            return {
                cantidadBoletos: cantidad,
                precioUnitario: precioUnitario,
                subtotal: subtotal,
                descuentoMonto: montoDescuento,
                descuentoPorcentaje: montoDescuento > 0 
                    ? ((montoDescuento / subtotal) * 100).toFixed(2)
                    : 0,
                totalFinal: precioTotal
            };
        },
        /**
         * Alias para mostrarFeedback (compatibilidad)
         */
        mostrarFeedback: function(mensaje, tipo = 'info') {
            return this.showFeedback(mensaje, tipo);
        }
    };
}

/* ============================================================ */
/* SECCIÓN 2: SINCRONIZACIÓN DE PESTAÑA Y EVENTOS GLOBALES       */
/* ============================================================ */

// Flag para evitar múltiples calls cuando usuario vuelve a pestaña
var visibilityCheckExecuting = false;

/**
 * Detectar cuando el usuario vuelve a la pestaña
 * Refrescar boletos disponibles para mantener estado sincronizado
 * OPTIMIZACIÓN: Usar flag para evitar solapamientos de calls
 */
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && typeof cargarBoletosPublicos === 'function' && !visibilityCheckExecuting) {
        visibilityCheckExecuting = true;
        // La página es visible de nuevo - actualizar disponibilidad de boletos
        console.log('📱 Usuario volvió a la pestaña - refrescando disponibilidad de boletos');
        cargarBoletosPublicos().catch(e => console.warn('Error al refrescar boletos:', e)).finally(() => {
            visibilityCheckExecuting = false;
        });
    }
});

/**
 * Cleanup: Limpiar timers y listeners cuando se abandona la página
 * Previene memory leaks y API calls innecesarias
 */
window.addEventListener('pagehide', function() {
    console.log('🧹 Limpiando timers de compra.js...');
    if (window.rifaplusFetchTimeoutId) {
        clearTimeout(window.rifaplusFetchTimeoutId);
        window.rifaplusFetchTimeoutId = null;
    }
}, true);

/**
 * Inicialización cuando DOM está listo
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔍 COMPRA.JS LOADED - Precio del config:', window.rifaplusConfig?.rifa?.precioBoleto);
    inicializarSistemaCompra();
    // Carrito será inicializado por carrito-global.js
    
    // Actualizar resumen poco después de cargar la página
    setTimeout(actualizarResumenCompra, 100);
});

/* ============================================================ */
/* SECCIÓN 3: INICIALIZACIÓN DEL SISTEMA DE COMPRA                */
/* ============================================================ */

// OPTIMIZACIÓN: Debounce para actualizarResumenCompra (evita renders excesivos)
var resumenDebounceTimer = null;
function actualizarResumenCompraConDebounce() {
    // Cancelar el timer anterior si existe
    if (resumenDebounceTimer) clearTimeout(resumenDebounceTimer);
    // Programar actualización con pequeño delay (agrupa múltiples cambios rápidos)
    resumenDebounceTimer = setTimeout(actualizarResumenCompra, 50);
}

/**
 * Inicializar sistema completo de compra
 * Carga boletos, configura grid, máquina de suerte
 */
async function inicializarSistemaCompra() {
    
    const grilla = document.getElementById('numerosGrid');
    if (!grilla) {
        console.error('❌ ERROR CRÍTICO: No se encontró el elemento numerosGrid');
        return;
    }
    
    // Sincronizar selectedNumbersGlobal con localStorage al cargar la página
    const guardado = localStorage.getItem('rifaplusSelectedNumbers');
    if (guardado) {
        try {
            const arrayGuardado = JSON.parse(guardado);
            selectedNumbersGlobal.clear();
            arrayGuardado.forEach(num => selectedNumbersGlobal.add(num));
            // Actualizar el contador inmediatamente después de sincronizar
            if (window.actualizarContadorCarritoGlobal) {
                window.actualizarContadorCarritoGlobal();
            }
        } catch (error) {
            console.error('Error al sincronizar boletos desde localStorage:', error);
        }
    }
    
    // ⭐ IMPORTANTE: Restaurar estado del filtro desde localStorage
    const filtroGuardado = localStorage.getItem('rifaplusFiltroDisponibles');
    if (filtroGuardado !== null) {
        try {
            filtroDisponiblesActivo = JSON.parse(filtroGuardado);
            // Sincronizar checkbox con estado guardado
            const checkboxFiltro = document.getElementById('filtroDisponibles');
            if (checkboxFiltro) {
                checkboxFiltro.checked = filtroDisponiblesActivo;
            }
        } catch (error) {
            console.error('Error al restaurar estado del filtro:', error);
        }
    }
    
    inicializarRangoDefault();
    configurarEventListeners();
    // Cargar datos reales de boletos vendidos/apartados ANTES de inicializar la máquina
    await cargarBoletosPublicos();
    // Inicializar la máquina sólo después de tener datos de vendidos/apartados
    inicializarMaquinaSuerteMejorada();
    // La función `cargarBoletosPublicos` se encarga ahora de programar su siguiente ejecución
    // usando setTimeout + backoff para evitar solapamientos que causan 429.
}

/* ============================================================ */
/* SECCIÓN 4: CARGA DE BOLETOS DESDE API PÚBLICA                 */
/* ============================================================ */

/**
 * Fetch de boletos vendidos/apartados desde backend público
 * OPTIMIZADO: 2-STAGE LOADING
 * Stage 1: Ultra-rápido /api/public/boletos/stats (< 50ms) - muestra conteo
 * Stage 2: Background /api/public/boletos - carga grid sin bloquear
 * 
 * Sincroniza disponibilidad en tiempo real
 */
async function cargarBoletosPublicos() {
    try {
        let endpoint = (window.rifaplusConfig && window.rifaplusConfig.backend && window.rifaplusConfig.backend.apiBase) ? window.rifaplusConfig.backend.apiBase : 'http://localhost:3000';
        // Normalizar endpoint para evitar segmentos duplicados como `/api/api/...`
        endpoint = String(endpoint).replace(/\/+$/,''); // Remover slashes finales

        // ⚡ STAGE 1: ULTRA-RÁPIDO STATS (< 50ms)
        // Mostrar disponibilidad INSTANTÁNEAMENTE
        console.debug('📊 Cargando stats de disponibilidad...');
        
        try {
            const statsController = new AbortController();
            const statsTimeoutId = setTimeout(() => statsController.abort(), 2000);
            
            const statsResponse = await fetch(`${endpoint}/api/public/boletos/stats`, {
                signal: statsController.signal // Compatible con iPhone X
            });
            
            clearTimeout(statsTimeoutId);
            
            if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                
                if (statsData.success) {
                    // Soportar ambos formatos: con y sin wrapper 'data'
                    const data = statsData.data || statsData;
                    
                    // ✅ Actualizar UI INMEDIATAMENTE con conteos
                    const availabilityNote = document.getElementById('availabilityNote');
                    if (availabilityNote) {
                        availabilityNote.textContent = `${data.disponibles} boletos disponibles`;
                        availabilityNote.style.display = 'inline-block';
                        console.debug(`✅ INSTANTÁNEO: ${data.disponibles} boletos disponibles (${data.queryTime}ms)`);
                    }
                    
                    // 🚀 CRÍTICO: Marcar como cargado una vez que /stats responde
                    // Esto permite que el botón de generar se habilite aunque Web Worker siga procesando
                    window.rifaplusBoletosLoaded = true;
                    
                    // 🔧 IMPORTANTE: Si los arrays aún no están poblados (Web Worker lento/fallido),
                    // crear arrays vacíos para que obtenerNumerosDisponibles() funcione correctamente
                    if (!window.rifaplusSoldNumbers) {
                        window.rifaplusSoldNumbers = [];
                    }
                    if (!window.rifaplusReservedNumbers) {
                        window.rifaplusReservedNumbers = [];
                    }
                    
                    if (typeof actualizarEstadoBotonGenerar === 'function') {
                        actualizarEstadoBotonGenerar();
                    }
                    
                    // Actualizar estado global para mostrar porcentaje
                    if (window.rifaplusConfig && window.rifaplusConfig.estado) {
                        window.rifaplusConfig.estado.boletosVendidos = data.vendidos;
                        window.rifaplusConfig.estado.boletosApartados = data.reservados;
                        window.rifaplusConfig.estado.boletosDisponibles = data.disponibles;
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error cargando stats (mostrar en UI):', error.message, error.stack);
            // Mostrar error al usuario
            const availabilityNote = document.getElementById('availabilityNote');
            if (availabilityNote) {
                availabilityNote.textContent = '❌ Error cargando disponibilidad: ' + (error.message || 'desconocido');
                availabilityNote.style.display = 'inline-block';
                availabilityNote.style.color = 'red';
            }
        }
        
        // 🔄 STAGE 2: BACKGROUND - Cargar datos completos SIN BLOQUEAR
        // Si es la primera carga, mostrar loading
        if (!window.rifaplusBoletosLoaded) {
            const loadingEl = document.getElementById('loadingEstadoBoletos');
            const gridEl = document.getElementById('numerosGrid');
            if (loadingEl) loadingEl.style.display = 'flex';
            if (gridEl) {
                gridEl.style.opacity = '0.5';
                gridEl.setAttribute('data-loading', 'true');
                gridEl.style.pointerEvents = 'none';
            }
            
            // ⭐ BLOQUEAR AGREGAR AL CARRITO DURANTE LA CARGA
            window.rifaplusBoletosLoading = true;
            if (typeof controlarEstadoBotonesLoQuiero === 'function') {
                controlarEstadoBotonesLoQuiero();
            }
        }
        
        // Cargar full data en background (baja prioridad)
        cargarDatosCompletosEnBackground(endpoint);
        
        return true;
        
    } catch (error) {
        console.error('Error en cargarBoletosPublicos:', error);
        return false;
    }
}

/**
 * Helper: Carga datos completos en background sin bloquear UI
 * Esta función se ejecuta de forma asincrónica, puede tomar tiempo
 */
async function cargarDatosCompletosEnBackground(endpoint) {
    try {
        console.debug('📦 Iniciando carga en background de datos completos...');
        
        const respuesta = await fetch(`${endpoint}/api/public/boletos?listCompleta=true`, {
            priority: 'low' // Baja prioridad en navegadores que lo soporten
        });

        // Manejar códigos de estado explícitos primero
        if (respuesta.status === 429) {
            // Rate-limited by server
            console.warn('cargarBoletosPublicos: servidor devolvió 429 Too Many Requests');
            window.rifaplusBoletosLoaded = false;
            window.rifaplusBoletosLoading = false;
            window.rifaplusFetchBackoffMs = Math.min((window.rifaplusFetchBackoffMs || 30000) * 2, 300000);
            // ensure we don't schedule multiple timeouts
            if (window.rifaplusFetchTimeoutId) clearTimeout(window.rifaplusFetchTimeoutId);
            window.rifaplusFetchTimeoutId = setTimeout(cargarBoletosPublicos, window.rifaplusFetchBackoffMs);
            // update UI state
            if (typeof actualizarEstadoBotonGenerar === 'function') actualizarEstadoBotonGenerar();
            return false;
        }

        if (!respuesta.ok) {
            // Non-OK (other than 429), retry with backoff
            console.warn('cargarBoletosPublicos: respuesta no OK', respuesta.status);
            window.rifaplusBoletosLoaded = false;
            window.rifaplusBoletosLoading = false;
            window.rifaplusFetchBackoffMs = Math.min((window.rifaplusFetchBackoffMs || 30000) * 2, 300000);
            if (window.rifaplusFetchTimeoutId) clearTimeout(window.rifaplusFetchTimeoutId);
            window.rifaplusFetchTimeoutId = setTimeout(cargarBoletosPublicos, window.rifaplusFetchBackoffMs);
            if (typeof actualizarEstadoBotonGenerar === 'function') actualizarEstadoBotonGenerar();
            return false;
        }

        const json = await respuesta.json();

        // ⭐ CRITICAL VALIDATION: Verificar que los datos no sean arrays vacíos
        // Si la API devuelve arrays vacíos, usar datos cacheados o arrays vacíos
        let sold = Array.isArray(json.data?.sold) ? json.data.sold : [];
        let reserved = Array.isArray(json.data?.reserved) ? json.data.reserved : [];

        // 🚀 OPTIMIZACIÓN MÓVIL: Procesar boletos SIN BLOQUEAR UI usando Web Worker
        procesarBoletosEnBackground(sold, reserved);
        

        if (json && json.success) {
            // Indicar que los datos de disponibilidad ya se cargaron
            window.rifaplusBoletosLoaded = true;
            window.rifaplusBoletosLoading = false;  // ⭐ DESBLOQUEAR CARRITO
            // reset backoff to default
            window.rifaplusFetchBackoffMs = 10000;
            
            // ⭐ DESBLOQUEAR BOTONES "Lo quiero"
            if (typeof controlarEstadoBotonesLoQuiero === 'function') {
                controlarEstadoBotonesLoQuiero();
            }
            
            // ⭐ OCULTAR LOADING INDICATOR
            const loadingEl = document.getElementById('loadingEstadoBoletos');
            const gridEl = document.getElementById('numerosGrid');
            if (loadingEl) loadingEl.style.display = 'none';
            if (gridEl) {
                gridEl.style.opacity = '1';
                gridEl.removeAttribute('data-loading');
                gridEl.style.pointerEvents = 'auto';
            }
            
            console.debug(`✅ Datos completos cargados: ${sold.length} vendidos, ${reserved.length} reservados`);

            // ⭐ OPTIMIZACIÓN: En lugar de re-renderizar TODO el grid (que reinicia scroll),
            // solo actualizar los botones visibles con su nuevo estado
            actualizarEstadoBoletosVisibles();
            
            // schedule next normal poll (⭐ OPTIMIZACIÓN: 5 minutos en lugar de 30s para no ralentizar la página)
            if (window.rifaplusFetchTimeoutId) clearTimeout(window.rifaplusFetchTimeoutId);
            window.rifaplusFetchTimeoutId = setTimeout(cargarBoletosPublicos, 300000); // 5 minutos para mejor performance
            if (typeof actualizarEstadoBotonGenerar === 'function') actualizarEstadoBotonGenerar();
            if (typeof actualizarNotaDisponibilidad === 'function') actualizarNotaDisponibilidad();
            return true;
        }
        // If data not in expected shape, treat as fail and try later
        window.rifaplusBoletosLoaded = false;
        window.rifaplusBoletosLoading = false;
        window.rifaplusFetchBackoffMs = Math.min((window.rifaplusFetchBackoffMs || 30000) * 2, 300000);
        if (window.rifaplusFetchTimeoutId) clearTimeout(window.rifaplusFetchTimeoutId);
        window.rifaplusFetchTimeoutId = setTimeout(cargarBoletosPublicos, window.rifaplusFetchBackoffMs);
        if (typeof actualizarEstadoBotonGenerar === 'function') actualizarEstadoBotonGenerar();
        if (typeof actualizarNotaDisponibilidad === 'function') actualizarNotaDisponibilidad();
        return false;
    } catch (e) {
        // Network or unexpected error — increase backoff and retry later
        console.warn('cargarBoletosPublicos error', e && e.message ? e.message : e);
        window.rifaplusBoletosLoaded = false;
        window.rifaplusBoletosLoading = false;
        window.rifaplusFetchBackoffMs = Math.min((window.rifaplusFetchBackoffMs || 30000) * 2, 300000);
        if (window.rifaplusFetchTimeoutId) clearTimeout(window.rifaplusFetchTimeoutId);
        window.rifaplusFetchTimeoutId = setTimeout(cargarBoletosPublicos, window.rifaplusFetchBackoffMs);
        if (typeof actualizarEstadoBotonGenerar === 'function') actualizarEstadoBotonGenerar();
        if (typeof actualizarNotaDisponibilidad === 'function') actualizarNotaDisponibilidad();
        return false;
    }
}

/**
 * ⭐ OPTIMIZACIÓN: Actualizar SOLO los boletos visibles sin limpiar el grid
 * Esto evita que se reinicie el scroll cuando se actualiza el estado de boletos
 * OPTIMIZADO: Solo actualiza botones visibles en pantalla usando IntersectionObserver
 */
function actualizarEstadoBoletosVisibles() {
    requestIdleCallback(() => {
        const grid = document.getElementById('numerosGrid');
        if (!grid) return;
        
        const soldSet = new Set((window.rifaplusSoldNumbers && Array.isArray(window.rifaplusSoldNumbers)) ? window.rifaplusSoldNumbers : []);
        const reservedSet = new Set((window.rifaplusReservedNumbers && Array.isArray(window.rifaplusReservedNumbers)) ? window.rifaplusReservedNumbers : []);
        
        // 🚀 OPTIMIZACIÓN: Usar IntersectionObserver para solo actualizar lo visible
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const btn = entry.target;
                if (!entry.isIntersecting) return; // Solo procesar si está visible
                
                const numero = parseInt(btn.getAttribute('data-numero'), 10);
                
                // Remover clases antiguas
                btn.classList.remove('sold', 'reserved');
                btn.disabled = false;
                btn.title = '';
                
                // Aplicar nuevas clases según estado actual
                if (soldSet.has(numero)) {
                    btn.classList.add('sold');
                    btn.disabled = true;
                    btn.title = 'Vendido';
                } else if (reservedSet.has(numero)) {
                    btn.classList.add('reserved');
                    btn.disabled = true;
                    btn.title = 'Apartado';
                }
            });
        }, { 
            root: grid,
            rootMargin: '100px', // Precarga 100px antes de ser visible
            threshold: 0.1 
        });
        
        // Observar todos los botones
        const botones = grid.querySelectorAll('button[data-numero]');
        botones.forEach(btn => observer.observe(btn));
    }, { timeout: 2000 }); // Timeout para no bloquear
}

function inicializarMaquinaSuerteMejorada() {
    
    const btnGenerar = document.getElementById('btnGenerarNumeros');
    const btnDisminuir = document.getElementById('disminuirCantidad');
    const btnAumentar = document.getElementById('aumentarCantidad');
    const inputCantidad = document.getElementById('cantidadNumeros');
    const btnRepetir = document.getElementById('btnRepetir');
    const btnAgregarSuerte = document.getElementById('btnAgregarSuerte');
    
    // Helper: activar/desactivar botón generar según cantidad
    // Nota: la función `actualizarEstadoBotonGenerar` se define a nivel global
    // (fuera de esta función) para que pueda ser invocada desde
    // `generarNumerosAleatoriosMejorado` y otros contextos.

    // Configurar controles de cantidad
    if (btnDisminuir && btnAumentar && inputCantidad) {
        btnDisminuir.addEventListener('click', function() {
            let cantidad = parseInt(inputCantidad.value, 10);
            if (isNaN(cantidad)) cantidad = 0;
            if (cantidad > 0) {
                inputCantidad.value = cantidad - 1;
                actualizarTotalMaquina();
                actualizarEstadoBotonGenerar();
            }
        });
        
        btnAumentar.addEventListener('click', function() {
            let cantidad = parseInt(inputCantidad.value, 10);
            if (isNaN(cantidad)) cantidad = 0;
            const maxTickets = window.rifaplusConfig.rifa.totalBoletos;
            if (cantidad < maxTickets) {
                inputCantidad.value = cantidad + 1;
                actualizarTotalMaquina();
                actualizarEstadoBotonGenerar();
            }
        });
        
        inputCantidad.addEventListener('change', function() {
            let cantidad = parseInt(this.value, 10);
            if (isNaN(cantidad) || cantidad < 0) cantidad = 0;
            const maxTickets = window.rifaplusConfig.rifa.totalBoletos;
            if (cantidad > maxTickets) cantidad = maxTickets;
            this.value = cantidad;
            actualizarTotalMaquina();
            actualizarEstadoBotonGenerar();
        });

        // Input sanitization: allow only integers, clamp range, update total and button state live
        inputCantidad.addEventListener('input', function() {
            let raw = this.value;
            // Convert to integer, stripping non-digit characters
            let parsed = parseInt(raw, 10);
            if (isNaN(parsed) || parsed < 0) parsed = 0;
            const maxTickets = window.rifaplusConfig.rifa.totalBoletos;
            if (parsed > maxTickets) parsed = maxTickets;
            if (String(parsed) !== raw) {
                // Update only if different to avoid cursor jump in some browsers
                this.value = parsed;
            }
            actualizarTotalMaquina();
            actualizarEstadoBotonGenerar();
        });
    }
    
    // Configurar botón generar
    if (btnGenerar) {
        btnGenerar.addEventListener('click', generarNumerosAleatoriosMejorado);
        // Inicialmente deshabilitar si datos no listos
        if (!window.rifaplusBoletosLoaded) {
            btnGenerar.disabled = true;
            // crear indicador visual si no existe
            if (!btnGenerar.dataset.origText) btnGenerar.dataset.origText = btnGenerar.textContent || 'Generar';
        }
    }
    
    // Configurar botón repetir
    if (btnRepetir) {
        btnRepetir.addEventListener('click', generarNumerosAleatoriosMejorado);
    }
    
    // Configurar botón agregar suerte
    if (btnAgregarSuerte) {
        btnAgregarSuerte.addEventListener('click', agregarNumerosSuerteAlCarrito);
    }
    
    // Inicializar total y estado del botón
    actualizarTotalMaquina();
    actualizarEstadoBotonGenerar();
    // Actualizar nota de disponibilidad inicialmente
    if (typeof actualizarNotaDisponibilidad === 'function') actualizarNotaDisponibilidad();
}

function actualizarTotalMaquina() {
    const inputCantidad = document.getElementById('cantidadNumeros');
    const totalDisplay = document.getElementById('totalMaquina');
    
    if (!inputCantidad || !totalDisplay) return;
    
    let cantidad = parseInt(inputCantidad.value, 10);
    if (isNaN(cantidad) || cantidad < 0) cantidad = 0;
    const precioUnitario = obtenerPrecioDinamico();
    const total = cantidad * precioUnitario;
    
    // Máquina: actualizar totales (sin logs de depuración)
    totalDisplay.textContent = `$${total.toFixed(2)}`;
}

// Función global para activar/desactivar el botón 'Generar' según cantidad y disponibilidad
function actualizarEstadoBotonGenerar() {
    const btnGenerar = document.getElementById('btnGenerarNumeros');
    const inputCantidad = document.getElementById('cantidadNumeros');
    if (!btnGenerar || !inputCantidad) return;
    
    let val = parseInt(inputCantidad.value, 10);
    if (isNaN(val) || val < 1) {
        btnGenerar.disabled = true;
        return;
    }
    
    // 🚀 SIMPLE Y ESTABLE: Usar SOLO el estado de /stats endpoint
    // No recalcular nada que cause oscilaciones
    const loaded = !!window.rifaplusBoletosLoaded;
    
    // Usar conteo del endpoint /stats (fiable)
    const boletosDisponiblesSegunStats = window.rifaplusConfig && 
                                         window.rifaplusConfig.estado && 
                                         window.rifaplusConfig.estado.boletosDisponibles !== undefined
                                         ? window.rifaplusConfig.estado.boletosDisponibles
                                         : 0;
    
    const hay_suficientes = boletosDisponiblesSegunStats >= val;
    
    // ⭐ SIMPLE: Si /stats dice que hay datos cargados y hay suficientes → HABILITAR y no tocar más
    btnGenerar.disabled = !loaded || !hay_suficientes;
}

// Mostrar nota de disponibilidad bajo el botón Generar
function actualizarNotaDisponibilidad() {
    const note = document.getElementById('availabilityNote');
    if (!note) return;
    
    // 🚀 OPTIMIZACIÓN: Si ya mostramos el valor del endpoint /stats, NO recalcular
    // El endpoint /stats ya actualizó esto correctamente
    if (note.textContent && note.textContent.includes('boletos disponibles') && !note.textContent.includes('Cargando')) {
        // Ya tenemos un valor del endpoint /stats, no lo sobrescribas
        return;
    }
    
    if (!window.rifaplusBoletosLoaded) {
        note.textContent = 'Cargando disponibilidad...';
        note.style.display = 'inline-block';
        return;
    }
    
    // Solo si NO hay datos del endpoint, calcular localmente
    const disponibles = obtenerNumerosDisponibles();
    if (!Array.isArray(disponibles)) {
        note.textContent = 'Disponibilidad desconocida';
        note.style.display = 'inline-block';
        return;
    }
    note.textContent = `${disponibles.length} boletos disponibles`;
    note.style.display = 'inline-block';
    // Si hay disponibles, ocultar nota si es amplia UX preferida
    if (disponibles.length === 0) {
        note.textContent = 'No quedan boletos disponibles';
    }
}

async function generarNumerosAleatoriosMejorado() {
    
    const inputCantidad = document.getElementById('cantidadNumeros');
    const numerosSuerte = document.getElementById('numerosSuerte');
    const resultado = document.getElementById('maquinaResultado');
    
    if (!inputCantidad || !numerosSuerte) {
        console.error('❌ Elementos de máquina de la suerte no encontrados');
        return;
    }
    
    const cantidad = parseInt(inputCantidad.value, 10);
    if (isNaN(cantidad) || cantidad < 1) {
        rifaplusUtils.showFeedback('⚠️ Selecciona al menos 1 número para generar.', 'warning');
        return [];
    }
    const numerosGenerados = [];
    
    // Limpiar resultados anteriores
    numerosSuerte.innerHTML = '';
    
    // ⚠️ CRÍTICO: Validar que tengamos datos de vendidos/apartados ANTES de generar
    // Si están vacíos, esperar un poco a que se procesen o recargar
    let intentos = 0;
    const maxIntentos = 50; // 5 segundos máximo (50 * 100ms)
    
    while ((!Array.isArray(window.rifaplusSoldNumbers) || !Array.isArray(window.rifaplusReservedNumbers) || 
            window.rifaplusSoldNumbers.length === 0 || window.rifaplusReservedNumbers.length === 0) && 
           intentos < maxIntentos) {
        intentos++;
        console.debug(`⏳ Esperando datos (intento ${intentos}/${maxIntentos})...`);
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Si después de esperar aún están vacíos, recargar
    if (!Array.isArray(window.rifaplusSoldNumbers) || !Array.isArray(window.rifaplusReservedNumbers)) {
        console.error('❌ CRÍTICO: Arrays de vendidos/apartados no inicializados después de esperar');
        rifaplusUtils.showFeedback('⚠️ Datos de boletos aún no listos. Recargando...', 'warning');
        await cargarBoletosPublicos();
        // Esperar a que se recarguen
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Asegurarnos de tener datos actualizados de vendidos/apartados
    const btnGenerar = document.getElementById('btnGenerarNumeros');
    const origText = btnGenerar && btnGenerar.dataset && btnGenerar.dataset.origText ? btnGenerar.dataset.origText : (btnGenerar ? btnGenerar.textContent : null);
    try {
        if (btnGenerar) {
            btnGenerar.disabled = true;
            btnGenerar.textContent = 'Generando…';
            btnGenerar.classList && btnGenerar.classList.add('loading');
        }
        if (!window.rifaplusBoletosLoaded) {
            await cargarBoletosPublicos();
        }
    } finally {
        if (btnGenerar) {
            // Restaurar estado según validación de cantidad y carga
            btnGenerar.classList && btnGenerar.classList.remove('loading');
            if (origText) btnGenerar.textContent = origText;
            // actualizar estado del botón (puede quedar deshabilitado si no hay datos)
            actualizarEstadoBotonGenerar();
        }
    }

    // Generar números únicos que estén disponibles
    const numerosDisponibles = obtenerNumerosDisponibles();
    
    if (numerosDisponibles.length < cantidad) {
        rifaplusUtils.showFeedback(`⚠️ Solo hay ${numerosDisponibles.length} números disponibles. No hay suficientes para generar ${cantidad} números.`, 'warning');
        return;
    }
    
    // Usar DocumentFragment para optimizar - agregar múltiples elementos de una vez
    const fragment = document.createDocumentFragment();
    
    // Seleccionar números aleatorios de los disponibles
    for (let i = 0; i < cantidad; i++) {
        if (numerosDisponibles.length === 0) break;
        
        const randomIndex = Math.floor(Math.random() * numerosDisponibles.length);
        const numero = numerosDisponibles.splice(randomIndex, 1)[0];
        numerosGenerados.push(numero);
        
        // Crear elemento visual del número
        const numeroChip = document.createElement('div');
        numeroChip.className = 'numero-chip';
        numeroChip.textContent = numero;
        numeroChip.setAttribute('data-numero', numero);
        
        // Agregar al fragment en lugar del DOM directamente
        fragment.appendChild(numeroChip);
    }
    
    // Agregar TODOS los elementos al DOM de una sola vez
    numerosSuerte.appendChild(fragment);
    
    // Guardar números generados para usarlos después
    numerosSuerte.setAttribute('data-numeros', numerosGenerados.join(','));
    
    // Mostrar resultado
    if (resultado) {
        resultado.style.display = 'block';
        
        // Scroll suave hacia la sección de resultados (corto)
        setTimeout(() => {
            resultado.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }
    
    // Números generados
    
    // Efecto visual de aparición optimizado
    const chips = numerosSuerte.querySelectorAll('.numero-chip');
    
    // Para muchos boletos (>100), usar CSS animation en lugar de JavaScript
    if (cantidad > 100) {
        // Agregar clase que activa animación CSS en masa (sin cascadas)
        requestAnimationFrame(() => {
            chips.forEach(chip => {
                chip.classList.add('fast-appear');
            });
        });
    } else {
        // Para cantidades pequeñas, usar cascada para efecto visual mejor
        chips.forEach((chip, index) => {
            chip.style.opacity = '0';
            chip.style.transform = 'scale(0.5)';
            
            // Reducir delay: máximo 500ms total (no 50 segundos)
            const delay = Math.min(index * 30, 500);
            setTimeout(() => {
                chip.style.transition = 'all var(--transition-fast)';
                chip.style.opacity = '1';
                chip.style.transform = 'scale(1)';
            }, delay);
        });
    }
    
    rifaplusUtils.showFeedback(`🎲 ${numerosGenerados.length} números generados correctamente`, 'success');
    
    return numerosGenerados;
}

function obtenerNumerosDisponibles() {
    // Obtener total de boletos DIRECTAMENTE de config.js
    const totalTickets = window.rifaplusConfig.rifa.totalBoletos;
    
    // Intentar obtener arrays de boletos
    const sold = (window.rifaplusSoldNumbers && Array.isArray(window.rifaplusSoldNumbers)) ? window.rifaplusSoldNumbers : [];
    const reserved = (window.rifaplusReservedNumbers && Array.isArray(window.rifaplusReservedNumbers)) ? window.rifaplusReservedNumbers : [];
    
    // ⚠️ CRÍTICO SEGURIDAD: Si arrays de vendidos/apartados están vacíos,
    // NO devolver números - es peligroso, podrían ser números ya vendidos/apartados
    if (sold.length === 0 && reserved.length === 0) {
        console.warn('⚠️  Arrays de vendidos/apartados vacíos - no es seguro generar números');
        return []; // Retornar vacío para forzar recarga
    }
    
    // Crear un conjunto de todos los números posibles
    const todosLosNumeros = new Set();
    for (let i = 1; i <= totalTickets; i++) {
        todosLosNumeros.add(i);
    }
    
    // Eliminar números que están vendidos/apartados según datos reales del servidor
    // Normalizar y eliminar (ignorar valores no numéricos)
    sold.forEach(n => {
        const nn = Number(n);
        if (!Number.isNaN(nn)) todosLosNumeros.delete(nn);
    });
    reserved.forEach(n => {
        const nn = Number(n);
        if (!Number.isNaN(nn)) todosLosNumeros.delete(nn);
    });

    // Si no hay datos válidos de servidor, no eliminamos por heurística; dejamos que cargarBoletosPublicos maneje esto.
    
    // Eliminar números ya seleccionados en el carrito
    selectedNumbersGlobal.forEach(num => todosLosNumeros.delete(num));
    
    // Convertir Set a Array y retornar
    return Array.from(todosLosNumeros);
}

function agregarNumerosSuerteAlCarrito() {
    const numerosSuerte = document.getElementById('numerosSuerte');
    const numerosStr = numerosSuerte.getAttribute('data-numeros');
    
    if (!numerosStr) {
        rifaplusUtils.showFeedback('⚠️ Primero genera algunos números con la máquina de la suerte', 'warning');
        return;
    }
    
    const numeros = numerosStr.split(',').map(num => parseInt(num.trim(), 10)).filter(n => !isNaN(n));
    let agregados = 0;
    
    // OPTIMIZACIÓN: Agregar todos los boletos al estado interno sin actualizar UI cada vez
    const sold = (window.rifaplusSoldNumbers && Array.isArray(window.rifaplusSoldNumbers)) ? window.rifaplusSoldNumbers : [];
    const reserved = (window.rifaplusReservedNumbers && Array.isArray(window.rifaplusReservedNumbers)) ? window.rifaplusReservedNumbers : [];
    const selectedNumbers = obtenerBoletosSelecionados();
    let stored = JSON.parse(localStorage.getItem('rifaplusSelectedNumbers') || '[]');
    
    const boletos_para_agregar = [];
    
    // Validar y coleccionar todos los boletos válidos
    numeros.forEach((numero) => {
        if (!sold.includes(numero) && !reserved.includes(numero) && !selectedNumbers.includes(numero)) {
            boletos_para_agregar.push(numero);
        }
    });
    
    // Agregar todos al estado de una sola vez
    boletos_para_agregar.forEach((numero) => {
        if (typeof selectedNumbersGlobal !== 'undefined') {
            selectedNumbersGlobal.add(numero);
        }
        if (!stored.includes(numero)) {
            stored.push(numero);
        }
        agregados++;
    });
    
    // Guardar localStorage UNA SOLA VEZ
    if (agregados > 0) {
        localStorage.setItem('rifaplusSelectedNumbers', JSON.stringify(stored));
    }
    
    // Marcar botones en la grilla
    boletos_para_agregar.forEach((numero) => {
        const botonNumero = document.querySelector(`.numero-btn[data-numero="${numero}"]`);
        if (botonNumero && !botonNumero.classList.contains('selected')) {
            botonNumero.classList.add('selected');
        }
    });
    
    // Animaciones según cantidad
    boletos_para_agregar.forEach((numero, index) => {
        if (numeros.length <= 5) {
            // Pocos boletos: animar todos con cascada
            setTimeout(() => {
                animarCarritoSolo(numero);
            }, index * 150);
        } else if (numeros.length <= 50) {
            // Cantidad media: animar cada 5 boletos
            if (index % 5 === 0) {
                animarCarritoSolo(numero);
            }
        }
        // Para >50, no animar individuales - solo una animación final
    });
    
    // Mostrar resultado solo si se agregaron números
    if (agregados > 0) {
        // Limpiar la grilla y ocultarla
        const resultado = document.getElementById('maquinaResultado');
        if (resultado) {
            resultado.style.display = 'none';
        }
        
        // Actualizar UI UNA SOLA VEZ (antes lo hacía múltiples veces)
        actualizarResumenCompraConDebounce();
        actualizarVistaCarritoGlobal();
        actualizarContadorCarritoGlobal();
        
        // Si son muchos boletos, animar carrito una sola vez con delay mínimo
        if (numeros.length > 5) {
            setTimeout(() => {
                animarCarritoSolo(0); // Animar carrito sin un número específico
                rifaplusUtils.showFeedback(`✅ Se agregaron ${agregados} boletos al carrito`, 'success');
            }, 50);
        }
    } else {
        rifaplusUtils.showFeedback('⚠️ No se pudieron agregar los números. Puede que ya estén seleccionados o no estén disponibles.', 'warning');
    }
}

function configurarEventListeners() {
    
    const grid = document.getElementById('numerosGrid');
    const btnLimpiar = document.getElementById('btnLimpiar');
    const btnComprar = document.getElementById('btnComprar');
    const btnProbarMaquina = document.getElementById('btnProbarMaquina');
    
    console.log('🔧 Configurando event listeners...');
    console.log('  - Grid:', grid ? '✓' : '✗');
    console.log('  - btnLimpiar:', btnLimpiar ? '✓' : '✗');
    console.log('  - btnComprar:', btnComprar ? '✓' : '✗');
    console.log('  - btnProbarMaquina:', btnProbarMaquina ? '✓' : '✗');
    
    // 1. CLICKS EN NÚMEROS
    if (grid) {
        grid.addEventListener('click', function(e) {
            if (e.target.classList.contains('numero-btn')) {
                console.log('📌 Click en número:', e.target.textContent);
                manejarClickNumero(e.target);
            }
        });
        console.log('✓ Evento click en grid configurado');
    }
    
    // 2. BOTONES DE RANGO - Se configuran dinámicamente en generarBotonesRango()
    
    // 3. BOTÓN LIMPIAR
    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', limpiarSeleccion);
    }
    
    // 4. BOTÓN COMPRAR
    if (btnComprar) {
        btnComprar.addEventListener('click', function() {
            const seleccionados = selectedNumbersGlobal.size;
            if (seleccionados > 0) {
                iniciarFlujoPago();
            } else {
                rifaplusUtils.showFeedback('⚠️ Primero selecciona al menos un boleto', 'warning');
            }
        });
    }
    
    // 5. BOTÓN PROBAR MÁQUINA - Scroll suave con offset para mostrar el título
    if (btnProbarMaquina) {
        btnProbarMaquina.addEventListener('click', function(e) {
            e.preventDefault();
            const maquinaCard = document.getElementById('maquinaCard');
            if (maquinaCard) {
                const yOffset = -80; // Ajusta el offset según la altura del header
                const y = maquinaCard.getBoundingClientRect().top + window.pageYOffset + yOffset;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        });
    }

    // Scroll con offset para "Seleccionar Boletos"
    const btnSeleccionarBoletos = document.querySelector('.compra-hero-cta .btn[href="#numerosGrid"]');
    if (btnSeleccionarBoletos) {
        btnSeleccionarBoletos.addEventListener('click', function(e) {
            e.preventDefault();
            // Buscar el título de la sección
            const tituloBoletos = document.querySelector('.seleccion-section .section-title');
            if (tituloBoletos) {
                const yOffset = -40; // Ajusta el offset para que el título quede visible
                const y = tituloBoletos.getBoundingClientRect().top + window.pageYOffset + yOffset;
                window.scrollTo({ top: y, behavior: 'smooth' });
            } else {
                // Fallback al grid si no se encuentra el título
                const numerosGrid = document.getElementById('numerosGrid');
                if (numerosGrid) {
                    const yOffset = -80;
                    const y = numerosGrid.getBoundingClientRect().top + window.pageYOffset + yOffset;
                    window.scrollTo({ top: y, behavior: 'smooth' });
                }
            }
        });
    }

    // 6. FILTRO DE BOLETOS - Mostrar solo disponibles
    const filtroDisponibles = document.getElementById('filtroDisponibles');
    if (filtroDisponibles) {
        filtroDisponibles.addEventListener('change', function() {
            aplicarFiltroDisponibles(this.checked);
        });
    }

    // 7. BÚSQUEDA DE BOLETOS
    configurarBuscadorBoletos();
}

/**
 * FLUJO DE SELECCIÓN DE BOLETOS
 * =============================
 * 1. Click en boletera -> manejarClickNumero (agregar o remover)
 * 2. Búsqueda o máquina -> agregarBoletoDirectoCarrito (valida y agrega)
 * 3. Eliminar de carrito -> removerBoletoSeleccionado (quita de todo)
 * 4. Eliminar del resumen -> removerBoletoSeleccionado (quita de todo)
 * 5. Limpiar todo -> handleLimpiarCarrito (limpia carrito) o limpiarSeleccion (limpia selección)
 */

function manejarClickNumero(boton) {
    const numero = parseInt(boton.getAttribute('data-numero'), 10);
    
    if (boton.classList.contains('selected')) {
        // DESELECCIONAR: quitar de Set, localStorage y actualizar vistas
        console.log(`🔍 Deseleccionando boleto #${numero}`);
        removerBoletoSeleccionado(numero);
    } else {
        // SELECCIONAR: validar disponibilidad y agregar
        console.log(`🔍 Seleccionando boleto #${numero}`);
        agregarBoletoDirectoCarrito(numero);
        
        // Animar si se agregó exitosamente
        if (selectedNumbersGlobal.has(numero)) {
            boton.classList.add('selected');
            // Mostrar efecto en el carrito sin modificar el botón
            animarCarritoSolo(numero);
        }
    }
}

function limpiarSeleccion() {
    if (selectedNumbersGlobal.size === 0) {
        rifaplusUtils.showFeedback('No tienes números seleccionados', 'warning');
        return;
    }
    
    if (confirm(`¿Estás seguro de que quieres limpiar la selección de ${selectedNumbersGlobal.size} número(s)?`)) {
        // Remover clase 'selected' de todos los botones de la boletera
        const seleccionados = document.querySelectorAll('.numero-btn.selected');
        seleccionados.forEach(boton => {
            boton.classList.remove('selected');
            boton.style.transform = 'scale(1)';
        });
        
        // Limpiar datos
        selectedNumbersGlobal.clear();
        localStorage.removeItem('rifaplusSelectedNumbers');
        
        // Actualizar todas las vistas (usar debounce para resumen)
        actualizarResumenCompraConDebounce();
        actualizarVistaCarritoGlobal();
        actualizarContadorCarritoGlobal();
        
        // Cerrar carrito modal si está abierto
        const carritoModal = document.getElementById('carritoModal');
        if (carritoModal && carritoModal.classList.contains('active')) {
            carritoModal.classList.remove('active');
        }
        
        rifaplusUtils.showFeedback('Selección limpiada correctamente', 'success');
    }
}

function actualizarResumenCompra() {
    const cantidadBoletos = document.getElementById('cantidadBoletos');
    const numerosSeleccionados = document.getElementById('numerosSeleccionados');
    const descuentoAplicado = document.getElementById('descuentoAplicado');
    const totalPagar = document.getElementById('totalPagar');
    const btnComprar = document.getElementById('btnComprar');
    const btnLimpiar = document.getElementById('btnLimpiar');
    
    if (!cantidadBoletos) return;
    
    // Usar Set global en lugar de contar botones visibles
    const cantidad = selectedNumbersGlobal.size;
    
    cantidadBoletos.textContent = cantidad;
    
    if (numerosSeleccionados) {
        if (cantidad > 0) {
            // Ordenar números seleccionados para visualización
            const numerosOrdenados = Array.from(selectedNumbersGlobal).sort((a, b) => a - b);
            numerosSeleccionados.innerHTML = `
                <div class="lista-numeros">
                    ${numerosOrdenados.map(num => `
                        <span class="numero-chip" data-numero="${num}">
                            ${num}
                            <button class="numero-chip-delete" data-numero="${num}" aria-label="Eliminar boleto ${num}" title="Eliminar boleto ${num}">
                                ×
                            </button>
                        </span>
                    `).join('')}
                </div>
            `;
            
            // Agregar event listeners a los botones de eliminar en el resumen
            numerosSeleccionados.querySelectorAll('.numero-chip-delete').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const numero = parseInt(this.getAttribute('data-numero'), 10);
                    removerBoletoSeleccionado(numero);
                });
            });
        } else {
            numerosSeleccionados.innerHTML = '<p class="sin-seleccion">Aún no has seleccionado ningún boleto</p>';
        }
    }
    
    const precioUnitario = obtenerPrecioDinamico();
    
    // Usar función centralizada para calcular descuentos
    const calculoDescuento = window.rifaplusUtils.calcularDescuento(cantidad, precioUnitario);
    
    const total = calculoDescuento.totalFinal;
    const descuento = calculoDescuento.descuentoMonto;
    
    if (descuentoAplicado) {
        descuentoAplicado.textContent = `$${descuento.toFixed(2)}`;
    }
    
    if (totalPagar) {
        totalPagar.textContent = `$${total.toFixed(2)}`;
    }
    
    if (btnComprar) {
        btnComprar.disabled = cantidad === 0;
    }
    
    // Desactivar/activar botón de limpiar según haya boletos
    if (btnLimpiar) {
        btnLimpiar.disabled = cantidad === 0;
    }
    
    // Guardar totales actualizados en localStorage para consistencia
    try {
        localStorage.setItem('rifaplus_total', JSON.stringify({
            subtotal: calculoDescuento.subtotal,
            descuento: calculoDescuento.descuentoMonto,
            totalFinal: calculoDescuento.totalFinal,
            precioUnitario: calculoDescuento.precioUnitario,
            cantidad: calculoDescuento.cantidadBoletos
        }));
    } catch (e) {
        console.warn('No se pudo guardar rifaplus_total en localStorage', e);
    }

    // Resumen actualizado
}

function generarBotonesRango() {
    const rangoBoxes = document.getElementById('rangoBoxes');
    
    if (!rangoBoxes) {
        console.error('❌ ERROR: No se encontró elemento rangoBoxes');
        return;
    }
    
    // Limpiar botones previos
    rangoBoxes.innerHTML = '';
    
    // SOLO usar rangos de config.js (sin fallback)
    const rangos = window.rifaplusConfig?.rifa?.rangos || [];
    
    if (rangos.length === 0) {
        console.error('❌ ERROR CRÍTICO: No hay rangos definidos en config.js');
        return;
    }
    
    let esActivo = true;
    for (const rango of rangos) {
        const btn = document.createElement('button');
        btn.className = 'rango-btn';
        if (esActivo) {
            btn.classList.add('active');
            esActivo = false;
        }
        btn.setAttribute('data-inicio', rango.inicio);
        btn.setAttribute('data-fin', rango.fin);
        btn.textContent = rango.nombre || `${rango.inicio}-${rango.fin}`;
        
        btn.addEventListener('click', function() {
            manejarCambioRango(this);
        });
        
        rangoBoxes.appendChild(btn);
    }
    
    // Botones de rango generados
}

function inicializarRangoDefault() {
    // Generar botones de rango desde config.js
    generarBotonesRango();
    
    // Usar SIEMPRE el primer rango de config.js
    const primerRango = window.rifaplusConfig?.rifa?.rangos?.[0];
    
    if (!primerRango) {
        console.error('❌ ERROR CRÍTICO: No hay primer rango en config.js');
        return;
    }
    
    const rangoBtns = document.querySelectorAll('.rango-btn');
    if (rangoBtns.length > 0) {
        rangoBtns.forEach(btn => btn.classList.remove('active'));
        rangoBtns[0].classList.add('active');
    }

    renderRange(primerRango.inicio, primerRango.fin);
}

function renderRange(inicio, fin) {
    const grid = document.getElementById('numerosGrid');
    if (!grid) return;
    
    // ⭐ DEBOUNCE: Evitar renders múltiples en corto tiempo
    const ahora = Date.now();
    if (ahora - infiniteScrollState.lastRenderTime < infiniteScrollState.renderDebounceMs) {
        return;
    }
    infiniteScrollState.lastRenderTime = ahora;
    
    // Guardar rango actual para infinite scroll
    infiniteScrollState.rangoActual = { inicio, fin };
    infiniteScrollState.boletosCargados = 0;
    infiniteScrollState.hasMore = true;
    
    // OPTIMIZACIÓN: Remover animaciones CSS mientras se renderiza
    grid.style.pointerEvents = 'none';
    grid.style.opacity = '1';
    
    // Limpiar con innerHTML (más rápido que removeChild)
    grid.innerHTML = '';

    // Asegurar que inicio <= fin y que ambos sean enteros
    inicio = parseInt(inicio, 10) || 1;
    fin = parseInt(fin, 10) || inicio + 99;
    if (inicio > fin) {
        const t = inicio; inicio = fin; fin = t;
    }
    
    // ⭐ OPTIMIZACIÓN: Usar requestIdleCallback para no bloquear UI
    if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
            infiniteScrollLoadMore();
            setupInfiniteScrollObserver();
        }, { timeout: 1000 });
    } else {
        // Fallback para navegadores que no soportan requestIdleCallback
        setTimeout(() => {
            infiniteScrollLoadMore();
            setupInfiniteScrollObserver();
        }, 0);
    }
}

function infiniteScrollLoadMore() {
    const grid = document.getElementById('numerosGrid');
    if (!grid || infiniteScrollState.isLoading || !infiniteScrollState.hasMore) return;
    
    infiniteScrollState.isLoading = true;
    grid.style.pointerEvents = 'none';
    
    const { inicio, fin } = infiniteScrollState.rangoActual;
    const nextStart = inicio + infiniteScrollState.boletosCargados;
    const nextEnd = Math.min(nextStart + infiniteScrollState.BOLETOS_POR_CARGA - 1, fin);
    
    // Si ya se llegó al final, detener
    if (nextStart > fin) {
        infiniteScrollState.hasMore = false;
        infiniteScrollState.isLoading = false;
        grid.style.pointerEvents = 'auto';
        return;
    }
    
    // OPTIMIZACIÓN: Crear datos una sola vez en memoria
    const soldSet = new Set((window.rifaplusSoldNumbers && Array.isArray(window.rifaplusSoldNumbers)) ? window.rifaplusSoldNumbers : []);
    const reservedSet = new Set((window.rifaplusReservedNumbers && Array.isArray(window.rifaplusReservedNumbers)) ? window.rifaplusReservedNumbers : []);

    // OPTIMIZACIÓN: Usar innerHTML string en chunks de 20 (⭐ más pequeño = mejor rendimiento)
    let html = '';
    const CHUNK_SIZE = 20;
    
    for (let i = nextStart; i <= nextEnd; i++) {
        let classes = 'numero-btn';
        let disabled = false;
        let title = '';

        if (soldSet.has(i)) {
            classes += ' sold';
            disabled = true;
            title = 'Vendido';
        } else if (reservedSet.has(i)) {
            classes += ' reserved';
            disabled = true;
            title = 'Apartado';
        }

        if (typeof selectedNumbersGlobal !== 'undefined' && selectedNumbersGlobal.has(i)) {
            classes += ' selected';
        }

        html += `<button class="${classes}" data-numero="${i}" ${disabled ? 'disabled' : ''} ${title ? `title="${title}"` : ''}>${i}</button>`;
        
        // Insertar en chunks para evitar reflows masivos
        if ((i - nextStart + 1) % CHUNK_SIZE === 0 || i === nextEnd) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            while (tempDiv.firstChild) {
                grid.appendChild(tempDiv.firstChild);
            }
            html = '';
        }
    }
    
    infiniteScrollState.boletosCargados += (nextEnd - nextStart + 1);
    infiniteScrollState.isLoading = false;
    grid.style.pointerEvents = 'auto';
    
    // Reaplicar filtro si está activo
    if (filtroDisponiblesActivo) {
        aplicarFiltroDisponibles(true);
    }
}

function setupInfiniteScrollObserver() {
    // Limpiar observer anterior si existe
    if (infiniteScrollState.observer) {
        infiniteScrollState.observer.disconnect();
    }
    
    const sentinel = document.getElementById('infiniteScrollSentinel');
    if (!sentinel) return;
    
    // Crear observer para detectar cuando el usuario llega al final
    infiniteScrollState.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && infiniteScrollState.hasMore && !infiniteScrollState.isLoading) {
                infiniteScrollLoadMore();
            }
        });
    }, {
        root: document.getElementById('numerosGrid').parentElement,
        rootMargin: '100px',  // Cargar 100px antes de llegar al final
        threshold: 0.01
    });
    
    infiniteScrollState.observer.observe(sentinel);
}

function manejarCambioRango(boton) {
    // OPTIMIZACIÓN: Usar requestAnimationFrame para agrupar cambios
    requestAnimationFrame(() => {
        // Actualizar clase activa
        document.querySelectorAll('.rango-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        boton.classList.add('active');
        
        const inicio = parseInt(boton.getAttribute('data-inicio'));
        const fin = parseInt(boton.getAttribute('data-fin'));
        
        // Renderizar nuevo rango
        renderRange(inicio, fin);
        
        // Scroll suave al inicio del nuevo rango
        setTimeout(() => {
            const container = document.querySelector('.boletos-container-scrolleable');
            if (container) {
                container.scrollTop = 0;
            }
        }, 50);
        
        // Batch updates - usar setTimeout para agrupar las actualizaciones de UI
        setTimeout(() => {
            // Si el filtro de disponibles está activo, reaplicarlo al nuevo rango
            if (filtroDisponiblesActivo) {
                aplicarFiltroDisponibles(true);
            }
            
            // Después de renderizar, actualizar contador
            if (window.actualizarContadorCarritoGlobal) {
                window.actualizarContadorCarritoGlobal();
            }
            
            // Usar debounce para evitar re-renders innecesarios
            if (typeof actualizarResumenCompraConDebounce === 'function') {
                actualizarResumenCompraConDebounce();
            }
        }, 0);
    });
}

// ===== BÚSQUEDA DE BOLETOS =====

/**
 * Obtener boletos seleccionados - Ya se encuentra en carrito-global.js
 * Se accede como: window.obtenerBoletosSelecionados() o obtenerBoletosSelecionados()
 */

function configurarBuscadorBoletos() {
    const inputBusqueda = document.getElementById('busquedaBoleto');
    const btnBuscar = document.getElementById('btnBuscarBoleto');
    const resultadosDiv = document.getElementById('busquedaResultados');
    const resultadosList = document.getElementById('resultadosList');
    const rangoTotal = document.getElementById('rangoTotal');

    const totalTickets = window.rifaplusConfig.rifa.totalBoletos;
    if (rangoTotal) rangoTotal.textContent = totalTickets;

    if (!inputBusqueda || !btnBuscar) return;

    // Ejecutar búsqueda al hacer click en botón
    btnBuscar.addEventListener('click', ejecutarBusqueda);

    // Ejecutar búsqueda al presionar Enter
    inputBusqueda.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            ejecutarBusqueda();
        }
    });

    function ejecutarBusqueda() {
        const valor = inputBusqueda.value.trim();
        
        if (!valor) {
            rifaplusUtils.showFeedback('⚠️ Ingresa un número para buscar', 'warning');
            return;
        }

        const numero = parseInt(valor, 10);

        if (isNaN(numero) || numero < 1 || numero > totalTickets) {
            rifaplusUtils.showFeedback(`⚠️ Ingresa un número válido entre 1 y ${totalTickets}`, 'warning');
            resultadosDiv.style.display = 'none';
            return;
        }

        // Obtener estado del boleto (vendido, apartado, disponible)
        const sold = (window.rifaplusSoldNumbers && Array.isArray(window.rifaplusSoldNumbers)) ? window.rifaplusSoldNumbers : [];
        const reserved = (window.rifaplusReservedNumbers && Array.isArray(window.rifaplusReservedNumbers)) ? window.rifaplusReservedNumbers : [];
        const selectedNumbers = obtenerBoletosSelecionados();

        const estaVendido = sold.includes(numero);
        const estaApartado = reserved.includes(numero);
        const estaSeleccionado = selectedNumbers.includes(numero);

        // Mostrar resultado
        mostrarResultadoBusqueda(numero, estaVendido, estaApartado, estaSeleccionado);
    }

    function mostrarResultadoBusqueda(numero, vendido, apartado, yaSeleccionado) {
        resultadosList.innerHTML = '';

        let statusText = '✅ Disponible';
        let statusClass = 'disponible';
        let actionButton = '';

        if (vendido) {
            statusText = '❌ Vendido';
            statusClass = 'vendido';
        } else if (apartado) {
            statusText = '⏳ Apartado';
            statusClass = 'apartado';
        } else if (yaSeleccionado) {
            statusText = '✔️ Ya seleccionado';
            statusClass = 'seleccionado';
        } else {
            // Solo mostrar botón si está disponible
            actionButton = `<button class="btn btn-lo-quiero" data-numero="${numero}" style="padding: 0.5rem 1rem; background: var(--primary); color: white; border: none; border-radius: 0.375rem; cursor: pointer; font-weight: 600; transition: var(--transition-fast);">Lo quiero</button>`;
        }

        const resultadoHtml = `
            <div class="resultado-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--bg-light); border-radius: 0.5rem; margin-bottom: 0.5rem; gap: 1.5rem;">
                <div>
                    <span style="font-weight: 600; font-size: 1.1rem; color: var(--text-dark);">Boleto #${numero}</span>
                    <span style="display: block; font-size: 0.85rem; color: var(--text-light);">Estado: <strong style="color: ${vendido ? 'var(--danger)' : apartado ? 'var(--primary)' : yaSeleccionado ? 'var(--primary)' : 'var(--success)'}">${statusText}</strong></span>
                </div>
                ${actionButton}
            </div>
        `;

        resultadosList.insertAdjacentHTML('beforeend', resultadoHtml);

        // Añadir event listener al botón "Lo quiero"
        const btnLoQuiero = resultadosList.querySelector(`[data-numero="${numero}"]`);
        if (btnLoQuiero && !vendido && !apartado && !yaSeleccionado) {
            btnLoQuiero.addEventListener('click', function() {
                const seAgregó = agregarBoletoDirectoCarrito(numero);
                
                // Si se agregó exitosamente, animar el botón y carrito
                if (seAgregó) {
                    animarAgregarAlCarrito(btnLoQuiero, numero);
                }
            });
        }

        resultadosDiv.style.display = 'block';
    }
}

/**
 * Agregar un boleto directamente al carrito desde búsqueda o máquina
 * Valida disponibilidad en tiempo real antes de agregar
 */
function agregarBoletoDirectoCarrito(numero) {
    // ⭐ BLOQUEAR AGREGAR BOLETOS MIENTRAS SE CARGAN LOS ESTADOS
    if (window.rifaplusBoletosLoading) {
        rifaplusUtils.showFeedback('⏳ Por favor espera, cargando estado de los boletos...', 'warning');
        return false;
    }
    
    // Validar estado actual del boleto
    const sold = (window.rifaplusSoldNumbers && Array.isArray(window.rifaplusSoldNumbers)) ? window.rifaplusSoldNumbers : [];
    const reserved = (window.rifaplusReservedNumbers && Array.isArray(window.rifaplusReservedNumbers)) ? window.rifaplusReservedNumbers : [];
    const selectedNumbers = obtenerBoletosSelecionados();

    // Validaciones previas
    if (sold.includes(numero)) {
        rifaplusUtils.showFeedback(`❌ Boleto #${numero} está vendido`, 'error');
        return false;
    }

    if (reserved.includes(numero)) {
        rifaplusUtils.showFeedback(`⏳ Boleto #${numero} está apartado`, 'warning');
        return false;
    }

    if (selectedNumbers.includes(numero)) {
        rifaplusUtils.showFeedback(`✔️ Boleto #${numero} ya está en tu carrito`, 'info');
        return false;
    }

    // Agregar al Set global y localStorage
    if (typeof selectedNumbersGlobal !== 'undefined') {
        selectedNumbersGlobal.add(numero);
    }
    
    let stored = JSON.parse(localStorage.getItem('rifaplusSelectedNumbers') || '[]');
    if (!stored.includes(numero)) {
        stored.push(numero);
        localStorage.setItem('rifaplusSelectedNumbers', JSON.stringify(stored));
    }

    // Actualizar todas las vistas (resumen con debounce para agrupar cambios)
    actualizarResumenCompraConDebounce();
    actualizarVistaCarritoGlobal();
    actualizarContadorCarritoGlobal();
    
    // Actualizar estado visual en los resultados de búsqueda
    const resultadoItem = document.querySelector(`.resultado-item:has([data-numero="${numero}"])`);
    if (resultadoItem) {
        const statusSpan = resultadoItem.querySelector('strong');
        if (statusSpan) {
            statusSpan.textContent = '✔️ Ya seleccionado';
            statusSpan.style.color = 'var(--primary)';
        }
        // Ocultar botón "Lo quiero"
        const btnLoQuiero = resultadoItem.querySelector('.btn-lo-quiero');
        if (btnLoQuiero) {
            btnLoQuiero.style.display = 'none';
        }
    }
    
    // Marcar el boleto como seleccionado en el grid de la boletera
    // Búsqueda robusta: intenta múltiples formas de encontrar el botón
    const numerosGrid = document.getElementById('numerosGrid');
    if (numerosGrid) {
        // Método 1: Buscar por data-numero directamente en numerosGrid
        let botonEnGrid = numerosGrid.querySelector(`[data-numero="${numero}"]`);
        
        // Método 2: Si no encuentra, buscar en todos los descendientes (más exhaustivo)
        if (!botonEnGrid) {
            const allButtons = numerosGrid.querySelectorAll('button, div');
            for (let btn of allButtons) {
                if (btn.getAttribute('data-numero') === numero.toString() || 
                    btn.getAttribute('data-numero') === numero) {
                    botonEnGrid = btn;
                    break;
                }
            }
        }
        
        // Si encontró el botón, marcar como seleccionado
        if (botonEnGrid) {
            if (!botonEnGrid.classList.contains('selected')) {
                botonEnGrid.classList.add('selected');
            }
            console.log(`✅ Boleto #${numero} marcado como seleccionado en grid`);
        } else {
            console.warn(`⚠️ No se encontró boleto #${numero} en el grid. Data-numero: ${numero}`);
        }
    } else {
        console.warn('⚠️ Grid numerosGrid no encontrado en el DOM');
    }
    
    // Feedback de éxito
    rifaplusUtils.showFeedback(`✅ Boleto #${numero} agregado al carrito`, 'success');
    return true;
}

/* ============================================================ */
/* SECCIÓN 13: FILTRO DE BOLETOS - MOSTRAR SOLO DISPONIBLES      */
/* ============================================================ */

/**
 * aplicarFiltroDisponibles - Oculta boletos apartados y vendidos
 * @param {boolean} activo - Si el filtro está activo
 */
function aplicarFiltroDisponibles(activo) {
    // Guardar estado del filtro en variable global (persiste al cambiar rangos)
    filtroDisponiblesActivo = activo;
    
    // ⭐ IMPORTANTE: Guardar estado en localStorage para persistencia entre recargas
    localStorage.setItem('rifaplusFiltroDisponibles', JSON.stringify(activo));
    
    // ⭐ IMPORTANTE: Sincronizar checkbox UI con estado
    const checkboxFiltro = document.getElementById('filtroDisponibles');
    if (checkboxFiltro) {
        checkboxFiltro.checked = activo;
    }
    
    // OPTIMIZACIÓN: Usar requestAnimationFrame para agrupar cambios DOM
    requestAnimationFrame(() => {
        const todosLosBoletos = document.querySelectorAll('.numero-btn');
        
        // OPTIMIZACIÓN: Usar classList.toggle es más rápido que if/else
        if (activo) {
            // Si el filtro está activo, ocultar los vendidos (sold) y apartados (reserved)
            todosLosBoletos.forEach(boleto => {
                const debeOcultarse = boleto.classList.contains('sold') || boleto.classList.contains('reserved');
                boleto.classList.toggle('filtrado', debeOcultarse);
            });
        } else {
            // Si el filtro está inactivo, mostrar todos
            todosLosBoletos.forEach(boleto => {
                boleto.classList.remove('filtrado');
            });
        }
    });
    
    console.log('🔍 Filtro aplicado:', activo ? 'Solo disponibles' : 'Todos los boletos');
}

/* ============================================================ */
/* SECCIÓN 13B: ANIMACIÓN VISUAL AL AGREGAR AL CARRITO */
/* ============================================================ */

/**
 * obtenerColorSeleccionado - Obtiene dinámicamente el color de los boletos seleccionados desde CSS
 */
function obtenerColorSeleccionado() {
    try {
        // Obtener el color de la variable CSS --seleccionado
        const colorCSS = getComputedStyle(document.documentElement).getPropertyValue('--seleccionado').trim();
        return colorCSS || '#0F3A7D'; // Color por defecto si no existe
    } catch (error) {
        console.warn('No se pudo obtener el color seleccionado, usando por defecto');
        return '#0F3A7D';
    }
}

/**
 * animarCarritoSolo - Solo anima el carrito sin modificar el botón
 * Usado en selección manual de boletera
 */
function animarCarritoSolo(numeroDelBoleto) {
    try {
        const colorSeleccionado = obtenerColorSeleccionado();
        
        // ANIMACIÓN DEL CARRITO: Pulso llamativo para mostrar que recibió el item
        const carritoNav = document.getElementById('carritoNav');
        if (carritoNav) {
            // Agregar clase de animación
            carritoNav.classList.add('cart-pulse');
            
            // Cambiar color temporalmente al color de seleccionado
            const originalColor = carritoNav.style.color;
            carritoNav.style.color = colorSeleccionado;
            carritoNav.style.transform = 'scale(1.3)';
            
            // Remover después de la animación
            setTimeout(() => {
                carritoNav.classList.remove('cart-pulse');
                carritoNav.style.color = originalColor;
                carritoNav.style.transform = '';
            }, 600);
            
            // EFECTO FLYING: Crear un elemento flotante que "vuela" al carrito desde el grid
            crearEfectoVolandoDesdeGrid(carritoNav, numeroDelBoleto);
        }
        
    } catch (error) {
        console.error('Error al animar carrito:', error);
    }
}

/**
 * animarAgregarAlCarrito - Crea un efecto visual intuitivo cuando se agrega un boleto
 * Muestra:
 * 1. Confirmación en el botón (pulso verde)
 * 2. Animación del carrito (shake)
 * 3. Efecto flying (opcional si es necesario)
 */
function animarAgregarAlCarrito(botonElemento, numeroDelBoleto) {
    try {
        const colorSeleccionado = obtenerColorSeleccionado();
        
        // 1. ANIMACIÓN DEL BOTÓN: Efecto de confirmación con color dinámico
        botonElemento.classList.add('being-added');
        
        // Cambiar el contenido brevemente para mostrar confirmación
        const textoOriginal = botonElemento.textContent;
        botonElemento.textContent = '✅ ¡Agregado!';
        botonElemento.style.backgroundColor = colorSeleccionado;
        botonElemento.style.color = 'white';
        
        // Restaurar después de la animación
        setTimeout(() => {
            botonElemento.classList.remove('being-added');
            botonElemento.style.backgroundColor = '';
            botonElemento.style.color = '';
            // Dejamos el checkmark en el texto del botón para indicar que está seleccionado
            botonElemento.textContent = '✔️ Seleccionado';
        }, 600);
        
        // 2. ANIMACIÓN DEL CARRITO: Pulso llamativo para mostrar que recibió el item
        const carritoNav = document.getElementById('carritoNav');
        if (carritoNav) {
            // Agregar clase de animación
            carritoNav.classList.add('cart-pulse');
            
            // Cambiar color temporalmente al color dinámico
            const originalColor = carritoNav.style.color;
            carritoNav.style.color = colorSeleccionado;
            carritoNav.style.transform = 'scale(1.3)';
            
            // Remover después de la animación
            setTimeout(() => {
                carritoNav.classList.remove('cart-pulse');
                carritoNav.style.color = originalColor;
                carritoNav.style.transform = '';
            }, 600);
            
            // 3. EFECTO FLYING (opcional): Crear un elemento flotante que "vuela" al carrito
            crearEfectoVolandoAlCarrito(botonElemento, numeroDelBoleto);
        }
        
    } catch (error) {
        console.error('Error al animar agregar al carrito:', error);
    }
}

/**
 * crearEfectoVolandoDesdeGrid - Crea un efecto volando desde el grid (boletera) al carrito
 */
function crearEfectoVolandoDesdeGrid(carritoNav, numero) {
    try {
        // Obtener el botón del número en el grid si existe
        const numerosGrid = document.getElementById('numerosGrid');
        let botonOrigen = null;
        
        if (numerosGrid) {
            botonOrigen = numerosGrid.querySelector(`[data-numero="${numero}"]`);
        }
        
        // Si no encontramos el botón, usar el centro de la pantalla como origen
        let botonRect = {
            left: window.innerWidth / 2,
            top: window.innerHeight / 2,
            width: 0,
            height: 0
        };
        
        if (botonOrigen) {
            botonRect = botonOrigen.getBoundingClientRect();
        }
        
        const carritoRect = carritoNav.getBoundingClientRect();
        const colorSeleccionado = obtenerColorSeleccionado();
        
        // Crear elemento flotante con color dinámico
        const floatingEl = document.createElement('div');
        // Convertir el color a RGB para obtener valores individuales para sombra más clara
        const colorParaFondo = colorSeleccionado.startsWith('#') 
            ? colorSeleccionado 
            : colorSeleccionado;
        
        floatingEl.style.cssText = `
            position: fixed;
            left: ${botonRect.left + botonRect.width / 2}px;
            top: ${botonRect.top + botonRect.height / 2}px;
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, ${colorParaFondo}, ${colorParaFondo}dd);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            color: white;
            font-size: 18px;
            box-shadow: 0 4px 15px ${colorParaFondo}66;
            z-index: 9998;
            pointer-events: none;
        `;
        floatingEl.textContent = '🎫';
        
        document.body.appendChild(floatingEl);
        
        // Calcular distancia para la animación
        const deltaX = carritoRect.left - botonRect.left;
        const deltaY = carritoRect.top - botonRect.top;
        
        // Aplicar animación
        setTimeout(() => {
            floatingEl.style.transition = 'all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            floatingEl.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0.3)`;
            floatingEl.style.opacity = '0';
        }, 10);
        
        // Remover elemento después de la animación
        setTimeout(() => {
            floatingEl.remove();
        }, 800);
        
    } catch (error) {
        console.error('Error al crear efecto volando desde grid:', error);
    }
}

/**
 * crearEfectoVolandoAlCarrito - Crea un elemento visual que "vuela" del boleto al carrito
 */
function crearEfectoVolandoAlCarrito(botonElemento, numero) {
    try {
        const carritoNav = document.getElementById('carritoNav');
        if (!carritoNav) return;
        
        const colorSeleccionado = obtenerColorSeleccionado();
        
        // Obtener posiciones
        const botonRect = botonElemento.getBoundingClientRect();
        const carritoRect = carritoNav.getBoundingClientRect();
        
        // Crear elemento flotante con color dinámico
        const floatingEl = document.createElement('div');
        floatingEl.style.cssText = `
            position: fixed;
            left: ${botonRect.left + botonRect.width / 2}px;
            top: ${botonRect.top + botonRect.height / 2}px;
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, ${colorSeleccionado}, ${colorSeleccionado}dd);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            color: white;
            font-size: 18px;
            box-shadow: 0 4px 15px ${colorSeleccionado}66;
            z-index: 9998;
            pointer-events: none;
        `;
        floatingEl.textContent = '🎫';
        
        document.body.appendChild(floatingEl);
        
        // Calcular distancia para la animación
        const deltaX = carritoRect.left - botonRect.left;
        const deltaY = carritoRect.top - botonRect.top;
        
        // Aplicar animación
        setTimeout(() => {
            floatingEl.style.transition = 'all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            floatingEl.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0.3)`;
            floatingEl.style.opacity = '0';
        }, 10);
        
        // Remover elemento después de la animación
        setTimeout(() => {
            floatingEl.remove();
        }, 800);
        
    } catch (error) {
        console.error('Error al crear efecto volando:', error);
    }
}

/* ============================================================ */
/* SECCIÓN 14: CARRITO EXPANDIBLE - GESTIONADO POR carrito-global.js */
/* ============================================================ */

/**
 * Bloquea/Desbloquea los botones "Lo quiero" basado en estado de carga
 */
function controlarEstadoBotonesLoQuiero() {
    const botones = document.querySelectorAll('.btn-lo-quiero');
    const estaLoading = window.rifaplusBoletosLoading;
    
    botones.forEach(btn => {
        if (estaLoading) {
            btn.disabled = true;
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
            btn.title = 'Esperando carga de estados...';
        } else {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.title = 'Agregar boleto al carrito';
        }
    });
}

// El carrito es inicializado y gestionado completamente por carrito-global.js
// que se carga ANTES de compra.js en el HEAD de compra.html

/**
 * 🚀 OPTIMIZACIÓN MÓVIL: Procesar boletos en Web Worker
 * No bloquea el main thread, permite que la UI sea responsive
 * Con fallback a main thread si Web Worker falla o no responde (ej: iPhone)
 */
let boletosWorker = null;
let workerTimeoutId = null;

function procesarBoletosEnBackground(sold, reserved) {
    // Inicializar worker solo una vez
    if (!boletosWorker && typeof Worker !== 'undefined') {
        try {
            boletosWorker = new Worker('js/boletos-processor.worker.js');
            
            boletosWorker.onmessage = function(event) {
                // Limpiar timeout si el worker responde
                if (workerTimeoutId) clearTimeout(workerTimeoutId);
                
                if (event.data.success) {
                    // Worker procesó los datos, guardar en ventana global
                    window.rifaplusSoldNumbers = event.data.soldSet;
                    window.rifaplusReservedNumbers = event.data.reservedSet;
                    console.debug(`✅ Web Worker: ${event.data.totalProcessed} boletos procesados sin bloquear UI`);
                    
                    // Actualizar grid solo los elementos visibles
                    actualizarEstadoBoletosVisibles();
                } else {
                    console.warn('⚠️  Error en Web Worker:', event.data.error);
                    // Fallback: procesar en main thread (lento pero funciona)
                    procesarEnMainThread(sold, reserved);
                }
            };
        } catch (error) {
            console.warn('⚠️  Web Workers no disponibles, procesando en main thread (lento)');
            // Fallback para navegadores sin Web Workers
            procesarEnMainThread(sold, reserved);
        }
    }
    
    // Enviar datos al worker
    if (boletosWorker) {
        try {
            // ⏰ TIMEOUT: Si el worker no responde en 3 segundos, hacer fallback
            workerTimeoutId = setTimeout(() => {
                console.warn('⚠️  Web Worker timeout (3s) - usando main thread como fallback');
                procesarEnMainThread(sold, reserved);
                boletosWorker = null; // Descartar este worker
            }, 3000);
            
            boletosWorker.postMessage({
                action: 'process',
                sold: sold,
                reserved: reserved
            });
        } catch (error) {
            console.warn('⚠️  Error enviando datos a worker:', error.message);
            // Fallback inmediato
            if (workerTimeoutId) clearTimeout(workerTimeoutId);
            procesarEnMainThread(sold, reserved);
        }
    } else {
        // Si Worker no disponible, procesar aqui (pero lentamente)
        procesarEnMainThread(sold, reserved);
    }
}

/**
 * Procesar números en main thread (más lento pero funciona en todos lados)
 * Se usa como fallback cuando Web Worker falla o no está disponible
 */
function procesarEnMainThread(sold, reserved) {
    try {
        console.debug('🔄 Procesando en main thread (fallback)...');
        window.rifaplusSoldNumbers = sold.map(Number);
        window.rifaplusReservedNumbers = reserved.map(Number);
        console.debug(`✅ Main thread: Procesados ${sold.length + reserved.length} boletos`);
    } catch (error) {
        console.error('❌ Error procesando en main thread:', error);
        // Último fallback: arrays vacíos (mejor que nada)
        window.rifaplusSoldNumbers = [];
        window.rifaplusReservedNumbers = [];
    }
}

// Exponer funciones globalmente para que otras páginas/módulos puedan llamarlas
window.cargarBoletosPublicos = cargarBoletosPublicos;
window.actualizarResumenCompra = actualizarResumenCompra;
window.actualizarContadorCarritoGlobal = actualizarContadorCarritoGlobal;
window.controlarEstadoBotonesLoQuiero = controlarEstadoBotonesLoQuiero;

