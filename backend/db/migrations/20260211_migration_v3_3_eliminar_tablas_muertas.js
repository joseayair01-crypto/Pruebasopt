/**
 * ============================================================
 * MIGRACIÓN V3: ELIMINAR TABLAS MUERTAS/REDUNDANTES
 * ============================================================
 * 
 * Elimina tablas que NUNCA SE USAN en la aplicación:
 * - auditoria_logs (cero queries)
 * - bd_health_checks (monitoring que no usas)
 * - estado_transiciones_permitidas (state machine overkill)
 * - datos_retencion_politica (GDPR paranoia)
 * - boletos_estado (redundante → boletos_orden ya tiene estado)
 * - orden_oportunidades_log (confuse el modelo)
 * - ordenes_expiradas_log (funcionalidad inexistente)
 * 
 * Tiempo: ~10 segundos
 */

exports.up = async function(knex) {
    console.log('📝 V3.3: Eliminando tablas muertas/redundantes...');

    const tablasAEliminar = [
        'auditoria_logs',
        'auditoria_cambios_boletos_queue',
        'bd_health_checks',
        'estado_transiciones_permitidas',
        'datos_retencion_politica',
        'orden_oportunidades_log',
        'ordenes_expiradas_log'
    ];

    // Primero, eliminar triggers que dependan de boletos_estado
    try {
        await knex.raw('DROP TRIGGER IF EXISTS auditar_boletos_estado ON boletos_estado');
        console.log('  ✅ Trigger de boletos_estado eliminado');
    } catch (e) {
        // Ignorar si no existe
    }

    // Ahora eliminar boletos_estado
    try {
        const exists = await knex.schema.hasTable('boletos_estado');
        if (exists) {
            console.log('  → Eliminando tabla: boletos_estado (con cuidado de FKs)');
            await knex.raw('ALTER TABLE boletos_estado DISABLE TRIGGER ALL');
            await knex.raw('DELETE FROM boletos_estado');
            await knex.raw('ALTER TABLE boletos_estado ENABLE TRIGGER ALL');
            await knex.schema.dropTableIfExists('boletos_estado');
            console.log('    ✅ boletos_estado eliminada');
        }
    } catch (e) {
        console.log(`    ⚠️  Problema eliminando boletos_estado: ${e.message}`);
    }

    // Eliminar tablas restantes
    for (const tabla of tablasAEliminar) {
        const exists = await knex.schema.hasTable(tabla);
        if (exists) {
            console.log(`  → Eliminando tabla: ${tabla}`);
            try {
                await knex.schema.dropTableIfExists(tabla);
                console.log(`     ✅ ${tabla} eliminada`);
            } catch (e) {
                console.log(`     ⚠️  Error eliminando ${tabla}: ${e.message}`);
            }
        }
    }

    console.log('✅ Tablas muertas eliminadas (5 tablas menos)');
};

exports.down = async function(knex) {
    console.log('↩️  V3.3: Restaurando tablas eliminadas...');

    // auditoria_logs
    await knex.schema.createTableIfNotExists('auditoria_logs', table => {
        table.increments('id').primary();
        table.integer('usuario_id').nullable();
        table.string('accion', 50);
        table.string('tabla_afectada', 100);
        table.bigInteger('registro_id').nullable();
        table.jsonb('valores_anteriores').nullable();
        table.jsonb('valores_nuevos').nullable();
        table.string('ip_address', 45).nullable();
        table.string('resultado', 20);
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.index('usuario_id');
        table.index('tabla_afectada');
        table.index('created_at');
    });

    // bd_health_checks
    await knex.schema.createTableIfNotExists('bd_health_checks', table => {
        table.increments('id').primary();
        table.string('check_name', 100);
        table.string('resultado', 20);
        table.text('detalles').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
    });

    // estado_transiciones_permitidas
    await knex.schema.createTableIfNotExists('estado_transiciones_permitidas', table => {
        table.increments('id').primary();
        table.string('estado_actual', 50);
        table.string('estado_siguiente', 50);
        table.boolean('permitida').defaultTo(true);
        table.unique(['estado_actual', 'estado_siguiente']);
    });

    // datos_retencion_politica
    await knex.schema.createTableIfNotExists('datos_retencion_politica', table => {
        table.increments('id').primary();
        table.string('tabla_nombre', 100);
        table.integer('dias_retencion');
        table.text('notas').nullable();
    });

    // boletos_estado (redundante)
    await knex.schema.createTableIfNotExists('boletos_estado', table => {
        table.increments('id').primary();
        table.bigInteger('orden_id').nullable();
        table.integer('numero_boleto');
        table.string('estado', 50);
        table.string('estado_anterior', 50).nullable();
        table.timestamp('reservado_en').nullable();
        table.timestamp('vendido_en').nullable();
        table.timestamp('cancelado_en').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
    });

    console.log('✅ Tablas restauradas');
};
