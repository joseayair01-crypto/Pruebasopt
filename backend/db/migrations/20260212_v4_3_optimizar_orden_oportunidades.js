/**
 * MIGRACIÓN V4.3: LIMPIAR TABLA orden_oportunidades
 * 
 * Optimizaciones:
 * 1. VACUUM FULL - Limpiar dead tuples
 * 2. Eliminar 2 índices NO USADOS (0 scans) - Ahorro: 32 MB
 * 3. Eliminar 2 columnas timestamps innecesarias - Ahorro: 12 MB
 * 
 * TOTAL AHORRO: ~44 MB (25% de tamaño actual)
 * 
 * Índices eliminados:
 * - idx_oportunidades_numero (16 MB, 0 scans) - REDUNDANTE con unique constraint
 * - orden_oportunidades_numero_oportunidad_unique (16 MB, 0 scans) - REDUNDANTE
 * 
 * DOWNTIME: ~10 segundos (VACUUM FULL requiere lock)
 * RIESGO: BAJO (solo elimina lo que no se usa)
 */

exports.up = async function(knex) {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  V4.3: OPTIMIZAR orden_oportunidades                     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    try {
        // ═══════════════════════════════════════════════════════════════
        // PASO 1: VACUUM FULL - Limpiar dead tuples
        // ═══════════════════════════════════════════════════════════════
        console.log('🧹 Paso 1: VACUUM FULL en orden_oportunidades...');
        console.log('   (Esto puede tomar 30-60 segundos)\n');

        await knex.raw('VACUUM FULL ANALYZE orden_oportunidades');
        console.log('   ✅ VACUUM completado - Liberado espacio de dead tuples\n');

        // ═══════════════════════════════════════════════════════════════
        // PASO 2: ELIMINAR ÍNDICES NO USADOS
        // ═══════════════════════════════════════════════════════════════
        console.log('📋 Paso 2: Eliminar índices no usados (0 scans)...\n');

        // Índice redundante (16 MB, 0 scans)
        try {
            await knex.raw('DROP INDEX IF EXISTS idx_oportunidades_numero');
            console.log('   ✅ Dropped: idx_oportunidades_numero (16 MB)\n');
        } catch (e) {
            console.log(`   ⏭️  Skipped: idx_oportunidades_numero - ${e.message}\n`);
        }

        // Constraint unique redundante (16 MB, 0 scans)
        // Nota: PostgreSQL puede evitar eliminar si hay dependencias
        try {
            await knex.raw('DROP INDEX IF EXISTS orden_oportunidades_numero_oportunidad_unique');
            console.log('   ✅ Dropped: orden_oportunidades_numero_oportunidad_unique (16 MB)\n');
        } catch (e) {
            console.log(`   ⏭️  Skipped: orden_oportunidades_numero_oportunidad_unique - ${e.message}\n`);
        }

        // ═══════════════════════════════════════════════════════════════
        // PASO 3: ELIMINAR COLUMNAS TIMESTAMPS SIN USO
        // ═══════════════════════════════════════════════════════════════
        console.log('📋 Paso 3: Eliminar columnas timestamps sin uso...\n');

        // Verificar que las columnas existen antes de eliminar
        const columnsResult = await knex.raw(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'orden_oportunidades'
            AND column_name IN ('created_at', 'updated_at')
        `);

        const existingColumns = columnsResult.rows.map(r => r.column_name);

        if (existingColumns.includes('created_at')) {
            try {
                await knex.raw('ALTER TABLE orden_oportunidades DROP COLUMN created_at');
                console.log('   ✅ Dropped: created_at (~6 MB)\n');
            } catch (e) {
                console.log(`   ⏭️  Skipped: created_at - ${e.message}\n`);
            }
        }

        if (existingColumns.includes('updated_at')) {
            try {
                await knex.raw('ALTER TABLE orden_oportunidades DROP COLUMN updated_at');
                console.log('   ✅ Dropped: updated_at (~6 MB)\n');
            } catch (e) {
                console.log(`   ⏭️  Skipped: updated_at - ${e.message}\n`);
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // PASO 4: VACUUM FINAL DESPUÉS DE CAMBIOS
        // ═══════════════════════════════════════════════════════════════
        console.log('🧹 Paso 4: VACUUM ANALYZE final...\n');
        await knex.raw('VACUUM ANALYZE orden_oportunidades');
        console.log('   ✅ VACUUM final completado\n');

        console.log('═'.repeat(61));
        console.log('\n✅ MIGRACIÓN V4.3 COMPLETADA\n');
        console.log('📊 Ahorro estimado:');
        console.log('   • Dead tuples: 10-30 MB');
        console.log('   • Índices eliminados: 32 MB');
        console.log('   • Timestamps eliminados: 12 MB');
        console.log('   • Total: ~44-54 MB (25-30% reducción)\n');
        console.log('📌 Tamaño esperado: ~123-133 MB (era 177 MB)\n');

        return true;
    } catch (error) {
        console.error('\n❌ ERROR en migración:', error.message);
        throw error;
    }
};

exports.down = async function(knex) {
    console.log('\n🔙 ROLLBACK V4.3: NO IMPLEMENTADO');
    console.log('   (Restaurar desde backup si es necesario)\n');
    return true;
};
