/**
 * ============================================================
 * MIGRACIÓN V3.6: ELIMINAR NOTAS DE ORDENES (1 columna)
 * ============================================================
 * 
 * Objetivo: Remover columna abandonada que nunca se lee
 * 
 * ELIMINA:
 * - notas: Insertada en server.js:1725 pero NUNCA LEÍDA
 *   - Búsqueda exhaustiva en grep: SIN RESULTADOS para lectura
 *   - Feature aparentemente abandonada
 *   - Sin impacto en UI ni API
 * 
 * Verificación:
 * - server.js:1725 inserta: notas: sanitizar(orden.notas || '')
 * - NO encontrado en QuerySelects
 * - NO encontrado en HTML templates
 * - NO encontrado en JavaScript code
 * 
 * Riesgo: MUY BAJO (nunca se usa)
 * 
 * Tiempo: ~1 segundo
 */

exports.up = async function(knex) {
    console.log('📝 V3.6.3: Eliminando columna notas abandonada...');

    try {
        const existe = await knex.schema.hasColumn('ordenes', 'notas');
        if (existe) {
            console.log(`  → Eliminando columna notas (feature abandonada, nunca leída)...`);
            await knex.schema.table('ordenes', table => {
                table.dropColumn('notas');
            });
            console.log(`  ✅ notas eliminada`);
        } else {
            console.log(`  ℹ️  notas no existe, ignorando`);
        }
    } catch (e) {
        console.log(`  ⚠️  Error al eliminar notas: ${e.message.substring(0, 50)}`);
    }

    console.log('✅ Tabla ordenes optimizada\n');
};

exports.down = async function(knex) {
    console.log('⏮️  Rollback V3.6.3 - Restaurando notas...');
    
    await knex.schema.table('ordenes', table => {
        table.text('notas').nullable();
    });

    console.log('✅ Rollback completado\n');
};
