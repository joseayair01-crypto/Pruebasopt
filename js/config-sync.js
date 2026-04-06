/**
 * ============================================================
 * ARCHIVO: js/config-sync.js
 * DESCRIPCIÓN: Sistema de sincronización y eventos para RifaPlus
 * 
 * Este archivo contiene TODA la lógica de:
 * - Sincronización con servidor (backend)
 * - Sistema de eventos (emitir/escuchar)
 * - Actualización automática de estado
 * 
 * Separado de config.js para mantener claridad:
 * - config.js = valores por defecto (estático)
 * - config-sync.js = lógica de sincronización (dinámico)
 * ============================================================
 */

// Flag para evitar múltiples sincronizaciones simultáneas
window.rifaplusConfig._sincronizandoBackend = false;
window.rifaplusConfig._ultimaSincronizacion = 0;
window.rifaplusConfig._reintentosFallidos = 0;  // Contador para backoff exponencial
window.rifaplusConfig._maxReintentos = 3;        // Máximo de reintentos
window.rifaplusConfig._configPublicaCache = null;
window.rifaplusConfig._configPublicaCacheTime = 0;
window.rifaplusConfig._configPublicaPromise = null;
window.rifaplusConfig._intervaloEstadoId = null;
window.rifaplusConfig._intervaloConfigId = null;

const RIFAPLUS_SYNC_DEBUG = ['localhost', '127.0.0.1'].includes(window.location.hostname);

function syncDebug(...args) {
    if (RIFAPLUS_SYNC_DEBUG) {
        console.debug(...args);
    }
}

window.rifaplusConfig.debeSincronizarEstadoAutomaticamente = function() {
    const body = document.body;
    if (!body) return false;
    return body.dataset.rifaplusLiveState === 'true';
};

window.rifaplusConfig.debePrecargarRangoPublico = function() {
    const body = document.body;
    if (!body) return false;
    return body.dataset.rifaplusWarmRange === 'true';
};

window.rifaplusConfig.obtenerConfigPublicaCompartida = async function(opciones = {}) {
    const force = opciones?.force === true;
    const maxAgeMs = Number.isFinite(Number(opciones?.maxAgeMs)) ? Number(opciones.maxAgeMs) : 30000;
    const ahora = Date.now();

    if (!force && this._configPublicaCache && (ahora - this._configPublicaCacheTime) < maxAgeMs) {
        return this._configPublicaCache;
    }

    if (!force && this._configPublicaPromise) {
        return this._configPublicaPromise;
    }

    const apiBase = this.backend?.apiBase
        || this.obtenerApiBase?.()
        || window.location.origin;

    this._configPublicaPromise = fetch(`${apiBase}/api/public/config`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    })
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            if (!result?.success || !result?.data) {
                throw new Error(result?.message || 'Configuración pública inválida');
            }

            const data = result.data;
            this._configPublicaCache = data;
            this._configPublicaCacheTime = Date.now();

            if (data.rifa && typeof data.rifa === 'object') {
                Object.assign(this.rifa, data.rifa);
            }

            if (Array.isArray(data.cuentas)) {
                this.tecnica.bankAccounts = data.cuentas;
            }

            if (Number.isFinite(Number(data.totalBoletos)) && Number(data.totalBoletos) > 0) {
                this.rifa.totalBoletos = Number(data.totalBoletos);
            }

            if (Number.isFinite(Number(data.precioBoleto)) && Number(data.precioBoleto) >= 0) {
                this.rifa.precioBoleto = Number(data.precioBoleto);
            }

            return data;
        })
        .catch((error) => {
            if (this._configPublicaCache) {
                console.debug('ℹ️ Usando caché local de configuración pública tras fallo:', error.message);
                return this._configPublicaCache;
            }
            throw error;
        })
        .finally(() => {
            this._configPublicaPromise = null;
        });

    return this._configPublicaPromise;
};

/**
 * Sincroniza la configuración del cliente desde el backend
 * Si el backend no responde, mantiene los valores locales
 * Implementa cooldown inteligente y reintentos con backoff exponencial
 * TIMEOUT REAL con AbortController
 * 
 * NOTA: Esta función es NO-BLOQUEANTE
 * Si falla, el sistema sigue funcionando con config local
 * 
 * COOLDOWN INTELIGENTE:
 * - Primera carga: inmediata
 * - Si falla: reintentar en 3-5s (backoff exponencial)
 * - Si funciona: próxima en 30 segundos (rápido si admin cambió config)
 */
