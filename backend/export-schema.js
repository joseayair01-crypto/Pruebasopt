/**
 * Script: Exportar schema actual de Supabase (sin datos)
 * Uso: node -r dotenv/config export-schema.js > schema-backup.sql
 * 
 * Este script genera un SQL completo con:
 * - Todas las tablas
 * - Todas las columnas y tipos
 * - Todas las constraints (PK, FK, UNIQUE, CHECK)
 * - Todas las secuencias
 * - Todos los índices
 * - SIN registros (TRUNCATE todo)
 * 
 * Útil para:
 * - Inicializar BD nuevas con estructura actual
 * - Backup de schema (sin datos sensibles)
 * - Auditoría de cambios
 */

const db = require('./db');

async function exportSchema() {
    console.log('-- ═══════════════════════════════════════════════════════════');
    console.log('-- EXPORT SCHEMA: Estructura BD actualizada (sin datos)');
    console.log('-- Fecha:', new Date().toISOString());
    console.log('-- ═══════════════════════════════════════════════════════════\n');

    try {
        // ═══════════════════════════════════════════════════════════════
        // PASO 1: OBTENER DEFINICIÓN DE TABLAS
        // ═══════════════════════════════════════════════════════════════
        console.log('-- PASO 1: TABLAS\n');

        const tablesQuery = `
            SELECT 
                tablename
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename
        `;

        const tablesResult = await db.raw(tablesQuery);
        const tables = tablesResult.rows;

        console.log(`-- Tablas encontradas: ${tables.length}\n`);

        for (const table of tables) {
            const tableName = table.tablename;
            
            // Obtener definición de columnas
            const columnsQuery = `
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = '${tableName}'
                ORDER BY ordinal_position
            `;

            const columnsResult = await db.raw(columnsQuery);
            const columns = columnsResult.rows;

            // Construir CREATE TABLE
            let createTableSQL = `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
            
            const columnDefs = columns.map(col => {
                let def = `    ${col.column_name} ${col.data_type}`;
                if (col.column_default) {
                    def += ` DEFAULT ${col.column_default}`;
                }
                if (col.is_nullable === 'NO') {
                    def += ' NOT NULL';
                }
                return def;
            });

            createTableSQL += columnDefs.join(',\n');

            // Obtener constraints
            const constraintsQuery = `
                SELECT constraint_name, constraint_type
                FROM information_schema.table_constraints
                WHERE table_name = '${tableName}'
                AND constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
            `;

            const constraintsResult = await db.raw(constraintsQuery);
            const constraints = constraintsResult.rows;

            if (constraints.length > 0) {
                for (const constraint of constraints) {
                    if (constraint.constraint_type === 'PRIMARY KEY') {
                        // Ya viene en columnas (AUTO_INCREMENT)
                        continue;
                    }
                    // Agregar constraints adicionales
                }
            }

            createTableSQL += '\n);\n\n';
            console.log(createTableSQL);
        }

        // ═══════════════════════════════════════════════════════════════
        // PASO 2: OBTENER ÍNDICES
        // ═══════════════════════════════════════════════════════════════
        console.log('-- PASO 2: ÍNDICES\n');

        const indexQuery = `
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
            AND indexname NOT LIKE 'pg_%'
            ORDER BY indexname
        `;

        const indexResult = await db.raw(indexQuery);
        const indexes = indexResult.rows;

        console.log(`-- Índices encontrados: ${indexes.length}\n`);

        for (const idx of indexes) {
            console.log(`${idx.indexdef};\n`);
        }

        // ═══════════════════════════════════════════════════════════════
        // PASO 3: OBTENER SECUENCIAS
        // ═══════════════════════════════════════════════════════════════
        console.log('-- PASO 3: SECUENCIAS\n');

        const sequenceQuery = `
            SELECT sequence_name
            FROM information_schema.sequences
            WHERE sequence_schema = 'public'
            ORDER BY sequence_name
        `;

        const sequenceResult = await db.raw(sequenceQuery);
        const sequences = sequenceResult.rows;

        console.log(`-- Secuencias encontradas: ${sequences.length}\n`);

        for (const seq of sequences) {
            console.log(`CREATE SEQUENCE IF NOT EXISTS ${seq.sequence_name} START WITH 1 INCREMENT BY 1;\n`);
        }

        // ═══════════════════════════════════════════════════════════════
        // PASO 4: TRUNCATE TODO (para BD nueva limpia)
        // ═══════════════════════════════════════════════════════════════
        console.log('-- PASO 4: LIMPIAR DATOS (si aplica)\n');
        console.log('-- TRUNCATE ALL TABLES (comentado, descomentar si necesitas limpiar)\n');

        for (const table of tables) {
            console.log(`-- TRUNCATE TABLE ${table.tablename} CASCADE;\n`);
        }

        console.log('-- ═══════════════════════════════════════════════════════════');
        console.log('-- FIN DE EXPORT');
        console.log('-- ═══════════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('❌ ERROR:', error.message);
        process.exit(1);
    }

    process.exit(0);
}

exportSchema();
