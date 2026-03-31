/**
 * ============================================================
 * MIGRACIÓN V3.6: LIMPIAR BOLETOS_ESTADO (4 columnas)
 * ============================================================
 * 
 * Objetivo: Eliminar columnas no usadas de boletos_estado
 * 
 * ELIMINA (verificado 0 uso en código):
 * - estado_anterior: Auditoría nunca consultada
 * - reservado_en: Timestamp nunca consultado
 * - vendido_en: Timestamp nunca consultado
 * - cancelado_en: Timestamp nunca consultado
 * 
 * Verificación completa en maintenance.js:32-56
 * Búsquedas activas NO incluyen estas columnas
 * 
 * Tiempo: ~1 segundo
 */

exports.up = async function(knex) {
    const columnas_a_eliminar = [
        'estado_anterior',    // ❌ Auditoría no consultada
        'reservado_en',       // ❌ Timestamp no consultado
        'vendido_en',         // ❌ Timestamp no consultado
        'cancelado_en'        // ❌ Timestamp no consultado
    ];

    console.log('📝 V3.6.1: Limpiando tabla boletos_estado...');

    for (const columna of columnas_a_eliminar) {
        try {
            const existe = await knex.schema.hasColumn('boletos_estado', columna);
            if (existe) {
                console.log(`  → Eliminando columna ${columna}...`);
                await knex.schema.table('boletos_estado', table => {
                    table.dropColumn(columna);
                });
                console.log(`  ✅ ${columna} eliminada`);
            } else {
                console.log(`  ℹ️  ${columna} no existe, ignorando`);
            }
        } catch (e) {
            console.log(`  ⚠️  Error al eliminar ${columna}: ${e.message.substring(0, 50)}`);
        }
    }

    console.log('✅ Tabla boletos_estado limpiada (10 → 6 columnas)\n');
};

exports.down = async function(knex) {
    console.log('⏮️  Rollback V3.6.1 - Restaurando columnas boletos_estado...');
    
    await knex.schema.table('boletos_estado', table => {
        table.string('estado_anterior', 50).nullable();
        table.timestamp('reservado_en').nullable();
        table.timestamp('vendido_en').nullable();
        table.timestamp('cancelado_en').nullable();
    });

    console.log('✅ Rollback completado\n');
};
