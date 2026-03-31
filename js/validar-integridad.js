/**
 * ============================================================
 * VALIDADOR DE INTEGRIDAD DE OPORTUNIDADES
 * Ejecutar en DevTools: window.validarIntegridad()
 * ============================================================
 */

window.validarIntegridad = function() {
    console.clear();
    console.log('%c═══════════════════════════════════════════════════', 'color: #FF3D3D; font-weight: bold; font-size: 14px');
    console.log('%c🔍 VALIDADOR DE INTEGRIDAD - Oportunidades', 'color: #FF3D3D; font-weight: bold; font-size: 16px');
    console.log('%c═══════════════════════════════════════════════════', 'color: #FF3D3D; font-weight: bold; font-size: 14px');
    
    const problemas = [];
    
    // 1. Verificar estructura de datos
    console.log('%n📋 VERIFICACIÓN 1: Estructura de Datos', 'color: #1A1A1A; font-weight: bold');
    
    if (!window.rifaplusOportunidadesCarrito) {
        console.warn('⚠️  window.rifaplusOportunidadesCarrito NO EXISTE');
        problemas.push('Cache de oportunidades no inicializado');
    } else {
        console.log('✅ window.rifaplusOportunidadesCarrito existe');
        
        const boletosConOpps = Object.keys(window.rifaplusOportunidadesCarrito);
        console.log(`   - Boletos con oportunidades: ${boletosConOpps.length}`);
        
        // Verificar cada boleto
        let totalOpps = 0;
        const oppsPorBoleto = {};
        
        for (const boleto of boletosConOpps) {
            const opps = window.rifaplusOportunidadesCarrito[boleto];
            if (!Array.isArray(opps)) {
                console.error(`❌ Boleto #${boleto}: No es array, es ${typeof opps}`);
                problemas.push(`Boleto #${boleto} con tipo incorrecto`);
            } else {
                oppsPorBoleto[boleto] = opps.length;
                totalOpps += opps.length;
                console.log(`   ✅ Boleto #${boleto}: ${opps.length} oportunidades`);
            }
        }
        
        console.log(`\n📊 Total de oportunidades: ${totalOpps}`);
        console.log(`   Proporción: ${(totalOpps / boletosConOpps.length).toFixed(2)} opps por boleto`);
    }
    
    // 2. Verificar duplicados
    console.log('%n🔄 VERIFICACIÓN 2: Duplicados', 'color: #1A1A1A; font-weight: bold');
    
    const oppUnicos = new Set();
    const oppDuplicados = new Set();
    
    if (window.rifaplusOportunidadesCarrito) {
        for (const boleto in window.rifaplusOportunidadesCarrito) {
            const opps = window.rifaplusOportunidadesCarrito[boleto];
            if (Array.isArray(opps)) {
                for (const opp of opps) {
                    const oppNum = Number(opp);
                    if (oppUnicos.has(oppNum)) {
                        oppDuplicados.add(oppNum);
                    }
                    oppUnicos.add(oppNum);
                }
            }
        }
    }
    
    if (oppDuplicados.size === 0) {
        console.log(`✅ SIN DUPLICADOS - ${oppUnicos.size} oportunidades únicas`);
    } else {
        console.error(`❌ ${oppDuplicados.size} OPORTUNIDADES DUPLICADAS`);
        console.log('   Duplicados:', Array.from(oppDuplicados).slice(0, 10).join(', '));
        problemas.push(`${oppDuplicados.size} oportunidades duplicadas`);
    }
    
    // 3. Verificar validez de números
    console.log('%n✔️  VERIFICACIÓN 3: Validez de Números', 'color: #1A1A1A; font-weight: bold');
    
    let numerosInvalidos = 0;
    
    if (window.rifaplusOportunidadesCarrito) {
        for (const boleto in window.rifaplusOportunidadesCarrito) {
            const opps = window.rifaplusOportunidadesCarrito[boleto];
            if (Array.isArray(opps)) {
                for (const opp of opps) {
                    const oppNum = Number(opp);
                    if (isNaN(oppNum) || !Number.isFinite(oppNum) || oppNum <= 0) {
                        numerosInvalidos++;
                    }
                }
            }
        }
    }
    
    if (numerosInvalidos === 0) {
        console.log(`✅ TODOS LOS NÚMEROS VÁLIDOS (${oppUnicos.size})`);
    } else {
        console.error(`❌ ${numerosInvalidos} NÚMEROS INVÁLIDOS`);
        problemas.push(`${numerosInvalidos} números inválidos`);
    }
    
    // 4. Verificar orden (si está ordenado)
    console.log('%n📏 VERIFICACIÓN 4: Orden de Números', 'color: #1A1A1A; font-weight: bold');
    
    const oppArray = Array.from(oppUnicos).sort((a, b) => a - b);
    const oppArrayOriginal = Array.from(oppUnicos);
    
    const estaOrdenado = JSON.stringify(oppArray) === JSON.stringify(oppArrayOriginal);
    
    if (estaOrdenado) {
        console.log('✅ OPORTUNIDADES ORDENADAS CORRECTAMENTE');
    } else {
        console.warn('⚠️  Las oportunidades NO están ordenadas (recomendación: ordenar para consistencia)');
    }
    
    // 5. Verificar en la orden guardada
    console.log('%n📦 VERIFICACIÓN 5: Orden Guardada', 'color: #1A1A1A; font-weight: bold');
    
    try {
        const ordenActual = JSON.parse(localStorage.getItem('rifaplus_orden_actual') || '{}');
        if (ordenActual.boletosOcultos && Array.isArray(ordenActual.boletosOcultos)) {
            console.log(`✅ Orden tiene boletosOcultos: ${ordenActual.boletosOcultos.length} oportunidades`);
            
            // Verificar si hay duplicados en la orden
            const oppOrdenSet = new Set(ordenActual.boletosOcultos.map(o => Number(o)));
            if (oppOrdenSet.size < ordenActual.boletosOcultos.length) {
                const duplicadosEnOrden = ordenActual.boletosOcultos.length - oppOrdenSet.size;
                console.error(`❌ Orden tiene ${duplicadosEnOrden} DUPLICADOS`);
                problemas.push(`${duplicadosEnOrden} duplicados en orden guardada`);
            } else {
                console.log(`✅ Orden SIN DUPLICADOS en boletosOcultos`);
            }
        } else {
            console.warn('⚠️  Orden sin boletosOcultos');
        }
    } catch (e) {
        console.warn('⚠️  No hay orden guardada:', e.message);
    }
    
    // 6. Reporte final
    console.log('%n═══════════════════════════════════════════════════', 'color: #FF3D3D; font-weight: bold; font-size: 14px');
    console.log('%n📝 RESUMEN FINAL', 'color: #1A1A1A; font-weight: bold; font-size: 14px');
    
    if (problemas.length === 0) {
        console.log('%c✅ SISTEMA ÍNTEGRO Y CONSISTENTE', 'color: #10b981; font-weight: bold; font-size: 14px');
        console.log('Recomendación: Proceder con la orden sin problemas');
    } else {
        console.log('%c❌ PROBLEMAS ENCONTRADOS:', 'color: #ef4444; font-weight: bold; font-size: 14px');
        problemas.forEach((p, i) => {
            console.log(`   ${i + 1}. ${p}`);
        });
        console.log('\n⚠️  ACCIONES RECOMENDADAS:');
        console.log('   1. Ejecutar: window.limpiarYRecargarOportunidades()');
        console.log('   2. Recarga la página');
        console.log('   3. Selecciona los boletos nuevamente');
    }
    
    console.log('%n═══════════════════════════════════════════════════', 'color: #FF3D3D; font-weight: bold; font-size: 14px\n');
    
    return {
        estado: problemas.length === 0 ? 'OK' : 'ERROR',
        problemas: problemas,
        totalOportunidades: oppUnicos.size,
        duplicados: oppDuplicados.size,
        numerosInvalidos: numerosInvalidos
    };
};

