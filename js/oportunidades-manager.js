/**
 * ============================================================
 * ARCHIVO: js/oportunidades-manager.js
 * DESCRIPCIÓN: Módulo profesional de gestión de oportunidades
 * ✅ Enterprise-grade, robusto, confiable, optimizado
 * ============================================================
 */

/**
 * 🏢 GESTOR PROFESIONAL DE OPORTUNIDADES
 * Encapsula toda la lógica con:
 * - Error handling multinivel
 * - Cache management inteligente
 * - Rate limiting
 * - Monitoring
 * - Graceful degradation
 */
class OportunidadesManager {
    constructor() {
        // Estado y configuración
        // La config se inicializa aquí (después de que config.js cargó)
        this.isEnabled = window.rifaplusConfig?.rifa?.oportunidades?.enabled || false;
        
        // ✅ Usar resolvedor central para mantener deploy dinámico
        this.apiBaseUrl = window.rifaplusConfig?.backend?.apiBase
            || window.rifaplusConfig?.obtenerApiBase?.()
            || window.location.origin;
        
        this.BATCH_SIZE = 50;
        this.MAX_CONCURRENT = 12;
        this.TIMEOUT_MS = 8000;
        this.MAX_REINTENTOS = 2;
        this.RETRY_DELAY_MS = 800;
        this.MAX_CACHE_SIZE = 15000;  // Máx oportunidades en cache
        
        // Estado de carga
        this.estado = {
            cargando: false,
            completado: false,
            errores: 0,
            exitosos: 0,
            totalSolicitados: 0,
            boletosEnProceso: new Set(),
            ultimaActualizacion: null
        };
        
        // Cache de oportunidades (con límite de memoria)
        this.cache = new Map();  // Map es más eficiente que objeto
        this.cacheHits = 0;
        this.cacheMisses = 0;
        
        // Queue para reintentos
        this.colaReintentos = [];
        
        // Listeners para eventos
        this.listeners = {
            'onComplete': [],
            'onError': [],
            'onProgress': []
        };
        
        console.log('[OppManager] ✅ Inicializado', {
            enabled: this.isEnabled,
            apiBaseUrl: this.apiBaseUrl
        });
    }
    
