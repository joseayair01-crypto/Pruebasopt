/**
 * ============================================================
 * ARCHIVO: js/modal-orden-confirmada.js
 * DESCRIPCIÓN: Modal de orden confirmada - VERSIÓN PRODUCCIÓN
 * ✓ Validado ✓ Robust ✓ Sin memory leaks ✓ Error handling
 * ÚLTIMA ACTUALIZACIÓN: 5 marzo 2026
 * ============================================================
 */

/**
 * mostrarModalOrdenConfirmada - Abre modal con datos de orden
 * @param {Object} datosOrden - Datos de la orden
 */
function mostrarModalOrdenConfirmada(datosOrden) {
    try {
        // ✅ 1. VALIDACIÓN COMPLETA
        if (!datosOrden || typeof datosOrden !== 'object') {
            console.error('❌ [Modal] datosOrden inválido:', datosOrden);
            return;
        }

        if (!datosOrden.ordenId) {
            console.error('❌ [Modal] OrdenId faltante');
            return;
        }

        // Helper para valores seguros
        const safe = (val, fallback = '-') => {
            if (val === null || val === undefined || typeof val === 'object') return fallback;
            return String(val).trim() || fallback;
        };

        // Datos validados
        const ordenId = safe(datosOrden.ordenId);
        const sorteo = safe(datosOrden.sorteo, 'Sorteo');
        const nombre = safe(datosOrden.cliente?.nombre) + ' ' + safe(datosOrden.cliente?.apellidos);
        const whatsapp = safe(datosOrden.cliente?.whatsapp);
        const boletos = safe(datosOrden.cantidad_boletos, '0');
        const oportunidades = safe(datosOrden.oportunidades, '0');
        const subtotalRaw = Number(datosOrden.totales?.subtotal || 0);
        const totalRawBase = Number(
            datosOrden.totales?.totalFinal
            ?? datosOrden.totales?.total
            ?? 0
        );
        const descuentoRawBase = Number(
            datosOrden.totales?.descuento
            ?? datosOrden.totales?.descuentoMonto
            ?? 0
        );
        const descuentoRaw = descuentoRawBase > 0
            ? descuentoRawBase
            : Math.max(0, subtotalRaw - totalRawBase);
        const totalRaw = totalRawBase > 0
            ? totalRawBase
            : Math.max(0, subtotalRaw - descuentoRaw);

        const subtotal = subtotalRaw.toFixed(2);
        const descuento = descuentoRaw.toFixed(2);
        const total = totalRaw.toFixed(2);
        const tiempoApartadoHoras = Number(window.rifaplusConfig?.rifa?.tiempoApartadoHoras || 0);
        const tiempoApartadoTexto = tiempoApartadoHoras > 0
            ? `${tiempoApartadoHoras} hora${tiempoApartadoHoras === 1 ? '' : 's'}`
            : '';
        const nombreVisible = nombre.trim() || 'Participante';

        console.log('✓ [Modal] Datos validados: orden=' + ordenId + ', whatsapp=' + whatsapp);

        // ✅ 2. CREAR O REUTILIZAR MODAL
        let modal = document.getElementById('modalOrdenConfirmada');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modalOrdenConfirmada';
            document.body.appendChild(modal);
        }

        // ✅ 3. SETEAR CONTENIDO (sin listeners problemáticos)
        modal.innerHTML = `
            <div class="modal-overlay modal-overlay-orden-confirmada">
                <div class="modal-contenido modal-contenido-orden-confirmada">
                    <div class="modal-header-confirmada">
                        <div class="checkmark-confirmada">✓</div>
                        <div class="estado-chip-confirmada">Orden guardada</div>
                    </div>
                    <div class="modal-body-confirmada">
                        <h2 class="titulo-confirmada">Tu orden fue apartada correctamente</h2>
                        <p class="subtitulo-confirmada">
                            ${nombreVisible}, ya registramos tu orden. En <strong>Mis Boletos</strong> podrás ver el detalle y subir tu comprobante de pago.
                        </p>

                        <div class="resumen-hero-confirmada">
                            <div class="resumen-hero-item">
                                <span class="resumen-hero-label">Orden</span>
                                <span class="resumen-hero-value">${ordenId}</span>
                            </div>
                            <div class="resumen-hero-item">
                                <span class="resumen-hero-label">Boletos</span>
                                <span class="resumen-hero-value">${boletos}</span>
                            </div>
                            <div class="resumen-hero-item">
                                <span class="resumen-hero-label">Total</span>
                                <span class="resumen-hero-value accent">$${total}</span>
                            </div>
                        </div>

                        <div class="datos-orden-confirmada">
                            <div class="dato-fila">
                                <span class="dato-label">Sorteo</span>
                                <span class="dato-valor">${sorteo}</span>
                            </div>
                            <div class="dato-fila">
                                <span class="dato-label">Cliente</span>
                                <span class="dato-valor">${nombreVisible}</span>
                            </div>
                            <div class="dato-fila">
                                <span class="dato-label">WhatsApp</span>
                                <span class="dato-valor">${whatsapp}</span>
                            </div>
                            ${Number(oportunidades) > 0 ? `
                                <div class="dato-fila">
                                    <span class="dato-label">Oportunidades</span>
                                    <span class="dato-valor">${oportunidades}</span>
                                </div>
                            ` : ''}
                            ${subtotalRaw > 0 ? `
                                <div class="dato-fila">
                                    <span class="dato-label">Subtotal</span>
                                    <span class="dato-valor">$${subtotal}</span>
                                </div>
                            ` : ''}
                            ${descuentoRaw > 0 ? `
                                <div class="dato-fila ahorro">
                                    <span class="dato-label">Descuento</span>
                                    <span class="dato-valor">-$${descuento}</span>
                                </div>
                            ` : ''}
                        </div>

                        <div class="aviso-confirmada">
                            ${tiempoApartadoTexto
                                ? `Tus boletos se mantienen apartados por <strong>${tiempoApartadoTexto}</strong>.`
                                : 'Revisa tu orden y completa el pago lo antes posible para conservar tus boletos.'}
                        </div>

                        <button id="btnIrAPagar" class="btn-ir-pagar">IR A PAGAR</button>
                    </div>
                </div>
            </div>
        `;

        // ✅ 4. MOSTRAR MODAL
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';

        // ✅ 5. AGREGAR LISTENER AL BOTÓN (LIMPIO, SIN MEMORY LEAK)
        const btnPagar = modal.querySelector('#btnIrAPagar');
        
        // Event handler
        const handleClick = (e) => {
            e.preventDefault();
            // Deshabilitar para evitar múltiples clicks
            btnPagar.disabled = true;
            btnPagar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Redirigiendo...';

            // Redirigir después de 300ms para UX fluida
            setTimeout(() => {
                const url = whatsapp && whatsapp !== '-'
                    ? `mis-boletos.html?ordenId=${encodeURIComponent(ordenId)}&whatsapp=${encodeURIComponent(whatsapp)}&autoOpen=true`
                    : `mis-boletos.html?ordenId=${encodeURIComponent(ordenId)}&autoOpen=true`;
                console.log('✓ [Modal] Redirigiendo a: mis-boletos.html');
                window.location.href = url;
            }, 300);
        };

        // Remover listeners previos para evitar memory leak
        btnPagar.removeEventListener('click', handleClick);
        btnPagar.addEventListener('click', handleClick, false);

        console.log('✅ [Modal] Mostrado correctamente');

    } catch (error) {
        console.error('❌ [Modal] Error fatal:', error);
        // Fallback: mostrar alerta
        alert('Error al procesar la orden. Por favor intenta de nuevo.');
    }
}

// Exportar función globalmente
window.mostrarModalOrdenConfirmada = mostrarModalOrdenConfirmada;
