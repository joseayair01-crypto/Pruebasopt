/**
 * ============================================================
 * ARCHIVO: js/validar-oportunidades.js
 * DESCRIPCIÓN: Script de validación para verificar que el flujo
 * de oportunidades funciona correctamente en todas las páginas
 * ✅ Uso: Ejecutar en DevTools console para diagnóstico
 * ============================================================
 */

/**
 * 🧪 VALIDADOR MASTER - Verifica todos los componentes del sistema
 * Ejecutar en consola: window.validarFlujOportunidades()
 */
window.validarFlujOportunidades = function() {
    console.clear();
    console.log('%c═══════════════════════════════════════════════════', 'color: #FF3D3D; font-weight: bold; font-size: 14px');
    console.log('%c🧪 VALIDADOR DE OPORTUNIDADES - Sistema Completo', 'color: #FF3D3D; font-weight: bold; font-size: 16px');
    console.log('%c═══════════════════════════════════════════════════', 'color: #FF3D3D; font-weight: bold; font-size: 14px');
    
    const resultado = {
        checks: [],
        estado: 'OK'
    };
    
    // CHECK 1: OportunidadesManager disponible
    const check1 = typeof window.oportunidadesManager !== 'undefined';
    resultado.checks.push({
        nombre: 'OportunidadesManager existe',
        estado: check1 ? '✅' : '❌',
        valor: window.oportunidadesManager ? 'Instancia disponible' : 'NO DISPONIBLE'
    });
    
    // CHECK 2: Funciones de UI disponibles
    const check2a = typeof window.actualizarOportunidadesEnCarrito === 'function';
    const check2b = typeof window.sincronizarOportunidadesAlCarrito === 'function';
    resultado.checks.push({
        nombre: 'actualizarOportunidadesEnCarrito()',
        estado: check2a ? '✅' : '❌',
        valor: check2a ? 'Disponible' : 'NO DISPONIBLE'
    });
    resultado.checks.push({
        nombre: 'sincronizarOportunidadesAlCarrito()',
        estado: check2b ? '✅' : '❌',
        valor: check2b ? 'Disponible' : 'NO DISPONIBLE'
    });
    
    // CHECK 3: Estructura de datos global
    const check3 = typeof window.rifaplusOportunidadesCarrito === 'object';
    const cantBoletos = check3 ? Object.keys(window.rifaplusOportunidadesCarrito).length : 0;
    resultado.checks.push({
        nombre: 'window.rifaplusOportunidadesCarrito',
        estado: check3 ? '✅' : '❌',
        valor: check3 ? `${cantBoletos} boletos con oportunidades` : 'NO EXISTE'
    });
    
    // CHECK 4: Boletos en carrito global
    const boletosSelecionados = window.rifaplusSelectedNumbers ? 
        Array.from(window.rifaplusSelectedNumbers) : 
        JSON.parse(localStorage.getItem('rifaplusSelectedNumbers') || '[]');
    resultado.checks.push({
        nombre: 'Boletos en carrito',
        estado: boletosSelecionados.length > 0 ? '✅' : '⚠️',
        valor: `${boletosSelecionados.length} boletos seleccionados`
    });
    
    // CHECK 5: Orden actual en storage
    const ordenActual = JSON.parse(localStorage.getItem('rifaplus_orden_actual') || '{}');
    const cantOppEnOrden = ordenActual.boletosOcultos ? ordenActual.boletosOcultos.length : 0;
    resultado.checks.push({
        nombre: 'Oportunidades en orden guardada',
        estado: cantOppEnOrden > 0 ? '✅' : '⚠️',
        valor: `${cantOppEnOrden} oportunidades`
    });
    
    // CHECK 6: Config de oportunidades
    const oppEnabled = window.rifaplusConfig?.rifa?.oportunidades?.enabled === true;
    resultado.checks.push({
        nombre: 'Oportunidades habilitadas en config',
        estado: oppEnabled ? '✅' : '❌',
        valor: oppEnabled ? 'SÍ' : 'NO'
    });
    
    // CHECK 7: API Base del backend
    const apiBase = window.rifaplusConfig?.backend?.apiBase || 'NO CONFIGURADA';
    const isApiLocal = apiBase.includes('localhost') || apiBase.includes('127.0.0.1');
    resultado.checks.push({
        nombre: 'API Base URL',
        estado: '✅',
        valor: apiBase
    });
    
    // Mostrar resultados
    console.log('\n%c📋 RESUMEN DE VALIDACIONES:', 'color: #1A1A1A; font-weight: bold; font-size: 14px');
    resultado.checks.forEach(check => {
        const color = check.estado === '✅' ? '#10b981' : (check.estado === '⚠️' ? '#f59e0b' : '#ef4444');
        console.log(`%c${check.estado} ${check.nombre}: ${check.valor}`, `color: ${color}; font-size: 12px`);
    });
    
    // Mostrar estado detallado del cache
    console.log('\n%c📦 ESTADO DEL CACHE DE OPORTUNIDADES:', 'color: #1A1A1A; font-weight: bold; font-size: 14px');
    if (window.rifaplusOportunidadesCarrito && Object.keys(window.rifaplusOportunidadesCarrito).length > 0) {
        for (const [boleto, opps] of Object.entries(window.rifaplusOportunidadesCarrito)) {
            console.log(`  Boleto #${boleto}: ${Array.isArray(opps) ? opps.length : 0} oportunidades`);
        }
    } else {
        console.log('  (vacío - sin oportunidades cargadas)');
    }
    
    // Mostrar estadísticas del manager
    if (typeof window.obtenerEstadisticasOportunidades === 'function') {
        const stats = window.obtenerEstadisticasOportunidades();
        if (stats) {
            console.log('\n%c📊 ESTADÍSTICAS DEL MANAGER:', 'color: #1A1A1A; font-weight: bold; font-size: 14px');
            console.log(`  Cache hits: ${stats.cacheHits}`);
            console.log(`  Cache misses: ${stats.cacheMisses}`);
            console.log(`  Hit rate: ${stats.hitRate}%`);
            console.log(`  Tamaño del cache: ${stats.cacheSize} oportunidades`);
            console.log(`  Memoria usada: ${stats.memory}`);
        }
    }
    
    // Sugerencias
    console.log('\n%c💡 FLUJO DE PRUEBA RECOMENDADO:', 'color: #FF3D3D; font-weight: bold; font-size: 14px');
    console.log('1. Selecciona 2-3 boletos en la grilla (compra.html)');
    console.log('2. Abre el carrito (🛒)');
    console.log('3. Espera a que aparezcan oportunidades (texto "Oportunidades: XXX")');
    console.log('4. Ejecuta: window.validarFlujOportunidades() → verifica paso 3');
    console.log('5. Click en "Orden Formal"');
    console.log('6. Verifica que aparezca sección "Oportunidades Adicionales"');
    console.log('7. Click en "Continuar" y llenar formulario');
    console.log('8. Click en "Proceder al pago"');
    console.log('9. Llenar datos de cuenta');
    console.log('10. Click en "Confirmar orden"');
    console.log('11. Verifica que aparezca el modal de confirmación con oportunidades');
    
    console.log('\n%c🔍 COMANDOS ÚTILES:', 'color: #FF3D3D; font-weight: bold; font-size: 14px');
    console.log('  window.rifaplusOportunidadesCarrito         → Ver oportunidades en cache');
    console.log('  window.validarFlujOportunidades()          → Este validador');
    console.log('  window.sincronizarOportunidadesAlCarrito() → Sincronizar manualmente');
    console.log('  window.obtenerEstadisticasOportunidades()  → Ver stats del manager');
    console.log('  localStorage.getItem("rifaplus_orden_actual") → Ver orden guardada');
    
    console.log('\n%c═══════════════════════════════════════════════════', 'color: #FF3D3D; font-weight: bold; font-size: 14px');
    
    return resultado;
};

