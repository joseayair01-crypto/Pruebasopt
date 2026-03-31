/**
 * Script: Hacer backup de schema actual (estructura sin datos)
 * Uso: node -r dotenv/config backup-schema.js
 * 
 * Este es el método recomendado para:
 * 1. Copiar BD exacta a otra cuenta/servidor
 * 2. Tener snapshot del schema actual
 * 3. Restaurar en caso de error
 * 
 * Genera un archivo SQL con:
 * - Todas las tablas
 * - Todas las columnas y tipos exactos
 * - Todas las constraints
 * - Todos los índices
 * - Secuencias
 * - SIN DATOS
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function backupSchema() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  BACKUP SCHEMA - Estructura actual sin datos              ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    try {
        // Obtener DATABASE_URL de environment
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
            throw new Error('DATABASE_URL no configurada en .env');
        }

        console.log('🔍 Conectando a BD...');
        console.log(`   URL: ${dbUrl.substring(0, 60)}...\n`);

        // Archivo de salida
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const outputFile = path.join(__dirname, `schema-backup-${timestamp}.sql`);

        console.log(`📁 Guardando en: ${outputFile}\n`);

        // Usar pg_dump para hacer backup SOLO de schema (sin datos)
        const pg_dump = spawn('pg_dump', [
            '--schema-only',      // Solo estructura, no datos
            '--no-privileges',    // Sin permisos (simplifica)
            '--no-owner',         // Sin información de owner
            '--clean',            // Incluir DROP IF EXISTS
            '--if-exists',        // Usar IF EXISTS en DROPs
            dbUrl
        ]);

        let output = '';
        let errors = '';

        pg_dump.stdout.on('data', (data) => {
            output += data.toString();
        });

        pg_dump.stderr.on('data', (data) => {
            errors += data.toString();
        });

        // Esperar a que termine
        await new Promise((resolve, reject) => {
            pg_dump.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`pg_dump exit code: ${code}\n${errors}`));
                }
            });

            pg_dump.on('error', (err) => {
                reject(err);
            });
        });

        // Agregar header útil
        const header = `-- ═══════════════════════════════════════════════════════════
-- SCHEMA BACKUP - Estructura BD Actualizada
-- Generado: ${new Date().toISOString()}
-- 
-- Uso:
--   psql -d "nueva_bd_url" < ${path.basename(outputFile)}
-- 
-- Este archivo contiene SOLO la estructura (sin datos):
-- - Tablas
-- - Columnas y tipos
-- - Constraints (PK, FK, UNIQUE, CHECK)
-- - Índices
-- - Secuencias
-- ═══════════════════════════════════════════════════════════\n\n`;

        const fullOutput = header + output;

        // Guardar archivo
        fs.writeFileSync(outputFile, fullOutput, 'utf8');

        // Contar elementos
        const tables = (output.match(/CREATE TABLE/g) || []).length;
        const indexes = (output.match(/CREATE INDEX/g) || []).length;
        const sequences = (output.match(/CREATE SEQUENCE/g) || []).length;

        console.log('✅ BACKUP COMPLETADO\n');
        console.log('📊 Contenido:');
        console.log(`   • Tablas: ${tables}`);
        console.log(`   • Índices: ${indexes}`);
        console.log(`   • Secuencias: ${sequences}`);
        console.log(`   • Tamaño: ${(fullOutput.length / 1024).toFixed(2)} KB\n`);

        console.log(`📁 Archivo: ${outputFile}\n`);

        console.log('🚀 Para usar este backup en BD nueva:\n');
        console.log('   Opción 1: Usando psql');
        console.log(`     psql -d "postgresql://user:pass@host/newdb" < ${path.basename(outputFile)}\n`);
        
        console.log('   Opción 2: Usando pg_restore (si es .dump)');
        console.log(`     pg_restore -d "postgresql://user:pass@host/newdb" ${path.basename(outputFile)}\n`);

        console.log('   Opción 3: En Supabase (copiar contenido en SQL editor)\n');

        process.exit(0);

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        
        // Si pg_dump no está instalado
        if (error.code === 'ENOENT') {
            console.error('\n⚠️  pg_dump no está instalado.');
            console.error('   En macOS: brew install postgresql');
            console.error('   En Linux: sudo apt-get install postgresql-client');
            console.error('   En Windows: https://www.postgresql.org/download/windows/\n');
        }
        
        console.error(error);
        process.exit(1);
    }
}

backupSchema();
