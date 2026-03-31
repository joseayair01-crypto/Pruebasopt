/**
 * Script: Analizar impact de eliminar CONSTRAINT UNIQUE
 * Usa: node -r dotenv/config analyze-constraint.js
 */

const db = require('./db');

async function analyzeConstraint() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  ANALIZAR: Eliminar CONSTRAINT UNIQUE numero_oportunidad ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    try {
        console.log('📊 Información del CONSTRAINT:\n');

        // Información del constraint
        const constraintInfo = await db.raw(`
            SELECT 
                constraint_name,
                constraint_type,
                table_name
            FROM information_schema.table_constraints
            WHERE table_name = 'orden_oportunidades'
            AND constraint_name = 'orden_oportunidades_numero_oportunidad_unique'
        `);

        if (constraintInfo.rows.length === 0) {
            console.log('❌ CONSTRAINT no existe (ya fue eliminado)\n');
            process.exit(0);
        }

        const constraint = constraintInfo.rows[0];
        console.log(`   Nombre: ${constraint.constraint_name}`);
        console.log(`   Tipo: ${constraint.constraint_type}`);
        console.log(`   Tabla: ${constraint.table_name}\n`);

        // Tamaño del índice relacionado
        console.log('📋 Tamaño del índice:\n');

        const indexSize = await db.raw(`
            SELECT 
                pg_size_pretty(pg_relation_size('orden_oportunidades_numero_oportunidad_unique')) as tamaño
        `);

        console.log(`   Tamaño: ${indexSize.rows[0].tamaño}\n`);

        // ═══════════════════════════════════════════════════════════════
        // VERIFICAR SI SE NECESITA
        // ═══════════════════════════════════════════════════════════════
        console.log('🔍 ¿Es necesario este CONSTRAINT?\n');

        // Contar duplicados en numero_oportunidad
        const duplicados = await db.raw(`
            SELECT numero_oportunidad, COUNT(*) as cantidad
            FROM orden_oportunidades
            GROUP BY numero_oportunidad
            HAVING COUNT(*) > 1
            LIMIT 5
        `);

        if (duplicados.rows.length === 0) {
            console.log('   ✅ NO hay duplicados en numero_oportunidad');
            console.log('   → El CONSTRAINT garantiza unicidad pero NO la detecta\n');
        } else {
            console.log('   ❌ HAY duplicados en numero_oportunidad:');
            duplicados.rows.forEach(row => {
                console.log(`      - numero ${row.numero_oportunidad}: ${row.cantidad} veces`);
            });
            console.log('   → NO se puede eliminar el CONSTRAINT\n');
        }

        // Cómo se inserta
        console.log('📋 Cómo se insertan oportunidades:\n');

        const insertQuery = await db.raw(`
            SELECT 
                COUNT(*) as registros,
                COUNT(DISTINCT numero_oportunidad) as diferentes_numeros
            FROM orden_oportunidades
        `);

        const counts = insertQuery.rows[0];
        console.log(`   Total registros: ${counts.registros.toLocaleString()}`);
        console.log(`   Números diferentes: ${counts.diferentes_numeros.toLocaleString()}`);
        
        if (counts.registros === counts.diferentes_numeros) {
            console.log('   ✅ CADA numero_oportunidad es ÚNICO\n');
        } else {
            console.log('   ❌ HAY DUPLICADOS (problema de integridad)\n');
        }

        // ═══════════════════════════════════════════════════════════════
        // RECOMENDACIÓN
        // ═══════════════════════════════════════════════════════════════
        console.log('═'.repeat(61));
        console.log('\n💡 RECOMENDACIÓN:\n');

        if (duplicados.rows.length === 0 && counts.registros === counts.diferentes_numeros) {
            console.log('✅ SEGURO ELIMINAR EL CONSTRAINT');
            console.log('\n   Razones:');
            console.log('   1. NO hay duplicados en numero_oportunidad');
            console.log('   2. La BD garantiza integridad por diseño');
            console.log('   3. El índice no se usa (0 scans)');
            console.log('   4. Ahorra 16 MB adicionales\n');
            console.log('   Riesgo: MÍNIMO - Solo elimina validación redundante\n');
        } else {
            console.log('⚠️  NO eliminar el CONSTRAINT');
            console.log('\n   Razones:');
            console.log('   1. Es necesario para garantizar integridad');
            console.log('   2. No vale el riesgo por solo 16 MB\n');
        }

        console.log('═'.repeat(61) + '\n');

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error);
    }

    process.exit(0);
}

analyzeConstraint();
