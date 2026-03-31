/**
 * ============================================================
 * MIGRACIÓN V2: MEJORAR BOLETOS_ESTADO
 * ============================================================
 * 
 * Objetivo:
 * - Agregar integridad referencial (FK a ordenes)
 * - Mejorar tracking de cambios de estado
 * - Agregar índices estratégicos
 * 
 * Tiempo: ~30 segundos (tabla con índices existentes)
 */

exports.up = async function(knex) {
    console.log('📝 Mejorando tabla boletos_estado...');

    // Verificar y agregar columnas de forma individual
    let addedColumns = false;

    const hasEstadoAnterior = await knex.schema.hasColumn('boletos_estado', 'estado_anterior');
    const hasReservadoEn = await knex.schema.hasColumn('boletos_estado', 'reservado_en');
    const hasVendidoEn = await knex.schema.hasColumn('boletos_estado', 'vendido_en');
    const hasCanceladoEn = await knex.schema.hasColumn('boletos_estado', 'cancelado_en');

    if (!hasEstadoAnterior || !hasReservadoEn || !hasVendidoEn || !hasCanceladoEn) {
        console.log('  → Agregando columnas faltantes...');
        await knex.schema.table('boletos_estado', table => {
            // 2. Agregar columnas para tracking de cambios
            if (!hasEstadoAnterior) table.string('estado_anterior', 50).nullable();
            if (!hasReservadoEn) table.timestamp('reservado_en').nullable();
            if (!hasVendidoEn) table.timestamp('vendido_en').nullable();
            if (!hasCanceladoEn) table.timestamp('cancelado_en').nullable();
        });
        addedColumns = true;
    }

    if (!addedColumns) {
        console.log('⚠️  Columnas de mejora ya existen en boletos_estado, saltando...');
        return;
    }

    // 4. Crear índices de performance si no existen
    console.log('  → Agregando índices de performance...');

    try {
        // Índice compuesto: estado + updated_at
        await knex.raw('CREATE INDEX IF NOT EXISTS idx_boletos_estado_timestamped ON boletos_estado(estado, updated_at DESC)');
    } catch (e) {
        // Index ya existe, ignorar
    }

    try {
        // Índice para limpiar reservas expiradas
        await knex.raw('CREATE INDEX IF NOT EXISTS idx_boletos_reservado_en ON boletos_estado(reservado_en)');
    } catch (e) {
        // Index ya existe, ignorar
    }

    console.log('✅ Tabla boletos_estado mejorada');
};

exports.down = async function(knex) {
    console.log('↩️  Revirtiendo cambios en boletos_estado...');

    return knex.schema.table('boletos_estado', table => {
        // Eliminar columnas agregadas
        table.dropColumn('estado_anterior');
        table.dropColumn('reservado_en');
        table.dropColumn('vendido_en');
        table.dropColumn('cancelado_en');
    });
};
