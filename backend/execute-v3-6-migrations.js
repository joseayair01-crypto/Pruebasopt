/**
 * ============================================================================
 * EXECUTOR: V3.6 Migrations
 * ============================================================================
 * 
 * Ejecuta las 4 migraciones V3.6 en secuencia:
 * V3.6.1: Limpiar boletos_estado (4 cols) 
 * V3.6.2: Optimizar boletos_orden (1 col)
 * V3.6.3: Eliminar notas (1 col)
 * V3.6.4: Eliminar sorteo_configuracion (16 cols - tabla completa)
 * 
 * Total: 7 columnas eliminadas + 1 tabla
 * Riesgo: BAJO (todas verificadas como no usadas)
 * 
 * Uso: node execute-v3-6-migrations.js
 */

require('dotenv').config();
const knex = require('./db');
const path = require('path');

// Migraciones en orden de ejecución
const MIGRATIONS_V3_6 = [
    '20260211_migration_v3_6_1_limpiar_boletos_estado',
    '20260211_migration_v3_6_2_optimizar_boletos_orden',
    '20260211_migration_v3_6_3_eliminar_notas',
    '20260211_migration_v3_6_4_eliminar_sorteo_configuracion'
];

let resultados = {
    exitosas: [],
    fallidas: [],
    detalles: []
};

async function ejecutarMigracion(nombre) {
    try {
        console.log(`\n${'═'.repeat(70)}`);
        console.log(`⏳ Ejecutando: ${nombre}`);
        console.log('═'.repeat(70));

        const ruta = path.join(__dirname, 'db/migrations', `${nombre}.js`);
        const migracion = require(ruta);

        console.log(`\n🔄 Ejecutando .up()...`);
        await migracion.up(knex);
        
        resultados.exitosas.push(nombre);
        resultados.detalles.push({
            migracion: nombre,
            status: '✅ OK',
            timestamp: new Date().toISOString()
        });
        
        console.log(`✅ ${nombre} completada exitosamente\n`);
        return true;

    } catch (error) {
        console.error(`\n❌ ERROR en ${nombre}:`);
        console.error(`   ${error.message}`);
        
        resultados.fallidas.push(nombre);
        resultados.detalles.push({
            migracion: nombre,
            status: '❌ FALLO',
            error: error.message.substring(0, 100),
            timestamp: new Date().toISOString()
        });
        
        return false;
    }
}

async function generarReporte() {
    console.log(`\n${'═'.repeat(70)}`);
    console.log('📊 REPORTE FINAL - V3.6 MIGRATIONS');
    console.log('═'.repeat(70));

    const total = MIGRATIONS_V3_6.length;
    const exitosas = resultados.exitosas.length;
    const fallidas = resultados.fallidas.length;
    const porcentaje = Math.round((exitosas / total) * 100);

    console.log(`\n✅ Exitosas: ${exitosas}/${total}`);
    console.log(`❌ Fallidas: ${fallidas}/${total}`);
    console.log(`📈 Tasa de éxito: ${porcentaje}%\n`);

    // Detalles
    console.log('Detalles de ejecución:');
    resultados.detalles.forEach((d, i) => {
        console.log(`  ${i + 1}. ${d.migracion.substring(20)}: ${d.status}`);
        if (d.error) console.log(`     Error: ${d.error}`);
    });

    // Resumen de columnas eliminadas
    console.log(`\n${'─'.repeat(70)}`);
    console.log('📊 COLUMNAS ELIMINADAS (POST-V3.6):');
    console.log('─'.repeat(70));

    if (exitosas >= 1) {
        console.log('\n✅ boletos_estado (-4 columnas):');
        console.log('   - estado_anterior (auditoría no usada)');
        console.log('   - reservado_en (timestamp no consultado)');
        console.log('   - vendido_en (timestamp no consultado)');
        console.log('   - cancelado_en (timestamp no consultado)');
    }

    if (exitosas >= 2) {
        console.log('\n✅ boletos_orden (-1 columna):');
        console.log('   - asignado_en (redundante con created_at)');
    }

    if (exitosas >= 3) {
        console.log('\n✅ ordenes (-1 columna):');
        console.log('   - notas (feature abandonada, nunca leída)');
    }

    if (exitosas >= 4) {
        console.log('\n✅ sorteo_configuracion (-16 columnas - TABLA COMPLETA):');
        console.log('   - Tabla no usada en código activo');
        console.log('   - Config real viene de js/config.js');
        console.log('   - API endpoints comentan "para el futuro"');
    }

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`📈 TOTAL ELIMINADO: ${exitosas >= 4 ? '7 columnas + 1 tabla (sorteo_configuracion)' : exitosas >= 3 ? '6 columnas' : exitosas >= 2 ? '5 columnas' : exitosas >= 1 ? '4 columnas' : 0}`);
    console.log('═'.repeat(70));

    if (fallidas === 0) {
        console.log('\n✅ TODAS LAS MIGRACIONES EXITOSAS - V3.6 COMPLETADA');
    } else {
        console.log(`\n⚠️  ${fallidas} migración(es) fallida(s) - REVISAR ERRORES ARRIBA`);
    }

    console.log('\n');
}

async function main() {
    console.log(`\n╔═══════════════════════════════════════════════════════════════════╗`);
    console.log(`║                   V3.6: OPTIMIZER MIGRATIONS                      ║`);
    console.log(`║              6 Columnas No Usadas - Eliminación Segura             ║`);
    console.log(`╚═══════════════════════════════════════════════════════════════════╝`);

    console.log('\n🔍 Migraciones a ejecutar:');
    MIGRATIONS_V3_6.forEach((m, i) => {
        console.log(`  ${i + 1}. ${m.substring(20)}`);
    });

    console.log(`\n⚠️  Advertencia: Esta operación eliminará 7 columnas y 1 tabla de la BD.`);
    console.log(`   Asegúrate de tener backup antes de continuar.\n`);

    // Ejecutar migraciones
    for (const migracion of MIGRATIONS_V3_6) {
        await ejecutarMigracion(migracion);
    }

    // Generar reporte
    await generarReporte();

    // Desconectar
    await knex.destroy();
    process.exit(resultados.fallidas.length === 0 ? 0 : 1);
}

main().catch(error => {
    console.error('❌ ERROR CRÍTICO:', error.message);
    process.exit(1);
});
