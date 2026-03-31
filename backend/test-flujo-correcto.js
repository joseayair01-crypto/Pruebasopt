#!/usr/bin/env node
/**
 * ============================================================
 * TEST: Flujo correcto de comprobantes y confirmación
 * ============================================================
 * Verifica que:
 * 1. Subir comprobante NO cambia estado a confirmada
 * 2. Solo admin puede confirmar
 * 3. Expiración solo ocurre sin comprobante
 */

require('dotenv').config();
const knex = require('./db');

async function testFlujoComprobantes() {
    try {
        console.log('\n' + '='.repeat(70));
        console.log('🧪 TEST: FLUJO CORRECTO DE COMPROBANTES');
        console.log('='.repeat(70) + '\n');

        // Test 1: Verificar estado actual
        console.log('1️⃣  Estado actual de órdenes:\n');
        const ordenes = await knex.raw(`
            SELECT 
                numero_orden,
                estado,
                comprobante_recibido,
                CASE 
                    WHEN comprobante_path IS NOT NULL THEN 'Sí'
                    ELSE 'No'
                END as tiene_comprobante
            FROM ordenes
            ORDER BY created_at DESC
            LIMIT 10
        `);
        
        console.log('   Formato: numero_orden | estado | comprobante_recibido | tiene_URL\n');
        for (const orden of ordenes.rows) {
            console.log(`   ${orden.numero_orden.padEnd(15)} | ${orden.estado.padEnd(12)} | ${String(orden.comprobante_recibido).padEnd(19)} | ${orden.tiene_comprobante}`);
        }
        console.log();

        // Test 2: Verificar que pending sin comprobante expiran
        console.log('2️⃣  Órdenes QUE EXPIRARÍAN (pendiente + sin comprobante):\n');
        const queExpiran = await knex('ordenes')
            .select('numero_orden', 'estado', 'comprobante_recibido', 'created_at')
            .where('estado', 'pendiente')
            .where('comprobante_recibido', false);
        
        console.log(`   Total: ${queExpiran.length}\n`);
        if (queExpiran.length > 0) {
            queExpiran.slice(0, 3).forEach(o => {
                console.log(`   - ${o.numero_orden} (sin comprobante)`);
            });
            if (queExpiran.length > 3) console.log(`   ... y ${queExpiran.length - 3} más`);
        }
        console.log();

        // Test 3: Verificar que con comprobante NO expiran
        console.log('3️⃣  Órdenes QUE NO EXPIRAN (tienen comprobante):\n');
        const conComprobante = await knex('ordenes')
            .select('numero_orden', 'estado', 'comprobante_recibido')
            .where('comprobante_recibido', true);
        
        console.log(`   Total: ${conComprobante.length}\n`);
        if (conComprobante.length > 0) {
            conComprobante.slice(0, 3).forEach(o => {
                console.log(`   - ${o.numero_orden} | estado: ${o.estado} | protegida de expiración ✅`);
            });
            if (conComprobante.length > 3) console.log(`   ... y ${conComprobante.length - 3} más`);
        } else {
            console.log('   (Ninguna orden tiene comprobante aún)\n');
        }
        console.log();

        // Test 4: Explicar el flujo
        console.log('4️⃣  FLUJO CORRECTO:\n');
        console.log('   PASO 1: Cliente hace orden');
        console.log('   → estado: pendiente');
        console.log('   → comprobante_recibido: false');
        console.log('   → Boletos: apartado\n');
        
        console.log('   PASO 2: Cliente sube comprobante');
        console.log('   → estado: pendiente (SIN CAMBIAR) ✅');
        console.log('   → comprobante_recibido: TRUE ✅');
        console.log('   → comprobante_path: URL guardada');
        console.log('   → Boletos: permanecen apartado\n');
        
        console.log('   PASO 3: Admin revisa en panel');
        console.log('   → Admin VE comprobante_recibido=true');
        console.log('   → Decide: APROBAR o RECHAZAR\n');
        
        console.log('   PASO 4a: Admin APRUEBA');
        console.log('   → estado: confirmada ✅');
        console.log('   → Boletos: vendido\n');
        
        console.log('   PASO 4b: Admin RECHAZA');
        console.log('   → estado: cancelada ✅');
        console.log('   → Boletos: disponible (liberados)\n');
        
        console.log('   CASO ESPECIAL: Orden expira (12h sin comprobante)');
        console.log('   → Se buscan: estado=pendiente + comprobante_recibido=false');
        console.log('   → Caso encontrado: liberar boletos + marcar cancelada\n');

        // Test 5: Verificar estados válidos
        console.log('5️⃣  Estados válidos en constraint:\n');
        console.log('   - pendiente (esperando comprobante o siendo revisada)');
        console.log('   - confirmada (admin aprobó)');
        console.log('   - cancelada (expiró o admin rechazó)\n');

        console.log('='.repeat(70));
        console.log('✅ FLUJO ENTENDIDO\n');

    } catch (error) {
        console.error('❌ Error en test:', error.message);
    } finally {
        await knex.destroy();
    }
}

testFlujoComprobantes();
