/**
 * EXECUTOR: V3.7 Bloat Optimization Migration
 * Ejecuta la optimización estructural y reporta antes/después
 */
require('dotenv').config();
const knex = require('./db');

async function reportarTamanos(etapa) {
    try {
        const result = await knex.raw(`
            SELECT 
                tablename,
                round(pg_total_relation_size(schemaname||'.'||tablename) / 1024.0 / 1024.0, 2) as size_mb,
                n_live_tup as row_count
            FROM pg_stat_user_tables
            WHERE tablename IN ('ordenes', 'orden_oportunidades', 'order_id_counter')
            ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        `);

        console.log(`\n📊 TAMAÑOS ${etapa}:\n`);
        let totalMB = 0;
        result.rows.forEach(row => {
            console.log(`  ${row.tablename.padEnd(30)}: ${row.size_mb.toString().padStart(8)} MB (${row.row_count} rows)`);
            totalMB += row.size_mb;
        });
        console.log(`  ${'TOTAL'.padEnd(30)}: ${totalMB.toString().padStart(8)} MB`);
        
        return totalMB;
    } catch (e) {
        console.error(`  ⚠️  Error reportando: ${e.message.substring(0, 80)}`);
        return null;
    }
}

async function ejecutarMigracion() {
    try {
        console.log(`\n╔═══════════════════════════════════════════════════════════════════╗`);
        console.log(`║                V3.7: BLOAT OPTIMIZATION MIGRATION                    ║`);
        console.log(`║         Refactorizar datos para máxima compresión y performance      ║`);
        console.log(`╚═══════════════════════════════════════════════════════════════════╝`);

        // ANTES
        console.log('\n⏱️  Midiendo tamaños ANTES de optimización...');
        const tamAntes = await reportarTamanos('ANTES');

        // Ejecutar migración
        console.log('\n' + '='.repeat(70));
        console.log('🚀 Ejecutando migración V3.7...\n');
        
        const migracion = require('./db/migrations/20260211_migration_v3_7_optimizar_bloat.js');
        await migracion.up(knex);

        // DESPUÉS
        console.log('\n⏱️  Midiendo tamaños DESPUÉS de optimización...');
        const tamDespues = await reportarTamanos('DESPUÉS');

        // REPORTE FINAL
        if (tamAntes && tamDespues) {
            const reduccion = ((tamAntes - tamDespues) / tamAntes * 100).toFixed(1);
            const mbRecuperados = (tamAntes - tamDespues).toFixed(1);
            
            console.log(`\n${'═'.repeat(70)}`);
            console.log('📈 IMPACTO DE OPTIMIZACIÓN');
            console.log(`${'═'.repeat(70)}`);
            console.log(`  Espacio ANTES:     ${tamAntes.toFixed(2)} MB`);
            console.log(`  Espacio DESPUÉS:   ${tamDespues.toFixed(2)} MB`);
            console.log(`  Espacio RECUPERADO: ${mbRecuperados} MB (-${reduccion}%)`);
            console.log(`${'═'.repeat(70)}\n`);
            
            if (reduccion > 10) {
                console.log(`✅ OPTIMIZACIÓN EXITOSA - Recuperados ${mbRecuperados} MB de espacio`);
            } else {
                console.log(`⚠️  Reducción menor a lo esperado - Puede haber bloat adicional`);
            }
        }

        console.log('\n✅ V3.7 COMPLETADA\n');
        await knex.destroy();
        process.exit(0);

    } catch (error) {
        console.error(`\n❌ ERROR: ${error.message}\n`);
        await knex.destroy();
        process.exit(1);
    }
}

ejecutarMigracion();
