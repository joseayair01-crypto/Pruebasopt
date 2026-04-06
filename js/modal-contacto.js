/**
 * ============================================================
 * ARCHIVO: js/modal-contacto.js
 * DESCRIPCIÓN: Gestión del modal de formulario de contacto
 * Validación de datos, almacenamiento y generación de ID de orden
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
function setItemSafeModal(key, value) {
    try {
        if (typeof window.safeTrySetItem === 'function') {
            return window.safeTrySetItem(key, value);
        } else {
            // Fallback: localStorage directo
            localStorage.setItem(key, value);
            return true;
        }
    } catch (error) {
        console.warn(`⚠️  [MODAL] Error guardando '${key}':`, error.message);
        // Última opción: intentar en memoria
        if (!window.StorageMemoryFallback) window.StorageMemoryFallback = {};
        window.StorageMemoryFallback[key] = value;
        return false;
    }
}

/**
 * 🛡️ FUNCIÓN DEFENSIVA: Leer desde storage de forma segura
 * Intenta usar window.safeTryGetItem si está disponible
 * Si no, usa localStorage directo como fallback
 */
function getItemSafeModal(key) {
    try {
        if (typeof window.safeTryGetItem === 'function') {
            return window.safeTryGetItem(key);
        } else {
            // Fallback: localStorage directo
            return localStorage.getItem(key);
        }
    } catch (error) {
        console.warn(`⚠️  [MODAL] Error leyendo '${key}':`, error.message);
        // Última opción: ver si está en memoria
        if (window.StorageMemoryFallback && window.StorageMemoryFallback[key]) {
            return window.StorageMemoryFallback[key];
        }
        return null;
    }
}

/**
 * 🛡️ FUNCIÓN DEFENSIVA: Remover del storage
 */
function removeItemSafeModal(key) {
    try {
        if (typeof window.safeTryRemoveItem === 'function') {
            return window.safeTryRemoveItem(key);
        } else {
            localStorage.removeItem(key);
            return true;
        }
    } catch (error) {
        console.warn(`⚠️  [MODAL] Error removiendo '${key}':`, error.message);
        if (window.StorageMemoryFallback) delete window.StorageMemoryFallback[key];
        return false;
    }
}

/* ============================================================ */
/* SECCIÓN 1: FUNCIONES DE GESTIÓN DEL MODAL                   */
/* ============================================================ */

/**
 * abrirModalContacto - Abre el modal de contacto
 * @returns {void}
 */
function abrirModalContacto() {
    const modal = document.getElementById('modalContacto');
    if (modal) {
        modal.classList.add('show');
        window.rifaplusModalScrollLock?.sync?.();
        limpiarFormularioContacto();
    }
}

/**
 * cerrarModalContacto - Cierra el modal de contacto
 * @returns {void}
 */
function cerrarModalContacto() {
    const modal = document.getElementById('modalContacto');
    if (modal) {
        modal.classList.remove('show');
        window.rifaplusModalScrollLock?.sync?.();
    }
}

/**
 * limpiarFormularioContacto - Limpia campos y errores del formulario
 * @returns {void}
 */
function limpiarFormularioContacto() {
    const form = document.getElementById('formularioContacto');
    if (form) {
        form.reset();
        // Limpiar mensajes de error
        document.querySelectorAll('.form-error').forEach(error => {
            error.textContent = '';
        });
    }
}

/* ============================================================ */
/* SECCIÓN 2: VALIDACIÓN DE FORMULARIO                       */
/* ============================================================ */

/**
 * validarFormularioContacto - Valida todos los campos del formulario
 * @returns {boolean} Verdadero si el formulario es válido
 */
