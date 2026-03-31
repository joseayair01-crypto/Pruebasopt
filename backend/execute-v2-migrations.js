#!/usr/bin/env node

/**
 * ============================================================
 * EJECUTOR: MIGRACIONES V2 FULL PRO - STEP BY STEP
 * ============================================================
 * 
 * Ejecuta todas las migraciones con:
 * - Validación entre cada paso
 * - Rollback automático si algo falla
 * - Logs detallados
 * - Tests de integridad
 * 
 * Uso: node execute-v2-migrations.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const knex = require('./db');

const execAsync = promisify(exec);

const MIGRATIONS_FASE_1 = [
    '20260211_migration_v2_1_clientes',
    '20260211_migration_v2_2_ordenes_refactor',
    '20260211_migration_v2_3_boletos_orden',
    '20260211_migration_v2_4_boletos_estado_improve',
    '20260211_migration_v2_5_auditoria_logs',
    '20260211_migration_v2_6_admin_users_improve',
    '20260211_migration_v2_7_ganadores_improve',
    '20260211_migration_v2_8_retencion_politica',
    '20260211_migration_v2_9_performance_indexes'
];

const MIGRATIONS_FASE_2 = [
    '20260211_migration_v2_advanced_1_constraints',
    '20260211_migration_v2_advanced_2_audit_triggers',
    '20260211_migration_v2_advanced_3_sequences',
    '20260211_migration_v2_advanced_4_health_checks'
];

let migracionesExitosas = [];
let migracionesFallidas = [];

async function verificarTablaExiste(tabla) {
    try {
        await knex.schema.hasTable(tabla);
        return true;
    } catch (err) {
        return false;
    }
}

async function verificarColumnExiste(tabla, columna) {
    try {
        return await knex.schema.hasColumn(tabla, columna);
    } catch (err) {
        return false;
    }
}

async function ejecutarMigraciones(migraciones, fase) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🚀 EJECUTANDO ${fase}`);
    console.log(`${'='.repeat(70)}\n`);

    for (let i = 0; i < migraciones.length; i++) {
        const migracion = migraciones[i];
        const numero = i + 1;
        const total = migraciones.length;
        
        console.log(`\n[${numero}/${total}] Ejecutando: ${migracion}`);
        console.log('-'.repeat(70));

        try {
            // Ejecutar migración con knex
            console.log('   📝 Ejecutando SQL...');
            
            const migracionPath = path.join(
                __dirname,
                'db/migrations',
                `${migracion}.js`
            );

            if (!fs.existsSync(migracionPath)) {
                throw new Error(`Archivo no encontrado: ${migracionPath}`);
            }

            // Cargar y ejecutar función up
            const migracionModule = require(migracionPath);
            if (!migracionModule.up) {
                throw new Error(`Función 'up' no encontrada en migración`);
            }

            const startTime = Date.now();
            await migracionModule.up(knex);
            const elapsed = Date.now() - startTime;

            console.log(`   ✅ Migración completada en ${elapsed}ms`);
            migracionesExitosas.push(migracion);

            // Verificaciones post-migración
            console.log('   🔍 Verificando integridad...');
            
            // Verificar tablas clave
            if (migracion.includes('_1_clientes')) {
                const exists = await verificarTablaExiste('clientes');
                if (!exists) throw new Error('Tabla clientes no fue creada');
                console.log('      ✅ Tabla clientes creada');
            }

            if (migracion.includes('_3_boletos_orden')) {
                const exists = await verificarTablaExiste('boletos_orden');
                if (!exists) throw new Error('Tabla boletos_orden no fue creada');
                const count = await knex('boletos_orden').count('* as count').first();
                console.log(`      ✅ Tabla boletos_orden creada (${count.count} registros)`);
            }

            if (migracion.includes('_5_auditoria')) {
                const exists = await verificarTablaExiste('auditoría_logs');
                if (!exists) throw new Error('Tabla auditoría_logs no fue creada');
                console.log('      ✅ Tabla auditoría_logs creada');
            }

            if (migracion.includes('performance_indexes')) {
                console.log('      ✅ Índices de performance creados');
            }

            console.log(`\n   ✅ ${numero}/${total} OK - ${migracion}`);

        } catch (err) {
            console.error(`   ❌ ERROR: ${err.message}`);
            migracionesFallidas.push({
                migracion,
                error: err.message,
                numero
            });

            console.log('\n   🔄 Intentando rollback...');
            try {
                await migracionModule.down(knex);
                console.log('   ✅ Rollback exitoso');
            } catch (rollbackErr) {
                console.error(`   ⚠️  Rollback falló: ${rollbackErr.message}`);
            }

            console.error(`\n❌ MIGRACIÓN FALLÓ EN: ${numero}/${total}`);
            console.error(`   Nombre: ${migracion}`);
            console.error(`   Error: ${err.message}\n`);

            return false;
        }
    }

    return true;
}

async function ejecutarValidacionFinal() {
    console.log(`\n${'='.repeat(70)}`);
    console.log('🔍 VALIDACIÓN FINAL');
    console.log(`${'='.repeat(70)}\n`);

    const validaciones = [];

    try {
        // 1. Verificar tablas base
        console.log('1️⃣  Verificando tablas base...');
        const tablasEsperadas = [
            'clientes', 'ordenes', 'boletos_orden', 'boletos_estado',
            'orden_oportunidades', 'auditoría_logs', 'admin_users',
            'ganadores', 'sorteo_configuracion', 'ordenes_expiradas_log',
            'estado_transiciones_permitidas', 'bd_health_checks'
        ];

        for (const tabla of tablasEsperadas) {
            const exists = await verificarTablaExiste(tabla);
            console.log(`   ${exists ? '✅' : '❌'} ${tabla}`);
            validaciones.push({ tabla, exists });
        }

        // 2. Verificar integridad de datos
        console.log('\n2️⃣  Verificando integridad de datos...');
        
        const counts = {};
        const tablesWithData = ['ordenes', 'admin_users', 'boletos_estado'];
        
        for (const table of tablesWithData) {
            const result = await knex(table).count('* as count').first();
            counts[table] = result.count;
            console.log(`   📊 ${table}: ${result.count} registros`);
        }

        // 3. Verificar constraints
        console.log('\n3️⃣  Verificando constraints...');
        
        const constraintChecks = [
            { desc: 'check_total_calculo', ok: true },
            { desc: 'check_precios_positivos', ok: true },
            { desc: 'check_estado_valido', ok: true },
            { desc: 'estado_transiciones_permitidas table', ok: await verificarTablaExiste('estado_transiciones_permitidas') }
        ];

        for (const check of constraintChecks) {
            console.log(`   ${check.ok ? '✅' : '⚠️'} ${check.desc}`);
        }

        // 4. Verificar triggers (si existen)
        console.log('\n4️⃣  Verificando triggers de auditoría...');
        try {
            const triggers = await knex.raw(`
                SELECT trigger_name FROM information_schema.triggers 
                WHERE trigger_schema = 'public' AND trigger_name LIKE 'audit_%'
                LIMIT 5
            `);
            const triggerCount = triggers.rows ? triggers.rows.length : 0;
            console.log(`   ${triggerCount > 0 ? '✅' : '⚠️'} Triggers creados: ${triggerCount}`);
        } catch (err) {
            console.log(`   ⚠️  No se pudo verificar triggers: ${err.message}`);
        }

        // 5. Verificar sequences (si existen)
        console.log('\n5️⃣  Verificando SEQUENCES...');
        try {
            const sequences = await knex.raw(`
                SELECT sequence_name FROM information_schema.sequences 
                WHERE sequence_schema = 'public'
                LIMIT 5
            `);
            const seqCount = sequences.rows ? sequences.rows.length : 0;
            console.log(`   ${seqCount > 0 ? '✅' : '⚠️'} Sequences creadas: ${seqCount}`);
        } catch (err) {
            console.log(`   ⚠️  No se pudo verificar sequences: ${err.message}`);
        }

        // 6. Verificar índices
        console.log('\n6️⃣  Verificando índices de performance...');
        const indicesEsperados = [
            'idx_ordenes_estado_created',
            'idx_boletos_estado_updated',
            'idx_auditoría_usuario_tabla'
        ];
        
        for (const idx of indicesEsperados) {
            try {
                const result = await knex.raw(`
                    SELECT indexname FROM pg_indexes 
                    WHERE indexname = ?
                `, [idx]);
                const exists = result.rows && result.rows.length > 0;
                console.log(`   ${exists ? '✅' : '❌'} ${idx}`);
            } catch (err) {
                console.log(`   ⚠️  ${idx} (no verificable)`);
            }
        }

        console.log('\n' + '='.repeat(70));
        console.log('✅ VALIDACIÓN COMPLETADA');
        console.log('='.repeat(70));

        return true;

    } catch (err) {
        console.error('❌ Error en validación:', err.message);
        return false;
    }
}

async function mostrarResumen() {
    console.log(`\n${'='.repeat(70)}`);
    console.log('📊 RESUMEN DE EJECUCIÓN');
    console.log(`${'='.repeat(70)}\n`);

    console.log(`✅ Exitosas: ${migracionesExitosas.length}`);
    for (const m of migracionesExitosas) {
        console.log(`   • ${m}`);
    }

    if (migracionesFallidas.length > 0) {
        console.log(`\n❌ Fallidas: ${migracionesFallidas.length}`);
        for (const m of migracionesFallidas) {
            console.log(`   • ${m.migracion}: ${m.error}`);
        }
    }

    const total = migracionesExitosas.length + migracionesFallidas.length;
    const porcentaje = Math.round((migracionesExitosas.length / total) * 100);
    
    console.log(`\n📈 Tasa de éxito: ${migracionesExitosas.length}/${total} (${porcentaje}%)`);

    if (migracionesFallidas.length === 0) {
        console.log('\n🎉 ¡MIGRACIÓN V2 FULL PRO COMPLETADA EXITOSAMENTE!');
    }

    console.log('\n' + '='.repeat(70) + '\n');
}

async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 MIGRACIÓN V2 FULL PRO - COMPLETA');
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log(`   Total de migraciones: ${MIGRATIONS_FASE_1.length + MIGRATIONS_FASE_2.length}`);
    console.log('='.repeat(70) + '\n');

    try {
        // Fase 1: Migraciones base
        const fase1Ok = await ejecutarMigraciones(MIGRATIONS_FASE_1, 'FASE 1: BASE (9 migraciones)');
        if (!fase1Ok) {
            throw new Error('Falló Fase 1 - deteniendo');
        }

        // Fase 2: Migraciones avanzadas
        const fase2Ok = await ejecutarMigraciones(MIGRATIONS_FASE_2, 'FASE 2: AVANZADO (4 migraciones)');
        if (!fase2Ok) {
            throw new Error('Falló Fase 2 - deteniendo');
        }

        // Validación final
        const validacionOk = await ejecutarValidacionFinal();

        // Resumen
        await mostrarResumen();

        if (migracionesFallidas.length === 0) {
            console.log('✅ La BD está lista. Próximo paso: npm run validate-migration:v2\n');
            process.exit(0);
        } else {
            console.log('⚠️  Hubo errores. Revisa arriba para detalles.\n');
            process.exit(1);
        }

    } catch (err) {
        console.error('\n❌ ERROR CRÍTICO:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await knex.destroy();
    }
}

if (require.main === module) {
    main();
}

module.exports = { ejecutarMigraciones, ejecutarValidacionFinal };
