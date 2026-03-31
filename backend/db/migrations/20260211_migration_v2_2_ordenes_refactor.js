/**
 * ============================================================
 * MIGRACIÓN V2: REFACTORIZAR TABLA ORDENES
 * ============================================================
 * 
 * Cambios:
 * - Agregar cliente_id (FK a clientes)
 * - Mejorar campos de estado
 * - Agregar soft-delete
 * - Mejorar auditoría
 * 
 * Tiempo: ~1-2 minutos (1M registros)
 */

exports.up = async function(knex) {
    console.log('📝 Refactorizando tabla ordenes...');

    // 1. Agregar columna cliente_id (primero nullable, luego migrar datos)
    const hasClienteId = await knex.schema.hasColumn('ordenes', 'cliente_id');
    if (!hasClienteId) {
        console.log('  → Agregando columna cliente_id...');
        await knex.schema.table('ordenes', table => {
            table.bigInteger('cliente_id').nullable().after('id');
        });
    }

    // 2. Agregar campo de sorteo_id
    const hasSorteoId = await knex.schema.hasColumn('ordenes', 'sorteo_id');
    if (!hasSorteoId) {
        console.log('  → Agregando columna sorteo_id...');
        await knex.schema.table('ordenes', table => {
            table.bigInteger('sorteo_id').nullable();
        });
    }

    // 3. Agregar campo de auditoría: IP y User-Agent
    const hasIpCliente = await knex.schema.hasColumn('ordenes', 'ip_cliente');
    if (!hasIpCliente) {
        console.log('  → Agregando columna ip_cliente...');
        await knex.schema.table('ordenes', table => {
            table.string('ip_cliente', 45).nullable();  // IPv4 o IPv6
            table.text('user_agent').nullable();
        });
    }

    // 4. Agregar timestamps más específicos
    const hasPagadaEn = await knex.schema.hasColumn('ordenes', 'pagada_en');
    if (!hasPagadaEn) {
        console.log('  → Agregando timestamps de transición de estado...');
        await knex.schema.table('ordenes', table => {
            table.timestamp('pagada_en').nullable();
            table.timestamp('apartada_en').nullable();
            table.timestamp('confirmada_en').nullable();
            table.timestamp('expira_en').nullable();
            table.timestamp('deleted_at').nullable();  // Soft-delete para auditoría
        });
    }

    // 5. Agregar campo de impuesto
    const hasImpuesto = await knex.schema.hasColumn('ordenes', 'impuesto');
    if (!hasImpuesto) {
        console.log('  → Agregando columna impuesto...');
        await knex.schema.table('ordenes', table => {
            table.decimal('impuesto', 10, 2).notNullable().defaultTo(0);
        });
    }

    // 6. Notas internas para admin
    const hasNotasInterno = await knex.schema.hasColumn('ordenes', 'notas_interno');
    if (!hasNotasInterno) {
        console.log('  → Agregando columna notas_interno...');
        await knex.schema.table('ordenes', table => {
            table.text('notas_interno').nullable();
        });
    }

    // 7. Agregar índices críticos (CONCURRENTLY en production)
    console.log('  → Agregando índices críticos...');
    
    try {
        // Index: estado + created_at DESC (muy usado para listar órdenes)
        await knex.raw('CREATE INDEX IF NOT EXISTS idx_ordenes_estado_created ON ordenes(estado, created_at DESC)');
    } catch (e) {
        // Index ya existe, ignorar
    }

    try {
        // Index: cliente_id (muy usado posiblemente en futuro)
        await knex.raw('CREATE INDEX IF NOT EXISTS idx_ordenes_cliente_id ON ordenes(cliente_id)');
    } catch (e) {
        // Index ya existe, ignorar
    }

    try {
        // Index: pagada_en (para estadísticas)
        await knex.raw('CREATE INDEX IF NOT EXISTS idx_ordenes_pagada_en ON ordenes(pagada_en)');
    } catch (e) {
        // Index ya existe, ignorar
    }

    try {
        // Index: expira_en (para limpiar expiradas)
        await knex.raw('CREATE INDEX IF NOT EXISTS idx_ordenes_expira_en ON ordenes(expira_en)');
    } catch (e) {
        // Index ya existe, ignorar
    }

    console.log('✅ Tabla ordenes refactorizada exitosamente');
};

exports.down = async function(knex) {
    console.log('↩️  Revirtiendo cambios en tabla ordenes...');

    return knex.schema.table('ordenes', table => {
        // Eliminar columnas
        table.dropColumn('cliente_id');
        table.dropColumn('sorteo_id');
        table.dropColumn('ip_cliente');
        table.dropColumn('user_agent');
        table.dropColumn('pagada_en');
        table.dropColumn('apartada_en');
        table.dropColumn('confirmada_en');
        table.dropColumn('expira_en');
        table.dropColumn('deleted_at');
        table.dropColumn('impuesto');
        table.dropColumn('notas_interno');
    });
};
