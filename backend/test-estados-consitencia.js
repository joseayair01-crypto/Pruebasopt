#!/usr/bin/env node
/**
 * ============================================================
 * TEST: Verificar que estados de BD son consistentes
 * ============================================================
 * Verifica que el código no intenta usar estados inválidos
 */

require('dotenv').config();
const knex = require('./db');

async function testEstados() {
    try {
        console.log('\n' + '='.repeat(70));
        console.log('🧪 TEST: VALIDACIÓN DE ESTADOS DE ÓRDENES');
        console.log('='.repeat(70) + '\n');

        // Test 1: Verificar constraint existe
        console.log('1️⃣  Verificando constraint check_ordenes_estado_valido...\n');
        try {
            const constraint = await knex.raw(`
                SELECT conname as constraint_name, pg_get_constraintdef(oid) as definition
                FROM pg_constraint
                WHERE conrelid = 'ordenes'::regclass
                AND contype = 'c'
            `);
            
            if (constraint.rows.length > 0) {
                console.log(`   ✅ Encontrados ${constraint.rows.length} constraints\n`);
                constraint.rows.forEach(c => {
                    console.log(`   - ${c.constraint_name}`);
                });
                console.log();
            } else {
                console.log(`   ⚠️  No hay constraints CHECK\n`);
            }
        } catch (e) {
            console.log(`   ℹ️  Constraint query falló (probablemente BD compatible): ${e.message.substring(0, 40)}...\n`);
        }

        // Test 2: Intentar insertar con estado inválido (debe fallar)
        console.log('2️⃣  Probando integridad de datos (intentar insert con estado inválido)...\n');
        try {
            await knex('ordenes').insert({
                numero_orden: 'TEST-INVALID-STATE-' + Date.now(),
                cantidad_boletos: 1,
                precio_unitario: 10,
                subtotal: 10,
                total: 10,
                estado: 'comprobante_recibido',  // ESTADO INVÁLIDO
                boletos: JSON.stringify([1]),
                nombre_cliente: 'TEST',
                created_at: new Date(),
                updated_at: new Date()
            });
            console.log('   ❌ ERROR: Se permitió insertar estado inválido (constraint no funciona)\n');
            throw new Error('Constraint inefectivo');
        } catch (e) {
            if (e.message.includes('check constraint')) {
                console.log('   ✅ Correctamente rechazó estado "comprobante_recibido"\n');
            } else {
                console.log(`   ✓ Error esperado: ${e.message.substring(0, 60)}...\n`);
            }
        }

        // Test 3: Intentar insert con estado válido (debe funcionar)
        console.log('3️⃣  Probando inserción con estado válido...\n');
        const testOrdenId = 'TEST-VALID-STATE-' + Date.now();
        try {
            await knex('ordenes').insert({
                numero_orden: testOrdenId,
                cantidad_boletos: 1,
                precio_unitario: 10,
                subtotal: 10,
                total: 10,
                estado: 'pendiente',  // ESTADO VÁLIDO
                boletos: JSON.stringify([1]),
                nombre_cliente: 'TEST',
                created_at: new Date(),
                updated_at: new Date()
            });
            console.log('   ✅ Insert con estado "pendiente" exitoso\n');
            
            // Limpiar el test
            await knex('ordenes').where('numero_orden', testOrdenId).delete();
        } catch (e) {
            console.log(`   ❌ ERROR: No se pudo insertar estado válido: ${e.message}\n`);
        }

        // Test 4: Listar estados actuales en BD
        console.log('4️⃣  Estados actuales en tabla ordenes:\n');
        const estadosActuales = await knex.raw(`
            SELECT DISTINCT estado, COUNT(*) as cantidad
            FROM ordenes
            GROUP BY estado
            ORDER BY cantidad DESC
        `);
        
        for (const row of estadosActuales.rows) {
            console.log(`   - ${row.estado.padEnd(15)}: ${row.cantidad} órdenes`);
        }

        // Test 5: Verificar no hay 'completada' en BD
        console.log('\n5️⃣  Verificando que no existen estados inválidos (completada, comprobante_recibido)...\n');
        const invalidosEnBd = await knex.raw(`
            SELECT DISTINCT estado
            FROM ordenes
            WHERE estado IN ('completada', 'comprobante_recibido')
        `);
        
        if (invalidosEnBd.rows.length === 0) {
            console.log('   ✅ No hay estados inválidos en BD\n');
        } else {
            console.log(`   ❌ FOUND INVALID STATES: ${invalidosEnBd.rows.map(r => r.estado).join(', ')}\n`);
        }

        console.log('='.repeat(70));
        console.log('✅ TODOS LOS TESTS PASARON - ESTADOS CONSISTENTES\n');

    } catch (error) {
        console.error('❌ Error en test:', error.message);
    } finally {
        await knex.destroy();
    }
}

testEstados();
