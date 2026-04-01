/**
 * ============================================================
 * ARCHIVO: js/flujo-compra.js
 * DESCRIPCIÓN: Orquesta el flujo completo de compra
 * Formulario → Selección de cuenta → Orden Formal
 * ÚLTIMA ACTUALIZACIÓN: 2025
 * ============================================================
 */

/* ============================================================ */
/* FUNCIONES DEFENSIVAS DE ALMACENAMIENTO                      */
/* ============================================================ */

/**
 * 🛡️ FUNCIÓN DEFENSIVA: Guardar en storage de forma segura
 * Intenta usar window.safeTrySetItem si está disponible
 * Si no, usa localStorage directo como fallback
 * NUNCA falla - siempre tiene un plan B
 */
function setItemSafeFlujo(key, value) {
    try {
        if (typeof window.safeTrySetItem === 'function') {
            return window.safeTrySetItem(key, value);
        } else {
            localStorage.setItem(key, value);
            return true;
        }
    } catch (error) {
        console.warn(`⚠️  [FLUJO] Error guardando '${key}':`, error.message);
        if (!window.StorageMemoryFallback) window.StorageMemoryFallback = {};
        window.StorageMemoryFallback[key] = value;
        return false;
    }
}

/**
 * 🛡️ FUNCIÓN DEFENSIVA: Leer desde storage de forma segura
 */
function getItemSafeFlujo(key) {
    try {
        if (typeof window.safeTryGetItem === 'function') {
            return window.safeTryGetItem(key);
        } else {
            return localStorage.getItem(key);
        }
    } catch (error) {
        console.warn(`⚠️  [FLUJO] Error leyendo '${key}':`, error.message);
        if (window.StorageMemoryFallback && window.StorageMemoryFallback[key]) {
            return window.StorageMemoryFallback[key];
        }
        return null;
    }
}

/* ============================================================ */
/* SECCIÓN 1: CONFIGURACIÓN GLOBAL Y VARIABLES                 */
// Todas las funciones de cálculo de precios están delegadas
// al módulo centralizado calculo-precios.js
// obtenerPrecioDinamico() y calcularTotales() se usan desde allí

/* ============================================================ */

var clienteCheckout = null;

async function obtenerOrdenIdOficialFlujo(clienteGuardado = {}) {
    const config = window.rifaplusConfig;
    const apiBase = config?.backend?.apiBase;
    const esOrdenIdOficial = typeof config?.esOrdenIdOficial === 'function'
        ? config.esOrdenIdOficial.bind(config)
        : (valor => /^[A-Z0-9]+-[A-Z]{2}\d{3}$/.test(String(valor || '').trim().toUpperCase()));
    const tienePrefijoActual = typeof config?.ordenIdTienePrefijoActual === 'function'
        ? config.ordenIdTienePrefijoActual.bind(config)
        : (valor => {
            const prefijoActual = String(config?.cliente?.prefijoOrden || '').trim().toUpperCase();
            return !!prefijoActual && String(valor || '').trim().toUpperCase().startsWith(`${prefijoActual}-`);
        });

    let clienteId = String(config?.cliente?.id || '').trim();
    if ((!clienteId || !config?.cliente?.prefijoOrden) && typeof config?.sincronizarConfigDelBackend === 'function') {
        try {
            await config.sincronizarConfigDelBackend({ force: true });
            clienteId = String(config?.cliente?.id || '').trim();
        } catch (error) {
            console.warn('⚠️ [flujo-compra] No se pudo resincronizar config antes de generar orden:', error?.message || error);
        }
    }

    if (!apiBase) {
        return '';
    }

    if (typeof window.generarIdOrden === 'function') {
        try {
            const ordenIdGenerado = String(await window.generarIdOrden()).trim().toUpperCase();
            if (esOrdenIdOficial(ordenIdGenerado) && tienePrefijoActual(ordenIdGenerado)) {
                return ordenIdGenerado;
            }
            console.warn('⚠️ [flujo-compra] window.generarIdOrden devolvió un valor no reutilizable:', ordenIdGenerado);
        } catch (error) {
            console.warn('⚠️ [flujo-compra] window.generarIdOrden falló:', error?.message || error);
        }
    }
    return '';
}

