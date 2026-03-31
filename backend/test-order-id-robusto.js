/**
 * TEST ROBUSTO: Validar que la generación de orden ID funciona perfectamente
 * Con prefijo "SS" desde config.json
 */

const http = require('http');

const TEST_CASES = [
  {
    name: 'Prueba 1: Sin cliente_id (debería usar config)',
    body: {},
    expectedPrefix: 'SS'
  },
  {
    name: 'Prueba 2: Con cliente_id vacío (debería usar config)',
    body: { cliente_id: '' },
    expectedPrefix: 'SS'
  },
  {
    name: 'Prueba 3: Múltiples solicitudes (secuencial)',
    body: {},
    expectedPrefix: 'SS',
    count: 3
  }
];

let passedTests = 0;
let failedTests = 0;

function testOrderCounter(testCase, callback) {
  console.log(`\n🧪 ${testCase.name}`);
  console.log('=' .repeat(60));
  
  const count = testCase.count || 1;
  let results = [];
  
  function makeRequest(index) {
    const postData = JSON.stringify(testCase.body);
    
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
          const ordenId = response?.orden_id || '';  // ✅ CORREGIDO: esperábamos data.orden_id
          
          // Validar formato: SS-AA001
          const formatoValido = /^[A-Z]{2}-[A-Z]{2}\d{3}$/.test(ordenId);
          const prefijoValido = ordenId.startsWith(testCase.expectedPrefix + '-');
          
          results.push({
            index,
            ordenId,
            formatoValido,
            prefijoValido,
            response
          });
          
          if (index < count - 1) {
            makeRequest(index + 1);
          } else {
            // Procesar resultados
            console.log(`\n📊 Resultados (${count} solicitud${count > 1 ? 'es' : ''}):`);
            let allPassed = true;
            
            results.forEach((result, i) => {
              const estado = result.formatoValido && result.prefijoValido ? '✅' : '❌';
              console.log(`  ${estado} [${i + 1}] ${result.ordenId}`);
              
              if (!result.formatoValido) {
                console.log(`     ❌ Formato inválido: "${result.ordenId}"`);
                allPassed = false;
              }
              
              if (!result.prefijoValido) {
                console.log(`     ❌ Prefijo inválido: esperado "${testCase.expectedPrefix}-" pero obtuve "${result.ordenId.split('-')[0]}"`);
                allPassed = false;
              }
            });
            
            if (allPassed) {
              console.log(`\n✅ TEST PASADO: Todos los orden IDs generados correctamente`);
              passedTests++;
            } else {
              console.log(`\n❌ TEST FALLADO: Alguno de los orden IDs es inválido`);
              failedTests++;
            }
            
            callback();
          }
        } catch (error) {
          console.error(`❌ Error al parsear respuesta: ${error.message}`);
          console.error(`Respuesta recibida: ${data}`);
          failedTests++;
          callback();
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`❌ Error en la solicitud: ${error.message}`);
      failedTests++;
      callback();
    });
    
    req.write(postData);
    req.end();
  }
  
  makeRequest(0);
}

function runTests() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('🚀 INICIANDO PRUEBAS DE GENERACIÓN DE ORDEN ID');
  console.log(`${'='.repeat(60)}`);
  console.log('Validando que el prefijo sea siempre "SS" (NO "S")');
  console.log(`${'='.repeat(60)}`);
  
  let testIndex = 0;
  
  function nextTest() {
    if (testIndex < TEST_CASES.length) {
      const testCase = TEST_CASES[testIndex++];
      testOrderCounter(testCase, nextTest);
    } else {
      console.log(`\n${'='.repeat(60)}`);
      console.log('📈 RESUMEN FINAL');
      console.log(`${'='.repeat(60)}`);
      console.log(`✅ Tests pasados: ${passedTests}`);
      console.log(`❌ Tests fallados: ${failedTests}`);
      console.log(`📊 Total: ${passedTests + failedTests}`);
      
      if (failedTests === 0) {
        console.log(`\n🎉 ¡ÉXITO! Todos los tests pasaron correctamente`);
        process.exit(0);
      } else {
        console.log(`\n⚠️ Hay ${failedTests} test${failedTests > 1 ? 's' : ''} que fallaron`);
        process.exit(1);
      }
    }
  }
  
  nextTest();
}

// Esperar 2 segundos para que el servidor esté listo
setTimeout(runTests, 2000);
