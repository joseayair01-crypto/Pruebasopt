/**
 * ============================================================
 * ARCHIVO: js/config.js
 * DESCRIPCIÓN: Configuración global de RifaPlus
 * Gestiona cliente, rifa, backend y estado dinámico
 * ÚLTIMA ACTUALIZACIÓN: 2025
 * ============================================================
 * 
 * ⚠️  IMPORTANTE PARA CAMBIAR DE SORTEO:
 * 
 * Para adaptar esta web a otro sorteo, SOLO edita la sección
 * "PERSONALIZACIÓN POR SORTEO" (sección 2: rifa y sorteoActivo)
 * 
 * El resto es código de sistema - NO toques nada más.
 * ============================================================
 */

// Crear namespace global de configuración (evitar conflictos)
window.rifaplusConfig = window.rifaplusConfig || {};

// Versión de configuración (incrementar cuando hagas cambios en sección 2)
window.rifaplusConfig._VERSION = '2.0.0';  // v2.0.0 = Sistema robusto con validación y limpieza automática

// Mezclar configuración por defecto sin sobrescribir la existente
Object.assign(window.rifaplusConfig, {
    /* ============================================================ */
    /* SECCIÓN 1: CONFIGURACIÓN DEL CLIENTE                         */
    /* ============================================================ */

    /**
     * Datos de la organización que ejecuta la rifa
     * Incluye identidad visual, contacto y redes sociales
     */
    cliente: {
        id: "Sorteos_El_Trebol",
        nombre: "SORTEOS EL TREBOL",
        eslogan: "La suerte siempre de nuestro lado",
        logo: "images/logo.png",
        imagenPrincipal: "images/ImgPrincipal.png",
        nombreSorteo: "2da Edicion RAM 700 2025",
        colorPrimario: "#080808ff",
        colorSecundario: "#000000ff", 
        telefono: "459 115 3960",
        email: "ayairlp12@gmail.com",
        anioActual: 2025,
        redesSociales: {
            facebook: "https://www.facebook.com/profile.php?id=100008315310869&locale=es_LA",
            facebookUsuario: "Ayair LP",
            instagram: "https://www.instagram.com/joseayair",
            instagramUsuario: "@joseayair",
            whatsapp: "+524591153960",
            canalWhatsapp: "https://whatsapp.com/channel/0029Va9THY5JrwIwhpTezL0f",
            canalWhatsappNombre: "Sorteos Yepe"
        },
        
        /**
         * Getter dinámico: genera prefijo de orden automáticamente
         * Toma la primera letra de cada palabra del nombre del cliente
         * Ej: "SORTEOS EL TREBOL" → "SET"
         * Ej: "Rifas El Trebol" → "RET"
         * Se recalcula automáticamente cada vez que se accede
         */
        get prefijoOrden() {
            const nombre = this.nombre || 'ORDEN';
            const palabras = nombre.split(/\s+/).filter(p => p.trim().length > 0);
            const prefijo = palabras.map(p => p.charAt(0).toUpperCase()).join('');
            return prefijo.length > 0 ? prefijo : 'ORD';
        }
    },

    /* ============================================================ */
    /* SECCIÓN 1B: PALETA DE COLORES (PROFESIONAL)                 */
    /* ============================================================ */

    /**
     * Sistema de colores completamente configurable
     * Edita esta sección para cambiar el tema completo del sitio
     * Se aplica automáticamente a todos los elementos
     */
    tema: {
        // Colores principales - PALETA PROFESIONAL MODERNA
        // Azul oscuro elegante + Teal brillante + Blanco minimalista
        colores: {
            // Primario: botones, headers, acentos principales
            primary: "#0f172a",         // Azul oscuro elegante - headers, botones
            primaryDark: "#051425",     // Azul oscuro aún más profundo - sombras
            primaryLight: "#06b6d4",    // Teal brillante - acentos, highlights
            
            // Secundario: acentos, highlights
            secondary: "#06b6d4",       // Teal - botones secundarios, acciones
            secondaryDark: "#0891b2",   // Teal más oscuro (hover)
            
            // Estados generales
            success: "#10b981",         // Verde suave pero visible
            successDark: "#059669",     // Verde más oscuro
            danger: "#ef4444",          // Rojo suave pero visible
            dangerDark: "#dc2626",      // Rojo más oscuro
            
            // Estados de boletos
            disponible: "#f8fafc",      // Gris ultra claro
            seleccionado: "#06b6d4",    // Teal
            apartado: "#06b6d4",        // Teal
            vendido: "#0f172a",         // Azul oscuro
            
            // Texto
            textDark: "#1f2937",        // Gris oscuro - texto principal
            textLight: "#6b7280",       // Gris medio - texto secundario
            
            // Fondos
            bgLight: "#f8fafc",         // Gris ultra claro - minimalista
            bgWhite: "#FFFFFF",         // Blanco puro
            
            // Bordes
            borderColor: "#e5e7eb",     // Gris ultra claro
            grayLight: "#f3f4f6",       // Gris claro
            grayMedium: "#d1d5db"       // Gris medio
        }
    },

    /* ============================================================ */
    /* SECCIÓN 2: CONFIGURACIÓN DE LA RIFA ACTUAL                   */
    /* ============================================================ */

    /**
     * ⚠️  IMPORTANTE - PARA CAMBIAR A OTRO SORTEO:
     * 
     * Edita SOLO los valores de esta sección (rifa y sorteoActivo abajo)
     * NO toques el código de inicialización ni funciones
     * 
     * Cada campo que cambies aquí se reflejará automáticamente en toda la web
     * Fecha → countdown, modal, validaciones
     * Precio → carrito, órdenes
     * etc.
     * 
     * Cambios frecuentes:
     * - fechaSorteo (línea ~124)
     * - fechaSorteoFormato (línea ~125)
     * - totalBoletos (línea ~128)
     * - precioBoleto (línea ~129)
     * - titulo, descripcion, premios
     * - ganadores (cuántos ganadores habrá)
     * 
     * NO cambies:
     * - Código de inicialización
     * - Funciones de config.js
     * - Lógica del backend
     * 
     * ============================================================
     * 
     * Información del sorteo que se está realizando
     * Incluye premio, fechas, precios y promociones
     */
    rifa: {
        titulo: "RAM 700 2025 - 2da Edición de Rifas el Trebol",
        descripcion: "Llevatela este 6 de enero, completamente nueva 0 kilometros",
        premios: [
            {
                nombre: "RAM 700 2025",
                descripcion: "RAM 700 2025 - COLOR NEGRO BRILLANTE LA MAS EQUIPADA",
                imagenes: [
                    "images/ImgPrincipal.png",
                    "images/frontal.jpg",
                    "images/lateral.jpg" 
                ]
            }
        ],
        fechaSorteo: "2026-01-06T20:00:00-06:00",
        fechaSorteoFormato: "06 de Enero del 2026",
        horaSorteo: "8:00 PM",
        zonaHoraria: "Hora Centro México",
        modalidadSorteo: "Transmisión en Vivo por Facebook",
        totalBoletos: 60000,
        precioBoleto: 15,
        
        // ===== CONFIGURACIÓN DE EXPIRACIÓN DE ÓRDENES =====
        // ⚠️  IMPORTANTE: Estos valores se usan en:
        // - Frontend: para mostrar avisos al cliente
        // - Backend: para la limpieza automática de órdenes
        
        // Tiempo que una orden permanece apartada sin comprobante de pago (en HORAS)
        // Después de este tiempo, los boletos se liberan automáticamente
        // ⚠️  CAMBIAR AQUÍ para modificar el tiempo de expiración (4, 12, 24, etc.)
        tiempoApartadoHoras: 4,  // 4 horas por defecto
        
        // Mostrar advertencia al cliente X horas antes de expirar
        advertenciaExpirationHoras: 1,  // Avisar 1 hora antes de expirar
        
        // Intervalo en que el backend verifica órdenes expiradas (en MINUTOS)
        // Más pequeño = verificación más frecuente pero más carga en BD
        // Recomendado: 5-10 minutos
        intervaloLimpiezaMinutos: 1,  // Cada 1 minuto (TEST - verifica frecuentemente)
        
        // Máximo de boletos que pueden estar apartados sin pago
        // (por si necesitas un límite diferente al total)
        maxBoletosApartadosSinPago: null,  // null = sin límite
        
        // Rangos de 2,000 boletos cada uno
        rangos: [
            { id: 'A', nombre: '00001-20,000', inicio: 1, fin: 20000 },
            { id: 'B', nombre: '20,001-40000', inicio: 20001, fin: 40000 },
            { id: 'C', nombre: '40,001-60,000', inicio: 40001, fin: 60000 }
        ],
        
        promociones: [
            { cantidad: 10, precio: 130, ahorro: 20 },
            { cantidad: 20, precio: 250, ahorro: 50 }
        ],

        // ===== CONFIGURACIÓN DE BONOS =====
        // Habilita/deshabilita la sección de bonos y define los bonos disponibles
        bonos: {
            enabled: true,  // true para mostrar sección, false para ocultar
            items: [
                {
                    numero: 1,
                    titulo: "Compra 20+ boletos",
                    descripcion: "Si compras más de 20 boletos y resultas ganador, ¡te llevas el tanque lleno!",
                    icono: "🏎️",
                    color: "success"
                },
                {
                    numero: 2,
                    titulo: "Primera hora de apartado",
                    descripcion: "Si compras más de 20 boletos y realizas tu pago en la primera hora de apartado, ¡te llevas $5,000 extras!",
                    icono: "⏰",
                    color: "warning"
                },
                {
                    numero: 3,
                    titulo: "Síguenos en WhatsApp",
                    descripcion: "Si nos sigues en nuestro canal de WhatsApp, ¡te llevas otros $5,000 extras!",
                    icono: "💬",
                    color: "info",
                    accion: "unirseWhatsapp"  // Botón especial para unirse
                },
                {
                    numero: 4,
                    titulo: "Compra 50+ boletos",
                    descripcion: "Si compras más de 50 boletos y resultas ganador, además de todos los bonos anteriores, ¡te lo llevamos a domicilio!",
                    icono: "🚚",
                    color: "primary"
                }
            ]
        },

        // ===== CONFIGURACIÓN DE GANADORES =====
        // Define cuántos ganadores habrá de cada tipo
        // Si alguno es 0, ese tipo no aparecerá
        // Ejemplos:
        // - Solo sorteo: {sorteo: 1, presorteo: 0, ruletazos: 0}
        // - 3 lugares: {sorteo: 3, presorteo: 0, ruletazos: 0}
        // - Con presorteos: {sorteo: 3, presorteo: 5, ruletazos: 0}
        // - Completo: {sorteo: 3, presorteo: 5, ruletazos: 2}
        ganadores: {
            sorteo: 1,           // Ganador principal, 2do y 3er lugar (0 para deshabilitar)
            presorteo: 0,        // Ganadores de presorteos/rifas previas (0 para deshabilitar)
            ruletazos: 5         // Ganadores de ruletazos (0 para deshabilitar)
        },

        // Información del sorteo (configurable, aparece en tarjetas)
        infoRifa: [
            {
                icono: '🗓️',
                titulo: 'Fecha del Sorteo',
                contenido: 'dinamico-fecha'
            },
            {
                icono: '⏰',
                titulo: 'Hora',
                contenido: 'dinamico-hora'
            },
            {
                icono: '📍',
                titulo: 'Modalidad',
                contenido: 'dinamico-modalidad'
            },
            {
                icono: '🎯',
                titulo: 'Total de Boletos',
                contenido: 'dinamico-boletos'
            }
        ]
    },

    /* ============================================================ */
    /* SECCIÓN 2B: CONFIGURACIÓN DEL SORTEO FINALIZADO              */
    /* ============================================================ */
    
    /**
     * Estado del sorteo actual
     * IMPORTANTE: Cambiar 'estado' a 'finalizado' cuando el sorteo termine
     * Esto activará el modal de cierre automáticamente
     */
    sorteoActivo: {
        estado: 'activo', // 'activo' | 'proximo' | 'finalizado'
        id: 'sorteo_001',
        nombre: 'RAM 700 2025',
        fechaCierre: new Date('2026-01-06T20:00:00'),
        fechaCierreFormato: 'martes, 6 de enero, 2026 - 8:00 p.m.',
        
        /**
         * Ganadores del sorteo
         * Se llenan cuando el sorteo finaliza
         * Estructura: posicion (1, 2, 3...) → premio → orden → ganador
         */
        ganadores: {
            principal: [],
            presorte: [],
            ruletazo: []
        },
        
        /**
         * Estadísticas del sorteo
         */
        estadisticas: {
            totalBoletos: 100000,
            totalVendidos: 98542,
            participantes: 12847,
            recaudacion: 4927100,
            proximoSorteo: new Date('2026-01-31T20:00:00')
        },
        
        /**
         * Documentos del sorteo
         */
        documentos: {
            actaURL: null,
            videoURL: null,
            certificado: 'Verificado por notario público'
        },
        
        /**
         * Mensaje de agradecimiento personalizado
         */
        mensajeAgradecimiento: '¡Agradecemos tu participación en nuestro sorteo! Tu confianza es lo más importante para nosotros. Esperamos contar contigo en nuestro próximo sorteo.'
    },

    /**
     * Flag para habilitar/deshabilitar compras
     * Se actualiza automáticamente cuando sorteo finaliza
     */
    permitirCompras: true,

    /* ============================================================ */
    /* SECCIÓN 3: CONFIGURACIÓN DEL BACKEND                         */
    /* ============================================================ */

    /**
     * URLs y endpoints del servidor API
     * Contiene conexión a backend y rutas disponibles
     * Auto-detecta el puerto correcto
     */
    backend: {
        // Puerto del backend - cambiar si necesario
        // NOTA: El backend por defecto corre en puerto 5001
        // Si lo moviste a otro puerto, cambia AQUÍ
        puerto: 5001,
        
        // Auto-detectar API base
        get apiBase() {
            // En localhost/127.0.0.1 → usar local
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                return `http://127.0.0.1:${this.puerto}`;
            }
            // En producción (Netlify) → usar Render
            return 'https://rifas-web-1.onrender.com';
        },
        endpoints: {
            ordenes: '/api/ordenes',
            boletos: '/api/public/boletos',
            stats: '/api/admin/stats',
            login: '/api/admin/login'
        },
        // Configuración pública relacionada al panel admin (sin secretos)
        admin: {
            loginEnabled: true
        }
    },

    /* ============================================================ */
    /* SECCIÓN 4: CONFIGURACIÓN TÉCNICA Y BANCOS                    */
    /* ============================================================ */

    /**
     * Datos técnicos: contactos, cuentas bancarias para pagos
     * Información sensible que se guarda en el servidor
     */
    tecnica: {
        numeroWhatsappOrganizador: '+52 4591153960',
        nombreOrganizador: 'SORTEOS EL TREBOL',
        bankAccounts: [
            {
                id: 1,
                nombreBanco: 'SANTANDER',
                accountNumber: '4456 1267 8989 1156',
                beneficiary: 'Jose Luis Yepez Garcia',
                numero_referencia: 'REF-SANT-001',
                accountType: 'Tarjeta',
                paymentType: 'transferencia',
                phone: '+52 4591153960'
            },
            {
                id: 2,
                nombreBanco: 'BBVA',
                accountNumber: '4589 1290 4589 3210',
                numero_referencia: 'REF-BBVA-001',
                accountType: 'Tarjeta',
                paymentType: 'transferencia',
                beneficiary: 'José Ayair López Pérez',
                phone: '453 1016 8932'
            },
            {
                id: 3,
                nombreBanco: 'OXXO, Farmacias del Ahorro, 7Eleven',
                accountNumber: '4489 4567 0121 89561',
                numero_referencia: 'ID de tu orden de compra',
                beneficiary: 'Pago en efectivo',
                accountType: 'Efectivo',
                paymentType: 'efectivo',
                instructions: 'Numero de cuenta: 4597 2456 0911 6578 Banco: BBVA'
                             
            }
        ]
    },

    /* ============================================================ */
    /* SECCIÓN 6: ESTADO DINÁMICO                                   */
    /* ============================================================ */

    /**
     * Estado actual que se actualiza en tiempo real
     * Sincronizado con datos del backend
     */
    estado: {
        boletosVendidos: 0,
        boletosApartados: 0,
        boletosDisponibles: 500,
        porcentajeVendido: 0,
        ultimaActualizacion: null
    }
});

