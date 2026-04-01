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
// ✅ ACTUALIZADO: Verifica promoción por tiempo
function obtenerPrecioDinamico() {
    const cfg = window.rifaplusConfig || {};
    const ahora = new Date();
    const estaActiva = typeof window.rifaplusConfig?.esFechaPromocionActiva === 'function'
        ? window.rifaplusConfig.esFechaPromocionActiva
        : ((inicio, fin, ahoraActual) => {
            const inicioFecha = new Date(inicio);
            const finFecha = new Date(fin);
            return ahoraActual >= inicioFecha && ahoraActual <= finFecha;
        });
    
    // Verificar si hay promoción por tiempo activa
    const promo = cfg.rifa?.promocionPorTiempo;
    if (promo && promo.enabled && promo.precioProvisional !== null && promo.precioProvisional !== undefined) {
        // Si estamos dentro del rango permitido, usar precio provisional
        if (estaActiva(promo.fechaInicio, promo.fechaFin, ahora)) {
            const precioProvisional = Number(promo.precioProvisional);
            if (!Number.isNaN(precioProvisional) && isFinite(precioProvisional) && precioProvisional >= 0) {
                console.log(`💰 [Promoción Activa] Usando precio provisional: $${precioProvisional.toFixed(2)}`);
                return precioProvisional;
            }
        }
    }
    
    // Si no hay promoción activa, usar precio normal
    const price = Number(cfg && cfg.rifa && cfg.rifa.precioBoleto);
    return (!Number.isNaN(price) && isFinite(price) && price > 0) ? price : 0;
}

// Almacenar selecciones globales (persiste al cambiar rangos)
var selectedNumbersGlobal = new Set();

// Guardar estado del filtro de disponibles (persiste al cambiar rangos)
var filtroDisponiblesActivo = false;

// ⚠️ FLAG DE SINCRONIZACIÓN: Indica si los datos de boletos (sold/reserved) están FRESCOS
// Previene race conditions donde el Web Worker aún está procesando
var window_rifaplusBoletosDatosActualizados = false;

// Inicializar arrays de boletos vendidos/apartados (se llenan después desde API)
if (!window.rifaplusSoldNumbers) window.rifaplusSoldNumbers = [];
if (!window.rifaplusReservedNumbers) window.rifaplusReservedNumbers = [];

// 🚀 INICIALIZAR MAQUINA COMO HABILITADA DESDE EL PRINCIPIO
// Permite que funcione incluso si el backend es lento o falla
window.rifaplusBoletosLoaded = true;

/* ============================================================ */
/* INFINITE SCROLL STATE */
/* ============================================================ */
var infiniteScrollState = {
    rangoActual: { inicio: 0, fin: 99 },
    boletosCargados: 0,
    BOLETOS_POR_CARGA: 500,  // ⭐ OPTIMIZACIÓN: Reducido de 1000 a 500 para mejor performance
    isLoading: false,
    hasMore: true,
    observer: null,
    lastRenderTime: 0,  // ⭐ Para debounce
    renderDebounceMs: 300  // ⭐ Debounce render calls
};

var rifaplusEstadoRangoActual = {
    inicio: null,
    fin: null,
    cargado: false,
    requestId: 0,
    endpoint: ''
};

function obtenerApiBaseCompra() {
    let endpoint = (window.rifaplusConfig && window.rifaplusConfig.backend && window.rifaplusConfig.backend.apiBase)
        ? window.rifaplusConfig.backend.apiBase
        : 'http://localhost:3000';
    return String(endpoint).replace(/\/+$/, '');
}

function obtenerRangoVisibleInicial() {
    const totalTickets = window.rifaplusConfig?.rifa?.totalBoletos || 100;
    const oportunidadesConfig = window.rifaplusConfig?.rifa?.oportunidades;

    if (oportunidadesConfig && oportunidadesConfig.enabled && oportunidadesConfig.rango_visible) {
        const inicioVisible = parseInt(oportunidadesConfig.rango_visible.inicio, 10);
        const finVisible = parseInt(oportunidadesConfig.rango_visible.fin, 10);
        return {
            inicio: Number.isInteger(inicioVisible) ? inicioVisible : 0,
            fin: Number.isInteger(finVisible) ? finVisible : Math.max(0, totalTickets - 1)
        };
    }

    return {
        inicio: 0,
        fin: Math.max(0, totalTickets - 1)
    };
}

function obtenerEstadoLocalBoletos() {
    const sold = Array.isArray(window.rifaplusSoldNumbers) ? window.rifaplusSoldNumbers : [];
    const reserved = Array.isArray(window.rifaplusReservedNumbers) ? window.rifaplusReservedNumbers : [];

    return {
        sold,
        reserved,
        soldSet: new Set(sold),
        reservedSet: new Set(reserved)
    };
}

function numeroEnRangoActual(numero) {
    const rango = infiniteScrollState.rangoActual || {};
    return Number.isInteger(numero) &&
        Number.isInteger(rango.inicio) &&
        Number.isInteger(rango.fin) &&
        numero >= rango.inicio &&
        numero <= rango.fin;
}

async function verificarBoletosEnServidor(numeros) {
    const endpoint = obtenerApiBaseCompra();
    const respuesta = await fetch(`${endpoint}/api/boletos/verificar`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ numeros })
    });

    if (!respuesta.ok) {
        throw new Error(`No se pudo verificar disponibilidad (${respuesta.status})`);
    }

    const json = await respuesta.json();
    if (!json?.success) {
        throw new Error(json?.message || 'No se pudo verificar disponibilidad');
    }

    return json;
}

async function verificarEstadoBoletoEnServidor(numero) {
    const resultado = await verificarBoletosEnServidor([numero]);
    const conflictos = Array.isArray(resultado.conflictos) ? resultado.conflictos : [];
    const conflicto = conflictos.find(item => Number(item?.numero) === Number(numero));

    if (conflicto) {
        return {
            vendido: conflicto.estado === 'vendido',
            apartado: conflicto.estado === 'apartado'
        };
    }

    return {
        vendido: false,
        apartado: false
    };
}

async function generarNumerosVerificadosEnServidor(cantidad) {
    const numerosConfirmados = [];
    const numerosDescartados = new Set();
    let reintentos = 0;

    while (numerosConfirmados.length < cantidad && reintentos < 5) {
        const faltantes = cantidad - numerosConfirmados.length;
        const baseDisponibles = obtenerNumerosDisponibles().filter((numero) => {
            return !numerosConfirmados.includes(numero) && !numerosDescartados.has(numero);
        });

        if (baseDisponibles.length < faltantes) {
            console.warn(`⚠️ [Maquina] No hay suficientes candidatos locales (${baseDisponibles.length}) para completar ${faltantes}. Refrescando...`);
            await cargarBoletosPublicos();
        }

        const candidatos = [];
        const disponiblesCopia = [...baseDisponibles];
        const cantidadARobar = Math.min(faltantes, disponiblesCopia.length);

        for (let i = 0; i < cantidadARobar; i++) {
            const randomIndex = Math.floor(Math.random() * disponiblesCopia.length);
            const numero = disponiblesCopia.splice(randomIndex, 1)[0];
            candidatos.push(numero);
        }

        if (candidatos.length === 0) {
            break;
        }

        const verificacion = await verificarBoletosEnServidor(candidatos);
        const disponiblesServidor = Array.isArray(verificacion?.disponibles) ? verificacion.disponibles : [];
        const conflictosServidor = Array.isArray(verificacion?.conflictos) ? verificacion.conflictos : [];

        disponiblesServidor.forEach((numero) => {
            const normalizado = Number(numero);
            if (!Number.isNaN(normalizado) && !numerosConfirmados.includes(normalizado)) {
                numerosConfirmados.push(normalizado);
            }
        });

        conflictosServidor.forEach((conflicto) => {
            const numero = Number(conflicto?.numero);
            if (!Number.isNaN(numero)) {
                numerosDescartados.add(numero);
            }
        });

        if (conflictosServidor.length > 0) {
            console.warn(`⚠️ [Maquina] ${conflictosServidor.length} boleto(s) chocaron con el servidor durante la generación. Reintentando...`);
            await cargarBoletosPublicos();
        }

        reintentos++;
    }

    return numerosConfirmados.slice(0, cantidad);
}

async function cargarEstadoRangoVisibleEnBackground(endpoint, inicio, fin) {
    const rangoInicio = parseInt(inicio, 10);
    const rangoFin = parseInt(fin, 10);

    if (!Number.isInteger(rangoInicio) || !Number.isInteger(rangoFin)) {
        return false;
    }

    if (
        rifaplusEstadoRangoActual.cargado &&
        rifaplusEstadoRangoActual.inicio === rangoInicio &&
        rifaplusEstadoRangoActual.fin === rangoFin &&
        rifaplusEstadoRangoActual.endpoint === endpoint
    ) {
        return true;
    }

    const requestId = ++rifaplusEstadoRangoActual.requestId;
    rifaplusEstadoRangoActual.inicio = rangoInicio;
    rifaplusEstadoRangoActual.fin = rangoFin;
    rifaplusEstadoRangoActual.endpoint = endpoint;
    rifaplusEstadoRangoActual.cargado = false;

    try {
        const respuesta = await fetch(
            `${endpoint}/api/public/boletos?inicio=${encodeURIComponent(rangoInicio)}&fin=${encodeURIComponent(rangoFin)}`,
            {
                cache: 'no-store',
                priority: 'low'
            }
        );

        if (!respuesta.ok) {
            throw new Error(`Rango ${rangoInicio}-${rangoFin}: ${respuesta.status}`);
        }

        const json = await respuesta.json();
        const sold = Array.isArray(json?.data?.sold) ? json.data.sold : [];
        const reserved = Array.isArray(json?.data?.reserved) ? json.data.reserved : [];

        if (requestId !== rifaplusEstadoRangoActual.requestId) {
            return false;
        }

        procesarBoletosEnBackground(sold, reserved);
        rifaplusEstadoRangoActual.cargado = true;
        return true;
    } catch (error) {
        console.warn(`⚠️ Error cargando rango ${rangoInicio}-${rangoFin}:`, error.message);

        if (requestId !== rifaplusEstadoRangoActual.requestId) {
            return false;
        }

        // Evitar bajar la lista completa cuando falla un rango individual.
        // Dejamos que el backoff normal reprograme la carga y preservamos la UX
        // con stats/resumen mientras el endpoint vuelve a responder.
        rifaplusEstadoRangoActual.cargado = false;
        return false;
    }
}

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
         * Calcula el total con descuentos sincronizados
         * @param {number} cantidad - Cantidad de boletos
         * @param {number} precioUnitario - Precio por unidad (opcional)
         * @returns {Object} Datos de cálculo (subtotal, descuento, total)
         */
        calcularDescuento: function(cantidad, precioUnitario = null) {
            return calcularTotalConPromociones(cantidad, precioUnitario);
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
    
    // ✅ LISTENER: Si la configuración se sincroniza desde el backend, reinicializar rangos
    window.addEventListener('configuracionActualizada', function() {
        console.log('🔄 [Compra] Configuración actualizada - reiniciando rangos...');
        inicializarRangoDefault();
    });
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
    
    // ⚠️ Inicializar flag de sincronización
    window.rifaplusBoletosDatosActualizados = false; // Empezar como FALSE para no permitir generación hasta que esté REALMENTE listo
    
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
                // ⭐ CRÍTICO: Si el filtro estaba activado, reaplicarlo cuando carguen los boletos
                if (filtroDisponiblesActivo) {
                    // Esperar a que los elementos '.numero-btn' estén en el DOM
                    const esperar = setInterval(() => {
                        if (document.querySelector('.numero-btn')) {
                            clearInterval(esperar);
                            aplicarFiltroDisponibles(true);
                        }
                    }, 50);
                }
            }
        } catch (error) {
            console.error('Error al restaurar estado del filtro:', error);
        }
    }
    
    inicializarRangoDefault();
    configurarEventListeners();
    
    // ⚡ OPTIMIZACIÓN: NO esperar cargarBoletosPublicos() completo
    // Stage 1 (/stats) es ultra-rápido (< 50ms) y actualiza availability-note instantáneamente
    // Stage 2 (/api/public/boletos) es lento y se ejecuta en background sin bloquear
    // Solo la carga INICIAL necesita esperar un poco para los datos, luego lo demás sigue en background
    startCargarBoletosPublicosConIntentos();
    
    // Inicializar la máquina de suerte (no necesita esperar todo)
    inicializarMaquinaSuerteMejorada();
    
    // La función `cargarBoletosPublicos` se encarga ahora de programar su siguiente ejecución
    // usando setTimeout + backoff para evitar solapamientos que causan 429.
}

