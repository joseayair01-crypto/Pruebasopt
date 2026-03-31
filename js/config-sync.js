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
        console.debug('⏳ Sincronización ya en progreso, omitiendo...');
        return false;
    }
    
    // Cooldown INTELIGENTE: 30 segundos (fue 5 minutos, ahora más rápido para admin panel)
    const ahora = Date.now();
    const cooldownMs = this._reintentosFallidos > 0 
        ? Math.min(5000 * Math.pow(2, this._reintentosFallidos), 30000)  // Backoff: 5s, 10s, 20s, 30s
        : 30000;  // 30 segundos normal
    
    if (!force && this._ultimaSincronizacion && (ahora - this._ultimaSincronizacion < cooldownMs)) {
        const segundosFaltantes = Math.ceil((cooldownMs - (ahora - this._ultimaSincronizacion)) / 1000);
        console.debug(`⏳ Cooldown activo (${this._reintentosFallidos} reintentos): próxima en ${segundosFaltantes}s`);
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
            console.debug('⏳ Rate limit alcanzado (429). Usar config local, reintentando...', {
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
            console.debug(`ℹ️  Backend no disponible (${response.status}). Usar config local`, {
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
                
                console.log('📥 [Config-Sync] Sincronizando cliente desde backend:', {
                    nombre: clienteCopy.nombre,
                    eslogan: clienteCopy.eslogan
                });
                
                // ✅ Sincronizar todAS las propiedades del cliente (merge completo)
                Object.keys(clienteCopy).forEach(key => {
                    this.cliente[key] = clienteCopy[key];
                });
                
                console.log('✅ Cliente completamente sincronizado. Nombre actual:', this.cliente.nombre);
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
                    console.log('✅ infoRifa (tarjetas) protegida durante sincronización');
                }
                
                console.log('✅ Rifa sincronizada completamente desde backend:', {
                    nombreSorteo: this.rifa.nombreSorteo,
                    totalBoletos: this.rifa.totalBoletos,
                    precioBoleto: this.rifa.precioBoleto,
                    galeríaImagenes: this.rifa.galeria?.imagenes?.length || 0,
                    infoRifaTarjetas: this.rifa.infoRifa?.length || 0
                });

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
                console.log('🎨 Actualizando UI elementos con nombre:', this.cliente?.nombre);
                this.actualizarNombreClienteEnUI();
                console.log('✅ UI actualizada exitosamente');
            }
            
            // Emitir evento general de sincronización para que todas las páginas actualicen sus datos
            console.log('✅ Config SINCRONIZADA desde backend (en', Math.round(Date.now() - ahora), 'ms)');
            
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
                console.debug('✅ Estado actualizado desde /stats');
                
                this._cargarDatosCompletosEnBackground();
            }
        } else if (statsResponse.status === 429) {
            console.debug('⏳ Rate limit en /api/public/boletos/stats (429)');
            return false;
        }
        
        return true;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.debug('⏱️  Timeout en /stats (2s)');
            this._cargarDatosCompletosEnBackground();
        } else {
            console.debug('ℹ️  Error sincronizando estado:', error.message);
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
                console.debug(`✅ Datos de rango cargados en background (${inicio}-${fin})`);
            }
        }
    } catch (error) {
        console.debug('ℹ️  Error cargando rango en background (no crítico):', error.message);
    }
};

/**
 * Inicia actualizaciones automáticas del estado
 * Intervalo de 5 minutos para evitar 429 Too Many Requests
 */
window.rifaplusConfig.iniciarActualizacionesAutomaticas = function() {
    // Sincronizar estado cada 5 minutos
    setInterval(() => {
        this.sincronizarEstadoBackend();
    }, 300000); // 5 minutos
    
    // Sincronizar configuración cada 5 minutos (para cambios desde admin)
    setInterval(() => {
        this.sincronizarConfigDelBackend();
    }, 300000); // 5 minutos
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
        console.debug('Error emitiendo CustomEvent:', err);
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
        console.log('🚀 [Init] Sincronizando config desde backend INMEDIATAMENTE...');
        try {
            await this.sincronizarConfigDelBackend();
            console.log('✅ [Init] Sincronización inicial completada');
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
        
        console.log('✅ [Config] Sistema inicializado correctamente');
        
        // 🎉 Disparar evento de completitud para que otras páginas sepan que config está lista
        window.dispatchEvent(new CustomEvent('configSyncCompleto', {
            detail: { 
                cliente: this.cliente,
                rifa: this.rifa
            }
        }));
        console.log('📢 Evento configSyncCompleto disparado');
    } catch (error) {
        console.error('Error inicializando configuración:', error);
    }
};

console.log('✅ [Config-Sync] Sistema de sincronización y eventos inicializado');

// 🚀 AUTO-INICIALIZAR apenas el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.rifaplusConfig.inicializar().catch(e => 
            console.error('❌ Error en inicialización automática:', e)
        );
    });
} else {
    // DOM ya está listo (esto ocurre si config-sync.js se carga después del DOMContentLoaded)
    console.log('⚡ [Config-Sync] DOM ya listo, inicializando inmediatamente...');
    window.rifaplusConfig.inicializar().catch(e => 
        console.error('❌ Error en inicialización automática:', e)
    );
}
