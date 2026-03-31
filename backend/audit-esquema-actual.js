/**
 * AUDITORÍA DE ESQUEMA ACTUAL - POST V3.5
 * Obtiene información detallada de todas las tablas y sus columnas
 */

const knex = require('./db');

async function auditarEsquema() {
    try {
        console.log('\n' + '='.repeat(80));
        console.log('🔍 AUDITORÍA DE ESQUEMA ACTUAL - POST V3.5');
        console.log('='.repeat(80) + '\n');

        // 1. Obtener lista de tablas
        const tablasResult = await knex.raw(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);

        const tablas = tablasResult.rows.map(r => r.table_name);
        
        console.log(`📊 TABLAS ENCONTRADAS (${tablas.length}):\n`);
        tablas.forEach((tabla, i) => console.log(`  ${i + 1}. ${tabla}`));

        // 2. Para cada tabla, obtener columnas
        console.log('\n' + '='.repeat(80));
        console.log('📋 ESQUEMA DETALLADO DE CADA TABLA\n');
        console.log('='.repeat(80) + '\n');

        for (const tabla of tablas) {
            const columnasResult = await knex.raw(`
                SELECT 
                    column_name,
                    data_type,
                    is_nullable,
                    column_default,
                    ordinal_position
                FROM information_schema.columns 
                WHERE table_name = $1
                ORDER BY ordinal_position
            `, [tabla]);

            const columnas = columnasResult.rows;
            
            console.log(`\n${'─'.repeat(80)}`);
            console.log(`📌 TABLA: ${tabla.toUpperCase()} (${columnas.length} columnas)`);
            console.log(`${'─'.repeat(80)}`);

            columnas.forEach((col, idx) => {
                const nullable = col.is_nullable === 'YES' ? '✓' : '✗';
                const defaultVal = col.column_default ? ` = ${col.column_default}` : '';
                console.log(`    ${String(idx + 1).padStart(2)} | ${col.column_name.padEnd(30)} | ${col.data_type.padEnd(20)} | NULL:${nullable}${defaultVal}`);
            });

            // Contar total de columnas
            console.log(`\n    ✓ Total: ${columnas.length} columnas`);
        }

        console.log('\n' + '='.repeat(80));
        console.log('✅ AUDITORÍA COMPLETADA');
        console.log('='.repeat(80) + '\n');

        await knex.destroy();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error durante auditoría:', error.message);
        console.error(error);
        process.exit(1);
    }
}

auditarEsquema();
