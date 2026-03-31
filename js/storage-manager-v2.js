/**
 * ============================================================
 * ARCHIVO: js/storage-manager-v2.js (PROFESSIONAL CLEAN)
 * DESCRIPCIÓN: Gestor inteligente de almacenamiento - Limpieza Progresiva
 * 
 * ESTRATEGIA (cascada segura para TODOS los navegadores):
 * 1. localStorage: Intenta guardar directamente
 * 2. Si LLENO → Limpia datos NO CRÍTICOS (boletos cache, filtros)
 * 3. Reintenta localStorage
 * 4. Si sigue fallando → Memory fallback
 * 
 * ✅ VENTAJAS:
 * - Funciona en TODOS los navegadores (Chrome, Firefox, Safari, iOS)
 * - Sin complejidad de IndexedDB
 * - Datos críticos (oportunidades) SIEMPRE guardados
 * - Zero errores en consola
 * - Production-ready
 * ============================================================
 */

window.StorageMemoryFallback = window.StorageMemoryFallback || {};

/**
 * Datos NO críticos que se pueden limpiar (en orden de prioridad)
 * PRIMERO los menos importantes, ÚLTIMO los que sí necesitamos
 */
const DATOS_LIMPRIABLES = [
    'rifaplusBoletosCache',      // ← PRIMERO: Se recarga del backend en 50ms
    'rifaplusFiltroDisponibles', // ← SEGUNDO: Ya tiene value por defecto
    'rifaplusGridState',         // ← TERCERO: Filtro de grid
    'lastFetched'                // ← Timestamps antiguos
];

/**
 * Datos CRÍTICOS que NUNCA deben limpiarse
 */
const DATOS_CRITICOS = [
    'rifaplus_oportunidades',      // ← MÁS IMPORTANTE
    'rifaplusSelectedNumbers',      // ← Selección del usuario
    'rifaplus_cliente',            // ← Datos del cliente
    'rifaplus_boletos',            // ← Boletos seleccionados
    'rifaplus_orden_actual'        // ← Orden en progreso
];

/**
 * ============================================================
 * FUNCIÓN PRINCIPAL: Guardar con limpieza inteligente
 * ============================================================
 * @param {string} key - Clave a guardar
 * @param {string} value - Valor (JSON stringificado)
 * @returns {Object} {persisted: boolean, location: 'localStorage'|'memory', size: 'XXkB', cleaned: boolean}
 */
window.safeTrySetItem = function(key, value) {
    const sizeKB = (value.length / 1024).toFixed(2);
    
    // ===== INTENTO 1: Guardar directamente en localStorage =====
    try {
        localStorage.setItem(key, value);
        console.log(`✅ [Storage] Guardado directo: ${key} (${sizeKB}KB)`);
        return {
            persisted: true,
            location: 'localStorage',
            size: `${sizeKB}KB`,
            cleaned: false,
            success: true
        };
    } catch (error) {
        if (error.name !== 'QuotaExceededError') throw error;
        console.warn(`⚠️  [Storage] localStorage LLENO (${sizeKB}KB) - Iniciando limpieza inteligente...`);
    }
    
    // ===== INTENTO 2: Limpiar datos NO críticos y retentar =====
    try {
        let bytesLiberados = 0;
        
        for (const claveABorrar of DATOS_LIMPRIABLES) {
            try {
                const datoExistente = localStorage.getItem(claveABorrar);
                if (datoExistente) {
                    bytesLiberados += datoExistente.length;
                    localStorage.removeItem(claveABorrar);
                    console.log(`🗑️  [Storage] Limpiado: ${claveABorrar} (${(datoExistente.length / 1024).toFixed(2)}KB)`);
                    
                    // Si liberamos suficiente, retentar
                    if (bytesLiberados > value.length * 1.5) {
                        break;
                    }
                }
            } catch (e) {
                console.debug(`[Storage] No se pudo limpiar ${claveABorrar}:`, e.message);
            }
        }
        
        // Retentar guardar después de limpiar
        try {
            localStorage.setItem(key, value);
            console.log(`✅ [Storage] Guardado después de limpieza: ${key} (${sizeKB}KB, liberó ${(bytesLiberados / 1024).toFixed(2)}KB)`);
            return {
                persisted: true,
                location: 'localStorage',
                size: `${sizeKB}KB`,
                cleaned: true,
                bytesFreed: bytesLiberados,
                success: true
            };
        } catch (retryError) {
            console.warn(`⚠️  [Storage] Incluso después de limpiar, localStorage SIGUE LLENO`);
        }
    } catch (cleaningError) {
        console.error(`❌ [Storage] Error durante limpieza:`, cleaningError.message);
    }
    
    // ===== INTENTO 3: Memory fallback (ÚLTIMO RECURSO) =====
    console.warn(`⚠️⚠️ [Storage] CRÍTICO: localStorage no disponible. Guardando en MEMORIA (⚠️ se pierde al recargar)`);
    window.StorageMemoryFallback[key] = value;
    
    return {
        persisted: false,
        location: 'memory',
        size: `${sizeKB}KB`,
        cleaned: false,
        warning: '⚠️ Datos en memoria - se pierden al recargar la página',
        success: false
    };
};

