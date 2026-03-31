/**
 * ============================================================
 * ARCHIVO: js/carrito-oportunidades.js
 * DESCRIPCIÓN: Sistema unificado de oportunidades para carrito
 * Usa OportunidadesManager (professional, robusto, optimizado)
 * ============================================================
 */

/**
 * 🎯 FUNCIÓN PRINCIPAL: Actualizar oportunidades EN CARRITO Y EN DOM
 * ✅ COMPLETA: Guarda datos + ACTUALIZA UI
 * Se llama cuando el OportunidadesManager termina de cargar
 */
function actualizarOportunidadesEnCarrito(numerosOrdenados) {
    if (!window.oportunidadesManager) {
        console.warn('[CARRITO-OPPS] ⚠️ OportunidadesManager no disponible');
        return;
    }
    
    console.log('[CARRITO-OPPS] 🔄 Actualizando oportunidades en carrito...');
    
    // Inicializar estructura global si no existe
    if (!window.rifaplusOportunidadesCarrito) {
        window.rifaplusOportunidadesCarrito = {};
        console.log('[CARRITO-OPPS] ✅ Inicializado window.rifaplusOportunidadesCarrito');
    }
    
    // Obtener oportunidades del manager en batch
    const oportunidadesPorBoleto = window.oportunidadesManager.obtenerMultiples(numerosOrdenados);
    
    let actualizadosGlobales = 0;
    let actualizadosUI = 0;
    
    for (const numero of numerosOrdenados) {
        if (Number(numero) in oportunidadesPorBoleto) {
            const opps = oportunidadesPorBoleto[numero];
            
            // ✅ PASO 1: GUARDAR EN ESTRUCTURA GLOBAL (para orden-formal.js y otros módulos)
            if (Array.isArray(opps) && opps.length > 0) {
                // Deduplicar y validar
                const oppsUnicos = [...new Set(
                    opps.map(o => Number(o))
                        .filter(o => !isNaN(o) && Number.isFinite(o) && o > 0)
                )].sort((a, b) => a - b);
                
                if (oppsUnicos.length > 0) {
                    window.rifaplusOportunidadesCarrito[String(numero)] = oppsUnicos;
                    actualizadosGlobales++;
                }
            }
            
            // ✅ PASO 2: ACTUALIZAR DOM (mostrar en pantalla)
            if (_actualizarDOMOportunidad(numero)) {
                actualizadosUI++;
            }
        }
    }
    
    console.log(`[CARRITO-OPPS] ✅ Completado: ${actualizadosGlobales} en memoria, ${actualizadosUI} en DOM`);
}

/**
 * 🎨 FUNCIÓN INTERNA: Actualizar UN boleto en el DOM
 * Usa datos de window.rifaplusOportunidadesCarrito
 * Inteligente: Solo intenta si el boleto aún existe en el carrito
 */
function _actualizarDOMOportunidad(numero) {
    const opps = window.rifaplusOportunidadesCarrito?.[String(numero)];
    
    if (!opps || !Array.isArray(opps) || opps.length === 0) {
        console.debug(`[CARRITO-OPPS] ℹ️  Boleto #${numero}: sin oportunidades`);
        return false;
    }
    
    // ✅ VALIDACIÓN CRÍTICA: Verificar que el boleto aún existe en carrito
    const boletoPrincipal = document.querySelector(`.carrito-item[data-numero="${numero}"]`);
    if (!boletoPrincipal) {
        // El boleto fue borrado del carrito - no intentar más
        console.debug(`[CARRITO-OPPS] ℹ️  Boleto #${numero}: disponible pero no en carrito actual (fue removido)`);
        return false;
    }
    
    const container = document.querySelector(`.carrito-item-oportunidades-container[data-numero="${numero}"]`);
    if (!container) {
        // El container debería existir si el item principal existe
        console.warn(`[CARRITO-OPPS] ⚠️  Boleto #${numero}: container de oportunidades no encontrado`);
        return false;
    }
    
    try {
        // Formatear números: "000001, 000023, 000456"
        const oppStr = opps.map(n => String(n).padStart(6, '0')).join(', ');
        
        // Actualizar HTML
        container.innerHTML = `<div class="carrito-item-numero carrito-item-numero--full"><span class="carrito-item-oportunidades-text"><i class="fas fa-check-circle carrito-item-oportunidades-check"></i><strong>Oportunidades:</strong> ${oppStr}</span></div>`;
        container.style.opacity = '1';
        container.setAttribute('data-oportunidades', 'loaded');
        
        console.log(`[CARRITO-OPPS] ✅ Boleto #${numero}: ${opps.length} opps mostradas`);
        return true;
    } catch (error) {
        console.error(`[CARRITO-OPPS] ❌ Error actualizando boleto #${numero}:`, error);
        return false;
    }
}

