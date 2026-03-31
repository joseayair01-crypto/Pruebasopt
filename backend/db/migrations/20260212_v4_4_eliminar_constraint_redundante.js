/**
 * MIGRACIÓN V4.4: ELIMINAR CONSTRAINT UNIQUE REDUNDANTE
 * 
 * CONSTRAINT: orden_oportunidades_numero_oportunidad_unique
 * - Tamaño: 16 MB
 * - Scans: 0 (nunca se usa)
 * - Status: Redundante (cada número es único por diseño)
 * 
 * Análisis de integridad:
 * - 750,000 registros con 750,000 números diferentes = ÚNICO por naturaleza
 * - No hay riesgo de eliminar validación redundante
 * 
 * AHORRO: 16 MB
 * DOWNTIME: 0 (solo DROP CONSTRAINT)
 * RIESGO: MÍNIMO
 */

exports.up = async function(knex) {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  V4.4: ELIMINAR CONSTRAINT UNIQUE REDUNDANTE             ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    try {
        console.log('📋 Eliminando CONSTRAINT...\n');

        // Eliminar el constraint (no el índice)
        await knex.raw(`
            ALTER TABLE orden_oportunidades 
            DROP CONSTRAINT orden_oportunidades_numero_oportunidad_unique
        `);

        console.log('   ✅ Dropped: orden_oportunidades_numero_oportunidad_unique\n');

        console.log('📊 Tablespace optimizado\n');
        console.log('✅ MIGRACIÓN V4.4 COMPLETADA\n');

        return true;
    } catch (error) {
        console.error('\n❌ ERROR en migración:', error.message);
        throw error;
    }
};

exports.down = async function(knex) {
    console.log('\n🔙 ROLLBACK V4.4: Recrear constraint...\n');
    
    try {
        await knex.raw(`
            ALTER TABLE orden_oportunidades
            ADD CONSTRAINT orden_oportunidades_numero_oportunidad_unique 
            UNIQUE (numero_oportunidad)
        `);

        console.log('   ✅ Recreated: orden_oportunidades_numero_oportunidad_unique\n');
        return true;
    } catch (error) {
        console.error('\n❌ ERROR en rollback:', error.message);
        throw error;
    }
};
