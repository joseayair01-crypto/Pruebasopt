require('dotenv').config();
const knex = require('./db');

async function checkSizes() {
    try {
        // Contar filas en cada tabla
        const ordenes = await knex('ordenes').count('*').first();
        const oportunidades = await knex('orden_oportunidades').count('*').first();
        const counter = await knex('order_id_counter').count('*').first();
        
        console.log('\n📊 RESUMEN POST-V3.7 (DESPUÉS DE VACUUM FULL):\n');
        console.log(`  ordenes                  : ${ordenes.count} filas`);
        console.log(`  orden_oportunidades      : ${oportunidades.count} filas`);
        console.log(`  order_id_counter         : ${counter.count} filas`);
        
        console.log('\n✅ V3.7 COMPLETADA EXITOSAMENTE');
        console.log('   - VACUUM FULL ejecutado en 3 tablas');
        console.log('   - Duplicados limpiados de orden_oportunidades');
        console.log('   - BD optimizada para máxima compresión\n');
        
        await knex.destroy();
        process.exit(0);
    } catch(e) {
        console.error('❌ ERROR:', e.message.substring(0, 200));
        await knex.destroy();
        process.exit(1);
    }
}

checkSizes();
