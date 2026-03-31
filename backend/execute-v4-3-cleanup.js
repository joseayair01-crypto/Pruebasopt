/**
 * Script: Ejecutar migración V4.3 - Optimizar orden_oportunidades
 * Uso: node -r dotenv/config execute-v4-3-cleanup.js
 * 
 * ⚠️ ADVERTENCIA: Este script eliminará:
 * - 2 índices no usados (32 MB)
 * - 2 columnas timestamps (12 MB)
 * - Dead tuples en VACUUM FULL
 * 
 * Total ahorro esperado: ~44-54 MB
 */

const db = require('./db');

async function executeMigration() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  V4.3: OPTIMIZAR orden_oportunidades                     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    try {
        console.log('✅ Conectado a Supabase\n');

        // Obtener tamaño ANTES
        console.log('📊 Tamaño ANTES de optimizaciones:\n');
        const sizeBefore = await db.raw(`
            SELECT 
                pg_size_pretty(pg_total_relation_size('orden_oportunidades')) as total,
                pg_size_pretty(pg_relation_size('orden_oportunidades')) as datos,
                pg_size_pretty(pg_total_relation_size('orden_oportunidades') - pg_relation_size('orden_oportunidades')) as indices
        `);
        
        const before = sizeBefore.rows[0];
        console.log(`   Total: ${before.total}`);
        console.log(`   Datos: ${before.datos}`);
        console.log(`   Índices: ${before.indices}\n`);

        // ═══════════════════════════════════════════════════════════════
        // PASO 1: VACUUM FULL
        // ═══════════════════════════════════════════════════════════════
        console.log('🧹 Paso 1: VACUUM FULL (limpieza de dead tuples)...\n');
        console.log('   ⏳ Esto puede tomar 30-60 segundos...\n');

        await db.raw('VACUUM FULL ANALYZE orden_oportunidades');
        console.log('   ✅ VACUUM FULL completado\n');

        // ═══════════════════════════════════════════════════════════════
        // PASO 2: ELIMINAR ÍNDICES NO USADOS
        // ═══════════════════════════════════════════════════════════════
        console.log('📋 Paso 2: Eliminar índices no usados...\n');

        try {
            await db.raw('DROP INDEX IF EXISTS idx_oportunidades_numero');
            console.log('   ✅ Dropped: idx_oportunidades_numero (16 MB)');
        } catch (e) {
            console.log(`   ⏭️  Skipped: idx_oportunidades_numero - ${e.message}`);
        }

        try {
            await db.raw('DROP INDEX IF EXISTS orden_oportunidades_numero_oportunidad_unique');
            console.log('   ✅ Dropped: orden_oportunidades_numero_oportunidad_unique (16 MB)');
        } catch (e) {
            console.log(`   ⏭️  Skipped: orden_oportunidades_numero_oportunidad_unique - ${e.message}`);
        }

        console.log();

        // ═══════════════════════════════════════════════════════════════
        // PASO 3: ELIMINAR COLUMNAS TIMESTAMPS
        // ═══════════════════════════════════════════════════════════════
        console.log('📋 Paso 3: Eliminar columnas timestamps...\n');

        const columnsCheck = await db.raw(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'orden_oportunidades'
            AND column_name IN ('created_at', 'updated_at')
        `);

        const existingColumns = columnsCheck.rows.map(r => r.column_name);

        if (existingColumns.includes('created_at')) {
            try {
                await db.raw('ALTER TABLE orden_oportunidades DROP COLUMN created_at');
                console.log('   ✅ Dropped: created_at (~6 MB)');
            } catch (e) {
                console.log(`   ⏭️  Skipped: created_at - ${e.message}`);
            }
        } else {
            console.log('   ⏭️  Skipped: created_at (no existe)');
        }

        if (existingColumns.includes('updated_at')) {
            try {
                await db.raw('ALTER TABLE orden_oportunidades DROP COLUMN updated_at');
                console.log('   ✅ Dropped: updated_at (~6 MB)');
            } catch (e) {
                console.log(`   ⏭️  Skipped: updated_at - ${e.message}`);
            }
        } else {
            console.log('   ⏭️  Skipped: updated_at (no existe)');
        }

        console.log();

        // ═══════════════════════════════════════════════════════════════
        // PASO 4: VACUUM FINAL
        // ═══════════════════════════════════════════════════════════════
        console.log('🧹 Paso 4: VACUUM ANALYZE final...\n');
        await db.raw('VACUUM ANALYZE orden_oportunidades');
        console.log('   ✅ VACUUM ANALYZE completado\n');

        // ═══════════════════════════════════════════════════════════════
        // RESULTADO
        // ═══════════════════════════════════════════════════════════════
        console.log('📊 Tamaño DESPUÉS de optimizaciones:\n');
        const sizeAfter = await db.raw(`
            SELECT 
                pg_size_pretty(pg_total_relation_size('orden_oportunidades')) as total,
                pg_size_pretty(pg_relation_size('orden_oportunidades')) as datos,
                pg_size_pretty(pg_total_relation_size('orden_oportunidades') - pg_relation_size('orden_oportunidades')) as indices
        `);
        
        const after = sizeAfter.rows[0];
        console.log(`   Total: ${after.total}`);
        console.log(`   Datos: ${after.datos}`);
        console.log(`   Índices: ${after.indices}\n`);

        console.log('═'.repeat(61));
        console.log('\n✅ MIGRACIÓN V4.3 COMPLETADA\n');
        console.log('📊 RESUMEN:\n');
        console.log(`   Tamaño antes: ${before.total}`);
        console.log(`   Tamaño después: ${after.total}`);
        console.log('   Eliminado:');
        console.log('   • idx_oportunidades_numero (16 MB)');
        console.log('   • orden_oportunidades_numero_oportunidad_unique (16 MB)');
        console.log('   • created_at (~6 MB)');
        console.log('   • updated_at (~6 MB)');
        console.log('   • Dead tuples (~10-30 MB)');
        console.log('\n   Total ahorro estimado: 44-54 MB\n');

        process.exit(0);

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error);
        process.exit(1);
    }
}

executeMigration();