// Alias legible para compatibilidad: exponer `bankAccounts` en la raíz
Object.defineProperty(window.rifaplusConfig, 'bankAccounts', {
    get: function() {
        return (this.tecnica && Array.isArray(this.tecnica.bankAccounts)) ? this.tecnica.bankAccounts : [];
    },
    set: function(value) {
        // Acepta asignaciones y las redirige al lugar correcto
        if (!this.tecnica) this.tecnica = {};
        this.tecnica.bankAccounts = value;
    },
    enumerable: true,
    configurable: true
});

// ====================================
// MÉTODOS DE CONFIGURACIÓN MEJORADOS
// ====================================
// SINCRONIZACIÓN CON BACKEND
// ====================================

// Flag para evitar múltiples sincronizaciones simultáneas
window.rifaplusConfig._sincronizandoBackend = false;
window.rifaplusConfig._ultimaSincronizacion = 0;

/**
 * Sincroniza la configuración del cliente desde el backend
 * Si el backend no responde, mantiene los valores locales
 * Implementa cooldown y manejo de 429 (Too Many Requests)
 * TIMEOUT REAL con AbortController (no ignora timeout)
 * 
 * NOTA: Esta función es NO-BLOQUEANTE en la inicialización
 * Si falla, el sistema sigue funcionando con config local
 */