window.rifaplusConfig.sincronizarConfigDelBackend = async function(opciones = {}) {
    const force = opciones?.force === true;

    // Evitar sincronizaciones simultáneas
    if (this._sincronizandoBackend) {
        syncDebug('⏳ Sincronización ya en progreso, omitiendo...');
        return false;
    }
    
    // Cooldown INTELIGENTE: 30 segundos (fue 5 minutos, ahora más rápido para admin panel)
    const ahora = Date.now();
    const cooldownMs = this._reintentosFallidos > 0 
        ? Math.min(5000 * Math.pow(2, this._reintentosFallidos), 30000)  // Backoff: 5s, 10s, 20s, 30s
        : 30000;  // 30 segundos normal
    
    if (!force && this._ultimaSincronizacion && (ahora - this._ultimaSincronizacion < cooldownMs)) {
        const segundosFaltantes = Math.ceil((cooldownMs - (ahora - this._ultimaSincronizacion)) / 1000);
        syncDebug(`⏳ Cooldown activo (${this._reintentosFallidos} reintentos): próxima en ${segundosFaltantes}s`);
        return false;
    }
    
    let timeoutId = null;
    const controller = new AbortController();
    
    try {
        this._sincronizandoBackend = true;
        const apiBase = this.backend.apiBase;
        
        // 🚨 TIMEOUT REAL: AbortController (5 segundos)
        timeoutId = setTimeout(() => {
            controller.abort();
        }, 5000);
        
        const response = await fetch(`${apiBase}/api/cliente`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            cache: 'no-store'  // No cachear para asegurar datos frescos
        });
        
        clearTimeout(timeoutId);
        
        // Manejar específicamente 429 (Too Many Requests)
        if (response.status === 429) {
            syncDebug('⏳ Rate limit alcanzado (429). Usar config local, reintentando...', {
                reintentos: this._reintentosFallidos,
                maxReintentos: this._maxReintentos
            });
            this._ultimaSincronizacion = ahora;
            
            if (this._reintentosFallidos < this._maxReintentos) {
                this._reintentosFallidos++;
            }
            return false;
        }
        
        if (!response.ok) {
            syncDebug(`ℹ️  Backend no disponible (${response.status}). Usar config local`, {
                reintentos: this._reintentosFallidos,
                maxReintentos: this._maxReintentos
            });
            this._ultimaSincronizacion = ahora;
            
            if (this._reintentosFallidos < this._maxReintentos) {
                this._reintentosFallidos++;
            }
            return false;
        }
        
        const result = await response.json();
        
        if (result.success && result.data) {
            // Fusionar configuración del backend
            if (result.data.cliente) {
                const clienteCopy = Object.assign({}, result.data.cliente);
                
                // ✅ Sincronizar todAS las propiedades del cliente (merge completo)
                Object.keys(clienteCopy).forEach(key => {
                    this.cliente[key] = clienteCopy[key];
                });
            }
            
            if (result.data.rifa) {
                const rifaCopy = Object.assign({}, result.data.rifa);
                
                // ✅ PROTEGER: infoRifa es LOCAL (no viene del servidor)
                const infoRifaLocal = this.rifa.infoRifa;
                
                // Merge completo y explícito de la rifa
                Object.keys(rifaCopy).forEach(key => {
                    this.rifa[key] = rifaCopy[key];
                });

                if (this.rifa.tiempoApartadoHoras !== undefined && this.rifa.tiempoApartadoHoras !== null) {
                    this.rifa.tiempoApartadoMs = this.rifa.tiempoApartadoHoras * 60 * 60 * 1000;
                }
                
                // ✅ RESTAURAR: infoRifa (estructura local de tarjetas)
                if (infoRifaLocal && Array.isArray(infoRifaLocal)) {
                    this.rifa.infoRifa = infoRifaLocal;
                }

                try {
                    if (Number.isFinite(Number(this.rifa.totalBoletos)) && Number(this.rifa.totalBoletos) > 0) {
                        localStorage.setItem('rifaplus_total_boletos_cache', String(Math.floor(Number(this.rifa.totalBoletos))));
                    }
                } catch (storageError) {
                    console.debug('ℹ️ No se pudo cachear totalBoletos sincronizado:', storageError.message);
                }
            }

            if (result.data.seo) {
                this.seo = Object.assign({}, this.seo || {}, result.data.seo);
            }

            if (result.data.tema) {
                this.tema = Object.assign({}, this.tema || {}, result.data.tema);
                if (result.data.tema.colores) {
                    this.tema.colores = Object.assign({}, this.tema.colores || {}, result.data.tema.colores);
                }
            }
            
            // Cargar cuentas del servidor
            if (result.data.cuentas && Array.isArray(result.data.cuentas) && result.data.cuentas.length > 0) {
                this.tecnica.bankAccounts = result.data.cuentas;
            }
            
            // ✅ ACTUALIZAR UI CON EL NUEVO NOMBRE DEL CLIENTE INMEDIATAMENTE
            if (typeof this.actualizarNombreClienteEnUI === 'function') {
                this.actualizarNombreClienteEnUI();
            }
            
            // Resetear reintentos fallidos cuando funciona
            this._reintentosFallidos = 0;
            
            this.emitirEvento('configuracionActualizada', { 
                tipo: 'sincronizacion_backend',
                timestamp: ahora,
                datos: {
                    cliente: !!result.data.cliente,
                    rifa: !!result.data.rifa,
                    cuentas: result.data.cuentas?.length || 0
                }
            });
            
            this._ultimaSincronizacion = ahora;
            return true;
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('⏱️  Timeout en sincronización (5s). Reintentando...', {
                reintentos: this._reintentosFallidos,
                maxReintentos: this._maxReintentos
            });
        } else {
            console.warn('⚠️  Error en sincronización:', error.message, {
                reintentos: this._reintentosFallidos,
                maxReintentos: this._maxReintentos
            });
        }
        
        // Incrementar reintentos fallidos (máximo 3)
        if (this._reintentosFallidos < this._maxReintentos) {
            this._reintentosFallidos++;
        }
        
        this._ultimaSincronizacion = Date.now();
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        this._sincronizandoBackend = false;
    }
    
    return false;
};

