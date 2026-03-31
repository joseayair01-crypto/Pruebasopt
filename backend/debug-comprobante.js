#!/usr/bin/env node

/**
 * ============================================================================
 * DEBUG: Simular POST a /api/public/ordenes-cliente/:numero_orden/comprobante
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║   DEBUG: Test de carga de comprobante                      ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Parámetros de test
const apiBase = 'http://localhost:5001';
const numeroOrden = 'ST-AA021';
const whatsapp = '3001234567'; // Ajusta al WhatsApp correcto
const archivoTest = path.join(__dirname, 'test-file.jpg');

// Crear un archivo de test (pequeña imagen JPG válida)
const jpgMiniatura = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9
]);

fs.writeFileSync(archivoTest, jpgMiniatura);
console.log(`✅ Archivo de test creado: ${archivoTest}\n`);

async function testUpload() {
    try {
        console.log('📤 Preparando FormData...');
        const form = new FormData();
        form.append('comprobante', fs.createReadStream(archivoTest));
        form.append('whatsapp', whatsapp);

        const apiUrl = `${apiBase}/api/public/ordenes-cliente/${encodeURIComponent(numeroOrden)}/comprobante`;
        console.log(`📍 URL: ${apiUrl}`);
        console.log(`📋 Orden: ${numeroOrden}`);
        console.log(`📱 WhatsApp: ${whatsapp}\n`);

        console.log('🚀 Enviando POST...');
        const response = await fetch(apiUrl, {
            method: 'POST',
            body: form,
            headers: form.getHeaders(),
            timeout: 30000
        });

        console.log(`✅ Response status: ${response.status}\n`);

        const data = await response.json();
        console.log('📦 Respuesta del servidor:');
        console.log(JSON.stringify(data, null, 2));

        if (response.ok) {
            console.log('\n✅ SUCCESS: Comprobante subido correctamente');
        } else {
            console.log(`\n❌ ERROR ${response.status}: ${data.message}`);
        }

        // Limpiar
        fs.unlinkSync(archivoTest);

    } catch (error) {
        console.error('\n❌ Error en request:');
        console.error(error.message);
        if (error.code) console.error(`   Código: ${error.code}`);
        
        // Limpiar
        if (fs.existsSync(archivoTest)) fs.unlinkSync(archivoTest);
    }
}

testUpload();
