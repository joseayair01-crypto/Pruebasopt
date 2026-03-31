/**
 * ============================================================
 * TEST: Verificar que descuentos por tiempo se guardan en BD
 * ============================================================
 */

async function testDescuentoPorTiempoEnBD() {
    console.log('\n🧪 TEST: Descuentos por promoción de tiempo en BD\n');

    const axios = require('axios');

    // Datos de prueba
    const ordenPrueba = {
        ordenId: `TEST-DESCUENTO-${Date.now()}`,
        cliente: {
            nombre: 'Test Cliente',
            apellidos: 'Descuento Tiempo',
            whatsapp: '1234567890',
            estado: 'Prueba',
            ciudad: 'Prueba'
        },
        boletos: [1, 2, 3],  // 3 boletos
        cantidad_boletos: 3,
        totales: {
            subtotal: 60.00,      // 3 × $20
            descuento: 15.00,     // 3 × $5 (promoción de tiempo)
            totalFinal: 45.00     // 60 - 15
        },
        precioUnitario: 15.00,  // Ya con promoción
        cuenta: {
            accountNumber: '123456789',
            nombreBanco: 'Banco Prueba',
            numero_referencia: 'REF-12345'
        }
    };

    try {
        console.log('📤 Enviando orden con descuento por tiempo...');
        console.log('   Descuento esperado: $15.00\n');

        const response = await axios.post(
            'http://localhost:5001/api/ordenes',
            ordenPrueba,
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            }
        );

        if (response.data.success) {
            const ordenId = response.data.ordenId;
            console.log(`✅ Orden creada: ${ordenId}\n`);

            // Ahora recuperar la orden para verificar que se guardó el descuento
            console.log('📥 Recuperando orden de BD...\n');

            const getResponse = await axios.get(
                `http://localhost:5001/api/ordenes/${ordenId}`,
                { timeout: 10000 }
            );

            const ordenGuardada = getResponse.data;

            console.log('📋 DATOS GUARDADOS EN BD:');
            console.log(`   Precio Unitario: $${ordenGuardada.precio_unitario}`);
            console.log(`   Subtotal: $${ordenGuardada.subtotal}`);
            console.log(`   Descuento: $${ordenGuardada.descuento}`);
            console.log(`   Total: $${ordenGuardada.total}\n`);

            // Validar
            const descuentoGuardado = parseFloat(ordenGuardada.descuento);
            
            if (descuentoGuardado === 15.00) {
                console.log('✅ ¡ÉXITO! El descuento por tiempo se guardó correctamente.');
                console.log('   Descuento guardado: $15.00\n');
                return { success: true, descuento: descuentoGuardado };
            } else if (descuentoGuardado === 0) {
                console.log('❌ ¡ERROR CRÍTICO! El descuento se guardó como $0');
                console.log('   Se perdió el descuento por tiempo en la BD\n');
                return { success: false, descuento: descuentoGuardado, error: 'Descuento se perdió' };
            } else {
                console.log(`⚠️  Descuento inesperado: $${descuentoGuardado} (esperado: $15.00)\n`);
                return { success: false, descuento: descuentoGuardado, error: 'Valor inesperado' };
            }

        } else {
            console.log('❌ Error al crear orden:');
            console.log(response.data.message || 'Error desconocido\n');
            return { success: false, error: response.data.message };
        }

    } catch (error) {
        console.error('❌ Error en test:', error.message);
        return { success: false, error: error.message };
    }
}

// Exportar para ejecutar desde CLI
if (require.main === module) {
    testDescuentoPorTiempoEnBD().then(resultado => {
        console.log('\n════════════════════════════════════════════');
        if (resultado.success) {
            console.log('✅ TEST PASADO: Descuentos se guardan correctamente');
        } else {
            console.log('❌ TEST FALLIDO: ' + resultado.error);
        }
        console.log('════════════════════════════════════════════\n');
        process.exit(resultado.success ? 0 : 1);
    });
}

module.exports = { testDescuentoPorTiempoEnBD };
