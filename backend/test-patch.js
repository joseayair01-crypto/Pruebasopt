const jwt = require('jsonwebtoken');
const http = require('http');
require('dotenv').config();

const token = jwt.sign({
    id: 1,
    username: 'admin',
    rol: 'administrador'
}, process.env.JWT_SECRET, { expiresIn: '1h' });

console.log('🧪 TEST: PATCH endpoint\n');

const newData = {
    sistemaPremios: {
        sorteo: [
            {
                posicion: 1,
                nombre: 'TEST: Primer Lugar',
                premio: 'Test Prize',
                descripcion: 'Test Description',
                icono: '✅'
            }
        ],
        presorteo: [],
        ruletazos: []
    }
};

const body = JSON.stringify(newData);

const req = http.request('http://localhost:5001/api/admin/config', {
    method: 'PATCH',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
    }
}, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        const result = JSON.parse(data);
        if (result.success) {
            console.log('✅ PATCH exitoso');
            console.log('   Regalo guardado:', result.data.sistemaPremios.sorteo[0].nombre);
            console.log('');
            console.log('Verificando config.json...');
            
            // Verify by GET
            setTimeout(() => {
                const req2 = http.request('http://localhost:5001/api/admin/config', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                }, (res2) => {
                    let data2 = '';
                    res2.on('data', c => data2 += c);
                    res2.on('end', () => {
                        const result2 = JSON.parse(data2);
                        if (result2.data.sistemaPremios.sorteo[0].nombre === 'TEST: Primer Lugar') {
                            console.log('✅ Verificación EXITOSA: Los cambios se guardaron en config.json');
                        }
                    });
                });
                req2.end();
            }, 500);
        } else {
            console.log('❌ Error:', result.message);
        }
    });
});

req.on('error', e => {
    console.log('❌ Error en PATCH:', e.message);
});

req.write(body);
req.end();
