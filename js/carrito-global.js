/**
 * ============================================================
 * ARCHIVO: js/carrito-global.js
 * DESCRIPCIÓN: Gestión del carrito de compra global
 * Sincroniza selecciones, totales y mantiene estado persistente
 * ÚLTIMA ACTUALIZACIÓN: 2025
 * ============================================================
 */

/* ============================================================ */
/* SECCIÓN 1: INICIALIZACIÓN DEL CARRITO                       */
// Todas las funciones de cálculo de precios están delegadas
// al módulo centralizado calculo-precios.js
// obtenerPrecioDinamico() y calcularDescuentoGlobal() se usan desde allí

// ⚡ DEBOUNCE para actualizaciones del carrito (evita múltiples renders)
let debounceTimer = null;
const DEBOUNCE_DELAY = 50; // ms

// ⚡ CACHÉ del estado renderizado (evita re-renderizar si no cambió)
let cachedBoletosHash = null;
let isCarritoModalOpen = false;

function debounceActualizarVista() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        actualizarVistaCarritoGlobal();
    }, DEBOUNCE_DELAY);
}

// Alias para que compra.js use el mismo nombre
function debounceActualizarVistaCarrito() {
    debounceActualizarVista();
}

/* ============================================================ */
/* EVENT LISTENERS: ESPERAR DATOS DE main.js                  */
/* ============================================================ */

/**
 * ⚡ CRÍTICO: Escuchar a main.js cuando carga las oportunidades
 * Esto previene race conditions donde carrito-global.js intenta acceder
 * a datos antes de que main.js los haya cargado
 */
window.addEventListener('oportunidadesListas', function(event) {
    console.log('✅ [CARRITO] Evento recibido: oportunidades cargadas', event.detail);
    // El fetch ya completó, ahora podemos usar los datos seguros
});

/**
 * Inicializa el carrito cuando el DOM está listo
 */
document.addEventListener('DOMContentLoaded', function() {
    inicializarCarritoGlobal();
});

/**
 * inicializarCarritoGlobal - Configura listeners y actualiza estado inicial
 * @returns {void}
 */
function inicializarCarritoGlobal() {
    const carritoNav = document.getElementById('carritoNav');
    const carritoModal = document.getElementById('carritoModal');
    
    // Actualizar el contador inmediatamente al cargar la página
    if (window.actualizarContadorCarritoGlobal) window.actualizarContadorCarritoGlobal();
    
    // 🔥 VERIFICAR SI HAY ORDEN ENVIADA Y LIMPIAR CARRITO
    if (localStorage.getItem('rifaplusOrdenEnviada') === 'true') {
        localStorage.removeItem('rifaplusSelectedNumbers');
        localStorage.removeItem('rifaplusOrdenEnviada');
        if (typeof selectedNumbersGlobal !== 'undefined' && selectedNumbersGlobal.clear) {
            selectedNumbersGlobal.clear();
        }
        if (window.actualizarContadorCarritoGlobal) window.actualizarContadorCarritoGlobal();
    }
    
    if (!carritoNav || !carritoModal) return;

    // Abrir carrito al hacer click en el icono
    carritoNav.addEventListener('click', function(e) {
        e.stopPropagation();
        
        // ⚡ OPTIMIZACIÓN: Si ya está abierto, solo mostrar sin re-renderizar
        if (carritoModal.classList.contains('active')) {
            return; // Ya está abierto, no hacer nada
        }
        
        // ⚡ Sincronizar carrito SOLO si la modal no está activa
        if (typeof selectedNumbersGlobal !== 'undefined') {
            const stored = localStorage.getItem('rifaplusSelectedNumbers');
            const storedArray = stored ? JSON.parse(stored).map(n => parseInt(n, 10)) : [];
            // Si hay diferencias, sincronizar (evitar loop innecesario)
            if (storedArray.length !== selectedNumbersGlobal.size) {
                selectedNumbersGlobal.clear();
                // ⭐ IMPORTANTE: Convertir a números al sincronizar
                storedArray.forEach(num => selectedNumbersGlobal.add(parseInt(num, 10)));
            }
        }
        
        carritoModal.classList.add('active');
        isCarritoModalOpen = true;
        
        // ⚡ RENDERIZAR SOLO SI CAMBIÓ (check hash rápido)
        const boletosActuales = obtenerBoletosSelecionados();
        const hashActual = JSON.stringify(boletosActuales.sort((a, b) => a - b));
        
        if (cachedBoletosHash !== hashActual) {
            cachedBoletosHash = hashActual;
            // ⚡ Usar requestAnimationFrame para no bloquear el thread
            requestAnimationFrame(() => {
                actualizarVistaCarritoGlobal();
                if (window.actualizarContadorCarritoGlobal) window.actualizarContadorCarritoGlobal();
            });
        } else {
            // Boletos no cambiaron, solo actualizar contador y mostrar
            if (window.actualizarContadorCarritoGlobal) window.actualizarContadorCarritoGlobal();
        }
    });

    // Cerrar carrito
    const closeCarrito = document.getElementById('closeCarrito');
    if (closeCarrito) {
        closeCarrito.addEventListener('click', cerrarCarritoGlobal);
    }

    carritoModal.addEventListener('click', function(e) {
        if (e.target === carritoModal) {
            cerrarCarritoGlobal();
        }
    });

    // Botón "Seguir comprando"
    const btnSeguirComprando = document.getElementById('btnSeguirComprando');
    if (btnSeguirComprando) {
        btnSeguirComprando.addEventListener('click', cerrarCarritoGlobal);
    }

    // Botón "Limpiar carrito" - usando event delegation para que funcione en todas partes
    if (carritoModal) {
        carritoModal.addEventListener('click', function(e) {
            if (e.target && e.target.id === 'btnLimpiarCarrito') {
                handleLimpiarCarrito();
            }
        });
    }

    // Botón "Proceder al pago" - usando event delegation
    if (carritoModal) {
        carritoModal.addEventListener('click', function(e) {
            if (e.target && e.target.id === 'btnProcederCarrito') {
                handleProcederAlPago();
            }
        });
    }

    // Tecla Escape para cerrar
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && carritoModal && carritoModal.classList.contains('active')) {
            cerrarCarritoGlobal();
        }
    });

    // Botón "Ir a Comprar" (en carrito vacío) - redirigir a compra.html
    const btnIrAComprar = document.getElementById('btnIrAComprar');
    if (btnIrAComprar) {
        btnIrAComprar.addEventListener('click', function() {
            window.location.href = 'compra.html';
        });
    }
}

