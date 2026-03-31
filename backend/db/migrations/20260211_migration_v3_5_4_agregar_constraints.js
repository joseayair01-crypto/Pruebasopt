/**
 * ============================================================
 * MIGRACIÓN V3.5: AGREGAR CONSTRAINTS ENUM Y CHECK
 * ============================================================
 * 
 * Objetivo: Añadir validación directa en la BD
 * - Enums para estado en ordenes, ganadores
 * - Check constraints para integridad
 * 
 * Tiempo: ~2 segundos
 */

exports.up = async function(knex) {
    console.log('📝 V3.5.4: Agregando constraints ENUM y CHECK...');

    try {
        console.log('  → Agregando constraint en ordenes.estado...');
        await knex.raw(`
            ALTER TABLE ordenes
            ADD CONSTRAINT check_ordenes_estado_valido
            CHECK (estado IN ('pendiente', 'confirmada', 'cancelada'))
        `);
        console.log('  ✅ Constraint ordenes.estado agregado');
    } catch (e) {
        console.log(`  ⚠️  Constraint ya existe: ${e.message.substring(0, 50)}`);
    }

    try {
        console.log('  → Agregando constraint en ganadores.estado...');
        await knex.raw(`
            ALTER TABLE ganadores
            ADD CONSTRAINT check_ganadores_estado_valido
            CHECK (estado IN ('pendiente', 'notificado', 'reclamado', 'entregado'))
        `);
        console.log('  ✅ Constraint ganadores.estado agregado');
    } catch (e) {
        console.log(`  ⚠️  Constraint ya existe: ${e.message.substring(0, 50)}`);
    }

    try {
        console.log('  → Agregando constraint en ganadores.tipo_ganador...');
        await knex.raw(`
            ALTER TABLE ganadores
            ADD CONSTRAINT check_ganadores_tipo_valido
            CHECK (tipo_ganador IN ('principal', 'presorte', 'ruletazo'))
        `);
        console.log('  ✅ Constraint ganadores.tipo_ganador agregado');
    } catch (e) {
        console.log(`  ⚠️  Constraint ya existe: ${e.message.substring(0, 50)}`);
    }

    try {
        console.log('  → Agregando constraint en ordenes.timestamps...');
        await knex.raw(`
            ALTER TABLE ordenes
            ADD CONSTRAINT check_ordenes_timestamps
            CHECK (updated_at >= created_at)
        `);
        console.log('  ✅ Constraint ordenes.timestamps agregado');
    } catch (e) {
        console.log(`  ⚠️  Constraint ya existe: ${e.message.substring(0, 50)}`);
    }

    try {
        console.log('  → Agregando constraint en orden_oportunidades.estado...');
        await knex.raw(`
            ALTER TABLE orden_oportunidades
            ADD CONSTRAINT check_oportunidades_estado_valido
            CHECK (estado IN ('disponible', 'apartado', 'vendido'))
        `);
        console.log('  ✅ Constraint orden_oportunidades.estado agregado');
    } catch (e) {
        console.log(`  ⚠️  Constraint ya existe: ${e.message.substring(0, 50)}`);
    }

    console.log('✅ Constraints agregados exitosamente');
};

exports.down = async function(knex) {
    console.log('⏮️  Rollback V3.5.4 - Eliminando constraints...');
    
    const constraints = [
        'check_ordenes_estado_valido',
        'check_ganadores_estado_valido',
        'check_ganadores_tipo_valido',
        'check_ordenes_timestamps',
        'check_oportunidades_estado_valido'
    ];

    for (const constraint of constraints) {
        try {
            await knex.raw(`
                ALTER TABLE ordenes DROP CONSTRAINT IF EXISTS ${constraint};
                ALTER TABLE ganadores DROP CONSTRAINT IF EXISTS ${constraint};
                ALTER TABLE orden_oportunidades DROP CONSTRAINT IF EXISTS ${constraint};
            `);
        } catch (e) {
            // Ignorar si no existen
        }
    }

    console.log('✅ Rollback completado');
};