/* ============================================================ */
/* SECCIÓN 2: INICIALIZACIÓN DEL FLUJO DE COMPRA              */
/* ============================================================ */

/**
 * Inicializa el flujo de compra con event listeners
 */
document.addEventListener('DOMContentLoaded', function() {
    inicializarFlujoCompra();
    
    // 🗑️  REMOVED: cargarOportunidadesDisponiblesDelBackend() - obsoleto (sistema antiguo)
    // Nuevo sistema: cargarOportunidadesDelCarrito() carga 3 oportunidades por boleto seleccionado
    
    // Verificar si debe iniciar el flujo de pago (redirigido desde otra página)
    setTimeout(function() {
        if (localStorage.getItem('rifaplusIniciarFlujoPago') === 'true') {
            localStorage.removeItem('rifaplusIniciarFlujoPago');
            iniciarFlujoPago();
        }
    }, 100);
});

/**
 * inicializarFlujoCompra - Ya no necesita hacer nada porque el listener
 * de btnProcederCarrito es configurado por carrito-global.js que se carga antes.
 * @returns {void}
 */
function inicializarFlujoCompra() {
    // El flujo de compra es iniciado cuando el usuario hace clic en
    // "Proceder al pago" desde el carrito o resumen de compra.
    // Este listener es configurado por carrito-global.js
}

/* ============================================================ */
/* SECCIÓN 3: PASO 1 - INICIAR FLUJO Y CONTACTO                */
/* ============================================================ */

/**
 * iniciarFlujoPago - Inicia el flujo abriendo el modal de contacto
 * @returns {void}
 */
function iniciarFlujoPago() {
    // ✅ VALIDACIÓN CRÍTICA: Bloquear si oportunidades aún no terminaron de cargar
    const estadoCarga = window.rifaplusOportunidadesEstadoCarga;
    if (estadoCarga?.iniciado && !estadoCarga?.completado) {
        // Las oportunidades se están cargando pero no terminaron
        const progreso = estadoCarga.cargadas || 0;
        const total = estadoCarga.total || 0;
        const porcentaje = total > 0 ? Math.round((progreso / total) * 100) : 0;
        
        rifaplusUtils.showFeedback(
            `⏳ Aún se están cargando las oportunidades... (${progreso}/${total} - ${porcentaje}%)`,
            'warning'
        );
        console.warn('[OPPS-BLOQUEO] Intento de confirmar orden antes de terminar carga de oportunidades');
        return;
    }
    
    if (estadoCarga?.total > 0 && !estadoCarga?.iniciado) {
        // Hay boletos pero las oportunidades nunca empezaron a cargar
        console.warn('[OPPS-BLOQUEO] Oportunidades nunca iniciaron carga, iniciando ahora...');
        if (typeof cargarOportunidadesDelCarrito === 'function') {
            cargarOportunidadesDelCarrito();
            rifaplusUtils.showFeedback('⏳ Cargando oportunidades antes de proceder...', 'info');
            return;
        }
    }
    
    // Cerrar carrito si está abierto
    const carritoModal = document.getElementById('carritoModal');
    if (carritoModal && carritoModal.classList && carritoModal.classList.contains('active')) {
        carritoModal.classList.remove('active');
    }
    
    // Activar modo flujo para que modal-contacto no redirija
    window.rifaplusFlujoPago = true;
    console.log('[Flujo] ✅ Modo flujo activado (window.rifaplusFlujoPago = true)');
    
    // Definir callback que se ejecuta cuando el usuario confirma el formulario
    window.onContactoConfirmado = function() {
        console.log('[Flujo] 🎯 onContactoConfirmado ejecutado');

        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        
        // El cliente ya está guardado en localStorage por modal-contacto.js
        // Cargar datos
        clienteCheckout = obtenerClienteDelStorage();
        console.log('[Flujo] ✅ Cliente cargado:', clienteCheckout);
        
        // Cerrar modal de contacto
        if (typeof cerrarModalContacto === 'function') {
            console.log('[Flujo] 🚪 Cerrando modal contacto');
            cerrarModalContacto();
        }
        
        // Paso 2: Abrir selector de cuenta de pago
        console.log('[Flujo] ⏳ Esperando 300ms para abrir selector de cuentas');
        setTimeout(() => {
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
            console.log('[Flujo] 🏦 Llamando abrirModalSeleccionCuenta()');
            abrirModalSeleccionCuenta();
        }, 300);
    };
    
    // Abrir modal de contacto
    if (typeof abrirModalContacto === 'function') {
        abrirModalContacto();
    }
}

