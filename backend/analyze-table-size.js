/**
 * Script: Analizar tamaño de tabla orden_oportunidades
 * Uso: node -r dotenv/config analyze-table-size.js
 */

const db = require('./db');

async function analyzeTableSize() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  ANALIZAR TAMAÑO TABLA: orden_oportunidades              ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    try {
        // ═══════════════════════════════════════════════════════════════
        // PASO 1: TAMAÑO TOTAL DE LA TABLA
        // ═══════════════════════════════════════════════════════════════
        console.log('📊 Paso 1: Tamaño total de la tabla\n');

        const sizeResult = await db.raw(`
            SELECT 
                pg_size_pretty(pg_total_relation_size('orden_oportunidades')) as tamaño_total,
                pg_size_pretty(pg_relation_size('orden_oportunidades')) as tamaño_datos,
                pg_size_pretty(pg_total_relation_size('orden_oportunidades') - pg_relation_size('orden_oportunidades')) as tamaño_indices
        `);

        const size = sizeResult.rows[0];
        console.log(`   Tamaño total: ${size.tamaño_total}`);
        console.log(`   Datos: ${size.tamaño_datos}`);
        console.log(`   Índices: ${size.tamaño_indices}\n`);

        // ═══════════════════════════════════════════════════════════════
        // PASO 2: CONTAR REGISTROS
        // ═══════════════════════════════════════════════════════════════
        console.log('📊 Paso 2: Contar registros\n');

        const countResult = await db.raw(`
            SELECT COUNT(*) as total FROM orden_oportunidades
        `);

        const total = countResult.rows[0].total;
        console.log(`   Registros: ${total.toLocaleString()}`);
        
        // Calcular promedio por registro
        const totalBytes = parseInt(size.tamaño_datos.replace(/,/g, '').split(' ')[0]) * 1024 * 1024;
        const bytesPerRecord = totalBytes / total;
        console.log(`   Promedio por registro: ${bytesPerRecord.toFixed(0)} bytes\n`);

        // ═══════════════════════════════════════════════════════════════
        // PASO 3: DESGLOSE POR ÍNDICE
        // ═══════════════════════════════════════════════════════════════
        console.log('📊 Paso 3: Tamaño de índices\n');

        const indexesResult = await db.raw(`
            SELECT 
                indexname,
                pg_size_pretty(pg_relation_size(indexrelname)) as tamaño
            FROM pg_indexes
            JOIN pg_class ON pg_class.relname = pg_indexes.indexname
            WHERE tablename = 'orden_oportunidades'
            ORDER BY pg_relation_size(indexrelname) DESC
        `);

        const indexes = indexesResult.rows;
        if (indexes.length > 0) {
            indexes.forEach(idx => {
                console.log(`   • ${idx.indexname}: ${idx.tamaño}`);
            });
        } else {
            console.log('   (Sin información de índices)');
        }

        console.log();

        // ═══════════════════════════════════════════════════════════════
        // PASO 4: DEAD TUPLES
        // ═══════════════════════════════════════════════════════════════
        console.log('📊 Paso 4: Dead tuples (registros eliminados no limpiados)\n');

        const deadResult = await db.raw(`
            SELECT 
                schemaname, tablename,
                n_live_tup as registros_vivos,
                n_dead_tup as registros_muertos,
                ROUND(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 2) as porcentaje_muertos
            FROM pg_stat_user_tables
            WHERE tablename = 'orden_oportunidades'
        `);

        const deadTuples = deadResult.rows[0];
        if (deadTuples) {
            console.log(`   Registros vivos: ${deadTuples.registros_vivos.toLocaleString()}`);
            console.log(`   Registros muertos: ${deadTuples.registros_muertos.toLocaleString()}`);
            console.log(`   % Muertos: ${deadTuples.porcentaje_muertos}%\n`);

            if (deadTuples.registros_muertos > 100000) {
                console.log('   ⚠️  ALERTA: Hay muchos registros muertos');
                console.log('   Sugerencia: Ejecutar VACUUM ANALYZE\n');
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // PASO 5: COMPARATIVA - Si eliminamos columnas
        // ═══════════════════════════════════════════════════════════════
        console.log('📊 Paso 5: Impacto de eliminar created_at y updated_at\n');

        // PostgreSQL: cada timestamp = 8 bytes
        const timestampsSize = total * 8 * 2; // 2 columnas
        const timestampsSizeMB = (timestampsSize / (1024 * 1024)).toFixed(2);

        const currentSizeNum = parseFloat(size.tamaño_datos.split(' ')[0]);
        const newSizeEstimated = (currentSizeNum - parseFloat(timestampsSizeMB)).toFixed(2);

        console.log(`   Tamaño actual: ${size.tamaño_datos}`);
        console.log(`   Datos en 2 timestamps: ~${timestampsSizeMB} MB`);
        console.log(`   Tamaño estimado después de eliminar: ~${newSizeEstimated} MB`);
        console.log(`   Ahorro: ${timestampsSizeMB} MB (${((parseFloat(timestampsSizeMB) / currentSizeNum) * 100).toFixed(1)}%)\n`);

        // ═══════════════════════════════════════════════════════════════
        // RECOMENDACIÓN
        // ═══════════════════════════════════════════════════════════════
        console.log('💡 ANÁLISIS Y RECOMENDACIÓN:\n');

        if (parseFloat(timestampsSizeMB) > 50) {
            console.log(`✅ VALE LA PENA eliminar timestamps`);
            console.log(`   Ahorro significativo: ${timestampsSizeMB} MB\n`);
        } else if (parseFloat(timestampsSizeMB) > 10) {
            console.log(`⭕ NEUTRAL - Pequeño ahorro`);
            console.log(`   Ahorro: ${timestampsSizeMB} MB (poco significativo)\n`);
        } else {
            console.log(`❌ NO VALE LA PENA`);
            console.log(`   Ahorro muy pequeño: ${timestampsSizeMB} MB\n`);
        }

        if (deadTuples && deadTuples.registros_muertos > 100000) {
            console.log('✅ PRIMERO: Hacer VACUUM');
            console.log('   Esto podría liberar más espacio que eliminar columnas\n');
        }

        console.log('═'.repeat(61) + '\n');

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error);
    }

    process.exit(0);
}

analyzeTableSize();
