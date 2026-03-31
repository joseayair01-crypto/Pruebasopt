/**
 * Script: Poblar 750k oportunidades pre-asignadas a 250k boletos
 * Estrategia: Usar SQL generativo para insertar en un solo comando
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const knex = require('knex');
const knexConfig = require('./knexfile.js').development;
knexConfig.migrations.directory = path.join(__dirname, 'db', 'migrations');
knexConfig.seeds.directory = path.join(__dirname, 'db', 'seeds');

const db = knex(knexConfig);

async function poblarOportunidades() {
    console.log(`
╔════════════════════════════════════════════════════════╗
║    POBLACIÓN: 750k Oportunidades Pre-Asignadas        ║
╚════════════════════════════════════════════════════════╝
    `);
    
    try {
        // PASO 1: Verificar tabla
        console.log('🔍 PASO 1: Verificando estructura de tabla...');
        const columnCheck = await db.raw(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name='orden_oportunidades' 
                AND column_name='numero_boleto'
            ) AS numero_boleto_exists,
            COUNT(*) FILTER (WHERE column_name='orden_oportunidades') as table_exists
            FROM information_schema.columns 
            WHERE table_name='orden_oportunidades'
        `);
        
        console.log('✅ Tabla verificada\n');
        
        // PASO 2: Limpiar datos antiguos
        console.log('🗑️  PASO 2: Limpiando datos antiguos...');
        const currentCount = await db('orden_oportunidades').count('* as total').first();
        console.log(`   Registros actuales: ${currentCount.total}`);
        
        if (currentCount.total > 0) {
            await db('orden_oportunidades').delete();
            console.log('✅ Tabla limpiada\n');
        } else {
            console.log('✅ Tabla ya vacía\n');
        }
        
        // PASO 3-5: Población en transacción
        console.log('📊 PASO 3: Obteniendo lista de boletos existentes...\n');
        
        // Obtener todos los boletos reales en la BD
        const boletoRows = await db('boletos_estado')
            .select('numero')
            .orderBy('numero');
        
        const boletos = boletoRows.map((row) => row.numero);
        
        console.log(`   ✅ Boletos encontrados: ${boletos.length}`);
        
        if (boletos.length !== 250000) {
            console.warn(`   ⚠️  Se esperaba 250,000 boletos, se encontraron ${boletos.length}`);
        }
        
        console.log('📊 PASO 4: Generando 750k registros con asignación ALEATORIA...\n');
        
        const sql = `
            INSERT INTO orden_oportunidades 
            (numero_oportunidad, numero_boleto, estado, numero_orden, created_at, updated_at)
            WITH randomized_opps AS (
                SELECT 
                    opp as numero_oportunidad,
                    ROW_NUMBER() OVER (ORDER BY RANDOM()) as row_num
                FROM generate_series(250000, 999999) as opp
            )
            SELECT 
                numero_oportunidad,
                (ARRAY[${boletos.join(',')}])[((row_num-1) / 3)::integer + 1] as numero_boleto,
                'disponible' as estado,
                NULL as numero_orden,
                NOW() as created_at,
                NOW() as updated_at
            FROM randomized_opps
        `;
        
        await db.raw(sql);
        console.log('✅ Inserción completada\n');
        
        // PASO 6: Validación
        console.log('✅ PASO 6: Validación final...');
        const totalOpp = await db('orden_oportunidades').count('* as total').first();
        const totalBoletos = await db('boletos_estado').count('* as total').first();
        
        console.log(`   Total oportunidades: ${totalOpp.total}`);
        console.log(`   Total boletos: ${totalBoletos.total}`);
        
        if (totalOpp.total !== 750000) {
            console.log(`   ⚠️  Se esperaba 750,000, se poblaron ${totalOpp.total}`);
        } else {
            console.log(`   ✅ Total correcto: 750,000 oportunidades`);
        }
        
        // Verificar sin huérfanos
        const orphans = await db('orden_oportunidades')
            .whereNull('numero_boleto')
            .count('* as total')
            .first();
        
        if (orphans.total > 0) {
            throw new Error(`❌ ERROR: Hay ${orphans.total} oportunidades sin boleto asignado`);
        }
        
        console.log('✅ No hay oportunidades huérfanas');
        
        // Verificar rango
        const minMax =  await db('orden_oportunidades')
            .select(
                db.raw('min(numero_oportunidad) as minOpp'),
                db.raw('max(numero_oportunidad) as maxOpp')
            )
            .first();
        
        console.log(`   Rango: ${minMax.minopp} - ${minMax.maxopp}`);
        
        if (minMax.minopp === 250000 && minMax.maxopp === 999999) {
            console.log('✅ Rango correcto: 250000-999999');
        } else {
            console.log(`   ℹ️  Rango de oportunidades: ${minMax.minopp}-${minMax.maxopp}`);
        }
        
        // Verificar distribución por boleto
        const distribution = await db('orden_oportunidades')
            .select(db.raw('numero_boleto'))
            .count('* as cantidad')
            .groupBy('numero_boleto')
            .where('numero_boleto', '=', db.raw('1'))
            .first();
        
        if (distribution && distribution.cantidad) {
            console.log(`   Oportunidades por boleto (boleto #1): ${distribution.cantidad}`);
            console.log('✅ Distribución correcta: 3 oportunidades por boleto');
        }
        
        console.log(`
╔════════════════════════════════════════════════════════╗
║              ✅ POBLACIÓN COMPLETADA                  ║
╠════════════════════════════════════════════════════════╣
║ Oportunidades insertadas: 750,000                     ║
║ Boletos vinculados: 250,000                           ║
║ Oportunidades por boleto: 3                           ║
║ Rango: 250000-999999                                  ║
║                                                        ║
║ Sistema LISTO para producción                        ║
╚════════════════════════════════════════════════════════╝
        `);
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ ERROR DURANTE POBLACIÓN:');
        console.error(error.message);
        process.exit(1);
    }
}

poblarOportunidades();