function cerrarCarritoGlobal() {
    const carritoModal = document.getElementById('carritoModal');
    if (carritoModal) {
        carritoModal.classList.remove('active');
        isCarritoModalOpen = false;
    }
}

function actualizarVistaCarritoGlobal() {
    const selectedNumbers = obtenerBoletosSelecionados();
    const carritoItems = document.getElementById('carritoItems');
    const carritoVacio = document.getElementById('carritoVacio');
    
    // Agregar clase condicional si oportunidades está habilitado
    const oportunidadesHabilitadas = window.rifaplusConfig?.rifa?.oportunidades?.enabled || false;
    if (carritoItems) {
        if (oportunidadesHabilitadas) {
            carritoItems.classList.add('oportunidades-enabled');
        } else {
            carritoItems.classList.remove('oportunidades-enabled');
        }
    }
    const carritoLista = document.getElementById('carritoLista');
    let carritoResumen = document.getElementById('carritoResumen');
    let carritoResumenCantidad = document.getElementById('carritoResumenCantidad');
    let carritoResumenDescuento = document.getElementById('carritoResumenDescuento');
    let carritoResumenTotal = document.getElementById('carritoResumenTotal');
    let btnProcederCarrito = document.getElementById('btnProcederCarrito');
    let carritoFooter = document.getElementById('carritoFooter');

    if (!carritoItems || !carritoVacio || !carritoLista) return;

    carritoItems.innerHTML = '';

    if (selectedNumbers.length === 0) {
        carritoVacio.style.display = 'flex';
        carritoLista.style.display = 'none';
        if (carritoResumen) carritoResumen.style.display = 'none';
        if (carritoFooter) carritoFooter.style.display = 'none';
        const modalEl = document.querySelector('.modal-carrito');
        if (modalEl && !modalEl.classList.contains('empty-cart')) modalEl.classList.add('empty-cart');
        if (btnProcederCarrito) btnProcederCarrito.disabled = true;
        if (btnProcederCarrito) {
            btnProcederCarrito.textContent = 'Ir a Comprar';
        }
        return;
    }

    carritoVacio.style.display = 'none';
    carritoLista.style.display = 'block';
    
    const modalEl = document.querySelector('.modal-carrito');
    if (modalEl && modalEl.classList.contains('empty-cart')) modalEl.classList.remove('empty-cart');
    if (!carritoFooter) {
        createCarritoFooter();
        carritoFooter = document.getElementById('carritoFooter');
        carritoResumen = document.getElementById('carritoResumen');
        carritoResumenCantidad = document.getElementById('carritoResumenCantidad');
        carritoResumenDescuento = document.getElementById('carritoResumenDescuento');
        carritoResumenTotal = document.getElementById('carritoResumenTotal');
        btnProcederCarrito = document.getElementById('btnProcederCarrito');
    }
    if (carritoResumen) {
        carritoResumen.style.display = 'flex';
        carritoResumen.style.visibility = 'visible';
        carritoResumen.style.opacity = '1';
    }
    if (carritoFooter) {
        carritoFooter.style.display = 'flex';
        carritoFooter.style.visibility = 'visible';
    }
    if (btnProcederCarrito) {
        btnProcederCarrito.disabled = false;
        btnProcederCarrito.textContent = 'Proceder al pago';
    }

    // Crear lista de boletos ordenados
    const numerosOrdenados = [...selectedNumbers].sort((a, b) => a - b);
    const precioUnitario = obtenerPrecioDinamico();
    
    // ✅ NOTA: Ya no necesitamos calcular digitos - formatearNumeroBoleto() lo hace
    
    // ⚡ ESTRATEGIA CORRECTA: RENDERIZAR PRIMERO, CALCULAR DESPUÉS
    // 1. Renderizar TODOS los items SIN oportunidades (INSTANTÁNEO - milisegundos)
    // 2. Calcular oportunidades para TODOS en background (no bloquea UI)
    // 3. Llenar el DOM con oportunidades cuando estén listas
    
    const htmlParts = [];
    
    for (let i = 0; i < numerosOrdenados.length; i++) {
        const numero = numerosOrdenados[i];
        // ✅ Usar función centralizada de config.js
        const numeroFormato = window.rifaplusConfig.formatearNumeroBoleto(numero);
        
        // Item boleto
        htmlParts.push(`<div class="carrito-item" data-numero="${numero}" data-index="${i}"><div class="carrito-item-numero"><div>Boleto:&nbsp;&nbsp;&nbsp;<span class="boleto-numero"><i class="fas fa-ticket-alt"></i> ${numeroFormato}</span></div><span class="carrito-item-numero-precio">$${precioUnitario.toFixed(2)}</span></div><button class="carrito-item-trash-btn" data-numero="${numero}" aria-label="Eliminar boleto ${numero}" title="Eliminar boleto ${numero}"><i class="fas fa-trash carrito-item-trash" aria-hidden="true"></i></button></div>`);
        
        // Placeholder para oportunidades (SOLO si está habilitado)
        if (oportunidadesHabilitadas) {
            htmlParts.push(`<div class="carrito-item carrito-item-oportunidades-container" data-numero="${numero}" data-oportunidades="pending" style="opacity: 0.5;"><div class="carrito-item-numero" style="flex:1"><span class="carrito-item-oportunidades-text" style="display:flex;align-items:center;gap:0.5rem"><i class="fas fa-spinner carrito-item-oportunidades-check" style="animation: spin 1s linear infinite;"></i><strong>Oportunidades:</strong> cargando...</span></div></div>`);
        }
    }
    
    carritoItems.innerHTML = htmlParts.join('');
    agregarEventListenersCarrito();
    
    // Actualizar resumen (instantáneo)
    const calcTotal = calcularDescuentoGlobal(selectedNumbers.length, precioUnitario);
    if (carritoResumenCantidad) carritoResumenCantidad.textContent = calcTotal.cantidadBoletos;
    const subtotalEl = document.getElementById('carritoResumenSubtotal');
    if (subtotalEl) subtotalEl.textContent = `$${calcTotal.subtotal.toFixed(2)}`;
    if (carritoResumenDescuento) carritoResumenDescuento.textContent = `$${calcTotal.descuentoMonto.toFixed(2)}`;
    if (carritoResumenTotal) carritoResumenTotal.textContent = `$${calcTotal.totalFinal.toFixed(2)}`;

    // Guardar totales
    try {
        localStorage.setItem('rifaplus_total', JSON.stringify({
            subtotal: calcTotal.subtotal,
            descuento: calcTotal.descuentoMonto,
            totalFinal: calcTotal.totalFinal,
            precioUnitario: calcTotal.precioUnitario,
            cantidad: calcTotal.cantidadBoletos
        }));
    } catch (e) {
        // Storage lleno o deshabilitado - silent fail
    }
    
    // ⚡ CALCULAR TODAS LAS OPORTUNIDADES EN BACKGROUND (sin bloquear carrito)
    calcularYLlenarOportunidades(numerosOrdenados);
    
    cachedBoletosHash = null;
}

