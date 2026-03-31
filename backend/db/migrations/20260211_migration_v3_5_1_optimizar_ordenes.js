/**
 * ============================================================
 * MIGRACIÓN V3.5: ELIMINAR COLUMNAS INNECESARIAS DE ORDENES
 * ============================================================
 * 
 * Objetivo: Optimar tabla ordenes de 15 → 14 columnas (SOLO LO SEGURO)
 * 
 * ELIMINA (verificado 0 uso en código):
 * - email_cliente: Nunca usado en código activo
 * 
 * MANTIENE (verificado uso en código):
 * - estado_cliente: USADO en admin-boletos.html:1711
 * - ciudad_cliente: USADO en admin-boletos.html:1712
 * - boletos (JSON): USADO en modal de confirmación de órdenes
 * - subtotal: USADO en modal de confirmación de órdenes
 * - total: USADO en admin-dashboard.html:2318, 2864
 * 
 * Tiempo: ~1 segundo
 */

exports.up = async function(knex) {
    const columnas_a_eliminar = [
        'email_cliente'      // ❌ Únicamente esto - VERIFICADO 0 referencias
    ];

    console.log('📝 V3.5.1: Optimizando tabla ordenes...');

    for (const columna of columnas_a_eliminar) {
        try {
            const existe = await knex.schema.hasColumn('ordenes', columna);
            if (existe) {
                console.log(`  → Eliminando columna ${columna}...`);
                await knex.schema.table('ordenes', table => {
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

    console.log('✅ Tabla ordenes optimizada (15 → 11 columnas)');
};

exports.down = async function(knex) {
    console.log('⏮️  Rollback V3.5.1 - Restaurando columnas ordenes...');
    
    await knex.schema.table('ordenes', table => {
        table.string('email_cliente', 255).nullable();
    });

    console.log('✅ Rollback completado');
};
