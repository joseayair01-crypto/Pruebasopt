/**
 * ============================================================
 * SISTEMA DE PREMIOS DINÁMICO
 * ============================================================
 * Renderiza automáticamente la sección de premios desde config.js
 * 
 * Características:
 * - 3 categorías: Sorteo, Presorteo, Ruletazos
 * - Totalmente configurable desde config.js
 * - Responsivo y animado
 * - Se oculta automáticamente si está deshabilitado
 * ============================================================
 */

// Ejecutar cuando el DOM esté completamente listo
document.addEventListener('DOMContentLoaded', function() {
    console.log('[Premios] DOMContentLoaded disparado');
    setTimeout(() => {
        inicializarSistemaPremios();
    }, 500); // Esperar 500ms para que config.js se cargue completamente
});

// También ejecutar después de un tiempo como fallback
setTimeout(() => {
    if (!window.sistemaPremiosInicializado) {
        console.warn('[Premios] Ejecutando por timeout');
        inicializarSistemaPremios();
    }
}, 2000);

function inicializarSistemaPremios() {
    'use strict';

    if (window.sistemaPremiosInicializado) {
        console.log('[Premios] Ya fue inicializado');
        return;
    }
    window.sistemaPremiosInicializado = true;

    console.log('[Premios] Cargando premios...');

    // Intentar cargar desde el servidor primero
    cargarPremiosDelServidor()
        .then(config => {
            if (config) {
                // 🔄 FALLBACK: Si ruletazos viene vacío del servidor, completar desde config.js local
                if ((!config.ruletazos || config.ruletazos.length === 0) && 
                    window.rifaplusConfig?.rifa?.sistemaPremios?.ruletazos?.length > 0) {
                    console.log('[Premios] ✅ Ruletazos vacío en servidor, cargando desde config.js local');
                    config.ruletazos = [...window.rifaplusConfig.rifa.sistemaPremios.ruletazos];
                }
                renderizarSistemaPremios(config);
            } else {
                // Fallback a config.js local
                cargarPremiosLocal();
            }
        })
        .catch(error => {
            console.warn('[Premios] Error cargando del servidor, usando config.js local:', error.message);
            cargarPremiosLocal();
        });
}

/**
 * Intenta cargar premios desde el servidor
 */
