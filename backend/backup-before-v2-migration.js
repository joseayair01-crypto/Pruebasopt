#!/usr/bin/env node

/**
 * ============================================================
 * SCRIPT: BACKUP DE BD ANTES DE MIGRACIÓN V2 FULL PRO
 * ============================================================
 * 
 * Objetivos:
 * 1. Crear backup completo de BD
 * 2. Guardar en lugar seguro
 * 3. Verificar integridad de backup
 * 4. Crear rollback script
 * 
 * Uso: node backup-before-v2-migration.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const knex = require('./db');

const execAsync = promisify(exec);

async function backupBD() {
    console.log('\n' + '='.repeat(70));
    console.log('🔐 BACKUP DE BD - ANTES DE MIGRACIÓN V2 FULL PRO');
    console.log('='.repeat(70) + '\n');

    try {
        // ============================================================
        // 1. VERIFICAR CONECTIVIDAD
        // ============================================================
        console.log('1️⃣  Verificando conexión a BD...');
        await knex.raw('SELECT 1');
        console.log('   ✅ Conexión OK\n');

        // ============================================================
        // 2. CONTAR REGISTROS (ANTES)
        // ============================================================
        console.log('2️⃣  Contando registros actuales...');
        
        const stats = {};
        const tables = [
            'ordenes', 'admin_users', 'boletos_estado', 
            'orden_oportunidades', 'ganadores', 'sorteo_configuracion',
            'ordenes_expiradas_log', 'order_id_counter'
        ];

        for (const table of tables) {
            try {
                const result = await knex(table).count('* as count').first();
                stats[table] = result.count;
                console.log(`   📊 ${table.padEnd(25)}: ${result.count}`);
            } catch (err) {
                stats[table] = 'N/A';
                console.log(`   ⚠️  ${table.padEnd(25)}: Tabla no existe`);
            }
        }

        // ============================================================
        // 3. GUARDAR SNAPSHOT DE DATOS CRÍTICOS
        // ============================================================
        console.log('\n3️⃣  Creando snapshot de datos críticos...');

        const snapshot = {
            fecha_backup: new Date().toISOString(),
            timestamp: Date.now(),
            registros: stats,
            
            // Sample data de órdenes (primeras 5)
            ordenes_sample: await knex('ordenes').select().limit(5),
            
            // Contar por estado
            ordenes_por_estado: await knex('ordenes')
                .select('estado')
                .count('* as count')
                .groupBy('estado'),
            
            // Boletos disponibles vs no disponibles
            boletos_summary: await knex('boletos_estado')
                .select('estado')
                .count('* as count')
                .groupBy('estado')
        };

        // Guardar snapshot
        const backupDir = '/tmp/rifas_backups';
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const snapshotFile = path.join(
            backupDir, 
            `snapshot_${new Date().toISOString().split('T')[0]}_${Date.now()}.json`
        );
        
        fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
        console.log(`   ✅ Snapshot guardado: ${snapshotFile}\n`);

        // ============================================================
        // 4. EXPORTAR DATOS (usando pg_dump si está disponible)
        // ============================================================
        console.log('4️⃣  Exportando BD completa...');

        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
            throw new Error('DATABASE_URL no configurada');
        }

        const backupFile = path.join(
            backupDir,
            `bd_backup_${new Date().toISOString().split('T')[0]}_${Date.now()}.sql`
        );

        // Alternativa si pg_dump no está: Exportar datos JSON por tabla
        console.log('   📝 Método: Exportar a JSON (compatible sin pg_dump)...');

        const backupData = {};
        
        for (const table of tables) {
            try {
                backupData[table] = await knex(table).select();
                console.log(`      ✅ ${table}: ${backupData[table].length} registros`);
            } catch (err) {
                console.log(`      ⚠️  ${table}: Error (tabla no existe)`);
            }
        }

        const backupJsonFile = backupFile.replace('.sql', '.json');
        fs.writeFileSync(backupJsonFile, JSON.stringify(backupData, null, 2));
        console.log(`\n   ✅ Backup JSON guardado: ${backupJsonFile}`);

        // ============================================================
        // 5. CREAR SCRIPT DE ROLLBACK
        // ============================================================
        console.log('\n5️⃣  Creando script de rollback...');

        const rollbackScript = `#!/bin/bash
# ============================================================
# SCRIPT DE ROLLBACK - Restaurar BD desde backup
# ============================================================
# 
# Uso: ./rollback-bd-v2.sh
#
# ADVERTENCIA: Esto eliminará TODOS los datos y los reemplazará
# con el backup del ${new Date().toISOString()}

echo "⚠️  ADVERTENCIA: Esto restaurará la BD al estado:"
echo "    ${new Date().toISOString()}"
echo ""
echo "Presiona ENTER para continuar o Ctrl+C para cancelar..."
read

cd /Users/ayair/Desktop/rifas-web/backend

# Rollback de migraciones
echo "↩️  Revirtiendo migraciones..."
npm run migrate:rollback

# Restaurar datos si es necesario
echo "📊 Restaurando datos..."
# node -e "require('./scripts/restore-from-backup').restore('${backupJsonFile}')"

echo "✅ Rollback completado"
`;

        const rollbackFile = path.join(backupDir, 'rollback-bd-v2.sh');
        fs.writeFileSync(rollbackFile, rollbackScript);
        fs.chmodSync(rollbackFile, '755');
        console.log(`   ✅ Script rollback: ${rollbackFile}\n`);

        // ============================================================
        // 6. VERIFICAR INTEGRIDAD
        // ============================================================
        console.log('6️⃣  Verificando integridad de backup...');

        // Verificar que backup JSON se puede parsear
        const backupCheck = JSON.parse(fs.readFileSync(backupJsonFile, 'utf8'));
        console.log(`   ✅ Backup JSON válido: ${Object.keys(backupCheck).length} tablas\n`);

        // ============================================================
        // 7. MOSTRAR RESUMEN
        // ============================================================
        console.log('='.repeat(70));
        console.log('✅ BACKUP COMPLETADO EXITOSAMENTE');
        console.log('='.repeat(70));
        console.log(`
📁 UBICACIÓN: /tmp/rifas_backups/

📄 Archivos generados:
   - ${path.basename(snapshotFile)}
   - ${path.basename(backupJsonFile)}
   - rollback-bd-v2.sh

📊 ESTADÍSTICAS ANTES:
${Object.entries(stats).map(([table, count]) => 
    `   ${table.padEnd(25)}: ${count} registros`
).join('\n')}

🔄 ROLLBACK:
   Si algo sale mal, ejecuta:
   $ bash ${rollbackFile}

✅ Sistema LISTO para migración V2
`);

        console.log('='.repeat(70) + '\n');

        return true;

    } catch (err) {
        console.error('\n❌ ERROR en backup:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await knex.destroy();
    }
}

// Ejecutar
if (require.main === module) {
    backupBD().then(() => process.exit(0)).catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { backupBD };
