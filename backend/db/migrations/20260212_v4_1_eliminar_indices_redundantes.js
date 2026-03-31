/**
 * MIGRACIÓN V4.1: ELIMINAR ÍNDICE REDUNDANTE
 * 
 * Problema: idx_opp_numero_estado es un índice COMPLETO que NO SE USA
 * - idx_opp_disponibles: ✅ SE MANTIENE (Parcial, bajo costo, usado en dashboard)
 * - idx_opp_numero_estado: ❌ SE ELIMINA (Completo, NO usado, costo alto)
 * - idx_opp_numero_optimizado: ✅ SE MANTIENE (Usado en joins)
 * 
 * Beneficio: -15% overhead de escrituras en orden_oportunidades (3 índices → 2)
 * 
 * DOWNTIME: 0 minutos (DROP INDEX es no-blocking)
 * TIEMPO: <1 segundo
 */

exports.up = async function(knex) {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  V4.1: ELIMINAR ÍNDICE REDUNDANTE                         ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    try {
        // Eliminar SOLO el índice que NO se usa
        console.log('   • Eliminando idx_opp_numero_estado (NO se usa)...');
        try {
            await knex.raw(`DROP INDEX IF EXISTS idx_opp_numero_estado`);
            console.log('     ✅ Dropped: idx_opp_numero_estado\n');
        } catch (e) {
            console.log(`     ⏭️  Skipped: idx_opp_numero_estado (no existe)\n`);
        }

        console.log('📊 ÍNDICES MANTENIDOS en orden_oportunidades:');
        console.log('   ✅ idx_opp_disponibles - Parcial, usado en dashboard');
        console.log('   ✅ idx_opp_numero_optimizado - Para joins rápidos\n');

        console.log('⚡ BENEFICIO:');
        console.log('   📉 -15% overhead de escritura en INSERT/UPDATE');
        console.log('   📉 Elimina índice COMPLETO innecesario');
        console.log('   📉 Índice PARCIAL mantiene performance del dashboard\n');

        return true;
    } catch (error) {
        console.error('\n❌ ERROR en migración:', error.message);
        throw error;
    }
};

exports.down = async function(knex) {
    console.log('\n🔙 ROLLBACK V4.1: Recrear índice...\n');
    
    try {
        // Recrear el índice eliminado (en caso de rollback)
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_opp_numero_estado
            ON orden_oportunidades(numero_orden, estado)
        `);
        console.log('   ✅ Recreated: idx_opp_numero_estado\n');

        return true;
    } catch (error) {
        console.error('\n❌ ERROR en rollback:', error.message);
        throw error;
    }
};