async function cargarPremiosDelServidor() {
    try {
        // Obtener API_BASE desde config
        const API_BASE = (window.rifaplusConfig && window.rifaplusConfig.backend) 
            ? window.rifaplusConfig.backend.apiBase 
            : (window.rifaplusConfig?.obtenerApiBase?.() || window.location.origin);
        
        const response = await fetch(`${API_BASE}/api/public/config`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (result.success && result.data.sistemaPremios) {
            console.log('[Premios] ✅ Cargado desde servidor');
            return result.data.sistemaPremios;
        }

        return null;
    } catch (error) {
        console.warn('[Premios] No se pudo cargar del servidor:', error.message);
        return null;
    }
}

/**
 * Carga premios desde config.js local (fallback)
 */
function cargarPremiosLocal() {
    console.log('[Premios] Usando config.js local');
    console.log('[Premios] window.rifaplusConfig:', typeof window.rifaplusConfig);
    
    if (!window.rifaplusConfig || !window.rifaplusConfig.rifa) {
        console.error('❌ [Premios] Config no disponible:', {
            hasConfig: !!window.rifaplusConfig,
            hasRifa: !!window.rifaplusConfig?.rifa,
            configKeys: Object.keys(window.rifaplusConfig || {})
        });
        return;
    }

    const sistemaPremios = window.rifaplusConfig.rifa?.sistemaPremios;
    renderizarSistemaPremios(sistemaPremios);
    
    // 🔔 Escuchar eventos de actualización desde admin
    if (typeof window.rifaplusConfig.escucharEvento === 'function') {
        window.rifaplusConfig.escucharEvento('estadoActualizado', (datos) => {
            console.log('[Premios] 🔔 Evento estadoActualizado recibido:', datos);
            // Re-renderizar si los cambios afectan premios
            const sistemaPremiosActualizado = window.rifaplusConfig.rifa?.sistemaPremios;
            if (sistemaPremiosActualizado) {
                renderizarSistemaPremios(sistemaPremiosActualizado);
                console.log('[Premios] ✅ Premios re-renderizados automáticamente');
            }
        });

        // 🔔 Escuchar cuando Presorteo es actualizado
        window.rifaplusConfig.escucharEvento('presorteoActualizado', (datos) => {
            console.log('[Premios] 🔔 Evento presorteoActualizado recibido:', datos);
            
            // Actualizar config local PRIMERO
            if (window.rifaplusConfig?.rifa?.sistemaPremios) {
                window.rifaplusConfig.rifa.sistemaPremios.presorteo = datos.datos || [];
                console.log('[Premios] ✅ Presorteo actualizado en config:', datos.datos);
            }
            
            const sistemaPremiosActualizado = window.rifaplusConfig.rifa?.sistemaPremios;
            if (sistemaPremiosActualizado) {
                renderizarSistemaPremios(sistemaPremiosActualizado);
                console.log('[Premios] ✅ UI re-renderizada');
            }
        });

        // 🔔 Escuchar cuando Ruletazos es actualizado
        window.rifaplusConfig.escucharEvento('ruletazosActualizado', (datos) => {
            console.log('[Premios] 🔔 Evento ruletazosActualizado recibido:', datos);
            
            // Actualizar config local PRIMERO
            if (window.rifaplusConfig?.rifa?.sistemaPremios) {
                window.rifaplusConfig.rifa.sistemaPremios.ruletazos = datos.datos || [];
                console.log('[Premios] ✅ Ruletazos actualizado en config:', datos.datos);
            }
            
            const sistemaPremiosActualizado = window.rifaplusConfig.rifa?.sistemaPremios;
            if (sistemaPremiosActualizado) {
                renderizarSistemaPremios(sistemaPremiosActualizado);
                console.log('[Premios] ✅ UI re-renderizada');
            }
        });

        console.log('[Premios] ✅ Escuchador de eventos registrado');
    }
}

/**
 * Renderiza el sistema de premios
 */
function renderizarSistemaPremios(sistemaPremios) {
    console.log('[Premios] sistemaPremios:', sistemaPremios);

    // Validar que premios esté habilitado
    if (!sistemaPremios || !sistemaPremios.enabled) {
        console.log('ℹ️  [Premios] Sistema de premios deshabilitado');
        const seccion = document.getElementById('sistema-premios');
        if (seccion) seccion.style.display = 'none';
        return;
    }

    console.log('✅ [Premios] Inicializando sistema de premios...');
    console.log('📊 [Premios] Config:', sistemaPremios);

    try {
        // Renderizar subtitulo con un copy mas claro y consistente
        const mensajeEl = document.getElementById('premios-mensaje');
        if (mensajeEl) {
            mensajeEl.textContent = 'Con tu boleto liquidado participas por:';
        }

        // PREMIOS DEL SORTEO
        if (sistemaPremios.sorteo && sistemaPremios.sorteo.length > 0) {
            renderizarPremios(
                sistemaPremios.sorteo,
                'premios-sorteo-grid',
                'premios-sorteo-container'
            );
        } else {
            ocultarCategoria('premios-sorteo-container');
        }

        // PREMIOS DE PRESORTEO
        if (sistemaPremios.presorteo && sistemaPremios.presorteo.length > 0) {
            renderizarPremios(
                sistemaPremios.presorteo,
                'premios-presorteo-grid',
                'premios-presorteo-container'
            );
        } else {
            ocultarCategoria('premios-presorteo-container');
        }

        // PREMIOS DE RULETAZOS
        if (sistemaPremios.ruletazos && Array.isArray(sistemaPremios.ruletazos) && sistemaPremios.ruletazos.length > 0) {
            renderizarRuletazos(sistemaPremios.ruletazos);
        } else {
            ocultarCategoria('premios-ruletazos-container');
        }

        console.log('✅ [Premios] Sistema de premios renderizado correctamente');

    } catch (error) {
        console.error('❌ [Premios] Error al renderizar premios:', error);
    }
}

function construirResumenPremios(sistemaPremios) {
    const tieneSorteo = Array.isArray(sistemaPremios?.sorteo) && sistemaPremios.sorteo.length > 0;
    const tienePresorteo = Array.isArray(sistemaPremios?.presorteo) && sistemaPremios.presorteo.length > 0;
    const tieneRuletazos = Array.isArray(sistemaPremios?.ruletazos) && sistemaPremios.ruletazos.length > 0;

    if (tieneSorteo && tienePresorteo && tieneRuletazos) {
        return 'Premios confirmados del sorteo, presorteo y dinamicas activas.';
    }

    if (tieneSorteo && tienePresorteo) {
        return 'Premios confirmados del sorteo principal y del presorteo.';
    }

    if (tieneSorteo && tieneRuletazos) {
        return 'Premios confirmados del sorteo y de las dinamicas activas.';
    }

    if (tienePresorteo && tieneRuletazos) {
        return 'Premios confirmados del presorteo y de las dinamicas activas.';
    }

    if (tieneSorteo) {
        return 'Premios confirmados del sorteo principal.';
    }

    if (tienePresorteo) {
        return 'Premios confirmados del presorteo.';
    }

    if (tieneRuletazos) {
        return 'Dinamicas activas con premio confirmado.';
    }

    return 'Premios confirmados de esta edicion.';
}

/**
 * Renderiza un array de premios en una tarjeta HTML
 * @param {Array} premios - Array de objetos premio
 * @param {string} gridId - ID del contenedor grid
 * @param {string} containerId - ID del contenedor de categoría
 */
function renderizarPremios(premios, gridId, containerId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    // Limpiar contenedor
    grid.innerHTML = '';

    // Crear tarjeta para cada premio
    premios.forEach((premio, index) => {
        const tarjeta = crearTarjetaPremio(premio);
        grid.appendChild(tarjeta);
    });

    // Mostrar contenedor
    const container = document.getElementById(containerId);
    if (container) container.style.display = 'block';
}

/**
 * Crea una tarjeta de premio individual
 * @param {Object} premio - Objeto con datos del premio
 * @returns {HTMLElement} Elemento de tarjeta
 */
function crearTarjetaPremio(premio) {
    const card = document.createElement('div');
    card.className = 'premio-card';

    // Agregar clase especial según posición
    if (premio.posicion === 2) card.classList.add('segundo');
    if (premio.posicion === 3) card.classList.add('tercero');

    // Limpiar nombre de emojis
    const nombreLimpio = premio.nombre.replace(/[\p{Emoji}]/gu, '').trim();

    const html = `
        <div class="premio-badge ${premio.posicion > 1 ? (premio.posicion === 2 ? 'segundo' : 'tercero') : ''}">
            ${nombreLimpio}
        </div>
        <div class="premio-content">
            <div class="premio-icono">${premio.icono || ''}</div>
            <h4 class="premio-descripcion">${premio.premio}</h4>
            <p class="premio-texto">${premio.descripcion || ''}</p>
        </div>
    `;

    card.innerHTML = html;
    return card;
}

/**
 * Renderiza la sección de ruletazos
 * @param {Object} ruletazos - Objeto con datos de ruletazos
 */
function renderizarRuletazos(ruletazosArray) {
    const gridEl = document.getElementById('premios-ruletazos-grid');
    const containerEl = document.getElementById('premios-ruletazos-container');

    if (!gridEl || !containerEl) return;

    // Limpiar contenedor
    gridEl.innerHTML = '';

    // En index público se muestra una sola card resumen con la cantidad total de ruletazos configurados.
    if (Array.isArray(ruletazosArray) && ruletazosArray.length > 0) {
        const card = crearTarjetaResumenRuletazos(ruletazosArray);
        gridEl.appendChild(card);
    }

    containerEl.style.display = 'block';
}

/**
 * Crea una tarjeta resumen para ruletazos en el index público
 * @param {Array} ruletazosArray - Array de ruletazos configurados
 * @returns {HTMLElement} Elemento de tarjeta
 */
function crearTarjetaResumenRuletazos(ruletazosArray) {
    const card = document.createElement('div');
    card.className = 'premio-card';
    const cantidad = Array.isArray(ruletazosArray) ? ruletazosArray.length : 0;
    const textoCantidad = `${cantidad} ruletazo${cantidad === 1 ? '' : 's'}`;
    const primerRuletazo = ruletazosArray[0] || {};
    const premioConfigurado = (primerRuletazo.premio || '').trim();
    const descripcionConfigurada = (primerRuletazo.descripcion || '').trim();

    const html = `
        <div class="premio-badge">
            ${textoCantidad}
        </div>
        <div class="premio-content">
            <div class="premio-icono">${primerRuletazo.icono || '🎰'}</div>
            <h4 class="premio-descripcion">${premioConfigurado || textoCantidad}</h4>
            <p class="premio-texto">${descripcionConfigurada || ''}</p>
        </div>
    `;

    card.innerHTML = html;
    return card;
}

/**
 * Oculta una categoría de premios
 * @param {string} containerId - ID del contenedor
 */
function ocultarCategoria(containerId) {
    const container = document.getElementById(containerId);
    if (container) container.style.display = 'none';
}

/**
 * Actualizar premios dinámicamente (para cambios en tiempo real)
 * Uso: actualizarPremios(nuevoConfig)
 */
window.actualizarPremios = function(nuevoConfig) {
    console.log('🔄 [Premios] Actualizando premios...');
    
    if (nuevoConfig && nuevoConfig.sistemaPremios) {
        window.rifaplusConfig.rifa.sistemaPremios = nuevoConfig.sistemaPremios;
        // Reinicializar
        inicializarSistemaPremios();
    }
};
