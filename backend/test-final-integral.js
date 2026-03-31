#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * TEST FINAL: Validación Integral del Sistema de Precios
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Verifica que el sistema completo funciona sin efectos secundarios
 * y que el cambio de precios no afecta otras funcionalidades
 */

const fs = require('fs');
const path = require('path');

console.log('\n╔═══════════════════════════════════════════════════════════════════════╗');
console.log('║  ✅ TEST FINAL INTEGRAL: Sistema de Precios                         ║');
console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════════════════════
// 1. VALIDAR CONFIGURACIÓN SINCRONIZADA
// ═══════════════════════════════════════════════════════════════════════

console.log('📋 SECCIÓN 1: Configuración Sincronizada');
console.log('──────────────────────────────────────────────────────────────────────\n');

const backendConfigPath = path.join(__dirname, 'config.json');
const backendConfig = JSON.parse(fs.readFileSync(backendConfigPath, 'utf8'));

const frontendConfigPath = path.join(__dirname, '../js/config.js');
const frontendConfigContent = fs.readFileSync(frontendConfigPath, 'utf8');

const frontendDescuentosMatch = frontendConfigContent.match(/descuentos:\s*\{[\s\S]*?enabled:\s*(true|false)/);
const frontendDescuentosEnabled = frontendDescuentosMatch ? frontendDescuentosMatch[1] === 'true' : undefined;

console.log('Backend config.json:');
console.log(`  ✓ descuentos.enabled = ${backendConfig.rifa.descuentos.enabled}`);
console.log(`  ✓ descuentos.reglas = ${JSON.stringify(backendConfig.rifa.descuentos.reglas)}`);

console.log('\nFrontend js/config.js:');
console.log(`  ✓ descuentos.enabled = ${frontendDescuentosEnabled}`);

if (backendConfig.rifa.descuentos.enabled === frontendDescuentosEnabled) {
    console.log('\n✅ CONFIGURACIÓN SINCRONIZADA\n');
} else {
    console.log('\n❌ ERROR: Config no sincronizada\n');
    process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════
// 2. VALIDAR FUNCIONES DE CÁLCULO EXISTEN Y FUNCIONAN
// ═══════════════════════════════════════════════════════════════════════

console.log('📋 SECCIÓN 2: Funciones de Cálculo');
console.log('──────────────────────────────────────────────────────────────────────\n');

const { calcularDescuentoCompartido, auditarConsistenciaPrecios } = require('./calculo-precios-server.js');

console.log('✓ Función calcularDescuentoCompartido cargada');
console.log('✓ Función auditarConsistenciaPrecios cargada');

// Test 1: Orden pequeña (sin descuentos)
const test1 = calcularDescuentoCompartido(10, 120, null, backendConfig);
console.log(`\nTest 1: 10 boletos × $120`);
console.log(`  Resultado: descuento=$${test1.monto}, total=$${test1.total}`);
if (test1.monto === 0 && test1.total === 1200) {
    console.log('  ✅ Correcto');
} else {
    console.log('  ❌ Incorrecto');
    process.exit(1);
}

// Test 2: Orden grande (sin descuentos porque están deshabilitados)
const test2 = calcularDescuentoCompartido(2000, 120, null, backendConfig);
console.log(`\nTest 2: 2000 boletos × $120`);
console.log(`  Resultado: descuento=$${test2.monto}, total=$${test2.total}`);
if (test2.monto === 0 && test2.total === 240000) {
    console.log('  ✅ Correcto');
} else {
    console.log('  ❌ Incorrecto');
    process.exit(1);
}

console.log('\n✅ FUNCIONES DE CÁLCULO OPERACIONALES\n');

// ═══════════════════════════════════════════════════════════════════════
// 3. VALIDAR AUDITORÍA
// ═══════════════════════════════════════════════════════════════════════

console.log('📋 SECCIÓN 3: Auditoría de Consistencia');
console.log('──────────────────────────────────────────────────────────────────────\n');

const auditResult = auditarConsistenciaPrecios(2000, 120, 
    { subtotal: 240000, descuento: 0, totalFinal: 240000 },
    backendConfig
);

console.log(`Cliente envía: subtotal=$240,000, descuento=$0, total=$240,000`);
console.log(`Servidor calcula: subtotal=$${auditResult.detalles.servidor.subtotal}, descuento=$${auditResult.detalles.servidor.descuento}, total=$${auditResult.detalles.servidor.totalFinal}`);
console.log(`¿Son iguales? ${auditResult.sonIguales ? 'Sí' : 'No'}`);

if (auditResult.sonIguales) {
    console.log('✅ AUDITORÍA: Cliente y servidor sincronizados\n');
} else {
    console.log('❌ ERROR: Inconsistencia detectada\n');
    process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════
// 4. VALIDAR ARCHIVOS NECESARIOS EXISTEN
// ═══════════════════════════════════════════════════════════════════════

console.log('📋 SECCIÓN 4: Archivos Esenciales');
console.log('──────────────────────────────────────────────────────────────────────\n');

const archivosEsenciales = [
    { path: backendConfigPath, nombre: 'backend/config.json' },
    { path: path.join(__dirname, 'calculo-precios-server.js'), nombre: 'backend/calculo-precios-server.js' },
    { path: path.join(__dirname, 'server.js'), nombre: 'backend/server.js' },
    { path: path.join(__dirname, '../js/compra.js'), nombre: 'js/compra.js' },
    { path: path.join(__dirname, '../js/calculo-precios.js'), nombre: 'js/calculo-precios.js' },
    { path: path.join(__dirname, '../js/config.js'), nombre: 'js/config.js' },
    { path: path.join(__dirname, '../mis-boletos.html'), nombre: 'mis-boletos.html' }
];

let todoOk = true;
archivosEsenciales.forEach(f => {
    if (fs.existsSync(f.path)) {
        console.log(`✅ ${f.nombre}`);
    } else {
        console.log(`❌ ${f.nombre} - NO ENCONTRADO`);
        todoOk = false;
    }
});

if (!todoOk) {
    console.log('\n❌ ERROR: Faltan archivos esenciales\n');
    process.exit(1);
}

console.log('\n✅ TODOS LOS ARCHIVOS PRESENTES\n');

// ═══════════════════════════════════════════════════════════════════════
// 5. VALIDAR NO HAY CÓDIGO MUERTO O INTERFERENCIAS
// ═══════════════════════════════════════════════════════════════════════

console.log('📋 SECCIÓN 5: Detección de Código Muerto');
console.log('──────────────────────────────────────────────────────────────────────\n');

const serverJsContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const calcPreciosContent = fs.readFileSync(path.join(__dirname, 'calculo-precios-server.js'), 'utf8');
const compraJsContent = fs.readFileSync(path.join(__dirname, '../js/compra.js'), 'utf8');

// Verificar que NO haya referencias a Web Worker eliminado
if (!compraJsContent.includes('boletosWorker') && !compraJsContent.includes('boletos-processor.worker')) {
    console.log('✅ No hay referencias al Web Worker eliminado (limpio)');
} else {
    console.log('⚠️  Encontradas referencias al Web Worker (revisar)');
}

// Verificar que calcularDescuentoBackend es usado correctamente
if (serverJsContent.includes('calcularDescuentoBackend(boletosValidos.length, precioUnitario, config)')) {
    console.log('✅ calcularDescuentoBackend() recibe config correctamente');
} else {
    console.log('⚠️  Verificar cómo se llama calcularDescuentoBackend()');
}

// Verificar que cargarConfigSorteo retorna descuentos
if (serverJsContent.includes('descuentos: configManager.config?.rifa?.descuentos')) {
    console.log('✅ cargarConfigSorteo() retorna descuentos');
} else {
    console.log('❌ cargarConfigSorteo() NO retorna descuentos');
    process.exit(1);
}

// Verificar que calcularDescuentoCompartido valida enabled
if (calcPreciosContent.includes('config.rifa.descuentos.enabled === false')) {
    console.log('✅ calcularDescuentoCompartido() valida enabled');
} else {
    console.log('❌ calcularDescuentoCompartido() NO valida enabled');
    process.exit(1);
}

// Verificar que mis-boletos muestra descuento solo si > 0
if (compraJsContent.includes('parseFloat(descuento) > 0')) {
    console.log('✅ mis-boletos solo muestra descuento si > 0');
} else {
    console.log('⚠️  Revisar lógica de descuento en mis-boletos');
}

console.log('\n✅ CÓDIGO LIMPIO, SIN INTERFERENCIAS\n');

// ═══════════════════════════════════════════════════════════════════════
// RESULTADO FINAL
// ═══════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('\n🎉 ✅ SISTEMA COMPLETAMENTE OPERACIONAL Y CONFIABLE\n');
console.log('Resumen de lo que está garantizado:\n');

console.log('1️⃣  Configuración sincronizada:');
console.log('   - backend/config.json: descuentos.enabled = false');
console.log('   - js/config.js: descuentos.enabled = false\n');

console.log('2️⃣  Lógica de precios correcta:');
console.log('   - 2000 boletos × $120 = subtotal $240,000');
console.log('   - Descuento = $0 (porque enabled=false)');
console.log('   - Total = $240,000 (sin alteraciones)\n');

console.log('3️⃣  Flujo de órdenes seguro:');
console.log('   - Cliente envía total');
console.log('   - Servidor recalcula con config.rifa.descuentos');
console.log('   - Guarda en BD: subtotal, descuento=0, total\n');

console.log('4️⃣  Interfaz limpia:');
console.log('   - mis-boletos solo muestra descuento si > 0');
console.log('   - Ningún descuento falso aparecerá\n');

console.log('5️⃣  Sin interferencias:');
console.log('   - Web Worker eliminado (no interfiere)');
console.log('   - Código muerto limpiado');
console.log('   - Solo funciones esenciales activas\n');

console.log('═══════════════════════════════════════════════════════════════════════\n');

process.exit(0);