function validarFormularioContacto() {
    const nombre = document.getElementById('clienteNombre').value.trim();
    const apellidos = document.getElementById('clienteApellidos').value.trim();
    const whatsapp = document.getElementById('clienteWhatsapp').value.trim();
    const estadoEl = document.getElementById('clienteEstado');
    const estado = estadoEl ? (estadoEl.value || '').trim() : '';
    const ciudadEl = document.getElementById('clienteCiudad');
    const ciudad = ciudadEl ? ciudadEl.value.trim() : '';
    
    let valido = true;
    
    // Validar nombre
    if (!nombre || nombre.length < 2) {
        document.getElementById('errorNombre').textContent = 'El nombre debe tener al menos 2 caracteres';
        valido = false;
    } else {
        document.getElementById('errorNombre').textContent = '';
    }
    
    // Validar apellidos
    if (!apellidos || apellidos.length < 2) {
        document.getElementById('errorApellidos').textContent = 'Los apellidos deben tener al menos 2 caracteres';
        valido = false;
    } else {
        document.getElementById('errorApellidos').textContent = '';
    }
    
    // Validar WhatsApp: exigir exactamente 10 dígitos (solo números)
    const whatsappDigits = whatsapp.replace(/\D/g, '');
    if (!whatsappDigits || whatsappDigits.length !== 10) {
        document.getElementById('errorWhatsapp').textContent = 'Ingresa exactamente 10 dígitos para WhatsApp';
        valido = false;
    } else {
        document.getElementById('errorWhatsapp').textContent = '';
    }

    // Validar estado (obligatorio)
    if (!estado) {
        document.getElementById('errorEstado').textContent = 'Selecciona tu estado';
        valido = false;
    } else {
        document.getElementById('errorEstado').textContent = '';
    }

    // Validar ciudad/localidad (obligatorio)
    if (!ciudad || ciudad.length < 2) {
        document.getElementById('errorCiudad').textContent = 'Por favor indica tu ciudad o localidad';
        valido = false;
    } else {
        document.getElementById('errorCiudad').textContent = '';
    }
    
    return valido;
}

/* ============================================================ */
/* SECCIÓN 3: GENERACIÓN Y GESTIÓN DE ID DE ORDEN            */
/* ============================================================ */

/**
 * generarIdOrden - Genera un ID único para la orden con secuencia alfabética
 * Patrón dinámico: [PREFIJO]-AA001, [PREFIJO]-AA002... [PREFIJO]-AA999, [PREFIJO]-AB000, etc.
 * Ej: "SORTEOS EL TREBOL" → SET-AA001, SET-AA002, etc.
 * Ej: "Rifas El Trebol" → RET-AA001, RET-AA002, etc.
 * El prefijo se genera dinámicamente de config.cliente.nombre (primeras letras de cada palabra)
 * @returns {Promise<string>} ID de orden formateado (ej: SET-AA001, RET-AA001, etc.)
 */
