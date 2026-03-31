/**
 * ============================================================
 * ARCHIVO: js/trigger-busqueda-auto.js
 * DESCRIPCIÓN: Búsqueda automática desde modal - VERSIÓN PRODUCCIÓN
 * ✓ Reintentos ✓ Timeout ✓ Error handling ✓ Logging
 * ÚLTIMA ACTUALIZACIÓN: 5 marzo 2026
 * ============================================================
 */

(function triggerBusquedaAuto() {
    const urlParams = new URLSearchParams(window.location.search);
    const autoOpen = urlParams.get('autoOpen') === 'true';
    const whatsapp = urlParams.get('whatsapp');

    // Solo proceder si venimos del modal
    if (!autoOpen || !whatsapp) {
        return;
    }

    console.log('🔍 [TriggerBusqueda] Activada para:', whatsapp);

    // Esperar a que DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ejecutar);
    } else {
        setTimeout(ejecutar, 500);
    }

    function ejecutar() {
        const MAX_INTENTOS = 10;
        let intento = 0;

        function buscarConReintentos() {
            intento++;
            console.log(`📍 [TriggerBusqueda] Intento ${intento}/${MAX_INTENTOS}`);

            // Obtener referencias
            const whatsappInput = document.getElementById('whatsappInput');
            const btnBuscar = document.getElementById('btnBuscar');

            // Si faltan elementos, reintentar
            if (!whatsappInput || !btnBuscar) {
                if (intento < MAX_INTENTOS) {
                    setTimeout(buscarConReintentos, 300);
                    return;
                } else {
                    console.error('❌ [TriggerBusqueda] Elementos no encontrados después de 10 intentos');
                    return;
                }
            }

            // ✅ Elementos encontrados
            console.log('✓ [TriggerBusqueda] Elementos listos');

            // Rellenar input
            whatsappInput.value = whatsapp;
            console.log('✓ [TriggerBusqueda] Input rellenado');

            // Disparar búsqueda
            if (typeof window.buscarOrdenes === 'function') {
                console.log('✓ [TriggerBusqueda] Llamando buscarOrdenes()');
                window.buscarOrdenes();
                console.log('✅ [TriggerBusqueda] Búsqueda disparada exitosamente');
            } else {
                console.warn('⚠️ [TriggerBusqueda] buscarOrdenes no está disponible, usando click');
                btnBuscar.click();
            }
        }

        buscarConReintentos();
    }
})();
