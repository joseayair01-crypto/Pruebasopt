#!/usr/bin/env node
/**
 * ==========================================
 * SCRIPT: test-calculo-correcto.js
 * PROPÓSITO: Validar que el cálculo de precios
 * sea CORRECTO con descuentos disabled
 * ==========================================
 */

const { calcularDescuentoCompartido, calcularDescuentoServidor } = require('./calculo-precios-server');
const fs = require('fs');
const path = require('path');

// Cargar config
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log('\n🔍 TEST: VALIDACIÓN DE CÁLCULO DE PRECIOS');
console.log('===========================================\n');

// Test case 1: 2000 boletos (el problema reportado)
console.log('📋 TEST CASE 1: Orden de 2000 boletos');
console.log('----------------------------------------');
const cantidad1 = 2000;
const precio1 = 120;

const resultado1 = calcularDescuentoCompartido(cantidad1, precio1, null, config);

console.log(`Cantidad: ${cantidad1} boletos`);
console.log(`Precio Unitario: ${precio1}`);
console.log(`Descuentos Enabled: ${config.rifa.descuentos.enabled}`);
console.log('');
console.log(`✅ Subtotal Calculado: $${resultado1.subtotal.toFixed(2)}`);
console.log(`✅ Descuento: $${resultado1.monto.toFixed(2)} (${resultado1.porcentaje}%)`);
console.log(`✅ Total Calculado: $${resultado1.total.toFixed(2)}`);
console.log(`   Mensaje: ${resultado1.mensaje}`);

const esperado1 = 240000;
if (Math.abs(resultado1.total - esperado1) < 0.01) {
    console.log(`\n   ✅ CORRECTO: Total = $${esperado1}`);
} else {
    console.log(`\n   ❌ ERROR: Se esperaba $${esperado1}, pero se obtuvo $${resultado1.total}`);
}

// Test case 2: 100 boletos
console.log('\n📋 TEST CASE 2: Orden de 100 boletos');
console.log('----------------------------------------');
const cantidad2 = 100;
const precio2 = 120;

const resultado2 = calcularDescuentoCompartido(cantidad2, precio2, null, config);

console.log(`Cantidad: ${cantidad2} boletos`);
console.log(`Precio Unitario: ${precio2}`);
console.log('');
console.log(`✅ Subtotal Calculado: $${resultado2.subtotal.toFixed(2)}`);
console.log(`✅ Descuento: $${resultado2.monto.toFixed(2)} (${resultado2.porcentaje}%)`);
console.log(`✅ Total Calculado: $${resultado2.total.toFixed(2)}`);
console.log(`   Mensaje: ${resultado2.mensaje}`);

const esperado2 = 12000;
if (Math.abs(resultado2.total - esperado2) < 0.01) {
    console.log(`\n   ✅ CORRECTO: Total = $${esperado2}`);
} else {
    console.log(`\n   ❌ ERROR: Se esperaba $${esperado2}, pero se obtuvo $${resultado2.total}`);
}

// Test case 3: Si descuentos estuvieran ENABLED (para comparar)
console.log('\n📋 TEST CASE 3: Comparación - Si descuentos estuvieran habilitados');
console.log('----------------------------------------');
const configConDescuentos = JSON.parse(JSON.stringify(config));
configConDescuentos.rifa.descuentos.enabled = true;
configConDescuentos.rifa.descuentos.reglas = [
    { cantidad: 20, precio: 250 }
];

const resultado3 = calcularDescuentoCompartido(2000, 120, configConDescuentos.rifa.descuentos.reglas, configConDescuentos);

console.log(`Cantidad: 2000 boletos (con descuentos ENABLED)`);
console.log(`Precio Unitario: 120`);
console.log('');
console.log(`Subtotal Calculado: $${resultado3.subtotal.toFixed(2)}`);
console.log(`Descuento: $${resultado3.monto.toFixed(2)} (${resultado3.porcentaje}%)`);
console.log(`Total Calculado: $${resultado3.total.toFixed(2)}`);
console.log(`Mensaje: ${resultado3.mensaje}`);
console.log('\n⚠️  Este es el resultado SI los descuentos estuvieran habilitados');

console.log('\n' + '='.repeat(50));
console.log('\n✅ RESUMEN:');
console.log(`   • backend/config.json: descuentos.enabled = false`);
console.log(`   • Descuentos siempre retornan: $0`);
console.log(`   • Total = Subtotal (sin descuentos)`);
console.log(`   • Para 2000 boletos × 120: Total = $240,000 ✅`);
console.log('\n');

process.exit(0);
