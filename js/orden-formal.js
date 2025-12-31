/**
 * ============================================================
 * ARCHIVO: js/orden-formal.js
 * DESCRIPCIÓN: Gestión de órdenes formales con generación de PDF
 * y envío de información por WhatsApp al organizador
 * ÚLTIMA ACTUALIZACIÓN: 2025
 * ============================================================
 */

/* ============================================================ */
/* SECCIÓN 1: CONFIGURACIÓN GLOBAL Y VARIABLES DE ESTADO       */
/* ============================================================ */

var ordenActual = null;

/**
 * compactRanges - Compacta un array de números en rangos
 * @param {Array} arr - Array de números
 * @returns {string} String con rangos compactados (ej: "1-5, 7, 9-11")
 */
function compactRanges(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return '-';
    const nums = arr.slice().map(n => Number(n)).filter(n => !isNaN(n)).sort((a,b) => a - b);
    const ranges = [];
    let start = nums[0], end = nums[0];
    for (let i = 1; i < nums.length; i++) {
        const n = nums[i];
        if (n === end || n === end + 1) {
            end = n;
        } else {
            ranges.push(start === end ? String(start) : `${start}-${end}`);
            start = n;
            end = n;
        }
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
    return ranges.join(',');
}

/* ============================================================ */
/* SECCIÓN 2: APERTURA Y CIERRE DE MODAL DE ORDEN              */
/* ============================================================ */

/**
 * abrirOrdenFormal - Abre el modal de orden formal con datos compilados
 * @param {Object} cuenta - Objeto con datos de cuenta bancaria
 * @returns {void}
 */
function abrirOrdenFormal(cuenta) {
    // Compilar datos de la orden
    const cliente = JSON.parse(localStorage.getItem('rifaplus_cliente') || '{}');
    let boletos = JSON.parse(localStorage.getItem('rifaplus_boletos') || '[]');
    const totales = JSON.parse(localStorage.getItem('rifaplus_total') || '{}');

    // Si rifaplus_boletos está vacío, intentar recuperar de rifaplusSelectedNumbers
    if (!boletos || boletos.length === 0) {
        const selectedNumbers = JSON.parse(localStorage.getItem('rifaplusSelectedNumbers') || '[]');
        if (selectedNumbers && selectedNumbers.length > 0) {
            console.warn('⚠️  rifaplus_boletos está vacío, usando rifaplusSelectedNumbers como fallback');
            boletos = selectedNumbers;
            localStorage.setItem('rifaplus_boletos', JSON.stringify(boletos));
        }
    }

    // CRÍTICO: Usar la función helper de config.js para GARANTIZAR el prefijo dinámico
    // Esta función reconstruye SIEMPRE el ID con el prefijo actual, sin importar el estado anterior
    let ordenId = cliente.ordenId || `ORD-AA001`;
    ordenId = window.rifaplusConfig.reconstruirIdOrdenConPrefijoActual(ordenId);
    
    // Guardar el ID reconstruido en localStorage para futuros usos
    cliente.ordenId = ordenId;
    localStorage.setItem('rifaplus_cliente', JSON.stringify(cliente));

    ordenActual = {
        ordenId: ordenId,
        cliente: {
            nombre: cliente.nombre,
            apellidos: cliente.apellidos,
            whatsapp: cliente.whatsapp,
            estado: cliente.estado || '',
            ciudad: cliente.ciudad || ''
        },
        cuenta: cuenta,
        boletos: boletos,
        totales: totales,
        // Precio dinámico: desde totales (si se calculó) → desde config.js → default 15
        precioUnitario: totales?.precioUnitario || (typeof obtenerPrecioDinamico === 'function' ? obtenerPrecioDinamico() : 15),
        fecha: new Date().toISOString(),
        referencia: ordenId
    };

    // Guardar en storage
    localStorage.setItem('rifaplus_orden_actual', JSON.stringify(ordenActual));

    // Renderizar modal
    renderizarOrdenFormal(ordenActual);

    // Mostrar modal
    const modal = document.getElementById('modalOrdenFormal');
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

/**
 * cerrarOrdenFormal - Cierra el modal de orden formal
 * @returns {void}
 */
function cerrarOrdenFormal() {
    const modal = document.getElementById('modalOrdenFormal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
}

/* ============================================================ */
/* SECCIÓN 3: RENDERIZADO DE ORDEN FORMAL EN HTML              */
/* ============================================================ */

/**
 * renderizarOrdenFormal - Renderiza el contenido HTML de la orden formal
 * @param {Object} orden - Objeto con datos de la orden actual
 * @returns {void}
 */
function renderizarOrdenFormal(orden) {
    const contenedor = document.getElementById('contenidoOrdenFormal');
    if (!contenedor) return;

    // CRÍTICO: RECONSTRUIR EL ID CON EL PREFIJO DINÁMICO ACTUAL
    // Esto garantiza que el modal SIEMPRE muestre el prefijo correcto
    console.log('🔍 renderizarOrdenFormal - START');
    console.log('  - Orden recibida:', orden.ordenId);
    console.log('  - Cliente actual:', window.rifaplusConfig?.cliente?.nombre);
    console.log('  - Prefijo actual:', window.rifaplusConfig?.cliente?.prefijoOrden);
    
    const ordenIdReconstruido = window.rifaplusConfig?.reconstruirIdOrdenConPrefijoActual?.(orden.ordenId) || orden.ordenId;
    console.log('  - Orden RECONSTRUIDA:', ordenIdReconstruido);
    
    orden.ordenId = ordenIdReconstruido; // Actualizar en el objeto orden también

    const fecha = new Date(orden.fecha);
    const fechaFormato = fecha.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const horaFormato = fecha.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    const logoUrl = 'images/logo.png';
    const nombreOrganizador = window.rifaplusConfig?.nombreOrganizador || 'Organizador';
    
    // Obtener todos los boletos (sin compactar - mostrar todos los números)
    const boletosArray = (orden.boletos || []).map(b => Number(b)).filter(n => !isNaN(n)).sort((a, b) => a - b);
    const boletosStr = boletosArray.join(', ');
    
    // Totales
    const subtotal = orden.totales?.subtotal || 0;
    const descuento = orden.totales?.descuento || 0;
    const total = orden.totales?.totalFinal || orden.totales?.subtotal || 0;

    const html = `
        <div class="orden-documento" id="documentoPDF">
            
            <!-- ENCABEZADO: Logo Grande + Nombre Organizador (Izquierda) + ID Orden (Derecha) -->
            <div class="orden-header">
                <div class="orden-header-left">
                    <img src="${logoUrl}" alt="logo" />
                    <div class="orden-organizador">${nombreOrganizador}</div>
                </div>
                <div class="orden-header-right">
                    <div class="orden-label">Orden de Pago</div>
                    <div class="orden-id">${orden.ordenId}</div>
                    <div class="orden-fecha">📅 ${fechaFormato}</div>
                    <div class="orden-hora">⏰ ${horaFormato}</div>
                </div>
            </div>

            <!-- DATOS DEL CLIENTE -->
            <div class="orden-section">
                <div class="orden-section-title">Datos del Cliente</div>
                <div class="orden-cliente-grid">
                    <div>
                        <div class="orden-field-label">Nombre</div>
                        <div class="orden-field-value">${orden.cliente.nombre || '-'}</div>
                    </div>
                    <div>
                        <div class="orden-field-label">Apellidos</div>
                        <div class="orden-field-value">${orden.cliente.apellidos || '-'}</div>
                    </div>
                    <div>
                        <div class="orden-field-label">WhatsApp</div>
                        <div class="orden-field-value">${orden.cliente.whatsapp || '-'}</div>
                    </div>
                </div>
            </div>

            <!-- RESUMEN DE COMPRA -->
            <div class="orden-section">
                <div class="orden-section-title">Resumen de Compra</div>
                <div class="orden-section-content">
                    <div class="orden-boletos">
                        <div class="orden-field-label">Boletos Adquiridos (${boletosArray.length})</div>
                        <div class="orden-boletos-list">${boletosStr}</div>
                    </div>
                    <div class="orden-totales">
                        <div class="orden-subtotal">
                            <span class="orden-subtotal-label">Subtotal:</span>
                            <span>$${Number(subtotal).toFixed(2)}</span>
                        </div>
                        ${descuento > 0 ? `
                        <div class="orden-descuento">
                            <span class="orden-descuento-label">Descuento:</span>
                            <span class="orden-descuento-valor">-$${Number(descuento).toFixed(2)}</span>
                        </div>
                        ` : ''}
                        <div class="orden-total-bar">
                            <span>TOTAL A PAGAR:</span>
                            <span class="orden-total-valor">$${Number(total).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MÉTODO DE PAGO -->
            <div class="orden-section">
                <div class="orden-section-title">Información de Pago</div>
                <div class="orden-section-content">
                    <div class="orden-pago-item">
                        <div class="orden-pago-label">Banco</div>
                        <div class="orden-pago-valor">${orden.cuenta?.nombreBanco || '-'}</div>
                    </div>
                    <div class="orden-pago-item">
                        <div class="orden-pago-label">Número de Cuenta</div>
                        <div class="orden-pago-valor-monospace">${orden.cuenta?.accountNumber || '-'}</div>
                    </div>
                    <div class="orden-pago-item">
                        <div class="orden-pago-label">Referencia de Pago</div>
                        <div class="orden-pago-valor-monospace orden-referencia-id">${orden.ordenId || '-'}</div>
                    </div>
                    <div class="orden-pago-item">
                        <div class="orden-pago-label">Beneficiario</div>
                        <div class="orden-pago-valor">${orden.cuenta?.beneficiary || '-'}</div>
                    </div>
                </div>
            </div>

            <!-- MENSAJE FINAL -->
            <div class="orden-mensaje-final">
                <div class="orden-mensaje-titulo">📋 ¿Qué hacer ahora?</div>
                <div class="orden-mensaje-texto">
                    <p style="margin: 0.5rem 0; line-height: 1.5;"><strong>Paso 1:</strong> Realiza una transferencia bancaria por el monto indicado a la cuenta de arriba</p>
                    <p style="margin: 0.5rem 0; line-height: 1.5;"><strong>Paso 2:</strong> Guarda el comprobante de pago (captura de pantalla o PDF)</p>
                    <p style="margin: 0.5rem 0; line-height: 1.5;"><strong>Paso 3:</strong> Sube tu comprobante usando el botón <strong>"📤 Subir Comprobante"</strong> en la esquina inferior derecha O desde <strong>"Mis Boletos"</strong> en el menú</p>
                    <div style="margin: 1rem 0 0 0; padding: 1rem; border-top: 2px solid #0f172a; background: #f8f9fa; border-radius: 8px; text-align: center;">
                        <p style="margin: 0; color: #0f172a; font-weight: 700; font-size: 1rem; line-height: 1.4;">¡Gracias por tu compra! Una vez completados estos pasos, <strong style="color: #06b6d4;">¡ya estarás participando en nuestro sorteo!</strong> 🎊</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    contenedor.innerHTML = html;
}

/* ============================================================ */
/* SECCIÓN 4: CONSTRUCCIÓN DE MENSAJES PARA WHATSAPP           */
/* ============================================================ */

/**
 * makeOrderMessage - Construye el mensaje de orden para el cliente
 * @param {Object} ord - Objeto con datos de la orden
 * @returns {string} Mensaje formateado para WhatsApp
 */
function makeOrderMessage(ord) {
    const cliente = ord.cliente || {};
    const ordenId = ord.ordenId || '';
    const banco = ord.cuenta ? (ord.cuenta.nombreBanco || '') : '';
    const cuenta = ord.cuenta ? ord.cuenta.accountNumber : '';
    const beneficiario = ord.cuenta ? ord.cuenta.beneficiary : '';
    const referencia = ord.referencia || '';
    const subtotal = ord.totales ? (ord.totales.subtotal || 0) : 0;
    const descuento = ord.totales ? (ord.totales.descuento || 0) : 0;
    const monto = ord.totales ? (ord.totales.totalFinal || ord.totales.subtotal || 0) : 0;
    const boletos = ord.boletos || [];
    
    // Use global compactRanges function
    const compactBoletosStr = compactRanges(boletos);
    const fecha = new Date(ord.fecha);
    const fechaFormato = fecha.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
    const misBoletosUrl = cliente.whatsapp ? `${origin}/mis-boletos.html?whatsapp=${encodeURIComponent(cliente.whatsapp)}` : `${origin}/mis-boletos.html`;

    return `ORDEN DE PAGO
ID de orden: ${ordenId}
Emitida: ${fechaFormato}

DATOS DEL CLIENTE
Nombre: ${cliente.nombre || ''} ${cliente.apellidos || ''}
WhatsApp: ${cliente.whatsapp || '-'}
Estado: ${cliente.estado || '-'}
Ciudad: ${cliente.ciudad || '-'}

DETALLES DE COMPRA
Boletos: ${compactBoletosStr}
Subtotal: $${Number(subtotal).toFixed(2)}
${descuento > 0 ? `Descuento: -$${Number(descuento).toFixed(2)}\n` : ''}Total a pagar: $${Number(monto).toFixed(2)}

MÉTODO DE PAGO
Banco: ${banco}
Número de cuenta: ${cuenta}
Referencia: ${referencia}
Beneficiario: ${beneficiario}

Ver tu orden y el estado de tus boletos: ${misBoletosUrl}

------------------------------
Por favor, envía el comprobante de pago para confirmar la compra de tus boletos y asegurar tu participación en la rifa.
¡Mucha suerte! Tu participación es muy importante y pronto podrías ser el ganador. 🎉`;
}

/**
 * buildWaMeUrl - Construye URL de WhatsApp Web con teléfono y mensaje
 * @param {string} phone - Número de teléfono
 * @param {string} text - Texto del mensaje
 * @returns {string} URL para wa.me
 */
function buildWaMeUrl(phone, text) {
    if (!phone) phone = '';
    let cleaned = phone.replace(/[^0-9+]/g, '');
    cleaned = cleaned.replace(/^\+/, ''); // wa.me needs no +
    const encoded = encodeURIComponent(text);
    return `https://wa.me/ ${cleaned}?text=${encoded}`;
}

/* ============================================================ */
/* SECCIÓN 5: GENERACIÓN Y DESCARGA DE PDF                     */
/* ============================================================ */

/**
 * imprimirOrden - Genera PDF de la orden usando html2canvas + jsPDF CON OPTIMIZACIÓN
 * OPTIMIZACIONES APLICADAS:
 * 1. Escala reducida de 2 a 1.5 para menor memoria y tamaño
 * 2. Formato JPEG con 80% de calidad en lugar de PNG
 * 3. Compresión del PDF habilitada en jsPDF
 * 4. Aplicación automática de clase 'pdf-optimizado' para estilos compactos
 * 5. Sin imágenes de fondo ni estilos innecesarios durante captura
 * @returns {void}
 */
function imprimirOrden() {
    // Generate PDF client-side using html2canvas + jsPDF and trigger download
    const docEl = document.getElementById('documentoPDF');
    if (!docEl) {
        rifaplusUtils.showFeedback('❌ No hay documento para descargar', 'error');
        return;
    }

    try {
        if (typeof window.html2canvas !== 'function') {
            rifaplusUtils.showFeedback('❌ html2canvas no está disponible', 'error');
            console.error('html2canvas is not available. Ensure the script is loaded correctly.');
            return;
        }
        if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
            rifaplusUtils.showFeedback('❌ jsPDF no está disponible', 'error');
            return;
        }
        
        rifaplusUtils.showFeedback('⏳ Generando PDF optimizado...', 'info');
        
        // ========== PASO 1: PREPARAR ELEMENTO PARA CAPTURA ==========
        // Encontrar contenedores padres que puedan estar limitando la altura
        const containerEl = docEl.closest('.orden-formal-container') || docEl.closest('.modal-content') || docEl;
        
        // Guardar estilos originales
        const originalDisplay = containerEl.style.display;
        const originalMaxHeight = containerEl.style.maxHeight;
        const originalOverflow = containerEl.style.overflow;
        const originalHeight = containerEl.style.height;
        
        // Aplicar estilos temporales para captura completa
        containerEl.style.display = 'block';
        containerEl.style.maxHeight = 'none';      // Remover límite de altura
        containerEl.style.overflow = 'visible';    // Mostrar todo
        containerEl.style.height = 'auto';         // Altura automática
        
        // Aplicar clase CSS de optimización para PDF A4 de una página
        const contentEl = containerEl.querySelector('.orden-formal-content') || containerEl;
        const hadPdfOptimizado = contentEl.classList.contains('pdf-optimizado');
        contentEl.classList.add('pdf-optimizado');
        
        // Desabilitar imágenes de fondo temporalmente para PDF más ligero
        const allElements = docEl.querySelectorAll('[style*="background-image"]');
        const bgImages = [];
        allElements.forEach(el => {
            bgImages.push(el.style.backgroundImage);
            el.style.backgroundImage = 'none';
        });
        
        // Forzar reflow para que se recalcule el diseño
        void containerEl.offsetHeight;
        
        const scale = 1.5;  // Reducido de 2 a 1.5 para menor tamaño
        // Capturar con html2canvas
        window.html2canvas(docEl, { 
            scale: scale,
            windowHeight: docEl.scrollHeight,  // Altura TOTAL del contenido
            windowWidth: docEl.scrollWidth,    // Ancho TOTAL del contenido
            useCORS: true,                      // Permite imágenes externas
            logging: false,                     // Sin logs innecesarios
            allowTaint: true,                   // Captura cross-origin
            backgroundColor: '#ffffff',         // Fondo blanco
            imageTimeout: 0                     // Sin timeout para imágenes
        }).then(canvas => {
            // ========== PASO 2: RESTAURAR ESTILOS Y FONDOS ==========
            containerEl.style.display = originalDisplay;
            containerEl.style.maxHeight = originalMaxHeight;
            containerEl.style.overflow = originalOverflow;
            containerEl.style.height = originalHeight;
            
            // Restaurar imágenes de fondo
            allElements.forEach((el, index) => {
                el.style.backgroundImage = bgImages[index];
            });
            
            // Remover clase de optimización si no estaba presente
            if (!hadPdfOptimizado) {
                contentEl.classList.remove('pdf-optimizado');
            }
            
            // ========== PASO 3: GENERAR PDF A4 DE UNA PÁGINA CON COMPRESIÓN ==========
            // Usar JPEG en lugar de PNG para menor tamaño (80% de calidad)
            const imgData = canvas.toDataURL('image/jpeg', 0.80);
            const { jsPDF } = window.jspdf;
            // Usar compresión en el PDF también
            const pdf = new jsPDF({ 
                unit: 'mm', 
                format: 'a4', 
                orientation: 'portrait',
                compress: true  // Comprimir PDF
            });
            const pdfWidth = pdf.internal.pageSize.getWidth();   // 210mm (A4)
            const pdfHeight = pdf.internal.pageSize.getHeight();  // 297mm (A4)
            const imgProps = { width: canvas.width, height: canvas.height };
            
            // Calcular escala para que TODO quepa en UNA SOLA PÁGINA A4
            const imgAspectRatio = imgProps.height / imgProps.width;
            const pdfAspectRatio = pdfHeight / pdfWidth;
            
            let imgWidthMM, imgHeightMM;
            if (imgAspectRatio > pdfAspectRatio) {
                // Imagen más alta que A4 → escalar por altura
                imgHeightMM = pdfHeight - 2;  // 2mm de margen
                imgWidthMM = imgHeightMM / imgAspectRatio;
            } else {
                // Imagen más ancha que A4 → escalar por ancho
                imgWidthMM = pdfWidth - 2;  // 2mm de margen
                imgHeightMM = imgWidthMM * imgAspectRatio;
            }
            
            // Centrar imagen en la página
            const marginTop = (pdfHeight - imgHeightMM) / 2;
            const marginLeft = (pdfWidth - imgWidthMM) / 2;
            
            // Usar JPEG para mejor compresión
            pdf.addImage(imgData, 'JPEG', marginLeft, marginTop, imgWidthMM, imgHeightMM);
            const filename = `orden-${ordenActual ? ordenActual.ordenId : Date.now()}.pdf`;
            pdf.save(filename);
            rifaplusUtils.showFeedback('✅ PDF descargado', 'success');
        }).catch(err => {
            // Restaurar estilos en caso de error
            containerEl.style.display = originalDisplay;
            containerEl.style.maxHeight = originalMaxHeight;
            containerEl.style.overflow = originalOverflow;
            containerEl.style.height = originalHeight;
            
            // Restaurar imágenes de fondo incluso en error
            allElements.forEach((el, index) => {
                el.style.backgroundImage = bgImages[index];
            });
            
            // Remover clase de optimización si no estaba presente
            if (!hadPdfOptimizado) {
                contentEl.classList.remove('pdf-optimizado');
            }
            
            console.error('Error al generar PDF:', err);
            rifaplusUtils.showFeedback('❌ Error al generar PDF', 'error');
        });
    } catch (err) {
        console.error('Error al generar PDF:', err);
        rifaplusUtils.showFeedback('❌ Error al generar PDF', 'error');
    }
}

/* ============================================================ */
/* SECCIÓN 6: GUARDADO Y CONFIRMACIÓN DE ORDEN                 */
/* ============================================================ */

/**
 * guardarOrden - Guarda la orden en backend y redirige a página de confirmación
 * @async
 * @returns {Promise<void>}
 */
async function guardarOrden() {
    if (!ordenActual) {
        rifaplusUtils.showFeedback('❌ No hay orden para guardar', 'error');
        return;
    }

    // Prevenir múltiples clics
    if (window.guardandoOrden) {
        console.warn('⚠️  Ya hay una orden en proceso de guardado');
        return;
    }

    window.guardandoOrden = true;

    try {
        // Mostrar modal de loading
        const modalLoading = document.getElementById('modalLoadingOrden');
        const btnContinuar = document.getElementById('btnContinuarOrdenFormal');
        if (modalLoading) {
            modalLoading.style.display = 'flex';
            // Iniciar contador de tiempo
            let segundos = 0;
            const contadorInterval = setInterval(() => {
                segundos++;
                const tiempoEl = document.getElementById('tiempoTranscurrido');
                if (tiempoEl) tiempoEl.textContent = `Tiempo: ${segundos}s`;
                // Si no se completa en 120 segundos, mostrar advertencia
                if (segundos > 120) {
                    const pEl = document.getElementById('tiempoTranscurrido');
                    if (pEl) pEl.style.color = '#ff6b6b';
                }
            }, 1000);
            window.contadorOrdenInterval = contadorInterval;
        }
        if (btnContinuar) btnContinuar.disabled = true;
        
        // Mostrar mensaje de envío
        rifaplusUtils.showFeedback('📤 Guardando orden en la base de datos...', 'loading');
        
        // VALIDACIÓN 1: Datos básicos de orden
        if (!ordenActual.cliente) {
            throw new Error('Datos del cliente incompletos');
        }
        if (!ordenActual.boletos) {
            throw new Error('No hay boletos en la orden');
        }

        // VALIDACIÓN 2: Asegurar que boletos es un array válido
        let boletosArray = ordenActual.boletos;
        if (!Array.isArray(boletosArray)) {
            console.error('❌ boletosArray no es array:', { type: typeof boletosArray, value: boletosArray });
            throw new Error('Los boletos deben ser un array válido');
        }

        if (boletosArray.length === 0) {
            throw new Error('Se requiere al menos un boleto');
        }

        // VALIDACIÓN 3: Limpiar y validar cada boleto
        boletosArray = boletosArray
            .map(b => {
                const num = Number(b);
                if (isNaN(num)) {
                    console.warn(`⚠️  Boleto no válido: ${b}`);
                    return null;
                }
                return num;
            })
            .filter(b => b !== null && b > 0);

        if (boletosArray.length === 0) {
            throw new Error('No hay boletos válidos para guardar');
        }

        // ⭐ VALIDACIÓN CRÍTICA: Verificar disponibilidad en TIEMPO REAL (sin caché)
        console.log('🔍 Verificando disponibilidad de boletos en tiempo real...');
        try {
            const apiBase = window.rifaplusConfig?.backend?.apiBase || 'https://rifas-web-1.onrender.com';
            const checkResponse = await fetch(`${apiBase}/api/public/boletos`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                mode: 'cors',
                credentials: 'omit'
            });

            if (checkResponse.ok) {
                const boletoData = await checkResponse.json();
                const boletosNoDisponibles = [];
                const boletosNoEncontrados = [];

                const sold = new Set(boletoData.data?.sold || []);
                const reserved = new Set(boletoData.data?.reserved || []);

                for (const num of boletosArray) {
                    if (sold.has(num)) {
                        boletosNoDisponibles.push(num);
                    } else if (reserved.has(num)) {
                        boletosNoDisponibles.push(num);
                    }
                }

                if (boletosNoDisponibles.length > 0) {
                    throw new Error(
                        `❌ ALERTA: Los siguientes boletos ya no están disponibles: ${boletosNoDisponibles.join(', ')}. ` +
                        `Selecciona otros boletos e intenta de nuevo.`
                    );
                }

                console.log(`✅ Todos los ${boletosArray.length} boletos están disponibles (verificación en tiempo real)`);
            } else {
                console.warn('⚠️  No se pudo verificar disponibilidad (check no bloqueante)');
                // No bloquear si falla el check - continuará normalmente
            }
        } catch (checkError) {
            // Si el check falla por razón técnica, no bloquear, solo avisar
            console.warn('⚠️  Error al verificar disponibilidad (no bloqueante):', checkError.message);
        }

        // VALIDACIÓN 4: Datos del cliente
        const nombre = (ordenActual.cliente.nombre || '').trim();
        const whatsapp = (ordenActual.cliente.whatsapp || '').trim();
        
        if (!nombre || nombre.length < 2) {
            throw new Error('Nombre del cliente requerido (mín. 2 caracteres)');
        }

        if (!whatsapp || whatsapp.replace(/[^0-9]/g, '').length < 10) {
            throw new Error('Teléfono/WhatsApp inválido');
        }

        // VALIDACIÓN 5: Datos monetarios
        const subtotal = parseFloat(ordenActual.totales?.subtotal) || parseFloat(ordenActual.totales?.total) || 0;
        const totalFinal = parseFloat(ordenActual.totales?.totalFinal) || parseFloat(ordenActual.totales?.total) || 0;

        if (subtotal <= 0 || totalFinal <= 0) {
            throw new Error('El total debe ser mayor a 0');
        }

        // Preparar payload validado
        const payload = {
            ordenId: (ordenActual.ordenId || `RIFA-${Date.now()}`).slice(0, 50),  // Limitar longitud
            cliente: {
                nombre: nombre.slice(0, 100),
                apellidos: (ordenActual.cliente.apellidos || '').trim().slice(0, 100),
                whatsapp: whatsapp.slice(0, 20),
                estado: (ordenActual.cliente.estado || '').trim().slice(0, 50),
                ciudad: (ordenActual.cliente.ciudad || '').trim().slice(0, 50)
            },
            boletos: boletosArray,
            totales: {
                subtotal: Math.round(subtotal * 100) / 100,
                descuento: Math.max(0, Math.round((parseFloat(ordenActual.totales?.descuento) || 0) * 100) / 100),
                totalFinal: Math.round(totalFinal * 100) / 100
            },
            cuenta: ordenActual.cuenta || {},
            precioUnitario: (function(){
                const p1 = parseFloat(ordenActual.totales?.precioUnitario);
                if (!Number.isNaN(p1) && p1 > 0) return p1;
                if (typeof obtenerPrecioDinamico === 'function') return obtenerPrecioDinamico();
                return (window.rifaplusConfig?.rifa?.precioBoleto && Number(window.rifaplusConfig.rifa.precioBoleto)) || 15;
            })(),
            metodoPago: 'transferencia',
            notas: ''
        };

        // VALIDACIÓN 6: Consistencia de precio
        const precioCalculado = boletosArray.length * payload.precioUnitario;
        const diferencia = Math.abs(precioCalculado - payload.totales.subtotal);
        if (diferencia > 0.01 * boletosArray.length) {  // Permitir pequeña diferencia por redondeos
            console.warn(`⚠️  Diferencia de precio: calculado=${precioCalculado}, enviado=${payload.totales.subtotal}`);
            // No fallar, pero avisar
        }

        // ENVÍO AL SERVIDOR CON TIMEOUT Y REINTENTOS
        const apiBase = window.rifaplusConfig?.backend?.apiBase || 'https://rifas-web-1.onrender.com';
        const apiUrl = `${apiBase}/api/ordenes`;
        const maxReintentos = 3;
        let ultimoError = null;

        // Calcular timeout dinámico según cantidad de boletos
        // Para 1200 boletos: 60 segundos, para 100: 30 segundos
        const cantidadBoletos = boletosArray.length;
        const timeoutMs = Math.max(30000, Math.min(120000, 20000 + (cantidadBoletos * 40)));
        console.log(`⏱️  Timeout dinámico: ${timeoutMs}ms para ${cantidadBoletos} boletos`);

        for (let intento = 1; intento <= maxReintentos; intento++) {
            try {
                console.log(`📡 Intento ${intento}/${maxReintentos} de guardar orden...`);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);  // Timeout dinámico

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    mode: 'cors',
                    signal: controller.signal,
                    credentials: 'omit'
                });

                clearTimeout(timeoutId);

                // PROCESAR RESPUESTA
                if (!response.ok) {
                    let errorData = {};
                    try {
                        errorData = await response.json();
                    } catch (parseError) {
                        console.warn('No se pudo parsear respuesta de error:', parseError);
                    }

                    const mensajeError = errorData.message || `Error ${response.status}`;
                    console.error(`❌ Error HTTP ${response.status}:`, errorData);
                    
                    // Errores que SÍ se pueden reintentar
                    if (response.status >= 500 && intento < maxReintentos) {
                        ultimoError = `Error servidor (${response.status}). Reintentando...`;
                        console.log(`⏳ Error temporal, reintentando en 2 segundos...`);
                        await new Promise(resolve => setTimeout(resolve, 2000 * intento));
                        continue;
                    }

                    // Errores que NO se reintentan
                    if (response.status === 409 && errorData.boletosConflicto) {
                        throw new Error(
                            `❌ Estos boletos ya fueron comprados: ${errorData.boletosConflicto.join(', ')}. Selecciona otros.`
                        );
                    }
                    if (response.status === 409) {
                        throw new Error('Esta orden ya existe. Intenta con otra configuración.');
                    }
                    if (response.status >= 400 && response.status < 500) {
                        throw new Error(`Error en los datos: ${mensajeError}`);
                    }

                    throw new Error(`Error del servidor: ${mensajeError}`);
                }

                // ÉXITO - Procesar respuesta
                const respuestaExitosa = await response.json();
                console.log('✅ Orden guardada en BD:', respuestaExitosa);

                // ⭐ OCULTAR LOADING INMEDIATAMENTE (cuando se crea exitosamente la orden)
                const modalLoadingSuccess = document.getElementById('modalLoadingOrden');
                if (modalLoadingSuccess) {
                    modalLoadingSuccess.style.display = 'none';
                }
                
                // Limpiar contador
                if (window.contadorOrdenInterval) {
                    clearInterval(window.contadorOrdenInterval);
                    window.contadorOrdenInterval = null;
                }

                // ACTUALIZAR DISPONIBILIDAD
                if (typeof cargarBoletosPublicos === 'function') {
                    try {
                        await cargarBoletosPublicos();
                        console.log('✅ Disponibilidad de boletos actualizada');
                    } catch (e) {
                        console.warn('⚠️  No se pudo actualizar disponibilidad:', e?.message);
                    }
                }

                // GUARDAR EN LOCALSTORAGE
                localStorage.setItem('rifaplus_orden_actual', JSON.stringify(ordenActual));
                localStorage.setItem('rifaplus_orden_url', respuestaExitosa.url || '');
                localStorage.setItem('rifaplus_orden_confirmada', 'true');

                // GUARDAR EN HISTORIAL
                try {
                    const ordenes = JSON.parse(localStorage.getItem('rifaplus_ordenes_admin') || '[]');
                    ordenes.push({
                        ...ordenActual,
                        estado: 'pendiente',
                        fecha: new Date().toISOString(),
                        url_confirmacion: respuestaExitosa.url
                    });
                    localStorage.setItem('rifaplus_ordenes_admin', JSON.stringify(ordenes));
                } catch (e) {
                    console.warn('⚠️  No se pudo guardar historial:', e?.message);
                }

                // LIMPIAR CARRITO
                console.log('🧹 Limpiando carrito...');
                localStorage.removeItem('rifaplusSelectedNumbers');
                localStorage.removeItem('rifaplus_boletos');
                localStorage.removeItem('rifaplus_cliente');
                localStorage.removeItem('rifaplus_total');
                
                if (typeof selectedNumbersGlobal !== 'undefined' && selectedNumbersGlobal?.clear) {
                    selectedNumbersGlobal.clear();
                }
                
                // ACTUALIZAR UI
                if (typeof actualizarVistaCarritoGlobal === 'function') {
                    try { actualizarVistaCarritoGlobal(); } catch (e) { console.warn('Error actualizando vista:', e); }
                }
                if (typeof actualizarContadorCarritoGlobal === 'function') {
                    try { actualizarContadorCarritoGlobal(); } catch (e) { console.warn('Error actualizando contador:', e); }
                }
                
                cerrarOrdenFormal();
                
                // ⭐ REDIRIGIR INMEDIATAMENTE (sin delay) - experiencia de usuario optimizada
                console.log('🚀 Redirigiendo a orden-confirmada.html (INMEDIATAMENTE)');
                window.location.href = 'orden-confirmada.html';
                
                return;  // ÉXITO - salir del loop de reintentos

            } catch (fetchError) {
                ultimoError = fetchError.message;
                
                if (fetchError.name === 'AbortError') {
                    console.error(`⏱️  Timeout en intento ${intento}`);
                    ultimoError = 'Timeout de conexión. El servidor está tardando demasiado.';
                } else if (fetchError instanceof TypeError && fetchError.message.includes('Failed to fetch')) {
                    console.error(`🌐 Error de red en intento ${intento}`);
                    ultimoError = 'No se puede conectar al servidor. Verifica tu conexión a internet.';
                } else {
                    console.error(`❌ Error en intento ${intento}:`, fetchError);
                }

                if (intento < maxReintentos) {
                    console.log(`⏳ Reintentando (${intento + 1}/${maxReintentos})...`);
                    await new Promise(resolve => setTimeout(resolve, 2000 * intento));
                    continue;
                }

                throw ultimoError;
            }
        }

    } catch (error) {
        console.error('❌ Error crítico al guardar orden:', error);
        const mensajeFinal = typeof error === 'string' ? error : (error?.message || 'Error desconocido');
        rifaplusUtils.showFeedback(`❌ ${mensajeFinal}`, 'error');
        
    } finally {
        window.guardandoOrden = false;
        
        // Ocultar modal de loading
        const modalLoading = document.getElementById('modalLoadingOrden');
        if (modalLoading) {
            modalLoading.style.display = 'none';
        }
        
        // Limpiar contador
        if (window.contadorOrdenInterval) {
            clearInterval(window.contadorOrdenInterval);
            window.contadorOrdenInterval = null;
        }
        
        // Re-habilitar botón
        const btnContinuar = document.getElementById('btnContinuarOrdenFormal');
        if (btnContinuar) btnContinuar.disabled = false;
    }
}

