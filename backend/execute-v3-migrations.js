#!/usr/bin/env node

/**
 * ============================================================
 * EJECUTOR: MIGRACIÓN V3 SLIM - LIMPIEZA & OPTIMIZACIÓN
 * ============================================================
 * 
 * Ejecuta 4 migraciones para transformar:
 * - 17 tablas → 5 tablas
 * - 431MB → 80-100MB
 * - 26+ columnas → 12-15 columnas (solo core)
 * 
 * Uso: node execute-v3-migrations.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const knex = require('./db');

const MIGRACIONES = [
    '20260211_migration_v3_1_limpiar_ordenes',
    '20260211_migration_v3_2_simplificar_clientes',
    '20260211_migration_v3_3_eliminar_tablas_muertas',
    '20260211_migration_v3_4_optimizar_indices'
];

async function ejecutarMigracion(nombreMigracion) {
    try {
        console.log(`\n[${new Date().toISOString()}] Ejecutando: ${nombreMigracion}`);
        console.log('─'.repeat(70));

        const rutaMigracion = path.join(__dirname, 'db/migrations', nombreMigracion + '.js');
        
        if (!fs.existsSync(rutaMigracion)) {
            throw new Error(`Archivo no encontrado: ${rutaMigracion}`);
        }

        const migracionModule = require(rutaMigracion);

        if (!migracionModule.up) {
            throw new Error('Migración sin función .up()');
        }

        // Ejecutar migración
        await migracionModule.up(knex);

        console.log(`✅ ${nombreMigracion} completada`);
        return true;

    } catch (error) {
        console.error(`❌ ERROR en ${nombreMigracion}:`);
        console.error(`   ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  🚀 MIGRACIÓN V3 SLIM - LIMPIEZA & OPTIMIZACIÓN       ║');
    console.log('║  De 17 tablas → 5 tablas (431MB → 80-100MB)           ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    try {
        // Verificar BD conectada
        console.log('🔗 Verificando conexión a BD...');
        await knex.raw('SELECT 1');
        console.log('✅ BD conectada\n');

        // Ejecutar migraciones
        let exitosas = 0;
        let fallos = 0;

        for (const migracion of MIGRACIONES) {
            const resultado = await ejecutarMigracion(migracion);
            if (resultado) {
                exitosas++;
            } else {
                fallos++;
                console.log('⚠️  Continuando con siguiente migración...');
            }
        }

        // Resumen
        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log('║  📊 RESUMEN V3 SLIM                                   ║');
        console.log('╚════════════════════════════════════════════════════════╝');
        console.log(`\n✅ Exitosas: ${exitosas}/${MIGRACIONES.length}`);
        console.log(`❌ Fallos: ${fallos}/${MIGRACIONES.length}`);

        if (exitosas === MIGRACIONES.length) {
            console.log('\n🎉 MIGRACIÓN V3 COMPLETADA EXITOSAMENTE\n');
            console.log('Cambios realizados:');
            console.log('  ✅ Eliminadas 11 columnas innecesarias de ordenes');
            console.log('  ✅ Simplificada tabla clientes (19 → 5 columnas)');
            console.log('  ✅ Eliminadas 5 tablas muertas');
            console.log('  ✅ Optimizados índices (solo críticos)');
            console.log('\nResultado esperado:');
            console.log('  📊 BD: 431MB → ~80-100MB (75% reducción)');
            console.log('  📋 Tablas: 17 → 5');
            console.log('  🚀 Performance: igual o mejor');
            console.log('  ⚡ Código: 10x más simple\n');
        } else {
            console.log('\n⚠️  Algunas migraciones tuvieron problemas. Revisar logs.\n');
        }

        process.exit(fallos > 0 ? 1 : 0);

    } catch (error) {
        console.error('❌ ERROR CRÍTICO:', error.message);
        process.exit(1);
    } finally {
        await knex.destroy();
    }
}

main();
