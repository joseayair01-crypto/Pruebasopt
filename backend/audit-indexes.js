/**
 * Script: Auditar índices en orden_oportunidades
 * Verifica cuál se usa REALMENTE en queries
 * Usa pg_stat_user_indexes para ver estadísticas
 */

const db = require('./db');

async function auditIndexes() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  AUDITAR ÍNDICES: orden_oportunidades                    ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    try {
        // ═══════════════════════════════════════════════════════════════
        // PASO 1: LISTAR TODOS LOS ÍNDICES
        // ═══════════════════════════════════════════════════════════════
        console.log('📋 Paso 1: Listar todos los índices de orden_oportunidades\n');

        const indexesResult = await db.raw(`
            SELECT 
                t.relname as tabla,
                i.relname as nombre_indice,
                ix.indisunique as es_unico,
                ix.indisprimary as es_primary,
                pg_size_pretty(pg_relation_size(i.oid)) as tamaño,
                a.idx_scan as scans,
                a.idx_tup_read as tuplas_leidas,
                a.idx_tup_fetch as tuplas_obtenidas
            FROM 
                pg_class t
                JOIN pg_index ix ON t.oid = ix.indrelid
                JOIN pg_class i ON i.oid = ix.indexrelid
                LEFT JOIN pg_stat_user_indexes a ON a.indexrelname = i.relname
            WHERE 
                t.relname = 'orden_oportunidades'
            ORDER BY 
                COALESCE(a.idx_scan, 0) DESC
        `);

        const indexes = indexesResult.rows;
        
        console.log(`Índices encontrados: ${indexes.length}\n`);

        let tableSize = 0;
        let indexesSize = 0;

        const indexDetails = [];

        for (const idx of indexes) {
            const size = parseFloat(idx.tamaño.split(' ')[0]);
            indexesSize += size;
            
            const scans = parseInt(idx.scans) || 0;
            const tuplesRead = parseInt(idx.tuplas_leidas) || 0;
            
            let usageStatus = '❌ NO USADO';
            if (scans > 1000) {
                usageStatus = '✅ MUY USADO';
            } else if (scans > 100) {
                usageStatus = '⭕ MODERADO';
            } else if (scans > 0) {
                usageStatus = '⚠️  POCO USADO';
            }

            indexDetails.push({
                nombre: idx.nombre_indice,
                tamaño: idx.tamaño,
                scans,
                tuplesRead,
                usageStatus,
                isPrimary: idx.es_primary,
                isUnique: idx.es_unico
            });

            console.log(`${idx.nombre_indice}`);
            console.log(`   Tamaño: ${idx.tamaño}`);
            console.log(`   Scans: ${scans}`);
            console.log(`   Tuplas leídas: ${tuplesRead}`);
            console.log(`   Estado: ${usageStatus}`);
            if (idx.es_primary) console.log(`   ⭐ PRIMARY KEY`);
            if (idx.es_unico) console.log(`   🔑 UNIQUE`);
            console.log();
        }

        // ═══════════════════════════════════════════════════════════════
        // PASO 2: ANÁLISIS Y RECOMENDACIONES
        // ═══════════════════════════════════════════════════════════════
        console.log('\n' + '═'.repeat(61));
        console.log('📊 ANÁLISIS DE ÍNDICES\n');

        const unused = indexDetails.filter(i => i.scans === 0 && !i.isPrimary);
        const littleUsed = indexDetails.filter(i => i.scans > 0 && i.scans <= 100 && !i.isPrimary);
        const wellUsed = indexDetails.filter(i => i.scans > 100 && !i.isPrimary);

        console.log(`✅ BIEN UTILIZADOS (>100 scans): ${wellUsed.length}`);
        wellUsed.forEach(i => {
            console.log(`   • ${i.nombre} - ${i.scans} scans - ${i.tamaño}`);
        });

        console.log(`\n⚠️  POCO UTILIZADOS (1-100 scans): ${littleUsed.length}`);
        littleUsed.forEach(i => {
            console.log(`   • ${i.nombre} - ${i.scans} scans - ${i.tamaño}`);
        });

        console.log(`\n❌ NO UTILIZADOS (0 scans): ${unused.length}`);
        unused.forEach(i => {
            console.log(`   • ${i.nombre} - ${i.tamaño} → CANDIDATO A ELIMINAR`);
        });

        // ═══════════════════════════════════════════════════════════════
        // PASO 3: DEFINICIÓN SQL DE CADA ÍNDICE
        // ═══════════════════════════════════════════════════════════════
        console.log('\n' + '═'.repeat(61));
        console.log('📋 DEFINICIÓN SQL DE ÍNDICES\n');

        const indexDefsResult = await db.raw(`
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'orden_oportunidades'
            ORDER BY indexname
        `);

        const indexDefs = indexDefsResult.rows;
        for (const def of indexDefs) {
            console.log(`\n${def.indexname}:`);
            console.log(`   ${def.indexdef};\n`);
        }

        // ═══════════════════════════════════════════════════════════════
        // PASO 4: RECOMENDACIONES FINALES
        // ═══════════════════════════════════════════════════════════════
        console.log('═'.repeat(61));
        console.log('\n💡 RECOMENDACIONES\n');

        if (unused.length > 0) {
            console.log(`✅ ELIMINAR ESTOS ${unused.length} ÍNDICES NO USADOS:`);
            unused.forEach(i => {
                console.log(`   DROP INDEX ${i.nombre};  -- Ahorro: ${i.tamaño}`);
            });
            console.log();
        }

        if (littleUsed.length > 0) {
            console.log(`⚠️  REVISAR ESTOS ${littleUsed.length} ÍNDICES POCO USADOS:`);
            littleUsed.forEach(i => {
                console.log(`   ${i.nombre} (${i.scans} scans) - ${i.tamaño}`);
                console.log(`      → Considerar eliminar si no es crítico\n`);
            });
        }

        console.log(`✅ MANTENER ESTOS ${wellUsed.length} ÍNDICES BIEN UTILIZADOS:`);
        wellUsed.forEach(i => {
            console.log(`   ${i.nombre} (${i.scans} scans) - ${i.tamaño}`);
        });

        console.log('\n' + '═'.repeat(61) + '\n');

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error);
    }

    process.exit(0);
}

auditIndexes();
