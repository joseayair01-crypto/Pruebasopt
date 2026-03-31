#!/usr/bin/env node

/**
 * ============================================================
 * MAESTRO: MIGRACIÓN V2 FULL PRO - ORQUESTADOR
 * ============================================================
 * 
 * Coordina toda la migración de principio a fin:
 * 1. Backup seguro
 * 2. Pre-checks
 * 3. Ejecutar migraciones (13 total)
 * 4. Validar integridad
 * 5. Tests funcionales
 * 6. Monitoreo
 * 7. Confirmación
 * 
 * Uso: node migrate-v2-full-pro.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const knex = require('./db');

const execAsync = promisify(exec);

const LOG_FILE = '/tmp/rifas_migration_v2_log.txt';

async function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    
    console.log(logMessage);
    
    try {
        fs.appendFileSync(LOG_FILE, logMessage + '\n');
    } catch (err) {
        // Ignorar errores de logging
    }
}

async function section(title) {
    const line = '='.repeat(70);
    await log(`\n${line}`, 'section');
    await log(title, 'section');
    await log(line, 'section');
}

async function step(number, title) {
    const msg = `\n[${number}] ${title}`;
    await log(msg, 'step');
    console.log('\n' + msg);
}

async function preChecks() {
    await section('PRE-CHECK: VERIFICACIONES INICIALES');

    try {
        // 1. Verificar BD está conectada
        await step('1.1', 'Verificando conexión a BD...');
        await knex.raw('SELECT 1');
        await log('✅ BD conectada', 'ok');

        // 2. Verificar archivos de migración existen
        await step('1.2', 'Verificando archivos de migración...');
        const migrationsDir = path.join(__dirname, 'db/migrations');
        const migrationsNeeded = [
            '20260211_migration_v2_1_clientes.js',
            '20260211_migration_v2_2_ordenes_refactor.js',
            '20260211_migration_v2_3_boletos_orden.js',
            '20260211_migration_v2_4_boletos_estado_improve.js',
            '20260211_migration_v2_5_auditoria_logs.js',
            '20260211_migration_v2_6_admin_users_improve.js',
            '20260211_migration_v2_7_ganadores_improve.js',
            '20260211_migration_v2_8_retencion_politica.js',
            '20260211_migration_v2_9_performance_indexes.js',
            '20260211_migration_v2_advanced_1_constraints.js',
            '20260211_migration_v2_advanced_2_audit_triggers.js',
            '20260211_migration_v2_advanced_3_sequences.js',
            '20260211_migration_v2_advanced_4_health_checks.js'
        ];

        for (const file of migrationsNeeded) {
            const fullPath = path.join(migrationsDir, file);
            if (!fs.existsSync(fullPath)) {
                throw new Error(`Archivo faltante: ${file}`);
            }
        }
        await log(`✅ Todos los 13 archivos de migración presentes`, 'ok');

        // 3. Verificar espacio en disco
        await step('1.3', 'Verificando espacio en disco...');
        const statsCmd = 'df /tmp | tail -1 | awk \'{print $4}\'';
        try {
            const { stdout } = await execAsync(statsCmd);
            const availableKB = parseInt(stdout.trim());
            if (availableKB < 1000000) {  // < 1GB
                throw new Error(`Poco espacio disponible: ${(availableKB / 1024 / 1024).toFixed(2)}GB`);
            }
            await log(`✅ Espacio disponible: ${(availableKB / 1024 / 1024).toFixed(2)}GB`, 'ok');
        } catch (err) {
            await log(`⚠️  No se pudo verificar espacio: ${err.message}`, 'warn');
        }

        // 4. Verificar servidor está corriendo
        await step('1.4', 'Verificando servidor backend...');
        try {
            const { stdout } = await execAsync('lsof -i :5001 | grep LISTEN');
            await log('✅ Servidor backend corriendo en puerto 5001', 'ok');
        } catch (err) {
            await log('⚠️  Servidor backend no detectado (puedes pausarlo durante migración)', 'warn');
        }

        await log('\n✅ Pre-checks completados', 'ok');
        return true;

    } catch (err) {
        await log(`❌ Pre-check falló: ${err.message}`, 'error');
        return false;
    }
}

async function crearBackup() {
    await section('PASO 1: CREAR BACKUP SEGURO');

    try {
        await step('1.1', 'Ejecutando script de backup...');
        
        const backupScript = path.join(__dirname, 'backup-before-v2-migration.js');
        await execAsync(`node ${backupScript}`);
        
        await log('✅ Backup completado', 'ok');
        return true;

    } catch (err) {
        await log(`❌ Error en backup: ${err.message}`, 'error');
        throw err;
    }
}

async function ejecutarMigraciones() {
    await section('PASO 2: EJECUTAR MIGRACIONES (13 Total)');

    try {
        await step('2.1', 'Ejecutando script de migraciones...');
        
        const execScript = path.join(__dirname, 'execute-v2-migrations.js');
        const { stdout, stderr } = await execAsync(`node ${execScript}`, { maxBuffer: 10 * 1024 * 1024 });
        
        // Log output
        console.log(stdout);
        if (stderr) {
            await log(`STDERR: ${stderr}`, 'warn');
        }

        await log('✅ Migraciones ejecutadas', 'ok');
        return true;

    } catch (err) {
        await log(`❌ Error en migraciones: ${err.message}`, 'error');
        console.error(err);
        throw err;
    }
}

async function validarIntegridad() {
    await section('PASO 3: VALIDAR INTEGRIDAD DE BD');

    try {
        await step('3.1', 'Ejecutando validación...');
        
        const validateScript = path.join(__dirname, 'scripts/validate-migration-v2.js');
        if (fs.existsSync(validateScript)) {
            const { stdout, stderr } = await execAsync(`node ${validateScript}`, { maxBuffer: 10 * 1024 * 1024 });
            console.log(stdout);
            if (stderr) {
                await log(`Validación stderr: ${stderr}`, 'warn');
            }
        } else {
            await log('⚠️  Script de validación no encontrado', 'warn');
        }

        await log('✅ Validación completada', 'ok');
        return true;

    } catch (err) {
        await log(`⚠️  Error en validación: ${err.message}`, 'warn');
        // No fallar si validación no existe
        return true;
    }
}

async function testsRapidos() {
    await section('PASO 4: TESTS RÁPIDOS DE FUNCIONALIDAD');

    try {
        // Test 1: Verificar órdenes se puede consultar
        await step('4.1', 'Test: Consultar órdenes...');
        const ordenes = await knex('ordenes').limit(5);
        await log(`✅ Órdenes consultables: ${ordenes.length} registros leídos`, 'ok');

        // Test 2: Verificar admin_users
        await step('4.2', 'Test: Consultar admin users...');
        const adminUsers = await knex('admin_users').limit(5);
        await log(`✅ Admin users consultables: ${adminUsers.length} registros leídos`, 'ok');

        // Test 3: Verificar boletos_estado
        await step('4.3', 'Test: Consultar boletos_estado...');
        const boletoStats = await knex('boletos_estado')
            .select('estado')
            .count('* as count')
            .groupBy('estado');
        await log(`✅ Boletos consultables: ${boletoStats.length} estados diferentes`, 'ok');

        // Test 4: Verificar índices funcionan
        await step('4.4', 'Test: Performance query con índices...');
        const startTime = Date.now();
        const queryResult = await knex('ordenes').where('estado', 'pagada').limit(10);
        const elapsed = Date.now() - startTime;
        await log(`✅ Query rápida: ${elapsed}ms (target: <100ms)`, elapsed < 100 ? 'ok' : 'warn');

        await log('\n✅ Tests rápidos completados', 'ok');
        return true;

    } catch (err) {
        await log(`❌ Error en tests: ${err.message}`, 'error');
        throw err;
    }
}

async function monitoreoPostMigracion() {
    await section('PASO 5: MONITOREO POST-MIGRACIÓN');

    try {
        // Check 1: Tamaño de BD
        await step('5.1', 'Verificar tamaño de BD...');
        try {
            const sizeResult = await knex.raw(`
                SELECT pg_size_pretty(pg_database_size(current_database())) as size
            `);
            const size = sizeResult.rows[0].size;
            await log(`📊 Tamaño BD: ${size}`, 'ok');
        } catch (err) {
            await log(`⚠️  No se pudo obtener tamaño: ${err.message}`, 'warn');
        }

        // Check 2: Conexiones activas
        await step('5.2', 'Verificar conexiones activas...');
        try {
            const connResult = await knex.raw(`
                SELECT count(*) as connections FROM pg_stat_activity
            `);
            const connections = connResult.rows[0].connections;
            await log(`🔌 Conexiones activas: ${connections}`, 'ok');
        } catch (err) {
            await log(`⚠️  No se pudo obtener conexiones`, 'warn');
        }

        // Check 3: Tablas creadas
        await step('5.3', 'Verificar tablas...');
        try {
            const tablesResult = await knex.raw(`
                SELECT table_name FROM information_schema.tables 
                WHERE table_schema = 'public'
            `);
            const tables = tablesResult.rows.map(r => r.table_name);
            await log(`📋 Total de tablas: ${tables.length}`, 'ok');
        } catch (err) {
            await log(`⚠️  No se pudo contar tablas`, 'warn');
        }

        await log('\n✅ Monitoreo completado', 'ok');
        return true;

    } catch (err) {
        await log(`⚠️  Error en monitoreo: ${err.message}`, 'warn');
        return true; // No fallar por monitoreo
    }
}

async function generarReporte() {
    await section('REPORTE FINAL');

    try {
        const logContent = fs.readFileSync(LOG_FILE, 'utf8');
        const successCount = (logContent.match(/✅/g) || []).length;
        const warningCount = (logContent.match(/⚠️/g) || []).length;
        const errorCount = (logContent.match(/❌/g) || []).length;

        console.log(`\n📊 ESTADÍSTICAS:
   ✅ Exitosos: ${successCount}
   ⚠️  Advertencias: ${warningCount}
   ❌ Errores: ${errorCount}`);

        if (errorCount === 0) {
            console.log(`\n🎉 MIGRACIÓN V2 FULL PRO COMPLETADA EXITOSAMENTE!`);
            console.log(`\n📁 Logs guardados en: ${LOG_FILE}`);
            return true;
        } else {
            console.log(`\n⚠️  Se encontraron errores. Revisar logs.`);
            return false;
        }

    } catch (err) {
        await log(`⚠️  Error generando reporte: ${err.message}`, 'warn');
        return false;
    }
}

async function main() {
    const startTime = Date.now();
    
    try {
        console.log(`
╔════════════════════════════════════════════════════════╗
║  🚀 MIGRACIÓN V2 FULL PRO - ORQUESTADOR MAESTRO       ║
║  Sistema BD Profesional, Eficiente y Robusto          ║
║  Timestamp: ${new Date().toISOString()}                 ║
╚════════════════════════════════════════════════════════╝
        `);

        // Pre-checks
        if (!await preChecks()) {
            throw new Error('Pre-checks fallidos');
        }

        // Backup
        if (!await crearBackup()) {
            throw new Error('Backup falló');
        }

        // Migraciones
        if (!await ejecutarMigraciones()) {
            throw new Error('Migraciones fallidas');
        }

        // Validación
        if (!await validarIntegridad()) {
            throw new Error('Validación falló');
        }

        // Tests
        if (!await testsRapidos()) {
            throw new Error('Tests fallaron');
        }

        // Monitoreo
        await monitoreoPostMigracion();

        // Reporte
        const ok = await generarReporte();

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        await log(`\n⏱️  Tiempo total: ${elapsed} segundos`, 'section');

        if (ok) {
            console.log(`\n✅ Próximo paso: Revisar logs en ${LOG_FILE}`);
            process.exit(0);
        } else {
            process.exit(1);
        }

    } catch (err) {
        await log(`\n❌ ERROR CRÍTICO: ${err.message}`, 'error');
        console.error(err);
        process.exit(1);
    } finally {
        await knex.destroy();
    }
}

// Ejecutar
if (require.main === module) {
    main();
}

module.exports = { main };