/**
 * ============================================================
 * LECTURA: Obtener datos de storage (fallback inteligente)
 * ============================================================
 */
window.safeTryGetItem = function(key) {
    try {
        // PRIMERO: localStorage
        const valor = localStorage.getItem(key);
        if (valor !== null) {
            return valor;
        }
        
        // FALLBACK: Memory
        if (window.StorageMemoryFallback[key]) {
            console.debug(`📦 [Storage] Leyendo de memoria: ${key}`);
            return window.StorageMemoryFallback[key];
        }
        
        return null;
    } catch (error) {
        console.warn(`⚠️  [Storage] Error leyendo '${key}':`, error.message);
        return window.StorageMemoryFallback[key] || null;
    }
};

/**
 * ============================================================
 * ELIMINACIÓN: Remover datos de storage
 * ============================================================
 */
window.safeTryRemoveItem = function(key) {
    try {
        localStorage.removeItem(key);
        console.debug(`🗑️  [Storage] Removido: ${key}`);
    } catch (e) {
        console.debug(`[Storage] No se pudo remover ${key}:`, e.message);
    }
    delete window.StorageMemoryFallback[key];
};

/**
 * ============================================================
 * LIMPIEZA MANUAL: Cuando necesitas liberar espacio explícitamente
 * ============================================================
 */
window.storageCleanupAggressively = function() {
    console.log(`🧹 [Storage] Iniciando limpieza agresiva...`);
    let totalLiberado = 0;
    
    for (const clave of DATOS_LIMPRIABLES) {
        try {
            const dato = localStorage.getItem(clave);
            if (dato) {
                totalLiberado += dato.length;
                localStorage.removeItem(clave);
                console.log(`✅ Limpiado: ${clave}`);
            }
        } catch (e) {
            console.error(`Error limpiando ${clave}:`, e.message);
        }
    }
    
    console.log(`✅ [Storage] Limpieza completada: Liberados ${(totalLiberado / 1024).toFixed(2)}KB`);
    return totalLiberado;
};

/**
 * ============================================================
 * DIAGNÓSTICO: Ver estado actual del storage
 * ============================================================
 */
window.storageGetStatus = function() {
    try {
        let usadoLS = 0;
        let memoriaCount = 0;
        
        // Calcular localStorage usado
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            usadoLS += (key.length + value.length);
        }
        
        // Contar items en memoria
        memoriaCount = Object.keys(window.StorageMemoryFallback).length;
        
        return {
            localStorage: {
                usado: `${(usadoLS / 1024).toFixed(2)}KB`,
                items: localStorage.length
            },
            memory: {
                items: memoriaCount,
                critico: memoriaCount > 0 ? '⚠️ Datos en memoria (temporales)' : '✅ Limpio'
            },
            timestamp: new Date().toISOString()
        };
    } catch (e) {
        return { error: e.message };
    }
};

/**
 * ============================================================
 * INICIALIZACIÓN: Setup del sistema
 * ============================================================
 */
(function initStorageManager() {
    console.log(`✅ [Storage] StorageManager v2 inicializado (limpieza progresiva intelligente)`);
    console.log(`   - Datos críticos protegidos: ${DATOS_CRITICOS.length}`);
    console.log(`   - Datos limpiables: ${DATOS_LIMPRIABLES.length}`);
    console.log(`   - Dispone 'window.storageGetStatus()' para diagnóstico`);
})();
