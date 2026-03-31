#!/usr/bin/env node
require('dotenv').config();
const knex = require('./db');

(async () => {
  try {
    console.log('\n📊 INVESTIGACIÓN DE DATOS INCONSISTENTES\n');

    // Check huérfanas
    console.log('1️⃣  Filas huérfanas en orden_oportunidades:');
    const huerfanas = await knex.raw(`
      SELECT COUNT(*) as cnt 
      FROM orden_oportunidades oo
      WHERE NOT EXISTS (SELECT 1 FROM ordenes o WHERE o.numero = oo.numero_orden)
    `);
    console.log('   Filas huérfanas:', huerfanas.rows[0].cnt);
    if (huerfanas.rows[0].cnt > 0) {
        const ejemplos = await knex.raw(`
          SELECT DISTINCT oo.numero_orden, COUNT(*) as cnt 
          FROM orden_oportunidades oo
          WHERE NOT EXISTS (SELECT 1 FROM ordenes o WHERE o.numero = oo.numero_orden)
          GROUP BY oo.numero_orden LIMIT 3
        `);
        console.log('   Ejemplos de numero_orden no encontrados:');
        ejemplos.rows.forEach(row => console.log('   -', row.numero_orden));
    }

    // Check boletos inválidos
    console.log('\n2️⃣  Boletos con valores inválidos:');
    const invalidos = await knex.raw(`
      SELECT numero, estado FROM boletos_estado
      WHERE estado NOT IN ('disponible', 'vendido', 'premio')
      OR numero <= 0
      LIMIT 5
    `);
    console.log('   Registros inválidos:', invalidos.rows.length);
    invalidos.rows.forEach(row => {
      console.log(`   - numero: ${row.numero}, estado: '${row.estado}'`);
    });

    // Estado actual de la BD
    console.log('\n3️⃣  ESTADÍSTICAS GENERALES:');
    const stats = await knex.raw(`
      SELECT 
        (SELECT COUNT(*) FROM ordenes) as ordenes_total,
        (SELECT COUNT(*) FROM orden_oportunidades) as oportunidades_total,
        (SELECT COUNT(*) FROM boletos_estado) as boletos_total,
        (SELECT COUNT(DISTINCT estado) FROM boletos_estado) as estados_unicos
    `);
    
    const s = stats.rows[0];
    console.log(`   - Órdenes activas: ${s.ordenes_total}`);
    console.log(`   - Oportunidades: ${s.oportunidades_total}`);
    console.log(`   - Boletos: ${s.boletos_total}`);
    console.log(`   - Estados únicos: ${s.estados_unicos}`);

    console.log('\n✅ Análisis completado\n');
    await knex.destroy();
  } catch (e) {
    console.error('Error:', e.message);
    await knex.destroy();
  }
})();