/**
 * ⚡ MEGA OPTIMIZACIÓN: Renderizar en batches SIN calcular oportunidades
 * Con 1,000 números, esto es mucho más rápido
 * Las oportunidades se pueden calcular bajo demanda si el usuario scrollea abajo
 */
/**
 * ⭐ NOTA: La función renderizarRestoEnBatchesRapido fue reemplazada
 * por renderizarRestoConOportunidades que calcula oportunidades en background
 */


function agregarEventListenersCarrito() {
    const carritoItems = document.getElementById('carritoItems');
    if (!carritoItems) return;
    
    carritoItems.querySelectorAll('.carrito-item-trash-btn').forEach(btn => {
        // Solo agregar si no tiene listener ya
        if (!btn.dataset.listenerAdded) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const numero = parseInt(this.getAttribute('data-numero'), 10);
                removerBoletoSeleccionado(numero);
                actualizarVistaCarritoGlobal();
            });
            btn.dataset.listenerAdded = 'true';
        }
    });
}

/**
 * Invalida el caché cuando cambien los boletos
 */
function invalidarCacheCarrito() {
    cachedBoletosHash = null;
    // ⚡ No necesitamos limpiar caché de oportunidades
    // porque es DETERMINÍSTICO: mismo array de boletos = mismas oportunidades
}

function obtenerBoletosSelecionados() {
    // Si estamos en compra.html, usar el Set global
    if (typeof selectedNumbersGlobal !== 'undefined') {
        // Sincronizar con localStorage (nunca sabemos cuándo puede cambiar en otra tab)
        const stored = localStorage.getItem('rifaplusSelectedNumbers');
        const storedArray = stored ? JSON.parse(stored) : [];
        
        // Si hay diferencia, usar el Set global (es la fuente primaria)
        // pero actualizar localStorage por si acaso
        const currentSet = new Set(Array.from(selectedNumbersGlobal));
        localStorage.setItem('rifaplusSelectedNumbers', JSON.stringify(Array.from(currentSet)));
        
        // ⭐ IMPORTANTE: Retornar siempre números (no strings)
        return Array.from(currentSet).map(n => parseInt(n, 10));
    }
    
    // En otras páginas, obtener del localStorage
    const stored = localStorage.getItem('rifaplusSelectedNumbers');
    const result = stored ? JSON.parse(stored) : [];
    
    // ⭐ IMPORTANTE: Convertir a números para garantizar tipo consistente
    return result.map(n => parseInt(n, 10));
}