/**
 * Inicializa los event listeners para botones y modales
 */
document.addEventListener('DOMContentLoaded', function() {
    const btnCancelarOrdenFormal = document.getElementById('btnCancelarOrdenFormal');
    const btnContinuarOrdenFormal = document.getElementById('btnContinuarOrdenFormal');
    const closeOrdenFormal = document.getElementById('closeOrdenFormal');
    const modalOrdenFormal = document.getElementById('modalOrdenFormal');
    const btnDescargarOrdenFormal = document.getElementById('btnDescargarOrdenFormal');

    if (btnCancelarOrdenFormal) {
        btnCancelarOrdenFormal.addEventListener('click', cerrarOrdenFormal);
        console.log('✅ Event listener agregado a btnCancelarOrdenFormal');
    }
    if (btnContinuarOrdenFormal) {
        btnContinuarOrdenFormal.addEventListener('click', function(e) {
            console.log('🖱️ Click en btnContinuarOrdenFormal detectado');
            e.preventDefault();
            e.stopPropagation();
            console.log('🎯 Llamando a guardarOrden()');
            guardarOrden();
        });
        console.log('✅ Event listener agregado a btnContinuarOrdenFormal');
    } else {
        console.warn('⚠️ btnContinuarOrdenFormal NO ENCONTRADO');
    }

    if (btnDescargarOrdenFormal) {
        btnDescargarOrdenFormal.addEventListener('click', function() {
            console.log('🖱️ Click en btnDescargarOrdenFormal detectado');
            imprimirOrden();
        });
    }

    if (closeOrdenFormal) {
        closeOrdenFormal.addEventListener('click', cerrarOrdenFormal);
    }

    // Cerrar al hacer click fuera
    if (modalOrdenFormal) {
        modalOrdenFormal.addEventListener('click', function(e) {
            if (e.target === modalOrdenFormal) {
                cerrarOrdenFormal();
            }
        });
    }
});
/* ============================================================ */
/* DEBUG HELPERS - Helpers para debugging                       */
/* ============================================================ */

