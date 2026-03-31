/**
 * ============================================================================
 * SINCRONIZACIÓN EN VIVO DE CAMBIOS DEL SORTEO (Admin → Frontend)
 * ============================================================================
 * 
 * Responsabilidades:
 * - Escuchar cambios desde el panel admin (evento personalizado + localStorage)
 * - Actualizar elementos del DOM en tiempo real
 * - Sincronizar múltiples pestañas del navegador
 * - Mostrar notificaciones visuales cuando hay cambios
 * - Recargar carrusel de imágenes dinámicamente
 * 
 * Activado: Apenas carga index.html
 */

(function inicializarSincronizacionSorteo() {
    'use strict';
    
    // Debug flag
    const DEBUG = false;
    const log = (msg, data) => {
        if (DEBUG) {
            console.log(`[SorteoSync] ${msg}`, data || '');
        }
    };

    // ============================================================
    // 1. ESCUCHAR EVENTOS PERSONALIZADOS (MISMA PESTAÑA)
    // ============================================================
    window.addEventListener('rifaplus:sorteo-actualizado', (event) => {
        log('🎯 Evento de sincronización recibido', event.detail);
        const { edicion, nombre, descripcion, imagenes } = event.detail;
        
        actualizarElementosSorteo({
            edicion,
            nombre,
            descripcion,
            imagenes
        });
    });

    // ============================================================
    // 2. ESCUCHAR CAMBIOS EN LOCALSTORAGE (OTRAS PESTAÑAS)
    // ============================================================
    window.addEventListener('storage', (event) => {
        if (event.key === 'rifaplus_sorteo_sincronizar' && event.newValue) {
            log('🔄 Cambios desde otra pestaña detectados');
            try {
                const datos = JSON.parse(event.newValue);
                actualizarElementosSorteo(datos);
            } catch (e) {
                console.error('[SorteoSync] Error parseando datos de sincronización:', e);
            }
        }
    });

    // ============================================================
    // 3. FUNCIÓN PRINCIPAL: ACTUALIZAR ELEMENTOS DEL DOM
    // ============================================================
    function actualizarElementosSorteo(datos) {
        const { edicion, nombre, descripcion, imagenes = [] } = datos;

        log('📝 Actualizando elementos en el DOM:', { edicion, nombre, imagenes: imagenes.length });

        // 1. Actualizar edición (si existe elemento)
        if (edicion) {
            const elementoEdicion = document.getElementById('edicionNombre');
            if (elementoEdicion && elementoEdicion.textContent !== edicion) {
                elementoEdicion.textContent = edicion;
                animarCambio(elementoEdicion);
                log('✅ Edición actualizada:', edicion);
            }
        }

        // 2. Actualizar nombre del sorteo en hero title
        if (nombre) {
            // Hero title principal
            const heroTitle = document.getElementById('heroTitle');
            if (heroTitle) {
                // Mantener el <span class="highlight"> si existe
                const spanHighlight = heroTitle.querySelector('.highlight');
                if (spanHighlight) {
                    // No reemplazar la estructura, solo actualizar el texto del resto
                    log('⚠️ Hero title tiene estructura especial, actualizando con cuidado');
                } else {
                    heroTitle.textContent = `Gana un ${nombre}`;
                    animarCambio(heroTitle);
                    log('✅ Nombre del sorteo actualizado en hero');
                }
            }

            // Actualizar también en config en memoria si existe
            if (window.rifaplusConfig?.rifa) {
                window.rifaplusConfig.rifa.nombreSorteo = nombre;
            }
        }

        // 3. Actualizar descripción
        if (descripcion) {
            const elemDescripcion = document.getElementById('heroDescription');
            if (elemDescripcion && elemDescripcion.textContent !== descripcion) {
                elemDescripcion.textContent = descripcion;
                animarCambio(elemDescripcion);
                log('✅ Descripción actualizada:', descripcion);
            }
        }

        // 4. RECARGAR CARRUSEL DE IMÁGENES (más complejo)
        if (Array.isArray(imagenes) && imagenes.length > 0) {
            actualizarCarrusel(imagenes);
        }

        // 5. Mostrar notificación visual
        mostrarNotificacionSincronizacion('✅ Información del sorteo actualizada en vivo');
    }

    // ============================================================
    // 4. ACTUALIZAR CARRUSEL DE IMÁGENES
    // ============================================================
    function actualizarCarrusel(imagenes) {
        log('🖼️ Actualizando carrusel con', imagenes.length, 'imágenes');

        const carruselInner = document.querySelector('.carrusel-inner');
        if (!carruselInner) {
            log('⚠️ Contenedor .carrusel-inner no encontrado');
            return;
        }

        // Guardar índice actual antes de actualizar
        const indiceActual = document.querySelector('.carrusel-item.active') 
            ? Array.from(document.querySelectorAll('.carrusel-item')).indexOf(
                document.querySelector('.carrusel-item.active')
            ) 
            : 0;

        // Limpiar carrusel actual
        carruselInner.innerHTML = '';

        // Agregar nuevas imágenes con animación
        imagenes.forEach((imagen, index) => {
            const slide = document.createElement('div');
            slide.className = `carrusel-item${index === 0 ? ' active' : ''}`;
            slide.style.opacity = '0';
            slide.style.transition = 'opacity 0.3s ease';

            const img = document.createElement('img');
            img.src = imagen.url;
            img.alt = imagen.titulo || `Imagen ${index + 1}`;
            img.loading = 'lazy';
            img.onload = function() {
                setTimeout(() => {
                    slide.style.opacity = '1';
                }, 50);
            };

            slide.appendChild(img);
            carruselInner.appendChild(slide);
        });

        // Re-inicializar controles del carrusel si existen
        if (typeof inicializarCarrusel === 'function') {
            setTimeout(() => {
                inicializarCarrusel();
                log('🔄 Carrusel reinicializado');
            }, 500);
        }
    }

    // ============================================================
    // 5. ANIMACIÓN SUTIL DE CAMBIO
    // ============================================================
    function animarCambio(elemento) {
        if (!elemento) return;

        elemento.style.transition = 'all 0.3s ease';
        elemento.style.opacity = '0.7';
        
        setTimeout(() => {
            elemento.style.opacity = '1';
        }, 150);
    }

    // ============================================================
    // 6. NOTIFICACIÓN VISUAL DE SINCRONIZACIÓN
    // ============================================================
    function mostrarNotificacionSincronizacion(mensaje) {
        // No interrumpir si ya hay una alerta visible
        const alertaExistente = document.querySelector('.rifaplus-notificacion-sincronizacion');
        if (alertaExistente) {
            alertaExistente.remove();
        }

        // Crear notificación tipo toast
        const notificacion = document.createElement('div');
        notificacion.className = 'rifaplus-notificacion-sincronizacion';
        notificacion.innerHTML = `
            <div style="
                position: fixed;
                top: 1.5rem;
                right: 1.5rem;
                background: linear-gradient(135deg, #31A24C 0%, #2d8a41 100%);
                color: white;
                padding: 1rem 1.5rem;
                border-radius: 0.5rem;
                box-shadow: 0 4px 12px rgba(49, 162, 76, 0.3);
                font-weight: 500;
                font-size: 0.95rem;
                display: flex;
                align-items: center;
                gap: 0.75rem;
                z-index: 99999;
                animation: slideInRight 0.3s ease;
            ">
                <i class="fas fa-check-circle"></i>
                ${mensaje}
            </div>
        `;

        document.body.appendChild(notificacion);

        // Auto-remover después de 3 segundos
        setTimeout(() => {
            notificacion.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notificacion.remove(), 300);
        }, 3000);
    }

    // ============================================================
    // 7. AGREGAR ANIMACIONES CSS SI NO EXISTEN
    // ============================================================
    if (!document.querySelector('style[data-sorteo-sync]')) {
        const style = document.createElement('style');
        style.setAttribute('data-sorteo-sync', 'true');
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(400px);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    // 8. INICIALIZACIÓN EN STARTUP
    // ============================================================
    log('🚀 Sistema de sincronización de sorteo inicializado');

    // Intentar cargar datos guardados en localStorage al arrancar
    try {
        const datosGuardados = JSON.parse(localStorage.getItem('sorteo-info-general') || '{}');
        if (datosGuardados.edicion || datosGuardados.nombre) {
            log('📥 Datos guardados encontrados en localStorage');
            // No aplicar al startup, solo escuchar cambios
        }
    } catch (e) {
        log('⚠️ Error cargando datos guardados:', e.message);
    }

})();
