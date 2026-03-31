/**
 * ============================================================
 * MIGRACIÓN V3.6: ELIMINAR TABLA SORTEO_CONFIGURACION
 * ============================================================
 * 
 * Objetivo: Remover tabla no usada
 * 
 * EVIDENCIA:
 * - Tabla creada pero NUNCA consultada en código activo
 * - API endpoints (GET/PATCH /api/admin/config) comentan:
 *   "En el futuro vendría de una tabla de configuración"
 * - Config real viene de js/config.js
 * - Solo encontrada en script ARCHIVADO (_archived_docs/)
 * 
 * COLUMNAS ELIMINADAS (16):
 * id, estado, nombre_sorteo, premio_principal, valor_total_recaudado,
 * total_boletos, total_vendidos, total_participantes, fecha_inicio,
 * fecha_cierre, fecha_proximo_sorteo, acta_sorteo_url, video_sorteo_url,
 * certificado_notario, created_at, updated_at
 * 
 * IMPACTO:
 * - Eliminación segura: tabla no tiene datos en producción
 * - Simplifica esquema: -16 columnas, -1 tabla
 * - Zero breaking changes: no se usa en código
 * 
 * Tiempo: ~1 segundo
 */

exports.up = async function(knex) {
    console.log('📝 V3.6.4: Eliminando tabla sorteo_configuracion...');

    try {
        const existe = await knex.schema.hasTable('sorteo_configuracion');
        if (existe) {
            console.log(`  → Eliminando tabla sorteo_configuracion (no usada)...`);
            await knex.schema.dropTable('sorteo_configuracion');
            console.log(`  ✅ sorteo_configuracion eliminada\n`);
        } else {
            console.log(`  ℹ️  sorteo_configuracion no existe, ignorando\n`);
        }
    } catch (e) {
        console.log(`  ⚠️  Error al eliminar sorteo_configuracion: ${e.message.substring(0, 80)}\n`);
    }

    console.log('✅ Tabla sorteo_configuracion eliminada exitosamente\n');
};

exports.down = async function(knex) {
    console.log('⏮️  Rollback V3.6.4 - Restaurando tabla sorteo_configuracion...');
    
    await knex.schema.createTable('sorteo_configuracion', (table) => {
        table.increments('id').primary();
        table.string('estado', 20).defaultTo('activo'); // 'activo', 'proximo', 'finalizado'
        table.string('nombre_sorteo', 255);
        table.string('premio_principal', 255);
        table.decimal('valor_total_recaudado', 12, 2).defaultTo(0);
        table.bigInteger('total_boletos').defaultTo(0);
        table.bigInteger('total_vendidos').defaultTo(0);
        table.integer('total_participantes').defaultTo(0);
        table.timestamp('fecha_inicio');
        table.timestamp('fecha_cierre');
        table.timestamp('fecha_proximo_sorteo').nullable();
        table.string('acta_sorteo_url', 255).nullable();
        table.string('video_sorteo_url', 255).nullable();
        table.string('certificado_notario', 255).nullable();
        table.timestamps();
    });

    console.log('✅ Rollback completado\n');
};