window.rifaplusConfig.sincronizarConfigDelBackend = async function() {
    // Evitar sincronizaciones simultáneas
    if (this._sincronizandoBackend) {
        console.debug('⏳ Sincronización ya en progreso, omitiendo...');
        return false;
    }
    
    // Cooldown ESTRICTO: 5 minutos (300s) entre sincronizaciones para evitar 429
    const ahora = Date.now();
    const cooldownMs = 300000; // 5 minutos
    if (this._ultimaSincronizacion && (ahora - this._ultimaSincronizacion < cooldownMs)) {
        const segundosFaltantes = Math.ceil((cooldownMs - (ahora - this._ultimaSincronizacion)) / 1000);
        console.debug(`⏳ Cooldown activo: próxima sincronización en ${segundosFaltantes}s`);
        return false;
    }
    
    let timeoutId = null;
    const controller = new AbortController();
    
    try {
        this._sincronizandoBackend = true;
        const apiBase = this.backend.apiBase;
        
        // 🚨 TIMEOUT REAL: AbortController (no ignora timeout como fetch())
        timeoutId = setTimeout(() => {
            controller.abort();
        }, 5000); // 5 segundos timeout
        
        const response = await fetch(`${apiBase}/api/cliente`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal // ✅ Cancela request si timeout
        });
        
        clearTimeout(timeoutId);
        
        // Manejar específicamente 429 (Too Many Requests)
        if (response.status === 429) {
            console.debug('⏳ Rate limit alcanzado (429). Usar configuración local');
            this._ultimaSincronizacion = ahora;
            return false;
        }
        
        if (!response.ok) {
            console.debug(`ℹ️  Backend no disponible (${response.status}). Usar config local`);
            this._ultimaSincronizacion = ahora;
            return false;
        }
        
        const result = await response.json();
        
        if (result.success && result.data) {
            // Fusionar configuración del backend sin sobrescribir config.js completo
            if (result.data.cliente) {
                // PROTECCIÓN CRÍTICA: No permitir que el backend sobrescriba cliente.nombre
                // El nombre determina el prefijo dinámico de las órdenes
                // Si cambia, todas las órdenes nuevas tendrán un prefijo diferente
                const clienteCopy = Object.assign({}, result.data.cliente);
                
                if (clienteCopy.hasOwnProperty('nombre')) {
                    console.debug('ℹ️ Ignorando cliente.nombre proveniente del backend (se conserva valor local)');
                    delete clienteCopy.nombre;
                }
                
                Object.assign(this.cliente, clienteCopy);
            }
            if (result.data.rifa) {
                // ⚠️ PROTEGER: NUNCA sobrescribir fechaSorteo desde el backend
                // fechaSorteo se define SOLO en js/config.js (Sección 2)
                const fechaSorteoLocal = this.rifa.fechaSorteo;
                const fechaSorteoFormatoLocal = this.rifa.fechaSorteoFormato;

                // PROTECCIÓN ADICIONAL: No permitir que el backend sobrescriba datos
                // del sorteo definidos en js/config.js (Sección 2).
                // El backend puede contener valores por defecto que no deben imponerse.
                // Si el backend incluye `precioBoleto` o `totalBoletos`, los ignoramos
                // y conservamos los valores locales (estos son críticos para el sorteo).
                const rifaCopy = Object.assign({}, result.data.rifa);
                
                if (rifaCopy.hasOwnProperty('precioBoleto')) {
                    console.debug('ℹ️ Ignorando precioBoleto proveniente del backend (se conserva valor local)');
                    delete rifaCopy.precioBoleto;
                }
                
                if (rifaCopy.hasOwnProperty('totalBoletos')) {
                    console.debug('ℹ️ Ignorando totalBoletos proveniente del backend (se conserva valor local)');
                    delete rifaCopy.totalBoletos;
                }
                
                Object.assign(this.rifa, rifaCopy);

                // Restaurar la fecha local
                this.rifa.fechaSorteo = fechaSorteoLocal;
                this.rifa.fechaSorteoFormato = fechaSorteoFormatoLocal;
            }
            if (result.data.cuentas) {
                this.tecnica.bankAccounts = result.data.cuentas;
            }
            
            console.debug('✓ Config sincronizada desde backend (fechaSorteo protegida)');
            this._ultimaSincronizacion = ahora;
            return true;
        }
    } catch (error) {
        // Distinguir entre timeout y otros errores
        if (error.name === 'AbortError') {
            console.debug('⏱️  Timeout en sincronización (5s). Usando config local');
        } else {
            console.debug('ℹ️  Error en sincronización (usando config local):', error.message);
        }
    } finally {
        // Limpiar timeout si still running
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        this._sincronizandoBackend = false;
    }
    
    return false;
};

/**
 * Inicialización completa del sistema
 */
