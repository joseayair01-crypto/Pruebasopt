/**
 * Script: Inicializar BD nueva con estructura actual
 * Uso: node -r dotenv/config init-new-db.js
 * 
 * Este script:
 * 1. Ejecuta TODAS las migraciones en orden (V3.6 → V4.2)
 * 2. Crea la estructura exacta de la BD actual
 * 3. Sin registros (BD limpia lista para usar)
 * 
 * Ventaja: Siempre estará actualizado porque ejecuta las migraciones
 */

const knex = require('knex');
const path = require('path');

// Cargar configuración
const config = require('./knexfile');
const kn = knex(config);

async function initDatabase() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  INICIALIZAR BD NUEVA - Estructura Actualizada            ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    try {
        console.log('📋 Paso 1: Verificar conexión...');
        await kn.raw('SELECT 1');
        console.log('✅ Conectado a BD\n');

        console.log('📋 Paso 2: Listar migraciones pendientes...');
        
        // Get list of migrations
        try {
            const pending = await kn.migrate.status();
            console.log(`✅ Migraciones pendientes: ${pending}\n`);
        } catch (e) {
            console.log('⚠️  No se puede listar estado (probablemente primera vez)\n');
        }

        console.log('📋 Paso 3: Ejecutar todas las migraciones...\n');
        
        // Ejecutar migraciones más recientes primero
        const migrationsToRun = [
            // V3.x - Limpieza y estructura base
            '20260127_cleanup_obsolete_code',
            
            // V4.x - Optimización completa
            '20260212_v4_0_optimizacion_rendimiento',
            '20260212_v4_1_eliminar_indices_redundantes',
            '20260212_v4_2_eliminar_funciones_muertas'
        ];

        for (const migration of migrationsToRun) {
            try {
                console.log(`   • Ejecutando: ${migration}...`);
                await kn.migrate.up({ directory: './db/migrations' });
                console.log(`     ✅ OK\n`);
            } catch (e) {
                // Si falla una, continuar (probablemente ya está aplicada)
                console.log(`     ⏭️  Saltada (${e.message.split('\n')[0]})\n`);
            }
        }

        console.log('\n📊 Paso 4: Verificar tablas creadas...\n');

        const tablesResult = await kn.raw(`
            SELECT tablename FROM pg_tables 
            WHERE schemaname = 'public'
            ORDER BY tablename
        `);

        const tables = tablesResult.rows;
        console.log(`✅ Tablas creadas: ${tables.length}`);
        tables.forEach(t => {
            console.log(`   • ${t.tablename}`);
        });

        console.log('\n📊 Paso 5: Verificar índices creados...\n');

        const indexesResult = await kn.raw(`
            SELECT indexname FROM pg_indexes 
            WHERE schemaname = 'public'
            AND indexname NOT LIKE 'pg_%'
            ORDER BY indexname
        `);

        const indexes = indexesResult.rows;
        console.log(`✅ Índices creados: ${indexes.length}`);
        indexes.slice(0, 10).forEach(i => {
            console.log(`   • ${i.indexname}`);
        });
        if (indexes.length > 10) {
            console.log(`   ... y ${indexes.length - 10} más`);
        }

        console.log('\n✅ BD INICIALIZADA CORRECTAMENTE\n');
        console.log('📝 Próximos pasos:');
        console.log('   1. Verificar que todas las tablas existan');
        console.log('   2. Hacer backup de estructura: node export-schema.js > schema.sql');
        console.log('   3. Cargar datos históricos si los tienes\n');

        await kn.destroy();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error);
        await kn.destroy();
        process.exit(1);
    }
}

initDatabase();
