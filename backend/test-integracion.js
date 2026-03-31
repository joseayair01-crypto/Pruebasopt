#!/usr/bin/env node

/**
 * TEST DE INTEGRACIÓN COMPLETA: Subir imagen y verificar en carrusel
 * 1. Admin sube imagen (simula POST a /api/admin/upload-image)
 * 2. Admin guarda en config (PATCH /api/admin/config)
 * 3. Cliente accede a index.html (GET /api/cliente obtiene config)
 * 4. Verifica que galería tiene la imagen
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:5001';
let token = '';

console.log('\n' + '='.repeat(70));
console.log('🎬 TEST INTEGRACIÓN: Upload → Config → Carrusel');
console.log('='.repeat(70) + '\n');

(async () => {
    try {
        // PASO 1: Login
        console.log('📋 PASO 1: Login admin...');
        await new Promise((resolve, reject) => {
            const data = JSON.stringify({ username: 'admin', password: 'admin123' });
            const req = http.request(`${API_BASE}/api/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
            }, (res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    const r = JSON.parse(body);
                    token = r.token;
                    console.log('   ✅ Token obtenido\n');
                    resolve();
                });
            });
            req.on('error', reject);
            req.write(data);
            req.end();
        });

        // PASO 2: Simular upload de imagen a Cloudinary
        console.log('📋 PASO 2: Simular subida de imagen a Cloudinary...');
        const urlCloudinary = 'https://res.cloudinary.com/dxu3imvxt/image/upload/v1678956789/test-integracion.jpg';
        console.log('   ✅ Imagen simulada:', urlCloudinary + '\n');

        // PASO 3: PATCH /api/admin/config con imagen nueva
        console.log('📋 PASO 3: PATCH /api/admin/config (agregar imagen)...');
        await new Promise((resolve, reject) => {
            const patchData = JSON.stringify({
                rifa: {
                    galeria: {
                        enabled: true,
                        imagenes: [
                            {
                                url: 'https://res.cloudinary.com/dxu3imvxt/image/upload/v1234567890/test-integracion-1.jpg',
                                titulo: 'Foto Frontal Integración',
                                descripcion: 'Test de integración',
                                publicId: 'test-1'
                            },
                            {
                                url: 'https://res.cloudinary.com/dxu3imvxt/image/upload/v1234567890/test-integracion-2.jpg',
                                titulo: 'Foto Lateral Integración',
                                descripcion: 'Test de integración',
                                publicId: 'test-2'
                            }
                        ]
                    }
                }
            });

            const req = http.request(`${API_BASE}/api/admin/config`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'Content-Length': patchData.length
                }
            }, (res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    const r = JSON.parse(body);
                    console.log(`   ✅ PATCH exitoso, ${r.data?.rifa?.galeria?.imagenes?.length || 0} imágenes guardadas\n`);
                    resolve();
                });
            });
            req.on('error', reject);
            req.write(patchData);
            req.end();
        });

        // Pequeno delay para garantizar write
        await new Promise(resolve => setTimeout(resolve, 200));

        // PASO 4: GET /api/cliente (lo que hace index.html)
        console.log('📋 PASO 4: GET /api/cliente (simular carga desde index.html)...');
        let publicConfig = null;
        await new Promise((resolve, reject) => {
            const req = http.request(`${API_BASE}/api/cliente`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            }, (res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    const r = JSON.parse(body);
                    publicConfig = r.data;
                    console.log(`   ✅ Config pública obtenida\n`);
                    resolve();
                });
            });
            req.on('error', reject);
            req.end();
        });

        // PASO 5: Verificar que galería está en config pública
        console.log('📋 PASO 5: Verificar galería en config pública...');
        const galeria = publicConfig?.rifa?.galeria;
        const imagenes = galeria?.imagenes || [];

        console.log(`   Galería habilitada: ${galeria?.enabled ? 'SÍ' : 'NO'}`);
        console.log(`   Total de imágenes: ${imagenes.length}`);

        imagenes.forEach((img, i) => {
            console.log(`     [${i+1}] ${img.titulo}`);
            console.log(`         URL: ${img.url.substring(0, 50)}...`);
        });

        // PASO 6: Verificación final
        console.log('\n📋 PASO 6: Verificación final...');
        const tieneIntegracion = imagenes.find(img => 
            img.titulo.includes('Integración')
        );

        console.log('\n' + '='.repeat(70));
        if (tieneIntegracion && imagenes.length >= 2) {
            console.log('✅ ¡¡ÉXITO COMPLETO!!\n');
            console.log('   ✅ Imagen se guardó en servidor (config.json)');
            console.log('   ✅ Imagen se obtuvo desde GET /api/cliente');
            console.log('   ✅ Galería disponible para index.html carrusel');
            console.log('\n   🎬 El carrusel en index.html MOSTRARÁ las imágenes');
        } else {
            console.log('❌ FALLÓ - Imágenes no encontradas en respuesta pública\n');
            process.exit(1);
        }
        console.log('='.repeat(70) + '\n');

    } catch (e) {
        console.error('❌ ERROR:', e.message);
        process.exit(1);
    }
})();