/**
 * � FUNCIÓN CRÍTICA: Sincronizar todas las oportunidades del carrito actual
 * Se debe llamar SIEMPRE después de cargar oportunidades o cambiar carrito
 * Asegura que window.rifaplusOportunidadesCarrito esté poblado para orden-formal.js
 */
function sincronizarOportunidadesAlCarrito() {
    if (!window.oportunidadesManager) {
        console.warn('[CARRITO-OPPS] ⚠️ OportunidadesManager no disponible para sincronizar');
        return;
    }
    
    if (!window.rifaplusOportunidadesCarrito) {
        window.rifaplusOportunidadesCarrito = {};
    }
    
    // Obtener los boletos seleccionados del carrito
    const boletosSelecionados = typeof obtenerBoletosSelecionados === 'function' 
        ? obtenerBoletosSelecionados() 
        : window.rifaplusSelectedNumbers || [];
    
    if (!Array.isArray(boletosSelecionados) || boletosSelecionados.length === 0) {
        console.log('[CARRITO-OPPS] 📭 No hay boletos para sincronizar');
        return;
    }
    
    try {
        const allOpps = window.oportunidadesManager.obtenerMultiples(boletosSelecionados);
        
        let sincronizados = 0;
        for (const numero of boletosSelecionados) {
            const numStr = String(numero);
            if (Number(numero) in allOpps && Array.isArray(allOpps[Number(numero)])) {
                // Validar y deduplicar
                const oppsRaw = allOpps[Number(numero)];
                const oppsLimpias = [...new Set(
                    oppsRaw
                        .map(o => Number(o))
                        .filter(o => !isNaN(o) && Number.isFinite(o) && o > 0)
                )].sort((a, b) => a - b);
                
                if (oppsLimpias.length > 0) {
                    window.rifaplusOportunidadesCarrito[numStr] = oppsLimpias;
                    sincronizados++;
                }
            }
        }
        
        const totalOppsGlobal = Object.values(window.rifaplusOportunidadesCarrito)
            .reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
        
        console.log(`[CARRITO-OPPS] ✅ Sincronizadas ${sincronizados}/${boletosSelecionados.length} boletos (${totalOppsGlobal} opps totales)`);
        return window.rifaplusOportunidadesCarrito;
    } catch (error) {
        console.error('[CARRITO-OPPS] ❌ Error sincronizando:', error);
        return null;
    }
}

/**
 * 📊 Obtener estadísticas del sistema de oportunidades
 */
function obtenerEstadisticasOportunidades() {
    if (!window.oportunidadesManager) return null;
    return window.oportunidadesManager.getStats();
}

/**
 * 🧹 Limpiar cache de oportunidades (para debugging/testing)
 */
function limpiarCacheOportunidades() {
    if (window.oportunidadesManager) {
        window.oportunidadesManager.limpiar();
        console.log('[CARRITO-OPPS] 🧹 Cache limpiado');
    }
}

// ============================================================
// EXPORTAR FUNCIONES GLOBALES
// ============================================================
window.actualizarOportunidadesEnCarrito = actualizarOportunidadesEnCarrito;
window.sincronizarOportunidadesAlCarrito = sincronizarOportunidadesAlCarrito;
window.obtenerEstadisticasOportunidades = obtenerEstadisticasOportunidades;
window.limpiarCacheOportunidades = limpiarCacheOportunidades;

console.log('✅ carrito-oportunidades.js cargado - Sistema unificado de oportunidades activo');