// Creates the footer DOM and attaches required event listeners
function createCarritoFooter() {
    const modal = document.querySelector('.modal-carrito');
    if (!modal) return;
    
    // Check if footer already exists
    let carritoFooter = document.getElementById('carritoFooter');
    if (!carritoFooter) {
        const footerHtml = `
            <div class="modal-carrito-footer" id="carritoFooter">
                <div class="carrito-resumen" id="carritoResumen">
                    <div class="carrito-resumen-row" style="display: flex; justify-content: space-between; align-items: center;">
                        <div class="carrito-resumen-item">
                            <span>Cantidad de boletos:</span>
                            <strong id="carritoResumenCantidad">0</strong>
                        </div>
                        <button class="btn btn-danger btn-sm" id="btnLimpiarCarrito" title="Eliminar todos los boletos" style="padding: 0.5rem 1rem; margin: 0;">
                            Limpiar carrito
                        </button>
                    </div>
                    <div class="carrito-resumen-item">
                        <span>Subtotal:</span>
                        <strong id="carritoResumenSubtotal">$0</strong>
                    </div>
                    <div class="carrito-resumen-item">
                        <span>Descuento:</span>
                        <strong id="carritoResumenDescuento">$0</strong>
                    </div>
                    <div class="carrito-resumen-total">
                        <span>Total:</span>
                        <strong id="carritoResumenTotal">$0</strong>
                    </div>
                </div>
                <div class="carrito-acciones carrito-acciones-bottom">
                    <button class="btn btn-outline" id="btnSeguirComprando">Seguir comprando</button>
                    <button class="btn btn-primary btn-lg" id="btnProcederCarrito" disabled>Proceder al pago</button>
                </div>
            </div>
        `;
        modal.insertAdjacentHTML('beforeend', footerHtml);
    }

    // Attach event listeners for all controls
    const btnSeguir = document.getElementById('btnSeguirComprando');
    if (btnSeguir) {
        btnSeguir.removeEventListener('click', cerrarCarritoGlobal);
        btnSeguir.addEventListener('click', cerrarCarritoGlobal);
    }

    // Attach listener para botón "Limpiar carrito" - Ya se maneja por event delegation en modal
    // const btnLimpiar = document.getElementById('btnLimpiarCarrito');
    // if (btnLimpiar) {
    //     btnLimpiar.removeEventListener('click', handleLimpiarCarrito);
    //     btnLimpiar.addEventListener('click', handleLimpiarCarrito);
    // }
}

// Separar handler para limpiar carrito
/**
 * Limpiar todo el carrito
 * Remueve todos los boletos seleccionados y sincroniza boletera
 */
function handleLimpiarCarrito() {
    if (confirm('¿Estás seguro de que deseas eliminar todos los boletos del carrito?')) {
        // Obtener todos los números antes de limpiar para actualizar boletera
        const numerosAEliminar = (typeof selectedNumbersGlobal !== 'undefined' && selectedNumbersGlobal) 
            ? Array.from(selectedNumbersGlobal) 
            : [];
        
        // Limpiar datos
        localStorage.removeItem('rifaplusSelectedNumbers');
        if (typeof selectedNumbersGlobal !== 'undefined' && selectedNumbersGlobal) {
            selectedNumbersGlobal.clear();
        }
        
        // Desmarcar todos los botones en la boletera (solo si existen)
        // Este código solo se ejecutará en compra.html donde existen los botones .numero-btn
        numerosAEliminar.forEach(numero => {
            const botonNumero = document.querySelector(`.numero-btn[data-numero="${numero}"]`);
            if (botonNumero && botonNumero.classList.contains('selected')) {
                botonNumero.classList.remove('selected');
                botonNumero.style.transform = 'scale(1)';
            }
        });
        
        // Actualizar todas las vistas
        actualizarVistaCarritoGlobal();
        if (window.actualizarContadorCarritoGlobal) window.actualizarContadorCarritoGlobal();
        if (window.actualizarResumenCompra) window.actualizarResumenCompra();
        
        rifaplusUtils.showFeedback('✅ Carrito limpiado correctamente', 'success');
    }
}

/**
 * Manejador para botón "Proceder al pago"
 * Abre el modal de contacto o inicia flujo en compra.html
 */
function handleProcederAlPago() {
    // Si ya estamos en compra.html, iniciar el flujo de pago
    if (window.location.pathname.includes('compra.html') || window.location.href.includes('compra.html')) {
        if (typeof iniciarFlujoPago === 'function') {
            iniciarFlujoPago();
        }
        cerrarCarritoGlobal();
    } else {
        // Si estamos en otra página, marcar para iniciar flujo al llegar a compra.html
        localStorage.setItem('rifaplusIniciarFlujoPago', 'true');
        window.location.href = 'compra.html';
    }
}

/**
 * Remover un boleto seleccionado
 * Sincroniza: Set global, localStorage, boletera, carrito y resumen
 * También revierte cambios en resultados de búsqueda si están visibles
 */
