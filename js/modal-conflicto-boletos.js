/**
 * ============================================================
 * ARCHIVO: js/modal-conflicto-boletos.js
 * DESCRIPCIÓN: Modal amigable para conflictos de boletos
 * - Muestra boletos que fueron apartados por otros clientes
 * - Ofrece opciones: elegir otros O continuar sin conflictivos
 * - Maneja reintentos inteligentes
 * ============================================================
 */

const ModalConflictoBoletos = {
    _escaparHtml(valor) {
        return String(valor || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },
    
    /**
     * Crear y mostrar modal de conflicto
     * @param {Object} datos - Datos del error de conflicto
     * @returns {Promise<{opcion: string, boletosSeleccionados: Array}>}
     */
    async mostrarModalConflicto(datos) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.id = 'modal-conflicto-overlay';
            overlay.className = 'modal-overlay-conflicto';
            overlay.setAttribute('role', 'presentation');

            const modal = document.createElement('div');
            modal.className = 'modal-conflicto';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', 'modalConflictoTitulo');
            modal.setAttribute('aria-describedby', 'modalConflictoDescripcion');

            console.log('🔍 ModalConflictoBoletos - Datos recibidos:', {
                boletosConflicto: datos.boletosConflicto,
                boletosDisponibles: datos.boletosDisponibles
            });
            
            // ✅ NOTA: Ya no necesitamos calcular maxDigitos 
            // La función formatearNumeroBoleto() lo hace internamente
            
            // Función para formatear boletos con ceros a la izquierda
            const formatearBoleto = (numero) => {
                // ✅ Usar función centralizada de config.js
                return window.rifaplusConfig.formatearNumeroBoleto(numero);
            };

            const mensaje = this._escaparHtml(datos.message || 'Algunos boletos ya no estan disponibles.');
            const totalConflictos = Array.isArray(datos.boletosConflicto) ? datos.boletosConflicto.length : 0;
            const totalDisponibles = Array.isArray(datos.boletosDisponibles) ? datos.boletosDisponibles.length : 0;
            const puedeContinuar = totalDisponibles > 0;
            const conflictoCards = (datos.boletosConflicto || []).map((boleto) => `
                <div class="modal-conflicto-chip">
                    <span class="modal-conflicto-chip-number">${formatearBoleto(boleto)}</span>
                </div>
            `).join('');

            let contenido = `
                <div class="modal-conflicto-header">
                    <div class="modal-conflicto-icon" aria-hidden="true">⚠️</div>
                    <h2 id="modalConflictoTitulo" class="modal-conflicto-title">
                        Boletos No Disponibles
                    </h2>
                    <p id="modalConflictoDescripcion" class="modal-conflicto-description">
                        ${mensaje}
                    </p>
                </div>

                <div class="modal-conflicto-panel modal-conflicto-panel--danger">
                    <p class="modal-conflicto-label">
                        <strong>${totalConflictos}</strong> boleto(s) ya fueron apartados por otro cliente:
                    </p>
                    <div class="modal-conflicto-chip-grid">
                        ${conflictoCards}
                    </div>
                </div>
            `;

            contenido += `
                <div class="modal-conflicto-actions-block">
                    <p class="modal-conflicto-label modal-conflicto-label--question">
                        ¿Qué deseas hacer?
                    </p>
                    <div class="modal-conflicto-actions">
                        <button class="btn-conflicto btn-conflicto--ghost" data-accion="elegir-otros">
                            📝 Elegir otros boletos
                        </button>
            `;

            if (puedeContinuar) {
                contenido += `
                    <button class="btn-conflicto btn-conflicto--solid" data-accion="continuar-sin-conflicto">
                        ✅ Continuar con ${totalDisponibles} boleto(s) disponibles
                    </button>
                `;
            }

            contenido += `
                    </div>
                </div>

                <div class="modal-conflicto-tip">
                    <p>
                        💡 <strong>Tip:</strong> Los boletos disponibles se apartaron hace unos momentos. 
                        Si esperas, otros clientes también podrían apartarlos.
                    </p>
                </div>
            `;

            modal.innerHTML = contenido;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            window.rifaplusModalScrollLock?.sync?.();

            // Event listeners
            const btns = modal.querySelectorAll('.btn-conflicto');
            const cerrarModal = (payload) => {
                overlay.classList.add('modal-overlay-conflicto--closing');
                modal.classList.add('modal-conflicto--closing');
                setTimeout(() => {
                    overlay.remove();
                    window.rifaplusModalScrollLock?.sync?.();
                }, 220);
                resolve(payload);
            };

            btns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const accion = btn.getAttribute('data-accion');

                    if (accion === 'elegir-otros') {
                        cerrarModal({
                            opcion: 'elegir_otros',
                            boletosSeleccionados: []
                        });
                    } else if (accion === 'continuar-sin-conflicto') {
                        cerrarModal({
                            opcion: 'continuar_sin_conflicto',
                            boletosSeleccionados: datos.boletosDisponibles
                        });
                    }
                });
            });

            // Cerrar si se hace clic fuera
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cerrarModal({
                        opcion: 'elegir_otros',
                        boletosSeleccionados: []
                    });
                }
            });
        });
    },

    /**
     * Manejar respuesta de conflicto desde el servidor
     * @param {Object} respuestaServidor - Respuesta de POST /api/ordenes
     */
    async manejarConflicto(respuestaServidor) {
        console.log('🔴 Conflicto de boletos detectado:', respuestaServidor);

        // Mostrar modal
        const resultado = await this.mostrarModalConflicto(respuestaServidor);

        console.log('✅ Usuario eligió:', resultado);

        return resultado;
    }
};

// Hacer disponible globalmente
if (typeof window !== 'undefined') {
    window.ModalConflictoBoletos = ModalConflictoBoletos;
}