/**
 * Sincroniza estado con el backend
 * OPTIMIZADO: Usa /api/public/boletos/stats para respuesta ULTRA-RÁPIDA
 */
window.rifaplusConfig.sincronizarEstadoBackend = async function() {
    let timeoutId = null;
    const controller = new AbortController();
    
    try {
        timeoutId = setTimeout(() => {
            controller.abort();
        }, 2000); // 2 segundos timeout
        
        const statsResponse = await fetch(`${this.backend.apiBase}/api/public/boletos/stats`, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            
            if (statsData.success) {
                const data = statsData.data || statsData;
                
                this.estado.boletosVendidos = data.vendidos;
                this.estado.boletosApartados = data.apartados;
                this.estado.boletosDisponibles = data.disponibles;
                
                this.estado.porcentajeVendido = (this.estado.boletosVendidos / this.rifa.totalBoletos) * 100;
                this.estado.ultimaActualizacion = new Date();
                
                this.emitirEvento('estadoActualizado', this.estado);
                syncDebug('✅ Estado actualizado desde /stats');
                
                this._cargarDatosCompletosEnBackground();
            }
        } else if (statsResponse.status === 429) {
            syncDebug('⏳ Rate limit en /api/public/boletos/stats (429)');
            return false;
        }
        
        return true;
    } catch (error) {
        if (error.name === 'AbortError') {
            syncDebug('⏱️  Timeout en /stats (2s)');
            this._cargarDatosCompletosEnBackground();
        } else {
            syncDebug('ℹ️  Error sincronizando estado:', error.message);
        }
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
    
    return false;
};

/**
 * Helper: Carga datos completos en background sin bloquear UI
 */
window.rifaplusConfig._cargarDatosCompletosEnBackground = async function() {
    if (!this.debePrecargarRangoPublico()) {
        return false;
    }

    try {
        const totalBoletos = typeof this.obtenerTotalBoletos === 'function'
            ? this.obtenerTotalBoletos()
            : Number(this.rifa?.totalBoletos || 0);

        // En sorteos grandes no conviene descargar el universo completo solo para "calentar" datos.
        const oportunidades = this.rifa?.oportunidades;
        const rangoVisible = oportunidades?.enabled && oportunidades?.rango_visible
            ? oportunidades.rango_visible
            : null;
        const inicio = Number.isFinite(Number(rangoVisible?.inicio)) ? Number(rangoVisible.inicio) : 0;
        const finPreferido = Number.isFinite(Number(rangoVisible?.fin))
            ? Number(rangoVisible.fin)
            : Math.max(0, Math.min(totalBoletos - 1, 1999));
        const fin = Math.max(inicio, Math.min(finPreferido, inicio + 1999));

        const respuesta = await fetch(
            `${this.backend.apiBase}/api/public/boletos?inicio=${inicio}&fin=${fin}`,
            { priority: 'low' }
        );
        
        if (respuesta.ok) {
            const datos = await respuesta.json();
            if (datos.success && datos.data) {
                syncDebug(`✅ Datos de rango cargados en background (${inicio}-${fin})`);
            }
        }
        return true;
    } catch (error) {
        syncDebug('ℹ️  Error cargando rango en background (no crítico):', error.message);
    }

    return false;
};

/**
 * Inicia actualizaciones automáticas del estado
 * Intervalo de 5 minutos para evitar 429 Too Many Requests
 */
window.rifaplusConfig.iniciarActualizacionesAutomaticas = function() {
    if (!this._intervaloEstadoId) {
        this._intervaloEstadoId = setInterval(() => {
            if (document.visibilityState !== 'visible') {
                return;
            }

            if (this.debeSincronizarEstadoAutomaticamente()) {
                this.sincronizarEstadoBackend();
            }
        }, 300000); // 5 minutos
    }

    if (!this._intervaloConfigId) {
        this._intervaloConfigId = setInterval(() => {
            if (document.visibilityState !== 'visible') {
                return;
            }

            this.sincronizarConfigDelBackend();
        }, 300000); // 5 minutos
    }
};

/**
 * Sistema de eventos para comunicación entre componentes
 */
window.rifaplusConfig.eventos = {};

window.rifaplusConfig.escucharEvento = function(evento, callback) {
    if (!this.eventos[evento]) this.eventos[evento] = [];
    this.eventos[evento].push(callback);
};

window.rifaplusConfig.emitirEvento = function(evento, datos) {
    // Llamar callbacks internos
    if (this.eventos[evento]) {
        this.eventos[evento].forEach(callback => callback(datos));
    }
    
    // ✅ TAMBIÉN emitir como CustomEvent en la ventana para compatibilidad
    // Esto permite a otros scripts escuchar con window.addEventListener
    try {
        window.dispatchEvent(new CustomEvent(evento, { detail: datos }));
    } catch (err) {
        syncDebug('Error emitiendo CustomEvent:', err);
    }
};

/**
 * Inicialización completa del sistema
 */
window.rifaplusConfig.inicializar = async function() {
    try {
        // 0. Calcular tiempoMs basado en tiempoApartadoHoras
        if (this.rifa && this.rifa.tiempoApartadoHoras) {
            this.rifa.tiempoApartadoMs = this.rifa.tiempoApartadoHoras * 60 * 60 * 1000;
        }
        
        // 1.5. Sincronizar desde backend INMEDIATAMENTE (sin delay)
        try {
            await this.sincronizarConfigDelBackend();
        } catch (syncError) {
            console.warn('⚠️  [Init] Config local será usada (error sincronización):', syncError.message);
        }
        
        // 1.75. Sincronizar ganadores desde localStorage
        this.sincronizarGanadores();
        
        // 2. El tema/colores se aplican automáticamente via theme-loader.js y theme-dynamic.js
        
        // 2.5. Actualizar nombre del cliente en todos lados
        if (typeof this.actualizarNombreClienteEnUI === 'function') {
            this.actualizarNombreClienteEnUI();
        }
        
        // 3. ⏭️  NO sincronizar estado EN BACKGROUND aquí
        // En páginas como compra.html, compra.js ya actualiza boletosDisponibles correctamente
        // Sincronizar aquí sobrescribiría con valores procesados innecesariamente
        // Dejar que InitarActualizacionesAutomaticas lo haga cada 5 minutos
        // this.sincronizarEstadoBackend().catch(e => {
        //     console.warn('⚠️  Error sincronizando estado:', e.message);
        // });
        
        // 4. Iniciar actualizaciones automáticas (cada 5 minutos)
        this.iniciarActualizacionesAutomaticas();

        // 🎉 Disparar evento de completitud para que otras páginas sepan que config está lista
        window.dispatchEvent(new CustomEvent('configSyncCompleto', {
            detail: { 
                cliente: this.cliente,
                rifa: this.rifa
            }
        }));
    } catch (error) {
        console.error('Error inicializando configuración:', error);
    }
};

// 🚀 AUTO-INICIALIZAR apenas el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.rifaplusConfig.inicializar().catch(e => 
            console.error('❌ Error en inicialización automática:', e)
        );
    });
} else {
    // DOM ya está listo (esto ocurre si config-sync.js se carga después del DOMContentLoaded)
    window.rifaplusConfig.inicializar().catch(e => 
        console.error('❌ Error en inicialización automática:', e)
    );
}
