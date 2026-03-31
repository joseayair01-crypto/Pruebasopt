#!/usr/bin/env node

/**
 * ============================================================
 * LIMPIAR CACHÉ DE STATS
 * ============================================================
 */

// Acceder a global y limpiar
global.boletosStatsCache = null;
global.boletosStatsCacheTime = null;

console.log('\n✅ Caché global limpia\n');
console.log('Ahora /api/public/boletos/stats recalculará correctamente.\n');
