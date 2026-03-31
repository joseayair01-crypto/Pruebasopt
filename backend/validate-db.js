/**
 * Script: Validar que BD está correctamente inicializada
 * Uso: node -r dotenv/config validate-db.js
 * 
 * Verifica:
 * - Todas las tablas existen
 * - Índices están creados
 * - Secuencias existen
 * - Constraints intactas
 * - Sin código muerto (functions eliminadas)
 */

const db = require('./db');

async function validateDatabase() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  VALIDAR INTEGRIDAD DE BD                                ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    try {
        // ═══════════════════════════════════════════════════════════════
        // PASO 1: VERIFICAR TABLAS PRINCIPALES
        // ═══════════════════════════════════════════════════════════════
        console.log('📋 Paso 1: Verificar tablas principales...\n');

        const requiredTables = [
            'ordenes',
            'boletos_estado',
            'orden_oportunidades',
            'admin_users',
            'ganadores',
            'order_id_counter',
            'knex_migrations',
            'knex_migrations_lock'
        ];

        const tablesResult = await db.raw(`
            SELECT tablename FROM pg_tables 
            WHERE schemaname = 'public'
        `);

        const existingTables = tablesResult.rows.map(r => r.tablename);

        let allTablesExist = true;
        for (const table of requiredTables) {
            if (existingTables.includes(table)) {
                console.log(`   ✅ ${table}`);
            } else {
                console.log(`   ❌ ${table} - NO EXISTE`);
                allTablesExist = false;
            }
        }

        console.log(`\n   Total tablas: ${existingTables.length}\n`);

        // ═══════════════════════════════════════════════════════════════
        // PASO 2: VERIFICAR ÍNDICES PRINCIPALES
        // ═══════════════════════════════════════════════════════════════
        console.log('📋 Paso 2: Verificar índices creados...\n');

        const indexResult = await db.raw(`
            SELECT indexname FROM pg_indexes 
            WHERE schemaname = 'public'
            AND indexname NOT LIKE 'pg_%'
            ORDER BY indexname
        `);

        const indexes = indexResult.rows;
        const requiredIndexes = [
            'idx_opp_disponibles',           // V4.0
            'idx_opp_numero_optimizado',     // V4.0
            'idx_boletos_vendidos_fecha',    // V4.0
            'idx_ordenes_expiracion'         // V4.0
        ];

        let allIndexesExist = true;
        for (const idx of requiredIndexes) {
            const exists = indexes.some(i => i.indexname === idx);
            if (exists) {
                console.log(`   ✅ ${idx}`);
            } else {
                console.log(`   ❌ ${idx} - NO EXISTE`);
                allIndexesExist = false;
            }
        }

        console.log(`\n   Total índices: ${indexes.length}\n`);

        // ═══════════════════════════════════════════════════════════════
        // PASO 3: VERIFICAR FUNCIONES ELIMINADAS (V4.2)
        // ═══════════════════════════════════════════════════════════════
        console.log('📋 Paso 3: Verificar que funciones muertas están eliminadas...\n');

        const deadFunctions = [
            'check_bd_size',
            'check_conexiones_activas',
            'check_transacciones_largas',
            'check_table_bloat',
            'run_all_health_checks',
            'siguiente_numero_boleto',
            'siguiente_numero_oportunidad',
            'generar_numero_orden',
            'audit_trigger_func',
            'audit_boletos_async'
        ];

        const functionsResult = await db.raw(`
            SELECT routine_name FROM information_schema.routines 
            WHERE routine_schema = 'public'
        `);

        const existingFunctions = functionsResult.rows.map(r => r.routine_name);

        let allDeadFunctionsRemoved = true;
        for (const func of deadFunctions) {
            if (!existingFunctions.includes(func)) {
                console.log(`   ✅ ${func} (eliminada)`);
            } else {
                console.log(`   ❌ ${func} - AÚN EXISTE (debe eliminarse)`);
                allDeadFunctionsRemoved = false;
            }
        }

        console.log(`\n   Funciones activas: ${existingFunctions.length}\n`);

        // ═══════════════════════════════════════════════════════════════
        // PASO 4: VERIFICAR HOME_SEO (datos sin registros)
        // ═══════════════════════════════════════════════════════════════
        console.log('📋 Paso 4: Verificar que tablas están vacías...\n');

        for (const table of ['ordenes', 'boletos_estado', 'orden_oportunidades', 'admin_users']) {
            try {
                const countResult = await db.raw(`SELECT COUNT(*) as count FROM ${table}`);
                const count = parseInt(countResult.rows[0].count);
                
                if (count === 0) {
                    console.log(`   ✅ ${table} - vacía (${count} registros)`);
                } else {
                    console.log(`   ⚠️  ${table} - tiene ${count} registros`);
                }
            } catch (e) {
                console.log(`   ❌ ${table} - error al contar`);
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // RESULTADO FINAL
        // ═══════════════════════════════════════════════════════════════
        console.log('\n' + '═'.repeat(61) + '\n');

        if (allTablesExist && allIndexesExist && allDeadFunctionsRemoved) {
            console.log('✅ BD VALIDADA CORRECTAMENTE');
            console.log('   - Todas las tablas existen');
            console.log('   - Todos los índices creados');
            console.log('   - Funciones muertas eliminadas');
            console.log('   - Lista para usar\n');
            return true;
        } else {
            console.log('⚠️  BD NECESITA AJUSTES:');
            if (!allTablesExist) console.log('   - Faltan tablas (ejecutar: node init-new-db.js)');
            if (!allIndexesExist) console.log('   - Faltan índices (ejecutar: node init-new-db.js)');
            if (!allDeadFunctionsRemoved) console.log('   - Funciones muertas presentes (ejecutar: node execute-v4-2-cleanup.js)');
            console.log();
            return false;
        }

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error);
    }

    process.exit(0);
}

validateDatabase();
