/* ================================================================ */
/* ARCHIVO: admin-layout.js                                         */
/* DESCRIPCIÓN: Lógica compartida para todas las páginas admin      */
/*              - Gestión de autenticación                          */
/*              - Menú lateral                                      */
/*              - Navegación entre páginas                          */
/* ================================================================ */

document.documentElement.classList.add('admin-auth-checking');

function debugAdminLayout() {
    let enabled = window.RIFAPLUS_DEBUG_ADMIN === true;

    if (!enabled) {
        try {
            enabled = localStorage.getItem('rifaplus_debug_admin') === 'true';
        } catch (error) {
            enabled = false;
        }
    }

    if (enabled && typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('[AdminLayout]', ...arguments);
    }
}

const ADMIN_LAYOUT = {
    tokenKey: 'rifaplus_admin_token',
    get apiUrl() {
        return window.rifaplusConfig?.backend?.apiBase
            || window.rifaplusConfig?.obtenerApiBase?.()
            || window.location.origin;
    },
    authPromise: null,

    get fallbackLogo() {
        return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 96'%3E%3Crect width='240' height='96' rx='20' fill='%230b2235'/%3E%3Ctext x='120' y='58' font-size='34' text-anchor='middle' fill='%23ffffff' font-family='Arial,sans-serif'%3ESorteo%3C/text%3E%3C/svg%3E";
    },

    normalizarMarcaAdmin(valor) {
        const texto = String(valor || '').trim();
        if (!texto) return '';
        if (/^aqu[ií]\s+va\b/i.test(texto)) return '';

        return texto
            .replace(/^sorteos?\s+/i, '')
            .replace(/\s+-\s+admin$/i, '')
            .trim();
    },

    obtenerMarcaAdmin(config) {
        const candidatos = [
            config?.cliente?.id,
            config?.cliente?.nombre,
            config?.cliente?.eslogan,
            'SaDev'
        ];

        for (const candidato of candidatos) {
            const marca = this.normalizarMarcaAdmin(candidato);
            if (marca) {
                return marca;
            }
        }

        return 'SaDev';
    },

    esPaginaLoginAdmin() {
        const rawPath = window.location.pathname || '';
        const paginaActual = rawPath.split('/').pop() || 'admin-dashboard.html';
        const paginaNormalizada = String(paginaActual).trim().toLowerCase();

        return paginaNormalizada === 'admin-dashboard.html'
            || paginaNormalizada === 'admin-dashboard';
    },
    
    /**
     * Inicializar el layout del admin
     * Debe llamarse en el evento load de cada página
     */
    init() {
        // Verificar token
        this.authPromise = this.verificarAutenticacion();
        
        // Configurar logo
        this.configurarLogo();
        
        // Configurar botón logout
        this.configurarLogout();
        
        // Configurar menú sidebar
        this.configurarSidebar();
        
        // Establecer página activa en el menú
        this.establecerPaginaActiva();
        
        // ✅ ESCUCHAR cambios de configuración para actualizar header dinámicamente
        this.escucharCambiosConfig();
    },
    
    /**
     * Escuchar cambios de configuración y actualizar header automáticamente
     * Previene conflictos cuando config se sincroniza múltiples veces
     */
    escucharCambiosConfig() {
        // Escuchar evento de config actualizada
        window.addEventListener('configuracionActualizada', () => {
            debugAdminLayout('configuracionActualizada detectado; reconfigurando header');
            this.configurarLogo();
        });
        
        // También escuchar a través del sistema de listeners de rifaplusConfig
        if (window.rifaplusConfig && typeof window.rifaplusConfig.escucharEvento === 'function') {
            window.rifaplusConfig.escucharEvento('configuracionActualizada', () => {
                debugAdminLayout('configuracionActualizada interno detectado; reconfigurando header');
                this.configurarLogo();
            });
        }
    },
    
    /**
     * Verificar que el usuario esté autenticado
     * Si no, redirigir al dashboard solo si estamos en una página que NO es admin-dashboard.html
     */
    async verificarAutenticacion() {
        // Buscar token de múltiples fuentes para garantizar consistencia
        const token = localStorage.getItem('rifaplus_token') || 
                     localStorage.getItem('rifaplus_admin_token') ||
                     localStorage.getItem('admin_token') ||
                     localStorage.getItem('token');
        
        const paginaActual = window.location.pathname.split('/').pop() || 'admin-dashboard.html';
        const esPaginaLogin = this.esPaginaLoginAdmin();
        
        // Si hay token, asegurar que está en todas las claves
        if (token) {
            localStorage.setItem('rifaplus_token', token);
            localStorage.setItem('rifaplus_admin_token', token);
        }
        
        // Si no hay token y NO estamos en admin-dashboard, redirigir
        if (!token && !esPaginaLogin) {
            console.warn('⚠️  [AdminLayout] Sin token, redirigiendo al login...');
            localStorage.setItem('redirectAfterLogin', paginaActual);
            this.finalizarChequeoVisual();
            window.location.href = 'admin-dashboard.html';
            return false;
        }

        if (!token) {
            this.finalizarChequeoVisual();
            return false;
        }

        try {
            const response = await fetch(`${this.apiUrl}/api/admin/verify-token`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error(`Token inválido (${response.status})`);
            }

            return token;
        } catch (error) {
            console.warn('⚠️  [AdminLayout] Token no válido o no verificable:', error.message);
            localStorage.removeItem(this.tokenKey);
            localStorage.removeItem('rifaplus_token');
            localStorage.removeItem('admin_token');
            localStorage.removeItem('token');

            if (!esPaginaLogin) {
                localStorage.setItem('redirectAfterLogin', paginaActual);
                this.finalizarChequeoVisual();
                window.location.href = 'admin-dashboard.html';
                return false;
            }

            return false;
        } finally {
            this.finalizarChequeoVisual();
        }
    },

    async esperarAutenticacion() {
        if (!this.authPromise) {
            this.authPromise = this.verificarAutenticacion();
        }
        return this.authPromise;
    },

    finalizarChequeoVisual() {
        document.documentElement.classList.remove('admin-auth-checking');
    },
    
    /**
     * Configurar el logo y título del header
     */
    configurarLogo() {
        const config = window.rifaplusConfig || {};
        const nombreCliente = String(config.cliente?.nombre || '').trim() || 'Sorteo';
        const marcaAdmin = this.obtenerMarcaAdmin(config);
        const logoCliente = config.cliente?.logo || config.cliente?.logotipo || this.fallbackLogo;
        
        debugAdminLayout('Actualizando header admin', {
            nombreClienteAUsar: nombreCliente,
            nombreSorteoEnConfig: config.rifa?.nombreSorteo || '(vacio)',
            cliente: {
                nombre: config.cliente?.nombre,
                eslogan: config.cliente?.eslogan,
                id: config.cliente?.id
            }
        });
        
        // Buscar elementos del header
        const logoImg = document.querySelector('.admin-logo-container img');
        const titleSub = document.querySelector('.admin-header-title-sub');
        
        if (logoImg) {
            logoImg.src = logoCliente;
        }
        
        if (titleSub) {
            titleSub.textContent = nombreCliente;
        }

        const loginTitle = document.getElementById('loginTitle');
        if (loginTitle) {
            loginTitle.textContent = `Panel Admin - ${marcaAdmin}`;
        }

        const loginLogo = document.getElementById('loginLogo');
        if (loginLogo) {
            loginLogo.src = logoCliente;
            loginLogo.alt = `Logo de ${nombreCliente}`;
        }

        const dashboardLogo = document.getElementById('dashboardLogo');
        if (dashboardLogo) {
            dashboardLogo.src = logoCliente;
            dashboardLogo.alt = `Logo de ${nombreCliente}`;
        }

        this.configurarMetadatosBranding(marcaAdmin, logoCliente, nombreCliente);
    },

    configurarMetadatosBranding(marcaAdmin, logoCliente, nombreCliente) {
        document.title = `Panel Admin - ${marcaAdmin}`;

        document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="preload"][as="image"]').forEach((link) => {
            link.href = logoCliente;
        });

        const logoHeader = document.querySelector('.admin-logo-img');
        if (logoHeader) {
            logoHeader.src = logoCliente;
            logoHeader.alt = `Logo de ${nombreCliente}`;
        }
    },
    
    /**
     * Configurar el botón de logout
     */
    configurarLogout() {
        const logoutBtn = document.querySelector('.admin-logout-btn');
        
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }
    },
    
    /**
     * Cerrar sesión
     */
    logout() {
        if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
            // Limpiar nombre antes de borrar el token
            const nombreDisplay = document.getElementById('userDisplayName');
            const rolDisplay = document.getElementById('userDisplayRole');
            if (nombreDisplay) nombreDisplay.textContent = '-';
            if (rolDisplay) rolDisplay.textContent = '-';
            
            localStorage.removeItem(this.tokenKey);
            localStorage.removeItem('rifaplus_token');
            localStorage.removeItem('admin_token');
            localStorage.removeItem('token');
            window.location.href = 'admin-dashboard.html';
        }
    },
    
    /**
     * Configurar el menú sidebar
     */
    configurarSidebar() {
        const toggleBtn = document.querySelector('.admin-sidebar-toggle');
        const sidebar = document.querySelector('.admin-sidebar');
        const mainContent = document.querySelector('.admin-main');
        const navBtns = document.querySelectorAll('.admin-nav-btn');
        let overlayMenu = document.getElementById('overlayMenu');
        let overlayClose = document.getElementById('overlayClose');

        if (toggleBtn) {
            const headerContent = document.querySelector('.admin-header-content');
            if (headerContent && toggleBtn.parentElement !== headerContent) {
                headerContent.prepend(toggleBtn);
            }

            toggleBtn.classList.add('hamburger');
            toggleBtn.setAttribute('aria-label', 'Abrir menú');
            toggleBtn.setAttribute('aria-expanded', 'false');

            if (!toggleBtn.querySelector('.hamburger-box')) {
                toggleBtn.innerHTML = `
                    <span class="hamburger-box">
                        <span class="hamburger-inner"></span>
                    </span>
                `;
            }
        }

        if (!overlayMenu) {
            const linksHtml = Array.from(navBtns).map((btn) => {
                const href = btn.getAttribute('href') || '#';
                const label = btn.querySelector('span')?.textContent?.trim() || btn.textContent.trim() || 'Sección';
                return `<a href="${href}" class="overlay-link">${label}</a>`;
            }).join('');

            document.body.insertAdjacentHTML('beforeend', `
                <div class="overlay-menu admin-overlay-menu" id="overlayMenu" inert>
                    <div class="overlay-inner">
                        <button class="overlay-close" id="overlayClose" aria-label="Cerrar menú">×</button>
                        ${linksHtml}
                    </div>
                </div>
            `);

            overlayMenu = document.getElementById('overlayMenu');
            overlayClose = document.getElementById('overlayClose');
        }

        const toggleInner = toggleBtn?.querySelector('.hamburger-inner');

        const abrirOverlay = () => {
            overlayMenu?.classList.add('show');
            overlayMenu?.removeAttribute('inert');
            toggleBtn?.classList.add('is-active');
            toggleBtn?.setAttribute('aria-expanded', 'true');
            document.body.classList.add('admin-sidebar-open');

            if (toggleInner) {
                toggleInner.style.transform = 'rotate(45deg)';
                toggleInner.style.backgroundColor = 'var(--primary-light)';
            }
        };

        const cerrarOverlay = () => {
            overlayMenu?.classList.remove('show');
            overlayMenu?.setAttribute('inert', '');
            toggleBtn?.classList.remove('is-active');
            toggleBtn?.setAttribute('aria-expanded', 'false');
            document.body.classList.remove('admin-sidebar-open');

            if (toggleInner) {
                toggleInner.style.transform = 'rotate(0)';
                toggleInner.style.backgroundColor = 'white';
            }
        };
        
        // Toggle button (móvil)
        if (toggleBtn && overlayMenu) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const estaAbierto = overlayMenu.classList.contains('show');
                if (estaAbierto) {
                    cerrarOverlay();
                } else {
                    abrirOverlay();
                }
            });
            
            const enlacesOverlay = overlayMenu.querySelectorAll('.overlay-link');
            enlacesOverlay.forEach(btn => {
                btn.addEventListener('click', () => {
                    cerrarOverlay();
                });
            });

            if (overlayClose) {
                overlayClose.addEventListener('click', cerrarOverlay);
            }

            overlayMenu.addEventListener('click', (e) => {
                if (e.target === overlayMenu) {
                    cerrarOverlay();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && overlayMenu.classList.contains('show')) {
                    cerrarOverlay();
                }
            });
        }
        
        // Toggle de collapse (desktop)
        const collapseBtn = document.querySelector('.admin-sidebar-collapse-btn');
        if (collapseBtn && sidebar && mainContent) {
            collapseBtn.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
                mainContent.classList.toggle('sidebar-collapsed');
                
                // Guardar preferencia
                const isCollapsed = sidebar.classList.contains('collapsed');
                localStorage.setItem('admin-sidebar-collapsed', isCollapsed ? 'true' : 'false');
            });
            
            // Restaurar preferencia guardada
            const wasCollapsed = localStorage.getItem('admin-sidebar-collapsed') === 'true';
            if (wasCollapsed) {
                sidebar.classList.add('collapsed');
                mainContent.classList.add('sidebar-collapsed');
            }
        }
    },
    
    /**
     * Establecer la página actual como activa en el menú
     */
    establecerPaginaActiva() {
        const paginaActual = window.location.pathname.split('/').pop() || 'admin-dashboard.html';
        const navBtns = document.querySelectorAll('.admin-nav-btn');
        
        navBtns.forEach(btn => {
            const href = btn.getAttribute('href');
            if (href === paginaActual || (paginaActual === '' && href === 'admin-dashboard.html')) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    },
    
    /**
     * Obtener el token de autenticación
     */
    getToken() {
        return localStorage.getItem(this.tokenKey);
    },
    
    /**
     * Hacer una petición autenticada al API
     */
    async fetchAutenticado(url, opciones = {}) {
        const token = this.getToken();
        
        if (!token) {
            throw new Error('No hay token de autenticación');
        }
        
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...opciones.headers
        };
        
        const response = await fetch(url, {
            ...opciones,
            headers
        });
        
        // Si recibimos 401, significa que el token expiró
        if (response.status === 401) {
            console.warn('[AdminLayout] Token expirado; cerrando sesion');
            this.logout();
            return;
        }
        
        return response;
    }
};

// Inicializar cuando el DOM está listo
document.addEventListener('DOMContentLoaded', () => {
    ADMIN_LAYOUT.init();
});