/**
 * 🔧 SINCRONIZADOR MANUAL - Fuerza la sincronización de oportunidades
 * Ejecutar en consola: window.sincronizarManual()
 */
window.sincronizarManual = function() {
    console.log('[SincronizarManual] 🔄 Iniciando sincronización manual...');
    
    if (typeof window.sincronizarOportunidadesAlCarrito === 'function') {
        const resultado = window.sincronizarOportunidadesAlCarrito();
        console.log('[SincronizarManual] ✅ Sincronización completada:', resultado);
        return resultado;
    } else {
        console.warn('[SincronizarManual] ⚠️  Función no disponible');
        return null;
    }
};

/**
 * 🧪 PRUEBA DE CARGA - Intenta cargar oportunidades de ejemplo
 * Ejecutar en consola: window.probarCargaOportunidades([1,5,10])
 */
window.probarCargaOportunidades = async function(numeros) {
    if (!window.oportunidadesManager) {
        console.error('❌ OportunidadesManager no disponible');
        return;
    }
    
    numeros = numeros || [1, 2, 3];  // Por defecto, prueba con boletos 1,2,3
    console.log(`[Prueba] 🚀 Cargando oportunidades para boletos: ${numeros.join(', ')}`);
    
    try {
        await window.oportunidadesManager.cargar(numeros);
        console.log('[Prueba] ✅ Carga completada');
        window.validarFlujOportunidades();
    } catch (error) {
        console.error('[Prueba] ❌ Error:', error);
    }
};

// Registrar cuando el script carga
console.log('%c✅ Validador de oportunidades cargado', 'color: #10b981; font-weight: bold');
console.log('%cEjecutar: window.validarFlujOportunidades() para diagnóstico completo', 'color: #10b981');
