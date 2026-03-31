/**
 * ============================================================
 * MIGRACIÓN V3: LIMPIAR COLUMNAS INNECESARIAS DE ORDENES
 * ============================================================
 * 
 * Elimina columnas que NO USA la aplicación:
 * - cliente_id (redundante, tienes nombre_cliente)
 * - sorteo_id (no tienes múltiples sorteos)
 * - ip_cliente, user_agent (innecesario para rifa web)
 * - pagada_en, apartada_en, confirmada_en, expira_en (4 timestamps redundantes)
 * - deleted_at (tienes estado enum, no necesitas soft-delete)
 * - impuesto (siempre es 0)
 * - notas_interno (feature minor, puede ir en otro lado)
 * 
 * Tiempo: ~30 segundos
 */

exports.up = async function(knex) {
    console.log('📝 V3.1: Limpiando columnas innecesarias en ordenes...');

    const hasClienteId = await knex.schema.hasColumn('ordenes', 'cliente_id');
    const hasSorteoId = await knex.schema.hasColumn('ordenes', 'sorteo_id');
    const hasIpCliente = await knex.schema.hasColumn('ordenes', 'ip_cliente');
    const hasUserAgent = await knex.schema.hasColumn('ordenes', 'user_agent');
    const hasPagadaEn = await knex.schema.hasColumn('ordenes', 'pagada_en');
    const hasApartadaEn = await knex.schema.hasColumn('ordenes', 'apartada_en');
    const hasConfirmadaEn = await knex.schema.hasColumn('ordenes', 'confirmada_en');
    const hasExpiraEn = await knex.schema.hasColumn('ordenes', 'expira_en');
    const hasDeletedAt = await knex.schema.hasColumn('ordenes', 'deleted_at');
    const hasImpuesto = await knex.schema.hasColumn('ordenes', 'impuesto');
    const hasNotasInterno = await knex.schema.hasColumn('ordenes', 'notas_interno');

    const columnasAEliminar = [];
    if (hasClienteId) columnasAEliminar.push('cliente_id');
    if (hasSorteoId) columnasAEliminar.push('sorteo_id');
    if (hasIpCliente) columnasAEliminar.push('ip_cliente');
    if (hasUserAgent) columnasAEliminar.push('user_agent');
    if (hasPagadaEn) columnasAEliminar.push('pagada_en');
    if (hasApartadaEn) columnasAEliminar.push('apartada_en');
    if (hasConfirmadaEn) columnasAEliminar.push('confirmada_en');
    if (hasExpiraEn) columnasAEliminar.push('expira_en');
    if (hasDeletedAt) columnasAEliminar.push('deleted_at');
    if (hasImpuesto) columnasAEliminar.push('impuesto');
    if (hasNotasInterno) columnasAEliminar.push('notas_interno');

    if (columnasAEliminar.length > 0) {
        console.log(`  → Eliminando ${columnasAEliminar.length} columnas innecesarias...`);
        await knex.schema.table('ordenes', table => {
            columnasAEliminar.forEach(col => {
                table.dropColumn(col);
            });
        });
        console.log(`  ✅ Eliminadas: ${columnasAEliminar.join(', ')}`);
    } else {
        console.log('  ⚠️  No hay columnas para eliminar');
    }

    console.log('✅ Columnas de ordenes optimizadas');
};

exports.down = async function(knex) {
    console.log('↩️  V3.1: Revirtiendo limpieza de ordenes...');

    await knex.schema.table('ordenes', table => {
        table.bigInteger('cliente_id').nullable();
        table.bigInteger('sorteo_id').nullable();
        table.string('ip_cliente', 45).nullable();
        table.text('user_agent').nullable();
        table.timestamp('pagada_en').nullable();
        table.timestamp('apartada_en').nullable();
        table.timestamp('confirmada_en').nullable();
        table.timestamp('expira_en').nullable();
        table.timestamp('deleted_at').nullable();
        table.decimal('impuesto', 10, 2).notNullable().defaultTo(0);
        table.text('notas_interno').nullable();
    });
};
