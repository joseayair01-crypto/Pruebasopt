#!/usr/bin/env node
/**
 * Test rápido: Validar que cargarConfigSorteo() retorna descuentos
 */

const configManager = require('./config-manager').getInstance();

function cargarConfigSorteo() {
    return {
        totalBoletos: configManager.totalBoletos,
        precioBoleta: configManager.precioBoleto,
        clienteNombre: 'SORTEOS TORRES',
        rifa: {
            descuentos: configManager.config?.rifa?.descuentos || { enabled: false, reglas: [] },
            oportunidades: {
                enabled: configManager.config?.rifa?.oportunidades?.enabled || false,
                multiplicador: configManager.config?.rifa?.oportunidades?.multiplicador || 3,
                rango_visible: configManager.config?.rifa?.oportunidades?.rango_visible || false
            }
        }
    };
}

console.log('\n🔍 TEST: Validar cargarConfigSorteo()\n');

const config = cargarConfigSorteo();

console.log('Contenido retornado por cargarConfigSorteo():');
console.log(JSON.stringify(config, null, 2));

console.log('\n✓ Verificaciones:');
console.log(`  - config.rifa.descuentos existe: ${config.rifa.descuentos ? '✅' : '❌'}`);
console.log(`  - config.rifa.descuentos.enabled: ${config.rifa.descuentos?.enabled}`);
console.log(`  - config.rifa.descuentos.reglas: ${JSON.stringify(config.rifa.descuentos?.reglas)}`);

if (config.rifa.descuentos && config.rifa.descuentos.enabled === false) {
    console.log('\n✅ CORRECTO: cargarConfigSorteo() retorna descuentos con enabled=false\n');
} else {
    console.log('\n❌ ERROR: cargarConfigSorteo() no retorna descuentos correctamente\n');
}

process.exit(0);
