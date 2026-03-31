require('dotenv').config();
const knex = require('./db');

async function analizarTablas() {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════════╗');
        console.log('║             SCHEMA Y CONTENIDO DE TABLAS A REVISAR             ║');
        console.log('╚════════════════════════════════════════════════════════════════╝\n');

        // 1. CLIENTES
        console.log('📋 TABLA: clientes\n');
        const clientesSchema = await knex.raw(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'clientes'
            ORDER BY ordinal_position
        `);
        clientesSchema.rows.forEach(c => {
            console.log(`  ${c.column_name.padEnd(25)} | ${c.data_type.padEnd(15)} | nullable: ${c.is_nullable}`);
        });
        
        const clientesCount = await knex('clientes').count('*').first();
        console.log(`\n  Total filas: ${clientesCount.count}\n`);
        
        // Sample data
        const clientesSample = await knex('clientes').limit(1);
        if (clientesSample.length > 0) {
            console.log('  Ejemplo de datos:');
            console.log('  ', JSON.stringify(clientesSample[0], null, 2).substring(0, 200) + '...\n');
        }
        
        // 2. BOLETOS_ORDEN
        console.log('📋 TABLA: boletos_orden\n');
        const boletosOrdenSchema = await knex.raw(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'boletos_orden'
            ORDER BY ordinal_position
        `);
        boletosOrdenSchema.rows.forEach(c => {
            console.log(`  ${c.column_name.padEnd(25)} | ${c.data_type.padEnd(15)} | nullable: ${c.is_nullable}`);
        });
        
        const boletosOrdenCount = await knex('boletos_orden').count('*').first();
        console.log(`\n  Total filas: ${boletosOrdenCount.count}\n`);
        
        // 3. KNEX_MIGRATIONS tables
        console.log('📋 TABLAS: knex_migrations*\n');
        const migrationTablesRaw = await knex.raw(`
            SELECT tablename FROM pg_tables 
            WHERE schemaname = 'public' AND tablename LIKE 'knex%'
            ORDER BY tablename
        `);
        const migrationTables = migrationTablesRaw.rows;
        
        // knex_migrations
        const knexMigsSchema = await knex.raw(`
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_name = 'knex_migrations'
            ORDER BY ordinal_position
        `);
        
        console.log('knex_migrations:');
        knexMigsSchema.rows.forEach(c => {
            console.log(`  ${c.column_name.padEnd(25)} | ${c.data_type}`);
        });
        
        const knexMigsCount = await knex('knex_migrations').count('*').first();
        console.log(`  Total filas: ${knexMigsCount.count}\n`);
        
        // knex_migrations_lock
        const knexLockSchema = await knex.raw(`
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_name = 'knex_migrations_lock'
            ORDER BY ordinal_position
        `);
        
        console.log('knex_migrations_lock:');
        knexLockSchema.rows.forEach(c => {
            console.log(`  ${c.column_name.padEnd(25)} | ${c.data_type}`);
        });
        
        const knexLockCount = await knex('knex_migrations_lock').count('*').first();
        console.log(`  Total filas: ${knexLockCount.count}\n`);

        await knex.destroy();
    } catch(e) {
        console.error('ERROR:', e.message);
        process.exit(1);
    }
}

analizarTablas();