/* ============================================================ */
/* SECCIÓN 3.4: INICIO NO-BLOQUEANTE DE CARGA DE BOLETOS         */
/* ============================================================ */

/**
 * Inicia cargarBoletosPublicos() SIN esperar
 * Stage 1 (/stats) se ejecuta en paralelo y actualiza availability-note instantáneamente
 * Stage 2 (background) continúa sin bloquear
 */
function startCargarBoletosPublicosConIntentos() {
    try {
        console.debug('📊 Iniciando carga de boletos...');
        cargarBoletosPublicos().catch(e => {
            console.warn('❌ Error crítico en carga inicial de boletos:', e.message);
        });
    } catch (err) {
        console.error('❌ Error en startCargarBoletosPublicosConIntentos:', err);
    }
    
    // 🗑️  Removido: cargarOportunidadesDisponiblesDelBackend() - sistema antiguo reemplazado
    // Ahora se usa asignación pre-determinada en backend (3 oportunidades por boleto)
}

window.addEventListener('boletosListos', function() {
    if (typeof actualizarEstadoBotonGenerar === 'function') {
        actualizarEstadoBotonGenerar();
    }
    if (typeof actualizarNotaDisponibilidad === 'function') {
        actualizarNotaDisponibilidad();
    }
});

/* ============================================================ */
/* SECCIÓN 3.5: ACTUALIZACIÓN PERIÓDICA - DETECTAR ÓRDENES CANCELADAS */
/* ============================================================ */

/**
 * Inicia timer para actualizar boletos cada 15 segundos
 * Detecta cuándo órdenes han sido canceladas por expiración
 * y libera los boletos en el grid
 * 
 * OPTIMIZACIÓN: Solo recarga /boletos si /stats muestra cambio de disponibles
 */



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
/**
 * Wrapper para /stats con caché local agresivo
 * Reduce llamadas innecesarias al backend
 */


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
        const endpoint = obtenerApiBaseCompra();
        
        console.debug('📊 Cargando stats de disponibilidad...');
        
        // ⚡ STAGE 1: Timing para medir velocidad
        const stageStartTime = performance.now();
        
        // ⚠️ MARCAR DATOS COMO OBSOLETOS al iniciar la carga
        // Esto previene que calcularYLlenarOportunidades use datos viejos
        window.rifaplusBoletosDatosActualizados = false;
        
        try {
            // Fetch de stats desde backend
            const statsResponse = await fetch(`${endpoint}/api/public/boletos/stats`, {
                cache: 'no-store'
            });
            
            const stageElapsed = Math.round(performance.now() - stageStartTime);
            
            if (statsResponse.ok) {
                const statsJson = await statsResponse.json();
                const data = statsJson.data || statsJson;
                console.debug(`✅ /stats respondió en ${stageElapsed}ms`);
                
                if (data) {
                    // Actualizar estado global primero para que el botón use datos frescos
                    if (window.rifaplusConfig && window.rifaplusConfig.estado) {
                        window.rifaplusConfig.estado.boletosVendidos = data.vendidos;
                        window.rifaplusConfig.estado.boletosApartados = data.apartados;
                        window.rifaplusConfig.estado.boletosDisponibles = data.disponibles;
                    }

                    // ⭐ OPTIMIZACIÓN CRÍTICA: Mostrar disponibles INMEDIATAMENTE desde /stats (< 50ms)
                    // No esperar por cálculo de rango - eso se hace en background en Stage 2
                    const availabilityNote = document.getElementById('availabilityNote');
                    if (availabilityNote) {
                        availabilityNote.textContent = `${data.disponibles} boletos disponibles`;
                        availabilityNote.style.display = 'inline-block';
                    }
                    
                    if (typeof actualizarEstadoBotonGenerar === 'function') {
                        actualizarEstadoBotonGenerar();
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
            
            // ⚠️ IMPORTANTE: Marcar como cargado INCLUSO con error
            // Sino, se queda bloqueado esperando forever
            window.rifaplusBoletosLoaded = true;
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
        
        // Cargar solo el rango visible en background
        const rangoInicial = infiniteScrollState.rangoActual || obtenerRangoVisibleInicial();
        cargarDatosCompletosEnBackground(endpoint, rangoInicial);
        
        return true;
        
    } catch (error) {
        console.error('❌ Error en cargarBoletosPublicos:', error);
        window.rifaplusBoletosLoaded = true; // Marcar cargado incluso si falla
        return false;
    }
}

/**
 * Helper: Carga datos completos en background sin bloquear UI
 * Esta función se ejecuta de forma asincrónica, puede tomar tiempo
 */
async function cargarDatosCompletosEnBackground(endpoint, rango = null) {
    try {
        const rangoObjetivo = rango || infiniteScrollState.rangoActual || obtenerRangoVisibleInicial();
        console.debug(`📦 Iniciando carga en background del rango ${rangoObjetivo.inicio}-${rangoObjetivo.fin}...`);

        const exito = await cargarEstadoRangoVisibleEnBackground(endpoint, rangoObjetivo.inicio, rangoObjetivo.fin);

        if (exito) {
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

            const { sold, reserved } = obtenerEstadoLocalBoletos();
            console.debug(`✅ Estado de rango cargado: ${sold.length} vendidos, ${reserved.length} reservados`);

            // ⭐ OPTIMIZACIÓN: En lugar de re-renderizar TODO el grid (que reinicia scroll),
            // solo actualizar los botones visibles con su nuevo estado
            actualizarEstadoBoletosVisibles();
            if (typeof actualizarEstadoBotonGenerar === 'function') {
                actualizarEstadoBotonGenerar();
            }
            if (typeof actualizarNotaDisponibilidad === 'function') {
                actualizarNotaDisponibilidad();
            }
            
            // 🔌 WEBSOCKET ACTIVO: El polling manual ya no es necesario
            // Socket.io emitirá boletosActualizados en tiempo real desde el servidor
            // Cuando haya cambios, ejecutaremos actualizarEstadoBoletosVisibles() automáticamente
            // Si WebSocket falla o se desconecta, socket-handler.js activa fallback a polling
            // DEV NOTE: Mantener este línea comentada para debugging/fallback manual en desarrollo
            // window.rifaplusFetchTimeoutId = setTimeout(cargarBoletosPublicos, 300000); // 5 minutos (DESHABILITADO - WebSocket maneja actualizaciones)
            return true;
        }
        // If data not in expected shape, treat as fail and try later
        window.rifaplusBoletosLoaded = false;
        window.rifaplusBoletosLoading = false;
        window.rifaplusFetchBackoffMs = Math.min((window.rifaplusFetchBackoffMs || 30000) * 2, 300000);
        if (window.rifaplusFetchTimeoutId) clearTimeout(window.rifaplusFetchTimeoutId);
        window.rifaplusFetchTimeoutId = setTimeout(cargarBoletosPublicos, window.rifaplusFetchBackoffMs);
        if (typeof actualizarEstadoBotonGenerar === 'function') actualizarEstadoBotonGenerar();
        // ⭐ OPTIMIZACIÓN: No actualizar availabilityNote aquí - el Web Worker lo hace
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
        // ⭐ OPTIMIZACIÓN: No actualizar availabilityNote aquí - el Web Worker lo hace
        return false;
    }
}

/**
 * ⭐ OPTIMIZACIÓN: Actualizar SOLO los boletos visibles sin limpiar el grid
 * Esto evita que se reinicie el scroll cuando se actualiza el estado de boletos
 * OPTIMIZADO: IntersectionObserver con fallback para Safari (no tiene requestIdleCallback)
 */
function actualizarEstadoBoletosVisibles() {
    // Polyfill para Safari que no tiene requestIdleCallback
    const idleCallback = typeof requestIdleCallback !== 'undefined' ? requestIdleCallback : setTimeout;
    
    idleCallback(() => {
        const grid = document.getElementById('numerosGrid');
        if (!grid) {
            console.warn('⚠️  Grid no encontrado para actualizar');
            return;
        }
        
        const { soldSet, reservedSet } = obtenerEstadoLocalBoletos();
        
        console.debug(`🎨 [actualizarEstadoBoletosVisibles] Actualizando colores: ${soldSet.size} vendidos, ${reservedSet.size} apartados`);
        
        // Detectar Safari (iOS, macOS, iPad OS) - IntersectionObserver tiene bug en Safari
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome|Edge|Firefox/.test(navigator.userAgent);
        
        // 🚀 OPTIMIZACIÓN: En Safari (cualquier plataforma), actualizar TODOS los botones directamente
        // En otros navegadores, usar IntersectionObserver (más eficiente)
        if (isSafari) {
            console.debug('🍎 Safari detectado: actualizando todos los boletos directamente');
            // Actualizar todos los botones sin IntersectionObserver
            const botones = grid.querySelectorAll('button[data-numero]');
            let actualizados = 0;
            
            botones.forEach(btn => {
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
                    actualizados++;
                } else if (reservedSet.has(numero)) {
                    btn.classList.add('reserved');
                    btn.disabled = true;
                    btn.title = 'Apartado';
                    actualizados++;
                }
            });
            
            console.debug(`✅ Safari: ${actualizados}/${botones.length} boletos actualizados`);
            if (filtroDisponiblesActivo) {
                aplicarFiltroDisponibles(true);
            }
            return; // No continuar con IntersectionObserver
        }
        
        // 🚀 OPTIMIZACIÓN: Usar IntersectionObserver para solo actualizar lo visible
        const botones = grid.querySelectorAll('button[data-numero]');
        console.debug(`🔍 Observando ${botones.length} botones con IntersectionObserver`);
        
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

            if (filtroDisponiblesActivo) {
                aplicarFiltroDisponibles(true);
            }
        }, { 
            root: grid,
            rootMargin: '100px', // Precarga 100px antes de ser visible
            threshold: 0.1 
        });
        
        // Observar todos los botones
        botones.forEach(btn => observer.observe(btn));
        console.debug(`✅ Observadores de IntersectionObserver registrados`);
    }); // Usar solo el callback, sin opciones (Safari compatible)
}

