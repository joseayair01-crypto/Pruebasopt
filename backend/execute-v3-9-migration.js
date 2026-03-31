#!/usr/bin/env node
/**
 * ============================================================
 * EJECUTOR V3.9: LIMPIAR TABLAS MUERTAS DE AUDITORÍA
 * ============================================================
 */

require('dotenv').config();
const knex = require('./db');

async function executeV39Migration() {
    try {
        // Ejecutar migración V3.9
        await require('./db/migrations/20260211_migration_v3_9_limpiar_auditoria.js').up(knex);

        // Obtener estado final
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const tables = await knex.raw(`
            SELECT 
                schemaname,
                tablename,
                pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
            FROM pg_tables 
            WHERE schemaname = 'public' 
            ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        `);

        console.log('\n📊 ESTADO FINAL DE LA BD:\n');
        console.log('Table                              Size');
        console.log('-'.repeat(50));
        
        let totalSize = 0;
        for (const row of tables.rows) {
            const name = row.tablename.padEnd(32);
            console.log(`${name} ${row.size}`);
        }

        console.log('-'.repeat(50));
        
        // Obtener tamaño total
        const totalResult = await knex.raw(`
            SELECT pg_size_pretty(sum(pg_total_relation_size(schemaname||'.'||tablename))) as total
            FROM pg_tables 
            WHERE schemaname = 'public'
        `);
        
        console.log(`TOTAL BD: ${totalResult.rows[0].total}\n`);

        // Contar tablas
        const tableCount = tables.rows.length;
        console.log(`📌 Tablas activas: ${tableCount}\n`);

        console.log('🎉 ¡BD ULTRA LIMPIA!\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        await knex.destroy();
    }
}

executeV39Migration();
