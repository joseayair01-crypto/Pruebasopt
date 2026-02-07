/**
 * ============================================================
 * ARCHIVO: js/flujo-compra.js
 * DESCRIPCIÓN: Orquesta el flujo completo de compra
 * Formulario → Selección de cuenta → Orden Formal
 * ÚLTIMA ACTUALIZACIÓN: 2025
 * ============================================================
 */

/* ============================================================ */
/* SECCIÓN 1: CONFIGURACIÓN GLOBAL Y VARIABLES                 */
// Todas las funciones de cálculo de precios están delegadas
// al módulo centralizado calculo-precios.js
// obtenerPrecioDinamico() y calcularTotales() se usan desde allí

/* ============================================================ */

var clienteCheckout = null;

/* ============================================================ */
/* SECCIÓN 2: INICIALIZACIÓN DEL FLUJO DE COMPRA              */
/* ============================================================ */

/**
 * Inicializa el flujo de compra con event listeners
 */
document.addEventListener('DOMContentLoaded', function() {
    inicializarFlujoCompra();
    
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
    // Cerrar carrito si está abierto
    const carritoModal = document.getElementById('carritoModal');
    if (carritoModal && carritoModal.classList && carritoModal.classList.contains('active')) {
        carritoModal.classList.remove('active');
    }
    
    // Activar modo flujo para que modal-contacto no redirija
    window.rifaplusFlujoPago = true;
    
    // Definir callback que se ejecuta cuando el usuario confirma el formulario
    window.onContactoConfirmado = function() {
        // El cliente ya está guardado en localStorage por modal-contacto.js
        // Cargar datos
        clienteCheckout = obtenerClienteDelStorage();
        
        // Cerrar modal de contacto
        if (typeof cerrarModalContacto === 'function') {
            cerrarModalContacto();
        }
        
        // Paso 2: Abrir selector de cuenta de pago
        setTimeout(() => {
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
function abrirModalSeleccionCuenta() {
    const modal = document.getElementById('modalSeleccionCuenta');
    if (!modal) {
        console.error('modalSeleccionCuenta no encontrado');
        return;
    }
    
    // Poblar cuentas
    const transferenciasContainer = document.getElementById('transferenciasLista');
    const efectivoContainer = document.getElementById('efectivoLista');
    
    if (!transferenciasContainer || !efectivoContainer) {
        console.error('Contenedores de cuentas no encontrados');
        return;
    }
    
    const cuentas = (window.rifaplusConfig && window.rifaplusConfig.bankAccounts) 
        ? window.rifaplusConfig.bankAccounts 
        : [];
    
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
        const accountType = cuenta.accountType || 'Tarjeta';
        
        htmlTransferencias += `
            <div class="stack-item">
                <input type="radio" id="${id}" name="cuentaPago" value="${idx}" data-cuenta-idx="${idx}" data-payment-type="transferencia" class="cuenta-radio">
                <label for="${id}" class="stack-label">
                    <div class="stack-radio"></div>
                    <div class="stack-content">
                        <span class="stack-bank">${banco}</span>
                        <span class="stack-type">${accountType}</span>
                    </div>
                </label>
            </div>
        `;
    });
    
    // Renderizar efectivo
    let htmlEfectivo = '';
    efectivo.forEach((cuenta, idx) => {
        const id = `cuenta_efe_${idx}`;
        const banco = cuenta.nombreBanco || 'Tienda';
        
        htmlEfectivo += `
            <div class="stack-item">
                <input type="radio" id="${id}" name="cuentaPago" value="${transferencias.length + idx}" data-cuenta-idx="${transferencias.length + idx}" data-payment-type="efectivo" class="cuenta-radio">
                <label for="${id}" class="stack-label">
                    <div class="stack-radio"></div>
                    <div class="stack-content">
                        <span class="stack-bank">${banco}</span>
                        <span class="stack-type">Efectivo</span>
                    </div>
                </label>
            </div>
        `;
    });
    
    transferenciasContainer.innerHTML = htmlTransferencias || '<p style="color: var(--text-light);">No hay transferencias disponibles</p>';
    efectivoContainer.innerHTML = htmlEfectivo || '<p style="color: var(--text-light);">No hay opciones de efectivo disponibles</p>';
    
    // Agregar event listeners a los radios
    const radios = document.querySelectorAll('input[type="radio"][name="cuentaPago"]');
    radios.forEach(radio => {
        radio.addEventListener('change', function() {
            const cuentaIdx = parseInt(this.value);
            const cuentas = (window.rifaplusConfig && window.rifaplusConfig.bankAccounts) 
                ? window.rifaplusConfig.bankAccounts 
                : [];
            const cuentaSeleccionada = cuentas[cuentaIdx];
            
            // Cerrar selector
            cerrarModalSeleccionCuenta();
            
            // Paso 3: Generar y mostrar orden formal
            setTimeout(async () => {
                await mostrarOrdenFormal(cuentaSeleccionada);
            }, 300);
        });
    });
    
    // No hay botones de copiar en el modal
    
    // Mostrar modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    // Emitir evento para que otras páginas se enteren
    if (window.rifaplusConfig && typeof window.rifaplusConfig.emitirEvento === 'function') {
        window.rifaplusConfig.emitirEvento('modalCuentasAbierto', { cuentas });
    }
    
    // Event listener para cerrar
    const closeBtn = document.getElementById('closeModalSeleccionCuenta');
    if (closeBtn) {
        closeBtn.onclick = cerrarModalSeleccionCuenta;
    }
    
    // Cerrar al hacer click en el overlay
    modal.onclick = function(e) {
        if (e.target === modal) {
            cerrarModalSeleccionCuenta();
        }
    };
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
    
    // Guardar datos para orden-formal.js (sin email)
    localStorage.setItem('rifaplus_cliente', JSON.stringify({
        nombre: clienteCheckout.nombre || '',
        apellidos: clienteCheckout.apellidos || clienteCheckout.apellido || '',
        whatsapp: clienteCheckout.whatsapp || '',
        estado: clienteCheckout.estado || '',
        ciudad: clienteCheckout.ciudad || '',
        ordenId: clienteCheckout.ordenId || `RIFA-${Date.now()}`
    }));
    
    localStorage.setItem('rifaplus_boletos', JSON.stringify(boletos));
    
    // ✅ GENERAR Y GUARDAR OPORTUNIDADES (ROBUSTO CON VALIDACIONES)
    console.log('🎁 [flujo-compra] Iniciando generación de oportunidades...');
    let resultadoOpp = null;
    
    try {
        // Verificar que OportunidadesManager está disponible
        // ✅ ESTRATEGIA CORRECTA: PRIMERO recuperar lo que generó carrito-global.js
        console.log('🔧 [flujo-compra] Intentando recuperar oportunidades de localStorage...');
        try {
            const oportunidadesGuardadas = localStorage.getItem('rifaplus_oportunidades');
            if (oportunidadesGuardadas) {
                const datos = JSON.parse(oportunidadesGuardadas);
                // ✅ VALIDACIÓN: Verificar que el generador sea correcto
                if (datos.generador !== 'carrito-global-v3') {
                    console.warn(`⚠️  [flujo-compra] Advertencia: Generador es '${datos.generador}', esperaba 'carrito-global-v3'`);
                }
                if (datos.boletosOcultos && Array.isArray(datos.boletosOcultos) && datos.boletosOcultos.length > 0) {
                    console.log(`✅ [flujo-compra] Recuperadas ${datos.boletosOcultos.length} oportunidades desde carrito-global.js`);
                    console.log(`   Generador usado: ${datos.generador || 'v3'}`);
                    resultadoOpp = { success: true, boletosOcultos: datos.boletosOcultos };
                } else {
                    console.warn('⚠️  [flujo-compra] Datos en localStorage no tienen boletosOcultos válidos, usando fallback');
                    resultadoOpp = { success: false, boletosOcultos: [], error: 'datos_inválidos_fallback' };
                }
            } else {
                console.warn('⚠️  [flujo-compra] No hay oportunidades guardadas en localStorage, usando fallback');
                resultadoOpp = { success: false, boletosOcultos: [], error: 'no_guardadas_fallback' };
            }
        } catch (parseError) {
            console.error('❌ [flujo-compra] Error recuperando oportunidades:', parseError);
            resultadoOpp = { success: false, boletosOcultos: [], error: 'parse_error_fallback' };
        }
        
        // ✅ Si FALLÓ recuperar del localStorage, NO intentar generar (en lugar de eso, log de error)
        if (!resultadoOpp?.success) {
            console.error('❌ [flujo-compra] NO HAY OPORTUNIDADES DISPONIBLES - carrito-global.js NO generó correctamente');
        }
    } catch (errorCapturado) {
        console.error('❌ [flujo-compra] Error inesperado:', errorCapturado);
        resultadoOpp = { success: false, boletosOcultos: [], error: 'error_general' };
    }
    
    // Procesar resultado
    if (resultadoOpp?.success) {
        console.log(`✅ [flujo-compra] Oportunidades guardadas: ${resultadoOpp.boletosOcultos.length}`);
    } else if (resultadoOpp?.razon === 'deshabilitadas') {
        console.log('ℹ️  [flujo-compra] Oportunidades deshabilitadas');
    } else if (resultadoOpp?.error) {
        console.warn(`⚠️  [flujo-compra] Oportunidades con error, continuando: ${resultadoOpp.error}`);
    }
    
    // Guardar totales
    const precioUnitario = obtenerPrecioDinamico();
    const totales = calcularTotales(boletos.length, precioUnitario);
    
    localStorage.setItem('rifaplus_total', JSON.stringify({
        subtotal: totales.subtotal,
        descuento: totales.descuentoMonto,
        totalFinal: totales.totalFinal
    }));
    
    // Crear objeto de orden para orden-formal
    const orden = {
        ordenId: clienteCheckout.ordenId || `RIFA-${Date.now()}`,
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
        referencia: clienteCheckout.ordenId || `RIFA-${Date.now()}`
    };
    
    localStorage.setItem('rifaplus_orden_actual', JSON.stringify(orden));
    
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
                    <img src="images/logo.png" alt="logo" style="height:144px; width:auto; object-fit:contain;" />
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