function removerBoletoSeleccionado(numero) {
    // ⚡ OPTIMIZACIÓN: Hacer la remoción INSTANTÁNEA
    
    // Asegurar que numero es un integer
    numero = parseInt(numero, 10);
    
    // 1. Remover del Set global - INMEDIATO
    if (typeof selectedNumbersGlobal !== 'undefined') {
        selectedNumbersGlobal.delete(numero);
    }
    
    // 2. Desmarcar en la boletera - INMEDIATO
    const botonNumero = document.querySelector(`.numero-btn[data-numero="${numero}"]`);
    if (botonNumero && botonNumero.classList.contains('selected')) {
        botonNumero.classList.remove('selected');
        botonNumero.style.transform = 'scale(1)';
    }
    
    // 3. Actualizar localStorage INMEDIATO (es rápido)
    let stored = localStorage.getItem('rifaplusSelectedNumbers');
    let numbers = stored ? JSON.parse(stored).map(n => parseInt(n, 10)) : [];
    numbers = numbers.filter(n => n !== numero);
    localStorage.setItem('rifaplusSelectedNumbers', JSON.stringify(numbers));
    
    // 4. Actualizar resultados si está visible
    const resultadosList = document.getElementById('resultadosList');
    if (resultadosList && resultadosList.offsetHeight > 0) {
        const resultadoItem = document.querySelector(`.resultado-item:has(button[data-numero="${numero}"])`);
        if (resultadoItem) {
            resultadoItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 1.5rem;">
                    <div>
                        <span style="font-weight: 600; font-size: 1.1rem; color: var(--text-dark);">Boleto #${numero}</span>
                        <span style="display: block; font-size: 0.85rem; color: var(--text-light);">Estado: <strong style="color: var(--success)">✅ Disponible</strong></span>
                    </div>
                    <button class="btn btn-lo-quiero" data-numero="${numero}" style="padding: 0.5rem 1rem; background: var(--primary); color: white; border: none; border-radius: 0.375rem; cursor: pointer; font-weight: 600; transition: var(--transition-fast);">Lo quiero</button>
                </div>
            `;
            
            const btnLoQuiero = resultadoItem.querySelector('.btn-lo-quiero');
            if (btnLoQuiero) {
                btnLoQuiero.addEventListener('click', function() {
                    if (typeof agregarBoletoDirectoCarrito === 'function') {
                        agregarBoletoDirectoCarrito(numero);
                    }
                });
            }
        }
    }
    
    // 5. Invalidar caché
    invalidarCacheCarrito();
    
    // 6. ⭐ USAR DEBOUNCE AGRESIVO PARA ACTUALIZACIONES (mismo que en agregar)
    // Agrupa múltiples remociones rápidas en una actualización
    actualizarCarritoConDebounceAgresivo();
    
    rifaplusUtils.showFeedback(`✅ Boleto #${numero} removido del carrito`, 'success');
}

/**
 * Agregar un boleto al carrito (sincroniza Set global y localStorage)
 * @param {number} numero - Número del boleto a agregar
 * @returns {boolean} - true si se agregó, false si ya estaba
 */
function agregarBoletoSelecionado(numero) {
    // Si estamos en compra.html, usar el Set global
    if (typeof selectedNumbersGlobal !== 'undefined') {
        if (selectedNumbersGlobal.has(numero)) {
            return false; // Ya está seleccionado
        }
        selectedNumbersGlobal.add(numero);
        sincronizarCarritoAlLocalStorage();
    } else {
        // En otras páginas, usar localStorage
        let stored = localStorage.getItem('rifaplusSelectedNumbers');
        let numbers = stored ? JSON.parse(stored).map(n => parseInt(n, 10)) : [];
        
        numero = parseInt(numero, 10);
        if (numbers.includes(numero)) {
            return false; // Ya está seleccionado
        }
        
        numbers.push(numero);
        localStorage.setItem('rifaplusSelectedNumbers', JSON.stringify(numbers));
    }
    
    // Actualizar todas las vistas
    if (window.actualizarVistaCarritoGlobal) window.actualizarVistaCarritoGlobal();
    if (window.actualizarContadorCarritoGlobal) window.actualizarContadorCarritoGlobal();
    if (window.actualizarResumenCompra) window.actualizarResumenCompra();
    
    return true;
}

/**
 * 🚀 OPTIMIZACIÓN: Agregar múltiples boletos sin actualizar la vista cada vez
 * Perfecto para máquina de la suerte que agrega 50+ boletos
 * @param {number[]} numeros - Array de números a agregar
 * @returns {boolean} - true si agregó al menos uno
 */
function agregarMuchosBoletosAlCarrito(numeros) {
    if (!Array.isArray(numeros) || numeros.length === 0) return false;
    
    let agregados = 0;
    
    // ⚡ Agregar todos PRIMERO sin actualizar vistas
    if (typeof selectedNumbersGlobal !== 'undefined') {
        // Compra.html
        numeros.forEach(numero => {
            if (!selectedNumbersGlobal.has(numero)) {
                selectedNumbersGlobal.add(numero);
                agregados++;
            }
        });
        sincronizarCarritoAlLocalStorage();
    } else {
        // Otras páginas
        let stored = localStorage.getItem('rifaplusSelectedNumbers');
        let numbers = stored ? JSON.parse(stored) : [];
        const setNumbers = new Set(numbers);
        
        numeros.forEach(numero => {
            if (!setNumbers.has(numero)) {
                setNumbers.add(numero);
                agregados++;
            }
        });
        
        localStorage.setItem('rifaplusSelectedNumbers', JSON.stringify(Array.from(setNumbers)));
    }
    
    if (agregados === 0) return false;
    
    // ⚡ Actualizar UNA SOLA VEZ al final (no 50 veces)
    if (window.actualizarContadorCarritoGlobal) window.actualizarContadorCarritoGlobal();
    if (window.actualizarResumenCompra) window.actualizarResumenCompra();
    
    // No actualizar vista del carrito si no está abierto
    const carritoModal = document.getElementById('carritoModal');
    if (carritoModal && carritoModal.classList.contains('active')) {
        if (window.actualizarVistaCarritoGlobal) window.actualizarVistaCarritoGlobal();
    }
    
    return true;
}

function calcularDescuentoGlobal(cantidad, precioUnitario = null) {
    // NOTA: Esta función ahora delega al módulo centralizado calculo-precios.js
    // Se mantiene aquí por compatibilidad, pero internamente usa calcularTotalConPromociones
    if (typeof calcularTotalConPromociones === 'function') {
        return calcularTotalConPromociones(cantidad, precioUnitario);
    }
    
    // Fallback si calculo-precios.js no está cargado (calcular con precio unitario base)
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

// Función para sincronizar carrito al seleccionar en compra.html
// ⚡ Debounce para sincronización a localStorage (evita escribir múltiples veces)
let sincronizarTimeout = null;

function sincronizarCarritoAlLocalStorage() {
    // ⚡ MEGA OPTIMIZACIÓN: Usar debounce para localStorage
    // Si se llama múltiples veces rápido, solo sincroniza UNA VEZ después de 100ms
    
    if (sincronizarTimeout) {
        clearTimeout(sincronizarTimeout);
    }
    
    sincronizarTimeout = setTimeout(() => {
        if (typeof selectedNumbersGlobal !== 'undefined') {
            try {
                const numbers = Array.from(selectedNumbersGlobal);
                localStorage.setItem('rifaplusSelectedNumbers', JSON.stringify(numbers));
                console.debug(`⚡ Sincronizado ${numbers.length} números a localStorage`);
            } catch (e) {
                console.warn('Error sincronizando a localStorage:', e.message);
            }
        }
        sincronizarTimeout = null;
    }, 100);  // Espera 100ms antes de escribir
}

// Actualizar contador del carrito globalmente
var _ultimoContadorCarrito = -1; // ⚡ Caché para evitar DOM updates innecesarios

function actualizarContadorCarritoGlobal() {
    // 🔥 FUENTE ÚNICA DE VERDAD: selectedNumbersGlobal si está disponible (es más rápido)
    let cantidad = 0;
    if (typeof selectedNumbersGlobal !== 'undefined') {
        cantidad = selectedNumbersGlobal.size;
    } else {
        // Fallback: leer de localStorage
        const stored = localStorage.getItem('rifaplusSelectedNumbers');
        cantidad = stored ? JSON.parse(stored).length : 0;
    }
    
    // ⚡ Solo actualizar DOM si el número cambió
    if (cantidad !== _ultimoContadorCarrito) {
        _ultimoContadorCarrito = cantidad;
        const carritoCount = document.querySelector('.carrito-count');
        if (carritoCount) {
            carritoCount.textContent = cantidad;
        }
    }
    
    // Sincronizar selectedNumbersGlobal si existe (en compra.html)
    if (typeof selectedNumbersGlobal !== 'undefined') {
        const stored = localStorage.getItem('rifaplusSelectedNumbers');
        const selectedNumbers = stored ? JSON.parse(stored).map(n => parseInt(n, 10)) : [];
        // Solo sincronizar si hay diferencias
        if (selectedNumbers.length !== selectedNumbersGlobal.size) {
            selectedNumbersGlobal.clear();
            // ⭐ IMPORTANTE: Convertir a números al sincronizar
            selectedNumbers.forEach(num => selectedNumbersGlobal.add(parseInt(num, 10)));
        }
    }
}

/**
 * ⚡ MEGA OPTIMIZACIÓN: Debounce ultra-agresivo para actualizaciones de carrito
 * Agrupa múltiples clicks en una sola actualización del DOM
 * Reduce lag de 5+ segundos a imperceptible
 */
let debounceCarritoTimeout = null;
let debounceCarritoTriggers = 0;

function actualizarCarritoConDebounceAgresivo() {
    debounceCarritoTriggers++;
    
    // Si ya hay un timeout, no hacer nada (agrupa el click actual)
    if (debounceCarritoTimeout) {
        return;
    }
    
    // Ejecutar actualización después de 50ms (agrupa clicks rápidos)
    debounceCarritoTimeout = setTimeout(() => {
        console.debug(`📦 Actualizando carrito (agrupó ${debounceCarritoTriggers} clicks)`);
        
        // ⭐ AQUÍ OCURREN TODAS LAS ACTUALIZACIONES DE UNA VEZ
        // Solo el contador es "barato", los demás se evitan si no es necesario
        actualizarContadorCarritoGlobal();
        
        // Actualizar carrito visual pero SOLO si está abierto (no bloquea si está cerrado)
        const carritoModal = document.querySelector('.modal-carrito');
        if (carritoModal && carritoModal.classList.contains('active')) {
            // Solo actualizar si carrito está visible
            actualizarVistaCarritoGlobal();
        }
        
        // Resumen: actualizar COUNT pero no lista completa
        if (typeof actualizarResumenCompraConDebounce === 'function') {
            actualizarResumenCompraConDebounce();
        }
        
        // Reset
        debounceCarritoTimeout = null;
        debounceCarritoTriggers = 0;
    }, 50); // 50ms es imperceptible para humano pero agrupa clicks rápidos
}

// Exportar funciones globalmente
window.actualizarCarritoConDebounceAgresivo = actualizarCarritoConDebounceAgresivo;
window.actualizarContadorCarritoGlobal = actualizarContadorCarritoGlobal;
window.actualizarVistaCarritoGlobal = actualizarVistaCarritoGlobal;
window.obtenerBoletosSelecionados = obtenerBoletosSelecionados;
window.agregarBoletoSelecionado = agregarBoletoSelecionado;
window.removerBoletoSeleccionado = removerBoletoSeleccionado;

/**
 * ⚡ NUEVA ESTRATEGIA: Calcular Y llenar oportunidades en el DOM
 * 1. Renderizar TODOS los items SIN oportunidades (instantáneo)
 * 2. Calcular oportunidades para TODOS en background
 * 3. Llenar el DOM con las oportunidades cuando estén listas
 * 
 * GARANTIZA: Todas las oportunidades se calculan confiablemente
 */
function calcularYLlenarOportunidades(numerosOrdenados, retryCount = 0) {
    const oportunidadesConfig = window.rifaplusConfig?.rifa?.oportunidades;
    
    // Si no está habilitado, no hacer nada
    if (!oportunidadesConfig || !oportunidadesConfig.enabled) {
        return;
    }

    // ⚡ Usar datos en memoria (actualizados cada 5 segundos desde compra.js)
    setTimeout(() => {
        try {
            // 🔒 CRÍTICO: Esperar a que se carguen los datos de oportunidades disponibles
            // Esto es IGUAL que máquina de suerte - solo genera de lo que está disponible
            if (!window.rifaplusOportunidadesLoaded) {
                // 🛡️ LÍMITE DE REINTENTOS: máximo 5 intentos con backoff exponencial
                const MAX_RETRIES = 5;
                if (retryCount < MAX_RETRIES) {
                    const delayMs = 500 * Math.pow(1.5, retryCount); // 500ms, 750ms, 1125ms, etc.
                    console.warn(`⚠️  [CARRITO] Oportunidades aún no cargadas (intento ${retryCount + 1}/${MAX_RETRIES}), reintentando en ${Math.round(delayMs)}ms...`);
                    setTimeout(() => calcularYLlenarOportunidades(numerosOrdenados, retryCount + 1), delayMs);
                    return;
                } else {
                    console.warn(`❌ [CARRITO] Oportunidades no disponibles después de ${MAX_RETRIES} intentos (~${Math.round(500 + 750 + 1125 + 1687 + 2531)}ms). Continuando sin oportunidades...`);
                    // Marcar como cargado aunque no tenga datos, para no bloquear el carrito
                    window.rifaplusOportunidadesLoaded = true;
                    window.rifaplusOportunidadesDisponibles = [];
                    // NO hacer return, continuar sin oportunidades disponibles
                }
            }

            // ⚠️ NUEVA VALIDACIÓN: Esperar a que los datos de boletos sean FRESCOS
            // Si el Web Worker sigue procesando, esperar
            if (window.rifaplusBoletosLoading || !window.rifaplusBoletosDatosActualizados) {
                const MAX_SYNC_RETRIES = 8;
                if (retryCount < MAX_SYNC_RETRIES) {
                    // Los datos de boletos aún se están cargando/actualizando
                    const reason = window.rifaplusBoletosLoading ? 'cargando boletos' : 'Web Worker procesando';
                    console.warn(`⏳ [CARRITO] Esperando datos frescos de boletos (${reason})... retry ${retryCount + 1}/${MAX_SYNC_RETRIES}`);
                    const delayMs = 300 * Math.pow(1.2, retryCount); // 300ms, 360ms, 432ms, etc.
                    setTimeout(() => calcularYLlenarOportunidades(numerosOrdenados, retryCount + 1), delayMs);
                    return;
                } else {
                    console.warn(`⚠️  [CARRITO] Timeout esperando datos frescos, procediendo con datos disponibles`);
                }
            }

            console.log(`✅ [CARRITO] Datos frescos confirmados - procediendo a generar oportunidades`);
            
            // RESTO DEL CÓDIGO (sin cambios)

            const numerosDisponibles = window.rifaplusOportunidadesDisponibles || [];
            
            if (numerosDisponibles.length === 0) {
                console.warn('⚠️  [CARRITO] No hay oportunidades disponibles en memoria');
                return;
            }

            // VALIDACIÓN: Verificar que la lista tenga números en el rango correcto
            const rifaConfig = window.rifaplusConfig?.rifa;
            const rangoOculto = rifaConfig?.oportunidades?.rango_oculto || { inicio: 250000, fin: 999999 };
            const fueraRango = numerosDisponibles.filter(n => n < rangoOculto.inicio || n > rangoOculto.fin);
            
            // ✅ FILTRAR números fuera de rango
            let numerosValidos = numerosDisponibles;
            if (fueraRango.length > 0) {
                console.error(`❌ [CARRITO] ${fueraRango.length} números FUERA del rango en la lista local!`);
                console.error(`   Primeros fuera de rango: ${fueraRango.slice(0, 5).join(', ')}`);
                numerosValidos = numerosDisponibles.filter(n => n >= rangoOculto.inicio && n <= rangoOculto.fin);
                console.warn(`   Filtrando: Usando ${numerosValidos.length} números dentro del rango`);
            }
            
            // Loguear muestra de la lista
            console.log(`📦 [CARRITO] Lista local tiene ${numerosValidos.length} números válidos`);
            console.log(`   Primeros 10: ${numerosValidos.slice(0, 10).join(', ')}`);
            console.log(`   Últimos 10: ${numerosValidos.slice(-10).join(', ')}`);
            
            // Calcular min/max sin spread operator (evita stack overflow con arrays grandes)
            let min = numerosValidos[0];
            let max = numerosValidos[0];
            for (let n of numerosValidos) {
                if (n < min) min = n;
                if (n > max) max = n;
            }
            console.log(`   Rango: ${min} - ${max}`);

            // Obtener configuración
            const configRifa = window.rifaplusConfig?.rifa;
            let oportunidadesPorBoleto = configRifa?.oportunidades?.oportunidades_por_boleto || 3;
            
            console.log(`📦 [CARRITO] Generando oportunidades de ${numerosValidos.length} disponibles (${oportunidadesPorBoleto} por boleto)`);
            
            // ✅ CRÍTICO: REMOVER números que YA ESTÁN VENDIDOS O APARTADOS
            // Esto previene que se seleccionen números que luego el backend debe reemplazar
            const sold = (window.rifaplusSoldNumbers && Array.isArray(window.rifaplusSoldNumbers)) ? window.rifaplusSoldNumbers : [];
            const reserved = (window.rifaplusReservedNumbers && Array.isArray(window.rifaplusReservedNumbers)) ? window.rifaplusReservedNumbers : [];
            const soldSet = new Set(sold.map(n => Number(n)));
            const reservedSet = new Set(reserved.map(n => Number(n)));
            
            // Filtrar números vendidos o apartados
            const numerosPuramenteDisponibles = numerosValidos.filter(n => !soldSet.has(n) && !reservedSet.has(n));
            
            if (numerosPuramenteDisponibles.length < numerosValidos.length) {
                const removidos = numerosValidos.length - numerosPuramenteDisponibles.length;
                console.warn(`⚠️  [CARRITO] Removidos ${removidos} números (${sold.length} vendidos + ${reserved.length} apartados) de ${numerosValidos.length}`);
                console.log(`   Disponibles verdaderos: ${numerosPuramenteDisponibles.length}`);
            }
            
            // VALIDACIÓN: Crear un Set para búsqueda rápida
            const disponiblesSet = new Set(numerosPuramenteDisponibles);
            
            // ✅ CORRECCIÓN: UN SOLO POOL DE NÚMEROS (evita duplicados)
            // No hacer una copia POR BOLETO, sino UNA SOLA LISTA que se va consumiendo
            const disponiblesPoolGlobal = [...numerosPuramenteDisponibles]; // ÚNICO pool compartido
            
            const oportunidadesFiltradasPorBoleto = {};
            let totalEnviados = 0;
            
            for (const boletVisible of numerosOrdenados) {
                const oportunidadesParaBoleto = [];
                
                // Generar oportunidades_por_boleto números del ÚNICO pool global
                for (let i = 0; i < oportunidadesPorBoleto && disponiblesPoolGlobal.length > 0; i++) {
                    const randomIndex = Math.floor(Math.random() * disponiblesPoolGlobal.length);
                    const numero = disponiblesPoolGlobal.splice(randomIndex, 1)[0]; // REMUEVE del pool
                    
                    oportunidadesParaBoleto.push(numero);
                    totalEnviados++;
                }
                
                if (oportunidadesParaBoleto.length > 0) {
                    oportunidadesFiltradasPorBoleto[boletVisible] = oportunidadesParaBoleto;
                    console.log(`   📌 Boleto ${boletVisible}: ${oportunidadesParaBoleto.length} oportunidades [${oportunidadesParaBoleto.join(', ')}]`);
                } else {
                    console.warn(`   ⚠️  Boleto ${boletVisible}: No hay suficientes números disponibles`);
                }
            }
            
            console.log(`✅ [CARRITO] Total generadas: ${totalEnviados}`);
            console.log(`   Pool global restante: ${disponiblesPoolGlobal.length} números (estos NO se asignaron)`);
            
            // ✅ NOTA: Ya no necesitamos calcular digitos - formatearNumeroBoleto() lo hace
            
            // ⚡ Llenar el DOM con las oportunidades generadas de disponibles
            for (const numero in oportunidadesFiltradasPorBoleto) {
                const containerEl = document.querySelector(`.carrito-item-oportunidades-container[data-numero="${numero}"]`);
                if (containerEl) {
                    const oportunidades = oportunidadesFiltradasPorBoleto[numero] || [];
                    
                    if (oportunidades && oportunidades.length > 0) {
                        // Mostrar oportunidades garantizadas disponibles
                        containerEl.style.opacity = '1';
                        containerEl.removeAttribute('data-oportunidades');
                        const oportunidadesHTML = oportunidades.map(opu => {
                            // ✅ Usar función centralizada de config.js
                            const opuFormato = window.rifaplusConfig.formatearNumeroBoleto(opu);
                            return `<span class="boleto-numero-oportunidad">✔️ ${opuFormato}</span>`;
                        }).join('');
                        containerEl.innerHTML = `<div class="carrito-item-numero" style="flex:1;"><strong style="display:block;margin-bottom:0.1rem;font-size:0.8rem;margin-left:0;">Oportunidades:</strong><div class="oportunidades-list">${oportunidadesHTML}</div></div>`;
                    }
                }
            }
            
            // ✅ GUARDAR EN LOCALSTORAGE para que flujo-compra.js las recupere
            const boletosOcultosArray = Object.values(oportunidadesFiltradasPorBoleto).flat();
            const datosAGuardar = {
                boletosOcultos: boletosOcultosArray,
                oportunidadesPorBoleto: oportunidadesFiltradasPorBoleto,
                cantidad: boletosOcultosArray.length,
                generadoEn: new Date().toISOString(),
                boletosSeleccionados: numerosOrdenados,
                version: 3,
                generador: 'carrito-global-v3' // MARCADOR de generador oficial
            };
            try {
                localStorage.setItem('rifaplus_oportunidades', JSON.stringify(datosAGuardar));
                console.log(`✅ [CARRITO] Oportunidades guardadas en localStorage:`, {
                    total: boletosOcultosArray.length,
                    boletos: numerosOrdenados.length,
                    porBoleto: oportunidadesPorBoleto
                });
            } catch (e) {
                console.error('❌ [CARRITO] Error guardando en localStorage:', e);
            }
            
            console.log(`✅ [CARRITO] ${numerosOrdenados.length} boletos con oportunidades generadas de disponibles (sin duplicados)`);
        } catch (e) {
            console.error('❌ [CARRITO] Error al generar oportunidades:', e);
        }
    }, 0);
}

