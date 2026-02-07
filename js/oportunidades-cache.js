/**
 * ============================================================
 * ARCHIVO: js/oportunidades-cache.js
 * DESCRIPCIÓN: Gestor robusto de caché para oportunidades
 * Usa IndexedDB para almacenamiento eficiente de datos grandes
 * + localStorage para metadata + memory para acceso rápido
 * ============================================================
 */

class OportunidadesCacheManager {
    constructor() {
        this.db = null;
        this.storeName = 'oportunidades';
        this.memoryCache = null;
        this.memorySet = null; // Para búsquedas O(1)
        this.lastLoadTime = 0;
        this.isInitialized = false;
        this.initPromise = this.initdb();
    }

    /**
     * Inicializar IndexedDB
     */
    async initdb() {
        try {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('RifaPlusDB', 1);
                
                request.onerror = () => {
                    console.warn('⚠️ IndexedDB no disponible, usando fallback');
                    this.isInitialized = true;
                    resolve(false);
                };
                
                request.onsuccess = (e) => {
                    this.db = e.target.result;
                    this.isInitialized = true;
                    console.log('✅ [OportunidadesCache] IndexedDB inicializado');
                    resolve(true);
                };
                
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName, { keyPath: 'id' });
                        console.log('✅ [OportunidadesCache] Object Store creado');
                    }
                };
            });
        } catch (e) {
            console.warn('⚠️ Error inicializando IndexedDB:', e.message);
            this.isInitialized = true;
            return false;
        }
    }

    /**
     * Cargar datos desde backend con reintentos exponenciales
     */
    async cargarDelBackend(apiBase, maxRetries = 3) {
        let lastError = null;
        
        for (let intento = 0; intento < maxRetries; intento++) {
            try {
                const delayMs = Math.min(1000 * Math.pow(2, intento), 10000); // 1s, 2s, 4s...
                
                if (intento > 0) {
                    console.log(`🔄 [OportunidadesCache] Reintentando (${intento}/${maxRetries - 1}) después de ${delayMs}ms...`);
                    await new Promise(r => setTimeout(r, delayMs));
                }
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                
                const response = await fetch(`${apiBase}/api/public/oportunidades/disponibles`, {
                    signal: controller.signal,
                    cache: 'no-store',
                    headers: { 'Accept': 'application/json' }
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const json = await response.json();
                const disponibles = Array.isArray(json.disponibles) ? json.disponibles : [];
                
                if (disponibles.length === 0) {
                    throw new Error('Array vacío de oportunidades');
                }
                
                return disponibles;
            } catch (error) {
                lastError = error;
                console.warn(`❌ [OportunidadesCache] Intento ${intento + 1} falló: ${error.message}`);
            }
        }
        
        throw new Error(`No se pudieron cargar oportunidades después de ${maxRetries} intentos: ${lastError?.message}`);
    }

    /**
     * Guardar datos en IndexedDB (eficiente)
     */
    async guardarEnIndexedDB(disponibles) {
        if (!this.db) return false;
        
        try {
            return new Promise((resolve) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                
                // Limpiar antes
                store.clear();
                
                // Guardar con metadata
                const data = {
                    id: 'principal',
                    numeros: disponibles,
                    timestamp: Date.now(),
                    cantidad: disponibles.length
                };
                
                store.put(data);
                
                transaction.oncomplete = () => {
                    console.log(`✅ [OportunidadesCache] ${disponibles.length} registros guardados en IndexedDB`);
                    resolve(true);
                };
                
                transaction.onerror = () => {
                    console.warn('⚠️ Error guardando en IndexedDB');
                    resolve(false);
                };
            });
        } catch (e) {
            console.warn('⚠️ Error en guardarEnIndexedDB:', e.message);
            return false;
        }
    }

    /**
     * Cargar datos desde IndexedDB
     */
    async cargarDeIndexedDB() {
        if (!this.db) return null;
        
        try {
            return new Promise((resolve) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get('principal');
                
                request.onsuccess = () => {
                    const data = request.result;
                    if (data && Array.isArray(data.numeros)) {
                        const edad = Date.now() - data.timestamp;
                        console.log(`💾 [OportunidadesCache] Cargado desde IndexedDB: ${data.cantidad} (edad: ${(edad/60000).toFixed(1)}min)`);
                        resolve(data.numeros);
                    } else {
                        resolve(null);
                    }
                };
                
                request.onerror = () => resolve(null);
            });
        } catch (e) {
            console.warn('⚠️ Error en cargarDeIndexedDB:', e.message);
            return null;
        }
    }

    /**
     * WORKFLOW PRINCIPAL: Cargar oportunidades robustamente
     */
    async cargar(apiBase = 'http://localhost:5001') {
        try {
            // Esperar a que IndexedDB esté listo
            await this.initPromise;
            
            // 1️⃣ INTENTAR CARGAR DESDE INDEXEDDB PRIMERO
            const fromIndexedDB = await this.cargarDeIndexedDB();
            if (fromIndexedDB && fromIndexedDB.length > 0) {
                this.establecerEnMemory(fromIndexedDB);
                return { origen: 'indexeddb', cantidad: fromIndexedDB.length };
            }
            
            // 2️⃣ FALLBACK: Fetch desde backend con reintentos
            console.log('[OportunidadesCache] Cargando desde backend...');
            const disponibles = await this.cargarDelBackend(apiBase);
            
            // 3️⃣ Guardar en IndexedDB para futuro
            await this.guardarEnIndexedDB(disponibles);
            
            // 4️⃣ Establecer en memory para acceso rápido
            this.establecerEnMemory(disponibles);
            
            return { origen: 'backend', cantidad: disponibles.length };
        } catch (error) {
            console.error('❌ [OportunidadesCache] Error fatal:', error.message);
            return { origen: 'error', cantidad: 0, error: error.message };
        }
    }

    /**
     * Establecer datos en memoria con Set para búsquedas O(1)
     */
    establecerEnMemory(disponibles) {
        this.memoryCache = disponibles;
        this.memorySet = new Set(disponibles);
        this.lastLoadTime = Date.now();
        console.log(`⚡ [OportunidadesCache] ${disponibles.length} números en memoria (Set para búsquedas rápidas)`);
    }

    /**
     * Obtener todos los números
     */
    obtenerTodos() {
        return this.memoryCache || [];
    }

    /**
     * Verificar si un número está disponible (O(1))
     */
    tieneNumero(numero) {
        return this.memorySet ? this.memorySet.has(numero) : false;
    }

    /**
     * Obtener números aleatorios sin duplicados
     */
    obtenerAleatorios(cantidad) {
        if (!this.memoryCache || cantidad > this.memoryCache.length) {
            return [];
        }
        
        const resultado = [];
        const indices = new Set();
        
        while (resultado.length < cantidad) {
            const idx = Math.floor(Math.random() * this.memoryCache.length);
            if (!indices.has(idx)) {
                indices.add(idx);
                resultado.push(this.memoryCache[idx]);
            }
        }
        
        return resultado;
    }

    /**
     * Limpiar memoria si crece demasiado (prevenir memory leaks)
     */
    limpiarMemoriaLargo() {
        const limiteMaximo = 5 * 60 * 1000; // 5 minutos en memoria
        if (Date.now() - this.lastLoadTime > limiteMaximo) {
            console.log('🧹 [OportunidadesCache] Limpiando memoria (data antigua)');
            this.memoryCache = null;
            this.memorySet = null;
        }
    }

    /**
     * Estado del sistema (para debugging)
     */
    status() {
        return {
            inicializado: this.isInitialized,
            enMemory: this.memoryCache?.length || 0,
            enSet: this.memorySet?.size || 0,
            tiempoDesdeUltimaCarga: `${((Date.now() - this.lastLoadTime) / 1000).toFixed(1)}s`,
            indexeddbDisponible: !!this.db
        };
    }
}

// Instancia global
window.OportunidadesCacheManager = OportunidadesCacheManager;
window.oportunidadesCache = new OportunidadesCacheManager();

console.log('✅ oportunidades-cache.js cargado');
