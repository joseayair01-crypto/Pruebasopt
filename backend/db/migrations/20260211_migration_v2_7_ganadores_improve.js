/**
 * ============================================================
 * MIGRACIÓN V2: MEJORAR TABLA GANADORES
 * ============================================================
 * 
 * Objetivo: Integridad referencial + timestamps de estado
 * 
 * Tiempo: ~20 segundos
 */

exports.up = async function(knex) {
    const hasSorteoId = await knex.schema.hasColumn('ganadores', 'sorteo_id');
    
    if (hasSorteoId) {
        console.log('⚠️  Tabla ganadores ya tiene sorteo_id, saltando...');
        return;
    }

    console.log('📝 Mejorando tabla ganadores...');

    // Para ganadores, probablemente ya tenemos numero_orden que referencia ordenes
    // Vamos a agregar FK explícito y mejoras de auditoría

    await knex.schema.table('ganadores', table => {
        // Agregar sorteo_id si no existe
        const hasSorteoId = knex.schema.hasColumn('ganadores', 'sorteo_id');
        if (!hasSorteoId) {
            table.bigInteger('sorteo_id').nullable();
        }

        // Agregar timestamps de estado si no existen
        const hasFechaSorteo = knex.schema.hasColumn('ganadores', 'fecha_sorteo');
        if (!hasFechaSorteo) {
            table.timestamp('fecha_sorteo').notNullable().defaultTo(knex.fn.now());
        }

        // Soft-delete
        const hasDeletedAt = knex.schema.hasColumn('ganadores', 'deleted_at');
        if (!hasDeletedAt) {
            table.timestamp('deleted_at').nullable();
        }

        // Rastreo de envío
        const hasCódigoRastreo = knex.schema.hasColumn('ganadores', 'codigo_rastreo');
        if (!hasCódigoRastreo) {
            table.string('codigo_rastreo', 100).nullable();
        }
    });

    // Agregar índices
    console.log('  → Agregando índices...');

    try {
        await knex.raw('CREATE INDEX IF NOT EXISTS idx_ganadores_sorteo_id ON ganadores(sorteo_id)');
    } catch (e) {
        // Index ya existe, ignorar
    }

    try {
        await knex.raw('CREATE INDEX IF NOT EXISTS idx_ganadores_numero_orden ON ganadores(numero_orden)');
    } catch (e) {
        // Index ya existe, ignorar
    }

    console.log('✅ Tabla ganadores mejorada');
};

exports.down = async function(knex) {
    console.log('↩️  Revirtiendo cambios en ganadores...');

    return knex.schema.table('ganadores', table => {
        table.dropColumn('sorteo_id');
        table.dropColumn('deleted_at');
        table.dropColumn('codigo_rastreo');
    });
};
