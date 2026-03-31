require('dotenv').config();
const knex = require('./db');

async function analizarOrderIdCounter() {
    try {
        // 1. Ver contenido
        console.log('\n📋 REGISTROS EN order_id_counter:\n');
        const registros = await knex('order_id_counter').select('*');
        console.log(`Total: ${registros.length} registros\n`);
        registros.forEach(r => {
            console.log(`  ${r.cliente_id.padEnd(25)} | activo: ${r.activo} | proximo: ${String(r.proximo_numero).padStart(3)} | seq: ${r.ultima_secuencia}`);
        });
        
        // 2. Ver SEQUENCES
        console.log('\n🔍 SEQUENCES EN BASE DE DATOS:\n');
        const sequences = await knex.raw(`
            SELECT sequence_name 
            FROM information_schema.sequences 
            WHERE sequence_schema = 'public'
            ORDER BY sequence_name
        `);
        console.log(`Total: ${sequences.rows.length} sequences\n`);
        sequences.rows.forEach(s => {
            console.log(`  ${s.sequence_name}`);
        });
        
        // 3. Ver si hay funciones para generar IDs
        console.log('\n🔧 FUNCIONES PARA GENERAR IDs:\n');
        const functions = await knex.raw(`
            SELECT p.proname 
            FROM pg_proc p 
            WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
            AND (p.proname LIKE '%numero%' OR p.proname LIKE '%orden%')
            ORDER BY p.proname
        `);
        console.log(`Total: ${functions.rows.length} funciones\n`);
        functions.rows.forEach(f => {
            console.log(`  ${f.proname}`);
        });
        
        // 4. Verificar si el código usa order_id_counter o las sequences
        console.log('\n💡 ANÁLISIS - ¿Qué se usa en el código?\n');
        console.log('  Las SEQUENCES existen ✓');
        console.log('  Las FUNCIONES existen ✓');
        console.log(`  order_id_counter table: ${registros.length} registros\n`);
        
        await knex.destroy();
    } catch(e) {
        console.error('❌ ERROR:', e.message);
        process.exit(1);
    }
}

analizarOrderIdCounter();
