require('dotenv').config();
const knex = require('./db');

async function analizarAuditoria() {
    try {
        console.log('\n╔═══════════════════════════════════════════════════════════════╗');
        console.log('║           ANÁLISIS DE TABLAS DE AUDITORÍA                    ║');
        console.log('╚═══════════════════════════════════════════════════════════════╝\n');
        
        // 1. auditoría_logs
        console.log('📋 TABLA: auditoría_logs\n');
        const auditLogs = await knex.raw(`
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_name = 'auditoría_logs'
            ORDER BY ordinal_position
        `);
        
        auditLogs.rows.forEach(c => {
            console.log(`  ${c.column_name.padEnd(25)} | ${c.data_type}`);
        });
        
        const auditCount = await knex('auditoría_logs').count('*').first();
        console.log(`\n  ✓ Filas: ${auditCount.count}`);
        console.log(`  ✓ Propósito: Log GENERAL de todos los cambios\n`);
        
        // 2. auditoría_cambios_boletos_queue  
        console.log('📋 TABLA: auditoría_cambios_boletos_queue\n');
        const queueCols = await knex.raw(`
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_name = 'auditoría_cambios_boletos_queue'
            ORDER BY ordinal_position
        `);
        
        queueCols.rows.forEach(c => {
            console.log(`  ${c.column_name.padEnd(25)} | ${c.data_type}`);
        });
        
        const queueCount = await knex('auditoría_cambios_boletos_queue').count('*').first();
        console.log(`\n  ✓ Filas: ${queueCount.count}`);
        console.log(`  ✓ Propósito: Cola asincrónica para cambios de boletos\n`);
        
        // 3. Triggers activos
        console.log('📋 TRIGGERS ACTIVOS:\n');
        const triggers = await knex.raw(`
            SELECT trigger_name, event_object_table, event_manipulation
            FROM information_schema.triggers
            WHERE trigger_schema = 'public'
            ORDER BY event_object_table, trigger_name
        `);
        
        if (triggers.rows.length > 0) {
            triggers.rows.forEach(t => {
                console.log(`  ${t.trigger_name.padEnd(30)} ON ${t.event_object_table.padEnd(18)} (${t.event_manipulation})`);
            });
        }
        
        console.log(`\n  Total: ${triggers.rows.length} triggers\n`);

        console.log('╔═══════════════════════════════════════════════════════════════╗');
        console.log('║  ANÁLISIS: ¿SON AMBAS NECESARIAS?                            ║');
        console.log('╚═══════════════════════════════════════════════════════════════╝\n');
        
        console.log('auditoría_logs (~72 kB):');
        console.log('  ✓ USADA: Podría guardar logs via triggers (ISO 27001)');
        console.log(`  × ACTUALMENTE: 0 filas (triggers no están escribiendo)\n`);
        
        console.log('auditoría_cambios_boletos_queue (~16 kB):');
        console.log('  × NO USADA: Queue abandonada (nunca se procesa)');
        console.log(`  × ACTUALMENTE: 0 filas (sin cambios registrados)\n`);

        await knex.destroy();
    } catch(e) {
        console.error('ERROR:', e.message);
        process.exit(1);
    }
}

analizarAuditoria();