    /**
     * 📊 Obtener estadísticas de cache
     */
    getStats() {
        const hitRate = this.cacheHits + this.cacheMisses > 0 
            ? ((this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100).toFixed(2)
            : 0;
        
        return {
            cacheSize: this.cache.size,
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            hitRate: `${hitRate}%`,
            estado: this.estado,
            memoryUsage: this._estimateMemoryUsage()
        };
    }
    
    /**
     * 💾 Estimar uso de memoria
     */
    _estimateMemoryUsage() {
        let bytes = 0;
        for (const [_, opps] of this.cache) {
            bytes += opps.length * 8;  // 8 bytes por número
        }
        const mb = (bytes / 1024 / 1024).toFixed(2);
        return `${mb}MB`;
    }
    
    /**
     * 🎯 Cargar oportunidades para boletos
     * Función principal - robusta y profesional
     */
    async cargar(numerosOrdenados) {
        // ⚠️ Validación defensiva
        if (!this.isEnabled) {
            console.log('[OppManager] ℹ️ Oportunidades deshabilitadas en configuración');
            return false;
        }
        
        if (!Array.isArray(numerosOrdenados) || numerosOrdenados.length === 0) {
            console.warn('[OppManager] ⚠️ Array vacío o inválido');
            return false;
        }
        
        // Si ya está cargando, no iniciar otro process
        if (this.estado.cargando) {
            console.log('[OppManager] ⏳ Carga ya en progreso, aguardando...');
            return await this._esperarCompletado();
        }
        
        // Resetear estado
        this.estado = {
            cargando: true,
            completado: false,
            errores: 0,
            exitosos: 0,
            totalSolicitados: 0,
            boletosEnProceso: new Set(),
            ultimaActualizacion: null
        };
        
        const inicio = performance.now();
        this.estado.totalSolicitados = numerosOrdenados.length;
        
        try {
            // Separar en 2 grupos: en cache vs a pedir
            const { enCache, aPedir } = this._separarBoletosPorCache(numerosOrdenados);
            
            console.log('[OppManager] 📊 Análisis:', {
                total: numerosOrdenados.length,
                enCache: enCache.length,
                aPedir: aPedir.length,
                hitRate: `${((enCache.length / numerosOrdenados.length) * 100).toFixed(0)}%`
            });
            
            this.cacheMisses += aPedir.length;
            this.cacheHits += enCache.length;
            
            // Si no hay nada a pedir, listo
            if (aPedir.length === 0) {
                console.log('[OppManager] ✅ Todas en cache - completado instantáneamente');
                this.estado.completado = true;
                this.estado.cargando = false;
                this._emitEvent('onComplete', this.estado);
                return true;
            }
            
            // Pedir nuevas oportunidades
            await this._cargarEnBatches(aPedir);
            
            // Gestionar memory si está por límite
            this._gestionarMemory();
            
            const duracion = ((performance.now() - inicio) / 1000).toFixed(2);
            console.log('[OppManager] ✅ COMPLETADO', {
                duration: `${duracion}s`,
                exitosos: this.estado.exitosos,
                errores: this.estado.errores,
                cacheSize: this.cache.size,
                memory: this._estimateMemoryUsage()
            });
            
            this.estado.completado = true;
            this.estado.ultimaActualizacion = new Date();
            this._emitEvent('onComplete', this.estado);
            return true;
            
        } catch (error) {
            console.error('[OppManager] ❌ ERROR CRÍTICO:', error);
            this._emitEvent('onError', { error, estado: this.estado });
            // Graceful degradation: continuar sin oportunidades
            return false;
        } finally {
            this.estado.cargando = false;
        }
    }
    
    /**
     * 🔄 Esperar a que se complete la carga actual
     */
    async _esperarCompletado(timeoutMs = 30000) {
        const inicio = Date.now();
        while (this.estado.cargando && Date.now() - inicio < timeoutMs) {
            await new Promise(r => setTimeout(r, 100));
        }
        return this.estado.completado;
    }
    
    /**
     * 📦 Separar boletos en 2 grupos: cache hits vs misses
     */
    _separarBoletosPorCache(numeros) {
        const enCache = [];
        const aPedir = [];
        
        for (const num of numeros) {
            if (this.cache.has(num)) {
                enCache.push(num);
            } else {
                aPedir.push(num);
            }
        }
        
        return { enCache, aPedir };
    }
    
    /**
     * 🚀 Cargar en batches con control de concurrencia
     */
    async _cargarEnBatches(numeros) {
        // Crear batches
        const batches = [];
        for (let i = 0; i < numeros.length; i += this.BATCH_SIZE) {
            batches.push(numeros.slice(i, i + this.BATCH_SIZE));
        }
        
        console.log(`[OppManager] 📦 ${batches.length} batches de ${this.BATCH_SIZE} boletos`);
        
        // Pool de workers con control de concurrencia
        let indiceActual = 0;
        let enVuelo = 0;
        
        const procesarDelPool = async () => {
            while (indiceActual < batches.length) {
                const batch = batches[indiceActual];
                indiceActual++;
                enVuelo++;
                
                try {
                    await this._procesarBatch(batch);
                } catch (error) {
                    console.warn(`[OppManager] ⚠️ Batch falló, añadiendo a cola de reintentos`, error.message);
                    this.colaReintentos.push(batch);
                } finally {
                    enVuelo--;
                    
                    // Notificar progreso cada batch
                    const progreso = {
                        cargados: this.estado.exitosos,
                        errores: this.estado.errores,
                        total: this.estado.totalSolicitados,
                        porcentaje: Math.round((this.estado.exitosos / this.estado.totalSolicitados) * 100),
                        enVuelo
                    };
                    this._emitEvent('onProgress', progreso);
                    
                    // Log cada 10%
                    if (progreso.porcentaje % 10 === 0) {
                        console.log(`[OppManager] 📈 Progreso: ${progreso.porcentaje}%`);
                    }
                }
            }
        };
        
        // Iniciar MAX_CONCURRENT workers
        const numWorkers = Math.min(this.MAX_CONCURRENT, batches.length);
        const workers = Array(numWorkers).fill(null).map(() => procesarDelPool());
        
        await Promise.all(workers);
        
        // Procesar reintentos si los hay
        if (this.colaReintentos.length > 0) {
            console.log(`[OppManager] 🔄 Procesando ${this.colaReintentos.length} batches en reintentos...`);
            const reintentos = [...this.colaReintentos];
            this.colaReintentos = [];
            
            for (const batch of reintentos) {
                await new Promise(r => setTimeout(r, this.RETRY_DELAY_MS));
                try {
                    await this._procesarBatch(batch, true);
                } catch (error) {
                    console.error(`[OppManager] ❌ Batch falló en reintento:`, error.message);
                }
            }
        }
    }
    
    /**
     * 🎯 Procesar UN batch con reintentos
     */
    async _procesarBatch(batch, esReintento = false) {
        for (let intento = 0; intento <= this.MAX_REINTENTOS; intento++) {
            try {
                const response = await this._fetchConTimeout(
                    `${this.apiBaseUrl}/api/public/boletos/oportunidades/batch`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ numeros: batch })
                    },
                    this.TIMEOUT_MS
                );
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const data = await response.json();
                
                if (!data.success || !data.datos) {
                    throw new Error(data.message || 'Respuesta inválida del servidor');
                }
                
                // Guardar en cache
                let guardados = 0;
                for (const [numStr, opps] of Object.entries(data.datos)) {
                    if (Array.isArray(opps) && opps.length > 0) {
                        const num = parseInt(numStr, 10);
                        this.cache.set(num, opps);
                        guardados++;
                        this.estado.exitosos++;
                    }
                }
                
                console.log(`[OppManager] ✅ Batch procesado: ${guardados} oportunidades guardadas`);
                return;
                
            } catch (error) {
                if (intento === this.MAX_REINTENTOS) {
                    this.estado.errores += batch.length;
                    console.error(`[OppManager] ❌ Batch falló tras ${this.MAX_REINTENTOS + 1} intentos:`, error.message);
                    throw error;
                } else {
                    // Esperar antes de reintentar (con backoff)
                    const delayMs = this.RETRY_DELAY_MS * Math.pow(2, intento);
                    console.log(`[OppManager] ⏳ Reintentando en ${delayMs}ms... (intento ${intento + 1})`);
                    await new Promise(r => setTimeout(r, delayMs));
                }
            }
        }
    }
    
    /**
     * 🌐 Fetch con timeout robusto
     */
    async _fetchConTimeout(url, opts, timeoutMs) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        try {
            const response = await fetch(url, {
                ...opts,
                signal: controller.signal
            });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }
    
    /**
     * 💾 Gestionar uso de memoria
     */
    _gestionarMemory() {
        if (this.cache.size > this.MAX_CACHE_SIZE) {
            console.warn(`[OppManager] ⚠️ Cache excede limit (${this.cache.size} > ${this.MAX_CACHE_SIZE}), limpiando...`);
            
            // Mantener solo los últimos MAX_CACHE_SIZE/2 elementos más nuevos
            const toRemove = this.cache.size - (this.MAX_CACHE_SIZE / 2);
            let removed = 0;
            for (const [key] of this.cache) {
                if (removed >= toRemove) break;
                this.cache.delete(key);
                removed++;
            }
            
            console.log(`[OppManager] 🧹 Limpiado: ${removed} elementos (nuevo size: ${this.cache.size})`);
        }
    }
    
    /**
     * 📌 Obtener oportunidades de UN boleto
     */
    obtener(numero) {
        return this.cache.get(numero) || null;
    }
    
    /**
     * 📋 Obtener múltiples en batch
     */
    obtenerMultiples(numeros) {
        const result = {};
        for (const num of numeros) {
            const opps = this.cache.get(num);
            if (opps) result[num] = opps;
        }
        return result;
    }
    
    /**
     * 🎤 Event listeners
     */
    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
        return this;
    }
    
    _emitEvent(event, data) {
        if (this.listeners[event]) {
            for (const cb of this.listeners[event]) {
                try {
                    cb(data);
                } catch (e) {
                    console.error(`[OppManager] Error en listener de ${event}:`, e);
                }
            }
        }
    }
    
    /**
     * 🧹 Limpiar cache
     */
    limpiar() {
        this.cache.clear();
        this.estado = {
            cargando: false,
            completado: false,
            errores: 0,
            exitosos: 0,
            totalSolicitados: 0,
            boletosEnProceso: new Set(),
            ultimaActualizacion: null
        };
        console.log('[OppManager] 🧹 Cache limpiado');
    }
}

// ✅ Inicializar como singleton global
if (!window.oportunidadesManager) {
    window.oportunidadesManager = new OportunidadesManager();
}

console.log('✅ oportunidades-manager.js cargado');
