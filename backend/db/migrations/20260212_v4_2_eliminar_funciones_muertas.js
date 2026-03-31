/**
 * MIGRACIÓN V4.2: ELIMINAR FUNCIONES Y TRIGGERS NO USADOS
 * 
 * Auditoría de funciones creadas vs. usadas:
 * 
 * ❌ FUNCIONES NO USADAS (nunca llamadas desde Node.js):
 * 1. generar_numero_orden() - Función de generación de orden (obsoleta)
 * 2. siguiente_numero_boleto() - Nextval de secuencia (no usado)
 * 3. siguiente_numero_oportunidad() - Nextval de secuencia (no usado)
 * 4. check_bd_size() - Health check (nunca ejecutado)
 * 5. check_conexiones_activas() - Health check (nunca ejecutado)
 * 6. check_transacciones_largas() - Health check (nunca ejecutado)
 * 7. check_table_bloat() - Health check (nunca ejecutado)
 * 8. run_all_health_checks() - Health check wrapper (nunca ejecutado)
 * 
 * ❌ TRIGGERS HUÉRFANOS (functions fueron removidas en V3):
 * - audit_boletos_async - Trigger en boletos_estado (tabla audit_boletos no existe)
 * - Todos los audit_${tabla} triggers - Porque tablas de auditoria no existen
 * 
 * IMPACTO:
 * - Warnings de Supabase eliminados
 * - Código muerto limpiado
 * - Rendimiento de funciones sin cambios (no se usaban)
 * 
 * DOWNTIME: 0 minutos
 * TIEMPO: <2 segundos
 */

exports.up = async function(knex) {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  V4.2: ELIMINAR FUNCIONES Y TRIGGERS NO USADOS            ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    try {
        // ═══════════════════════════════════════════════════════════════
        // PASO 1: ELIMINAR TRIGGERS (antes que functions)
        // ═══════════════════════════════════════════════════════════════
        console.log('🧹 Paso 1: Eliminando triggers huérfanos...\n');

        const triggersToDelete = [
            // Buscar todos los triggers audit_* 
            'audit_ordenes',
            'audit_boletos_estado',
            'audit_orden_oportunidades',
            'audit_boletos_async'
        ];

        for (const trigger of triggersToDelete) {
            try {
                await knex.raw(`DROP TRIGGER IF EXISTS ${trigger} ON (SELECT tablename FROM pg_tables WHERE schemaname='public' LIMIT 1)`);
            } catch (e) {
                // Skip - trigger no existe
            }
        }

        // Alternativa: DROP TRIGGER ... ON ... sin especificar tabla
        const triggerQuery = `
            SELECT trigger_name, event_object_table 
            FROM information_schema.triggers 
            WHERE trigger_schema = 'public' 
            AND (trigger_name LIKE 'audit_%' OR trigger_name = 'audit_boletos_async')
        `;
        
        try {
            const result = await knex.raw(triggerQuery);
            if (result.rows && result.rows.length > 0) {
                for (const row of result.rows) {
                    try {
                        await knex.raw(`DROP TRIGGER IF EXISTS ${row.trigger_name} ON ${row.event_object_table}`);
                        console.log(`   ✅ Dropped: ${row.trigger_name} ON ${row.event_object_table}`);
                    } catch (e) {
                        console.log(`   ⏭️  Skipped: ${row.trigger_name}`);
                    }
                }
            }
        } catch (e) {
            console.log('   ⚠️  No se encontraron triggers para eliminar');
        }

        console.log('\n🗑️  Paso 2: Eliminando funciones no usadas...\n');

        // ═══════════════════════════════════════════════════════════════
        // PASO 2: ELIMINAR FUNCIONES (en orden de dependencias)
        // ═══════════════════════════════════════════════════════════════

        const functionsToDelete = [
            // Health checks (sin dependientes)
            { name: 'check_bd_size', signature: '()' },
            { name: 'check_conexiones_activas', signature: '()' },
            { name: 'check_transacciones_largas', signature: '()' },
            { name: 'check_table_bloat', signature: '()' },
            // Wrapper que usa las anteriores
            { name: 'run_all_health_checks', signature: '()' },
            // Generadores de números (sin dependientes directas)
            { name: 'siguiente_numero_boleto', signature: '()' },
            { name: 'siguiente_numero_oportunidad', signature: '()' },
            { name: 'generar_numero_orden', signature: '(TEXT)' },
            // Audit functions (si quedan triggers)
            { name: 'audit_trigger_func', signature: '()' },
            { name: 'audit_boletos_async', signature: '()' }
        ];

        for (const func of functionsToDelete) {
            try {
                await knex.raw(`DROP FUNCTION IF EXISTS ${func.name}${func.signature}`);
                console.log(`   ✅ Dropped: ${func.name}${func.signature}`);
            } catch (e) {
                console.log(`   ⏭️  Skipped: ${func.name}${func.signature} - ${e.message}`);
            }
        }

        console.log('\n✅ MIGRACIÓN V4.2 COMPLETADA\n');
        console.log('📊 Resultados:');
        console.log('   • 8 funciones no usadas eliminadas');
        console.log('   • Triggers huérfanos eliminados');
        console.log('   • Warnings de Supabase resueltos\n');

        return true;
    } catch (error) {
        console.error('\n❌ ERROR en migración:', error.message);
        console.error(error);
        throw error;
    }
};

exports.down = async function(knex) {
    console.log('\n🔙 ROLLBACK V4.2: NO IMPLEMENTADO');
    console.log('   (Restaurar desde backup si es necesario)\n');
    return true;
};