/* ============================================================ */
/* SECCIÓN 4: PASO 2 - SELECCIÓN DE CUENTA DE PAGO               */
/* ============================================================ */

/**
 * abrirModalSeleccionCuenta - Abre modal para seleccionar cuenta bancaria
 * @returns {void}
 */
async function abrirModalSeleccionCuenta() {
    console.log('[AbrirModal] 🏦 Iniciando abrirModalSeleccionCuenta()');
    
    const modal = document.getElementById('modalSeleccionCuenta');
    if (!modal) {
        console.error('❌ [AbrirModal] modalSeleccionCuenta no encontrado');
        return;
    }
    
    console.log('[AbrirModal] ✅ Modal encontrado:', modal);
    
    // Poblar cuentas
    const transferenciasContainer = document.getElementById('transferenciasLista');
    const efectivoContainer = document.getElementById('efectivoLista');
    
    if (!transferenciasContainer || !efectivoContainer) {
        console.error('❌ [AbrirModal] Contenedores de cuentas no encontrados');
        console.log('[AbrirModal] transferenciasContainer:', transferenciasContainer);
        console.log('[AbrirModal] efectivoContainer:', efectivoContainer);
        return;
    }

    console.log('[AbrirModal] ✅ Contenedores encontrados');
    
    // ✅ CARGAR CUENTAS DESDE EL SERVIDOR (backend tiene los datos actualizados)
    let cuentas = [];
    try {
        const response = await fetch(`${window.rifaplusConfig.backend.apiBase}/api/public/config`,{
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.data?.cuentas && Array.isArray(result.data.cuentas) && result.data.cuentas.length > 0) {
                cuentas = result.data.cuentas;
                console.log('[AbrirModal] ✅ Cuentas cargadas desde servidor:', cuentas.length);
                // Actualizar también en config.js para otros usos
                window.rifaplusConfig.tecnica.bankAccounts = cuentas;
            }
        }
    } catch (err) {
        console.debug('[AbrirModal] No se cargaron cuentas del servidor:', err.message);
    }
    
    // Si no hay cuentas del servidor, usar fallback de config.js
    if (cuentas.length === 0) {
        cuentas = (window.rifaplusConfig && window.rifaplusConfig.bankAccounts) 
            ? window.rifaplusConfig.bankAccounts 
            : [];
    }
    
    console.log('[AbrirModal] 💰 Cuentas disponibles:', cuentas.length);
    
    if (cuentas.length === 0) {
        transferenciasContainer.innerHTML = '<p style="color: var(--danger);">No hay cuentas de pago disponibles</p>';
        return;
    }
    
    // Separar transferencias y efectivo
    const transferencias = cuentas.filter(c => c.paymentType === 'transferencia');
    const efectivo = cuentas.filter(c => c.paymentType === 'efectivo');
    
    // Renderizar transferencias
    let htmlTransferencias = '';
    transferencias.forEach((cuenta, idx) => {
        const id = `cuenta_${idx}`;
        const banco = cuenta.nombreBanco || 'Banco';
        // ✅ FIX: Use unique account ID instead of filtered array index
        const accountId = cuenta.id || cuenta.accountNumber || `${cuenta.nombreBanco}_${idx}`;
        
        htmlTransferencias += `
            <div class="stack-item">
                <input type="radio" id="${id}" name="cuentaPago" value="${accountId}" data-account-id="${accountId}" data-payment-type="transferencia" class="cuenta-radio">
                <label for="${id}" class="stack-label">
                    <div class="stack-content">
                        <span class="stack-bank">${banco}</span>
                        <span class="stack-description">Haz tu transferencia a esta cuenta.</span>
                    </div>
                    <span class="stack-action">Seleccionar</span>
                </label>
            </div>
        `;
    });
    
    // Renderizar efectivo
    let htmlEfectivo = '';
    efectivo.forEach((cuenta, idx) => {
        const id = `cuenta_efe_${idx}`;
        const banco = cuenta.nombreBanco || 'Tienda';
        // ✅ FIX: Use unique account ID instead of filtered array index
        const accountId = cuenta.id || cuenta.accountNumber || `${cuenta.nombreBanco}_${idx}`;
        
        htmlEfectivo += `
            <div class="stack-item">
                <input type="radio" id="${id}" name="cuentaPago" value="${accountId}" data-account-id="${accountId}" data-payment-type="efectivo" class="cuenta-radio">
                <label for="${id}" class="stack-label">
                    <div class="stack-content">
                        <span class="stack-bank">${banco}</span>
                        <span class="stack-description">Usa esta opción para pagar en efectivo.</span>
                    </div>
                    <span class="stack-action">Seleccionar</span>
                </label>
            </div>
        `;
    });
    
    transferenciasContainer.innerHTML = htmlTransferencias || '<p class="payment-empty-state">No hay transferencias disponibles en este momento.</p>';
    efectivoContainer.innerHTML = htmlEfectivo || '<p class="payment-empty-state">No hay opciones de efectivo disponibles en este momento.</p>';
    
    console.log('[AbrirModal] ✅ HTML renderizado');
    
    // Agregar event listeners a los radios
    const radios = document.querySelectorAll('input[type="radio"][name="cuentaPago"]');
    console.log('[AbrirModal] 📻 Radios encontrados:', radios.length);
    
    radios.forEach(radio => {
        radio.addEventListener('change', function() {
            // ✅ FIX: Use account ID for lookup instead of filtered array index
            const accountId = parseInt(this.value);
            const cuentas = (window.rifaplusConfig && window.rifaplusConfig.bankAccounts) 
                ? window.rifaplusConfig.bankAccounts 
                : [];
            
            // Find account by ID (id is unique across all accounts)
            const cuentaSeleccionada = cuentas.find(c => c.id === accountId);
            
            console.log('[AbrirModal] 🔄 Radio seleccionado, accountId:', accountId, 'cuenta:', cuentaSeleccionada);
            
            if (!cuentaSeleccionada) {
                console.error('[AbrirModal] ❌ Cuenta no encontrada para id:', accountId);
                return;
            }
            
            // Cerrar selector
            cerrarModalSeleccionCuenta();
            
            // Paso 3: Generar y mostrar orden formal
            setTimeout(async () => {
                console.log('[AbrirModal] 📋 Abriendo orden formal');
                await mostrarOrdenFormal(cuentaSeleccionada);
            }, 300);
        });
    });
    
    // No hay botones de copiar en el modal
    
    // Mostrar modal
    console.log('[AbrirModal] 📺 Mostrando modal (display: flex)');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    modal.scrollTop = 0;

    const modalBody = modal.querySelector('.modal-body-cuentas');
    if (modalBody) {
        modalBody.scrollTop = 0;
    }

    const modalCard = modal.querySelector('.modal-seleccion-cuentas');
    if (modalCard) {
        modalCard.scrollTop = 0;
    }

    window.requestAnimationFrame(() => {
        if (modalBody) modalBody.scrollTop = 0;
        if (modalCard) modalCard.scrollTop = 0;
    });
    
    // Emitir evento para que otras páginas se enteren
    if (window.rifaplusConfig && typeof window.rifaplusConfig.emitirEvento === 'function') {
        window.rifaplusConfig.emitirEvento('modalCuentasAbierto', { cuentas });
    }
    
    // Event listener para cerrar
    const closeBtn = document.getElementById('closeModalSeleccionCuenta');
    if (closeBtn) {
        closeBtn.onclick = cerrarModalSeleccionCuenta;
    }
    
    // No cerrar al tocar fuera; evita salidas accidentales en móvil
    modal.onclick = function() {};
}