window.rifaplusConfig.inicializar = async function() {
    try {
        // 0. Calcular tiempoMs basado en tiempoApartadoHoras
        if (this.rifa && this.rifa.tiempoApartadoHoras) {
            this.rifa.tiempoApartadoMs = this.rifa.tiempoApartadoHoras * 60 * 60 * 1000;
        }
        
        // 1. Intentar cargar configuración guardada desde localStorage
        this.cargarDelLocal();
        
        // 1.1. VALIDACIÓN CRÍTICA - Verificar integridad del sorteo
        if (!this._validarIntegridadSorteo()) {
            console.error('🚨 Sistema detenido - errores críticos en integridad del sorteo');
            return false;
        }
        
        // 1.5. Sincronizar desde backend EN BACKGROUND (una sola vez al cargar)
        // ✅ HABILITADO: Obtiene config actualizada del servidor (logo, cuentas, etc.)
        // Con cooldown de 5 minutos para evitar rate limiting (429)
        // Delay de 1s para que no múltiples páginas sincronicen al mismo tiempo
        setTimeout(() => {
            this.sincronizarConfigDelBackend().catch(e => {
                console.warn('⚠️  Config local será usada (sin sincronización):', e.message);
            }).finally(() => {
                // Después de intentar sincronizar, inyectar logo (ya sea local o del backend)
                if (typeof window.inyectarLogoDinamico === 'function') {
                    window.inyectarLogoDinamico();
                }
            });
        }, 1000); // Delay de 1s para evitar race condition entre páginas
        
        // 1.75. Sincronizar ganadores desde localStorage (GanadoresManager)
        // Esto trae los ganadores que definió el administrador en admin-boletos.html
        this.sincronizarGanadores();
        
        // 2. Aplicar configuración visual INMEDIATAMENTE
        this.aplicarConfiguracion();
        
        // 3. Sincronizar estado de boletos EN BACKGROUND (no bloqueante)
        this.sincronizarEstadoBackend().catch(e => {
            console.warn('⚠️  Error sincronizando estado:', e.message);
        });
        
        // 4. Iniciar actualizaciones automáticas
        this.iniciarActualizacionesAutomaticas();
        
        console.log('✅ [Config] Sistema inicializado correctamente');
    } catch (error) {
        console.error('Error inicializando configuración:', error);
    }
};

/**
 * Sincroniza estado con el backend
 * OPTIMIZADO: Usa /api/public/boletos/stats para respuesta ULTRA-RÁPIDA (< 50ms)
 * Luego carga full data en background sin bloquear UI
 * 
 * NOTA: Esta función es NO-BLOQUEANTE
 * Si falla, el sistema sigue funcionando con último estado conocido
 */
window.rifaplusConfig.sincronizarEstadoBackend = async function() {
    let timeoutId = null;
    const controller = new AbortController();
    
    try {
        // ⚡ STAGE 1: ULTRA-RÁPIDO - Solo conteos (< 50ms response)
        timeoutId = setTimeout(() => {
            controller.abort();
        }, 2000); // 2 segundos timeout para stats
        
        const statsResponse = await fetch(`${this.backend.apiBase}/api/public/boletos/stats`, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            
            if (statsData.success) {
                // ✅ Actualizar estado INSTANTÁNEAMENTE con conteos
                // Soportar ambos formatos: con y sin wrapper 'data'
                const data = statsData.data || statsData;
                this.estado.boletosVendidos = data.vendidos;
                this.estado.boletosApartados = data.reservados;
                this.estado.boletosDisponibles = data.disponibles;
                this.estado.porcentajeVendido = (this.estado.boletosVendidos / this.rifa.totalBoletos) * 100;
                this.estado.ultimaActualizacion = new Date();
                
                // Emitir evento de actualización INMEDIATAMENTE
                this.emitirEvento('estadoActualizado', this.estado);
                console.debug('✅ Estado actualizado RÁPIDAMENTE desde /stats:', data);
                
                // 🔄 STAGE 2: BACKGROUND - Cargar datos completos sin bloquear
                // Esto es para el grid/ruletazo, pero no detiene el flujo principal
                this._cargarDatosCompletosEnBackground();
            }
        } else if (statsResponse.status === 429) {
            console.debug('⏳ Rate limit en /api/public/boletos/stats (429)');
            return false;
        } else {
            console.debug(`ℹ️  Stats Estado: ${statsResponse.status}`);
            // Fallback: intentar cargar full data
            this._cargarDatosCompletosEnBackground();
        }
        
        return true;
    } catch (error) {
        // Distinguir entre timeout y otros errores
        if (error.name === 'AbortError') {
            console.debug('⏱️  Timeout en /stats (2s). Intentando full data en background');
            this._cargarDatosCompletosEnBackground();
        } else {
            console.debug('ℹ️  Error sincronizando estado:', error.message);
        }
    } finally {
        // Limpiar timeout si still running
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
    
    return false;
};

/**
 * Helper: Carga datos completos en background sin bloquear UI
 * Se ejecuta asincronamente, no importa si toma tiempo
 */
window.rifaplusConfig._cargarDatosCompletosEnBackground = async function() {
    try {
        const respuesta = await fetch(`${this.backend.apiBase}/api/public/boletos`, {
            priority: 'low' // Baja prioridad en navegadores que lo soporten
        });
        
        if (respuesta.ok) {
            const datos = await respuesta.json();
            if (datos.success && datos.data) {
                console.debug('✅ Datos completos cargados en background');
                // Aquí podrían almacenarse en IndexedDB o memoria local
                // para cuando se necesite renderizar grid/ruletazo
            }
        }
    } catch (error) {
        console.debug('ℹ️  Error cargando datos en background (no crítico):', error.message);
    }
};

/**
 * Inicia actualizaciones automáticas del estado
 * Intervalo de 5 minutos para evitar 429 Too Many Requests
 */
window.rifaplusConfig.iniciarActualizacionesAutomaticas = function() {
    // Actualizar cada 300 segundos (5 minutos) para evitar rate limiting
    // Esto permite ~12 actualizaciones/hora por cliente, muy por debajo del límite de 100/15min
    setInterval(() => {
        this.sincronizarEstadoBackend();
    }, 300000);
};

/**
 * Sistema de eventos para comunicación entre componentes
 */
window.rifaplusConfig.eventos = {};
window.rifaplusConfig.escucharEvento = function(evento, callback) {
    if (!this.eventos[evento]) this.eventos[evento] = [];
    this.eventos[evento].push(callback);
};

window.rifaplusConfig.emitirEvento = function(evento, datos) {
    if (this.eventos[evento]) {
        this.eventos[evento].forEach(callback => callback(datos));
    }
};



/**
 * Aplicar configuración visual (colores, logo, título)
 */
window.rifaplusConfig.aplicarConfiguracion = function() {
    try {
        // Aplicar variables CSS si existen
        const root = document.documentElement;
        if (this.cliente && this.cliente.colorPrimario) {
            root.style.setProperty('--primary', this.cliente.colorPrimario);
        }
        if (this.cliente && this.cliente.colorSecundario) {
            root.style.setProperty('--primary-600', this.cliente.colorSecundario);
            root.style.setProperty('--secondary', this.cliente.colorSecundario);
        }

        // Actualizar todos los logos en la página
        const logoElements = document.querySelectorAll('[data-logo-src]');
        if (this.cliente && this.cliente.logo) {
            logoElements.forEach(logoEl => {
                const img = logoEl.querySelector('img');
                if (img) {
                    img.src = this.cliente.logo;
                    img.alt = this.cliente.nombre || 'Logo';
                }
            });
        }

        // Actualizar título del documento si es página principal
        if (this.cliente && this.cliente.nombre) {
            // Solo cambiar título si está en la página principal (no en admin panel)
            if (!document.title.includes('Panel')) {
                document.title = `${this.cliente.nombre} - Gana ${this.rifa.titulo}`;
            }
        }

        // Actualizar metadescripción dinámicamente
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && this.cliente && this.rifa) {
            metaDesc.setAttribute('content', `Participa en ${this.cliente.nombre}. Gana un ${this.rifa.titulo}. Sorteo 100% transparente en vivo.`);
        }

        // ===== ACTUALIZAR OPEN GRAPH META TAGS =====
        // Para que las redes sociales muestren información actualizada
        if (this.cliente && this.rifa) {
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) ogTitle.setAttribute('content', `${this.cliente.nombre} - Gana ${this.rifa.titulo}`);
            
            const ogDesc = document.querySelector('meta[property="og:description"]');
            if (ogDesc) ogDesc.setAttribute('content', `Participa en ${this.cliente.nombre}. ${this.rifa.descripcion}. Sorteo 100% transparente en vivo.`);
            
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage && this.rifa.premios[0]?.imagenes[0]) {
                const imgUrl = new URL(this.rifa.premios[0].imagenes[0], window.location.href).href;
                ogImage.setAttribute('content', imgUrl);
            }
            
            const twitterTitle = document.querySelector('meta[name="twitter:title"]');
            if (twitterTitle) twitterTitle.setAttribute('content', `${this.cliente.nombre} - Gana ${this.rifa.titulo}`);
            
            const twitterDesc = document.querySelector('meta[name="twitter:description"]');
            if (twitterDesc) twitterDesc.setAttribute('content', `Participa en ${this.cliente.nombre}. ${this.rifa.descripcion}. Sorteo 100% transparente en vivo.`);
            
            const twitterImage = document.querySelector('meta[name="twitter:image"]');
            if (twitterImage && this.rifa.premios[0]?.imagenes[0]) {
                const imgUrl = new URL(this.rifa.premios[0].imagenes[0], window.location.href).href;
                twitterImage.setAttribute('content', imgUrl);
            }
            
            console.log('✅ Open Graph meta tags actualizados dinámicamente');
        }

        // Aplicar colores a elementos específicos si existen
        this.aplicarColorAElementos();

    } catch (e) {
        console.warn('Error aplicando configuración:', e);
    }
};

