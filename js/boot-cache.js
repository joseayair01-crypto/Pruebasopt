/**
 * ============================================================
 * ARCHIVO: js/boot-cache.js
 * PROPÓSITO: Inicialización explícita del OportunidadesCacheManager
 * Asegura que el cache esté disponible antes de usarlo
 * ============================================================
 */

console.log('[boot-cache] 🚀 Iniciando...');

// Step 1: Verificar que OportunidadesCacheManager está disponible
if (!window.OportunidadesCacheManager) {
    console.error('[boot-cache] ❌ OportunidadesCacheManager clase no encontrada');
}

// Step 2: Crear instancia
try {
    if (!window.oportunidadesCache) {
        window.oportunidadesCache = new OportunidadesCacheManager();
        console.log('[boot-cache] ✅ Instancia OportunidadesCacheManager creada');
    } else {
        console.log('[boot-cache] ℹ️ Instancia ya existe');
    }
} catch (error) {
    console.error('[boot-cache] ❌ Error al crear instancia:', error.message);
}

// Step 3: Verificar estado
console.log('[boot-cache] 📊 Estado:', {
    cacheExists: !!window.oportunidadesCache,
    isInitialized: window.oportunidadesCache?.isInitialized,
    timestamp: new Date().toISOString()
});

// Marcar como inicializado
window.oportunidadesCacheBootReady = true;
console.log('[boot-cache] ✅ Boot completado');