/**
 * 🧹 FUNCIÓN DE LIMPIEZA
 * Elimina todas las oportunidades corrupted
 */
window.limpiarYRecargarOportunidades = function() {
    console.log('[Limpieza] 🧹 Limpiando oportunidades...');
    
    // Limpiar cache
    window.rifaplusOportunidadesCarrito = {};
    
    // Limpiar localStorage
    localStorage.removeItem('rifaplus_oportunidades');
    
    // Limpiar manager si existe
    if (typeof window.oportunidadesManager?.limpiar === 'function') {
        window.oportunidadesManager.limpiar();
        console.log('[Limpieza] ✅ Manager limpiado');
    }
    
    // Limpiar orden guardada
    const ordenActual = JSON.parse(localStorage.getItem('rifaplus_orden_actual') || '{}');
    ordenActual.boletosOcultos = [];
    localStorage.setItem('rifaplus_orden_actual', JSON.stringify(ordenActual));
    
    console.log('[Limpieza] ✅ LIMPIEZA COMPLETADA');
    console.log('[Limpieza] 📝 Próximo paso: Recargar página y seleccionar boletos nuevamente');
};

console.log('%c✅ Validador de integridad cargado', 'color: #10b981; font-weight: bold');
console.log('%cEjecutar: window.validarIntegridad() para diagnóstico completo', 'color: #10b981');
