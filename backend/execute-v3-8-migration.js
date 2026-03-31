require('dotenv').config();
const knex = require('./db');

async function ejecutarV38() {
    try {
        console.log('\n╔═══════════════════════════════════════════════════════════════╗');
        console.log('║              EJECUTAR V3.8: LIMPIAR TABLAS OBSOLETAS         ║');
        console.log('╚═══════════════════════════════════════════════════════════════╝\n');

        // Cargar y ejecutar migración
        const migracion = require('./db/migrations/20260211_migration_v3_8_limpiar_obsoletas.js');
        await migracion.up(knex);

        // Verificar tablas restantes
        console.log('📊 TABLAS DESPUÉS DE V3.8:\n');
        const tables = await knex.raw(`
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public'
            ORDER BY tablename
        `);
        
        tables.rows.forEach(t => {
            console.log(`  ${t.tablename}`);
        });

        console.log(`\n  Total: ${tables.rows.length} tablas\n`);

        console.log('✅ V3.8 EJECUTADA EXITOSAMENTE\n');
        
        await knex.destroy();
        process.exit(0);

    } catch (error) {
        console.error(`\n❌ ERROR: ${error.message}\n`);
        await knex.destroy();
        process.exit(1);
    }
}

ejecutarV38();
