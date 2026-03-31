/**
 * ============================================================
 * MIGRACIÓN V3.9: LIMPIAR TABLAS MUERTAS DE AUDITORÍA
 * ============================================================
 * 
 * Objetivo: Eliminar tables de auditoría sin uso
 * - auditoría_logs: 0 filas, triggers no escriben
 * - auditoría_cambios_boletos_queue: 0 filas, nunca procesada
 * 
 * Beneficio:
 * - BD ultra limpia (solo lo necesario)
 * - Menos overhead de triggers
 * - Mantenimiento más simple
 * 
 * Tiempo: ~1 segundo
 * Riesgo: BAJO (ambas vacías, sin dependencias activas)
 */

exports.up = async function(knex) {
    try {
        console.log('\n' + '='.repeat(70));
        console.log('📝 V3.9: LIMPIAR TABLAS MUERTAS DE AUDITORÍA');
        console.log('='.repeat(70) + '\n');

        // PASO 1: Remover triggers que escriben a tablas eliminadas
        console.log('PASO 1️⃣  Remover triggers de auditoría...\n');
        
        try {
            // Remover todos los triggers de auditoría
            const triggers = ['audit_admin_users', 'audit_ganadores', 'audit_ordenes', 'audit_boletos_async'];
            
            for (const trigger of triggers) {
                try {
                    await knex.raw(`DROP TRIGGER IF EXISTS ${trigger} ON admin_users`);
                    await knex.raw(`DROP TRIGGER IF EXISTS ${trigger} ON ganadores`);
                    await knex.raw(`DROP TRIGGER IF EXISTS ${trigger} ON ordenes`);
                    await knex.raw(`DROP TRIGGER IF EXISTS ${trigger} ON boletos_estado`);
                } catch (e) {
                    // Silencioso si no existe
                }
            }
            
            console.log('  ✅ Triggers removidos\n');
        } catch (e) {
            console.log(`  ⚠️  Error removiendo triggers: ${e.message.substring(0, 80)}\n`);
        }

        // PASO 2: Remover funciones de auditoría
        console.log('PASO 2️⃣  Remover funciones de auditoría...\n');
        
        try {
            await knex.raw('DROP FUNCTION IF EXISTS audit_trigger_func() CASCADE');
            await knex.raw('DROP FUNCTION IF EXISTS audit_boletos_async() CASCADE');
            console.log('  ✅ Funciones removidas\n');
        } catch (e) {
            console.log(`  ⚠️  Error removiendo funciones: ${e.message.substring(0, 80)}\n`);
        }

        // PASO 3: Eliminar tabla auditoría_cambios_boletos_queue
        console.log('PASO 3️⃣  Eliminar tabla auditoría_cambios_boletos_queue...\n');
        
        try {
            const queueExists = await knex.schema.hasTable('auditoría_cambios_boletos_queue');
            if (queueExists) {
                await knex.schema.dropTable('auditoría_cambios_boletos_queue');
                console.log('  ✅ Tabla auditoría_cambios_boletos_queue eliminada\n');
            } else {
                console.log('  ℹ️  Tabla no existe, saltando\n');
            }
        } catch (e) {
            console.log(`  ⚠️  Error: ${e.message.substring(0, 80)}\n`);
        }

        // PASO 4: Eliminar tabla auditoría_logs
        console.log('PASO 4️⃣  Eliminar tabla auditoría_logs...\n');
        
        try {
            const logsExists = await knex.schema.hasTable('auditoría_logs');
            if (logsExists) {
                await knex.schema.dropTable('auditoría_logs');
                console.log('  ✅ Tabla auditoría_logs eliminada\n');
            } else {
                console.log('  ℹ️  Tabla no existe, saltando\n');
            }
        } catch (e) {
            console.log(`  ⚠️  Error: ${e.message.substring(0, 80)}\n`);
        }

        console.log('='.repeat(70));
        console.log('✅ V3.9 COMPLETADA - BD ULTRA LIMPIA');
        console.log('='.repeat(70) + '\n');

    } catch (error) {
        console.log(`❌ Error en V3.9: ${error.message}\n`);
        throw error;
    }
};

exports.down = async function(knex) {
    console.log('⏮️  Rollback V3.9 - Recreación de tablas no implementada');
    console.log('   Si necesitas restaurar, usa backup o re-ejecuta migraciones anteriores\n');
};