function inicializarMaquinaSuerteMejorada() {
    
    const btnGenerar = document.getElementById('btnGenerarNumeros');
    const btnDisminuir = document.getElementById('disminuirCantidad');
    const btnAumentar = document.getElementById('aumentarCantidad');
    const inputCantidad = document.getElementById('cantidadNumeros');
    const btnRepetir = document.getElementById('btnRepetir');
    const btnAgregarSuerte = document.getElementById('btnAgregarSuerte');
    
    console.log('🎰 Inicializando máquina de suerte...');
    console.log('   ✓ btnGenerar:', !!btnGenerar);
    console.log('   ✓ inputCantidad:', !!inputCantidad);
    console.log('   ✓ rifaplusBoletosLoaded:', window.rifaplusBoletosLoaded);

    actualizarLimiteMaquinaSuerteUI();
    
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
            const maxTickets = obtenerMaximoPermitidoMaquinaSuerte();
            if (cantidad < maxTickets) {
                inputCantidad.value = cantidad + 1;
                actualizarTotalMaquina();
                actualizarEstadoBotonGenerar();
            }
        });
        
        inputCantidad.addEventListener('change', function() {
            this.value = normalizarCantidadMaquinaSuerte(this.value);
            actualizarTotalMaquina();
            actualizarEstadoBotonGenerar();
        });

        // Input sanitization: allow only integers, clamp range, update total and button state live
        inputCantidad.addEventListener('input', function() {
            let raw = this.value;
            // Convert to integer, stripping non-digit characters
            let parsed = parseInt(raw, 10);
            if (isNaN(parsed) || parsed < 0) parsed = 0;
            const maxTickets = obtenerMaximoPermitidoMaquinaSuerte();
            if (parsed > maxTickets) parsed = maxTickets;
            if (String(parsed) !== raw) {
                // Update only if different to avoid cursor jump in some browsers
                this.value = parsed;
            }
            actualizarTotalMaquina();
            actualizarEstadoBotonGenerar();
            console.log(`⌨️ Entrada de cantidad: ${parsed}`);
        });
        
        // Limpiar el 0 cuando el usuario hace focus en el input
        inputCantidad.addEventListener('focus', function() {
            if (this.value === '0') {
                this.value = '';
            }
        });
        
        // Restaurar el 0 si sale vacío
        inputCantidad.addEventListener('blur', function() {
            if (this.value === '' || parseInt(this.value) === 0) {
                this.value = '0';
                actualizarTotalMaquina();
                actualizarEstadoBotonGenerar();
            }
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
    console.log('✅ Máquina de suerte inicializada correctamente');
    // Actualizar nota de disponibilidad inicialmente
    if (typeof actualizarNotaDisponibilidad === 'function') actualizarNotaDisponibilidad();

    if (!inicializarMaquinaSuerteMejorada._listenerRegistrado) {
        window.addEventListener('configuracionActualizada', actualizarLimiteMaquinaSuerteUI);
        window.addEventListener('configSyncCompleto', actualizarLimiteMaquinaSuerteUI);
        inicializarMaquinaSuerteMejorada._listenerRegistrado = true;
    }
}

function obtenerTamanoRangoVisibleCompra() {
    const totalTickets = Number(window.rifaplusConfig?.rifa?.totalBoletos) || 0;
    const oportunidadesConfig = window.rifaplusConfig?.rifa?.oportunidades;

    if (oportunidadesConfig?.enabled && oportunidadesConfig?.rango_visible) {
        const inicio = Number(oportunidadesConfig.rango_visible.inicio);
        const fin = Number(oportunidadesConfig.rango_visible.fin);
        if (Number.isFinite(inicio) && Number.isFinite(fin) && fin >= inicio) {
            return (fin - inicio) + 1;
        }
    }

    return Math.max(0, totalTickets);
}

function obtenerLimiteConfiguradoMaquinaSuerte() {
    const limite = Number(window.rifaplusConfig?.rifa?.maquinaSuerte?.limiteBoletos);
    return Number.isFinite(limite) && limite > 0 ? Math.floor(limite) : 500;
}

function obtenerMaximoPermitidoMaquinaSuerte() {
    const limiteConfigurado = obtenerLimiteConfiguradoMaquinaSuerte();
    const tamanoRangoVisible = obtenerTamanoRangoVisibleCompra();
    if (tamanoRangoVisible <= 0) return limiteConfigurado;
    return Math.min(limiteConfigurado, tamanoRangoVisible);
}

function normalizarCantidadMaquinaSuerte(valor, permitirCero = true) {
    let cantidad = parseInt(valor, 10);
    if (isNaN(cantidad) || cantidad < 0) cantidad = 0;
    const maximo = obtenerMaximoPermitidoMaquinaSuerte();
    if (cantidad > maximo) cantidad = maximo;
    if (!permitirCero && cantidad < 1) cantidad = 1;
    return cantidad;
}

function actualizarLimiteMaquinaSuerteUI() {
    const inputCantidad = document.getElementById('cantidadNumeros');
    const hint = document.getElementById('maquinaLimiteHint');
    const maximo = obtenerMaximoPermitidoMaquinaSuerte();
    const limiteConfigurado = obtenerLimiteConfiguradoMaquinaSuerte();
    const tamanoRangoVisible = obtenerTamanoRangoVisibleCompra();

    if (inputCantidad) {
        inputCantidad.max = String(maximo);
        inputCantidad.placeholder = maximo > 0 ? `0 - ${maximo}` : '0';
        inputCantidad.value = String(normalizarCantidadMaquinaSuerte(inputCantidad.value));
    }

    if (hint) {
        if (tamanoRangoVisible > 0 && maximo < limiteConfigurado) {
            hint.textContent = `Puedes generar hasta ${maximo} boletos por ronda. El límite se ajustó al rango comprable actual.`;
        } else {
            hint.textContent = `Puedes generar hasta ${maximo} boletos por ronda.`;
        }
    }

    actualizarTotalMaquina();
    actualizarEstadoBotonGenerar();
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

    const maximoPermitido = obtenerMaximoPermitidoMaquinaSuerte();
    if (val > maximoPermitido) {
        btnGenerar.disabled = true;
        return;
    }
    
    // 🚀 SIMPLE Y ESTABLE: rifaplusBoletosLoaded está ahora true por defecto
    // Funciona incluso si el backend es lento o falla
    const loaded = !!window.rifaplusBoletosLoaded;
    
    // Si hay datos del servidor, usar conteo real
    // Si no, asumir suficientes boletos disponibles
    const totalBoletosFallback = typeof window.rifaplusConfig?.obtenerTotalBoletos === 'function'
        ? window.rifaplusConfig.obtenerTotalBoletos()
        : Number(window.rifaplusConfig?.rifa?.totalBoletos || 0);
    const boletosDisponibles = (window.rifaplusConfig &&
                               window.rifaplusConfig.estado &&
                               window.rifaplusConfig.estado.boletosDisponibles !== undefined)
                              ? window.rifaplusConfig.estado.boletosDisponibles
                              : Math.max(0, totalBoletosFallback); // Fallback dinámico, no hardcodeado
    
    const hay_suficientes = boletosDisponibles >= val;
    
    // ⭐ SIMPLE: Si hay datos cargados y suficientes → HABILITAR
    btnGenerar.disabled = !loaded || !hay_suficientes;
    console.debug(`🎰 Estado botón generar: ${btnGenerar.disabled ? '❌ DESHABILITADO' : '✅ HABILITADO'} (cantidad=${val}, disponibles=${boletosDisponibles}, loaded=${loaded})`);
}

// Mostrar nota de disponibilidad bajo el botón Generar
function actualizarNotaDisponibilidad() {
    const note = document.getElementById('availabilityNote');
    if (!note) return;
    
    // ⭐ OPTIMIZACIÓN: Actualizar con datos reales SOLO si están disponibles
    // Si estamos cargando o los datos son incompletos, NO CAMBIAR el valor actual
    if (window.rifaplusBoletosLoaded) {
        const { sold, reserved } = obtenerEstadoLocalBoletos();
        
        // 🔴 CRÍTICO: Si NO tenemos datos de boletos aún (arrays vacíos), NO actualizar
        // Dejar que Season 1 (/stats) haya puesto el valor correcto
        if (sold.length === 0 && reserved.length === 0 && !rifaplusEstadoRangoActual.cargado) {
            // Arrays vacíos = datos aún no disponibles, NO sobrescribir
            return;
        }
        
        // Obtener configuración del rango visible si oportunidades están habilitadas
        const oportunidadesConfig = window.rifaplusConfig && window.rifaplusConfig.rifa && window.rifaplusConfig.rifa.oportunidades;
        let disponiblesActual = 0;
        
        if (oportunidadesConfig && oportunidadesConfig.enabled && oportunidadesConfig.rango_visible) {
            // Calcular para el rango visible
            const rangoVisible = oportunidadesConfig.rango_visible;
            const tamanoRango = (rangoVisible.fin - rangoVisible.inicio) + 1;
            let vendidosEnRango = 0;
            let apartadosEnRango = 0;
            
            sold.forEach(num => {
                if (num >= rangoVisible.inicio && num <= rangoVisible.fin) {
                    vendidosEnRango++;
                }
            });
            
            reserved.forEach(num => {
                if (num >= rangoVisible.inicio && num <= rangoVisible.fin) {
                    apartadosEnRango++;
                }
            });
            
            disponiblesActual = Math.max(0, tamanoRango - vendidosEnRango - apartadosEnRango);
        } else if (rifaplusEstadoRangoActual.cargado) {
            const rangoActual = infiniteScrollState.rangoActual || obtenerRangoVisibleInicial();
            const tamanoRango = (rangoActual.fin - rangoActual.inicio) + 1;
            disponiblesActual = Math.max(0, tamanoRango - sold.length - reserved.length);
        } else {
            const disponibles = obtenerNumerosDisponibles();
            disponiblesActual = Array.isArray(disponibles) ? disponibles.length : 0;
        }
        
        note.textContent = `${disponiblesActual} boletos disponibles`;
        note.style.display = 'inline-block';
        return;
    }
    
    if (note.textContent && note.textContent.includes('boletos disponibles') && !note.textContent.includes('Cargando')) {
        // Ya tenemos un valor, no cambiar
        return;
    }
    
    if (!window.rifaplusBoletosLoaded) {
        note.textContent = 'Cargando disponibilidad...';
        note.style.display = 'inline-block';
        return;
    }
}

async function generarNumerosAleatoriosMejorado() {
    const inputCantidad = document.getElementById('cantidadNumeros');
    const numerosSuerte = document.getElementById('numerosSuerte');
    const resultado = document.getElementById('maquinaResultado');
    const btnGenerar = document.getElementById('btnGenerarNumeros');
    
    if (!inputCantidad || !numerosSuerte || !resultado) {
        console.error('❌ Elementos de máquina de la suerte no encontrados');
        rifaplusUtils.showFeedback('⚠️ Error: No se encontraron los elementos de la máquina', 'error');
        return;
    }
    
    const cantidad = parseInt(inputCantidad.value, 10);
    const maximoPermitido = obtenerMaximoPermitidoMaquinaSuerte();
    if (isNaN(cantidad) || cantidad < 1) {
        rifaplusUtils.showFeedback('⚠️ Selecciona al menos 1 número para generar.', 'warning');
        return;
    }
    if (cantidad > maximoPermitido) {
        inputCantidad.value = String(maximoPermitido);
        actualizarTotalMaquina();
        actualizarEstadoBotonGenerar();
        rifaplusUtils.showFeedback(`⚠️ La máquina de la suerte permite generar hasta ${maximoPermitido} boletos por intento.`, 'warning');
        return;
    }
    
    // Mostrar estado de carga
    if (btnGenerar) {
        btnGenerar.disabled = true;
        btnGenerar.textContent = '⏳ Generando…';
    }
    
    try {
        // Esperar a que se carguen los datos de boletos si no están listos
        if (!window.rifaplusBoletosLoaded) {
            console.log('⏳ Esperando datos de boletos...');
            await cargarBoletosPublicos();
        }
        
        // Obtener números disponibles
        const numerosDisponibles = obtenerNumerosDisponibles();
        
        if (numerosDisponibles.length === 0) {
            rifaplusUtils.showFeedback('❌ No hay números disponibles en este momento. Recargando datos...', 'error');
            await cargarBoletosPublicos();
            rifaplusUtils.showFeedback('Intenta de nuevo.', 'info');
            return;
        }
        
        if (numerosDisponibles.length < cantidad) {
            rifaplusUtils.showFeedback(`⚠️ Solo hay ${numerosDisponibles.length} números disponibles. No puedes generar ${cantidad} números.`, 'warning');
            return;
        }
        
        // Generar números aleatorios y validarlos contra el backend antes de mostrarlos
        const numerosGenerados = await generarNumerosVerificadosEnServidor(cantidad);

        if (numerosGenerados.length < cantidad) {
            await cargarBoletosPublicos();
            rifaplusUtils.showFeedback(`⚠️ Solo se pudieron validar ${numerosGenerados.length} de ${cantidad} boletos en este momento. Intenta de nuevo.`, 'warning');
            return;
        }
        
        // Renderizar números
        numerosSuerte.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        numerosGenerados.forEach(numero => {
            const chip = document.createElement('div');
            chip.className = 'numero-chip';
            // Mostrar formateado (con ceros a la izquierda)
            const numeroFormateado = window.rifaplusConfig.formatearNumeroBoleto(numero);
            chip.textContent = numeroFormateado;
            chip.setAttribute('data-numero', numero);
            fragment.appendChild(chip);
        });
        
        numerosSuerte.appendChild(fragment);
        numerosSuerte.setAttribute('data-numeros', numerosGenerados.join(','));
        
        // Mostrar resultado
        resultado.style.display = 'block';
        resultado.style.visibility = 'visible';
        resultado.style.opacity = '1';
        resultado.style.transition = 'opacity 300ms ease-out, visibility 300ms ease-out';
        console.log('✅ Números generados:', numerosGenerados);
        
        // Scroll suave hacia la sección de resultados (corto)
        setTimeout(() => {
            resultado.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
        
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
        
    } catch (error) {
        console.error('❌ Error al generar números:', error);
        rifaplusUtils.showFeedback(`❌ Error: ${error.message}`, 'error');
    } finally {
        // Restaurar botón
        if (btnGenerar) {
            btnGenerar.textContent = 'GENERAR NÚMEROS';
            if (typeof actualizarEstadoBotonGenerar === 'function') {
                actualizarEstadoBotonGenerar();
            }
        }
    }
}

function obtenerNumerosDisponibles() {
    // Obtener total de boletos DIRECTAMENTE de config.js
    const totalTickets = window.rifaplusConfig.rifa.totalBoletos;
    
    // Obtener rango visible (si oportunidades está habilitada)
    const oportunidadesConfig = window.rifaplusConfig.rifa.oportunidades;
    let rangoVisible = { inicio: 0, fin: totalTickets - 1 };
    
    if (oportunidadesConfig && oportunidadesConfig.enabled && oportunidadesConfig.rango_visible) {
        rangoVisible = oportunidadesConfig.rango_visible;
    }
    
    // Obtener arrays de boletos vendidos/apartados del servidor
    const { sold, reserved } = obtenerEstadoLocalBoletos();
    
    // ⏳ REQUISITO PRINCIPAL: SIEMPRE esperar a que el servidor envíe datos reales
    // Si arrays están vacíos, significa que Stage 2 aun no terminó o falló
    // NO generar números sin validation real del servidor
    if (sold.length === 0 && reserved.length === 0 && !rifaplusEstadoRangoActual.cargado) {
        console.debug('🔄 [obtenerNumerosDisponibles] Esperando datos del servidor...');
        return []; // Retornar vacío hasta tener datos reales
    }
    
    // Crear un conjunto de todos los números VISIBLES (rango_visible.inicio a rango_visible.fin)
    const todosLosNumeros = new Set();
    for (let i = rangoVisible.inicio; i <= rangoVisible.fin; i++) {
        todosLosNumeros.add(i);
    }
    
    // Eliminar números que están vendidos/apartados (datos reales del servidor)
    sold.forEach(n => {
        const nn = Number(n);
        if (!Number.isNaN(nn)) todosLosNumeros.delete(nn);
    });
    reserved.forEach(n => {
        const nn = Number(n);
        if (!Number.isNaN(nn)) todosLosNumeros.delete(nn);
    });
    
    // Eliminar números ya seleccionados en el carrito de esta sesión
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
    const { sold, reserved } = obtenerEstadoLocalBoletos();
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
    
    // Calcular el tiempo máximo de animaciones
    let tiempoMaximoAnimacion = 0;
    
    // Animaciones según cantidad
    boletos_para_agregar.forEach((numero, index) => {
        if (numeros.length <= 5) {
            // Pocos boletos: animar todos con cascada
            tiempoMaximoAnimacion = Math.max(tiempoMaximoAnimacion, index * 150 + 600);
            setTimeout(() => {
                animarAgregarAlCarrito(null, numero, false);
            }, index * 150);
        } else if (numeros.length <= 50) {
            // Cantidad media: animar cada 5 boletos
            if (index % 5 === 0) {
                tiempoMaximoAnimacion = Math.max(tiempoMaximoAnimacion, 600);
                animarAgregarAlCarrito(null, numero, false);
            }
        }
        // Para >50, no animar individuales - solo una animación final
    });
    
    // Mostrar resultado solo si se agregaron números
    if (agregados > 0) {
        // Actualizar UI UNA SOLA VEZ (antes lo hacía múltiples veces)
        actualizarResumenCompraConDebounce();
        actualizarVistaCarritoGlobal();
        actualizarContadorCarritoGlobal();
        
        // Si son muchos boletos, animar carrito una sola vez
        let delayFinal = tiempoMaximoAnimacion;
        if (numeros.length > 50) {
            setTimeout(() => {
                animarAgregarAlCarrito(null, 0, false);
            }, 50);
            delayFinal = Math.max(tiempoMaximoAnimacion, 600);
        }
        
        // 🎯 IMPORTANTE: Ocultar la máquina de suerte DESPUÉS de que terminen las animaciones
        // Esto asegura que los elementos origen de las animaciones sigan siendo accesibles
        setTimeout(() => {
            const resultado = document.getElementById('maquinaResultado');
            if (resultado) {
                resultado.style.opacity = '0';
                resultado.style.visibility = 'hidden';
                resultado.style.transition = 'opacity 220ms ease-out, visibility 220ms ease-out';
                setTimeout(() => {
                    resultado.style.display = 'none';
                }, 220);
            }
            rifaplusUtils.showFeedback(`✅ Se agregaron ${agregados} boletos al carrito`, 'success');
        }, delayFinal + 100);
    } else {
        rifaplusUtils.showFeedback('⚠️ No se pudieron agregar los números. Puede que ya estén seleccionados o no estén disponibles.', 'warning');
    }
}

/**
 * actualizarEstadoBtnComprar - Actualiza estado visual del botón según carga de oportunidades
 * Se llama desde cargarOportunidadesDelCarrito() para deshabilitar/habilitar botón
 * @returns {void}
 */
function actualizarEstadoBtnComprar() {
    const btnComprar = document.getElementById('btnComprar');
    if (!btnComprar) return;
    
    const estadoCarga = window.rifaplusOportunidadesEstadoCarga;
    const estaCargando = estadoCarga?.iniciado && !estadoCarga?.completado;
    
    if (estaCargando) {
        // Deshabilitar botón mientras se cargan oportunidades
        btnComprar.disabled = true;
        btnComprar.classList.add('disabled');
        const progreso = estadoCarga.cargadas || 0;
        const total = estadoCarga.total || 0;
        const porcentaje = total > 0 ? Math.round((progreso / total) * 100) : 0;
        btnComprar.textContent = `⏳ Cargando... (${porcentaje}%)`;
        btnComprar.title = `Cargando oportunidades: ${progreso}/${total}`;
        console.log(`[UI] Botón deshabilitado - Cargando: ${progreso}/${total}`);
    } else {
        // Rehabilitar botón cuando termina la carga
        btnComprar.disabled = false;
        btnComprar.classList.remove('disabled');
        btnComprar.textContent = 'Confirmar compra';
        btnComprar.title = 'Hacer compra';
        console.log(`[UI] Botón habilitado`);
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
    
    // 3. BOTÓN LIMPIAR ✅ MEJORADO: Usar delegación si no existe aún
    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', limpiarSeleccion);
        console.log('✓ btnLimpiar event listener configurado');
    } else {
        // Fallback: Usar delegación de eventos para cuando el botón se agregue dinámicamente
        document.addEventListener('click', function(e) {
            if (e.target.id === 'btnLimpiar') {
                limpiarSeleccion();
            }
        });
    }
    
    // 4. BOTÓN COMPRAR ✅ MEJORADO: Usar delegación si no existe aún
    if (btnComprar) {
        btnComprar.addEventListener('click', function() {
            const seleccionados = selectedNumbersGlobal.size;
            if (seleccionados > 0) {
                iniciarFlujoPago();
            } else {
                rifaplusUtils.showFeedback('⚠️ Primero selecciona al menos un boleto', 'warning');
            }
        });
        console.log('✓ btnComprar event listener configurado');
    } else {
        // Fallback: Usar delegación de eventos para cuando el botón se agregue dinámicamente
        document.addEventListener('click', function(e) {
            if (e.target.id === 'btnComprar') {
                const seleccionados = selectedNumbersGlobal.size;
                if (seleccionados > 0) {
                    iniciarFlujoPago();
                } else {
                    rifaplusUtils.showFeedback('⚠️ Primero selecciona al menos un boleto', 'warning');
                }
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

async function manejarClickNumero(boton) {
    const numero = parseInt(boton.getAttribute('data-numero'), 10);
    
    if (boton.classList.contains('selected')) {
        // DESELECCIONAR: quitar de Set, localStorage y actualizar vistas
        console.log(`🔍 Deseleccionando boleto #${numero}`);
        
        // ⚡ Versión defensiva - usa función si está disponible, sino usa API global
        if (typeof removerBoletoSeleccionado === 'function') {
            removerBoletoSeleccionado(numero);
        } else if (typeof window.removerBoletoSeleccionado === 'function') {
            window.removerBoletoSeleccionado(numero);
        } else {
            console.error('❌ Function removerBoletoSeleccionado not available');
        }
    } else {
        // SELECCIONAR: validar disponibilidad y agregar
        console.log(`🔍 Seleccionando boleto #${numero}`);
        const seAgrego = await agregarBoletoDirectoCarrito(numero);
        
        // Animar si se agregó exitosamente
        if (seAgrego && selectedNumbersGlobal.has(numero)) {
            boton.classList.add('selected');
            // Mostrar efecto en el carrito sin modificar el botón
            animarAgregarAlCarrito(null, numero, false);
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
    
    // 🔍 DEBUG MASIVO
    console.log('%c📊 [actualizarResumenCompra] INICIANDO', 'color: #FF6B6B; font-weight: bold; font-size: 14px');
    console.log('  ✓ Cantidad de boletos:', cantidad);
    console.log('  ✓ Boletos seleccionados:', Array.from(selectedNumbersGlobal));
    console.log('  ✓ window.rifaplusSoldNumbers:', window.rifaplusSoldNumbers?.length || 0, window.rifaplusSoldNumbers);
    console.log('  ✓ window.rifaplusReservedNumbers:', window.rifaplusReservedNumbers?.length || 0, window.rifaplusReservedNumbers);
    console.log('  ✓ OportunidadesService disponible:', !!window.OportunidadesService);
    console.log('  ✓ Oportunidades enabled:', window.rifaplusConfig?.rifa?.oportunidades?.enabled);
    console.log('  ✓ Config oportunidades:', window.rifaplusConfig?.rifa?.oportunidades);
    
    cantidadBoletos.textContent = cantidad;
    
    if (numerosSeleccionados) {
        if (cantidad > 0) {
            // Ordenar números seleccionados para visualización
            const numerosOrdenados = Array.from(selectedNumbersGlobal).sort((a, b) => a - b);
            
            console.log('  ✓ Números ordenados:', numerosOrdenados);
            
            // ✅ NOTA: Las oportunidades ya NO se calculan en cliente
            // Con el nuevo sistema pre-asignado:
            // - Las oportunidades vienen de la BD en POST /api/ordenes
            // - Se actualizan automáticamente via FK CASCADE
            // - El cliente solo las recupera en GET /api/oportunidades/{numero_orden} si necesita mostrarlas
            // No hay necesidad de calcular nada aquí
            
            let oportunidadesPorBoleto = {};
            
            // Obtener total de boletos para calcular el padding dinámico
            const totalTickets = window.rifaplusConfig.rifa.totalBoletos;
            const digitosMaximos = String(totalTickets - 1).length;
            
            // Renderizar boletos SIN oportunidades
            numerosSeleccionados.innerHTML = `
                <div class="lista-numeros">
                    ${numerosOrdenados.map(num => {
                        const numeroFormateado = num.toString().padStart(digitosMaximos, '0');
                        return `
                        <div class="numero-chip-container" data-numero="${num}">
                            <span class="numero-chip" data-numero="${num}">
                                ${numeroFormateado}
                                <button class="numero-chip-delete" data-numero="${num}" aria-label="Eliminar boleto ${numeroFormateado}" title="Eliminar boleto ${numeroFormateado}">
                                    ×
                                </button>
                            </span>
                        </div>
                    `;
                    }).join('')}
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
    const instruccionRango = document.querySelector('.instruccion-rango');
    
    if (!rangoBoxes) {
        console.error('❌ ERROR: No se encontró elemento rangoBoxes');
        return false;
    }
    
    // Limpiar botones previos
    rangoBoxes.innerHTML = '';
    
    // SOLO usar rangos de config.js (sin fallback)
    const rangos = (window.rifaplusConfig?.rifa?.rangos || []).filter(rango =>
        Number.isInteger(parseInt(rango?.inicio, 10)) &&
        Number.isInteger(parseInt(rango?.fin, 10))
    );
    
    if (rangos.length === 0) {
        console.warn('⏳ Rangos no disponibles todavía (sincronización en progreso...)');
        return false;  // Retornar FALSE indica que no se pudo generar
    }

    const mostrarSelectorRangos = rangos.length > 1;
    rangoBoxes.style.display = mostrarSelectorRangos ? 'flex' : 'none';
    if (instruccionRango) {
        instruccionRango.style.display = mostrarSelectorRangos ? 'block' : 'none';
    }

    if (!mostrarSelectorRangos) {
        console.log('ℹ️ Solo hay un rango configurado; se oculta el selector de rangos');
        return true;
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
    
    console.log(`✅ Botones de rango generados: ${rangos.length} rangos`);
    return true;  // Éxito
}

function inicializarRangoDefault() {
    // Generar botones de rango desde config.js
    const exitoGen = generarBotonesRango();
    
    // Si falla (rangos no disponibles), reintenta en 500ms
    if (!exitoGen) {
        console.log('⏳ Esperando rangos... reintentar en 500ms');
        setTimeout(inicializarRangoDefault, 500);
        return;
    }
    
    // Usar SIEMPRE el primer rango de config.js
    const primerRango = (window.rifaplusConfig?.rifa?.rangos || []).find(rango =>
        Number.isInteger(parseInt(rango?.inicio, 10)) &&
        Number.isInteger(parseInt(rango?.fin, 10))
    );
    
    if (!primerRango) {
        console.warn('⏳ Primer rango no disponible todavía...');
        setTimeout(inicializarRangoDefault, 500);
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
    rifaplusEstadoRangoActual.cargado = false;
    
    // OPTIMIZACIÓN: Remover animaciones CSS mientras se renderiza
    grid.style.pointerEvents = 'none';
    grid.style.opacity = '1';
    
    // Limpiar con innerHTML (más rápido que removeChild)
    grid.innerHTML = '';

    const endpoint = obtenerApiBaseCompra();
    cargarDatosCompletosEnBackground(endpoint, { inicio, fin });

    // Asegurar que inicio <= fin y que ambos sean enteros
    inicio = parseInt(inicio, 10) || 0;  // DEFAULT: 0 instead of 1
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
    const { soldSet, reservedSet } = obtenerEstadoLocalBoletos();

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

        // Formatear número con ceros a la izquierda (ej: 000123)
        const numeroFormateado = window.rifaplusConfig?.formatearNumeroBoleto ? 
            window.rifaplusConfig.formatearNumeroBoleto(i) : 
            String(i).padStart(6, '0');
        
        html += `<button class="${classes}" data-numero="${i}" ${disabled ? 'disabled' : ''} ${title ? `title="${title}"` : ''}>${numeroFormateado}</button>`;
        
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
    const feedbackEl = document.getElementById('busquedaFeedback');
    const resultadosDiv = document.getElementById('busquedaResultados');
    const resultadosList = document.getElementById('resultadosList');
    const rangoInicio = document.getElementById('rangoInicio');
    const rangoTotal = document.getElementById('rangoTotal');

    if (!inputBusqueda || !btnBuscar) return;

    function obtenerRangoBusquedaActual() {
        const inicio = typeof window.rifaplusConfig?.obtenerRangoMinimoBoletos === 'function'
            ? window.rifaplusConfig.obtenerRangoMinimoBoletos()
            : 0;
        const fin = typeof window.rifaplusConfig?.obtenerRangoMaximoBoletos === 'function'
            ? window.rifaplusConfig.obtenerRangoMaximoBoletos()
            : (window.rifaplusConfig?.rifa?.totalBoletos || 0);

        return {
            inicio: Number.isFinite(inicio) && inicio >= 0 ? inicio : 0,
            fin: Number.isFinite(fin) && fin > 0 ? fin : 0
        };
    }

    function actualizarRangoBusquedaEnUI() {
        const rango = obtenerRangoBusquedaActual();

        if (rangoInicio) rangoInicio.textContent = rango.inicio.toLocaleString();
        if (rangoTotal) rangoTotal.textContent = rango.fin.toLocaleString();

        inputBusqueda.min = String(rango.inicio);
        inputBusqueda.max = String(rango.fin);
        inputBusqueda.placeholder = `Ej. ${rango.inicio}`;
    }

    function limpiarFeedbackBusqueda() {
        if (!feedbackEl) return;
        feedbackEl.textContent = '';
        feedbackEl.classList.remove('is-visible', 'is-warning', 'is-info');
    }

    function mostrarFeedbackBusqueda(mensaje, tipo = 'info') {
        if (!feedbackEl) return;
        feedbackEl.textContent = mensaje;
        feedbackEl.classList.remove('is-warning', 'is-info');
        feedbackEl.classList.add('is-visible', `is-${tipo}`);
    }

    actualizarRangoBusquedaEnUI();

    // Ejecutar búsqueda al hacer click en botón
    btnBuscar.addEventListener('click', ejecutarBusqueda);

    // Ejecutar búsqueda al presionar Enter
    inputBusqueda.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            ejecutarBusqueda();
        }
    });

    inputBusqueda.addEventListener('input', function() {
        const valor = this.value.trim();
        const rango = obtenerRangoBusquedaActual();

        if (!valor) {
            limpiarFeedbackBusqueda();
            return;
        }

        const numero = parseInt(valor, 10);
        if (!Number.isNaN(numero) && (numero < rango.inicio || numero > rango.fin)) {
            mostrarFeedbackBusqueda(`Ese boleto no se puede buscar. El rango disponible actualmente va de ${rango.inicio.toLocaleString()} a ${rango.fin.toLocaleString()}.`, 'warning');
        } else {
            limpiarFeedbackBusqueda();
        }
    });

    async function ejecutarBusqueda() {
        const rango = obtenerRangoBusquedaActual();
        const valor = inputBusqueda.value.trim();
        
        if (!valor) {
            mostrarFeedbackBusqueda('Escribe un numero de boleto dentro del rango disponible para poder buscarlo.', 'info');
            rifaplusUtils.showFeedback('⚠️ Ingresa un número para buscar', 'warning');
            return;
        }

        const numero = parseInt(valor, 10);

        if (isNaN(numero) || numero < rango.inicio || numero > rango.fin) {
            mostrarFeedbackBusqueda(`Ese boleto esta fuera del rango disponible. Puedes buscar del ${rango.inicio.toLocaleString()} al ${rango.fin.toLocaleString()}.`, 'warning');
            rifaplusUtils.showFeedback(`⚠️ Ingresa un número válido entre ${rango.inicio.toLocaleString()} y ${rango.fin.toLocaleString()}`, 'warning');
            resultadosDiv.style.display = 'none';
            return;
        }

        limpiarFeedbackBusqueda();

        const selectedNumbers = obtenerBoletosSelecionados();
        let estaVendido = false;
        let estaApartado = false;

        try {
            if (numeroEnRangoActual(numero) && rifaplusEstadoRangoActual.cargado) {
                const { soldSet, reservedSet } = obtenerEstadoLocalBoletos();
                estaVendido = soldSet.has(numero);
                estaApartado = reservedSet.has(numero);
            } else {
                const estadoServidor = await verificarEstadoBoletoEnServidor(numero);
                estaVendido = estadoServidor.vendido;
                estaApartado = estadoServidor.apartado;
            }
        } catch (error) {
            console.warn('⚠️ Error verificando boleto en búsqueda:', error.message);
            rifaplusUtils.showFeedback('⚠️ No se pudo verificar el estado del boleto. Intenta de nuevo.', 'warning');
            return;
        }

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
            actionButton = `<button class="btn btn-lo-quiero" data-numero="${numero}">Lo quiero</button>`;
        }

        const resultadoHtml = `
            <div class="resultado-item resultado-item--${statusClass}">
                <div class="resultado-copy">
                    <span class="resultado-numero">Boleto #${numero}</span>
                    <span class="resultado-estado">Estado: <strong class="resultado-badge resultado-badge--${statusClass}">${statusText}</strong></span>
                </div>
                ${actionButton}
            </div>
        `;

        resultadosList.insertAdjacentHTML('beforeend', resultadoHtml);

        // Añadir event listener al botón "Lo quiero"
        const btnLoQuiero = resultadosList.querySelector(`[data-numero="${numero}"]`);
        if (btnLoQuiero && !vendido && !apartado && !yaSeleccionado) {
            btnLoQuiero.addEventListener('click', async function() {
                const seAgregó = await agregarBoletoDirectoCarrito(numero);
                
                // Si se agregó exitosamente, animar el botón y carrito
                if (seAgregó) {
                    animarAgregarAlCarrito(btnLoQuiero, numero, true);
                }
            });
        }

        resultadosDiv.style.display = 'block';
    }

    if (!configurarBuscadorBoletos._listenerRegistrado && window.rifaplusConfig?.escucharEvento) {
        window.rifaplusConfig.escucharEvento('configuracionActualizada', () => {
            actualizarRangoBusquedaEnUI();
        });
        configurarBuscadorBoletos._listenerRegistrado = true;
    }
}

/**
 * Agregar un boleto directamente al carrito desde búsqueda o máquina
 * Valida disponibilidad en tiempo real antes de agregar
 */
async function agregarBoletoDirectoCarrito(numero) {
    // ⭐ BLOQUEAR AGREGAR BOLETOS MIENTRAS SE CARGAN LOS ESTADOS
    if (window.rifaplusBoletosLoading) {
        rifaplusUtils.showFeedback('⏳ Por favor espera, cargando estado de los boletos...', 'warning');
        return false;
    }
    
    // Validar estado actual del boleto
    const { soldSet, reservedSet } = obtenerEstadoLocalBoletos();
    const selectedNumbers = obtenerBoletosSelecionados();

    // Validaciones previas
    if (soldSet.has(numero)) {
        rifaplusUtils.showFeedback(`❌ Boleto #${numero} está vendido`, 'error');
        return false;
    }

    if (reservedSet.has(numero)) {
        rifaplusUtils.showFeedback(`⏳ Boleto #${numero} está apartado`, 'warning');
        return false;
    }

    if (selectedNumbers.includes(numero)) {
        rifaplusUtils.showFeedback(`✔️ Boleto #${numero} ya está en tu carrito`, 'info');
        return false;
    }

    try {
        const estadoServidor = await verificarEstadoBoletoEnServidor(numero);
        if (estadoServidor.vendido) {
            rifaplusUtils.showFeedback(`❌ Boleto #${numero} está vendido`, 'error');
            return false;
        }

        if (estadoServidor.apartado) {
            rifaplusUtils.showFeedback(`⏳ Boleto #${numero} está apartado`, 'warning');
            return false;
        }
    } catch (error) {
        console.warn('⚠️ Error verificando boleto antes de agregar:', error.message);
        rifaplusUtils.showFeedback('⚠️ No se pudo validar el boleto en este momento. Intenta de nuevo.', 'warning');
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
 * @param {string|null} alpha - Valor de transparencia (ej: '66' para #RRGGBBAA). Si null, sin transparencia
 */
function obtenerColorSeleccionado(alpha = null) {
    try {
        let colorCSS = getComputedStyle(document.documentElement).getPropertyValue('--seleccionado').trim();
        const colorBase = colorCSS || '#0F3A7D';
        return alpha ? colorBase + alpha : colorBase;
    } catch (error) {
        console.warn('No se pudo obtener el color seleccionado, usando por defecto');
        return '#0F3A7D' + (alpha || '');
    }
}

function parsearColorCssSeguro(color) {
    const valor = String(color || '').trim();
    const hexMatch = valor.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
        let hex = hexMatch[1];
        if (hex.length === 3) {
            hex = hex.split('').map((char) => char + char).join('');
        }
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
            a: 1
        };
    }

    const rgbaMatch = valor.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i);
    if (rgbaMatch) {
        return {
            r: Math.max(0, Math.min(255, parseFloat(rgbaMatch[1]))),
            g: Math.max(0, Math.min(255, parseFloat(rgbaMatch[2]))),
            b: Math.max(0, Math.min(255, parseFloat(rgbaMatch[3]))),
            a: rgbaMatch[4] !== undefined ? Math.max(0, Math.min(1, parseFloat(rgbaMatch[4]))) : 1
        };
    }

    return { r: 39, g: 82, b: 126, a: 1 };
}

function colorRgbToCss({ r, g, b, a = 1 }) {
    const rr = Math.round(r);
    const gg = Math.round(g);
    const bb = Math.round(b);
    if (a >= 1) return `rgb(${rr}, ${gg}, ${bb})`;
    return `rgba(${rr}, ${gg}, ${bb}, ${a})`;
}

function mezclarColorCss(color, colorObjetivo, ratio = 0.5) {
    const base = parsearColorCssSeguro(color);
    const target = parsearColorCssSeguro(colorObjetivo);
    const t = Math.max(0, Math.min(1, ratio));
    return colorRgbToCss({
        r: base.r + ((target.r - base.r) * t),
        g: base.g + ((target.g - base.g) * t),
        b: base.b + ((target.b - base.b) * t),
        a: base.a + ((target.a - base.a) * t)
    });
}

function colorConAlpha(color, alpha = 1) {
    const base = parsearColorCssSeguro(color);
    return colorRgbToCss({ ...base, a: Math.max(0, Math.min(1, alpha)) });
}

function configurarColoresAnimacionCarrito(colorBase) {
    const root = document.documentElement;
    const colorPrincipal = colorBase || obtenerColorSeleccionado();
    root.style.setProperty('--cart-confirm-color', colorPrincipal);
    root.style.setProperty('--cart-confirm-color-dark', mezclarColorCss(colorPrincipal, 'rgb(8, 20, 32)', 0.22));
    root.style.setProperty('--cart-confirm-shadow', colorConAlpha(colorPrincipal, 0.48));
}



/**
 * animarAgregarAlCarrito - Crea animación completa al agregar boleto
 * Parámetros:
 * - botonElemento: elemento del botón (puede ser null para grid sin botón)
 * - numeroDelBoleto: número del boleto añadido
 * - conAnimacionBoton: si es true, anima el botón; si es false, solo anima carrito y volado
 */
function animarAgregarAlCarrito(botonElemento = null, numeroDelBoleto = 0, conAnimacionBoton = false) {
    try {
        const colorSeleccionado = obtenerColorSeleccionado();
        configurarColoresAnimacionCarrito(colorSeleccionado);
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        
        // 1️⃣ ANIMACIÓN DEL BOTÓN (opcional): Mostrar confirmación visual
        if (botonElemento && conAnimacionBoton) {
            botonElemento.classList.add('being-added');
            const textoOriginal = botonElemento.textContent;
            botonElemento.textContent = '✅ ¡Agregado!';
            botonElemento.style.backgroundColor = colorSeleccionado;
            botonElemento.style.color = 'white';
            
            setTimeout(() => {
                botonElemento.classList.remove('being-added');
                botonElemento.style.backgroundColor = '';
                botonElemento.style.color = '';
                botonElemento.textContent = '✔️ Seleccionado';
            }, 600);
        }
        
        // 2️⃣ ANIMACIÓN DEL CARRITO: Pulso visual
        const carritoNav = document.getElementById('carritoNav');
        if (carritoNav) {
            carritoNav.classList.add('cart-pulse');
            const originalColor = carritoNav.style.color;
            carritoNav.style.color = colorSeleccionado;
            carritoNav.style.transform = isMobile ? 'scale(1.14)' : 'scale(1.3)';
            
            setTimeout(() => {
                carritoNav.classList.remove('cart-pulse');
                carritoNav.style.color = originalColor;
                carritoNav.style.transform = '';
            }, isMobile ? 420 : 600);
            
            // 3️⃣ EFECTO VOLADO: Animar boleto volando al carrito
            crearAnimacionVolado(botonElemento, numeroDelBoleto);
        }
    } catch (error) {
        console.error('Error al animar agregar al carrito:', error);
    }
}

/**
 * crearEfectoVolandoProfesional - Crea un efecto volador profesional y llamativo
 * MEJORADO para móvil: Maneja correctamente scroll y viewport
 * Soporta: grid, buscador, máquina de suerte
 */
function crearEfectoVolandoProfesional(origenElement, numeroDelBoleto, origen = 'grid') {
    try {
        const carritoNav = document.getElementById('carritoNav');
        if (!carritoNav) return;
        
        const colorSeleccionado = obtenerColorSeleccionado();
        const colorSeleccionadoClaro = mezclarColorCss(colorSeleccionado, 'rgb(255, 255, 255)', 0.28);
        
        // 📍 Obtener posiciones correctas considerando scroll
        const origenRect = origenElement?.getBoundingClientRect ? origenElement.getBoundingClientRect() : {
            left: window.innerWidth / 2,
            top: window.innerHeight / 2,
            width: 0,
            height: 0
        };
        const carritoRect = carritoNav.getBoundingClientRect();
        
        // 🔍 Validación: Si el origen está muy fuera de viewport, usar posición por defecto
        const isMobile = window.innerWidth < 768;
        const origenVisibleEnViewport = origenRect.top >= -100 && origenRect.top <= window.innerHeight + 100;
        
        // Si estamos en móvil y el origen está significativamente fuera de viewport,
        // usar el centro de la pantalla pero aún hacer la animación
        let startX = origenRect.left + origenRect.width / 2;
        let startY = origenRect.top + origenRect.height / 2;
        
        if (isMobile && !origenVisibleEnViewport) {
            // En móvil, si está muy fuera, usar una posición estimada/fallback
            console.log('⚠️ En móvil, origen fuera de viewport. Usando fallback.');
            // Usar puntos donde es probable que el carrito sea visible (parte superior de la pantalla)
            startX = window.innerWidth * 0.5;
            startY = 100; // Usa una posición estimada en la parte superior
        }
        
        // 🎨 Crear elemento principal del boleto volador
        const mainTicket = document.createElement('div');
        mainTicket.className = 'ticket-fly-animation';
        
        mainTicket.style.cssText = `
            position: fixed;
            left: ${startX}px;
            top: ${startY}px;
            width: 50px;
            height: 50px;
            z-index: 9998;
            pointer-events: none;
            will-change: transform, opacity;
        `;
        
        // 🎫 Icono del boleto con efecto de destello
        const ticketIcon = document.createElement('div');
        ticketIcon.className = 'ticket-fly-animation__icon';
        ticketIcon.style.cssText = `
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, ${colorSeleccionado}, ${colorSeleccionadoClaro});
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            box-shadow: 0 0 20px ${colorConAlpha(colorSeleccionado, 0.6)}, inset 0 1px 0 rgba(255,255,255,0.3);
            transform: rotate(-15deg);
        `;
        ticketIcon.textContent = '🎫';
        mainTicket.appendChild(ticketIcon);
        
        // ✨ Crear partículas de luz alrededor
        for (let i = 0; i < 8; i++) {
            const particle = document.createElement('div');
            particle.className = 'ticket-fly-animation__particle';
            const angle = (i / 8) * Math.PI * 2;
            const distance = 35;
            const offsetX = Math.cos(angle) * distance;
            const offsetY = Math.sin(angle) * distance;
            
            particle.style.cssText = `
                position: absolute;
                width: 8px;
                height: 8px;
                background: ${colorSeleccionado};
                border-radius: 50%;
                left: 50%;
                top: 50%;
                transform: translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px));
                opacity: 0.8;
                box-shadow: 0 0 8px ${colorConAlpha(colorSeleccionado, 0.9)};
            `;
            mainTicket.appendChild(particle);
        }
        
        document.body.appendChild(mainTicket);
        
        // 🚀 Calcular trayectoria hacia carrito
        const deltaX = carritoRect.left - startX;
        const deltaY = carritoRect.top - startY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const duration = Math.min(1000, 600 + distance * 0.2);
        
        // ✨ Crear animación suave y profesional
        requestAnimationFrame(() => {
            mainTicket.style.transition = `all ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
            mainTicket.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0.2) rotate(360deg)`;
            mainTicket.style.opacity = '0';
            
            // Animar partículas de dispersión
            const particles = mainTicket.querySelectorAll('div:not(:first-child)');
            particles.forEach((p, i) => {
                p.style.transition = `all ${duration}ms ease-out`;
                p.style.opacity = '0';
                const angle = (i / 8) * Math.PI * 2;
                const finalDistance = Math.random() * 200 + 100;
                p.style.transform = `translate(calc(-50% + ${Math.cos(angle) * finalDistance}px), calc(-50% + ${Math.sin(angle) * finalDistance}px))`;
            });
        });
        
        // Limpiar elemento
        setTimeout(() => {
            mainTicket.remove();
        }, duration + 200);
        
    } catch (error) {
        console.error('Error en crearEfectoVolandoProfesional:', error);
    }
}


/**
 * crearEfectoVoladoProfesional - Crea un efecto volador profesional y llamativo
 * MEJORADO para móvil: Maneja correctamente scroll y viewport
 * Soporta: grid, buscador, máquina de suerte
 */
function crearEfectoVoladoProfesional(origenElement, numeroDelBoleto, origen = 'grid') {
    try {
        const carritoNav = document.getElementById('carritoNav');
        if (!carritoNav) {
            return;
        }
        
        const colorSeleccionado = obtenerColorSeleccionado();
        const colorSeleccionadoClaro = mezclarColorCss(colorSeleccionado, 'rgb(255, 255, 255)', 0.28);
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        const isTouch = window.matchMedia('(pointer: coarse)').matches;
        const lowPowerMode = isMobile || isTouch;
        
        // 📍 Obtener posiciones correctas (ROBUSTO)
        let origenRect = null;
        let origenValido = false;
        
        if (origenElement && typeof origenElement.getBoundingClientRect === 'function') {
            try {
                origenRect = origenElement.getBoundingClientRect();
                // Validar que el rect tiene valores razonables
                if (origenRect.width > 0 || origenRect.height > 0 || 
                    (origenRect.top >= 0 && origenRect.left >= 0)) {
                    origenValido = true;
                }
            } catch (e) {
                console.warn('Error al obtener rect del origen:', e);
            }
        }
        
        // Si origen no es válido, usar fallback inteligente
        if (!origenValido) {
            const numsGrid = document.getElementById('numerosGrid');
            const numsSuerte = document.getElementById('numerosSuerte');
            
            // Preferir máquina de suerte si está visible
            if (numsSuerte && numsSuerte.offsetParent !== null) {
                try {
                    origenRect = numsSuerte.getBoundingClientRect();
                    origenValido = true;
                } catch (e) {
                    console.warn('Error obteniendo rect máquina:', e);
                }
            }
            // Luego intentar grid
            else if (numsGrid && numsGrid.offsetParent !== null) {
                try {
                    origenRect = numsGrid.getBoundingClientRect();
                    origenValido = true;
                } catch (e) {
                    console.warn('Error obteniendo rect grid:', e);
                }
            }
        }
        
        // Si aún no tenemos rect válido, crear uno desde viewport center
        if (!origenValido) {
            origenRect = {
                left: window.innerWidth / 2,
                top: window.innerHeight / 2,
                width: 0,
                height: 0,
                bottom: window.innerHeight / 2,
                right: window.innerWidth / 2
            };
        }
        
        // Obtener posición del carrito
        let carritoRect = null;
        try {
            carritoRect = carritoNav.getBoundingClientRect();
            // Validar que carrito tiene posición válida
            if (!carritoRect || carritoRect.width === 0) {
                throw new Error('Carrito rect inválido');
            }
        } catch (e) {
            console.warn('Error al obtener rect carrito:', e);
            return;
        }
        
        // 🎯 Calcular punto de inicio (MÁS ROBUSTO)
        let startX = window.innerWidth / 2;
        let startY = window.innerHeight / 2;
        
        if (origenRect) {
            startX = origenRect.left + origenRect.width / 2;
            startY = origenRect.top + origenRect.height / 2;
            
            // Validación de cordura: si está MUY fuera de pantalla, ajustar
            const isOutOfView = startY < -200 || startY > window.innerHeight + 200 || 
                                startX < -200 || startX > window.innerWidth + 200;
            
            if (isOutOfView) {
                startY = Math.max(50, Math.min(startY, window.innerHeight - 50));
                startX = Math.max(50, Math.min(startX, window.innerWidth - 50));
            }
        }
        
        // 🎨 Crear elemento principal del boleto volador
        const mainTicket = document.createElement('div');
        
        mainTicket.style.cssText = `
            position: fixed;
            left: ${startX}px;
            top: ${startY}px;
            width: ${lowPowerMode ? 42 : 50}px;
            height: ${lowPowerMode ? 42 : 50}px;
            z-index: 9998;
            pointer-events: none;
            will-change: transform, opacity;
            opacity: 1;
            contain: layout style paint;
            transform: translateZ(0);
        `;
        
        // 🎫 Icono del boleto con efecto de destello (MEJORADO)
        const ticketIcon = document.createElement('div');
        ticketIcon.style.cssText = `
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, ${colorSeleccionado}, ${colorSeleccionadoClaro});
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${lowPowerMode ? 22 : 28}px;
            font-weight: bold;
            box-shadow: ${lowPowerMode
                ? `0 0 14px ${colorConAlpha(colorSeleccionado, 0.45)}, inset 0 1px 0 rgba(255,255,255,0.35)`
                : `0 0 30px ${colorConAlpha(colorSeleccionado, 0.9)}, inset 0 2px 0 rgba(255,255,255,0.5), 0 0 0 2px ${colorSeleccionado}`};
            transform: rotate(-15deg);
            transition: transform linear;
        `;
        ticketIcon.textContent = '🎫';
        mainTicket.appendChild(ticketIcon);
        
        // En móvil reducimos partículas para mejorar fps sin perder el efecto
        const particleCount = lowPowerMode ? 4 : Math.min(12, Math.max(6, Math.floor(window.innerWidth / 140)));
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            const angle = (i / particleCount) * Math.PI * 2;
            const distance = lowPowerMode ? 28 : 45;
            const offsetX = Math.cos(angle) * distance;
            const offsetY = Math.sin(angle) * distance;
            
            particle.style.cssText = `
                position: absolute;
                width: ${lowPowerMode ? 8 : 12}px;
                height: ${lowPowerMode ? 8 : 12}px;
                background: ${colorSeleccionado};
                border-radius: 50%;
                left: 50%;
                top: 50%;
                transform: translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px));
                opacity: ${lowPowerMode ? 0.75 : 1};
                box-shadow: ${lowPowerMode
                    ? `0 0 8px ${colorConAlpha(colorSeleccionado, 0.55)}`
                    : `0 0 15px ${colorConAlpha(colorSeleccionado, 1)}, 0 0 30px ${colorConAlpha(colorSeleccionado, 0.6)}`};
            `;
            mainTicket.appendChild(particle);
        }
        
        // Agregar al DOM
        document.body.appendChild(mainTicket);
        
        // 🚀 Calcular trayectoria hacia carrito (ROBUSTO)
        const deltaX = carritoRect.left - startX;
        const deltaY = carritoRect.top - startY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        // Duración adaptiva pero SIEMPRE VISIBLE
        let baseDuration = lowPowerMode ? 380 : 800;
        if (origen === 'suerte') baseDuration = lowPowerMode ? 440 : 1100;
        if (origen === 'fallback') baseDuration = lowPowerMode ? 420 : 950;
        
        const duration = lowPowerMode
            ? Math.max(320, Math.min(560, baseDuration + distance * 0.08))
            : Math.max(720, Math.min(1400, baseDuration + distance * 0.18));
        
        // ✨ Crear animación suave y CONFIABLE
        requestAnimationFrame(() => {
            mainTicket.style.transition = `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${duration}ms ease-out`;
            mainTicket.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${lowPowerMode ? 0.18 : 0.1}) rotate(${lowPowerMode ? 300 : 720}deg)`;
            mainTicket.style.opacity = '0';
            
            // Animar partículas de forma más ligera
            const particles = mainTicket.querySelectorAll('div:not(:first-child)');
            particles.forEach((p, i) => {
                p.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;
                p.style.opacity = '0';
                const angle = (i / particles.length) * Math.PI * 2;
                const finalDistance = lowPowerMode
                    ? (Math.random() * 55 + 55)
                    : (Math.random() * 180 + 120);
                p.style.transform = `translate(calc(-50% + ${Math.cos(angle) * finalDistance}px), calc(-50% + ${Math.sin(angle) * finalDistance}px)) scale(0)`;
            });
        });
        
        // Limpiar elemento después de TODA la animación
        const cleanupTimeout = setTimeout(() => {
            try {
                if (mainTicket && mainTicket.parentNode) {
                    mainTicket.remove();
                }
            } catch (e) {
                console.warn('Error al limpiar elemento:', e);
            }
        }, duration + 300);
        
        // Guardar timeout para poder limpiarlo si es necesario
        mainTicket.cleanupTimeout = cleanupTimeout;
        
    } catch (error) {
        console.error('❌ Error en crearEfectoVoladoProfesional:', error);
    }
}

/**
 * crearAnimacionVolado - ULTRA-ROBUSTO para cualquier dispositivo
 * Busca el origen del boleto en grid/máquina y crea efecto volador hacia carrito
 * Garantiza animación incluso si el elemento origen no se encuentra
 */
function crearAnimacionVolado(botonElemento = null, numeroDelBoleto = 0) {
    try {
        let origenElement = botonElemento;
        let origen = 'unknown';
        
        // 1️⃣ Si pasamos un botón, usarlo directamente
        if (origenElement && origenElement.nodeType === 1) {
            origen = 'boton';
            console.log('✅ Usando botón origen directo');
            crearEfectoVoladoProfesional(origenElement, numeroDelBoleto, origen);
            return;
        }
        
        // 2️⃣ Buscar en grid de números (prioritario)
        const numerosGrid = document.getElementById('numerosGrid');
        if (numerosGrid && numerosGrid.offsetParent !== null) {
            try {
                origenElement = numerosGrid.querySelector(`[data-numero="${numeroDelBoleto}"]`);
                if (origenElement && origenElement.nodeType === 1) {
                    origen = 'grid';
                    console.log(`✅ Encontrado en grid: #${numeroDelBoleto}`);
                    crearEfectoVoladoProfesional(origenElement, numeroDelBoleto, origen);
                    return;
                }
            } catch (e) {
                console.warn('Error buscando en grid:', e);
            }
        }
        
        // 3️⃣ Buscar en máquina de suerte
        const numerosSuerte = document.getElementById('numerosSuerte');
        if (numerosSuerte && numerosSuerte.offsetParent !== null) {
            try {
                // Primero buscar el número específico
                origenElement = numerosSuerte.querySelector(`[data-numero="${numeroDelBoleto}"]`);
                if (origenElement && origenElement.nodeType === 1) {
                    origen = 'suerte-elemento';
                    console.log(`✅ Encontrado en máquina: #${numeroDelBoleto}`);
                    crearEfectoVoladoProfesional(origenElement, numeroDelBoleto, origen);
                    return;
                }
                
                // Si no encontramos el número, usar toda la máquina como origen
                console.log('📍 Número no encontrado en máquina, usando contenedor');
                origenElement = numerosSuerte;
                origen = 'suerte';
                crearEfectoVoladoProfesional(origenElement, numeroDelBoleto, origen);
                return;
            } catch (e) {
                console.warn('Error buscando en máquina:', e);
            }
        }
        
        // 4️⃣ Si grid no está visible, crear fallback desde su posición anterior
        if (numerosGrid) {
            console.log('📍 Grid existe pero no visible, usando como fallback');
            try {
                const gridRect = numerosGrid.getBoundingClientRect();
                origenElement = document.createElement('div');
                origenElement.style.cssText = `position: fixed; left: ${gridRect.left + gridRect.width / 2}px; top: ${gridRect.top + gridRect.height / 2}px; width: 0; height: 0;`;
                document.body.appendChild(origenElement);
                crearEfectoVoladoProfesional(origenElement, numeroDelBoleto, 'fallback-grid');
                setTimeout(() => {
                    if (origenElement && origenElement.parentNode) {
                        origenElement.remove();
                    }
                }, 2300);
                return;
            } catch (e) {
                console.warn('Error creando fallback grid:', e);
            }
        }
        
        // 5️⃣ Último recurso: viewport center (NUNCA falla)
        console.log('⚠️ Usando viewport center como último recurso');
        origenElement = document.createElement('div');
        origenElement.style.cssText = `position: fixed; left: ${window.innerWidth / 2}px; top: ${window.innerHeight / 2}px; width: 0; height: 0;`;
        document.body.appendChild(origenElement);
        crearEfectoVoladoProfesional(origenElement, numeroDelBoleto, 'fallback-viewport');
        setTimeout(() => {
            if (origenElement && origenElement.parentNode) {
                origenElement.remove();
            }
        }, 2300);
        
    } catch (error) {
        console.error('❌ Error CRÍTICO en crearAnimacionVolado:', error);
        // Incluso si todo falla, intentar fallback final
        try {
            const fallbackEl = document.createElement('div');
            fallbackEl.style.cssText = `position: fixed; left: ${window.innerWidth / 2}px; top: ${window.innerHeight / 2}px; width: 0; height: 0;`;
            document.body.appendChild(fallbackEl);
            crearEfectoVoladoProfesional(fallbackEl, numeroDelBoleto, 'emergency-fallback');
            setTimeout(() => fallbackEl.remove(), 2300);
        } catch (e) {
            console.error('❌ Fallback de emergencia también falló:', e);
        }
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
 * Procesa datos de boletos (sold/reserved) y actualiza vista
 * Marca ventana.rifaplusBoletosDatosActualizados para sincronizar
 */
function procesarBoletosEnBackground(sold, reserved) {
    try {
        // Marcar datos como OBSOLETOS antes de actualizar
        window.rifaplusBoletosDatosActualizados = false;
        
        window.rifaplusSoldNumbers = sold.map(Number);
        window.rifaplusReservedNumbers = reserved.map(Number);
        console.debug(`✅ Procesados ${sold.length + reserved.length} boletos`);
        
        // Actualizar grid y availability note sincronizados
        actualizarEstadoBoletosVisibles();
        if (typeof actualizarNotaDisponibilidad === 'function') {
            actualizarNotaDisponibilidad();
        }
        
        // Marcar datos como FRESCOS
        window.rifaplusBoletosDatosActualizados = true;
    } catch (error) {
        console.error('❌ Error procesando boletos:', error);
        // Último fallback: arrays vacíos
        window.rifaplusSoldNumbers = [];
        window.rifaplusReservedNumbers = [];
        window.rifaplusBoletosDatosActualizados = true;
    }
}

// Exponer funciones globalmente para que otras páginas/módulos puedan llamarlas
window.cargarBoletosPublicos = cargarBoletosPublicos;
window.actualizarResumenCompra = actualizarResumenCompra;
window.controlarEstadoBotonesLoQuiero = controlarEstadoBotonesLoQuiero;

/**
 * 🔍 DEBUG MODE: Escribe "debug()" en consola para ver estado
 */
function debug() {
    const debugPanel = document.getElementById('debugPanel');
    const debugInfo = document.getElementById('debugInfo');
    
    if (!debugPanel || !debugInfo) return;
    
    debugPanel.style.display = 'block';
    
    const info = `
<div style="font-family: monospace; white-space: pre-wrap; word-break: break-all;">
Sold count: ${window.rifaplusSoldNumbers?.length || 0}
Reserved count: ${window.rifaplusReservedNumbers?.length || 0}
Loaded: ${window.rifaplusBoletosLoaded}
Browser: ${/Safari/.test(navigator.userAgent) && !/Chrome|Edge|Firefox/.test(navigator.userAgent) ? '🍎 Safari' : 'Other'}
Config estado: ${JSON.stringify(window.rifaplusConfig?.estado || {}, null, 2)}
    </div>
    `;
    
    debugInfo.innerHTML = info;
    console.log('DEBUG INFO:', {
        sold: window.rifaplusSoldNumbers,
        reserved: window.rifaplusReservedNumbers,
        loaded: window.rifaplusBoletosLoaded,
        config: window.rifaplusConfig?.estado
    });
}

window.debug = debug;
