/**
 * ANÁLISIS: Por qué gasta tanta memoria
 */
const db = require('./db');

async function analizarBloat() {
    try {
        console.log('\n' + '='.repeat(70));
        console.log('🔍 ANÁLISIS DE BLOAT DE MEMORIA');
        console.log('='.repeat(70) + '\n');

        // 1. Tamaño de ordenes por columna
        console.log('📊 ORDENES - Tamaño por columna:');
        const ordenes = await db('ordenes').select('*').limit(5);
        if (ordenes.length > 0) {
            const o = ordenes[0];
            console.log('  Ejemplo de una orden:');
            for (const [key, val] of Object.entries(o)) {
                const size = JSON.stringify(val).length;
                console.log(`    ${key.padEnd(25)}: ${size.toString().padStart(6)} bytes`);
            }
        }

        // 2. Tamaño total del JSON boletos
        const boletos_sizes = await db('ordenes').select(
            db.raw('LENGTH(boletos::text) as json_size')
        ).orderBy('json_size', 'desc').limit(3);
        console.log('\n📦 ORDENES - Top 3 boletos JSON size:');
        boletos_sizes.forEach((b, i) => {
            console.log(`  Orden ${i+1}: ${b.json_size} bytes`);
        });

        // 3. oportunidades duplicados?
        console.log('\n🎲 ORDEN_OPORTUNIDADES - Análisis:');
        const opp_count = await db('orden_oportunidades').count('* as cnt').first();
        const opp_distinct = await db('orden_oportunidades').countDistinct('numero_orden as cnt').first();
        console.log(`  Total rows: ${opp_count.cnt}`);
        console.log(`  Órdenes únicas: ${opp_distinct.cnt}`);
        console.log(`  Ratio: ${(opp_count.cnt / opp_distinct.cnt).toFixed(1)} opp/orden`);

        // 4. order_id_counter contenido
        console.log('\n🔢 ORDER_ID_COUNTER - Contenido:');
        const counter = await db('order_id_counter').select('*');
        console.log(`  Rows: ${counter.length}`);
        if (counter.length > 0) {
            counter.forEach((c, i) => {
                console.log(`  Row ${i+1}: ${JSON.stringify(c).substring(0, 150)}`);
            });
        }

        // 5. Estadísticas generales
        console.log('\n📊 ESTADÍSTICAS GENERALES:');
        const stats = await db.raw(`
            SELECT 
                schemaname,
                tablename,
                round(pg_total_relation_size(schemaname||'.'||tablename) / 1024.0 / 1024.0, 2) as size_mb,
                n_live_tup as row_count
            FROM pg_stat_user_tables
            WHERE schemaname = 'public'
            ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        `);

        console.log('\nTablas por tamaño:');
        stats.rows.forEach(row => {
            console.log(`  ${row.tablename.padEnd(30)}: ${row.size_mb.toString().padStart(8)} MB (${row.row_count} rows)`);
        });

        console.log('\n' + '='.repeat(70));
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

analizarBloat();