async function generarIdOrden() {
    const config = window.rifaplusConfig;
    if (!config?.backend?.apiBase) {
        throw new Error('BACKEND_API_BASE_UNAVAILABLE');
    }

    let clienteId = String(config?.cliente?.id || '').trim();

    if ((!clienteId || !config?.cliente?.prefijoOrden) && typeof config?.sincronizarConfigDelBackend === 'function') {
        try {
            await config.sincronizarConfigDelBackend({ force: true });
            clienteId = String(config?.cliente?.id || '').trim();
        } catch (syncError) {
            console.warn('⚠️ [Modal-Contacto] No se pudo sincronizar config antes de generar orden:', syncError?.message || syncError);
        }
    }

    const respuesta = await fetch(`${config.backend.apiBase}/api/public/order-counter/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: clienteId || null })
    });

    if (!respuesta.ok) {
        throw new Error(`ORDER_COUNTER_HTTP_${respuesta.status}`);
    }

    const data = await respuesta.json();
    const ordenIdFinal = String(data?.orden_id || '').trim().toUpperCase();

    if (!data?.success || !config?.esOrdenIdOficial?.(ordenIdFinal) || !config?.ordenIdTienePrefijoActual?.(ordenIdFinal)) {
        throw new Error(`ORDER_COUNTER_INVALID_RESPONSE:${ordenIdFinal || 'EMPTY'}`);
    }

    guardarIdEnLocalStorage(ordenIdFinal);

    const cliente = JSON.parse(localStorage.getItem('rifaplus_cliente') || '{}');
    cliente.ordenId = ordenIdFinal;
    localStorage.setItem('rifaplus_cliente', JSON.stringify(cliente));

    return ordenIdFinal;
}

// Exponer explícitamente el generador para otros flujos (compra/orden formal).
// No depender de que el navegador eleve implícitamente la función al objeto window.
window.generarIdOrden = generarIdOrden;
if (window.rifaplusConfig) {
    window.rifaplusConfig.generarIdOrden = generarIdOrden;
}

/**
 * incrementarSecuencia - Avanza la secuencia alfabética (AA → AB → AC... ZZ)
 * @param {string} secuencia - Secuencia actual (ej: "AA")
 * @returns {string} Siguiente secuencia (ej: "AB")
 */
function incrementarSecuencia(secuencia) {
    if (secuencia.length !== 2) return 'AA';
    
    let [letra1, letra2] = secuencia.split('');
    
    // Incrementar segunda letra
    letra2 = String.fromCharCode(letra2.charCodeAt(0) + 1);
    
    // Si excede 'Z', reiniciar y avanzar primera letra
    if (letra2 > 'Z') {
        letra2 = 'A';
        letra1 = String.fromCharCode(letra1.charCodeAt(0) + 1);
    }
    
    // Si excede 'Z', volvemos a 'AA' (ciclo completo)
    if (letra1 > 'Z') {
        return 'AA';
    }
    
    return letra1 + letra2;
}

/**
 * guardarIdEnLocalStorage - Registra un ID como usado en localStorage
 * @param {string} orderId - ID de orden a registrar
 */
function guardarIdEnLocalStorage(orderId) {
    const usedKey = 'rifaplus_used_order_ids';
    let used = [];
    
    try {
        used = JSON.parse(localStorage.getItem(usedKey) || '[]');
        if (!Array.isArray(used)) used = [];
    } catch (e) {
        used = [];
    }
    
    // Evitar duplicados
    if (!used.includes(orderId)) {
        used.push(orderId);
        // Mantener solo los últimos 10000 IDs para no llenar localStorage
        if (used.length > 10000) {
            used = used.slice(-10000);
        }
        setItemSafeModal(usedKey, JSON.stringify(used));
    }
}

/* ============================================================ */
/* SECCIÓN 4: ALMACENAMIENTO DE DATOS DE CLIENTE               */
/* ============================================================ */

/**
 * guardarClienteEnStorage - Guarda datos del cliente en localStorage
 * @param {string} nombre - Nombre del cliente
 * @param {string} apellidos - Apellidos del cliente
 * @param {string} whatsapp - Número de WhatsApp
 * @param {string} estado - Estado/Departamento
 * @param {string} ciudad - Ciudad/Localidad
 * @returns {Promise<Object>} Objeto con datos guardados
 */
async function guardarClienteEnStorage(nombre, apellidos, whatsapp, estado, ciudad) {
    // Generar ID único oficial (ahora es async)
    const ordenId = await generarIdOrden();
    
    const clienteData = {
        nombre,
        apellidos,
        whatsapp,
        estado: estado || undefined,
        ciudad: ciudad || undefined,
        ordenId: ordenId,
        fecha: new Date().toISOString()
    };
    
    setItemSafeModal('rifaplus_cliente', JSON.stringify(clienteData));
    
    return clienteData;
}

/**
 * obtenerClienteDelStorage - Recupera datos del cliente del almacenamiento
 * @returns {Object|null} Objeto con datos del cliente o null
 */
function obtenerClienteDelStorage() {
    const data = localStorage.getItem('rifaplus_cliente');
    return data ? JSON.parse(data) : null;
}

function limpiarOrdenIdObsoletoDelStorage() {
    try {
        const raw = localStorage.getItem('rifaplus_cliente');
        if (!raw) return;

        const cliente = JSON.parse(raw);
        const ordenId = String(cliente?.ordenId || '').trim().toUpperCase();
        const config = window.rifaplusConfig;

        if (!ordenId || !config?.esOrdenIdOficial || !config?.ordenIdTienePrefijoActual) {
            return;
        }

        if (!config.esOrdenIdOficial(ordenId) || !config.ordenIdTienePrefijoActual(ordenId)) {
            delete cliente.ordenId;
            localStorage.setItem('rifaplus_cliente', JSON.stringify(cliente));
            console.log('🧹 [Modal-Contacto] Orden ID obsoleto eliminado del storage:', ordenId);
        }
    } catch (error) {
        console.warn('⚠️ [Modal-Contacto] No se pudo limpiar ordenId obsoleto:', error?.message || error);
    }
}

/**
 * guardarBoletoSeleccionadosEnStorage - Guarda boletos seleccionados en localStorage
 * @returns {void}
 */
function guardarBoletoSeleccionadosEnStorage() {
    try {
        // Guardar números seleccionados para que aparezcan en la orden
        const boletos = Array.from(selectedNumbersGlobal);
        
        // ✅ VALIDACIÓN CORRECTA: Validar retorno para saber si está persistido
        const saveResult = setItemSafeModal('rifaplus_boletos', JSON.stringify(boletos));
        
        if (saveResult === true) {
            console.log(`✅ [MODAL] Boletos guardados en localStorage (${boletos.length} items)`);
        } else if (saveResult === false) {
            console.warn(`⚠️  [MODAL] Boletos guardados en MEMORIA (no persistente)`);
        } else if (saveResult && saveResult.persisted !== undefined) {
            if (saveResult.persisted) {
                console.log(`✅ [MODAL] Boletos guardados en ${saveResult.location}`);
            } else {
                console.warn(`⚠️  [MODAL] Boletos guardados en MEMORIA (se pierde en reload)`);
            }
        }
    } catch (e) {
        console.error('❌ Error preparando boletos para storage:', e);
    }
}

// ✅ NOTA: Las oportunidades YA fueron calculadas por carrito-global.js
// y están guardadas en localStorage 'rifaplus_oportunidades'
// NO recalcular aquí para evitar duplicados o conflictos
// El siguiente paso es flujo-compra.js que las recupera de localStorage

/* ============================================================ */
/* SECCIÓN 5: INICIALIZACIÓN Y EVENT LISTENERS                */
/* ============================================================ */

/**
 * Configura todos los event listeners del modal de contacto
 */
document.addEventListener('DOMContentLoaded', function() {
    limpiarOrdenIdObsoletoDelStorage();

    const btnCancelarContacto = document.getElementById('btnCancelarContacto');
    const btnContinuarContacto = document.getElementById('btnContinuarContacto');
    const closeContacto = document.getElementById('closeContacto');
    const formularioContacto = document.getElementById('formularioContacto');
    const inputWhatsapp = document.getElementById('clienteWhatsapp');
    const inputNombre = document.getElementById('clienteNombre');
    const inputApellidos = document.getElementById('clienteApellidos');
    const inputCiudad = document.getElementById('clienteCiudad');
    
    // 🔤 CONVERTIR A MAYÚSCULAS AUTOMÁTICAMENTE en campos de texto
    const fieldsToUppercase = [inputNombre, inputApellidos, inputCiudad];
    fieldsToUppercase.forEach(field => {
        if (field) {
            field.addEventListener('input', function() {
                this.value = this.value.toUpperCase();
            });
            field.addEventListener('change', function() {
                this.value = this.value.toUpperCase();
            });
        }
    });
    
    // Validación en tiempo real para WhatsApp: solo números
    if (inputWhatsapp) {
        inputWhatsapp.addEventListener('input', function(e) {
            // Remover cualquier carácter que no sea número
            this.value = this.value.replace(/[^0-9]/g, '');
            // Limitar a 10 dígitos
            if (this.value.length > 10) {
                this.value = this.value.slice(0, 10);
            }
        });
        
        inputWhatsapp.addEventListener('keypress', function(e) {
            // Permitir solo números
            if (!/[0-9]/.test(e.key)) {
                e.preventDefault();
            }
        });
    }
    
    // Cerrar modal
    if (btnCancelarContacto) {
        btnCancelarContacto.addEventListener('click', cerrarModalContacto);
    }
    
    if (closeContacto) {
        closeContacto.addEventListener('click', cerrarModalContacto);
    }
    
    // Cerrar al hacer click fuera del modal (en el overlay)
    const modalOverlay = document.getElementById('modalContacto');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', function(e) {
            if (e.target === modalOverlay) {
                cerrarModalContacto();
            }
        });
    }
    
    // Continuar (validar y proceder a orden)
    if (btnContinuarContacto) {
        btnContinuarContacto.addEventListener('click', async function(e) {
            e.preventDefault();
            
            if (validarFormularioContacto()) {
                const nombre = document.getElementById('clienteNombre').value.trim();
                const apellidos = document.getElementById('clienteApellidos').value.trim();
                const whatsapp = document.getElementById('clienteWhatsapp').value.trim();
                const estado = document.getElementById('clienteEstado') ? document.getElementById('clienteEstado').value : '';
                const ciudad = document.getElementById('clienteCiudad') ? document.getElementById('clienteCiudad').value.trim() : '';

                // Guardar en storage (ahora es async)
                try {
                    await guardarClienteEnStorage(nombre, apellidos, whatsapp, estado, ciudad);
                } catch (error) {
                    console.error('❌ [Modal-Contacto] No se pudo generar un numero de orden oficial:', error);
                    rifaplusUtils.showFeedback('❌ No se pudo obtener un numero de orden oficial. Intenta de nuevo.', 'error');
                    return;
                }
                guardarBoletoSeleccionadosEnStorage();
                
                // Si estamos en flujo de pago en compra.html, llamar al callback
                if (window.rifaplusFlujoPago && typeof window.onContactoConfirmado === 'function') {
                    try {
                        window.onContactoConfirmado();
                    } catch (err) {
                        // Fallback: volver a la página de compra donde está el flujo integrado
                        window.location.href = 'compra.html';
                    }
                } else {
                    // Fallback global: redirigir a `compra.html`
                    window.location.href = 'compra.html';
                }
            } else {
                rifaplusUtils.showFeedback('⚠️ Por favor completa correctamente el formulario', 'warning');
            }
        });
    }
    
    // Permitir Enter para enviar
    if (formularioContacto) {
        formularioContacto.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                btnContinuarContacto.click();
            }
        });
    }
});

// Exportar función para que compra.js pueda usarla
// (o ya está disponible globalmente)
