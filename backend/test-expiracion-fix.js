/**
 * TEST: Verificar que las órdenes expiradas sin comprobante se liberan correctamente
 * 
 * PROBLEMA RESUELTO:
 * ✅ ordenExpirationService.js: Removimos `reservado_en` y `vendido_en` (línea 287-288)
 * ✅ boletoService.js: Removimos referencias a columnas deletreadas en 4 ubicaciones
 * 
 * CASO DE PRUEBA:
 * 1. Crear una orden sin comprobante
 * 2. Simular que tiene 2 horas de antigüedad
 * 3. Trigger expiration service
 * 4. Verificar: estado cambia a 'cancelada', boletos a 'disponible'
 */

const db = require('./db');

async function runTest() {
  try {
    console.log('\n🧪 INICIANDO TEST DE EXPIRACIÓN...\n');

    // PASO 1: Crear una orden vieja sin comprobante
    console.log('PASO 1: Creando orden sin comprobante con 2 horas de antigüedad...');
    
    const oldTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000);
    
    const [numeroOrden] = await db('ordenes')
      .insert({
        numero_orden: `TEST-${Date.now()}`,
        cliente_whatsapp: '3001234567',
        estado: 'pendiente',
        comprobante_recibido: false,
        total: 10000,
        cantidad_boletos: 2,
        created_at: oldTimestamp,
        updated_at: oldTimestamp
      })
      .returning('id');

    console.log(`✅ Orden creada: ${numeroOrden}`);

    // PASO 2: Asignarle 2 boletos
    console.log('\nPASO 2: Asignando boletos apartado...');
    
    const boletosDisponibles = await db('boletos_estado')
      .where('estado', 'disponible')
      .limit(2);

    if (boletosDisponibles.length < 2) {
      throw new Error('No hay boletos disponibles para el test');
    }

    await db('boletos_estado')
      .whereIn('id', boletosDisponibles.map(b => b.id))
      .update({
        estado: 'apartado',
        numero_orden: numeroOrden.id,
        updated_at: oldTimestamp
      });

    console.log(`✅ 2 boletos asignados en estado 'apartado'`);

    // PASO 3: Verificar estado antes de expiración
    console.log('\nPASO 3: Estado ANTES de expiración:');
    
    const ordenAntes = await db('ordenes').where('id', numeroOrden.id).first();
    const boletosAntes = await db('boletos_estado')
      .where('numero_orden', numeroOrden.id);

    console.log(`  Orden: ${ordenAntes.estado} (comprobante_recibido: ${ordenAntes.comprobante_recibido})`);
    console.log(`  Boletos: ${boletosAntes.length} registros`);
    boletosAntes.forEach(b => console.log(`    - ${b.numero}: ${b.estado}`));

    // PASO 4: Simular expiration service
    console.log('\nPASO 4: Ejecutando expiration service...');
    
    const ordenExpirationService = require('./services/ordenExpirationService');
    await ordenExpirationService.limpiarOrdenesExpiradas();
    
    console.log(`✅ Expiration service ejecutado`);

    // PASO 5: Verificar estado después de expiración
    console.log('\nPASO 5: Estado DESPUÉS de expiración:');
    
    const ordenDespues = await db('ordenes').where('id', numeroOrden.id).first();
    const boletosDespues = await db('boletos_estado')
      .where('numero_orden', numeroOrden.id)
      .orWhereIn('numero', boletosDisponibles.map(b => b.numero));

    console.log(`  Orden: ${ordenDespues.estado} (comprobante_recibido: ${ordenDespues.comprobante_recibido})`);
    
    if (boletosDespues.length > 0) {
      console.log(`  Boletos: ${boletosDespues.length} registros`);
      boletosDespues.forEach(b => console.log(`    - ${b.numero}: ${b.estado}`));
    } else {
      console.log(`  Boletos: Ninguno vinculado a orden (liberados correctamente)`);
    }

    // PASO 6: Validar resultados
    console.log('\n🔍 VALIDACIÓN DE RESULTADOS:');
    
    let testPassed = true;
    const issues = [];

    // Validación 1: Orden debe estar cancelada
    if (ordenDespues.estado !== 'cancelada' && ordenDespues.estado !== 'expirada') {
      testPassed = false;
      issues.push(`❌ Orden debería estar 'cancelada' o 'expirada', está '${ordenDespues.estado}'`);
    } else {
      console.log(`✅ Orden está en estado correcto: '${ordenDespues.estado}'`);
    }

    // Validación 2: Boletos deben estar disponibles o sin numero_orden
    const boletosOcupados = boletosDespues.filter(b => b.numero_orden !== null);
    if (boletosOcupados.length > 0) {
      testPassed = false;
      issues.push(`❌ ${boletosOcupados.length} boletos aún vinculados a orden`);
    } else {
      console.log(`✅ Todos los boletos han sido liberados`);
    }

    // Resultado Final
    console.log('\n' + '='.repeat(60));
    if (testPassed) {
      console.log('✅ TEST PASADO: Expiración funciona correctamente');
      console.log('   - Órdenes viejas sin comprobante se cancelan');
      console.log('   - Boletos se liberan sin errores de columnas deletreadas');
    } else {
      console.log('❌ TEST FALLIDO:');
      issues.forEach(i => console.log(`   ${i}`));
    }
    console.log('='.repeat(60) + '\n');

    // Limpiar datos de test
    console.log('Limpiando datos de test...');
    await db('boletos_estado')
      .where('numero_orden', numeroOrden.id)
      .update({
        estado: 'disponible',
        numero_orden: null
      });
    
    await db('ordenes')
      .where('id', numeroOrden.id)
      .del();
    
    console.log('✅ Datos de test eliminados\n');

    process.exit(testPassed ? 0 : 1);

  } catch (error) {
    console.error('\n❌ ERROR EN TEST:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTest();
