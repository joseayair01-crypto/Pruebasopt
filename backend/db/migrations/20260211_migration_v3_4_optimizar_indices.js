/**
 * ============================================================
 * MIGRACIÓN V3: OPTIMIZAR ÍNDICES (ELIMINAR REDUNDANTES)
 * ============================================================
 * 
 * Mantiene SOLO índices críticos para performance:
 * - ordenes: estado, created_at, telefono_cliente (search)
 * - boletos_orden: orden_id, numero_boleto
 * - admin_users: email
 * - ganadores: numero_orden
 * 
 * Elimina índices redundantes que solo agregaban bloat
 * 
 * Tiempo: ~15 segundos
 */

exports.up = async function(knex) {
    console.log('📝 V3.4: Optimizando índices (eliminar redundante)...');

    // Índices redundantes a eliminar
    const indices_a_eliminar = [
        { tabla: 'ordenes', nombre: 'idx_ordenes_pagada_en' },
        { tabla: 'ordenes', nombre: 'idx_ordenes_expira_en' },
        { tabla: 'ordenes', nombre: 'idx_ordenes_cliente_id' },
        { tabla: 'admin_users', nombre: 'idx_admin_activo' },
        { tabla: 'ganadores', nombre: 'idx_ganadores_numero_orden' }
    ];

    for (const idx of indices_a_eliminar) {
        try {
            await knex.raw(`DROP INDEX IF EXISTS ${idx.nombre}`);
            console.log(`  ✅ Índice eliminado: ${idx.nombre}`);
        } catch (e) {
            console.log(`  ⚠️  No se pudo eliminar ${idx.nombre}: ${e.message}`);
        }
    }

    // Recrear SOLO índices críticos
    console.log('  → Creando índices críticos optimizados...');

    const indices_criticos = [
        'CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON ordenes(estado)',
        'CREATE INDEX IF NOT EXISTS idx_ordenes_created ON ordenes(created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_ordenes_telefono ON ordenes(telefono_cliente)',
        'CREATE INDEX IF NOT EXISTS idx_boletos_orden ON boletos_orden(orden_id)',
        'CREATE INDEX IF NOT EXISTS idx_boletos_numero ON boletos_orden(numero_boleto)',
        'CREATE INDEX IF NOT EXISTS idx_admin_email ON admin_users(email)',
        'CREATE INDEX IF NOT EXISTS idx_ganadores_orden ON ganadores(numero_orden)'
    ];

    for (const idx of indices_criticos) {
        try {
            await knex.raw(idx);
            console.log(`  ✅ ${idx.split('ON ')[1].split('(')[0]}`);
        } catch (e) {
            // Ignorar si ya existen
        }
    }

    console.log('✅ Índices optimizados (solo los críticos)');
};

exports.down = async function(knex) {
    console.log('↩️  V3.4: Revirtiendo optimización de índices...');

    // Recrear los índices eliminados
    const indices_revert = [
        'CREATE INDEX IF NOT EXISTS idx_ordenes_pagada_en ON ordenes(pagada_en)',
        'CREATE INDEX IF NOT EXISTS idx_ordenes_expira_en ON ordenes(expira_en)',
        'CREATE INDEX IF NOT EXISTS idx_ordenes_cliente_id ON ordenes(cliente_id)',
        'CREATE INDEX IF NOT EXISTS idx_admin_activo ON admin_users(activo)',
        'CREATE INDEX IF NOT EXISTS idx_ganadores_numero_orden ON ganadores(numero_orden)'
    ];

    for (const idx of indices_revert) {
        try {
            await knex.raw(idx);
        } catch (e) {
            // Ignorar errores
        }
    }
};