// Función para testear desde la consola
window.debugOrdenFormal = {
    // Verificar estado actual
    status: function() {
        console.log('=== DEBUG ORDEN FORMAL STATUS ===');
        console.log('ordenActual:', ordenActual);
        console.log('Botón btnContinuarOrdenFormal:', document.getElementById('btnContinuarOrdenFormal'));
        console.log('Modal visible:', document.getElementById('modalOrdenFormal')?.style.display);
        return {
            ordenActual,
            botonExiste: !!document.getElementById('btnContinuarOrdenFormal'),
            modalVisible: document.getElementById('modalOrdenFormal')?.style.display !== 'none'
        };
    },
    
    // Simular click en botón Apartar
    simularClick: function() {
        console.log('🧪 Simulando click en btnContinuarOrdenFormal...');
        const btn = document.getElementById('btnContinuarOrdenFormal');
        if (btn) {
            btn.click();
        } else {
            console.error('❌ Botón no encontrado');
        }
    },
    
    // Llamar directamente a la función
    ejecutarDirecto: function() {
        console.log('🧪 Ejecutando guardarOrden() directamente...');
        guardarOrden();
    },
    
    // Ver localStorage
    verLocalStorage: function() {
        console.log('=== localStorage ===');
        console.log('rifaplus_orden_actual:', JSON.parse(localStorage.getItem('rifaplus_orden_actual') || 'null'));
        console.log('rifaplus_cliente:', JSON.parse(localStorage.getItem('rifaplus_cliente') || 'null'));
        console.log('rifaplusSelectedNumbers:', JSON.parse(localStorage.getItem('rifaplusSelectedNumbers') || 'null'));
        console.log('rifaplus_total:', localStorage.getItem('rifaplus_total'));
    }
};

console.log('✅ DEBUG HELPERS disponibles: window.debugOrdenFormal.status(), .simularClick(), .ejecutarDirecto(), .verLocalStorage()');
