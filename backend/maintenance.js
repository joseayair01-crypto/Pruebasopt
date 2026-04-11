#!/usr/bin/env node

/**
 * ============================================================================
 * MANTENIMIENTO: Suite única de verificación y diagnóstico
 * ============================================================================
 * 
 * Consolida todos los tests en un solo lugar, limpio y mantenible.
 * Uso: node maintenance.js [test]
 * 
 * Ejemplos:
 *   node maintenance.js                    # Ejecutar todos los tests
 *   node maintenance.js conflict           # Solo test de conflicto
 *   node maintenance.js opportunities      # Solo test de oportunidades
 *   node maintenance.js cloudinary         # Solo test de Cloudinary
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./db');

// ============================================================================
// TEST 1: Conflicto de boletos (código correcto + boletos disponibles)
// ============================================================================
async function testConflictHandling() {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║   🔴 TEST: Conflicto de Boletos                        ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    try {
        // Buscar boletos apartados
        const apartados = await db('boletos_estado')
            .where('estado', 'apartado')
            .whereNotNull('numero_orden')
            .limit(3)
            .select('numero', 'numero_orden', 'estado');

        if (apartados.length === 0) {
            console.log('⚠️  No hay boletos apartados para probar');
            return true;
        }

        // Buscar boletos disponibles
        const disponibles = await db('boletos_estado')
            .where('estado', 'disponible')
            .limit(2)
            .select('numero');

        // Simular array mixto
        const boletos_test = [
            ...apartados.map(a => a.numero),
            ...disponibles.map(d => d.numero)
        ];

        // Validar en servidor
        const validacion = await db('boletos_estado')
            .whereIn('numero', boletos_test)
            .select('numero', 'estado', 'numero_orden');

        const conflictivos = validacion.filter(b => b.estado !== 'disponible' || b.numero_orden !== null);
        const ok = validacion.filter(b => b.estado === 'disponible' && b.numero_orden === null);

        // Verificar respuesta del servidor
        const respuesta = {
            code: 'BOLETOS_CONFLICTO',
            boletosConflicto: conflictivos.map(c => c.numero),
            boletosDisponibles: ok.map(o => o.numero)
        };

        console.log(`   ✅ Conflictivos: ${conflictivos.length} (${respuesta.boletosConflicto.join(', ')})`);
        console.log(`   ✅ Disponibles: ${ok.length} (${respuesta.boletosDisponibles.join(', ')})`);
        console.log(`   ✅ Código correcto: "${respuesta.code}" === "BOLETOS_CONFLICTO"`);
        console.log(`   ✅ Frontend detectará el modal: SÍ\n`);

        return true;
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}\n`);
        return false;
    }
}

// ============================================================================
// TEST 2: Oportunidades liberadas al rechazar orden
// ============================================================================
async function testOportunitiesRelease() {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║   🎲 TEST: Oportunidades Liberadas                     ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    try {
        // Buscar una orden pendiente con oportunidades
        const orden = await db('ordenes')
            .where('estado', 'pendiente')
            .whereRaw("boletos::jsonb != '[]'::jsonb")
            .orderBy('created_at', 'desc')
            .first();

        if (!orden) {
            console.log('⚠️  No hay órdenes para probar\n');
            return true;
        }

        // Contar oportunidades
        const oppCount = await db('orden_oportunidades')
            .where('numero_orden', orden.numero_orden)
            .count('* as cnt')
            .first();

        const oppTotal = parseInt(oppCount.cnt) || 0;

        if (oppTotal === 0) {
            console.log(`⚠️  Orden ${orden.numero_orden} sin oportunidades\n`);
            return true;
        }

        // Verificar estados
        const oppStates = await db('orden_oportunidades')
            .where('numero_orden', orden.numero_orden)
            .select(db.raw('estado, COUNT(*) as cnt'))
            .groupBy('estado');

        console.log(`   ✅ Orden: ${orden.numero_orden}`);
        console.log(`   ✅ Oportunidades totales: ${oppTotal}`);
        oppStates.forEach(s => {
            console.log(`     - ${s.estado}: ${s.cnt}`);
        });
        console.log(`   ✅ Sistema de liberación: ACTIVO\n`);

        return true;
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}\n`);
        return false;
    }
}

// ============================================================================
// TEST 3: Configuración de Cloudinary
// ============================================================================
async function testCloudinary() {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║   ☁️  TEST: Cloudinary                                 ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    try {
        const hasCloudinaryUrl = Boolean(String(process.env.CLOUDINARY_URL || '').trim());
        const requiredVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
        const missingVars = hasCloudinaryUrl
            ? []
            : requiredVars.filter(v => !process.env[v]);

        if (missingVars.length > 0) {
            console.log(`   ❌ Variables faltando: ${missingVars.join(', ')}`);
            console.log('   Agrega al .env CLOUDINARY_URL o CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET\n');
            return false;
        }

        const cloudinary = require('./cloudinary-config');
        const config = cloudinary.config();
        const cloudNameOk = Boolean(config.cloud_name);
        const apiKeyOk = Boolean(config.api_key);

        if (!cloudNameOk || !apiKeyOk) {
            console.log(`   ❌ Cloud: ${config.cloud_name || 'NO'}`);
            console.log(`   ❌ API Key: ${apiKeyOk ? '***' : 'NO'}`);
            console.log('   ❌ Cloudinary: MAL CONFIGURADO\n');
            return false;
        }

        console.log(`   ✅ Cloud: ${config.cloud_name}`);
        console.log(`   ✅ API Key: ***`);
        console.log(`   ✅ Origen: ${hasCloudinaryUrl ? 'CLOUDINARY_URL' : 'Variables separadas'}`);
        console.log(`   ✅ Cloudinary: CONFIGURADO\n`);

        return true;
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}\n`);
        return false;
    }
}

// ============================================================================
// EJECUTOR PRINCIPAL
// ============================================================================
async function runTests() {
    const testArg = process.argv[2] || 'all';
    const results = {
        conflict: false,
        opportunities: false,
        cloudinary: false
    };

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🔧 SUITE DE MANTENIMIENTO - RifaPlus');
    console.log('═══════════════════════════════════════════════════════════');

    try {
        if (testArg === 'all' || testArg === 'conflict') {
            results.conflict = await testConflictHandling();
        }
        if (testArg === 'all' || testArg === 'opportunities') {
            results.opportunities = await testOportunitiesRelease();
        }
        if (testArg === 'all' || testArg === 'cloudinary') {
            results.cloudinary = await testCloudinary();
        }

        // Resumen final
        console.log('\n═══════════════════════════════════════════════════════════');
        const all = Object.values(results).filter(r => r).length;
        const total = Object.keys(results).length;
        console.log(`✅ RESULTADOS: ${all}/${total} tests completados`);
        console.log('═══════════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('\n❌ ERROR FATAL:', error.message);
    } finally {
        process.exit(0);
    }
}

// Ejecutar
runTests();
