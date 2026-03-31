/**
 * TEST DE VALIDACIÓN FRONTEND
 * Simula las validaciones que hace modal-contacto.js (frontend)
 * para asegurar que el orden_id generado es 100% válido
 */

const http = require('http');

// Estas son las funciones del frontend que validan el orden_id
function esOrdenIdOficial(ordenId) {
  // Regex: PREFIX-SSXXX formato
  return /^[A-Z0-9]+-[A-Z]{2}\d{3}$/.test(ordenId);
}

function ordenIdTienePrefijoActual(ordenId, prefijoEsperado) {
  // Validar que comience con el prefijo esperado + "-"
  return ordenId.startsWith(prefijoEsperado + '-');
}

console.log(`\n${'='.repeat(70)}`);
console.log('🔧 TEST DE VALIDACIÓN FRONTEND');
console.log(`${'='.repeat(70)}`);
console.log('Simulando validaciones de modal-contacto.js');
console.log(`${'='.repeat(70)}\n`);

// Realizar una solicitud al endpoint
const postData = JSON.stringify({});

const options = {
  hostname: 'localhost',
  port: 5001,
  path: '/api/public/order-counter/next',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      const ordenId = response?.orden_id || '';
      
      console.log(`📨 Respuesta del backend:`);
      console.log(`   - Success: ${response?.success}`);
      console.log(`   - Orden ID: "${ordenId}"`);
      console.log();

      // Validaciones
      const prefijoEsperado = 'SS';
      console.log(`🔍 VALIDACIONES FRONTEND:\n`);

      // 1️⃣ Validar formato oficial
      const validoOficial = esOrdenIdOficial(ordenId);
      console.log(`1️⃣  esOrdenIdOficial(ordenId):`);
      console.log(`   Regex: /^[A-Z0-9]+-[A-Z]{2}\\d{3}$/`);
      console.log(`   Resultado: ${validoOficial ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   Orden ID: "${ordenId}"`);
      console.log();

      // 2️⃣ Validar prefijo correcto
      const tienePrefijo = ordenIdTienePrefijoActual(ordenId, prefijoEsperado);
      console.log(`2️⃣  ordenIdTienePrefijoActual(ordenId, "${prefijoEsperado}"):`);
      console.log(`   ¿Comienza con "${prefijoEsperado}-"? ${tienePrefijo ? '✅ YES' : '❌ NO'}`);
      console.log(`   Orden ID: "${ordenId}"`);
      console.log();

      // Resultado final
      const todosLosTestsValidos = validoOficial && tienePrefijo;
      
      if (todosLosTestsValidos) {
        console.log(`${'='.repeat(70)}`);
        console.log(`✅ VALIDACION EXITOSA`);
        console.log(`${'='.repeat(70)}`);
        console.log(`El orden_id "${ordenId}" pasó TODAS las validaciones frontendConsela el frontend aceptará este orden_id sin problemas.\n`);
        process.exit(0);
      } else {
        console.log(`${'='.repeat(70)}`);
        console.log(`❌ VALIDACION FALLIDA`);
        console.log(`${'='.repeat(70)}`);
        console.log(`El orden_id "${ordenId}" NO pasó todas las validaciones.`);
        console.log(`El frontend rechazará este orden_id con error: `);
        console.log(`  ORDER_COUNTER_INVALID_RESPONSE:${ordenId}\n`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error(`❌ Error de conexión: ${error.message}`);
  process.exit(1);
});

req.write(postData);
req.end();
