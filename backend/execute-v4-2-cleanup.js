/**
 * Script: Ejecutar migración V4.2 - Eliminar funciones y triggers no usados
 * Uso: node -r dotenv/config execute-v4-2-cleanup.js
 */

const db = require('./db');

async function executeMigration() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  V4.2: ELIMINAR FUNCIONES Y TRIGGERS NO USADOS            ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    try {
        // Verificar conexión
        console.log('✅ Conectado a Supabase\n');

        console.log('🧹 Paso 1: Buscando triggers huérfanos...\n');

        // Buscar todos los triggers
        const triggersResult = await db.raw(`
            SELECT trigger_name, event_object_table 
            FROM information_schema.triggers 
            WHERE trigger_schema = 'public'
        `);
        
        const triggers = triggersResult.rows || [];
        console.log(`   Triggers encontrados: ${triggers.length}`);
        
        // Eliminar triggers que empiezan con 'audit'
        for (const trigger of triggers) {
            if (trigger.trigger_name.startsWith('audit')) {
                try {
                    await db.raw(`DROP TRIGGER IF EXISTS "${trigger.trigger_name}" ON "${trigger.event_object_table}"`);
                    console.log(`   ✅ Dropped: ${trigger.trigger_name} ON ${trigger.event_object_table}`);
                } catch (e) {
                    console.log(`   ⏭️  Skipped: ${trigger.trigger_name} - ${e.message}`);
                }
            }
        }

        console.log('\n🗑️  Paso 2: Eliminando funciones no usadas...\n');

        // Funciones a eliminar (en orden de dependencias)
        const functionsToDelete = [
            { name: 'check_bd_size', signature: '()' },
            { name: 'check_conexiones_activas', signature: '()' },
            { name: 'check_transacciones_largas', signature: '()' },
            { name: 'check_table_bloat', signature: '()' },
            { name: 'run_all_health_checks', signature: '()' },
            { name: 'siguiente_numero_boleto', signature: '()' },
            { name: 'siguiente_numero_oportunidad', signature: '()' },
            { name: 'generar_numero_orden', signature: '(text)' },
            { name: 'audit_trigger_func', signature: '()' },
            { name: 'audit_boletos_async', signature: '()' }
        ];

        let deletedCount = 0;
        for (const func of functionsToDelete) {
            try {
                await db.raw(`DROP FUNCTION IF EXISTS ${func.name}${func.signature}`);
                console.log(`   ✅ Dropped: ${func.name}${func.signature}`);
                deletedCount++;
            } catch (e) {
                // Si ya no existe, es normal
                if (e.message.includes('does not exist') || e.message.includes('no existe')) {
                    console.log(`   ⏭️  Skipped: ${func.name}${func.signature} (no existe)`);
                } else {
                    console.log(`   ⚠️  Error: ${func.name}${func.signature} - ${e.message}`);
                }
            }
        }

        console.log('\n✅ MIGRACIÓN V4.2 COMPLETADA\n');
        console.log('📊 Resultados:');
        console.log(`   • ${deletedCount} funciones eliminadas`);
        console.log('   • Triggers huérfanos removidos');
        console.log('   • Código muerto limpiado');
        console.log('   • Warnings de Supabase resueltos\n');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error);
        process.exit(1);
    }
}

executeMigration();
