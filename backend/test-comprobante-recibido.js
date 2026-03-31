#!/usr/bin/env node
/**
 * ============================================================
 * TEST: Verificar lógica de comprobante_recibido
 * ============================================================
 */

require('dotenv').config();
const knex = require('./db');

async function testComprobanteRecibido() {
    try {
        console.log('\n' + '='.repeat(70));
        console.log('🧪 TEST: LÓGICA DE COMPROBANTE_RECIBIDO');
        console.log('='.repeat(70) + '\n');

        // Test 1: Verificar que la columna existe
        console.log('1️⃣  Verificando que columna comprobante_recibido existe...\n');
        const hasCol = await knex.schema.hasColumn('ordenes', 'comprobante_recibido');
        if (hasCol) {
            console.log('   ✅ Columna existe\n');
        } else {
            console.log('   ❌ Columna NO existe\n');
            throw new Error('Missing column');
        }

        // Test 2: Verificar tipo de dato
        console.log('2️⃣  Verificando tipo de dato de comprobante_recibido...\n');
        const schema = await knex.raw(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'ordenes' 
            AND column_name = 'comprobante_recibido'
        `);
        if (schema.rows.length > 0) {
            console.log(`   Tipo: ${schema.rows[0].data_type}`);
            console.log(`   ✅ Es de tipo ${schema.rows[0].data_type}\n`);
        }

        // Test 3: Verificar estado actual de órdenes
        console.log('3️⃣  Estado actual de órdenes en BD:\n');
        const ordenes = await knex.raw(`
            SELECT 
                numero_orden,
                estado,
                comprobante_recibido,
                comprobante_path,
                created_at
            FROM ordenes
            ORDER BY created_at DESC
            LIMIT 5
        `);
        
        for (const orden of ordenes.rows) {
            console.log(`   ${orden.numero_orden}`);
            console.log(`   - Estado: ${orden.estado}`);
            console.log(`   - Comprobante recibido: ${orden.comprobante_recibido}`);
            console.log(`   - Path: ${orden.comprobante_path ? 'Sí' : 'No'}\n`);
        }

        // Test 4: Verificar que query de expiración está correcta
        console.log('4️⃣  Verificando lógica de búsqueda para expiración...\n');
        const ordenesQueExpirarian = await knex('ordenes')
            .select('numero_orden', 'estado', 'comprobante_recibido')
            .where('estado', 'pendiente')
            .where('comprobante_recibido', false);

        console.log(`   Órdenes pendientes SIN comprobante: ${ordenesQueExpirarian.length}`);
        if (ordenesQueExpirarian.length > 0) {
            ordenesQueExpirarian.forEach(o => {
                console.log(`   - ${o.numero_orden} (${o.estado}/${o.comprobante_recibido})`);
            });
        }
        console.log();

        // Test 5: Verificar órdenes protegidas
        console.log('5️⃣  Órdenes PROTEGIDAS de expiración:\n');
        const ordenesProtegidas = await knex.raw(`
            SELECT numero_orden, estado, comprobante_recibido
            FROM ordenes
            WHERE comprobante_recibido = true
            OR estado = 'confirmada'
        `);

        console.log(`   Total protegidas: ${ordenesProtegidas.rows.length}`);
        if (ordenesProtegidas.rows.length > 0) {
            ordenesProtegidas.rows.slice(0, 3).forEach(o => {
                console.log(`   - ${o.numero_orden} (${o.estado}/${o.comprobante_recibido ? 'con comprobante' : 'sin'})`);
            });
        }
        console.log();

        console.log('='.repeat(70));
        console.log('✅ TEST COMPLETADO\n');

    } catch (error) {
        console.error('❌ Error en test:', error.message);
    } finally {
        await knex.destroy();
    }
}

testComprobanteRecibido();
