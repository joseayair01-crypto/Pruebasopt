#!/usr/bin/env node

/**
 * ============================================================
 * SCRIPT: Resetear tabla boletos_estado
 * PROBLEMA: Muestra 0 boletos disponibles en frontend
 * SOLUCIÓN: Limpiar boletos_estado para que comience desde 0 vendidos/apartados
 * ============================================================
 */

const knex = require('knex');
const config = require('./knexfile');

const db = knex(config.development);

async function resetBoletos() {
    try {
        console.log('\n🧹 Limpiando tabla boletos_estado...\n');
        
        // 1. Contar registros actuales
        const countBefore = await db('boletos_estado').count('* as count').first();
        console.log(`📊 Registros antes: ${countBefore.count}`);
        
        // 2. Eliminar TODOS los registros
        const deleted = await db('boletos_estado').del();
        console.log(`🗑️  Registros eliminados: ${deleted}`);
        
        // 3. Verificar que está vacía
        const countAfter = await db('boletos_estado').count('* as count').first();
        console.log(`📊 Registros después: ${countAfter.count}`);
        
        console.log('\n✅ LISTO!\n');
        console.log('Ahora debería mostrar 250000 boletos disponibles en la máquina de suerte.\n');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

resetBoletos();
