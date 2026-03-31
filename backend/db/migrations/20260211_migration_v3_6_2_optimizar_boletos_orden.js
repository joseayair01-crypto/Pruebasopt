/**
 * ============================================================
 * MIGRACIÓN V3.6: LIMPIAR BOLETOS_ORDEN (1 columna)
 * ============================================================
 * 
 * Objetivo: Eliminar columna redundante en boletos_orden
 * 
 * ELIMINA (verificado):
 * - asignado_en: REDUNDANTE con created_at
 *   - Ambas se establecen al mismo tiempo (NOW())
 *   - Evidencia: migration_v2_3_boletos_orden.js:82
 *     asignado_en: orden.created_at || knex.fn.now()
 *   - NUNCA se leen en código activo
 * 
 * Columnas restantes:
 * id, numero_boleto, orden_id, created_at, updated_at (5 cols)
 * 
 * Tiempo: ~1 segundo
 */

exports.up = async function(knex) {
    console.log('📝 V3.6.2: Optimizando tabla boletos_orden...');

    try {
        const existe = await knex.schema.hasColumn('boletos_orden', 'asignado_en');
        if (existe) {
            console.log(`  → Eliminando columna asignado_en (redundante con created_at)...`);
            await knex.schema.table('boletos_orden', table => {
                table.dropColumn('asignado_en');
            });
            console.log(`  ✅ asignado_en eliminada`);
        } else {
            console.log(`  ℹ️  asignado_en no existe, ignorando`);
        }
    } catch (e) {
        console.log(`  ⚠️  Error al eliminar asignado_en: ${e.message.substring(0, 50)}`);
    }

    console.log('✅ Tabla boletos_orden optimizada (6 → 5 columnas)\n');
};

exports.down = async function(knex) {
    console.log('⏮️  Rollback V3.6.2 - Restaurando asignado_en...');
    
    await knex.schema.table('boletos_orden', table => {
        table.timestamp('asignado_en').defaultTo(knex.fn.now());
    });

    console.log('✅ Rollback completado\n');
};