/**
 * Aplica colores a elementos específicos del DOM
 * (Los colores se aplican automáticamente via CSS, este método no hace nada actualmente)
 */
window.rifaplusConfig.aplicarColorAElementos = function() {
    // Ya no es necesario - los colores se aplican via root.style.setProperty() en aplicarConfiguracion()
};

// ====================================
// COMPATIBILIDAD CON CÓDIGO EXISTENTE
// ====================================

// Mantener compatibilidad con código antiguo
try {
    Object.defineProperties(window.rifaplusConfig, {
        'ticketPrice': {
            get: function() { return this.rifa.precioBoleto; },
            set: function(value) { this.rifa.precioBoleto = value; },
            configurable: true
        },
        'totalTickets': {
            get: function() { return this.rifa.totalBoletos; },
            set: function(value) { this.rifa.totalBoletos = value; },
            configurable: true
        },
        'drawDate': {
            get: function() { return this.rifa.fechaSorteo; },
            set: function(value) { this.rifa.fechaSorteo = value; },
            configurable: true
        },
        'apiEndpoint': {
            get: function() { return this.backend.apiBase + this.backend.endpoints.ordenes; },
            set: function(value) { 
                // Parsear URL para separar base y endpoint
                const url = new URL(value);
                this.backend.apiBase = url.origin;
                this.backend.endpoints.ordenes = url.pathname;
            },
            configurable: true
        }
    });
} catch (e) {
    console.warn('No se pudieron definir propiedades de compatibilidad:', e.message);
}

// ====================================
// INICIALIZACIÓN AUTOMÁTICA MEJORADA
// ====================================

document.addEventListener('DOMContentLoaded', function() {
    // Inicializar sistema completo (defensivo)
    if (window.rifaplusConfig && typeof window.rifaplusConfig.inicializar === 'function') {
        window.rifaplusConfig.inicializar();
    } else {
        console.warn('rifaplusConfig.inicializar no está disponible');
    }
});

// ====================================
// HERRAMIENTAS DE DESARROLLO
// ====================================





// Exponer para debugging
window.config = window.rifaplusConfig;

// ====================================
// SISTEMA REACTIVO PARA DATOS DINÁMICOS
// ====================================

/**
 * Listeners para cambios en la configuración
 * Permite que elementos se actualicen automáticamente
 */
window.rifaplusConfig._changeListeners = [];

/**
 * Registra un listener para cambios en la configuración
 * @param {function} callback - Se ejecuta cuando cambia algo
 */
window.rifaplusConfig.onChange = function(callback) {
    this._changeListeners.push(callback);
};

/**
 * Notifica a todos los listeners que algo cambió
 * @private
 */
window.rifaplusConfig._notifyListeners = function(seccion, campo, valorAnterior, valorNuevo) {
    this._changeListeners.forEach(callback => {
        try {
            callback({ seccion, campo, valorAnterior, valorNuevo });
        } catch (e) {
            console.error('Error en listener:', e);
        }
    });
    
    // Ejecutar actualización automática en DOM
    this._actualizarDOM(seccion, campo, valorNuevo);
};

/**
 * MÉTODO PRINCIPAL: Actualiza cualquier valor en la configuración dinámicamente
 * Al cambiar, se notifica automáticamente a toda la web
 * 
 * @param {string} seccion - 'cliente', 'rifa', 'backend', 'tecnica'
 * @param {string} campo - El campo específico a cambiar (ej: 'totalBoletos')
 * @param {*} valorNuevo - El nuevo valor
 * 
 * @example
 * // Cambiar el total de boletos
 * window.rifaplusConfig.set('rifa', 'totalBoletos', 50000);
 * 
 * // Cambiar el nombre del cliente
 * window.rifaplusConfig.set('cliente', 'nombre', 'Mi Nuevo Negocio');
 * 
 * // Cambiar precio del boleto
 * window.rifaplusConfig.set('rifa', 'precioBoleto', 100);
 */
window.rifaplusConfig.set = function(seccion, campo, valorNuevo) {
    if (!this[seccion]) {
        console.error(`❌ Sección "${seccion}" no existe`);
        return false;
    }
    
    const valorAnterior = this[seccion][campo];
    
    // Validar que el valor realmente cambió
    if (valorAnterior === valorNuevo) {
        return true; // Sin cambios
    }
    
    // Actualizar el valor
    this[seccion][campo] = valorNuevo;
    
    console.log(`📝 Config actualizada: ${seccion}.${campo} = ${valorNuevo} (antes: ${valorAnterior})`);
    
    // Guardar en localStorage
    this._guardarEnLocal();
    
    // Notificar listeners
    this._notifyListeners(seccion, campo, valorAnterior, valorNuevo);
    
    return true;
};

/**
 * Actualiza elementos del DOM que usan los datos cambios
 * @private
 */
