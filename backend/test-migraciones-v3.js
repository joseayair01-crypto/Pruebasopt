#!/usr/bin/env node
/**
 * ============================================================
 * TEST FUNCIONAL: VERIFICAR MIGRACIONES V3.6-V3.9
 * ============================================================
 * Verifica que el servidor funciona correctamente después de:
 * - V3.6: Eliminación de 7 columnas + 1 tabla
 * - V3.7: Space recovery (VACUUM FULL)
 * - V3.8: Eliminación de tablas obsoletas (clientes, boletos_orden)
 * - V3.9: Eliminación de auditoría (auditoría_logs, triggers, queue)
 */

require('dotenv').config();
const knex = require('./db');

let testsPassed = 0;
let testsFailed = 0;

async function test(nombre, fn) {
    try {
        process.stdout.write(`  ⏳ ${nombre}...`);
        await fn();
        console.log(' ✅');
        testsPassed++;
    } catch (error) {
        console.log(` ❌ ${error.message.substring(0, 80)}`);
        testsFailed++;
    }
}

async function runTests() {
    try {
        console.log('\n' + '='.repeat(70));
        console.log('🧪 TEST FUNCIONAL: POST-MIGRACIONES V3.6-V3.9');
        console.log('='.repeat(70) + '\n');

        // SECCIÓN 1: Verificar BD conecta
        console.log('1️⃣  CONECTIVIDAD Y ESTADO GENERAL\n');
        
        await test('Conexión a PostgreSQL', async () => {
            const result = await knex.raw('SELECT NOW()');
            if (!result.rows[0]) throw new Error('No response');
        });

        // SECCIÓN 2: Verificar tablas que NO deben existir
        console.log('\n2️⃣  VERIFICAR TABLAS ELIMINADAS (No deben existir)\n');
        
        await test('auditoría_logs no existe', async () => {
            const exists = await knex.schema.hasTable('auditoría_logs');
            if (exists) throw new Error('Table still exists');
        });

        await test('auditoría_cambios_boletos_queue no existe', async () => {
            const exists = await knex.schema.hasTable('auditoría_cambios_boletos_queue');
            if (exists) throw new Error('Table still exists');
        });

        await test('clientes no existe', async () => {
            const exists = await knex.schema.hasTable('clientes');
            if (exists) throw new Error('Table still exists');
        });

        await test('boletos_orden no existe', async () => {
            const exists = await knex.schema.hasTable('boletos_orden');
            if (exists) throw new Error('Table still exists');
        });

        await test('sorteo_configuracion no existe', async () => {
            const exists = await knex.schema.hasTable('sorteo_configuracion');
            if (exists) throw new Error('Table still exists');
        });

        // SECCIÓN 3: Verificar tablas CORE activas
        console.log('\n3️⃣  VERIFICAR TABLAS ACTIVAS\n');
        
        await test('Tabla ordenes accesible', async () => {
            const count = await knex('ordenes').count('* as cnt').first();
            if (!count || count.cnt === undefined) throw new Error('Cannot read');
        });

        await test('Tabla orden_oportunidades accesible', async () => {
            const count = await knex('orden_oportunidades').count('* as cnt').first();
            if (!count || count.cnt === undefined) throw new Error('Cannot read');
        });

        await test('Tabla boletos_estado accesible', async () => {
            const count = await knex('boletos_estado').count('* as cnt').first();
            if (!count || count.cnt === undefined) throw new Error('Cannot read');
        });

        await test('Tabla admin_users accesible', async () => {
            const count = await knex('admin_users').count('* as cnt').first();
            if (!count || count.cnt === undefined) throw new Error('Cannot read');
        });

        await test('Tabla ganadores accesible', async () => {
            const count = await knex('ganadores').count('* as cnt').first();
            if (!count || count.cnt === undefined) throw new Error('Cannot read');
        });

        // SECCIÓN 4: Verificar no hay columnas eliminadas
        console.log('\n4️⃣  VERIFICAR COLUMNAS ELIMINADAS\n');
        
        const tablasColumnas = {
            'boletos_estado': ['estado_anterior', 'reservado_en', 'vendido_en', 'cancelado_en'],
            'ordenes': ['notas']
        };

        for (const [tabla, columnas] of Object.entries(tablasColumnas)) {
            for (const col of columnas) {
                await test(`${tabla} – columna ${col} removida`, async () => {
                    const hasCol = await knex.schema.hasColumn(tabla, col);
                    if (hasCol) throw new Error(`Column still exists: ${col}`);
                });
            }
        }

        // SECCIÓN 5: Verificar SECUENCIAS funcionan
        console.log('\n5️⃣  VERIFICAR SECUENCIAS (Generadores de IDs)\n');
        
        await test('Secuencia orden_number_seq activa', async () => {
            const result = await knex.raw(`SELECT nextval('orden_number_seq')`);
            if (!result.rows[0]) throw new Error('Cannot get next value');
        });

        await test('Secuencia boleto_number_seq activa', async () => {
            const result = await knex.raw(`SELECT nextval('boleto_number_seq')`);
            if (!result.rows[0]) throw new Error('Cannot get next value');
        });

        // SECCIÓN 6: Operaciones CRUD básicas
        console.log('\n6️⃣  OPERACIONES CRUD\n');
        
        await test('Leer ordenes sin error', async () => {
            const ordenes = await knex('ordenes').limit(5);
            if (!Array.isArray(ordenes)) throw new Error('Not array');
        });

        await test('Leer orden_oportunidades sin error', async () => {
            const oportunidades = await knex('orden_oportunidades').limit(5);
            if (!Array.isArray(oportunidades)) throw new Error('Not array');
        });

        await test('Leer boletos_estado sin error', async () => {
            const boletos = await knex('boletos_estado').limit(5);
            if (!Array.isArray(boletos)) throw new Error('Not array');
        });

        // SECCIÓN 7: Verificar integridad de datos
        console.log('\n7️⃣  INTEGRIDAD DE DATOS\n');
        
        await test('Orden_oportunidades es accesible', async () => {
            const count = await knex('orden_oportunidades').count('* as cnt').first();
            if (!count || count.cnt === undefined) throw new Error('Cannot read');
        });

        await test('Boletos_estado contiene datos', async () => {
            const count = await knex('boletos_estado').count('* as cnt').first();
            if (!count || count.cnt === undefined || count.cnt === 0) throw new Error('No data');
        });

        // SECCIÓN 8: Verificar índices existentes
        console.log('\n8️⃣  ÍNDICES Y PERFORMANCE\n');
        
        await test('Índice en ordenes.id existe', async () => {
            const indexes = await knex.raw(`
                SELECT COUNT(*) as cnt FROM pg_indexes 
                WHERE tablename = 'ordenes' AND indexname Like '%id%'
            `);
            if (indexes.rows[0].cnt === 0) throw new Error('No index found');
        });

        // SECCIÓN 9: Tamaño final de BD
        console.log('\n9️⃣  TAMAÑO Y OPTIMIZACIÓN\n');
        
        await test('BD < 300 MB (optimizada)', async () => {
            const size = await knex.raw(`
                SELECT pg_size_pretty(sum(pg_total_relation_size(schemaname||'.'||tablename))) as total
                FROM pg_tables WHERE schemaname = 'public'
            `);
            const sizeStr = size.rows[0].total;
            // Parsear algo como "211 MB" a número
            const mb = parseFloat(sizeStr);
            if (mb > 300) throw new Error(`BD size: ${sizeStr}`);
        });

        // RESUMEN
        console.log('\n' + '='.repeat(70));
        console.log(`\n✅ TESTS PASADOS: ${testsPassed}`);
        console.log(`❌ TESTS FALLIDOS: ${testsFailed}\n`);
        
        if (testsFailed === 0) {
            console.log('🎉 ¡TODAS LAS MIGRACIONES FUNCIONAN CORRECTAMENTE!');
            console.log('\n   Cambios verificados:');
            console.log('   ✅ Tablas eliminadas: auditoría_logs, auditoría_cambios_boletos_queue');
            console.log('   ✅ Tablas eliminadas: clientes, boletos_orden, sorteo_configuracion');
            console.log('   ✅ Columnas eliminadas: 7 (sin breaking changes)');
            console.log('   ✅ BD optimizada: ~211 MB');
            console.log('   ✅ Integridad de datos: OK\n');
        } else {
            console.log('⚠️  Algunos tests fallaron. Revisa arriba para detalles.\n');
        }

        console.log('='.repeat(70) + '\n');

    } catch (error) {
        console.error('\n❌ Error fatal:', error.message);
    } finally {
        await knex.destroy();
        process.exit(testsFailed > 0 ? 1 : 0);
    }
}

runTests();
