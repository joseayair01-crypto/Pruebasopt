#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:5001';
let token = '';

(async () => {
    try {
        // 1. LOGIN
        console.log('\n1. LOGIN...');
        const loginData = JSON.stringify({ username: 'admin', password: 'admin123' });
        await new Promise((resolve, reject) => {
            const req = http.request(`${API_BASE}/api/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
            }, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    const r = JSON.parse(data);
                    token = r.token;
                    console.log('   ✅ Token:', token.substring(0, 15) + '...');
                    resolve();
                });
            });
            req.on('error', reject);
            req.write(loginData);
            req.end();
        });

        // 2. PATCH CON IMAGEN
        console.log('\n2. PATCH /api/admin/config CON IMAGEN...');
        const patchData = JSON.stringify({
            rifa: {
                galeria: {
                    enabled: true,
                    imagenes: [
                        { url: 'img1.jpg', titulo: 'Original 1', descripcion: 'Desc 1' },
                        { url: 'img2.jpg', titulo: 'Original 2', descripcion: 'Desc 2' },
                        { url: 'img-nueya.jpg', titulo: 'IMAGEN NUEVA', descripcion: 'Test' }
                    ]
                }
            }
        });
        
        console.log('   Enviando 3 imágenes (1 nueva)');
        
        await new Promise((resolve, reject) => {
            const req = http.request(`${API_BASE}/api/admin/config`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'Content-Length': patchData.length
                }
            }, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    const r = JSON.parse(data);
                    console.log('   ✅ Respuesta:', r.success, r.message);
                    resolve();
                });
            });
            req.on('error', reject);
            req.write(patchData);
            req.end();
        });

        // 3. VERIFICAR ARCHIVO
        console.log('\n3. VERIFICAR config.json...');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const configPath = path.join(__dirname, 'config.json');
        const content = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(content);
        const imagenes = config.rifa?.galeria?.imagenes || [];
        
        console.log(`   Total de imágenes: ${imagenes.length}`);
        imagenes.forEach((img, i) => {
            console.log(`   [${i+1}] ${img.titulo}`);
        });
        
        const tieneNueva = imagenes.find(img => img.titulo === 'IMAGEN NUEVA');
        console.log(`   ¿Tiene IMAGEN NUEVA?: ${tieneNueva ? 'SÍ ✅' : 'NO ❌'}`);
        
    } catch (e) {
        console.error('ERROR:', e.message);
        process.exit(1);
    }
})();
