/**
 * ============================================================
 * ARCHIVO: js/carrito-init.js
 * DESCRIPCIÓN: Inicialización tardía del carrito (después de defer)
 * Se ejecuta cuando todos los scripts defer hayan cargado
 * ============================================================
 */

(function initCarritoDelay() {
    // Esperar a que el DOM esté completamente listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCarrito);
    } else {
        // DOM ya está listo
        setTimeout(initCarrito, 100);
    }

    function initCarrito() {
        console.log('[CarritoInit] 🚀 Inicializando carrito después de que todos los scripts carguen...');
        
        // Verificar que todas las dependencias estén disponibles
        const checks = {
            'oportunidadesManager': typeof window.oportunidadesManager !== 'undefined',
            'actualizarOportunidadesEnCarrito': typeof window.actualizarOportunidadesEnCarrito === 'function',
            'sincronizarOportunidadesAlCarrito': typeof window.sincronizarOportunidadesAlCarrito === 'function',
            'removerBoletoSeleccionado': typeof window.removerBoletoSeleccionado === 'function',
            'actualizarVistaCarritoGlobal': typeof window.actualizarVistaCarritoGlobal === 'function',
        };
        
        let allReady = true;
        for (const [name, ready] of Object.entries(checks)) {
            if (ready) {
                console.log(`[CarritoInit] ✅ ${name}`);
            } else {
                console.warn(`[CarritoInit] ⚠️ FALTA: ${name}`);
                allReady = false;
            }
        }
        
        if (allReady) {
            console.log('[CarritoInit] ✅ TODAS LAS DEPENDENCIAS LISTAS');
            
            // ✅ Inicializar la estructura global de oportunidades
            if (!window.rifaplusOportunidadesCarrito) {
                window.rifaplusOportunidadesCarrito = {};
                console.log('[CarritoInit] ✅ Inicializado window.rifaplusOportunidadesCarrito');
            }
        } else {
            console.warn('[CarritoInit] ⚠️ Algunas dependencias aún no están disponibles, reintentando...');
            setTimeout(initCarrito, 500);
            return;
        }
        
        // Exportar funciones adicionales para compatibilidad
        if (typeof window.removerBoletoSeleccionado === 'function' && !window.removerBoleto) {
            window.removerBoleto = window.removerBoletoSeleccionado;
        }
        
        console.log('[CarritoInit] ✅ Carrito completamente inicializado, estructura de oportunidades lista');
    }
})();