function cerrarModalSeleccionCuenta() {
    const modal = document.getElementById('modalSeleccionCuenta');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

/* ============================================================ */
/* SECCIÓN 6: PASO 3 - MOSTRAR ORDEN FORMAL                    */
/* ============================================================ */

/**
 * mostrarOrdenFormal - Prepara y muestra la orden formal de compra
 * @param {Object} cuenta - Objeto con datos de la cuenta bancaria
 * @returns {Promise<void>}
 */
async function mostrarOrdenFormal(cuenta) {
    if (!clienteCheckout) {
        console.error('No hay datos de cliente');
        return;
    }
    
    // Obtener boletos seleccionados
    const boletos = obtenerBoletosSelecionados();
    if (!boletos || boletos.length === 0) {
        alert('Error: No hay boletos seleccionados');
        return;
    }
    
    const clienteGuardado = JSON.parse(getItemSafeFlujo('rifaplus_cliente') || '{}');
    let ordenIdActual = String(clienteGuardado.ordenId || '').trim().toUpperCase();
    const esOrdenIdOficial = typeof window.rifaplusConfig?.esOrdenIdOficial === 'function'
        ? window.rifaplusConfig.esOrdenIdOficial.bind(window.rifaplusConfig)
        : (valor => /^[A-Z0-9]+-[A-Z]{2}\d{3}$/.test(String(valor || '').trim().toUpperCase()));
    const tienePrefijoActual = typeof window.rifaplusConfig?.ordenIdTienePrefijoActual === 'function'
        ? window.rifaplusConfig.ordenIdTienePrefijoActual.bind(window.rifaplusConfig)
        : (valor => {
            const prefijoActual = String(window.rifaplusConfig?.cliente?.prefijoOrden || '').trim().toUpperCase();
            return !!prefijoActual && String(valor || '').trim().toUpperCase().startsWith(`${prefijoActual}-`);
        });

    if (ordenIdActual && (!esOrdenIdOficial(ordenIdActual) || !tienePrefijoActual(ordenIdActual))) {
        console.warn('⚠️ [flujo-compra] Se descartó un ordenId viejo o con prefijo obsoleto:', ordenIdActual);
        ordenIdActual = '';
    }

    if (!ordenIdActual) {
        ordenIdActual = await obtenerOrdenIdOficialFlujo(clienteGuardado);
    }

    if (ordenIdActual && (!esOrdenIdOficial(ordenIdActual) || !tienePrefijoActual(ordenIdActual))) {
        console.error('❌ [flujo-compra] Se obtuvo un ordenId no válido tras intentar regenerarlo:', ordenIdActual);
        ordenIdActual = '';
    }

    if (!ordenIdActual) {
        console.error('❌ [flujo-compra] No se pudo obtener un numero de orden oficial');
        if (window.rifaplusUtils?.showFeedback) {
            window.rifaplusUtils.showFeedback('❌ No se pudo generar el numero de orden. Intenta de nuevo.', 'error');
        } else {
            alert('No se pudo generar el numero de orden. Intenta de nuevo.');
        }
        return;
    }

    // Guardar datos para orden-formal.js (sin email)
    setItemSafeFlujo('rifaplus_cliente', JSON.stringify({
        nombre: clienteCheckout.nombre || '',
        apellidos: clienteCheckout.apellidos || clienteCheckout.apellido || '',
        whatsapp: clienteCheckout.whatsapp || '',
        estado: clienteCheckout.estado || '',
        ciudad: clienteCheckout.ciudad || '',
        ordenId: ordenIdActual
    }));
    
    setItemSafeFlujo('rifaplus_boletos', JSON.stringify(boletos));
    
    // ℹ️  NOTA: Las oportunidades se asignan automáticamente en el servidor
    // cuando se crea la orden (POST /api/ordenes)
    // No se necesita recuperarlas o guardarlas del lado del cliente
    console.log('ℹ️  [flujo-compra] Oportunidades se asignarán en servidor al crear orden');
    
    // Guardar totales
    const precioUnitario = obtenerPrecioDinamico();
    const totales = calcularTotales(boletos.length, precioUnitario);
    
    setItemSafeFlujo('rifaplus_total', JSON.stringify({
        subtotal: totales.subtotal,
        descuento: totales.descuentoMonto,
        descuentoMonto: totales.descuentoMonto,
        totalFinal: totales.totalFinal,
        total: totales.totalFinal,
        precioUnitario: totales.precioUnitario
    }));
    
    // Crear objeto de orden para orden-formal
    const orden = {
        ordenId: ordenIdActual,
        cliente: {
            nombre: clienteCheckout.nombre || '',
            apellidos: clienteCheckout.apellidos || clienteCheckout.apellido || '',
            whatsapp: clienteCheckout.whatsapp || '',
            estado: clienteCheckout.estado || '',
            ciudad: clienteCheckout.ciudad || ''
        },
        cuenta: cuenta,
        boletos: boletos,
        totales: totales,
        fecha: new Date().toISOString(),
        referencia: ordenIdActual
    };
    
    setItemSafeFlujo('rifaplus_orden_actual', JSON.stringify(orden));
    
    // Usar función de orden-formal.js si está disponible
    if (typeof window.abrirOrdenFormal === 'function') {
        try {
            window.abrirOrdenFormal(cuenta);
        } catch (e) {
            console.error('Error al abrir orden formal:', e);
            mostrarOrdenFormalManual(orden);
        }
    } else {
        console.warn('abrirOrdenFormal no disponible, usando renderizado manual');
        mostrarOrdenFormalManual(orden);
    }
}

/* ============================================================ */
/* SECCIÓN 7: RENDERIZADO MANUAL DE ORDEN FORMAL (FALLBACK)    */
/* ============================================================ */

/**
 * mostrarOrdenFormalManual - Renderiza la orden formal si orden-formal.js no está disponible
 * @param {Object} orden - Objeto con datos de la orden
 * @returns {void}
 */
function mostrarOrdenFormalManual(orden) {
    const modal = document.getElementById('modalOrdenFormal');
    if (!modal) {
        alert('No hay modal de orden disponible');
        return;
    }
    
    const contenedor = document.getElementById('contenidoOrdenFormal');
    if (!contenedor) {
        alert('No hay contenedor para la orden');
        return;
    }
    
    // Renderizar contenido (usar template similar a orden-formal.js)
    const fecha = new Date(orden.fecha).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const concepto = `Boletos: ${orden.boletos.join(', ')}`;
    const monto = orden.totales.totalFinal || orden.totales.subtotal || 0;
    
    const html = `
        <div class="orden-documento" id="documentoPDF" style="font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue'; color:var(--text-dark); padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <img src="images/placeholder-logo.svg" alt="logo" style="height:144px; width:auto; object-fit:contain;" />
                    <div style="font-weight:700; font-size:0.95rem;">${window.rifaplusConfig?.nombreOrganizador || 'RifaPlus'}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.75rem; color:var(--text-light);">Orden</div>
                    <div style="font-weight:800; font-family: 'Courier New', monospace;">${orden.ordenId}</div>
                </div>
            </div>

            <div style="margin-top:10px; display:flex; gap:10px; align-items:center; justify-content:space-between;">
                <div style="font-size:0.9rem;">
                    <div style="font-weight:700;">${orden.cliente.nombre || ''} ${orden.cliente.apellidos || ''}</div>
                    <div style="font-size:0.85rem; color:var(--text-light);">${orden.cliente.whatsapp || '-'}</div>
                </div>
                <div style="font-size:0.85rem; color:var(--text-light);">Emitida: ${fecha}</div>
            </div>

            <div style="margin-top:12px; padding:10px 0; border-top:1px solid var(--border-color); border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div style="font-size:0.85rem; color:var(--text-dark); max-width:70%; white-space:normal; overflow-wrap:break-word; word-break:break-word;">${concepto}</div>
                <div style="font-weight:800; font-size:1rem; color:var(--text-dark);">$${Number(monto).toFixed(2)}</div>
            </div>

            <div style="margin-top:10px;">
                <div style="font-weight:700; font-size:0.9rem; margin-bottom:6px;">Método de pago</div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <div style="font-weight:700;">${orden.cuenta.nombreBanco || '-'}</div>
                    <div style="font-family: 'Courier New', monospace; font-size:0.95rem;">${orden.cuenta.accountNumber || orden.cuenta.numero || '-'}</div>
                    ${orden.cuenta.numero_referencia ? `<div style="font-size:0.88rem; color:var(--text-light);">Referencia: ${orden.cuenta.numero_referencia}</div>` : ''}
                    <div style="font-size:0.88rem; color:var(--text-dark);">Beneficiario: ${orden.cuenta.beneficiary || orden.cuenta.titular || '-'}</div>
                </div>
            </div>
        </div>
    `;
    
    contenedor.innerHTML = html;
    
    // Mostrar modal
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

/* ============================================================ */
/* SECCIÓN 8: FUNCIONES AUXILIARES Y CÁLCULOS                */
/* ============================================================ */

/**
 * obtenerBoletosSelecionados - Ya implementado en carrito-global.js
 * Se usa en: mostrarOrdenFormal() para compilar datos de orden
 */

/**
 * calcularTotales - Calcula subtotal, descuentos y total final con ofertas DINÁMICAS
 * AHORA USA PROMOCIONES DE config.js (robusto, configurable)
 * @param {number} cantidad - Número de boletos
 * @param {number} precioUnitario - Precio unitario del boleto (obtenido de config si no se proporciona)
 * @returns {Object} Objeto con detalles de totales
 */
function calcularTotales(cantidad, precioUnitario = null) {
    // NOTA: Esta función ahora delega al módulo centralizado calculo-precios.js
    // Se mantiene aquí por compatibilidad, pero internamente usa calcularTotalConPromociones
    if (typeof calcularTotalConPromociones === 'function') {
        return calcularTotalConPromociones(cantidad, precioUnitario);
    }
    
    // Fallback si calculo-precios.js no está cargado (no debería pasar)
    console.warn('⚠️ calcularTotales: calculo-precios.js no está cargado');
    precioUnitario = precioUnitario || (window.rifaplusConfig?.rifa?.precioBoleto || 15);
    const subtotal = cantidad * precioUnitario;
    return {
        cantidadBoletos: cantidad,
        precioUnitario: precioUnitario,
        subtotal: subtotal,
        descuentoMonto: 0,
        descuentoPorcentaje: 0,
        totalFinal: subtotal
    };
}

/* ============================================================ */
/* SECCIÓN 9: EXPORTACIÓN GLOBAL DE FUNCIONES                 */
/* ============================================================ */

// Exportar funciones para acceso global desde otros scripts
window.iniciarFlujoPago = iniciarFlujoPago;
window.abrirModalSeleccionCuenta = abrirModalSeleccionCuenta;
window.cerrarModalSeleccionCuenta = cerrarModalSeleccionCuenta;
window.mostrarOrdenFormal = mostrarOrdenFormal;