window.rifaplusConfig._actualizarDOM = function(seccion, campo, valor) {
    try {
        if (seccion === 'rifa' && campo === 'totalBoletos') {
            // Actualizar en admin-ruletazo.html
            const rifaTotal = document.getElementById('rifaTotal');
            if (rifaTotal) {
                rifaTotal.textContent = valor.toLocaleString('es-MX');
                console.log(`🔄 Actualizado rifaTotal en DOM: ${valor}`);
            }
            
            // Actualizar en admin-boletos.html
            const statTotal = document.getElementById('statTotalBoletos');
            if (statTotal) {
                statTotal.textContent = valor.toLocaleString('es-MX');
                console.log(`🔄 Actualizado statTotalBoletos en DOM: ${valor}`);
            }
            
            // Actualizar en index.html
            const totalBoletosInfo = document.getElementById('total-boletos-info');
            if (totalBoletosInfo) {
                totalBoletosInfo.textContent = valor.toLocaleString('es-MX');
                console.log(`🔄 Actualizado total-boletos-info en DOM: ${valor}`);
            }
            
            // Actualizar en admin-dashboard.html
            const totalTickets = document.getElementById('totalTickets');
            if (totalTickets) {
                totalTickets.textContent = valor.toLocaleString('es-MX');
                console.log(`🔄 Actualizado totalTickets en DOM: ${valor}`);
            }
            
            // Recargar máquina de sorteo si existe
            if (window.loadCurrentRifa && typeof window.loadCurrentRifa === 'function') {
                console.log('🎰 Recargando máquina de sorteo...');
                window.loadCurrentRifa();
            }
            
            // Disparar evento personalizado
            window.dispatchEvent(new CustomEvent('totalBoletosActualizado', { 
                detail: { valor, anterior: window._totalBoletosAnterior } 
            }));
        }
        
        if (seccion === 'rifa' && campo === 'precioBoleto') {
            // Recargar componentes que usan el precio
            if (window.actualizarPrecioBoleto && typeof window.actualizarPrecioBoleto === 'function') {
                window.actualizarPrecioBoleto(valor);
            }
        }
        
        if (seccion === 'cliente') {
            // Actualizar datos visuales del cliente
            if (campo === 'nombre') {
                const clienteNombre = document.getElementById('cliente-nombre');
                if (clienteNombre) {
                    clienteNombre.textContent = valor;
                }
            }
            
            // Reaplica la configuración visual
            this.aplicarConfiguracion();
        }
    } catch (error) {
        console.warn('Error actualizando DOM:', error);
    }
};

/**
 * Guarda la configuración actual en localStorage para persistencia
 * ⚠️  CRÍTICO: NUNCA guarda datos del sorteo (rifa, sorteoActivo)
 * Solo guarda datos de USUARIO (cliente, backend, tecnica)
 * 
 * Esto es FUNDAMENTAL para poder cambiar de sorteo sin conflictos
 * @private
 */
window.rifaplusConfig._guardarEnLocal = function() {
    try {
        // Solo guardar datos de usuario, NUNCA del sorteo
        const configUserOnly = {
            cliente: this.cliente,
            // ⚠️  NUNCA guardar rifa - eso siempre viene de config.js
            backend: this.backend,
            tecnica: this.tecnica,
            _version: this._VERSION
        };
        
        localStorage.setItem('rifaplus_config_actual_v2', JSON.stringify(configUserOnly));
        
        // Limpiar versión vieja para evitar confusión
        localStorage.removeItem('rifaplus_config_actual');
        
    } catch (e) {
        console.warn('⚠️ No se pudo guardar en localStorage:', e);
    }
};

/**
 * Carga la configuración desde localStorage si existe
 * ⚠️  CRÍTICO: NUNCA carga datos del sorteo
 * Solo carga datos de USUARIO que pueden ser dinámicos
 * @returns {boolean} true si se cargó algo
 */
window.rifaplusConfig.cargarDelLocal = function() {
    try {
        // Intentar cargar versión nueva (segura, sin sorteo)
        const guardada = localStorage.getItem('rifaplus_config_actual_v2');
        if (!guardada) {
            // Limpiar versión vieja si existe
            localStorage.removeItem('rifaplus_config_actual');
            return false;
        }
        
        const config = JSON.parse(guardada);
        
        // ✅ Solo cargar datos de USUARIO
        if (config.cliente) {
            Object.assign(this.cliente, config.cliente);
        }
        if (config.backend) {
            Object.assign(this.backend, config.backend);
        }
        if (config.tecnica) {
            Object.assign(this.tecnica, config.tecnica);
        }
        
        console.log('✅ Configuración de usuario cargada (sorteo protegido de localStorage)');
        return true;
    } catch (e) {
        console.error('❌ Error cargando configuración:', e);
        return false;
    }
};

/**
 * VALIDACIÓN CRÍTICA: Verifica que los datos del sorteo NO provengan de localStorage
 * Se ejecuta después de cargar para asegurar integridad completa
 * @returns {boolean} true si todo está correcto
 * @private
 */
window.rifaplusConfig._validarIntegridadSorteo = function() {
    const errores = [];
    
    // Verificar que rifa tiene propiedades críticas
    if (!this.rifa || !this.rifa.fechaSorteo) {
        errores.push('❌ CRÍTICO: rifa.fechaSorteo no definida');
    }
    
    if (!this.sorteoActivo || !this.sorteoActivo.fechaCierre) {
        errores.push('❌ CRÍTICO: sorteoActivo.fechaCierre no definida');
    }
    
    // Validar que el timestamp es correcto
    try {
        const ts = this.obtenerTimestampSorteo();
        if (!ts || ts <= 0) {
            errores.push('❌ CRÍTICO: Timestamp inválido');
        }
    } catch (e) {
        errores.push(`❌ CRÍTICO: Error en timestamp - ${e.message}`);
    }
    
    if (errores.length > 0) {
        console.error('🚨 ERRORES DE INTEGRIDAD DEL SORTEO:');
        errores.forEach(e => console.error(e));
        return false;
    }
    
    console.log('✅ Validación de integridad: EXITOSA');
    return true;
};

/**
 * Limpia localStorage completamente para prepararse para un nuevo sorteo
 * IMPORTANTE: Llama esto ANTES de cambiar los datos en config.js para un nuevo sorteo
 * 
 * Uso:
 * 1. Edita los valores de rifa y sorteoActivo en config.js
 * 2. Ejecuta en consola: window.rifaplusConfig.limpiarParaNuevoSorteo()
 * 3. Recarga la página
 * 
 * @returns {boolean} true si se limpió exitosamente
 */
window.rifaplusConfig.limpiarParaNuevoSorteo = function() {
    try {
        console.log('🧹 Limpiando localStorage para nuevo sorteo...');
        
        // Borrar TODA la configuración guardada (versiones vieja y nueva)
        localStorage.removeItem('rifaplus_config_actual_v2');
        localStorage.removeItem('rifaplus_config_actual');
        
        // Opcionalmente: borrar datos de usuario también (carrito, cliente)
        // Descomenta si quieres reset COMPLETAMENTE limpio:
        // localStorage.removeItem('rifaplus_cliente');
        // localStorage.removeItem('rifaplus_carrito');
        // localStorage.removeItem('rifaplus_orden_actual');
        
        console.log('✅ localStorage limpiado para nuevo sorteo');
        console.log('📝 Ahora cambia config.js y recarga la página');
        return true;
    } catch (e) {
        console.error('❌ Error limpiando localStorage:', e);
        return false;
    }
};

/**
 * Reset COMPLETO de localStorage (borra TODO incluyendo datos de usuario)
 * Use solo si necesitas borrar completamente
 * 
 * @returns {boolean} true si se limpió exitosamente
 */
