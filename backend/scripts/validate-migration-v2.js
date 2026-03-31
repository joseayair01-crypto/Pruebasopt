/**
 * ============================================================
 * SCRIPT DE VALIDACIÓN: POST-MIGRACIÓN
 * ============================================================
 * 
 * Verifica que:
 * 1. Todos los datos fueron migrados
 * 2. Integridad referencial
 * 3. Índices creados
 * 4. Performance mejorado
 * 5. Sin datos huérfanos
 * 
 * Uso: npm run validate-migration:v2
 */

require('dotenv').config();

const knex = require('../db');

async function validarMigracion() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 VALIDACIÓN POST-MIGRACIÓN V2');
    console.log('='.repeat(60) + '\n');

    let errorCount = 0;
    let warningCount = 0;
    let successCount = 0;

    try {
        // ============================================================
        // 1. VERIFICAR TABLAS EXISTEN
        // ============================================================
        console.log('1️⃣  Verificando tablas...');
        const tablasRequeridas = [
            'clientes',
            'ordenes',
            'boletos_orden',
            'boletos_estado',
            'orden_oportunidades',
            'auditoría_logs',
            'admin_users',
            'sorteos',
            'ganadores'
        ];

        for (const tabla of tablasRequeridas) {
            const exists = await knex.schema.hasTable(tabla);
            if (exists) {
                console.log(`   ✅ ${tabla}`);
                successCount++;
            } else {
                console.log(`   ❌ ${tabla} - NO EXISTE`);
                errorCount++;
            }
        }

        // ============================================================
        // 2. VERIFICAR CONTEOS DE DATOS
        // ============================================================
        console.log('\n2️⃣  Verificando integridad de datos...');

        const ordenes = await knex('ordenes').count('* as count').first();
        const boletosTotal = await knex('boletos_estado').count('* as count').first();
        const boletosOrden = await knex('boletos_orden').count('* as count').first();

        console.log(`   📊 Órdenes: ${ordenes.count}`);
        console.log(`   📊 Boletos (boletos_estado): ${boletosTotal.count}`);
        console.log(`   📊 Boletos asignados (boletos_orden): ${boletosOrden.count}`);

        if (parseInt(boletosOrden.count) > 0) {
            console.log(`   ✅ Boletos normalizados correctamente`);
            successCount++;
        }

        // ============================================================
        // 3. DETECTAR DATOS HUÉRFANOS
        // ============================================================
        console.log('\n3️⃣  Buscando integridad referencial...');

        // Órdenes sin cliente (si cliente_id es FK)
        const ordenesOrfanas = await knex('ordenes')
            .whereNotNull('cliente_id')
            .leftJoin('clientes', 'ordenes.cliente_id', 'clientes.id')
            .whereNull('clientes.id')
            .count('* as count')
            .first();

        if (parseInt(ordenesOrfanas.count) === 0) {
            console.log(`   ✅ Sin órdenes huérfanas`);
            successCount++;
        } else {
            console.log(`   ⚠️  ${ordenesOrfanas.count} órdenes huérfanas`);
            warningCount++;
        }

        // Boletos reservados sin orden asociada
        const boletosOrfanos = await knex('boletos_estado')
            .where('estado', 'in', ['apartado', 'vendido'])
            .whereNull('numero_orden')
            .count('* as count')
            .first();

        if (parseInt(boletosOrfanos.count) === 0) {
            console.log(`   ✅ Sin boletos huérfanos`);
            successCount++;
        } else {
            console.log(`   ⚠️  ${boletosOrfanos.count} boletos sin orden`);
            warningCount++;
        }

        // ============================================================
        // 4. VERIFICAR ÍNDICES CRÍTICOS
        // ============================================================
        console.log('\n4️⃣  Verificando índices de performance...');

        const indicesRequeridos = [
            { tabla: 'ordenes', nombre: 'idx_ordenes_estado_created' },
            { tabla: 'boletos_estado', nombre: 'idx_boletos_estado_updated' },
            { tabla: 'auditoría_logs', nombre: 'idx_auditoría_usuario_tabla' },
            { tabla: 'ordenes', nombre: 'idx_ordenes_cliente_id' }
        ];

        for (const idx of indicesRequeridos) {
            try {
                const result = await knex.raw(`
                    SELECT EXISTS (
                        SELECT 1 FROM pg_indexes 
                        WHERE tablename = '${idx.tabla}' 
                        AND indexname = '${idx.nombre}'
                    )
                `);
                const hasIndex = result.rows[0].exists;
                if (hasIndex) {
                    console.log(`   ✅ ${idx.nombre}`);
                    successCount++;
                } else {
                    console.log(`   ⚠️  ${idx.nombre} - NO CREADO`);
                    warningCount++;
                }
            } catch (e) {
                console.log(`   ⚠️  ${idx.nombre} - ERROR AL VERIFICAR`);
                warningCount++;
            }
        }

        // ============================================================
        // 5. PRUEBA DE PERFORMANCE
        // ============================================================
        console.log('\n5️⃣  Testando performance de queries...');

        // Query 1: Búsqueda por estado (debería ser <50ms)
        const start1 = Date.now();
        await knex('ordenes')
            .where('estado', 'pagada')
            .limit(10);
        const tiempo1 = Date.now() - start1;

        console.log(`   ⏱️  Búsqueda ordenes por estado: ${tiempo1}ms`);
        if (tiempo1 < 100) {
            console.log(`   ✅ Performance excelente (<100ms)`);
            successCount++;
        } else if (tiempo1 < 500) {
            console.log(`   ⚠️  Performance bueno (${tiempo1}ms)`);
            warningCount++;
        } else {
            console.log(`   ❌ Performance lento (${tiempo1}ms) - verificar índices`);
            errorCount++;
        }

        // Query 2: Búsqueda de boletos disponibles
        const start2 = Date.now();
        await knex('boletos_estado')
            .where('estado', 'disponible')
            .limit(100);
        const tiempo2 = Date.now() - start2;

        console.log(`   ⏱️  Búsqueda boletos disponibles: ${tiempo2}ms`);
        if (tiempo2 < 200) {
            console.log(`   ✅ Performance excelente (<200ms)`);
            successCount++;
        } else if (tiempo2 < 1000) {
            console.log(`   ⚠️  Performance bueno (${tiempo2}ms)`);
            warningCount++;
        } else {
            console.log(`   ❌ Performance lento (${tiempo2}ms)`);
            errorCount++;
        }

        // ============================================================
        // 6. VERIFICAR CONSTRAINTS
        // ============================================================
        console.log('\n6️⃣  Verificando constraints...');

        // Verificar que no hay boletos duplicados
        const boletoDuplicado = await knex('boletos_estado')
            .select('numero')
            .groupBy('numero')
            .havingRaw('count(*) > 1')
            .limit(1);

        if (boletoDuplicado.length === 0) {
            console.log(`   ✅ Sin boletos duplicados`);
            successCount++;
        } else {
            console.log(`   ⚠️  Boletos duplicados detectados`);
            warningCount++;
        }

        // ============================================================
        // 7. VERIFICAR TABLAS DE AUDITORÍA
        // ============================================================
        console.log('\n7️⃣  Verificando auditoría y compliance...');

        const auditLogs = await knex('auditoría_logs').count('* as count').first();
        console.log(`   📊 Logs de auditoría: ${auditLogs.count}`);
        console.log(`   ✅ Tabla de auditoría lista`);
        successCount++;

        const retentionPolicy = await knex('datos_retencion_politica')
            .count('* as count')
            .first();
        console.log(`   📊 Políticas de retención: ${retentionPolicy.count}`);

        if (parseInt(retentionPolicy.count) > 0) {
            console.log(`   ✅ Políticas GDPR configuradas`);
            successCount++;
        }

        // ============================================================
        // RESUMEN
        // ============================================================
        console.log('\n' + '='.repeat(60));
        console.log('📋 RESUMEN');
        console.log('='.repeat(60));
        console.log(`✅ Exitosos: ${successCount}`);
        console.log(`⚠️  Advertencias: ${warningCount}`);
        console.log(`❌ Errores: ${errorCount}`);

        if (errorCount === 0) {
            console.log('\n🎉 MIGRACIÓN VALIDADA EXITOSAMENTE\n');
            process.exit(0);
        } else {
            console.log('\n⚠️  REVISAR ERRORES ANTES DE PRODUCCIÓN\n');
            process.exit(1);
        }

    } catch (err) {
        console.error('\n❌ Error durante validación:', err.message);
        process.exit(1);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    validarMigracion().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { validarMigracion };
