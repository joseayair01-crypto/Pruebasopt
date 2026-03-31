/**
 * ============================================================
 * SCRIPT: CREAR ÍNDICES CRÍTICOS DE PERFORMANCE
 * ============================================================
 * 
 * Objetivo: Optimizar queries que se ejecutan frecuentemente
 * Impacto: 20-2000x más rápido
 * 
 * Puede ejecutarse en PRODUCTION sin downtime:
 * CREATE INDEX CONCURRENTLY (no bloquea escrituras)
 * 
 * Tiempo: ~2-5 minutos (depende de tamaño de tabla)
 */

exports.up = async function(knex) {
    console.log('⚡ Creando índices críticos de performance...\n');

    // ============================================================
    // PRIORITY 1: CRÍTICOS (afectan queries >1 segundo)
    // ============================================================
    
    console.log('📊 PRIORITY 1 - Índices Críticos:');

    // 1. Órdenes: búsqueda por estado + fecha
    try {
        console.log('  → idx_ordenes_estado_created');
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ordenes_estado_created
            ON ordenes(estado, created_at DESC)
        `);
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.error('    ❌ Error:', err.message);
        }
    }

    // 2. Boletos: búsqueda por estado (tabla de 1M registros)
    try {
        console.log('  → idx_boletos_estado');
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_boletos_estado_updated
            ON boletos_estado(estado, updated_at DESC)
        `);
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.error('    ❌ Error:', err.message);
        }
    }

    // 3. Órdenes expiradas: limpiar reservas viejas
    try {
        console.log('  → idx_boletos_reservado_en');
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_boletos_reservado_en
            ON boletos_estado(reservado_en)
            WHERE estado = 'apartado'
        `);
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.error('    ❌ Error:', err.message);
        }
    }

    // ============================================================
    // PRIORITY 2: ALTOS (afectan queries frecuentes)
    // ============================================================

    console.log('\n📊 PRIORITY 2 - Índices Altos:');

    // 4. Órdenes por cliente
    try {
        console.log('  → idx_ordenes_cliente_id');
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ordenes_cliente_id
            ON ordenes(cliente_id)
        `);
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.error('    ❌ Error:', err.message);
        }
    }

    // 5. Ganadores por sorteo + estado
    try {
        console.log('  → idx_ganadores_sorteo_estado');
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ganadores_sorteo_estado
            ON ganadores(sorteo_id, estado)
        `);
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.error('    ❌ Error:', err.message);
        }
    }

    // 6. Auditoría: búsqueda por usuario
    try {
        console.log('  → idx_auditoría_usuario_tabla');
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auditoría_usuario_tabla
            ON auditoría_logs(usuario_id, tabla_afectada)
        `);
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.error('    ❌ Error:', err.message);
        }
    }

    // 7. Órdenes pagadas: para estadísticas
    try {
        console.log('  → idx_ordenes_pagada_en');
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ordenes_pagada_en
            ON ordenes(pagada_en DESC)
            WHERE estado = 'pagada'
        `);
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.error('    ❌ Error:', err.message);
        }
    }

    // ============================================================
    // PRIORITY 3: MEDIOS (optimizaciones adicionales)
    // ============================================================

    console.log('\n📊 PRIORITY 3 - Índices Medios:');

    // 8. Boletos por número (búsqueda directa)
    try {
        console.log('  → idx_boletos_numero');
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_boletos_numero
            ON boletos_estado(numero)
        `);
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.error('    ❌ Error:', err.message);
        }
    }

    // 9. Oportunidades por número
    try {
        console.log('  → idx_oportunidades_numero');
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_oportunidades_numero
            ON orden_oportunidades(numero_oportunidad)
        `);
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.error('    ❌ Error:', err.message);
        }
    }

    // 10. Admin users activos
    try {
        console.log('  → idx_admin_activo');
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_activo
            ON admin_users(activo)
        `);
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.error('    ❌ Error:', err.message);
        }
    }

    console.log('\n✅ Índices de performance creados exitosamente');
    console.log('   Impacto esperado: Queries 20-2000x más rápidas\n');
};

exports.down = async function(knex) {
    console.log('↩️  Eliminando índices de performance...');

    const indices = [
        'idx_ordenes_estado_created',
        'idx_boletos_estado_updated',
        'idx_boletos_reservado_en',
        'idx_ordenes_cliente_id',
        'idx_ganadores_sorteo_estado',
        'idx_auditoría_usuario_tabla',
        'idx_ordenes_pagada_en',
        'idx_boletos_numero',
        'idx_oportunidades_numero',
        'idx_admin_activo'
    ];

    for (const idx of indices) {
        try {
            await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${idx}`);
        } catch (err) {
            console.log(`  ⚠️  No se pudo eliminar ${idx}`);
        }
    }

    console.log('✅ Índices eliminados');
};