window.rifaplusConfig.resetCompletoStorage = function() {
    try {
        console.log('🔥 RESET COMPLETO - Borrando TODO de localStorage...');
        
        // Obtener todas las keys de localStorage
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith('rifaplus_') || key.startsWith('admin_')) {
                localStorage.removeItem(key);
                console.log(`  🗑️  Eliminado: ${key}`);
            }
        });
        
        console.log('✅ localStorage completamente limpio');
        console.log('🔄 Recarga la página para reiniciar desde cero');
        return true;
    } catch (e) {
        console.error('❌ Error en reset:', e);
        return false;
    }
};

/**
 * Obtiene un diagnóstico completo del sistema de configuración
 * Útil para debugging cuando algo no funciona correctamente
 * @returns {object} Reporte de diagnóstico
 */
window.rifaplusConfig.diagnostico = function() {
    const diag = {
        version: this._VERSION,
        timestamp: new Date().toISOString(),
        rifa: {
            titulo: this.rifa?.titulo,
            fechaSorteo: this.rifa?.fechaSorteo,
            totalBoletos: this.rifa?.totalBoletos,
            precioBoleto: this.rifa?.precioBoleto
        },
        sorteoActivo: {
            estado: this.sorteoActivo?.estado,
            fechaCierre: this.sorteoActivo?.fechaCierre,
            ganadores: this.sorteoActivo?.ganadores ? 'Sí' : 'No'
        },
        timestamps: {
            sorteo: this.obtenerTimestampSorteo?.(),
            ahora: Date.now(),
            diferencia: (this.obtenerTimestampSorteo?.() || 0) - Date.now()
        },
        localStorage: {
            v2_existe: !!localStorage.getItem('rifaplus_config_actual_v2'),
            v1_existe: !!localStorage.getItem('rifaplus_config_actual')
        },
        validacion: this._validarIntegridadSorteo?.()
    };
    
    console.table(diag);
    return diag;
};

/**
 * Obtiene un valor de configuración dinámicamente
 * @param {string} ruta - Ruta: 'rifa.totalBoletos', 'cliente.nombre', etc
 * @returns {*} El valor actual
 */
window.rifaplusConfig.get = function(ruta) {
    const partes = ruta.split('.');
    let valor = this;
    for (const parte of partes) {
        valor = valor[parte];
        if (valor === undefined) return null;
    }
    return valor;
};

// ====================================
// HERRAMIENTAS PARA EXPORTAR/IMPORTAR
// ====================================

/**
 * Exporta la configuración actual como JSON
 * Útil para guardar cliente y crear backup
 */
window.rifaplusConfig.exportarConfiguracion = function() {
    const config = {
        cliente: this.cliente,
        rifa: this.rifa,
        tecnica: this.tecnica
    };
    
    return JSON.stringify(config, null, 2);
};

/**
 * Descarga la configuración como archivo .json
 */
window.rifaplusConfig.descargarConfiguracion = function() {
    const config = this.exportarConfiguracion();
    const element = document.createElement('a');
    element.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(config));
    element.setAttribute('download', `config-${this.cliente.id}-${new Date().getTime()}.json`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
};

/**
 * Importa configuración desde archivo JSON
 */
window.rifaplusConfig.importarConfiguracion = function(jsonString) {
    try {
        const config = JSON.parse(jsonString);
        
        if (config.cliente) {
            this.cliente = Object.assign({}, this.cliente, config.cliente);
        }
        if (config.rifa) {
            this.rifa = Object.assign({}, this.rifa, config.rifa);
        }
        if (config.tecnica) {
            this.tecnica = Object.assign({}, this.tecnica, config.tecnica);
        }
        
        this.aplicarConfiguracion();
        this.emitirEvento('configuracionActualizada', { cliente: this.cliente, rifa: this.rifa });
        
        return true;
    } catch (error) {
        console.error('Error importando configuración:', error);
        return false;
    }
};

/**
 * Obtiene URL para compartir orden con cliente
 */
window.rifaplusConfig.generarURLCompartir = function(ordenId) {
    const baseURL = window.location.origin;
    return `${baseURL}/mis-boletos.html?orden=${ordenId}`;
};

/**
 * Obtiene las cuentas de pago formateadas para mostrar
 */
window.rifaplusConfig.obtenerCuentasFormateadas = function() {
    return this.tecnica.bankAccounts.map(cuenta => ({
        ...cuenta,
        numeroMascarado: `****${cuenta.accountNumber.slice(-4)}`,
        enlaceWhatsapp: `https://wa.me/${cuenta.phone.replace(/[^0-9]/g, '')}`
    }));
};

/**
 * Obtiene el prefijo dinámico de órdenes basado en el nombre del cliente
 * Se recalcula automáticamente si el nombre del cliente cambia
 * @returns {string} Prefijo de orden (ej: "SET", "RET", "ORD")
 */
window.rifaplusConfig.obtenerPrefijoOrden = function() {
    return this.cliente.prefijoOrden;
};

/**
 * FUNCIÓN CRÍTICA: Reconstruye un ID de orden con el prefijo dinámico actual
 * Toma un ID antiguo o parcial y lo convierte al prefijo actual
 * @param {string} ordenId - ID de orden completo (ej: "SY-AA005") o secuencia (ej: "AA005")
 * @returns {string} ID reconstruido con prefijo actual (ej: "RET-AA005")
 */
window.rifaplusConfig.reconstruirIdOrdenConPrefijoActual = function(ordenId) {
    if (!ordenId) return `${this.cliente.prefijoOrden}-AA001`;
    
    const prefijoActual = this.cliente.prefijoOrden;
    console.log('🔧 reconstruirIdOrdenConPrefijoActual');
    console.log('  - Input:', ordenId);
    console.log('  - Prefijo actual:', prefijoActual);
    console.log('  - Cliente.nombre:', this.cliente.nombre);
    
    // Si ya tiene el prefijo correcto, retornar tal cual
    if (ordenId.startsWith(prefijoActual + '-')) {
        console.log('  - ✅ Ya tiene prefijo correcto, retornando sin cambios');
        return ordenId;
    }
    
    // Extraer secuencia (ej: "SY-AA005" → "AA005" o "AA005" → "AA005")
    const secuenciaMatch = ordenId.match(/-(.+)$|^([A-Z0-9]+)$/);
    let secuencia = 'AA001';
    
    if (secuenciaMatch) {
        if (secuenciaMatch[1]) {
            secuencia = secuenciaMatch[1]; // "-AA005" case
        } else if (secuenciaMatch[2]) {
            secuencia = secuenciaMatch[2]; // "AA005" case sin prefijo
        }
    }
    
    const resultado = `${prefijoActual}-${secuencia}`;
    console.log('  - Output:', resultado);
    return resultado;
};

/* ============================================================ */
/* FUNCIONES CENTRALIZADAS PARA GESTIÓN DE FECHA DEL SORTEO    */
/* ============================================================ */

/**
 * Obtiene la fecha ISO del sorteo desde config.rifa.fechaSorteo
 * @returns {string|null} Fecha en formato ISO con zona horaria (ej: "2025-12-20T20:00:00-06:00")
 */
window.rifaplusConfig.obtenerFechaSorteo = function() {
    if (!this.rifa || !this.rifa.fechaSorteo) {
        console.error('❌ [Config] ERROR CRÍTICO: rifa.fechaSorteo no está definida en config.js');
        return null;
    }
    return this.rifa.fechaSorteo;
};

/**
 * Obtiene el timestamp en milisegundos de la fecha del sorteo
 * Calcula dinámicamente desde fechaSorteo, NO usa una variable guardada
 * @returns {number|null} Timestamp en milisegundos desde epoch
 */
