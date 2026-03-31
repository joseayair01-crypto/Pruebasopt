#!/usr/bin/env node

/**
 * Test: Verificar que las promociones de oportunidades se están guardando correctamente
 * Uso: node test-promo-sync.js
 */

const http = require('http');
const API_BASE = 'http://localhost:5001';
const TOKEN = 'test-token-admin'; // Reemplaza con token real si es necesario

let testsPassed = 0;
let testsFailed = 0;

function log(msg, level = 'info') {
    const colors = {
        info: '\x1b[36m',
        success: '\x1b[32m',
        error: '\x1b[31m',
        warn: '\x1b[33m'
    };
    const reset = '\x1b[0m';
    console.log(`${colors[level] || ''}[${level.toUpperCase()}]${reset} ${msg}`);
}

async function testRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(API_BASE + path);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: responseData ? JSON.parse(responseData) : null
                });
            });
        });

        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function runTests() {
    console.log('\n\n========================================');
    console.log('🧪 TEST: Promociones de Oportunidades Sync');
    console.log('========================================\n');

    try {
        // Test 1: GET current config
        log('TEST 1: Obteniendo configuración actual...');
        const getResponse = await testRequest('GET', '/api/admin/config');
        
        if (getResponse.status !== 200) {
            log(`❌ GET /api/admin/config retornó ${getResponse.status}`, 'error');
            testsFailed++;
        } else {
            log('✅ Configuración actual obtenida', 'success');
            testsPassed++;
            
            const currentPromos = getResponse.body?.rifa?.promocionesOportunidades;
            log(`📊 Promociones actuales: ${currentPromos?.ejemplos?.length || 0} ejemplos`, 'info');
            log(`   Contenido: ${JSON.stringify(currentPromos?.ejemplos, null, 2)}`, 'info');
        }

        // Test 2: PATCH con cambio de promociones
        log('\nTEST 2: Eliminando último ejemplo (índice 3)...', 'info');
        
        const updatedConfig = getResponse.body;
        if (updatedConfig?.rifa?.promocionesOportunidades?.ejemplos) {
            const ejemplosActuales = updatedConfig.rifa.promocionesOportunidades.ejemplos;
            log(`   Ejemplos ANTES: ${ejemplosActuales.length}`, 'info');
            
            // Simular eliminación (quitamos el último)
            ejemplosActuales.splice(3, 1);
            log(`   Ejemplos DESPUÉS: ${ejemplosActuales.length}`, 'info');
            log(`   Resultado: ${JSON.stringify(ejemplosActuales, null, 2)}`, 'info');
            
            // Hacer PATCH
            const patchResponse = await testRequest('PATCH', '/api/admin/config', {
                rifa: {
                    promocionesOportunidades: updatedConfig.rifa.promocionesOportunidades
                }
            });
            
            if (patchResponse.status !== 200) {
                log(`❌ PATCH /api/admin/config retornó ${patchResponse.status}`, 'error');
                testsFailed++;
            } else {
                log('✅ PATCH guardado exitosamente', 'success');
                testsPassed++;
            }
        }

        // Test 3: Verificar que se guardó
        log('\nTEST 3: Verificando que los cambios se guardaron...', 'info');
        const verifyResponse = await testRequest('GET', '/api/admin/config');
        
        if (verifyResponse.status === 200) {
            const verifyPromos = verifyResponse.body?.rifa?.promocionesOportunidades;
            log(`📊 Promociones después del cambio: ${verifyPromos?.ejemplos?.length || 0} ejemplos`, 'info');
            log(`   Contenido: ${JSON.stringify(verifyPromos?.ejemplos, null, 2)}`, 'info');
            
            if (verifyPromos?.ejemplos?.length === 3) {
                log('✅ Cambios persisten correctamente', 'success');
                testsPassed++;
            } else {
                log('❌ Los cambios no se guardaron correctamente', 'error');
                testsFailed++;
            }
        }

        console.log('\n========================================');
        console.log(`\n📈 RESULTADOS: ${testsPassed} ✅ | ${testsFailed} ❌`);
        console.log('========================================\n');

    } catch (error) {
        log(`\n💥 ERROR: ${error.message}`, 'error');
        console.error(error);
    }
}

// Iniciar tests
runTests();