window.rifaplusConfig.obtenerTimestampSorteo = function() {
    const fechaISO = this.obtenerFechaSorteo();
    if (!fechaISO) {
        return null;
    }
    
    try {
        const timestamp = new Date(fechaISO).getTime();
        if (isNaN(timestamp)) {
            console.error('❌ [Config] ERROR: No se pudo parsear la fecha del sorteo:', fechaISO);
            return null;
        }
        return timestamp;
    } catch (error) {
        console.error('❌ [Config] ERROR al calcular timestamp:', error);
        return null;
    }
};

/**
 * Valida que la fecha del sorteo sea válida
 * @returns {object} { valida: boolean, mensaje: string, timestamp: number|null }
 */
window.rifaplusConfig.validarFechaSorteo = function() {
    const fechaISO = this.obtenerFechaSorteo();
    
    if (!fechaISO) {
        return {
            valida: false,
            mensaje: 'fechaSorteo no está definida en config.js',
            timestamp: null
        };
    }
    
    const timestamp = this.obtenerTimestampSorteo();
    if (!timestamp) {
        return {
            valida: false,
            mensaje: `No se pudo parsear fechaSorteo: "${fechaISO}"`,
            timestamp: null
        };
    }
    
    const ahora = new Date().getTime();
    const sorteoYaPaso = timestamp <= ahora;
    
    return {
        valida: true,
        mensaje: sorteoYaPaso ? 'El sorteo ya ha ocurrido' : 'Fecha válida y sorteo está activo',
        timestamp: timestamp,
        sorteoYaPaso: sorteoYaPaso,
        fechaFormato: new Date(timestamp).toISOString(),
        diasRestantes: Math.floor((timestamp - ahora) / (1000 * 60 * 60 * 24))
    };
};

/**
 * Obtiene el texto formateado de la fecha del sorteo
 * @returns {string} Formato legible (ej: "20 de Diciembre 2025")
 */
window.rifaplusConfig.obtenerFechaSorteoFormato = function() {
    if (!this.rifa || !this.rifa.fechaSorteoFormato) {
        console.warn('⚠️ [Config] fechaSorteoFormato no definida, usando valor por defecto');
        return 'Fecha no disponible';
    }
    return this.rifa.fechaSorteoFormato;
};

/* ============================================================ */
/* SISTEMA DE SINCRONIZACIÓN DE GANADORES                       */
/* ============================================================ */

/**
 * Sincroniza los ganadores desde GanadoresManager (localStorage) al sorteoActivo
 * Transforma la estructura para que sea compatible con el modal de ganadores
 * Ordena jerárquicamente: sorteo → presorteo → ruletazos
 * 
 * FLUJO:
 * 1. GanadoresManager (localStorage) guarda: {sorteo: [...], presorteo: [...], ruletazos: [...]}
 * 2. Esta función lee esos ganadores y los pone en: sorteoActivo.ganadores.principal, .presorte, .ruletazo
 * 3. El modal de finalización leerá sorteoActivo.ganadores y mostrará los ganadores
 * 
 * @returns {boolean} true si sincronizó correctamente, false si GanadoresManager no está disponible
 */
window.rifaplusConfig.sincronizarGanadores = function() {
    // Verificar que GanadoresManager está disponible
    if (!window.GanadoresManager) {
        console.debug('⚠️ [Config] GanadoresManager no disponible aún, ignorando sincronización');
        return false;
    }

    try {
        // Obtener ganadores desde localStorage vía GanadoresManager
        const ganadoresDelStorage = window.GanadoresManager.obtenerTodos();
        
        if (!ganadoresDelStorage || Object.keys(ganadoresDelStorage).length === 0) {
            console.debug('ℹ️ [Config] No hay ganadores registrados en localStorage');
            return false;
        }

        // Transformar estructura para coincidir con sorteoActivo.ganadores
        // De: {sorteo: [...], presorteo: [...], ruletazos: [...]}
        // A:  {principal: [...], presorte: [...], ruletazo: [...]}
        
        const gananesTransformados = {
            principal: this._transformarGanadoresTipo(ganadoresDelStorage.sorteo || []),
            presorte: this._transformarGanadoresTipo(ganadoresDelStorage.presorteo || []),
            ruletazo: this._transformarGanadoresTipo(ganadoresDelStorage.ruletazos || [])
        };

        // Actualizar sorteoActivo.ganadores
        this.sorteoActivo.ganadores = gananesTransformados;
        
        // Log de éxito
        const totalGanadores = 
            gananesTransformados.principal.length + 
            gananesTransformados.presorte.length + 
            gananesTransformados.ruletazo.length;
        
        console.debug(`✅ [Config] Ganadores sincronizados: ${totalGanadores} total (${gananesTransformados.principal.length} principal, ${gananesTransformados.presorte.length} presorte, ${gananesTransformados.ruletazo.length} ruletazo)`);
        
        return true;

    } catch (error) {
        console.warn('⚠️ [Config] Error sincronizando ganadores:', error);
        return false;
    }
};

/**
 * Transforma ganadores de una categoría para coincidir con el formato del modal
 * Mapea: numero → numeroOrden, agrega datos formateados
 * 
 * @private
 * @param {Array} ganadores - Array de ganadores del tipo (sorteo, presorteo o ruletazos)
 * @returns {Array} Ganadores transformados para el modal
 */
window.rifaplusConfig._transformarGanadoresTipo = function(ganadores) {
    if (!Array.isArray(ganadores)) return [];

    return ganadores.map((ganador, index) => ({
        posicion: ganador.posicion || (index + 1),
        numeroOrden: String(ganador.numero).padStart(5, '0'),  // Formato: SY-XXXXX → pero tomamos el número
        nombre: ganador.nombre_cliente || '-',
        apellido: ganador.apellido_cliente || '',
        nombreParcial: this._generarNombreParcial(ganador.nombre_cliente, ganador.apellido_cliente),
        ciudad: ganador.ciudad || '-',
        estado_cliente: ganador.estado_cliente || '-',
        estado: ganador.estado_cliente || '-',
        fechaRegistro: ganador.fechaRegistro,
        lugarGanado: ganador.lugarGanado || (index + 1)
    }));
};

/**
 * Genera un nombre parcial a partir de nombre y apellido
 * Ej: "Juan Manuel López" → "J.M.L."
 * 
 * @private
 * @param {string} nombre - Nombre completo o primer nombre
 * @param {string} apellido - Apellido
 * @returns {string} Iniciales formateadas
 */
window.rifaplusConfig._generarNombreParcial = function(nombre, apellido) {
    const partes = [];
    
    if (nombre && nombre.trim()) {
        const palabrasNombre = nombre.trim().split(/\s+/);
        partes.push(palabrasNombre[0][0].toUpperCase());
        if (palabrasNombre.length > 1) {
            partes.push(palabrasNombre[1][0].toUpperCase());
        }
    }
    
    if (apellido && apellido.trim()) {
        const palabrasApellido = apellido.trim().split(/\s+/);
        partes.push(palabrasApellido[0][0].toUpperCase());
    }
    
    return partes.join('.');
};

/**
 * Escucha cambios de ganadores y sincroniza automáticamente
 * Se ejecuta cuando GanadoresManager guarda nuevos ganadores
 */
window.addEventListener('ganadesoresActualizados', function(e) {
    console.debug('🔄 [Config] Evento de ganadores actualizados detectado, sincronizando...');
    if (window.rifaplusConfig && typeof window.rifaplusConfig.sincronizarGanadores === 'function') {
        window.rifaplusConfig.sincronizarGanadores();
    }
});

console.log('✅ [Config] Sistema centralizado de fecha del sorteo inicializado');
console.log('✅ [Config] Sistema de sincronización de ganadores inicializado');