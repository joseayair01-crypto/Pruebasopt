// backend/server.js - Backend Express para RifaPlus
// Provee endpoints para guardar órdenes y servir páginas viewables
// v2.0: Migrado a PostgreSQL con Knex para persistencia segura
// v2.1: Autenticación JWT para panel admin
// v2.2: Validaciones, seguridad, sanitización y rate limiting
// v2.3: Sistema automático de expiración de órdenes (configurable desde config.js)
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const sanitizeHtml = require('sanitize-html');
const compression = require('compression');
const crypto = require('crypto');  // ⭐ FASE 1: Para calcular ETags en HTTP caching
const lockfile = require('proper-lockfile');  // 🔒 File locking para race conditions
const socketIO = require('socket.io');  // 🔌 WebSocket para actualizaciones en tiempo real
// ⚠️ CRÍTICO: cargar .env desde el directorio backend para DATABASE_URL
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const db = require('./db'); // Instancia Knex (Postgres)
const cloudinary = require('./cloudinary-config'); // ✅ Cloudinary para almacenar comprobantes
const ordenExpirationService = require('./services/ordenExpirationService'); // Servicio de expiración
const OportunidadesOrdenService = require('./services/oportunidadesOrdenService'); // Servicio de oportunidades
const BoletoService = require('./services/boletoService'); // Servicio de boletos para estadísticas y limpieza
const comprobanteService = require('./services/comprobanteService'); // ✅ Servicio de comprobantes
const { inicializarEventosWebSocket } = require('./services/websocket-events'); // 🔌 Eventos de WebSocket
const { obtenerConfigExpiracion } = require('./config-loader'); // Carga config.js
const dbUtils = require('./db-utils');
const { calcularDescuentoCompartido, auditarConsistenciaPrecios, calcularTotalesServidor } = require('./calculo-precios-server'); // ✅ Cálculo sincronizado

// ===== VALIDACIÓN CRÍTICA DE CONFIGURACIÓN =====
// Verificar que variables de entorno REQUERIDAS existan y sean válidas
const variablesRequeridas = ['JWT_SECRET'];
const variablesFaltantes = variablesRequeridas.filter(v => !process.env[v]);

if (variablesFaltantes.length > 0) {
    console.error('');
    console.error('🚨 ❌ ERROR CRÍTICO: Configuración incompleta');
    console.error('================================================');
    console.error('Variables de entorno requeridas pero FALTANTES:');
    variablesFaltantes.forEach(v => {
        console.error(`  - ${v}`);
    });
    console.error('');
    console.error('SOLUCIÓN: Crea archivo .env con:');
    console.error('  JWT_SECRET=tu-secret-muy-seguro-aqui');
    console.error('  NODE_ENV=production');
    console.error('================================================');
    console.error('');
    process.exit(1);
}

// 🔐 VALIDACIÓN: JWT_SECRET debe tener min 32 caracteres en PRODUCCIÓN
const JWT_SECRET = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production') {
    if (JWT_SECRET.length < 32) {
        console.error('');
        console.error('🚨 ❌ ERROR CRÍTICO: JWT_SECRET muy débil');
        console.error('================================================');
        console.error('En PRODUCCIÓN, JWT_SECRET debe tener min 32 caracteres aleatorios');
        console.error('');
        console.error('GENERAR JWT_SECRET FUERTE:');
        console.error('  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
        console.error('');
        console.error('Luego copiar el resultado en .env como:');
        console.error('  JWT_SECRET=<resultado_del_comando>');
        console.error('================================================');
        console.error('');
        process.exit(1);
    }
}
const JWT_EXPIRES_IN = '24h'; // Token expira en 24 horas

// ⚠️ UTILITY: Limitar concurrencia para evitar "MaxClientsInSessionMode" en Vercel
// Ejecuta promesas en batches de N simultáneas
async function pLimit(promises, maxConcurrent = 3) {
    const results = [];
    for (let i = 0; i < promises.length; i += maxConcurrent) {
        const batch = promises.slice(i, i + maxConcurrent);
        const batchResults = await Promise.all(batch);
        results.push(...batchResults);
    }
    return results;
}

// ============================================================
// FUNCIÓN: OBTENER PRECIO DINAMICO (Lee en cada petición)
// ============================================================
/**
 * Obtiene el precio del boleto dinámicamente desde config.json
 * ✅ ACTUALIZADO: Verifica promoción por tiempo
 * IMPORTANTE: Se ejecuta en cada petición, no usa cache para mantener sincronía
 * @returns {number} Precio del boleto desde config.json (o precio provisional si hay promoción activa)
 */
function obtenerPrecioDinamico() {
    try {
        const configPath = path.join(__dirname, 'config.json');
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);
            
            const ahora = new Date();
            
            // Verificar si hay promoción por tiempo activa
            const promo = config.rifa?.promocionPorTiempo;
            if (promo && promo.enabled && promo.precioProvisional !== null && promo.precioProvisional !== undefined) {
                const inicio = promo.fechaInicio ? new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(String(promo.fechaInicio)) ? promo.fechaInicio : `${promo.fechaInicio}-06:00`) : null;
                const fin = promo.fechaFin ? new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(String(promo.fechaFin)) ? promo.fechaFin : `${promo.fechaFin}-06:00`) : null;
                
                // Si estamos dentro del rango de promoción, usar precio provisional
                if (inicio && fin && ahora >= inicio && ahora <= fin) {
                    const precioProvisional = Number(promo.precioProvisional);
                    if (precioProvisional >= 0 && Number.isFinite(precioProvisional)) {
                        console.log(`💰 [Promoción Activa] Usando precio provisional: $${precioProvisional.toFixed(2)}`);
                        return precioProvisional;
                    }
                }
            }
            
            // Si no hay promoción activa, usar precio normal
            if (config?.rifa?.precioBoleto && config.rifa.precioBoleto > 0) {
                return config.rifa.precioBoleto;  // ✅ Lee el valor ACTUAL de config.json
            }
        }
    } catch (err) {
        console.error('Error leyendo precio dinámico:', err.message);
    }
    // ✅ Fallback: Retorna 15 como default si falla
    // (No depende de PRECIO_BOLETO_DEFAULT ya que está hardcodeado)
    return 15;
}

// Configuración de expiración de órdenes
// Prioridad: .env > config.js > defaults
const configExpiracion = obtenerConfigExpiracion();
const TIEMPO_APARTADO_HORAS = configExpiracion.tiempoApartadoHoras;
const INTERVALO_LIMPIEZA_MINUTOS = configExpiracion.intervaloLimpiezaMinutos;
const PRECIO_BOLETO_DEFAULT = configExpiracion.precioBoleto; // ✅ PRECIO DINÁMICO desde config.js

// ⭐ CACHE GLOBAL EN SERVIDOR (en lugar de window.* que no existe en Node.js)
const serverCache = {
    boletosPublicosCached: null,
    boletosPublicosCachedTime: 0,
    boletosPublicosByRange: new Map()
};

// 🔌 VARIABLE GLOBAL: Instancia de eventos WebSocket (se inicializa al arrancar el servidor)
let wsEvents = null;

// Log de configuración cargada
console.log(`⚙️  Configuración de expiración cargada:`);
console.log(`   - Tiempo reservado: ${TIEMPO_APARTADO_HORAS} horas`);
console.log(`   - Intervalo limpieza: ${INTERVALO_LIMPIEZA_MINUTOS} minutos`);
console.log(`   - Precio boleto: $${PRECIO_BOLETO_DEFAULT}`);  // ✅ LOG del precio

// Middleware de Seguridad
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },  // Permitir CORS para recursos
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "'unsafe-eval'",
                "https://cdnjs.cloudflare.com",
                "https://fonts.googleapis.com",
                "https://cdn.sheetjs.com",
                "https://cdn.jsdelivr.net"  // ✅ Chart.js CDN
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://cdnjs.cloudflare.com",
                "https://fonts.googleapis.com"
            ],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https:"]
        }
    }
}));

// ✅ COMPRESSION MIDDLEWARE - Comprime respuestas con gzip
// Reduce tamaño de JSON/HTML hasta 80%
app.use(compression({
    level: 6,  // 0-9, 6 es balance entre velocidad y compresión
    threshold: 1024,  // Solo comprimir respuestas > 1KB
    filter: (req, res) => {
        // Evitar comprimir algunas respuestas
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

// 🔒 CORS SEGURO: Whitelist de orígenes permitidos
const getCorsOrigins = () => {
    // DESARROLLO: Lista incorporada
    if (process.env.NODE_ENV !== 'production') {
        return [
            'http://localhost:3000',
            'http://localhost:5500',
            'http://127.0.0.1:5500',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5001',
        ];
    }

    // PRODUCCIÓN: Desde .env (variable CORS_ORIGINS)
    const corsEnv = process.env.CORS_ORIGINS || '';
    if (!corsEnv) {
        console.warn('⚠️  CORS_ORIGINS no configurado en .env. Usando lista vacía (solo MISMO ORIGEN)');
        return [];
    }

    return corsEnv.split(',').map(o => o.trim()).filter(o => o.length > 0);
};

const allowedCorsOrigins = getCorsOrigins();

// Configurar CORS con whitelist
app.use(cors({
    origin: function(origin, callback) {
        // No hay origen en solicitudes como GET desde servidor
        if (!origin) {
            return callback(null, true);
        }

        // Verificar si origen está en whitelist
        if (allowedCorsOrigins.includes(origin)) {
            return callback(null, true);
        }

        // En desarrollo, ser un poco más permisivo
        if (process.env.NODE_ENV !== 'production') {
            // Log warning pero permitir en desarrollo
            console.warn(`⚠️  CORS: Origen no whitelistado: ${origin}`);
            return callback(null, true);
        }

        // En producción, RECHAZAR
        return callback(new Error(`CORS: Origen no autorizado: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    maxAge: 86400 // Cache CORS por 24 horas para reducir preflight requests
}));

// 🔐 HEADERS DE SEGURIDAD ADICIONALES
// Headers custom que mejoran seguridad más allá de helmet
app.use((req, res, next) => {
    // Prevenir ataques de timing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Prevenir clickjacking (aunque helmet ya lo hace)
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Prevenir browser sniffing
    res.setHeader('X-UA-Compatible', 'IE=edge');
    
    // Referrer policy: no enviar referrer a otros dominios
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions policy (anteriormente Feature-Policy)
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // Prevenir MIME sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    next();
});

// Parsear JSON y form data
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Parsear archivos de formularios (FormData con archivos)
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max para imágenes
    abortOnLimit: true,
    responseOnLimit: 'El archivo es demasiado grande. Máximo 50MB.'
}));

// 🔒 RATE LIMITING: Protegiendo contra ataques de fuerza bruta y DoS

const limiterGeneral = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: process.env.NODE_ENV === 'production' ? 200 : 10000,
    message: 'Demasiadas solicitudes, intenta más tarde',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req, res) => {
        // Solo skippear en desarrollo
        return process.env.NODE_ENV !== 'production';
    }
});

const limiterLogin = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: process.env.NODE_ENV === 'production' ? 5 : 1000, // Muy restrictivo: solo 5 intentos en 15 min
    message: 'Demasiados intentos de login. Intenta en 15 minutos',
    skipSuccessfulRequests: true, // No contar intentos exitosos
    skip: (req, res) => {
        return process.env.NODE_ENV !== 'production';
    }
});

const limiterOrdenes = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: (req, res) => {
        if (process.env.NODE_ENV !== 'production') {
            return 10000; // Desarrollo: sin límite para testing
        }
        
        // Producción: Dinámico según hora
        const hour = new Date().getHours();
        if (hour >= 20 && hour < 24) {
            return 120; // Picos: max 120/min = ~2000 boletos/hora
        }
        return 60; // Normal: max 60/min = ~1000 boletos/hora
    },
    message: 'Demasiadas solicitudes. Por favor espera e intenta nuevamente',
    skip: (req, res) => {
        return process.env.NODE_ENV !== 'production';
    }
});

const limiterRecuperacionOrdenes = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutos
    max: process.env.NODE_ENV === 'production' ? 12 : 500,
    message: 'Demasiadas consultas de recuperación. Intenta más tarde',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req, res) => {
        return process.env.NODE_ENV !== 'production';
    }
});

// Aplicar rate limiting general a todas las rutas
app.use(limiterGeneral);

// ===== FASE 1: HTTP CACHING HEADERS UTILITY (PROFESIONAL & SIMPLE) =====
// ⭐ Función utility para agregar headers de caching HTTP en respuestas
// Se llama directamente antes de res.json() en endpoints
// Ventajas: Simple, no interfiere con otros middlewares, reversible
function setHttpCacheHeaders(res, maxAgeSeconds = 60, isPublic = true) {
    const cacheControl = isPublic 
        ? `public, max-age=${maxAgeSeconds}` 
        : `private, max-age=${maxAgeSeconds}`;
    
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('Vary', 'Accept-Encoding');
    // ETag será calculado por el cliente si lo necesita
    // Los navegadores modernos ya cachean por defecto con estos headers
}
// Fin Utility de Caching HTTP

// ===== CONFIGURACIÓN DINÁMICA DEL SORTEO =====
// Usar config manager para cargar configuración en memoria (caché)
const configManager = require('./config-manager').getInstance();

function cargarConfigSorteo() {
    return {
        totalBoletos: configManager.totalBoletos,
        precioBoleta: configManager.precioBoleto,
        precioBoleto: configManager.precioBoleto,
        clienteNombre: 'SORTEOS TORRES',
        // ✅ AGREGADO: Información de cliente y prefijo
        cliente: {
            id: configManager.config?.cliente?.id || 'Sorteos_El_Trebol',
            nombre: configManager.config?.cliente?.nombre || 'SORTEOS TORRES',
            prefijoOrden: configManager.config?.cliente?.prefijoOrden || 'SS'
        },
        // ✅ AGREGADO: Información de descuentos desde config
        rifa: {
            precioBoleto: configManager.config?.rifa?.precioBoleto || configManager.precioBoleto,
            descuentos: configManager.config?.rifa?.descuentos || { enabled: false, reglas: [] },
            promocionPorTiempo: configManager.config?.rifa?.promocionPorTiempo || { enabled: false },
            descuentoPorcentaje: configManager.config?.rifa?.descuentoPorcentaje || { enabled: false },
            oportunidades: {
                enabled: configManager.config?.rifa?.oportunidades?.enabled || false,
                multiplicador: configManager.config?.rifa?.oportunidades?.multiplicador || 3,
                rango_visible: configManager.config?.rifa?.oportunidades?.rango_visible || false
            }
        }
    };
}

// Servir archivos estáticos en /public
app.use('/public', express.static(path.join(__dirname, 'public')));

// 🔒 Bloquear acceso estático a archivos internos del proyecto
app.use((req, res, next) => {
    const requestPath = decodeURIComponent(req.path || '').replace(/\\/g, '/');
    const sensitivePrefixes = [
        '/backend/',
        '/node_modules/',
        '/.git/',
        '/.vscode/',
        '/.idea/'
    ];
    const sensitiveFiles = [
        '/backend',
        '/package.json',
        '/package-lock.json',
        '/pnpm-lock.yaml',
        '/yarn.lock',
        '/docker-compose.yml',
        '/Dockerfile',
        '/.env',
        '/.env.example'
    ];
    const sensitiveExtensions = /\.(env|sql|db|sqlite|sqlite3|log|md|map)$/i;

    if (
        sensitivePrefixes.some((prefix) => requestPath.startsWith(prefix)) ||
        sensitiveFiles.includes(requestPath) ||
        sensitiveExtensions.test(requestPath)
    ) {
        return res.status(404).json({
            success: false,
            message: 'Ruta no encontrada'
        });
    }

    return next();
});

// ✅ Servir archivos estáticos del frontend (css, js, images, etc.)
// IMPORTANTE: Va ANTES de la ruta catch-all de index.html
app.use(express.static(path.join(__dirname, '..')));

// Nota: Frontend se sirve desde un host separado (Vercel, GitHub Pages, etc.)

/**
 * Middleware: Verificar JWT
 * Usado en endpoints protegidos (/api/admin/*, /api/ordenes POST, PATCH, etc.)
 */
function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
        console.error('❌ [verificarToken] No hay token');
        return res.status(401).json({
            success: false,
            message: 'Token no proporcionado',
            code: 'NO_TOKEN'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, usuario) => {
        if (err) {
            console.error('❌ [verificarToken] Error al verificar:', err.message);
            return res.status(403).json({
                success: false,
                message: 'Token inválido o expirado',
                code: 'INVALID_TOKEN'
            });
        }
        req.usuario = usuario; // Adjuntar usuario al request
        next();
    });
}

// 🔐 SEGURIDAD: Función para sanitizar mensajes de error (NO exponer detalles internos)
/**
 * Sanitiza mensajes de error para NO exponer:
 * - URLs de Cloudinary
 * - Paths de archivos internos
 * - Stack traces
 * - Credenciales o tokens
 * - Detalles técnicos de BD
 * @param {string} errorMessage - Mensaje original de error
 * @param {boolean} isDevelopment - Si estamos en desarrollo
 * @returns {string} Mensaje sanitizado
 */
function sanitizarErrorMessage(errorMessage, isDevelopment = false) {
    if (!isDevelopment) {
        // En PRODUCCIÓN: Retornar mensaje genérico
        // Mostrar SOLO el mensaje amigo del usuario
        const mensajeOriginal = String(errorMessage || 'Error desconocido');
        
        // Mapping de errores conocidos a mensajes seguros
        const errorMappings = {
            'Archivo': 'El archivo no es válido',
            'obligatorio': 'Faltan datos requeridos',
            'inválido': 'Los datos proporcionados no son válidos',
            'no encontrada': 'Recurso no encontrado',
            'permiso': 'No tienes permiso para esta acción',
            'demasiado grande': 'El archivo es demasiado grande',
            'Cloudinary': 'Error al procesar archivo. Intenta más tarde',
            'Esquema': 'Error de configuración del servidor',
            'BOLETOS_CONFLICTO': 'algunos boletos ya no están disponibles',
            'EOF': 'Error de conexión. Intenta nuevamente'
        };
        
        // Buscar un mapping para el error
        for (const [clave, mensaje] of Object.entries(errorMappings)) {
            if (mensajeOriginal.includes(clave)) {
                return mensaje;
            }
        }
        
        // Si no hay mapping, retornar mensaje genérico
        return 'Error al procesar tu solicitud. Por favor intenta nuevamente';
    }
    
    // En DESARROLLO: Mostrar detalles (para debugging)
    return String(errorMessage || 'Error desconocido');
}

// ===== FUNCIONES DE VALIDACIÓN =====

/**
 * Sanitiza strings: elimina HTML, trimea espacios
 */
function sanitizar(str) {
    if (typeof str !== 'string') return '';
    return sanitizeHtml(str, { 
        allowedTags: [],
        allowedAttributes: {}
    }).trim();
}

/**
 * 🔒 Valida y sanitiza un campo de premio
 * @param {string} campo - El nombre del campo (nombre, premio, descripcion)
 * @param {*} valor - El valor a validar
 * @returns {string} - Valor sanitizado y validado
 */
function validarCampoPremio(campo, valor) {
    if (typeof valor !== 'string') return '';
    
    // Sanitizar
    let limpio = sanitizar(valor);
    
    // Validar longitud (max 200 caracteres)
    if (limpio.length > 200) {
        limpio = limpio.substring(0, 200);
    }
    
    // No permitir vacío
    if (limpio.length === 0) {
        throw new Error(`${campo} no puede estar vacío`);
    }
    
    return limpio;
}

/**
 * 📦 Crea backup automático de config.json
 * Guarda versión anterior en backup/
 */
async function crearBackupConfig(configPath) {
    try {
        const backupDir = path.join(path.dirname(configPath), 'backups');
        
        // Crear directorio backups si no existe
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        // Nombre del backup con timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `config.${timestamp}.json`);
        
        // Copiar archivo actual al backup
        if (fs.existsSync(configPath)) {
            const contenido = fs.readFileSync(configPath, 'utf8');
            fs.writeFileSync(backupPath, contenido, 'utf8');
            
            // Limpiar backups viejos (mantener últimos 10)
            limpiarBackupsAntiguos(backupDir);
        }
    } catch (error) {
        console.warn('⚠️  Error creando backup:', error.message);
        // No fallar si el backup falla, solo warnings
    }
}

/**
 * 🧹 Elimina backups muy antiguos (mantiene últimos 10)
 */
function limpiarBackupsAntiguos(backupDir) {
    try {
        const archivos = fs.readdirSync(backupDir).sort().reverse();
        if (archivos.length > 10) {
            archivos.slice(10).forEach(archivo => {
                fs.unlinkSync(path.join(backupDir, archivo));
            });
        }
    } catch (error) {
        console.warn('⚠️  Error limpiando backups:', error.message);
    }
}

/**
 * Valida teléfono (básico)
 */
function esTelefonoValido(tel) {
    return tel && tel.length >= 10 && tel.length <= 20;
}

/**
 * Valida precio (número positivo)
 */
function esPrecioValido(precio) {
    const num = parseFloat(precio);
    return !isNaN(num) && num > 0;
}

/**
 * FUNCIÓN LOG: Registra eventos en la consola
 * Usada para logging consistente en todo el servidor
 * @param {string} level - Nivel de log ('info', 'warn', 'error', 'debug')
 * @param {string} mensaje - Mensaje a registrar
 * @param {object} datos - Datos adicionales a incluir en el log
 */
function log(level = 'info', mensaje = '', datos = {}) {
    const timestamp = new Date().toISOString();
    const prefijos = {
        info: '📋',
        warn: '⚠️ ',
        error: '❌',
        debug: '🔍'
    };
    const prefijo = prefijos[level] || '•';
    
    if (typeof datos === 'object' && Object.keys(datos).length > 0) {
        console.log(`${prefijo} [${level.toUpperCase()}] ${mensaje}`, datos);
    } else {
        console.log(`${prefijo} [${level.toUpperCase()}] ${mensaje}`);
    }
}

/**
 * FUNCIÓN CRÍTICA: Calcula descuento basado en cantidad de boletos y promociones
 * Esta función se ejecuta en BACKEND para garantizar consistencia
 * Usa promociones DINÁMICAS de config.js si está disponible, con fallback a hardcodeadas
 * @param {number} cantidad - Número de boletos
 * @param {number} precioUnitario - Precio por boleto (obtiene dinámicamente si no se proporciona)
 * @returns {number} Monto de descuento en pesos
 */
/**
 * ✅ NUEVA FUNCIÓN: Calcula descuento de forma SINCRONIZADA con cliente
 * Usa calcularDescuentoCompartido() que implementa la MISMA lógica que config.js
 * Esto evita inconsistencias como el bug ST-AA074 (24k vs 25k)
 */
function calcularDescuentoBackend(cantidad, precioUnitario, config = null) {
    // Si no se proporciona precio, obtener dinámicamente desde config.json
    if (!precioUnitario) {
        precioUnitario = obtenerPrecioDinamico() || 15;
    }

    // Obtener reglas de descuento desde config si está disponible
    let reglas = null;
    if (config && config.rifa && config.rifa.descuentos && config.rifa.descuentos.reglas) {
        reglas = config.rifa.descuentos.reglas;
    }

    // ✅ USAR FUNCIÓN COMPARTIDA (misma lógica que cliente)
    // Pasar el config COMPLETO para que valide descuentos.enabled
    const resultado = calcularDescuentoCompartido(cantidad, precioUnitario, reglas, config);
    return resultado.monto;
}

// ===== HEALTH CHECK - CRÍTICO PARA PRODUCCIÓN =====
let dbHealthy = true;
let lastDbCheck = Date.now();

/**
 * Verifica salud de la conexión a BD
 * Se ejecuta en background cada 30 segundos
 */
async function verificarSaludBD() {
    try {
        // Query simple para verificar conectividad
        await db.raw('SELECT 1');
        dbHealthy = true;
        lastDbCheck = Date.now();
        // console.log('✅ BD health check OK');
    } catch (error) {
        console.error('❌ BD HEALTH CHECK FALLÓ:', error.message);
        dbHealthy = false;
        lastDbCheck = Date.now();
    }
}

// Verificar salud de BD cada 30 segundos
setInterval(verificarSaludBD, 30000);
// Verificación inicial
verificarSaludBD();

/**
 * 🎁 GUARDAR OPORTUNIDADES EN BACKGROUND
 * ================================================
 * Función helper que maneja el guardado asincrónico de oportunidades
 * Se ejecuta en background (setImmediate) sin bloquear la respuesta al cliente
 * 
 * @param {string} numeroOrden - Número de orden
 * @param {Array<number>} boletosOcultos - Array de números de oportunidades
 * @param {boolean} habilitadas - Si las oportunidades están habilitadas en config
 */
function obtenerUrlBasePublica(req, fallbackUrlBase = '') {
    if (fallbackUrlBase && /^https?:\/\//i.test(fallbackUrlBase)) {
        return fallbackUrlBase.replace(/\/+$/, '');
    }

    const forwardedProto = req.get('x-forwarded-proto');
    const protocol = (forwardedProto || req.protocol || 'https').split(',')[0].trim();
    const host = req.get('x-forwarded-host') || req.get('host');

    if (host) {
        return `${protocol}://${host}`.replace(/\/+$/, '');
    }

    return 'https://rifas-web.vercel.app';
}

function resolverUrlPublica(valor, baseUrl) {
    const valorNormalizado = String(valor || '').trim();
    const baseNormalizada = String(baseUrl || '').replace(/\/+$/, '');

    if (!valorNormalizado) return `${baseNormalizada}/images/ImgPrincipal.png`;
    if (/^https?:\/\//i.test(valorNormalizado)) return valorNormalizado;
    if (valorNormalizado.startsWith('//')) return `https:${valorNormalizado}`;
    if (!baseNormalizada) return valorNormalizado;
    if (valorNormalizado.startsWith('/')) return `${baseNormalizada}${valorNormalizado}`;
    return `${baseNormalizada}/${valorNormalizado.replace(/^\.?\//, '')}`;
}

function normalizarTemaConfig(tema = {}) {
    const coloresBase = tema.colores || {};
    const colorPrimario = tema.colorPrimario || coloresBase.colorPrimario || coloresBase.primary || '#1877F2';
    const colorAcento = tema.colorAcento || coloresBase.colorAccento || coloresBase.colorSecundario || coloresBase.secondary || colorPrimario;
    const colorFondo = tema.colorFondo || coloresBase.colorFondo || coloresBase.bgLight || '#F8FAFC';
    const colorSuperficie = tema.colorSuperficie || coloresBase.colorSuperficie || coloresBase.bgWhite || '#FFFFFF';
    const colorTexto = tema.colorTexto || coloresBase.colorTexto || coloresBase.textDark || colorAcento;

    const normalizarHex = (valor, fallback) => {
        const limpio = String(valor || '').trim();
        const match = limpio.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
        if (!match) return fallback;
        const hex = match[1];
        if (hex.length === 3) {
            return `#${hex.split('').map((char) => char + char).join('').toLowerCase()}`;
        }
        return `#${hex.toLowerCase()}`;
    };

    const hexToRgb = (hex) => {
        const value = normalizarHex(hex, '#000000').slice(1);
        return {
            r: parseInt(value.slice(0, 2), 16),
            g: parseInt(value.slice(2, 4), 16),
            b: parseInt(value.slice(4, 6), 16)
        };
    };

    const rgbToHex = ({ r, g, b }) => {
        const toHex = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };

    const mezclarHex = (colorA, colorB, ratioB = 0.5) => {
        const a = hexToRgb(colorA);
        const b = hexToRgb(colorB);
        const ratio = Math.max(0, Math.min(1, ratioB));
        return rgbToHex({
            r: a.r + ((b.r - a.r) * ratio),
            g: a.g + ((b.g - a.g) * ratio),
            b: a.b + ((b.b - a.b) * ratio)
        });
    };

    const ajustarLuminosidad = (color, factor = 0) => (
        factor >= 0
            ? mezclarHex(color, '#ffffff', factor)
            : mezclarHex(color, '#000000', Math.abs(factor))
    );

    const luminancia = (color) => {
        const { r, g, b } = hexToRgb(color);
        const canal = (valor) => {
            const normalizado = valor / 255;
            return normalizado <= 0.03928
                ? normalizado / 12.92
                : ((normalizado + 0.055) / 1.055) ** 2.4;
        };
        return (0.2126 * canal(r)) + (0.7152 * canal(g)) + (0.0722 * canal(b));
    };

    const contraste = (colorA, colorB) => {
        const l1 = luminancia(colorA);
        const l2 = luminancia(colorB);
        const claro = Math.max(l1, l2);
        const oscuro = Math.min(l1, l2);
        return (claro + 0.05) / (oscuro + 0.05);
    };

    const asegurarTexto = (textoPreferido, fondo, minimo = 4.5) => {
        const preferido = normalizarHex(textoPreferido, '#0f172a');
        if (contraste(preferido, fondo) >= minimo) return preferido;
        const oscuro = '#0f172a';
        const claro = '#ffffff';
        return contraste(claro, fondo) > contraste(oscuro, fondo) ? claro : oscuro;
    };

    const primario = normalizarHex(colorPrimario, '#1877f2');
    const acento = normalizarHex(colorAcento, '#0f172a');
    const fondo = normalizarHex(colorFondo, '#f8fafc');
    const superficie = normalizarHex(colorSuperficie, '#ffffff');
    const texto = asegurarTexto(colorTexto, superficie);
    const textoSecundario = asegurarTexto(coloresBase.colorTextoSecundario || coloresBase.textLight || mezclarHex(texto, superficie, 0.42), superficie, 3.6);

    return {
        ...tema,
        personalizado: tema.personalizado === true,
        preset: tema.preset || 'clasico',
        colorPrimario: primario,
        colorAcento: acento,
        colorFondo: fondo,
        colorSuperficie: superficie,
        colorTexto: texto,
        colores: {
            ...coloresBase,
            colorPrimario: primario,
            colorSecundario: coloresBase.colorSecundario || acento,
            colorAccento: coloresBase.colorAccento || acento,
            colorFondo: fondo,
            colorSuperficie: superficie,
            colorTexto: texto,
            colorTextoSecundario: textoSecundario,
            primary: coloresBase.primary || primario,
            primaryDark: coloresBase.primaryDark || ajustarLuminosidad(primario, -0.22),
            primaryLight: coloresBase.primaryLight || mezclarHex(primario, superficie, 0.82),
            secondary: coloresBase.secondary || acento,
            success: coloresBase.success || '#16a34a',
            danger: coloresBase.danger || '#dc2626',
            textDark: coloresBase.textDark || texto,
            textLight: coloresBase.textLight || textoSecundario,
            bgLight: coloresBase.bgLight || fondo,
            bgWhite: coloresBase.bgWhite || superficie,
            borderColor: coloresBase.borderColor || mezclarHex(texto, superficie, 0.84)
        }
    };
}

function normalizarSeoConfigParaPersistencia(seo = {}, configActual = {}) {
    const cliente = configActual.cliente || {};
    const rifa = configActual.rifa || {};
    const seoActual = configActual.seo || {};

    const titulo = seo.title || seo.titulo || seo.openGraph?.titulo || seo.twitter?.titulo || seoActual.title || seoActual.titulo || (rifa.nombreSorteo ? `${rifa.nombreSorteo}${cliente.nombre ? ` | ${cliente.nombre}` : ''}` : (cliente.nombre || 'Sorteos'));
    const descripcion = seo.description || seo.descripcion || seo.openGraph?.descripcion || seo.twitter?.descripcion || seoActual.description || seoActual.descripcion || rifa.descripcion || cliente.eslogan || (rifa.nombreSorteo ? `Participa en el sorteo de ${rifa.nombreSorteo}.` : 'Compra tus boletos en linea.');
    const imagen = seo.image || seo.imagen || seo.openGraph?.imagen || seo.twitter?.imagen || seoActual.image || seoActual.imagen || cliente.imagenPrincipal || cliente.logo || cliente.logotipo || '/images/ImgPrincipal.png';
    const palabrasLlave = seo.keywords || seo.palabrasLlave || seoActual.keywords || seoActual.palabrasLlave || `sorteo, rifa, ${rifa.nombreSorteo || ''}, ${cliente.nombre || 'Sorteos'}`.replace(/,\s*,/g, ',').trim();
    const urlBase = seo.urlBase || seoActual.urlBase || '';
    const autor = seo.author || seo.autor || seoActual.author || seoActual.autor || cliente.nombre || 'Sorteos';

    return {
        ...seoActual,
        ...seo,
        title: titulo,
        titulo,
        description: descripcion,
        descripcion,
        image: imagen,
        imagen,
        keywords: palabrasLlave,
        palabrasLlave,
        author: autor,
        autor,
        urlBase,
        openGraph: {
            ...(seoActual.openGraph || {}),
            ...(seo.openGraph || {}),
            titulo: seo.openGraph?.titulo || titulo,
            descripcion: seo.openGraph?.descripcion || descripcion,
            imagen: seo.openGraph?.imagen || imagen,
            tipo: seo.openGraph?.tipo || seoActual.openGraph?.tipo || 'website',
            locale: seo.openGraph?.locale || seoActual.openGraph?.locale || 'es_MX'
        },
        twitter: {
            ...(seoActual.twitter || {}),
            ...(seo.twitter || {}),
            card: seo.twitter?.card || seoActual.twitter?.card || 'summary_large_image',
            titulo: seo.twitter?.titulo || titulo,
            descripcion: seo.twitter?.descripcion || descripcion,
            imagen: seo.twitter?.imagen || imagen,
            creador: seo.twitter?.creador || seoActual.twitter?.creador || cliente.redesSociales?.twitter || ''
        }
    };
}

function construirMetadatosSeo(config = {}, req) {
    const cliente = config.cliente || {};
    const rifa = config.rifa || {};
    const seo = normalizarSeoConfigParaPersistencia(config.seo || {}, config);
    const tema = normalizarTemaConfig(config.tema || {});
    const urlBase = obtenerUrlBasePublica(req, seo.urlBase);
    const titulo = seo.title || seo.titulo;
    const descripcion = seo.description || seo.descripcion;
    const og = seo.openGraph || {};
    const twitter = seo.twitter || {};
    const imagen = resolverUrlPublica(seo.image || seo.imagen, urlBase);

    return {
        title: titulo,
        description: descripcion,
        keywords: seo.keywords || seo.palabrasLlave || `sorteo, rifa, ${rifa.nombreSorteo || ''}, ${cliente.nombre || 'Sorteos'}`,
        author: seo.author || seo.autor || cliente.nombre || 'Sorteos',
        og: {
            title: og.titulo || titulo,
            description: og.descripcion || descripcion,
            image: resolverUrlPublica(og.imagen || imagen, urlBase),
            url: urlBase,
            type: og.tipo || 'website',
            locale: og.locale || 'es_MX',
            site_name: cliente.nombre || 'Sorteos'
        },
        twitter: {
            card: twitter.card || 'summary_large_image',
            title: twitter.titulo || titulo,
            description: twitter.descripcion || descripcion,
            image: resolverUrlPublica(twitter.imagen || imagen, urlBase),
            creator: twitter.creador || cliente.redesSociales?.twitter || ''
        },
        canonical: urlBase,
        robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
        themeColor: tema.colorPrimario || tema.colores?.colorPrimario || '#1877F2'
    };
}

function escaparHtmlAttr(valor) {
    return String(valor || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ===== ENDPOINT CRÍTICO: OPEN GRAPH PARA REDES SOCIALES =====
// Sirve HTML dinámico con meta tags cuando lo solicita WhatsApp, Facebook, etc.
app.get('/og', (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const metadatos = construirMetadatosSeo(config, req);

        const metaTags = `
<meta property="og:title" content="${escaparHtmlAttr(metadatos.og.title)}" />
<meta property="og:description" content="${escaparHtmlAttr(metadatos.og.description)}" />
<meta property="og:image" content="${escaparHtmlAttr(metadatos.og.image)}" />
<meta property="og:url" content="${escaparHtmlAttr(metadatos.og.url)}" />
<meta property="og:type" content="${escaparHtmlAttr(metadatos.og.type)}" />
<meta property="og:locale" content="${escaparHtmlAttr(metadatos.og.locale)}" />
<meta property="og:site_name" content="${escaparHtmlAttr(metadatos.og.site_name)}" />
<meta name="twitter:card" content="${escaparHtmlAttr(metadatos.twitter.card)}" />
<meta name="twitter:title" content="${escaparHtmlAttr(metadatos.twitter.title)}" />
<meta name="twitter:description" content="${escaparHtmlAttr(metadatos.twitter.description)}" />
<meta name="twitter:image" content="${escaparHtmlAttr(metadatos.twitter.image)}" />
        `;

        const indexPath = path.join(__dirname, '../index.html');
        let html = fs.readFileSync(indexPath, 'utf8');

        html = html.replace(
            /<title>.*?<\/title>/,
            `<title>${escaparHtmlAttr(metadatos.title)}</title>`
        );

        html = html.replace(
            /(<meta name="viewport"[^>]*>)/,
            `$1\n    ${metaTags}`
        );

        html = html.replace(
            /(<meta name="description" content=")([^"]*)/,
            `$1${escaparHtmlAttr(metadatos.description)}`
        );

        res.type('text/html').send(html);

        console.log(`✅ Open Graph servido dinámicamente para: ${req.get('user-agent')?.substring(0, 50)}`);
    } catch (error) {
        console.error('❌ Error sirviendo Open Graph:', error.message);
        res.status(500).json({ error: 'Error sirviendo página' });
    }
});

/**
 * GET /api/public/sorteo-info - Información pública del sorteo para Open Graph
 * Devuelve nombre, descripción y configuración del sorteo desde config.js
 * Usado por Open Graph y frontend para valores dinámicos
 */
app.get('/api/public/sorteo-info', (req, res) => {
    try {
        // Leer config.js del frontend
        const configPath = path.join(__dirname, '../js/config.js');
        const configContent = fs.readFileSync(configPath, 'utf8');
        
        // Extraer valores usando regex
        const clienteNombreMatch = configContent.match(/nombre:\s*"([^"]+)"/);
        const rifaTituloMatch = configContent.match(/nombreSorteo:\s*"([^"]+)"/);
        const rifaDescripcionMatch = configContent.match(/descripcion:\s*"([^"]+)"/);
        const totalBoletosMatch = configContent.match(/totalBoletos:\s*(\d+)/);
        const precioBoletaMatch = configContent.match(/precioBoleto:\s*(\d+)/);
        
        const clienteNombre = clienteNombreMatch ? clienteNombreMatch[1] : 'SORTEOS EL TREBOL';
        const rifaTitulo = rifaTituloMatch ? rifaTituloMatch[1] : 'Sorteo';
        const rifaDescripcion = rifaDescripcionMatch ? rifaDescripcionMatch[1] : 'Compra tus boletos en linea';
        const totalBoletos = totalBoletosMatch ? parseInt(totalBoletosMatch[1]) : 1000000;
        const precioBoleta = precioBoletaMatch ? parseInt(precioBoletaMatch[1]) : 15;
        
        res.json({
            cliente: clienteNombre,
            titulo: rifaTitulo,
            descripcion: rifaDescripcion,
            titulo_completo: `${clienteNombre} - Gana ${rifaTitulo}`,
            descripcion_completa: `Participa en ${clienteNombre}. ${rifaDescripcion}. Sorteo 100% transparente en vivo.`,
            totalBoletos: totalBoletos,
            precioBoleta: precioBoleta
        });
        
        console.log(`✅ /api/public/sorteo-info: ${clienteNombre} - ${totalBoletos} boletos @ $${precioBoleta}`);
    } catch (error) {
        console.error('❌ Error en /api/public/sorteo-info:', error.message);
        res.json({
            cliente: 'SORTEOS EL TREBOL',
            titulo: 'Sorteo',
            descripcion: 'Compra tus boletos en linea',
            titulo_completo: 'SORTEOS EL TREBOL - Sorteo 100% Transparente',
            descripcion_completa: 'Participa en SORTEOS EL TREBOL. Sorteo 100% transparente en vivo.'
        });
    }
});

// Rutas
app.get('/', (req, res) => {
    res.json({ 
        mensaje: 'API RifaPlus - Servidor en funcionamiento',
        version: '2.2',
        auth: 'JWT habilitado',
        seguridad: 'rate-limiting + sanitización + helmet'
    });
});

/**
 * GET /api/health - CRITICAL PARA PRODUCCIÓN
 * Endpoint de health check para load balancers, monitoring
 * Verifica:
 * - Servidor Express corriendo ✅
 * - Conexión a base de datos ✅
 * - Uptime
 */
app.get('/api/health', (req, res) => {
    const health = {
        status: dbHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
            healthy: dbHealthy,
            lastCheck: new Date(lastDbCheck).toISOString()
        },
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
        }
    };

    // Si BD está mal, devolver 503 Service Unavailable
    const statusCode = dbHealthy ? 200 : 503;
    res.status(statusCode).json(health);
});

/**
 * POST /api/admin/login
 * Autentica usuario admin y devuelve JWT
 * Body: { username: 'admin', password: 'admin123' }
 * Protegido con rate limiting
 */
app.post('/api/admin/login', limiterLogin, async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validar entrada
        if (!username || !password) {
            log('warn', 'Intento de login sin credenciales', { ip: req.ip });
            return res.status(400).json({
                success: false,
                message: 'Usuario y contraseña requeridos'
            });
        }

        // Sanitizar username (prevenir inyección)
        const usernameSanitizado = sanitizar(username);
        if (usernameSanitizado.length === 0) {
            log('warn', 'Username vacío después de sanitizar', { ip: req.ip });
            return res.status(400).json({
                success: false,
                message: 'Usuario inválido'
            });
        }

        // Buscar usuario en BD
        const usuario = await db('admin_users').where('username', usernameSanitizado).first();

        if (!usuario || !usuario.activo) {
            log('warn', 'Intento de login fallido', { username: usernameSanitizado, ip: req.ip });
            return res.status(401).json({
                success: false,
                message: 'Usuario o contraseña incorrectos'
            });
        }

        // Verificar contraseña
        const passwordValida = await bcrypt.compare(password, usuario.password_hash);

        if (!passwordValida) {
            return res.status(401).json({
                success: false,
                message: 'Usuario o contraseña incorrectos'
            });
        }

        // Generar JWT
        // ✅ Validar que el rol sea válido, sino usar 'gestor_ordenes' como default
        const rolesValidos = ['administrador', 'gestor_ordenes'];
        const rolJWT = rolesValidos.includes(usuario.rol) ? usuario.rol : 'gestor_ordenes';
        
        const token = jwt.sign(
            { 
                id: usuario.id, 
                username: usuario.username, 
                email: usuario.email,
                rol: rolJWT  // ✅ Incluir rol validado en JWT
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        // Nota: La columna último_acceso no existe en admin_users, así que omitimos esta actualización
        // await db('admin_users').where('id', usuario.id).update({
        //     ultimo_acceso: new Date()
        // });

        log('info', 'Login exitoso', { username: usuario.username, ip: req.ip });

        return res.json({
            success: true,
            token: token,
            usuario: {
                id: usuario.id,
                username: usuario.username,
                email: usuario.email
            },
            expiresIn: JWT_EXPIRES_IN
        });
    } catch (error) {
        log('error', 'POST /api/admin/login error', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Error al autenticar',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/admin/verify-token
 * Verifica que el token enviado sea válido
 * Útil para debugging
 */
app.get('/api/admin/verify-token', verificarToken, (req, res) => {
    res.json({
        success: true,
        message: 'Token válido',
        usuario: req.usuario
    });
});

/**
 * POST /api/admin/logout
 * Endpoint de logout (principalmente para limpiar token en cliente)
 */
app.post('/api/admin/logout', verificarToken, (req, res) => {
    // JWT es stateless, no hay nada que limpiar en servidor
    // El cliente simplemente descarta el token
    res.json({
        success: true,
        message: 'Sesión cerrada'
    });
});

/* ============================================================ */
/* SECCIÓN: GESTIÓN DE USUARIOS ADMIN                          */
/* ============================================================ */

/**
 * GET /api/admin/users
 * Obtiene lista de todos los usuarios admin
 * Requiere autenticación
 */
app.get('/api/admin/users', verificarToken, async (req, res) => {
    try {
        if (req.usuario.rol !== 'administrador') {
            return res.status(403).json({
                success: false,
                message: 'Permiso denegado: Solo administradores pueden ver usuarios'
            });
        }

        const usuarios = await db('admin_users')
            .select('id', 'username', 'email', 'rol', 'activo', 'created_at')
            .orderBy('username', 'asc');

        res.json({
            success: true,
            data: usuarios
        });
    } catch (error) {
        log('error', 'GET /api/admin/users error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error al obtener usuarios'
        });
    }
});

/**
 * POST /api/admin/users
 * Crea un nuevo usuario admin
 * Body: { username, email, password, rol }
 * Roles: admin, operador, solo_lectura
 */
app.post('/api/admin/users', verificarToken, async (req, res) => {
    try {
        // ✅ VALIDACIÓN: Solo administradores pueden crear usuarios
        if (req.usuario.rol !== 'administrador') {
            return res.status(403).json({
                success: false,
                message: 'Permiso denegado: Solo administradores pueden crear usuarios'
            });
        }

        const { username, email, password, rol } = req.body;

        // Validaciones
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username, email y password son requeridos'
            });
        }

        const usernameSanitizado = sanitizar(username);
        const emailSanitizado = sanitizar(email);
        const rolValido = ['administrador', 'gestor_ordenes'].includes(rol) ? rol : 'gestor_ordenes';

        if (usernameSanitizado.length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Username debe tener al menos 3 caracteres'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password debe tener al menos 8 caracteres'
            });
        }

        // Verificar que el usuario no exista
        const existe = await db('admin_users').where('username', usernameSanitizado).first();
        if (existe) {
            return res.status(400).json({
                success: false,
                message: 'El usuario ya existe'
            });
        }

        // Hashear password
        const passwordHash = await bcrypt.hash(password, 10);

        // Crear usuario
        const id = await db('admin_users').insert({
            username: usernameSanitizado,
            email: emailSanitizado,
            password_hash: passwordHash,
            rol: rolValido,
            activo: true,
            created_at: new Date(),
            updated_at: new Date()
        });

        log('info', 'POST /api/admin/users - Usuario creado', { username: usernameSanitizado, id: id[0] });

        res.status(201).json({
            success: true,
            message: 'Usuario creado exitosamente',
            usuario: {
                id: id[0],
                username: usernameSanitizado,
                email: emailSanitizado,
                rol: rolValido
            }
        });
    } catch (error) {
        log('error', 'POST /api/admin/users error', { error: error.message });
        
        // Manejar errores de constraint violation de la base de datos
        if (error.message && error.message.includes('unique constraint')) {
            if (error.message.includes('username')) {
                return res.status(400).json({
                    success: false,
                    message: `El usuario "${usernameSanitizado}" ya existe. Elige otro.`
                });
            }
            if (error.message.includes('email')) {
                return res.status(400).json({
                    success: false,
                    message: `El email "${emailSanitizado}" ya está registrado.`
                });
            }
        }
        
        res.status(500).json({
            success: false,
            message: 'Error al crear usuario',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * PUT /api/admin/users/:id
 * Actualiza datos de un usuario admin (nombre, email, rol, contraseña)
 * Body: { username, email, rol, password (opcional) }
 */
app.put('/api/admin/users/:id', verificarToken, async (req, res) => {
    try {
        // ✅ VALIDACIÓN: Solo administradores pueden actualizar usuarios
        if (req.usuario.rol !== 'administrador') {
            return res.status(403).json({
                success: false,
                message: 'Permiso denegado: Solo administradores pueden actualizar usuarios'
            });
        }

        const usuarioId = parseInt(req.params.id);
        const { username, email, rol, password } = req.body;
        const isCurrentUser = req.usuario.id === usuarioId;

        // Validaciones básicas
        if (!username || !email) {
            return res.status(400).json({
                success: false,
                message: 'Username y email son requeridos'
            });
        }

        const usernameSanitizado = sanitizar(username);
        const emailSanitizado = sanitizar(email);
        
        // ✅ Si es el usuario actual, NO permitir cambiar el rol
        // Si no es el usuario actual, el rol es requerido
        let rolValido = null;
        if (isCurrentUser) {
            // Usuario no puede cambiar su propio rol
            rolValido = req.usuario.rol;  // Mantener el rol actual
        } else {
            // Validar rol solo si no es el usuario actual
            if (!rol) {
                return res.status(400).json({
                    success: false,
                    message: 'Rol es requerido'
                });
            }
            rolValido = ['administrador', 'gestor_ordenes'].includes(rol) ? rol : 'gestor_ordenes';
        }

        if (usernameSanitizado.length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Username debe tener al menos 3 caracteres'
            });
        }

        // Verificar que el usuario existe
        const usuarioActual = await db('admin_users').where('id', usuarioId).first();
        if (!usuarioActual) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Verificar que no cambie a un username ya existente (si lo intenta cambiar)
        if (usernameSanitizado !== usuarioActual.username) {
            const existe = await db('admin_users').where('username', usernameSanitizado).first();
            if (existe) {
                return res.status(400).json({
                    success: false,
                    message: `El usuario "${usernameSanitizado}" ya existe`
                });
            }
        }

        // Verificar que no cambie a un email ya existente (si lo intenta cambiar)
        if (emailSanitizado !== usuarioActual.email) {
            const existe = await db('admin_users').where('email', emailSanitizado).first();
            if (existe) {
                return res.status(400).json({
                    success: false,
                    message: `El email "${emailSanitizado}" ya está registrado`
                });
            }
        }

        // Preparar actualización
        const actualizacion = {
            username: usernameSanitizado,
            email: emailSanitizado,
            rol: rolValido,
            updated_at: new Date()
        };

        // Si se proporciona contraseña, validar y usarla
        if (password) {
            if (password.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: 'La contraseña debe tener al menos 8 caracteres'
                });
            }

            // Hashear nueva contraseña
            const passwordHash = await bcrypt.hash(password, 10);
            actualizacion.password_hash = passwordHash;
        }

        // Actualizar usuario en BD
        await db('admin_users').where('id', usuarioId).update(actualizacion);

        log('info', 'PUT /api/admin/users/:id - Usuario actualizado', { 
            usuario_id: usuarioId, 
            actualizado_por: req.usuario.username,
            cambios: Object.keys(actualizacion).filter(k => k !== 'updated_at').join(', ')
        });

        res.json({
            success: true,
            message: 'Usuario actualizado exitosamente',
            usuario: {
                id: usuarioId,
                username: usernameSanitizado,
                email: emailSanitizado,
                rol: rolValido
            }
        });
    } catch (error) {
        log('error', 'PUT /api/admin/users/:id error', { error: error.message });
        
        res.status(500).json({
            success: false,
            message: 'Error al actualizar usuario',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/admin/change-password
 * Permite cambiar contraseña:
 * - Usuario cambia su propia contraseña (requiere password_actual)
 * - Admin cambia contraseña de otro usuario (requiere user_id y password_actual del usuario)
 * Body: { password_actual, password_nueva, password_repetida, user_id (opcional) }
 */
app.post('/api/admin/change-password', verificarToken, async (req, res) => {
    try {
        const { password_actual, password_nueva, password_repetida, user_id } = req.body;
        const usuarioAutenticado = req.usuario.id;
        const esAdmin = req.usuario.rol === 'administrador';

        // Validaciones
        if (!password_actual || !password_nueva || !password_repetida) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos de contraseña son requeridos'
            });
        }

        if (password_nueva.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'La nueva contraseña debe tener al menos 8 caracteres'
            });
        }

        if (!/[A-Z]/.test(password_nueva)) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña debe incluir al menos una mayúscula'
            });
        }

        if (!/[0-9]/.test(password_nueva)) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña debe incluir al menos un número'
            });
        }

        if (password_nueva !== password_repetida) {
            return res.status(400).json({
                success: false,
                message: 'Las contraseñas no coinciden'
            });
        }

        // Determinar cuál usuario está siendo actualizado
        let idUsuarioAActualizar = usuarioAutenticado;
        
        if (user_id) {
            // Si se especifica user_id, solo admins pueden cambiar contraseña de otros
            if (!esAdmin) {
                return res.status(403).json({
                    success: false,
                    message: 'No tienes permiso para cambiar la contraseña de otros usuarios'
                });
            }
            idUsuarioAActualizar = user_id;
        }

        // Obtener usuario actual (el que está siendo actualizado)
        const usuario = await db('admin_users').where('id', idUsuarioAActualizar).first();
        if (!usuario) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Verificar password actual
        const passwordValida = await bcrypt.compare(password_actual, usuario.password_hash);
        if (!passwordValida) {
            return res.status(401).json({
                success: false,
                message: 'La contraseña actual es incorrecta'
            });
        }

        // Verificar que no sea la misma
        const mismPassword = await bcrypt.compare(password_nueva, usuario.password_hash);
        if (mismPassword) {
            return res.status(400).json({
                success: false,
                message: 'La nueva contraseña debe ser diferente a la actual'
            });
        }

        // Hashear nueva password
        const nuevoHash = await bcrypt.hash(password_nueva, 10);

        // Actualizar en BD
        await db('admin_users').where('id', idUsuarioAActualizar).update({
            password_hash: nuevoHash,
            updated_at: new Date()
        });

        log('info', 'POST /api/admin/change-password - Password cambiado', { 
            usuario_id: idUsuarioAActualizar,
            cambiad_por: usuarioAutenticado 
        });

        res.json({
            success: true,
            message: 'Contraseña cambiada exitosamente'
        });
    } catch (error) {
        log('error', 'POST /api/admin/change-password error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error al cambiar contraseña: ' + error.message
        });
    }
});

/**
 * DELETE /api/admin/users/:id
 * Elimina un usuario admin
 * Solo admin puede eliminar otros usuarios
 */
app.delete('/api/admin/users/:id', verificarToken, async (req, res) => {
    try {
        // ✅ VALIDACIÓN: Solo administradores pueden eliminar usuarios
        if (req.usuario.rol !== 'administrador') {
            return res.status(403).json({
                success: false,
                message: 'Permiso denegado: Solo administradores pueden eliminar usuarios'
            });
        }

        const usuarioId = parseInt(req.params.id);

        // Validar que no se elimine a sí mismo
        if (usuarioId === req.usuario.id) {
            return res.status(400).json({
                success: false,
                message: 'No puedes eliminar tu propia cuenta'
            });
        }

        // Verificar que el usuario existe
        const usuario = await db('admin_users').where('id', usuarioId).first();
        if (!usuario) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Borrar usuario
        await db('admin_users').where('id', usuarioId).del();

        log('info', 'DELETE /api/admin/users/:id - Usuario eliminado', { usuario_id: usuarioId, eliminado_por: req.usuario.username });

        res.json({
            success: true,
            message: 'Usuario eliminado exitosamente'
        });
    } catch (error) {
        log('error', 'DELETE /api/admin/users/:id error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error al eliminar usuario'
        });
    }
});

/**
 * GET /api/admin/config
 * Obtiene la configuración del sistema
 */
/**
 * GET /api/public/config
 * Devuelve la configuración pública del sorteo (sin datos sensibles)
 * Lee directamente desde config.json para garantizar sincronía con cambios del admin
 */
app.get('/api/public/config', (req, res) => {
    try {
        // Leer desde config.json para obtener valores dinámicos
        let config = {
            totalBoletos: null,
            precioBoleto: null,
            tiempoApartadoHoras: null,
            intervaloLimpiezaMinutos: null,
            rifa: {}
        };
        
        let sistemaPremios = null;
        let cuentasBancarias = [];
        
        try {
            const configPath = path.join(__dirname, 'config.json');
            console.log('[GET /api/public/config] Leyendo:', configPath);
            
            const configData = fs.readFileSync(configPath, 'utf8');
            const jsonConfig = JSON.parse(configData);
            
            // Obtener valores desde config.json (dinámicos)
            config.totalBoletos = jsonConfig.rifa?.totalBoletos;
            config.precioBoleto = jsonConfig.rifa?.precioBoleto;
            config.tiempoApartadoHoras = jsonConfig.rifa?.tiempoApartadoHoras;
            config.intervaloLimpiezaMinutos = jsonConfig.rifa?.intervaloLimpiezaMinutos;
            config.rifa = jsonConfig.rifa;
            
            sistemaPremios = jsonConfig.rifa?.sistemaPremios;
            cuentasBancarias = jsonConfig.tecnica?.bankAccounts || [];
            
            console.log(`[GET /api/public/config] ✅ Config: ${config.totalBoletos} boletos, $${config.precioBoleto} por boleto`);
        } catch (e) {
            console.error('[GET /api/public/config] ❌ Error leyendo config.json:', e.message);
            // Fallback a config.js si config.json falla
            const fallbackConfig = obtenerConfigExpiracion();
            config.totalBoletos = fallbackConfig.totalBoletos;
            config.precioBoleto = fallbackConfig.precioBoleto;
            config.tiempoApartadoHoras = fallbackConfig.tiempoApartadoHoras;
            config.intervaloLimpiezaMinutos = fallbackConfig.intervaloLimpiezaMinutos;
        }

        res.json({
            success: true,
            data: {
                totalBoletos: config.totalBoletos,
                precioBoleto: config.precioBoleto,
                tiempoApartadoHoras: config.tiempoApartadoHoras,
                intervaloLimpiezaMinutos: config.intervaloLimpiezaMinutos,
                sistemaPremios: sistemaPremios,
                rifa: config.rifa,
                // 🏦 Agregar cuentas bancarias a la respuesta pública
                cuentas: cuentasBancarias
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error obteniendo configuración',
            error: error.message
        });
    }
});

/**
 * GET /api/og-metadata - METADATOS DINÁMICOS PARA BOTS (Open Graph, Twitter, SEO)
 * 
 * IMPORTANTE PARA PRODUCCIÓN:
 * Cuando Facebook, WhatsApp, Twitter, LinkedIn hacen "crawl" (a través de bots),
 * reciben METADATOS DINÁMICOS basados en config.json actual.
 * 
 * Así la vista previa en redes sociales SIEMPRE muestra:
 * ✅ Título actual del sorteo
 * ✅ Descripción correcta
 * ✅ Imagen del sorteo (logotipo o imagen principal)
 * ✅ Datos de la organización actuales
 * 
 * @returns {JSON} Metadatos listos para inyectar en <head>
 */
app.get('/api/og-metadata', (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({
                success: false,
                message: 'config.json no encontrado'
            });
        }

        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);

        const metadatosConstruidos = construirMetadatosSeo(config, req);

        const metadatos = {
            success: true,
            data: {
                ...metadatosConstruidos,
                viewport: 'width=device-width, initial-scale=1.0'
            }
        };

        // Responder con metadatos
        res.json(metadatos);
        
        // Log para debugging
        console.log('✅ [OG-Metadata] Generados metadatos dinámicos:', {
            titulo: String(metadatosConstruidos.title || '').substring(0, 50) + '...',
            canonical: metadatosConstruidos.canonical,
            image: metadatosConstruidos.og?.image
        });

    } catch (error) {
        console.error('❌ [OG-Metadata] Error:', error);
        if (res.headersSent) {
            return;
        }
        return res.status(500).json({
            success: false,
            message: 'Error generando metadatos',
            error: error.message
        });
    }
});

app.get('/api/admin/config', verificarToken, async (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);

        res.json({
            success: true,
            data: {
                // Datos del cliente
                cliente: config.cliente || {},
                // Datos de la rifa
                rifa: config.rifa || {},
                // Redes sociales
                redesSociales: config.cliente?.redesSociales || {},
                // Cuentas bancarias
                cuentas: config.tecnica?.bankAccounts || [],
                // Premios (por compatibilidad)
                sistemaPremios: config.rifa?.sistemaPremios || {},
                seo: config.seo || {},
                tema: config.tema || {},
                publicacion: config.rifa?.publicacion || {},
                // Otros campos necesarios
                totalBoletos: config.rifa?.totalBoletos,
                precioBoleto: config.rifa?.precioBoleto,
                tiempoApartadoHoras: config.rifa?.tiempoApartadoHoras
            }
        });
    } catch (error) {
        log('error', 'GET /api/admin/config error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error al obtener configuración',
            error: error.message
        });
    }
});

/**
 * POST /api/admin/cloudinary-signature 🎬 NUEVA FEATURE
 * Genera una firma para upload directo a Cloudinary desde el navegador
 * 
 * Cliente necesita:
 * - signature: para autenticarse con Cloudinary
 * - timestamp: para validar la firma
 * - cloud_name: para saber dónde subir
 * - api_key: clave pública de Cloudinary
 */
app.post('/api/admin/upload-image', verificarToken, async (req, res) => {
    try {
        // Validar que Cloudinary esté configurado
        if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
            return res.status(400).json({
                success: false,
                message: 'Cloudinary no está configurado en el servidor'
            });
        }

        // Validar que haya un archivo
        if (!req.files || !req.files.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const file = req.files.file;

        // Validar tipo de archivo
        if (!file.mimetype.startsWith('image/')) {
            return res.status(400).json({
                success: false,
                message: 'Solo se permiten imágenes'
            });
        }

        // Validar tamaño (máximo 10MB)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            return res.status(400).json({
                success: false,
                message: `Archivo muy grande. Máximo 10MB`
            });
        }

        // Subir a Cloudinary
        const uploadResult = await cloudinary.uploader.upload_stream(
            {
                folder: 'rifaplus/sorteos',
                resource_type: 'auto',
                secure: true
            },
            (error, result) => {
                if (error) throw error;
                return result;
            }
        );

        // Promise-based upload
        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'rifaplus/sorteos',
                    resource_type: 'auto',
                    secure: true
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            uploadStream.end(file.data);
        });

        console.log('✅ [Upload-Image] Imagen subida a Cloudinary:', {
            userId: req.user?.id,
            url: result.secure_url,
            publicId: result.public_id,
            size: result.bytes
        });

        res.json({
            success: true,
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            size: result.bytes
        });
    } catch (error) {
        console.error('❌ [Upload-Image] Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error al subir imagen a Cloudinary',
            error: error.message
        });
    }
});

/**
 * DELETE /api/admin/cloudinary-image 🗑️ NUEVA FEATURE
 * Elimina una imagen de Cloudinary usando su public_id
 */
app.delete('/api/admin/cloudinary-image', verificarToken, async (req, res) => {
    try {
        const { publicId } = req.body;

        if (!publicId) {
            return res.status(400).json({
                success: false,
                message: 'public_id es requerido'
            });
        }

        // Validar que Cloudinary esté configurado
        if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
            return res.status(400).json({
                success: false,
                message: 'Cloudinary no está configurado'
            });
        }

        // Eliminar imagen de Cloudinary
        await cloudinary.uploader.destroy(publicId, {
            resource_type: 'image'
        });

        console.log('🗑️ [Cloudinary-Delete] Imagen eliminada:', {
            publicId,
            userId: req.user?.id
        });

        res.json({
            success: true,
            message: 'Imagen eliminada de Cloudinary',
            publicId
        });
    } catch (error) {
        console.error('❌ [Cloudinary-Delete] Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar imagen',
            error: error.message
        });
    }
});

/**
 * PATCH /api/admin/config - VERSIÓN PRODUCTION-READY 🚀
 * Actualiza la configuración del sistema con:
 * - File lock (previene race conditions)
 * - Backup automático
 * - Sanitización XSS
 * - Validación estricta
 * - Escritura asincrónica
 * - Transacciones atómicas (o-todo-o-nada)
 */
app.patch('/api/admin/config', verificarToken, async (req, res) => {
    const configPath = path.join(__dirname, 'config.json');
    let release = null;
    
    try {
        // 🔍 DEBUG: Log del body recibido
        console.log('[PATCH /api/admin/config] 📥 Body recibido:', {
            tieneCliente: !!req.body.cliente,
            tieneRifa: !!req.body.rifa,
            tieneRedesSociales: !!req.body.redesSociales,
            tieneBankAccounts: !!req.body.tecnica?.bankAccounts,
            clienteKeys: req.body.cliente ? Object.keys(req.body.cliente) : [],
            rifaKeys: req.body.rifa ? Object.keys(req.body.rifa) : [],
            rifaPrecioBoleto: req.body.rifa?.precioBoleto,
            tienePromocionPorTiempo: !!req.body.rifa?.promocionPorTiempo,
            promocionPorTiempoFull: req.body.rifa?.promocionPorTiempo
        });
        
        // ✅ VALIDACIÓN: Solo administradores pueden actualizar config
        if (req.usuario.rol !== 'administrador') {
            return res.status(403).json({
                success: false,
                message: 'Permiso denegado: Solo administradores pueden actualizar configuración'
            });
        }

        // 🔄 FLEXIBILIDAD: systemaPremios es OPCIONAL
        // - Si viene, procesa premios
        // - Si NO viene pero vienen cuentas/otros datos, solo procesa esos
        let sistemaPremios = req.body.sistemaPremios;
        const requiereSystemaPremios = !!sistemaPremios;
        
        // Si viene en la estructura rifa.modalidadGanadores, transformar
        if (!sistemaPremios && req.body.rifa?.modalidadGanadores) {
            const modalidad = req.body.rifa.modalidadGanadores;
            // Transformar estructura legacy a sistemaPremios
            // Solo guardar los ruletazos si existen
            sistemaPremios = {
                enabled: true,
                mensaje: 'Múltiples oportunidades de ganar premios extraordinarios',
                sorteo: [],
                presorteo: [],
                ruletazos: Array.isArray(modalidad.premiosRuletazo) ? modalidad.premiosRuletazo : []
            };
        }
        
        // ⚠️ VALIDACIÓN: Debe venir sistemaPremios O tecnica.bankAccounts u otros campos
        if (!sistemaPremios && !req.body.tecnica?.bankAccounts && !req.body.cliente && !req.body.rifa && !req.body.redesSociales) {
            return res.status(400).json({
                success: false,
                message: 'Debe enviar al menos sistemaPremios, bankAccounts, cliente, rifa o redesSociales'
            });
        }

        // 🔒 PASO 1: Adquirir file lock (máx 10 segundos)
        try {
            release = await lockfile.lock(configPath, {
                realpath: false,
                retries: {
                    retries: 50,
                    minTimeout: 100,
                    maxTimeout: 200
                }
            });
        } catch (lockError) {
            return res.status(503).json({
                success: false,
                message: 'Servidor ocupado. Intenta de nuevo en unos segundos',
                error: 'LOCK_TIMEOUT'
            });
        }

        // 📖 PASO 2: Leer config actual
        let configData;
        try {
            configData = fs.readFileSync(configPath, 'utf8');
        } catch (readError) {
            return res.status(500).json({
                success: false,
                message: 'Error leyendo configuración',
                error: readError.message
            });
        }

        let config;
        try {
            config = JSON.parse(configData);
        } catch (parseError) {
            return res.status(500).json({
                success: false,
                message: 'Error parseando configuración (config.json corrupto)',
                error: parseError.message
            });
        }

        // ✔️ PASO 3: Validar estructura de sistemaPremios (SOLO si fue enviado)
        if (requiereSystemaPremios) {
            // Hacer validaciones más flexibles para arrays que pueden ser vacíos o null
            if (sistemaPremios.sorteo !== undefined && !Array.isArray(sistemaPremios.sorteo)) {
                return res.status(400).json({
                    success: false,
                    message: 'sistemaPremios.sorteo debe ser un array'
                });
            }
            if (sistemaPremios.presorteo !== undefined && !Array.isArray(sistemaPremios.presorteo)) {
                return res.status(400).json({
                    success: false,
                    message: 'sistemaPremios.presorteo debe ser un array'
                });
            }
            if (sistemaPremios.ruletazos !== undefined && !Array.isArray(sistemaPremios.ruletazos)) {
                return res.status(400).json({
                    success: false,
                    message: 'sistemaPremios.ruletazos debe ser un array'
                });
            }
            
            // Asegurar que sean arrays (vacíos si no existen)
            if (!Array.isArray(sistemaPremios.sorteo)) sistemaPremios.sorteo = [];
            if (!Array.isArray(sistemaPremios.presorteo)) sistemaPremios.presorteo = [];
            if (!Array.isArray(sistemaPremios.ruletazos)) sistemaPremios.ruletazos = [];

            // 🔐 PASO 4: Sanitizar y validar cada premio
            try {
                // Validar y sanitizar sorteo
                sistemaPremios.sorteo = sistemaPremios.sorteo.map((premio, idx) => ({
                    posicion: parseInt(premio.posicion) || (idx + 1),
                    nombre: validarCampoPremio('nombre', premio.nombre),
                    premio: validarCampoPremio('premio', premio.premio),
                    descripcion: validarCampoPremio('descripcion', premio.descripcion || ''),
                    icono: (premio.icono || '🎁').substring(0, 10) // Max 10 chars emoji
                }));

                // Validar y sanitizar presorteo
                sistemaPremios.presorteo = sistemaPremios.presorteo.map((premio, idx) => ({
                    posicion: parseInt(premio.posicion) || (idx + 1),
                    nombre: validarCampoPremio('nombre', premio.nombre),
                    premio: validarCampoPremio('premio', premio.premio),
                    descripcion: validarCampoPremio('descripcion', premio.descripcion || ''),
                    icono: (premio.icono || '🎁').substring(0, 10)
                }));

                // Validar y sanitizar ruletazos
                sistemaPremios.ruletazos = sistemaPremios.ruletazos.map((premio, idx) => ({
                    posicion: parseInt(premio.posicion) || (idx + 1),
                    nombre: validarCampoPremio('nombre', premio.nombre),
                    premio: validarCampoPremio('premio', premio.premio),
                    descripcion: validarCampoPremio('descripcion', premio.descripcion || ''),
                    icono: (premio.icono || '🎰').substring(0, 10)
                }));
            } catch (validationError) {
                return res.status(400).json({
                    success: false,
                    message: 'Validación fallida: ' + validationError.message
                });
            }
        }

        // 💾 PASO 5: Crear backup automático ANTES de actualizar
        await crearBackupConfig(configPath);

        // 🔄 PASO 6: Actualizar configuración (transacción atómica)
        // Actualizar sistemaPremios SOLO si fue enviado
        if (requiereSystemaPremios) {
            config.rifa.sistemaPremios = sistemaPremios;
            if (!Array.isArray(sistemaPremios.presorteo) || sistemaPremios.presorteo.length === 0) {
                config.rifa.fechaPresorteo = null;
                config.rifa.horaPresorteo = '';
                config.rifa.fechaPresorteoFormato = '';
                console.log('ℹ️ Presorteo desactivado desde sistemaPremios: fecha/hora limpiadas');
            }
        }
        
        // 🏦 PASO 6B: Procesar cuentas bancarias si vienen en la solicitud
        let bankAccountsActualizadas = null;
        if (req.body.tecnica && Array.isArray(req.body.tecnica.bankAccounts)) {
            try {
                // Validar que cada cuenta tenga campos mínimos requeridos
                const cuentasValidadas = req.body.tecnica.bankAccounts.map((cuenta, idx) => {
                    if (!cuenta.nombreBanco || !cuenta.accountNumber) {
                        throw new Error(`Cuenta ${idx + 1}: El banco y número de cuenta son obligatorios`);
                    }
                    
                    return {
                        id: cuenta.id || (idx + 1),
                        nombreBanco: cuenta.nombreBanco.substring(0, 100),
                        accountNumber: cuenta.accountNumber.substring(0, 50),
                        beneficiary: cuenta.beneficiary ? cuenta.beneficiary.substring(0, 100) : '',
                        accountType: cuenta.accountType || 'Tarjeta',
                        paymentType: cuenta.paymentType || 'transferencia',
                        numero_referencia: cuenta.numero_referencia ? cuenta.numero_referencia.substring(0, 100) : '',
                        phone: cuenta.phone ? cuenta.phone.substring(0, 20) : ''
                    };
                });
                
                // Actualizar la configuración tecnica
                if (!config.tecnica) {
                    config.tecnica = {};
                }
                config.tecnica.bankAccounts = cuentasValidadas;
                bankAccountsActualizadas = cuentasValidadas;
                console.log('[PATCH /api/admin/config] ✅ Cuentas bancarias actualizadas:', cuentasValidadas.length);
            } catch (bankError) {
                return res.status(400).json({
                    success: false,
                    message: 'Validación de cuentas fallida: ' + bankError.message
                });
            }
        }

        // 📝 PASO 6C: Procesar datos del cliente si vienen
        // 📝 PASO 6C: Procesar datos del cliente si vienen
        if (req.body.cliente) {
            if (!config.cliente) config.cliente = {};
            
            // DEBUG: Ver exactamente qué viene en cliente
            console.log('[PATCH /api/admin/config] 🔍 DEBUG - req.body.cliente recibido:', {
                tienePropiedad: !!req.body.cliente,
                propiedades: Object.keys(req.body.cliente),
                imagenPrincipalValue: req.body.cliente.imagenPrincipal,
                imagenPrincipalType: typeof req.body.cliente.imagenPrincipal,
                logoValue: req.body.cliente.logo,
                logotipoValue: req.body.cliente.logotipo
            });
            
            const nombreAnterior = config.cliente.nombre;
            config.cliente.nombre = req.body.cliente.nombre || config.cliente.nombre;
            config.cliente.eslogan = req.body.cliente.eslogan || config.cliente.eslogan;
            config.cliente.telefono = req.body.cliente.telefono || config.cliente.telefono;
            config.cliente.email = req.body.cliente.email || config.cliente.email;
            
            // 🖼️ AGREGAR: Actualizar imagenPrincipal si viene en cliente
            if (req.body.cliente.imagenPrincipal) {
                const imagenAnterior = config.cliente.imagenPrincipal;
                config.cliente.imagenPrincipal = req.body.cliente.imagenPrincipal;
                console.log('[PATCH /api/admin/config] 🖼️ Imagen principal actualizada:', {
                    anterior: imagenAnterior,
                    nueva: config.cliente.imagenPrincipal
                });
            } else {
                console.log('[PATCH /api/admin/config] ⚠️ imagenPrincipal NO está en req.body.cliente o está vacío');
            }

            // 🏷️ Guardar logo/logotipo de forma normalizada para que toda la app lea el mismo valor
            const logoRecibido = req.body.cliente.logo ?? req.body.cliente.logotipo;
            if (logoRecibido !== undefined) {
                const logoAnterior = config.cliente.logo || config.cliente.logotipo || '';
                config.cliente.logo = logoRecibido || '';
                config.cliente.logotipo = logoRecibido || '';
                console.log('[PATCH /api/admin/config] 🏷️ Logo actualizado:', {
                    anterior: logoAnterior,
                    nuevo: config.cliente.logo
                });
            } else {
                console.log('[PATCH /api/admin/config] ℹ️ No se recibió logo/logotipo en req.body.cliente');
            }
            
            // ✅ AGREGAR: Actualizar redesSociales si viene en cliente
            if (req.body.cliente.redesSociales) {
                config.cliente.redesSociales = req.body.cliente.redesSociales;
            }

            if (req.body.cliente.mensajesWhatsapp) {
                config.cliente.mensajesWhatsapp = req.body.cliente.mensajesWhatsapp;
            }
            
            console.log('[PATCH /api/admin/config] ✅ Datos del cliente actualizados', {
                nombreAnterior,
                nombreNuevo: config.cliente.nombre,
                eslogan: config.cliente.eslogan,
                imagenPrincipal: config.cliente.imagenPrincipal,
                logo: config.cliente.logo,
                logotipo: config.cliente.logotipo,
                redesSociales: config.cliente.redesSociales ? 'actualizado' : 'sin cambios'
            });
        }

        // 📝 PASO 6D: Procesar datos de la rifa si vienen
        if (req.body.rifa) {
            console.log('[PATCH /api/admin/config] 🔍 PROCESANDO RIFA - Datos recibidos:', {
                tieneRifa: !!req.body.rifa,
                tiempoApartadoHorasRecibido: req.body.rifa.tiempoApartadoHoras,
                fechaSorteoRecibido: req.body.rifa.fechaSorteo
            });
            
            if (!config.rifa) config.rifa = {};
            if (req.body.rifa.nombreSorteo) config.rifa.nombreSorteo = req.body.rifa.nombreSorteo;
            if (req.body.rifa.edicionNombre) config.rifa.edicionNombre = req.body.rifa.edicionNombre;
            if (req.body.rifa.estado) config.rifa.estado = req.body.rifa.estado;
            if (req.body.rifa.totalBoletos !== undefined) config.rifa.totalBoletos = parseInt(req.body.rifa.totalBoletos) || config.rifa.totalBoletos;
            if (req.body.rifa.precioBoleto !== undefined) config.rifa.precioBoleto = parseFloat(req.body.rifa.precioBoleto) || config.rifa.precioBoleto;
            if (req.body.rifa.descripcion) config.rifa.descripcion = req.body.rifa.descripcion;
            if (req.body.rifa.publicacion) config.rifa.publicacion = req.body.rifa.publicacion;
        if (req.body.rifa.ayuda !== undefined) {
            const preguntasFrecuentes = Array.isArray(req.body.rifa.ayuda?.preguntasFrecuentes)
                ? req.body.rifa.ayuda.preguntasFrecuentes
                : [];
            const faqKeys = new Set();

            config.rifa.ayuda = {
                ...(config.rifa.ayuda || {}),
                ...(req.body.rifa.ayuda || {}),
                preguntasFrecuentes: preguntasFrecuentes
                        .map((item) => ({
                            pregunta: sanitizar(item?.pregunta || '').trim(),
                            respuesta: sanitizar(item?.respuesta || '').trim()
                        }))
                        .filter((item) => item.pregunta && item.respuesta)
                        .filter((item) => {
                            const clave = `${item.pregunta.toLowerCase()}|||${item.respuesta.toLowerCase()}`;
                            if (faqKeys.has(clave)) return false;
                            faqKeys.add(clave);
                            return true;
                        })
                };
            }
            
            // ✅ Procesar fechaSorteo y generar horaSorteo y fechaSorteoFormato automáticamente
            if (req.body.rifa.fechaSorteo) {
                config.rifa.fechaSorteo = req.body.rifa.fechaSorteo;
                try {
                    const fecha = new Date(req.body.rifa.fechaSorteo);
                    if (!isNaN(fecha.getTime())) {
                        // Extraer hora
                        const horas = String(fecha.getHours()).padStart(2, '0');
                        const minutos = String(fecha.getMinutes()).padStart(2, '0');
                        config.rifa.horaSorteo = `${horas}:${minutos}`;
                        
                        // Formatear fecha en español
                        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                        const dia = fecha.getDate();
                        const mes = meses[fecha.getMonth()];
                        const año = fecha.getFullYear();
                        config.rifa.fechaSorteoFormato = `${dia} de ${mes} del ${año}`;
                        
                        console.log('✅ Fecha del sorteo procesada:', {
                            fechaSorteo: config.rifa.fechaSorteo,
                            horaSorteo: config.rifa.horaSorteo,
                            fechaSorteoFormato: config.rifa.fechaSorteoFormato
                        });
                    }
                } catch (e) {
                    console.error('⚠️ Error procesando fechaSorteo:', e.message);
                }
            }
            
            // ✅ Procesar fechaPresorteo y generar horaPresorteo y fechaPresorteoFormato automáticamente
            if (Object.prototype.hasOwnProperty.call(req.body.rifa, 'fechaPresorteo') && !req.body.rifa.fechaPresorteo) {
                config.rifa.fechaPresorteo = null;
                config.rifa.horaPresorteo = '';
                config.rifa.fechaPresorteoFormato = '';
                console.log('ℹ️ Presorteo desactivado: fechaPresorteo limpiada');
            } else if (req.body.rifa.fechaPresorteo) {
                config.rifa.fechaPresorteo = req.body.rifa.fechaPresorteo;
                try {
                    const fecha = new Date(req.body.rifa.fechaPresorteo);
                    if (!isNaN(fecha.getTime())) {
                        // Extraer hora
                        const horas = String(fecha.getHours()).padStart(2, '0');
                        const minutos = String(fecha.getMinutes()).padStart(2, '0');
                        config.rifa.horaPresorteo = `${horas}:${minutos}`;
                        
                        // Formatear fecha en español
                        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                        const dia = fecha.getDate();
                        const mes = meses[fecha.getMonth()];
                        const año = fecha.getFullYear();
                        config.rifa.fechaPresorteoFormato = `${dia} de ${mes} del ${año}`;
                        
                        console.log('✅ Fecha del presorteo procesada:', {
                            fechaPresorteo: config.rifa.fechaPresorteo,
                            horaPresorteo: config.rifa.horaPresorteo,
                            fechaPresorteoFormato: config.rifa.fechaPresorteoFormato
                        });
                    }
                } catch (e) {
                    console.error('⚠️ Error procesando fechaPresorteo:', e.message);
                }
            }
            
            // 🖼️ AGREGAR SOPORTE PARA GALERÍA (IMÁGENES)
            if (req.body.rifa.galeria) {
                config.rifa.galeria = req.body.rifa.galeria;
            }
            
            // 📋 AGREGAR SOPORTE PARA INFORMACIÓN DEL SORTEO
            if (req.body.rifa.informacionSorteoIntro !== undefined) {
                config.rifa.informacionSorteoIntro = String(req.body.rifa.informacionSorteoIntro || '').trim();
                console.log('✅ Intro del sorteo actualizada');
            }

            if (req.body.rifa.informacionSorteo) {
                config.rifa.informacionSorteo = req.body.rifa.informacionSorteo;
                console.log('✅ Información del sorteo actualizada:', config.rifa.informacionSorteo.length, 'elementos');
            }

            // 🎁 AGREGAR SOPORTE PARA BONOS
            if (req.body.rifa.bonos) {
                config.rifa.bonos = req.body.rifa.bonos;
                console.log('✅ Bonos actualizados:', config.rifa.bonos.items?.length, 'items,', config.rifa.bonos.enabled ? 'Habilitado' : 'Deshabilitado');
            }

            // 🎁 AGREGAR SOPORTE PARA BONOS DE PÁGINA DE COMPRA
            if (req.body.rifa.bonosCompra !== undefined) {
                const bonosCompraRecibidos = req.body.rifa.bonosCompra || {};
                const itemsNormalizados = Array.isArray(bonosCompraRecibidos.items)
                    ? bonosCompraRecibidos.items
                        .map((item) => ({
                            emoji: sanitizar(String(item?.emoji || '🎁')).trim() || '🎁',
                            titulo: sanitizar(String(item?.titulo || '')).trim(),
                            descripcion: sanitizar(String(item?.descripcion || '')).trim()
                        }))
                        .filter((item) => item.titulo && item.descripcion)
                    : [];

                config.rifa.bonosCompra = {
                    ...(config.rifa.bonosCompra || {}),
                    enabled: Boolean(bonosCompraRecibidos.enabled) && itemsNormalizados.length > 0,
                    items: itemsNormalizados
                };

                console.log('[PATCH /api/admin/config] 🎁 Bonos de compra actualizados:', {
                    enabled: config.rifa.bonosCompra.enabled,
                    itemsLength: config.rifa.bonosCompra.items.length
                });
            }

            // 🎰 AGREGAR SOPORTE PARA LÍMITE DE MÁQUINA DE LA SUERTE
            if (req.body.rifa.maquinaSuerte !== undefined) {
                const limiteRecibido = Number(req.body.rifa.maquinaSuerte?.limiteBoletos);
                const limiteNormalizado = Number.isFinite(limiteRecibido) && limiteRecibido > 0
                    ? Math.floor(limiteRecibido)
                    : 500;

                config.rifa.maquinaSuerte = {
                    ...(config.rifa.maquinaSuerte || {}),
                    ...(req.body.rifa.maquinaSuerte || {}),
                    limiteBoletos: limiteNormalizado
                };

                console.log('[PATCH /api/admin/config] 🎰 Límite máquina de la suerte actualizado:', {
                    limiteBoletos: config.rifa.maquinaSuerte.limiteBoletos
                });
            }

            // ⏲️ AGREGAR SOPORTE PARA PROMOCIÓN POR TIEMPO
            if (req.body.rifa.promocionPorTiempo !== undefined) {
                config.rifa.promocionPorTiempo = req.body.rifa.promocionPorTiempo;
                console.log('[PATCH /api/admin/config] ⏲️ Promoción por tiempo actualizada:', {
                    enabled: config.rifa.promocionPorTiempo.enabled,
                    precio: config.rifa.promocionPorTiempo.precioProvisional,
                    inicio: config.rifa.promocionPorTiempo.fechaInicio,
                    fin: config.rifa.promocionPorTiempo.fechaFin
                });
            }
            
            if (req.body.rifa.descuentoPorcentaje !== undefined) {
                config.rifa.descuentoPorcentaje = req.body.rifa.descuentoPorcentaje;
                console.log('[PATCH /api/admin/config] 📊 Descuento por porcentaje actualizado:', {
                    enabled: config.rifa.descuentoPorcentaje.enabled,
                    porcentaje: config.rifa.descuentoPorcentaje.porcentaje,
                    inicio: config.rifa.descuentoPorcentaje.fechaInicio,
                    fin: config.rifa.descuentoPorcentaje.fechaFin
                });
            }

            if (req.body.rifa.descuentos !== undefined) {
                const descuentosRecibidos = req.body.rifa.descuentos || {};
                const reglasNormalizadas = Array.isArray(descuentosRecibidos.reglas)
                    ? descuentosRecibidos.reglas
                        .map((regla) => {
                            const cantidad = parseInt(regla?.cantidad, 10);
                            const total = Number(regla?.total ?? regla?.precio);
                            const ahorro = Number(regla?.ahorro);

                            if (!Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(total) || total <= 0) {
                                return null;
                            }

                            return {
                                cantidad,
                                precio: total,
                                total,
                                ahorro: Number.isFinite(ahorro) && ahorro >= 0 ? ahorro : 0
                            };
                        })
                        .filter(Boolean)
                    : [];

                config.rifa.descuentos = {
                    ...(config.rifa.descuentos || {}),
                    enabled: Boolean(descuentosRecibidos.enabled),
                    reglas: reglasNormalizadas
                };

                console.log('[PATCH /api/admin/config] 📦 Descuentos por volumen actualizados:', {
                    enabled: config.rifa.descuentos.enabled,
                    reglasLength: config.rifa.descuentos.reglas.length
                });
            }

            // 🎰 AGREGAR SOPORTE PARA PROMOCIONES DE OPORTUNIDADES
            if (req.body.rifa.promocionesOportunidades !== undefined) {
                config.rifa.promocionesOportunidades = req.body.rifa.promocionesOportunidades;
                console.log('[PATCH /api/admin/config] 🎰 Promociones de oportunidades actualizadas:', {
                    enabled: config.rifa.promocionesOportunidades.enabled,
                    ejemplosLength: config.rifa.promocionesOportunidades.ejemplos?.length || 0
                });
            }

            if (req.body.rifa.oportunidades !== undefined) {
                const oportunidadesActuales = config.rifa.oportunidades || {};
                const oportunidadesRecibidas = req.body.rifa.oportunidades || {};
                const multiplicadorActual = Number(oportunidadesActuales.multiplicador) > 0
                    ? Number(oportunidadesActuales.multiplicador)
                    : 3;
                const multiplicadorRecibido = Number(oportunidadesRecibidas.multiplicador);

                config.rifa.oportunidades = {
                    ...oportunidadesActuales,
                    ...oportunidadesRecibidas,
                    enabled: oportunidadesRecibidas.enabled !== undefined
                        ? Boolean(oportunidadesRecibidas.enabled)
                        : (oportunidadesActuales.enabled !== false),
                    multiplicador: Number.isFinite(multiplicadorRecibido) && multiplicadorRecibido > 0
                        ? multiplicadorRecibido
                        : multiplicadorActual
                };

                console.log('[PATCH /api/admin/config] 🎟️ Oportunidades actualizadas:', {
                    enabled: config.rifa.oportunidades.enabled,
                    multiplicador: config.rifa.oportunidades.multiplicador
                });
            }

            // ⏰ AGREGAR SOPORTE PARA TIEMPO DE APARTADO
            if (req.body.rifa.tiempoApartadoHoras !== undefined) {
                const tiempoAnterior = config.rifa.tiempoApartadoHoras;
                const nuevoTiempoApartadoHoras = parseFloat(req.body.rifa.tiempoApartadoHoras);
                if (Number.isNaN(nuevoTiempoApartadoHoras) || nuevoTiempoApartadoHoras <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'tiempoApartadoHoras debe ser un numero mayor a 0'
                    });
                }

                config.rifa.tiempoApartadoHoras = nuevoTiempoApartadoHoras;
                console.log('[PATCH /api/admin/config] ⏰ Tiempo de apartado - ANTES DE GUARDAR:', {
                    anterior: tiempoAnterior,
                    nuevo: config.rifa.tiempoApartadoHoras,
                    tipoDelValor: typeof config.rifa.tiempoApartadoHoras,
                    requestValue: req.body.rifa.tiempoApartadoHoras
                });
                
                // 🔄 RECONFIGURER EL SERVICIO DE EXPIRACIÓN
                if (ordenExpirationService) {
                    console.log('[PATCH /api/admin/config] 🔄 Reconfigurando ordenExpirationService con nuevo tiempoApartadoHoras:', config.rifa.tiempoApartadoHoras);
                    ordenExpirationService.configurar(
                        config.rifa.tiempoApartadoHoras,
                        config.rifa.intervaloLimpiezaMinutos
                    );
                }
            }
            
            console.log('[PATCH /api/admin/config] ✅ Datos de la rifa actualizados:', {
                nombreSorteo: config.rifa.nombreSorteo,
                edicionNombre: config.rifa.edicionNombre,
                estado: config.rifa.estado,
                precioBoleto: config.rifa.precioBoleto,
                totalBoletos: config.rifa.totalBoletos,
                fechaSorteo: config.rifa.fechaSorteo,
                fechaPresorteo: config.rifa.fechaPresorteo,
                tiempoApartadoHoras: config.rifa.tiempoApartadoHoras,
                maquinaSuerteLimite: config.rifa.maquinaSuerte?.limiteBoletos,
                imagenesGuardadas: config.rifa.galeria?.imagenes?.length || 0
            });
        }

        // 📝 PASO 6E: Procesar redes sociales si vienen
        if (req.body.redesSociales) {
            if (!config.cliente) config.cliente = {};
            config.cliente.redesSociales = req.body.redesSociales;
        }

        if (req.body.tema) {
            config.tema = normalizarTemaConfig({
                ...(config.tema || {}),
                ...(req.body.tema || {})
            });
        }

        if (req.body.seo) {
            config.seo = normalizarSeoConfigParaPersistencia(req.body.seo, config);
        }

        // 📝 PASO 7: Escribir de forma asincrónica
        const nuevoContenido = JSON.stringify(config, null, 2);
        
        // DEBUG: Guardar en archivo lo que vamos a escribir
        try {
            fs.writeFileSync('/tmp/patch-debug.json', JSON.stringify({
                timestamp: new Date().toISOString(),
                rifaGaleríaImagenes: config.rifa?.galeria?.imagenes?.map(i => i.titulo) || [],
                rifaGaleríaLength: config.rifa?.galeria?.imagenes?.length || 0,
                requestBodyRifaGaleria: req.body.rifa?.galeria?.imagenes?.map(i => i.titulo) || []
            }, null, 2), 'utf8');
        } catch (e) {
            console.error('[DEBUG] Error writing debug file:', e);
        }
        
        console.log('[PATCH /api/admin/config] 📝 A ESCRIBIR:', {
            cliente: {
                nombre: config.cliente?.nombre,
                eslogan: config.cliente?.eslogan,
                imagenPrincipal: config.cliente?.imagenPrincipal,
                logo: config.cliente?.logo,
                logotipo: config.cliente?.logotipo
            },
            rifaGaleriaImagenes: config.rifa?.galeria?.imagenes?.length || 0
        });
        
        try {
            await new Promise((resolve, reject) => {
                fs.writeFile(configPath, nuevoContenido, 'utf8', (err) => {
                    if (err) {
                        console.error('[PATCH /api/admin/config] ❌ Error en writeFile:', err);
                        reject(err);
                    } else {
                        console.log('[PATCH /api/admin/config] ✅ writeFile completado');
                        resolve();
                    }
                });
            });
            
            // ✅ VERIFICACIÓN: Leer el archivo que acabamos de escribir
            const verificacion = fs.readFileSync(configPath, 'utf8');
            const configVerificada = JSON.parse(verificacion);
            console.log('[PATCH /api/admin/config] ✅ VERIFICACIÓN POST-WRITE:', {
                imagenPrincipal: configVerificada.cliente?.imagenPrincipal,
                logo: configVerificada.cliente?.logo,
                logotipo: configVerificada.cliente?.logotipo,
                nombreCliente: configVerificada.cliente?.nombre,
                rifaGaleriaImagenes: configVerificada.rifa?.galeria?.imagenes?.length || 0,
                tiempoApartadoHoras: configVerificada.rifa?.tiempoApartadoHoras,
                tiempoApartadoGuardadoCorrectamente: configVerificada.rifa?.tiempoApartadoHoras === config.rifa?.tiempoApartadoHoras ? '✅ SÍ' : '❌ NO'
            });
        } catch (writeError) {
            console.error('[PATCH /api/admin/config] ❌ writeError:', writeError);
            log('error', 'Error escribiendo config.json', { error: writeError.message, usuario: req.usuario.username });
            return res.status(500).json({
                success: false,
                message: 'Error guardando configuración',
                error: writeError.message
            });
        }

        try {
            configManager.reload();
            console.log('[PATCH /api/admin/config] ✅ ConfigManager recargado en memoria');
        } catch (reloadError) {
            console.error('[PATCH /api/admin/config] ❌ Error recargando ConfigManager:', reloadError);
            return res.status(500).json({
                success: false,
                message: 'Configuración guardada pero no se pudo recargar en memoria',
                error: reloadError.message
            });
        }

        // ✅ PASO 8: Log de éxito
        const camposActualizados = [];
        if (requiereSystemaPremios) camposActualizados.push('sistemaPremios');
        if (bankAccountsActualizadas) camposActualizados.push('bankAccounts');
        if (req.body.cliente) camposActualizados.push('cliente');
        if (req.body.rifa) camposActualizados.push('rifa');
        if (req.body.redesSociales) camposActualizados.push('redesSociales');
        
        const logData = {
            usuario: req.usuario.username,
            campos_actualizados: camposActualizados.join(', ')
        };
        
        if (requiereSystemaPremios) {
            logData.premios_count = {
                sorteo: sistemaPremios.sorteo?.length || 0,
                presorteo: sistemaPremios.presorteo?.length || 0,
                ruletazos: sistemaPremios.ruletazos?.length || 0
            };
        }
        
        if (bankAccountsActualizadas) {
            logData.cuentas_bancarias = bankAccountsActualizadas.length;
        }
        
        log('info', '✅ PATCH /api/admin/config - Config actualizada (PRODUCTION-READY)', logData);

        res.json({
            success: true,
            message: 'Configuración actualizada exitosamente',
            data: {
                ...(requiereSystemaPremios && { sistemaPremios: config.rifa.sistemaPremios }),
                ...(bankAccountsActualizadas && { 
                    cuentas: bankAccountsActualizadas 
                }),
                ...(req.body.cliente && { cliente: config.cliente }),
                ...(req.body.rifa && { rifa: config.rifa }),
                ...(req.body.redesSociales && { redesSociales: config.cliente.redesSociales })
            }
        });

    } catch (error) {
        log('error', '❌ PATCH /api/admin/config error', { 
            error: error.message,
            stack: error.stack,
            usuario: req.usuario?.username 
        });
        res.status(500).json({
            success: false,
            message: 'Error al actualizar configuración',
            error: error.message
        });
    } finally {
        // 🔓 PASO 9: Liberar file lock
        if (release) {
            try {
                await release();
            } catch (unlockError) {
                console.warn('⚠️  Error liberando lock:', unlockError.message);
            }
        }
    }
});

/* ============================================================ */
/* SECCIÓN: GESTIÓN DE CONTADOR DE IDs DE ORDEN                */
/* ============================================================ */

/**
 * POST /api/public/order-counter/next
 * Genera el siguiente ID de orden único
 * Patrón: SS-AA001 → SS-AA999 → SS-AB000 → SS-ZZ999
 * Cliente: frontend o backend
 */
app.post('/api/public/order-counter/next', limiterOrdenes, async (req, res) => {
    try {
        const clienteIdBody = String(req.body?.cliente_id || '').trim();
        
        // Cargar config y obtener prefijo ANTES de transacción
        const configActual = cargarConfigSorteo();
        const clienteIdConfig = String(configActual?.cliente?.id || '').trim();
        const cliente_id = clienteIdBody || clienteIdConfig || 'Sorteos_El_Trebol';
        
        // IMPORTANTE: Pasar configActual a obtenerPrefijoOrdenCliente para ASEGURAR que usa el correcto
        const prefijo = obtenerPrefijoOrdenCliente(cliente_id, configActual);
        console.log(`📋 Generando orden para cliente_id="${cliente_id}", prefijo="${prefijo}", config.cliente.prefijoOrden="${configActual?.cliente?.prefijoOrden}"`);

        // Usar transacción SIMPLIFICADA para evitar problemas de lock
        const orderId = await db.transaction(async (trx) => {
            // 1. Obtener registro de contador
            let counter = await trx('order_id_counter')
                .where('cliente_id', cliente_id)
                .first();

            // 2. Si no existe, crear uno
            if (!counter) {
                const newCounter = {
                    cliente_id,
                    ultima_secuencia: 'AA',
                    ultimo_numero: 0,
                    proximo_numero: 1,
                    contador_total: 0,
                    activo: true,
                    fecha_ultimo_reset: new Date(),
                    created_at: new Date(),
                    updated_at: new Date()
                };
                
                await trx('order_id_counter').insert(newCounter);
                
                counter = newCounter;
            }

            // 3. Generar ID actual usando la secuencia actual
            const numero = String(counter.proximo_numero).padStart(3, '0');
            const fullOrderId = `${prefijo}-${counter.ultima_secuencia}${numero}`;
            
            console.log(`✅ Generado orden_id: ${fullOrderId} (num=${numero}, seq=${counter.ultima_secuencia})`);

            // 4. Calcular siguiente número y secuencia
            let nextNum = counter.proximo_numero + 1;
            let nextSeq = counter.ultima_secuencia;

            if (nextNum > 999) {
                nextNum = 0;
                nextSeq = incrementarSecuenciaSQL(counter.ultima_secuencia);
            }

            // 5. Actualizar contador con nuevos valores
            const updateData = {
                ultimo_numero: counter.proximo_numero,
                ultima_secuencia: nextSeq,
                proximo_numero: nextNum,
                contador_total: counter.contador_total + 1,
                updated_at: new Date()
            };
            
            await trx('order_id_counter')
                .where('cliente_id', cliente_id)
                .update(updateData);

            return fullOrderId;
        });

        log('info', 'POST /api/public/order-counter/next success', { cliente_id, orden_id: orderId });

        return res.json({
            success: true,
            orden_id: orderId,
            message: 'ID de orden generado exitosamente'
        });

    } catch (error) {
        log('error', 'POST /api/public/order-counter/next error', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            message: error.message || 'Error generando ID de orden',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/admin/order-counter/status
 * Obtiene el estado actual del contador de IDs
 */
app.get('/api/admin/order-counter/status', verificarToken, async (req, res) => {
    try {
        const { cliente_id } = req.query;
        
        if (!cliente_id) {
            return res.status(400).json({
                success: false,
                message: 'cliente_id es requerido'
            });
        }

        const counter = await db('order_id_counter')
            .where({ cliente_id })
            .first();

        if (!counter) {
            return res.status(404).json({
                success: false,
                message: 'Contador no encontrado'
            });
        }

        const proxNum = String(counter.proximo_numero).padStart(3, '0');
        const prefijo = obtenerPrefijoOrdenCliente(cliente_id);
        const proximoId = `${prefijo}-${counter.ultima_secuencia}${proxNum}`;

        res.json({
            success: true,
            data: {
                cliente_id: counter.cliente_id,
                ultima_secuencia: counter.ultima_secuencia,
                ultimo_numero: counter.ultimo_numero,
                proximo_numero: counter.proximo_numero,
                proximo_id: proximoId,
                contador_total: counter.contador_total,
                activo: counter.activo,
                fecha_ultimo_reset: counter.fecha_ultimo_reset
            }
        });

    } catch (error) {
        log('error', 'GET /api/admin/order-counter/status error', { error: error.message });
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/admin/order-counter/reset
 * Resetea el contador de IDs (cuando termina un sorteo)
 * Solo accesible por admin autenticado
 */
app.post('/api/admin/order-counter/reset', verificarToken, async (req, res) => {
    try {
        const { cliente_id } = req.body;
        
        if (!cliente_id) {
            return res.status(400).json({
                success: false,
                message: 'cliente_id es requerido'
            });
        }

        // Usar transacción
        const result = await db.transaction(async (trx) => {
            const counter = await trx('order_id_counter')
                .where({ cliente_id })
                .first();

            if (!counter) {
                throw new Error('Contador no encontrado');
            }

            // Guardar estado anterior para auditoría
            const estadoAnterior = {
                ultima_secuencia: counter.ultima_secuencia,
                contador_total: counter.contador_total,
                fecha_reset_anterior: counter.fecha_ultimo_reset
            };

            // Resetear contador
            await trx('order_id_counter')
                .where({ cliente_id })
                .update({
                    ultima_secuencia: 'AA',
                    proximo_numero: 1,
                    ultimo_numero: 0,
                    contador_total: 0,
                    fecha_ultimo_reset: new Date(),
                    updated_at: new Date()
                });

            return estadoAnterior;
        });

        log('info', 'POST /api/admin/order-counter/reset success', { cliente_id, estado_anterior: result });

        res.json({
            success: true,
            message: 'Contador reseteado exitosamente',
            estado_anterior: result,
            nuevo_inicio: `SY-AA001`
        });

    } catch (error) {
        log('error', 'POST /api/admin/order-counter/reset error', { error: error.message });
        res.status(500).json({
            success: false,
            message: error.message || 'Error reseteando contador'
        });
    }
});

/**
 * Función helper: Incrementa secuencia alfabética (AA → AB → AC... ZZ)
 */
function incrementarSecuenciaSQL(secuencia) {
    if (secuencia.length !== 2) return 'AA';
    
    let letra1 = secuencia.charCodeAt(0);
    let letra2 = secuencia.charCodeAt(1);
    
    // Incrementar segunda letra
    letra2++;
    
    // Si excede 'Z', reiniciar y avanzar primera letra
    if (letra2 > 90) { // 90 es código ASCII de 'Z'
        letra2 = 65; // 65 es código ASCII de 'A'
        letra1++;
    }
    
    // Si excede 'Z', volvemos a 'AA'
    if (letra1 > 90) {
        return 'AA';
    }
    
    return String.fromCharCode(letra1) + String.fromCharCode(letra2);
}

function obtenerPrefijoOrdenCliente(clienteId, configActor = null) {
    try {
        // 1️⃣ Intentar obtener prefijoOrden desde config (PRIORITARIO)
        // Primero desde configActual si se proporciona, luego desde configManager
        const configParaUsar = configActor || cargarConfigSorteo();
        const prefijoConfig = String(configParaUsar?.cliente?.prefijoOrden || '').trim().toUpperCase();
        
        if (prefijoConfig && prefijoConfig.length >= 2) {
            console.log(`✅ PREFIJO ORDEN: "${prefijoConfig}" (desde config.json)`);
            return prefijoConfig;
        }
        
        console.warn(`⚠️ prefijoConfig vacío o inválido: "${prefijoConfig}"`);
    } catch (error) {
        console.warn('⚠️ Error obteniendoprefijoOrden:', error.message);
    }

    // 2️⃣ Fallback SEGURO: NUNCA generar, siempre retornar valor >= 2 caracteres
    console.log(`❌ FALLBACK: No encontrado prefijo válido en config, retornando 'SS' por defecto`);
    return 'SS';  // ✅ IMPORTANTE: SIEMPRE al menos 2 caracteres, nunca solo 'S'
}

/**
 * Genera el siguiente ID de orden para un cliente dado usando la misma lógica
 * que /api/public/order-counter/next pero permitiendo pasar una transacción
 * para uso ATÓMICO dentro de la creación de ordenes.
 * @param {string} cliente_id
 * @param {object} trx - instancia de transacción Knex
 * @returns {Promise<string>} ordenId
 */
async function generarSiguienteOrdenId(cliente_id, trx) {
    // Validación mínima
    const cid = cliente_id || 'Sorteos_El_Trebol';

    // 1. Obtener registro de contador
    let counter = await trx('order_id_counter').where('cliente_id', cid).first();

    // 2. Si no existe, crear uno
    if (!counter) {
        const newCounter = {
            cliente_id: cid,
            ultima_secuencia: 'AA',
            ultimo_numero: 0,
            proximo_numero: 1,
            contador_total: 0,
            activo: true,
            fecha_ultimo_reset: new Date(),
            created_at: new Date(),
            updated_at: new Date()
        };
        await trx('order_id_counter').insert(newCounter);
        counter = newCounter;
    }

    const numero = String(counter.proximo_numero).padStart(3, '0');
    const prefijo = obtenerPrefijoOrdenCliente(cid);
    const fullOrderId = `${prefijo}-${counter.ultima_secuencia}${numero}`;

    // Calcular siguiente número y secuencia
    let nextNum = counter.proximo_numero + 1;
    let nextSeq = counter.ultima_secuencia;

    if (nextNum > 999) {
        nextNum = 0;
        nextSeq = incrementarSecuenciaSQL(counter.ultima_secuencia);
    }

    // Actualizar contador
    const updateData = {
        ultimo_numero: counter.proximo_numero,
        ultima_secuencia: nextSeq,
        proximo_numero: nextNum,
        contador_total: (counter.contador_total || 0) + 1,
        updated_at: new Date()
    };

    await trx('order_id_counter').where('cliente_id', cid).update(updateData);

    return fullOrderId;
}

/**
 * POST /api/verify-payment
 * Endpoint para verificar pagos (futuro panel de admin)
 */
app.post('/api/verify-payment', async (req, res) => {
    try {
        const { ordenId, comprobante } = req.body;

        // Aquí irá lógica para verificar pagos
        // Por ahora solo confirmamos que se recibió

        res.json({
            success: true,
            message: 'Pago registrado para revisión',
            ordenId: ordenId
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/ordenes
 * Guarda una nueva orden en la BD y devuelve un link viewable
 * ✅ OPTIMIZADO PARA 1M BOLETOS - Usa BoletoService
 * Cambios principales:
 * - Verifica boletos con índices rápidos en BD
 * - Transacción atómica para evitar race conditions
 * - Usa tabla boletos_estado en lugar de JSON array
 * Protegido con rate limiting
 */
// ============================================================================
// POST /api/ordenes - CREAR NUEVA ORDEN DE COMPRA
// ============================================================================
// Versión 3.0: PRE-ASIGNADAS CON FK CASCADE
// - Boletos y oportunidades vinculados desde bd (FK)
// - UPDATE simplificado: solo numero_orden
// - FK CASCADE maneja automáticamente cambios de estado
// - Sin código de asignación dinámica, sin race conditions complejas
// ============================================================================
app.post('/api/ordenes', limiterOrdenes, async (req, res) => {
    const startTime = Date.now();
    let ordenId = '';
    
    try {
        console.log('\n📨 [POST /api/ordenes] REQUEST RECIBIDO');
        const orden = req.body;
        
        // ===== VALIDACIONES BÁSICAS =====
        
        // Validar cliente
        if (!orden.cliente || typeof orden.cliente !== 'object') {
            return res.status(400).json({ success: false, message: 'Datos del cliente requeridos' });
        }

        const config = cargarConfigSorteo();
        const clienteIdActual = String(config?.cliente?.id || '').trim() || 'Sorteos_El_Trebol';
        const prefijoOrdenActual = obtenerPrefijoOrdenCliente(clienteIdActual);
        const ordenIdRecibido = typeof orden.ordenId === 'string'
            ? sanitizar(orden.ordenId).trim().toUpperCase()
            : '';

        if (ordenIdRecibido.length > 50) {
            return res.status(400).json({ success: false, message: 'Orden ID máximo 50 caracteres' });
        }

        const secuenciaOficial = ordenIdRecibido.match(/(?:^|[-])([A-Z]{2}\d{3})$/);
        if (secuenciaOficial) {
            ordenId = `${prefijoOrdenActual}-${secuenciaOficial[1]}`;
        } else {
            ordenId = '';
        }

        const nombre = sanitizar(orden.cliente.nombre || '').trim();
        const apellidos = sanitizar(orden.cliente.apellidos || '').trim();
        const whatsapp = sanitizar(orden.cliente.whatsapp || '').replace(/[^0-9]/g, '');
        const estado = sanitizar(orden.cliente.estado || '').trim();
        const ciudad = sanitizar(orden.cliente.ciudad || '').trim();

        if (!nombre) {
            return res.status(400).json({ success: false, message: 'Nombre del cliente requerido' });
        }
        if (!esTelefonoValido(orden.cliente.whatsapp)) {
            return res.status(400).json({ success: false, message: 'Teléfono debe tener 10-20 dígitos' });
        }

        // Validar boletos
        if (!Array.isArray(orden.boletos) || orden.boletos.length === 0) {
            return res.status(400).json({ success: false, message: 'Se requiere al menos 1 boleto' });
        }

        const boletosValidos = orden.boletos.map(n => Number(n)).filter(n => 
            !isNaN(n) && n >= 0 && n < config.totalBoletos && Number.isInteger(n)
        );

        if (boletosValidos.length !== orden.boletos.length) {
            return res.status(400).json({ 
                success: false, 
                message: `Rango de boletos: 0 a ${config.totalBoletos - 1}`
            });
        }

        // Validar boletos duplicados
        const boletoSet = new Set(boletosValidos);
        if (boletoSet.size !== boletosValidos.length) {
            return res.status(400).json({ success: false, message: 'Boletos duplicados en la orden' });
        }

        const totalesCliente = {
            subtotal: parseFloat(orden.totales?.subtotal) || 0,
            descuento: parseFloat(orden.totales?.descuento) || 0,
            totalFinal: parseFloat(orden.totales?.totalFinal) || 0
        };

        const totalesServidor = calcularTotalesServidor(boletosValidos.length, config, new Date());
        const precioUnitario = totalesServidor.precioUnitario;
        const subtotal = totalesServidor.subtotal;
        const descuento = totalesServidor.descuento;
        const total = totalesServidor.totalFinal;

        if (!Number.isFinite(total) || total < 0) {
            return res.status(400).json({ success: false, message: 'Total calculado por servidor inválido' });
        }

        if (!Number.isFinite(subtotal) || subtotal <= 0) {
            return res.status(400).json({ success: false, message: 'Subtotal calculado por servidor inválido' });
        }

        const auditoria = auditarConsistenciaPrecios(
            boletosValidos.length,
            totalesServidor.precioNormal,
            totalesCliente,
            config
        );

        if (!auditoria.sonIguales) {
            console.warn(`⚠️ [AUDITORÍA] Diferencia cliente/servidor en orden ${ordenId}:`);
            console.warn(`   Cliente: subtotal=$${totalesCliente.subtotal.toFixed(2)}, descuento=$${totalesCliente.descuento.toFixed(2)}, total=$${totalesCliente.totalFinal.toFixed(2)}`);
            console.warn(`   Servidor: subtotal=$${subtotal.toFixed(2)}, descuento=$${descuento.toFixed(2)}, total=$${total.toFixed(2)}`);
        } else {
            console.log(`✅ [AUDITORÍA] Precios consistentes para orden ${ordenId}`);
        }

        // ===== TRANSACCIÓN ATÓMICA =====
        const oportunidadesHabilitadas = config?.rifa?.oportunidades?.enabled === true;

        const resultado = await db.transaction(async (trx) => {
            if (!ordenId) {
                ordenId = await generarSiguienteOrdenId(clienteIdActual, trx);
            }

            // PASO 1: Verificar orden duplicada
            const ordenExistente = await trx('ordenes')
                .where('numero_orden', ordenId)
                .first();

            if (ordenExistente) {
                // 200 OK: orden ya existe (idempotencia)
                return {
                    isDuplicate: true,
                    ordenExistente: ordenExistente
                };
            }

            // PASO 2: Verificar disponibilidad de boletos
            const boletosBD = await trx('boletos_estado')
                .whereIn('numero', boletosValidos)
                .select('numero', 'estado', 'numero_orden');

            const boletosNoDisponibles = boletosBD.filter(b => 
                b.estado !== 'disponible' || b.numero_orden !== null
            );

            if (boletosNoDisponibles.length > 0) {
                // Calcular qué boletos SÍ están disponibles
                const numerosConflictivos = boletosNoDisponibles.map(b => b.numero);
                const boletosDisponibles = boletosValidos.filter(n => !numerosConflictivos.includes(n));
                
                throw {
                    code: 'BOLETOS_CONFLICTO',
                    boletosConflicto: numerosConflictivos,
                    boletosDisponibles: boletosDisponibles,  // ← NUEVO: para mostrar alternativas
                    message: `${boletosNoDisponibles.length} boleto(s) no disponible(s)`
                };
            }

            // PASO 3: INSERT orden
            const ordenData = {
                numero_orden: ordenId,
                cantidad_boletos: boletosValidos.length,
                precio_unitario: Math.round(precioUnitario * 100) / 100,
                subtotal: Math.round(subtotal * 100) / 100,
                descuento: Math.round(descuento * 100) / 100,
                total: Math.round(total * 100) / 100,
                nombre_cliente: `${nombre} ${apellidos}`.trim().slice(0, 100),
                estado_cliente: estado.slice(0, 100),
                ciudad_cliente: ciudad.slice(0, 100),
                telefono_cliente: whatsapp.slice(0, 20),
                metodo_pago: sanitizar(orden.metodoPago || 'transferencia').slice(0, 20),
                detalles_pago: sanitizar(orden.cuenta?.accountNumber || '').slice(0, 255),
                nombre_banco: sanitizar(orden.cuenta?.nombreBanco || '').slice(0, 100),
                numero_referencia: sanitizar(orden.cuenta?.numero_referencia || orden.cuenta?.referencia || '').slice(0, 100),
                nombre_beneficiario: sanitizar(orden.cuenta?.beneficiary || '').slice(0, 150),
                estado: 'pendiente',
                boletos: JSON.stringify(boletosValidos),
                created_at: new Date(),
                updated_at: new Date()
            };

            await trx('ordenes').insert(ordenData);

            // PASO 4: UPDATE boletos a estado 'apartado' y asignar a orden
            await trx('boletos_estado')
                .whereIn('numero', boletosValidos)
                .update({
                    numero_orden: ordenId,
                    estado: 'apartado',
                    updated_at: new Date()
                });

            if (oportunidadesHabilitadas) {
                // PASO 4.5: Ligar oportunidades a la orden solo si están habilitadas
                await trx('orden_oportunidades')
                    .whereIn('numero_boleto', boletosValidos)
                    .whereNull('numero_orden')
                    .update({
                        numero_orden: ordenId,
                        estado: 'apartado'
                    });

                console.log(`✅ Orden ${ordenId} creada: ${boletosValidos.length} boletos + oportunidades asignadas`);
            } else {
                console.log(`✅ Orden ${ordenId} creada: ${boletosValidos.length} boletos (sin oportunidades)`);
            }

            return {
                isDuplicate: false,
                ordenId: ordenId,
                cantidad: boletosValidos.length,
                total: total,
                precioUnitario,
                subtotal,
                descuento,
                totalFinal: total
            };
        });

        // Respuesta
        if (resultado.isDuplicate) {
            // Idempotencia: 200 OK si la orden ya existe
            return res.json({
                success: true,
                message: 'Orden ya registrada',
                ordenId: resultado.ordenExistente.numero_orden,
                url: `http://${req.headers.host || `localhost:${PORT}`}/api/ordenes/${resultado.ordenExistente.numero_orden}`,
                cantidad: resultado.ordenExistente.cantidad_boletos,
                data: {
                    numero_orden: resultado.ordenExistente.numero_orden,
                    cantidad_boletos: resultado.ordenExistente.cantidad_boletos,
                    totales: {
                        precioUnitario: Number(resultado.ordenExistente.precio_unitario ?? 0),
                        subtotal: Number(resultado.ordenExistente.subtotal ?? 0),
                        descuento: Number(resultado.ordenExistente.descuento ?? 0),
                        totalFinal: Number(resultado.ordenExistente.total ?? 0)
                    },
                    estado: resultado.ordenExistente.estado
                }
            });
        }

        const host = req.headers.host || `localhost:${PORT}`;
        log('info', 'Orden creada exitosamente', { ordenId, cantidad: resultado.cantidad, total: resultado.total });

        // 🔌 EMITIR EVENTO DE WEBSOCKET: Nueva orden creada (actualizar grilla en tiempo real)
        if (wsEvents) {
            try {
                wsEvents.emitirNuevaOrden(resultado.cantidad, {
                    numerosApartados: resultado.cantidad,
                    cliente: nombre,
                    timestamp: new Date().toISOString()
                });
                console.log(`✅ Evento WebSocket emitido: Nueva orden con ${resultado.cantidad} boletos`);
            } catch (wsError) {
                // No fallar si hay error en WebSocket - es no-crítico
                console.warn(`⚠️  Error emitiendo evento WebSocket:`, wsError.message);
            }
        }

        return res.json({
            success: true,
            ordenId: resultado.ordenId,
            url: `http://${host}/api/ordenes/${resultado.ordenId}`,
            cantidad: resultado.cantidad,
            total: resultado.total,
            data: {
                numero_orden: resultado.ordenId,
                cantidad_boletos: resultado.cantidad,
                totales: {
                    precioUnitario: resultado.precioUnitario,
                    subtotal: resultado.subtotal,
                    descuento: resultado.descuento,
                    totalFinal: resultado.totalFinal
                },
                estado: 'pendiente'
            }
        });

    } catch (error) {
        const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Errores específicos
        if (error.code === 'BOLETOS_CONFLICTO') {
            log('warn', 'Boletos en conflicto detectados', { ordenId, conflictos: error.boletosConflicto.length });
            return res.status(409).json({
                success: false,
                code: 'BOLETOS_CONFLICTO',
                message: error.message,
                boletosConflicto: error.boletosConflicto,
                boletosDisponibles: error.boletosDisponibles || []  // ← NUEVO: boletos que SÍ están disponibles
            });
        }

        // Error genérico
        log('error', 'POST /api/ordenes error', { errorId, error: error.message, ordenId });
        
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: 'Error al guardar orden',
                errorId: errorId,
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
});

/**
 * GET /api/boletos/liberar-apartados
 * CRÍTICO: Libera TODOS los boletos apartados sin orden válida
 * Esto limpia tanto boletos visibles como oportunidades que quedaron huérfanas
 */
app.get('/api/boletos/liberar-apartados', async (req, res) => {
    try {
        console.log('\n=== LIBERANDO BOLETOS APARTADOS ===\n');
        
        // Contar boletos apartados ANTES
        const apartadosAntes = await db('boletos_estado')
            .where('estado', 'apartado')
            .count('* as cnt');
        const totalAntes = apartadosAntes[0].cnt;
        
        console.log(`📊 Boletos apartados ANTES: ${totalAntes}`);

        // PASO 1: Liberar boletos apartados sin numero_orden (huérfanos)
        console.log(`\n🧹 PASO 1: Liberando boletos HUÉRFANOS (sin número de orden)`);
        const resultado1 = await db.raw(`
            UPDATE boletos_estado
            SET estado = 'disponible',
                numero_orden = NULL,
                updated_at = NOW()
            WHERE estado = 'apartado' AND numero_orden IS NULL
        `);
        
        const liberados1 = resultado1.rowCount;
        console.log(`   ✅ Liberados: ${liberados1} boletos`);

        // PASO 2: Liberar boletos apartados en órdenes NO VÁLIDAS
        // (órdenes que no están en 'pendiente' ni 'confirmada')
        console.log(`\n🧹 PASO 2: Liberando boletos en ÓRDENES INVÁLIDAS`);
        const resultado2 = await db.raw(`
            UPDATE boletos_estado
            SET estado = 'disponible',
                numero_orden = NULL,
                updated_at = NOW()
            WHERE estado = 'apartado'
            AND numero_orden IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM ordenes o 
                WHERE o.numero_orden = boletos_estado.numero_orden 
                AND o.estado IN ('pendiente', 'confirmada')
            )
        `);
        
        const liberados2 = resultado2.rowCount;
        console.log(`   ✅ Liberados: ${liberados2} boletos`);

        const totalLiberados = liberados1 + liberados2;

        // Verificar que no quedan apartados sin orden válida
        const apartadosDespues = await db('boletos_estado')
            .where('estado', 'apartado')
            .count('* as cnt');
        const totalDespues = apartadosDespues[0].cnt;
        
        console.log(`\n📊 Boletos apartados DESPUÉS: ${totalDespues}`);
        console.log(`✅ TOTAL LIBERADOS: ${totalLiberados}\n`);

        return res.json({
            success: true,
            message: `Liberados ${totalLiberados} boletos apartados sin orden válida`,
            estadisticas: {
                apartadosAntes: totalAntes,
                apartadosDespues: totalDespues,
                liberados: totalLiberados,
                huerfanos: liberados1,
                ordenesInvalidas: liberados2
            }
        });

    } catch (error) {
        console.error('❌ Error al liberar apartados:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Error al liberar boletos apartados',
            error: error.message
        });
    }
});

/**
 * GET /api/boletos/sync-full
 * CRÍTICO: Sincroniza completamente boletos_estado con realidad de órdenes
 * 
 * Correcciones:
 * 1. Libera boletos reservados sin orden válida
 * 2. Marca como vendido boletos de órdenes confirmadas
 * 3. Limpia boletos vendidos sin orden confirmada
 */
app.get('/api/boletos/sync-full', async (req, res) => {
    try {
        console.log('\n=== SINCRONIZACIÓN COMPLETA DE BOLETOS_ESTADO ===\n');

        // PASO 1: Limpiar boletos reservados huérfanos
        console.log('1️⃣  Limpiando boletos reservados sin orden válida...');
        
        const liberarHuerfanos = await db.raw(`
            UPDATE boletos_estado
            SET estado = 'disponible',
                numero_orden = NULL,
                updated_at = NOW()
            WHERE estado = 'apartado'
            AND (
              numero_orden IS NULL
              OR NOT EXISTS (
                SELECT 1 FROM ordenes o 
                WHERE o.numero_orden = boletos_estado.numero_orden 
                AND o.estado IN ('pendiente', 'confirmada')
              )
            )
        `);
        const huerfanos = liberarHuerfanos.rowCount;
        console.log(`   ✓ ${huerfanos} boletos liberados\n`);

        // PASO 2: Marcar como vendido boletos de órdenes confirmadas
        console.log('2️⃣  Sincronizando órdenes confirmadas...');
        
        const ordenesConfirmadas = await db('ordenes')
            .where('estado', 'confirmada')
            .select('numero_orden', 'boletos');

        let actualizadosVendidos = 0;
        for (const orden of ordenesConfirmadas) {
            let boletos = [];
            try {
                boletos = JSON.parse(orden.boletos || '[]');
            } catch (e) {
                continue;
            }

            if (boletos.length === 0) continue;

            // Actualizar en lotes para evitar problemas con whereIn
            // Procesar en chunks de 1000 boletos
            const CHUNK_SIZE = 1000;
            for (let i = 0; i < boletos.length; i += CHUNK_SIZE) {
                const chunk = boletos.slice(i, i + CHUNK_SIZE);
                const actualizados = await db('boletos_estado')
                    .whereIn('numero', chunk)
                    .where('estado', '!=', 'vendido')
                    .update({
                        estado: 'vendido',
                        numero_orden: orden.numero_orden,
                        updated_at: new Date()
                    });

                if (actualizados > 0) {
                    actualizadosVendidos += actualizados;
                }
            }
        }
        console.log(`   ✓ ${actualizadosVendidos} boletos marcados como 'vendido'\n`);

        // PASO 3: Limpiar boletos vendidos sin orden confirmada
        console.log('3️⃣  Limpiando boletos vendidos sin orden confirmada...');
        
        const liberarVendidosHuerfanos = await db.raw(`
            UPDATE boletos_estado
            SET estado = 'disponible',
                numero_orden = NULL,
                updated_at = NOW()
            WHERE estado = 'vendido'
            AND (
              numero_orden IS NULL
              OR NOT EXISTS (
                SELECT 1 FROM ordenes o 
                WHERE o.numero_orden = boletos_estado.numero_orden 
                AND o.estado = 'confirmada'
              )
            )
        `);
        const huerfanosVendidos = liberarVendidosHuerfanos.rowCount;
        console.log(`   ✓ ${huerfanosVendidos} boletos liberados\n`);

        // PASO 4: Estadísticas finales
        console.log('4️⃣  Estado final:\n');
        
        const stats = await db.raw(`
            SELECT estado, COUNT(*) as count 
            FROM boletos_estado 
            GROUP BY estado 
            ORDER BY estado
        `);

        const resultado = {
            success: true,
            message: 'Sincronización completada',
            cambios: {
                reservados_liberados: huerfanos,
                vendidos_actualizados: actualizadosVendidos,
                vendidos_liberados: huerfanosVendidos
            },
            stats: {}
        };

        let total = 0;
        for (const stat of stats.rows) {
            resultado.stats[stat.estado] = stat.count;
            total += stat.count;
            console.log(`   ${stat.estado}: ${stat.count}`);
        }

        resultado.stats.total = total;
        const config = cargarConfigSorteo();
        console.log(`   TOTAL: ${total}/${config.totalBoletos.toLocaleString('es-MX')}\n`);
        console.log('✅ SINCRONIZACIÓN COMPLETADA\n');

        return res.json(resultado);

    } catch (error) {
        console.error('❌ Error en sincronización:', error.message);
        console.error(error.stack);
        return res.status(500).json({
            success: false,
            message: 'Error durante la sincronización',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/ordenes/:id
 * Devuelve la orden en formato HTML viewable desde la BD
 */
app.get('/api/ordenes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const ordenRow = await db('ordenes').where('numero_orden', id).first();

        if (!ordenRow) {
            return res.status(404).type('text/html').send(`
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <title>Orden no encontrada</title>
                    <style>
                        body { font-family: sans-serif; text-align: center; padding: 2rem; background: #f3f4f6; }
                        .container { max-width: 600px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>❌ Orden no encontrada</h1>
                        <p>El ID de orden <strong>${id}</strong> no existe en el sistema.</p>
                    </div>
                </body>
                </html>
            `);
        }

        // Parsear boletos JSON
        let boletos = [];
        try {
            boletos = JSON.parse(ordenRow.boletos);
        } catch (e) {
            boletos = [];
        }

        // ✅ Obtener oportunidades de la orden
        let oportunidadesData = { data: [], error: null };
        try {
            const resultado = await OportunidadesOrdenService.obtenerOportunidades(ordenRow.numero_orden);
            oportunidadesData = resultado;
            console.log(`📊 Oportunidades obtenidas para ${ordenRow.numero_orden}:`, { 
                cantidad: resultado.data?.length || 0,
                error: resultado.error 
            });
        } catch (e) {
            console.warn(`Advertencia obteniendo oportunidades para ${ordenRow.numero_orden}:`, e);
            oportunidadesData = { data: [], error: e.message };
        }

        // Extraer array de datos
        const oportunidades = oportunidadesData.data || [];

        const fecha = new Date(ordenRow.created_at).toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        let filasboletos = '';
        boletos.forEach((numero, index) => {
            filasboletos += `
                <tr>
                    <td>${index + 1}</td>
                    <td><strong>${numero}</strong></td>
                    <td>$${ordenRow.precio_unitario.toFixed(2)}</td>
                </tr>
            `;
        });

        const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Orden de Pago ${ordenRow.numero_orden}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: sans-serif;
            padding: 2rem 1rem;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        }
        .header {
            text-align: center;
            margin-bottom: 2rem;
            border-bottom: 3px solid #2563eb;
            padding-bottom: 1rem;
        }
        .header h1 { color: #2563eb; font-size: 1.8rem; }
        .header p { color: #666; margin-top: 0.5rem; }
        .section {
            margin-bottom: 2rem;
        }
        .section-title {
            background: #f3f4f6;
            padding: 0.75rem 1rem;
            border-left: 4px solid #2563eb;
            font-weight: bold;
            margin-bottom: 1rem;
            color: #1f2937;
        }
        .field-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .field {
            padding: 0.75rem;
            background: #f9fafb;
            border-radius: 6px;
        }
        .field-label { font-size: 0.85rem; color: #666; font-weight: 600; text-transform: uppercase; }
        .field-value { font-size: 1rem; color: #1f2937; font-weight: 500; margin-top: 0.25rem; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
        }
        th, td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
        }
        th {
            background: #f3f4f6;
            font-weight: 600;
            color: #1f2937;
        }
        .total-row {
            background: #dbeafe;
            font-weight: bold;
            color: #1e40af;
        }
        .footer {
            text-align: center;
            margin-top: 2rem;
            padding-top: 1rem;
            border-top: 1px solid #e5e7eb;
            color: #666;
            font-size: 0.9rem;
        }
        .print-btn {
            display: block;
            margin: 1rem auto;
            padding: 0.75rem 1.5rem;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 1rem;
        }
        .print-btn:hover { background: #1e40af; }
        @media print {
            body { background: white; padding: 0; }
            .print-btn { display: none; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎯 Orden de Pago</h1>
            <p><strong>#${ordenRow.numero_orden}</strong></p>
            <p style="font-size: 0.9rem; color: #999; margin-top: 0.5rem;">${fecha}</p>
        </div>

        <button class="print-btn" onclick="window.print()">📄 Imprimir / Guardar como PDF</button>

        <div class="section">
            <div class="section-title">📋 Datos del Cliente</div>
            <div class="field-row">
                <div class="field">
                    <div class="field-label">Nombre Completo</div>
                    <div class="field-value">${ordenRow.nombre_cliente}</div>
                </div>
                <div class="field">
                    <div class="field-label">WhatsApp</div>
                    <div class="field-value">${ordenRow.telefono_cliente}</div>
                </div>
            </div>
            <div class="field-row">
                <div class="field">
                    <div class="field-label">Estado</div>
                    <div class="field-value">${ordenRow.estado.toUpperCase()}</div>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">🎫 Detalles de Compra</div>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Boleto</th>
                        <th>Precio Unitario</th>
                    </tr>
                </thead>
                <tbody>
                    ${filasboletos}
                    <tr class="total-row">
                        <td colspan="2">Subtotal (${boletos.length} boletos)</td>
                        <td>$${parseFloat(ordenRow.subtotal || 0).toFixed(2)}</td>
                    </tr>
                    ${parseFloat(ordenRow.descuento || 0) > 0 ? `
                    <tr class="total-row">
                        <td colspan="2">Descuento</td>
                        <td>-$${parseFloat(ordenRow.descuento || 0).toFixed(2)}</td>
                    </tr>
                    ` : ''}
                    <tr class="total-row">
                        <td colspan="2"><strong>TOTAL A PAGAR</strong></td>
                        <td><strong>$${parseFloat(ordenRow.total || 0).toFixed(2)}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>

        ${oportunidades.length > 0 ? `
        <div class="section">
            <div class="section-title">🎁 Boletos Oportunidades (Sorpresa)</div>
            <p style="color: #666; font-size: 0.95rem; margin-bottom: 1rem;">
                ¡Felicidades! Junto con tu compra recibiste boletos adicionales como sorpresa:
            </p>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Número de Boleto</th>
                    </tr>
                </thead>
                <tbody>
                    ${oportunidades.map((num, idx) => `
                    <tr style="background: #fef08a;">
                        <td>${idx + 1}</td>
                        <td><strong style="color: #b45309;">${num}</strong></td>
                    </tr>
                    `).join('')}
                    <tr class="total-row" style="background: #fef3c7;">
                        <td colspan="2"><strong>Total Oportunidades: ${oportunidades.length}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>
        ` : ''}

        ${ordenRow.detalles_pago ? `
        <div class="section">
            <div class="section-title">💳 Detalles de Pago</div>
            <div class="field">
                <div class="field-label">Información</div>
                <div class="field-value">${ordenRow.detalles_pago}</div>
            </div>
        </div>
        ` : ''}

        <div class="footer">
            <p>✅ Esta orden fue registrada el ${fecha}</p>
            <p>Gracias por tu participación en nuestra rifa 🍀</p>
        </div>
    </div>
</body>
</html>
        `;

        res.type('text/html').send(html);
    } catch (error) {
        console.error('GET /api/ordenes/:id error:', error);
        res.status(500).type('text/html').send(`
            <html>
            <head><title>Error</title></head>
            <body><h1>❌ Error: ${error.message}</h1></body>
            </html>
        `);
    }
});

/**
 * GET /api/ordenes/:id/oportunidades
 * Obtiene SOLO las oportunidades de una orden específica (sin cargar boletos)
 * Usado cuando se hace click en "Ver Orden" en admin
 */
app.get('/api/ordenes/:id/oportunidades', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Obtener oportunidades de UNA orden específica
        const oportunidades = await db('orden_oportunidades')
            .where('numero_orden', id)
            .select('numero_oportunidad')
            .orderBy('numero_oportunidad', 'asc');
        
        const oportunidadesArray = oportunidades.map(op => op.numero_oportunidad);
        
        return res.json({
            success: true,
            numero_orden: id,
            oportunidades: oportunidadesArray,
            cantidad: oportunidadesArray.length
        });
    } catch (error) {
        console.error('GET /api/ordenes/:id/oportunidades error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener oportunidades',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/public/ordenes-cliente
 * Endpoint PÚBLICO para consultar órdenes de un cliente por WhatsApp
 * Usado por mis-boletos.html
 * Query params: ?whatsapp=5512345678
 * NO requiere JWT
 * 
 * Respuesta:
 * - Si hay órdenes: array de objetos { numero_orden, boletos, total, estado, created_at }
 * - Si no hay: array vacío []
 * - En error: { success: false, message: "..." }
 */
app.get('/api/public/ordenes-cliente', async (req, res) => {
    try {
        const { whatsapp } = req.query;

        // ===== VALIDACIÓN =====
        // WhatsApp es obligatorio
        if (!whatsapp) {
            log('warn', 'GET /api/public/ordenes-cliente: WhatsApp no proporcionado', { ip: req.ip });
            return res.status(400).json({
                success: false,
                message: 'El parámetro whatsapp es obligatorio'
            });
        }

        // Validar formato: solo dígitos, 10-12 caracteres
        const whatsappSanitizado = String(whatsapp).replace(/[^0-9]/g, '');
        
        if (whatsappSanitizado.length < 10 || whatsappSanitizado.length > 12) {
            log('warn', 'GET /api/public/ordenes-cliente: WhatsApp inválido', { 
                whatsapp_input: whatsapp,
                whatsapp_sanitizado: whatsappSanitizado,
                ip: req.ip 
            });
            return res.status(400).json({
                success: false,
                message: 'WhatsApp debe contener entre 10 y 12 dígitos'
            });
        }

        // ✅ Consultar órdenes primero
        const ordenes = await db('ordenes')
            .where('telefono_cliente', whatsappSanitizado)
            .orderBy('created_at', 'desc');

        // ✅ Agregar oportunidades a cada orden (si existen)
        const ordenesConOportunidades = await Promise.all(
            ordenes.map(async (orden) => {
                const oportunidades = await db('orden_oportunidades')
                    .where('numero_orden', orden.numero_orden)
                    .pluck('numero_oportunidad');
                return {
                    ...orden,
                    oportunidades: oportunidades || []
                };
            })
        );

        // DEBUG: Log si no encuentra nada
        if (ordenes.length === 0) {
            console.log(`⚠️ No se encontraron órdenes para: ${whatsappSanitizado}`);
        }

        // ✅ Mapeo SINCRÓNICO - Ya tenemos todas las oportunidades agregadas
        const ordenesFormateadas = ordenesConOportunidades.map(orden => {
            let boletosParsados = [];
            try {
                let boletos = orden.boletos;
                if (typeof boletos === 'string') {
                    boletosParsados = JSON.parse(boletos || '[]');
                } else if (Array.isArray(boletos)) {
                    boletosParsados = boletos;
                }
            } catch (e) {
                console.warn(`Error parseando boletos de orden ${orden.numero_orden}:`, e);
                boletosParsados = [];
            }

            // ✅ Oportunidades ya agrupadas en la query - solo filtrar nulls
            const oportunidades = Array.isArray(orden.oportunidades)
                ? orden.oportunidades.filter(op => op !== null && op !== '')
                : [];

            return {
                id: orden.numero_orden,
                numero_orden: orden.numero_orden,
                nombre_cliente: orden.nombre_cliente || '',
                apellido_cliente: orden.apellido_cliente || '',
                estado_cliente: orden.estado_cliente || '',
                ciudad_cliente: orden.ciudad_cliente || '',
                whatsapp: orden.telefono_cliente || '',
                telefono_cliente: orden.telefono_cliente || '',
                cantidad_boletos: orden.cantidad_boletos || 0,
                precio_unitario: Number(orden.precio_unitario ?? 0),
                subtotal: Number(orden.subtotal ?? 0),
                descuento: Number(orden.descuento ?? 0),
                boletos: boletosParsados,
                oportunidades: oportunidades,
                total: Number(orden.total ?? 0),
                tipo_pago: orden.metodo_pago || 'No especificado',
                metodo_pago: orden.metodo_pago || 'No especificado',
                estado: orden.estado || 'pendiente',
                detalles_pago: orden.detalles_pago || null,
                nombre_banco: orden.nombre_banco || null,
                numero_referencia: orden.numero_referencia || null,
                nombre_beneficiario: orden.nombre_beneficiario || null,
                comprobante_path: orden.comprobante_path || null,
                createdAt: orden.created_at,
                updatedAt: orden.updated_at
            };
        });

        log('info', 'GET /api/public/ordenes-cliente exitoso', {
            whatsapp: whatsappSanitizado,
            cantidad_ordenes: ordenesFormateadas.length,
            ip: req.ip
        });

        // Devolver array (vacío si no hay órdenes)
        return res.json(ordenesFormateadas);

    } catch (error) {
        log('error', 'GET /api/public/ordenes-cliente error', { 
            error: error.message,
            ip: req.ip 
        });
        return res.status(500).json({
            success: false,
            message: 'Error al consultar órdenes',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/public/ordenes-cliente/:numero_orden/comprobante
 * Endpoint PÚBLICO para subir comprobante de pago
 * 
 * Utiliza comprobanteService para validación robusta:
 * 1. Validación de schema BD
 * 2. Validación de datos
 * 3. Validación de archivo
 * 4. Validación de orden
 * 5. Upload a Cloudinary
 * 6. Actualización de BD
 * 
 * @param {Request} req.params.numero_orden - Número de orden
 * @param {FormData} req.body.whatsapp - WhatsApp del cliente
 * @param {FormData} req.files.comprobante - Archivo JPG/PNG/PDF
 * @returns {JSON} { success, message, numero_orden, url?, error? }
 */
app.post('/api/public/ordenes-cliente/:numero_orden/comprobante', async (req, res) => {
    const debugId = `[COMPROBANTE-${Date.now()}]`;
    
    try {
        const { numero_orden } = req.params;
        const whatsapp = req.body?.whatsapp;
        const archivo = req.files?.comprobante;

        console.log(`\n${debugId} Inicio de carga de comprobante`);
        console.log(`${debugId} Orden: ${numero_orden}, WhatsApp: ${whatsapp ? 'SI' : 'NO'}, Archivo: ${archivo ? 'SI' : 'NO'}`);

        // Usar service para procesar comprobante (todas las validaciones incluidas)
        const resultado = await comprobanteService.procesarComprobante({
            numeroOrden: numero_orden,
            whatsapp,
            archivo
        });

        console.log(`${debugId} ✅ Comprobante procesado exitosamente\n`);

        log('info', 'Comprobante subido exitosamente', {
            numero_orden,
            tamaño_mb: resultado.tamaño_mb,
            // 🔒 NO loguear la URL de Cloudinary (información sensible)
            // cloudinary_url: resultado.url,
            ip: req.ip
        });

        // 🔒 NO retornar URL completa al cliente (solo confirmación)
        return res.json({
            success: true,
            message: 'Comprobante subido correctamente',
            numero_orden: resultado.numero_orden
        });

    } catch (error) {
        // Error classification
        let statusCode = 500;
        let errorMessage = error.message || 'Error desconocido';

        // Clasificar errores comunes
        if (errorMessage.includes('Archivo')) statusCode = 400;
        if (errorMessage.includes('obligatorio')) statusCode = 400;
        if (errorMessage.includes('inválido')) statusCode = 400;
        if (errorMessage.includes('no encontrada')) statusCode = 404;
        if (errorMessage.includes('permiso')) statusCode = 403;
        if (errorMessage.includes('demasiado grande')) statusCode = 413;
        if (errorMessage.includes('Cloudinary')) statusCode = 500;
        if (errorMessage.includes('Esquema de BD')) statusCode = 500;

        console.error(`\n${debugId} ❌ Error procesando comprobante`);
        console.error(`${debugId} Status: ${statusCode}`);
        console.error(`${debugId} Mensaje: ${errorMessage}`);
        console.error(`${debugId} Stack:`, error.stack.split('\n').slice(0, 5).join('\n'));
        console.error('');

        log('error', 'Error en POST /comprobante', {
            statusCode,
            error: errorMessage,
            numero_orden: req.params.numero_orden || 'N/A',
            ip: req.ip
        });

        // 🔒 Sanitizar el mensaje de error ANTES de enviar al cliente
        const safeMessage = sanitizarErrorMessage(errorMessage, process.env.NODE_ENV === 'development');

        return res.status(statusCode).json({
            success: false,
            message: safeMessage,
            ...(process.env.NODE_ENV === 'development' && { debug: errorMessage })
        });
    }
});

/**
 * GET /api/ordenes/por-cliente/:email
 * Busca órdenes recientes del cliente para recuperación tras conflictos puntuales
 * Query params: ?nombre=X&whatsapp=Y (búsqueda por cliente)
 */
app.get('/api/ordenes/por-cliente/:email', limiterRecuperacionOrdenes, async (req, res) => {
    try {
        const { nombre, whatsapp } = req.query;
        
        // Se requiere al menos nombre + whatsapp para búsqueda
        if (!nombre || !whatsapp) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere nombre y whatsapp'
            });
        }

        const nombreNormalizado = String(nombre).trim().toLowerCase().replace(/\s+/g, ' ');
        const whatsappDigitos = String(whatsapp).replace(/[^0-9]/g, '');

        if (nombreNormalizado.length < 3 || whatsappDigitos.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Datos insuficientes para recuperar la orden'
            });
        }
        
        // Buscar en últimos 30 minutos (para recuperación de race conditions)
        const hace30Min = new Date(Date.now() - 30 * 60 * 1000);

        // Búsqueda estricta por nombre normalizado en ventana corta
        const ordenes = await db('ordenes')
            .where('created_at', '>=', hace30Min)
            .whereRaw("LOWER(TRIM(REGEXP_REPLACE(nombre_cliente, '\\s+', ' ', 'g'))) = ?", [nombreNormalizado])
            .select('numero_orden', 'estado', 'cantidad_boletos', 'total', 'created_at', 'nombre_cliente', 'telefono_cliente')
            .orderBy('created_at', 'desc')
            .limit(5);
        
        // Filtrar por whatsapp (últimos dígitos del teléfono guardado)
        const ordenesFiltradas = ordenes.filter(o => {
            const telefonoGuardado = (o.telefono_cliente || '').replace(/[^0-9]/g, '');
            return telefonoGuardado.endsWith(whatsappDigitos) || telefonoGuardado === whatsappDigitos;
        });
        
        return res.json(ordenesFiltradas.map((orden) => ({
            numero_orden: orden.numero_orden,
            estado: orden.estado,
            cantidad_boletos: orden.cantidad_boletos,
            total: orden.total,
            created_at: orden.created_at,
            nombre_cliente: orden.nombre_cliente
        })));
    } catch (error) {
        console.error('GET /api/ordenes/por-cliente/:email error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al buscar órdenes'
        });
    }
});

/**
 * GET /api/ordenes
 * Lista todas las órdenes (protegido con JWT)
 * Query params: ?estado=pendiente, ?limit=50, ?offset=0
 */
app.get('/api/ordenes', verificarToken, async (req, res) => {
    try {
        const {
            estado,
            limit = 50,
            offset = 0,
            searchId = '',
            searchNombre = '',
            searchWhatsapp = '',
            fechaDesde = '',
            fechaHasta = '',
            sortBy = 'fecha-desc'
        } = req.query;
        const limitSeguro = Math.max(1, Math.min(parseInt(limit, 10) || 50, 500));
        const offsetSeguro = Math.max(0, parseInt(offset, 10) || 0);
        const estadoFiltro = String(estado || '').trim().toLowerCase();
        const nombreFiltro = String(searchNombre || '').trim().toLowerCase();
        const whatsappFiltro = String(searchWhatsapp || '').replace(/[^0-9]/g, '');
        const idFiltro = String(searchId || '').trim().toLowerCase();
        
        const applyFilters = (builder) => {
            if (estadoFiltro) {
                if (estadoFiltro === 'comprobante_recibido' || estadoFiltro === 'comprobante') {
                    builder.where(function() {
                        this.whereNotNull('comprobante_path')
                            .orWhere('comprobante_recibido', true);
                    });
                } else {
                    builder.where('estado', estadoFiltro);
                }
            }

            if (idFiltro) {
                builder.whereRaw('LOWER(COALESCE(numero_orden, \'\')) LIKE ?', [`%${idFiltro}%`]);
            }

            if (nombreFiltro) {
                builder.whereRaw('LOWER(COALESCE(nombre_cliente, \'\')) LIKE ?', [`%${nombreFiltro}%`]);
            }

            if (whatsappFiltro) {
                builder.whereRaw("REGEXP_REPLACE(COALESCE(telefono_cliente, ''), '[^0-9]', '', 'g') LIKE ?", [`%${whatsappFiltro}%`]);
            }

            if (fechaDesde) {
                const desde = new Date(fechaDesde);
                desde.setHours(0, 0, 0, 0);
                if (!Number.isNaN(desde.getTime())) {
                    builder.where('created_at', '>=', desde.toISOString());
                }
            }

            if (fechaHasta) {
                const hasta = new Date(fechaHasta);
                hasta.setHours(23, 59, 59, 999);
                if (!Number.isNaN(hasta.getTime())) {
                    builder.where('created_at', '<=', hasta.toISOString());
                }
            }
        };

        const applySort = (builder) => {
            switch (sortBy) {
                case 'fecha-asc':
                    builder.orderBy('created_at', 'asc');
                    break;
                case 'nombre-asc':
                    builder.orderByRaw("LOWER(COALESCE(nombre_cliente, '')) ASC").orderBy('created_at', 'desc');
                    break;
                case 'nombre-desc':
                    builder.orderByRaw("LOWER(COALESCE(nombre_cliente, '')) DESC").orderBy('created_at', 'desc');
                    break;
                case 'estado':
                    builder.orderByRaw("LOWER(COALESCE(estado, '')) ASC").orderBy('created_at', 'desc');
                    break;
                case 'total-desc':
                    builder.orderBy('total', 'desc').orderBy('created_at', 'desc');
                    break;
                case 'total-asc':
                    builder.orderBy('total', 'asc').orderBy('created_at', 'desc');
                    break;
                case 'fecha-desc':
                default:
                    builder.orderBy('created_at', 'desc');
                    break;
            }
        };

        let query = db('ordenes').select('*');
        applyFilters(query);
        applySort(query);

        let totalQuery = db('ordenes');
        applyFilters(totalQuery);

        const summaryQuery = db('ordenes').select(
            db.raw("COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) as pendiente"),
            db.raw("COUNT(CASE WHEN COALESCE(comprobante_recibido, false) = true OR comprobante_path IS NOT NULL THEN 1 END) as comprobante_recibido"),
            db.raw("COUNT(CASE WHEN estado = 'confirmada' THEN 1 END) as confirmada"),
            db.raw("COUNT(CASE WHEN estado = 'cancelada' THEN 1 END) as cancelada"),
            db.raw('COALESCE(SUM(cantidad_boletos), 0) as total_boletos')
        );
        applyFilters(summaryQuery);

        const [total, summaryRow, ordenes] = await Promise.all([
            totalQuery.count('* as count').first(),
            summaryQuery,
            query.limit(limitSeguro).offset(offsetSeguro)
        ]);

        const summary = {
            pendiente: 0,
            comprobante_recibido: 0,
            confirmada: 0,
            cancelada: 0,
            totalBoletos: 0
        };

        summary.pendiente = parseInt(summaryRow?.pendiente || 0, 10) || 0;
        summary.comprobante_recibido = parseInt(summaryRow?.comprobante_recibido || 0, 10) || 0;
        summary.confirmada = parseInt(summaryRow?.confirmada || 0, 10) || 0;
        summary.cancelada = parseInt(summaryRow?.cancelada || 0, 10) || 0;
        summary.totalBoletos = parseInt(summaryRow?.total_boletos || 0, 10) || 0;

        summary.pendienteTotal = summary.pendiente + summary.comprobante_recibido;

        // Parsear boletos de cada orden - manejo seguro para PostgreSQL
        // ⚠️ CRÍTICO: Limitar concurrencia a 3 para evitar "MaxClientsInSessionMode" en Vercel
        const ordenesConPromesas = ordenes.map(async (o) => {
            let boletosParsados = [];
            try {
                // Si ya es un objeto (PostgreSQL JSON), usarlo directamente
                // Si es string (posible JSON string), parsearlo
                if (typeof o.boletos === 'string') {
                    boletosParsados = JSON.parse(o.boletos || '[]');
                } else if (Array.isArray(o.boletos)) {
                    boletosParsados = o.boletos;
                } else if (o.boletos && typeof o.boletos === 'object') {
                    boletosParsados = Array.isArray(o.boletos) ? o.boletos : [];
                }
            } catch (e) {
                console.warn(`⚠️ Error parseando boletos de orden ${o.numero_orden}:`, e.message);
                boletosParsados = [];
            }

            return {
                ...o,
                ordenId: o.numero_orden,
                boletos: boletosParsados
            };
        });

        // Ejecutar promesas con concurrencia limitada (máx 3 simultáneas)
        const ordenesParsadas = await pLimit(ordenesConPromesas, 3);

        return res.json({
            success: true,
            data: ordenesParsadas,
            total: total.count,
            limit: limitSeguro,
            offset: offsetSeguro,
            summary
        });
    } catch (error) {
        console.error('GET /api/ordenes error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener órdenes',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/admin/boleto-simple/:numero
 * Busca un boleto específico (vendido o disponible)
 * Protegido con JWT
 */
app.get('/api/admin/boleto-simple/:numero', verificarToken, async (req, res) => {
    try {
        const numeroboleto = Number(req.params.numero);
        
        if (isNaN(numeroboleto)) {
            return res.status(400).json({
                success: false,
                message: 'Número de boleto inválido'
            });
        }

        // 🎯 OBTENER RANGO DINÁMICO desde configuración (NO hardcodeado)
        const config = cargarConfigSorteo();
        let rangoMax = 249999; // Default
        let rangoMin = 0;
        
        // Caso 1: Oportunidades habilitadas → usar rango_visible
        if (config?.rifa?.oportunidades?.enabled && config?.rifa?.oportunidades?.rango_visible) {
            const rango = config.rifa.oportunidades.rango_visible;
            rangoMin = rango.inicio || 0;
            rangoMax = rango.fin || 249999;
            console.debug(`[boleto-simple] Usando rango visible (oportunidades): ${rangoMin}-${rangoMax}`);
        } 
        // Caso 2: Sin oportunidades → usar totalBoletos
        else if (config?.rifa?.totalBoletos) {
            rangoMin = 0;
            rangoMax = config.rifa.totalBoletos - 1;
            console.debug(`[boleto-simple] Usando totalBoletos: ${rangoMin}-${rangoMax}`);
        }

        // Validar que el número está en rango
        if (numeroboleto < rangoMin || numeroboleto > rangoMax) {
            return res.status(404).json({
                success: false,
                message: `Boleto fuera de rango (${rangoMin}-${rangoMax})`
            });
        }

        // Buscar órdenes que contienen este boleto (DB-agnóstico: JSONB/text/CSV)
        const ordenes = await dbUtils.ordersContainingBoletoQuery(numeroboleto).select('*');

        let ordenEncontrada = null;
        for (const orden of ordenes) {
            try {
                // Soportar múltiples formatos históricos de la columna `boletos`:
                // - JSON array de números: [1,2,3]
                // - JSON array de objetos: [{"numero":1}, {"numero":2}]
                // - CSV string: "1,2,3"
                // - String con números
                let boletosArr = [];

                const raw = orden.boletos;
                if (!raw) {
                    boletosArr = [];
                } else if (Array.isArray(raw)) {
                    // La columna ya vino como array (JSONB en Postgres)
                    boletosArr = raw;
                } else if (typeof raw === 'object' && raw !== null) {
                    // Objeto - intentar extraer valores
                    boletosArr = Object.values(raw);
                } else if (typeof raw === 'string') {
                    // String: intentar parseo JSON o CSV
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) {
                            boletosArr = parsed;
                        } else if (typeof parsed === 'object' && parsed !== null) {
                            boletosArr = Object.values(parsed);
                        } else if (typeof parsed === 'string') {
                            boletosArr = parsed.split(',').map(s => s.trim()).filter(Boolean);
                        }
                    } catch (err) {
                        // No JSON: intentar CSV o string separado por comas
                        boletosArr = raw.split(',').map(s => s.trim()).filter(Boolean);
                    }
                }

                // Normalizar a números: soportar elementos numéricos, strings numéricas y objetos {numero: X}
                const boletosNumericos = boletosArr.map(b => {
                    if (b === null || typeof b === 'undefined') return NaN;
                    if (typeof b === 'number') return b;
                    if (typeof b === 'string') {
                        const n = Number(b);
                        if (!isNaN(n)) return n;
                        // intentar parseo JSON embebido
                        try {
                            const inner = JSON.parse(b);
                            if (inner && typeof inner === 'object') {
                                return Number(inner.numero || inner.numero_boleto || inner.n || inner.id || NaN);
                            }
                        } catch (e) {
                            return NaN;
                        }
                    }
                    if (typeof b === 'object') {
                        return Number(b.numero || b.numero_boleto || b.n || b.id || NaN);
                    }
                    return NaN;
                }).filter(n => !isNaN(n));

                if (boletosNumericos.includes(numeroboleto)) {
                    // Si no hay orden encontrada, o esta orden es más reciente, actualizar
                    if (!ordenEncontrada || new Date(orden.created_at) > new Date(ordenEncontrada.created_at)) {
                        ordenEncontrada = orden;
                    }
                }
            } catch (e) {
                // Ignorar errores y continuar con la siguiente orden
                console.warn('Warning parsing boletos for orden', orden.id, e && e.message);
            }
        }
        
        // Si hay orden, retornarla
        if (ordenEncontrada) {
            // Consolidar datos de ciudad - preferir ciudad_cliente, fallback a ciudad
            const ciudadFinal = ordenEncontrada.ciudad_cliente || ordenEncontrada.ciudad || '';
            const estadoFinal = ordenEncontrada.estado_cliente || '';
            
            // Obtener número de teléfono (fallback a campos alternativos si es necesario)
            let telefonoFinal = ordenEncontrada.telefono_cliente || 
                               ordenEncontrada.telefono ||
                               '';
            
            return res.json({
                success: true,
                ok: true,
                data: {
                    numero: numeroboleto,
                    estado: ordenEncontrada.estado === 'confirmada' ? 'vendido' : 'apartado',
                    numero_orden: ordenEncontrada.numero_orden,
                    nombre_cliente: ordenEncontrada.nombre_cliente || '',
                    apellido_cliente: ordenEncontrada.apellido_cliente || '',
                    email: ordenEncontrada.email || '',
                    telefono: telefonoFinal,
                    ciudad: ciudadFinal,
                    estado_cliente: estadoFinal,
                    ciudad_cliente: ciudadFinal,
                    estado_orden: ordenEncontrada.estado,
                    cantidad_boletos: ordenEncontrada.cantidad_boletos || 0,
                    total: ordenEncontrada.total || 0,
                    fecha_pago: ordenEncontrada.fecha_pago,
                    comprobante_pagado_at: ordenEncontrada.comprobante_pagado_at,
                    // Si `comprobante_fecha` no existe (migraciones antiguas), usar updated_at o created_at como fallback
                    comprobante_fecha: ordenEncontrada.comprobante_fecha || ordenEncontrada.updated_at || ordenEncontrada.comprobante_pagado_at || ordenEncontrada.created_at,
                    comprobante_path: ordenEncontrada.comprobante_path,
                    created_at: ordenEncontrada.created_at
                }
            });
        }

        // Devolver boleto disponible
        return res.json({
            success: true,
            ok: true,
            data: {
                numero: numeroboleto,
                estado: 'disponible',
                numero_orden: null,
                nombre_cliente: '',
                apellido_cliente: '',
                email: '',
                telefono: '',
                ciudad: '',
                estado_cliente: '',
                ciudad_cliente: '',
                estado_orden: 'disponible',
                total: 0,
                fecha_pago: null,
                comprobante_pagado_at: null,
                created_at: null
            }
        });
    } catch (error) {
        console.error('GET /api/admin/boleto-simple/:numero error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al buscar boleto',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/admin/numero-inteligente/:numero
 * Búsqueda inteligente que detecta si es boleto u oportunidad
 * - Si número < 250000: Busca en boletos
 * - Si número >= 250000: Busca en oportunidades
 * Retorna los mismos datos, pero agrega flag 'es_oportunidad'
 * Protegido con JWT
 */
app.get('/api/admin/numero-inteligente/:numero', verificarToken, async (req, res) => {
    try {
        const numero = Number(req.params.numero);
        
        if (isNaN(numero)) {
            return res.status(400).json({
                success: false,
                message: 'Número inválido'
            });
        }

        // 🎯 OBTENER RANGO DINÁMICO desde configuración
        const config = cargarConfigSorteo();
        const totalBoletos = config?.rifa?.totalBoletos || 250000;
        const inicioOportunidades = totalBoletos;
        
        // Determinar si es boleto u oportunidad
        const esOportunidad = numero >= inicioOportunidades;
        
        console.log(`[numero-inteligente] Buscando #${numero} (${esOportunidad ? 'OPORTUNIDAD' : 'BOLETO'})`);

        // ===== CASO 1: OPORTUNIDAD =====
        if (esOportunidad) {
            // Buscar en tabla orden_oportunidades
            const oportunidad = await db('orden_oportunidades')
                .where('numero_oportunidad', numero)
                .first();
            
            if (!oportunidad) {
                // Oportunidad no encontrada
                return res.json({
                    success: true,
                    ok: true,
                    es_oportunidad: true,
                    data: {
                        numero: numero,
                        estado: 'disponible',
                        numero_orden: null,
                        nombre_cliente: '',
                        apellido_cliente: '',
                        email: '',
                        telefono: '',
                        ciudad: '',
                        estado_cliente: '',
                        ciudad_cliente: '',
                        estado_orden: 'disponible',
                        cantidad_boletos: 0,
                        total: 0,
                        fecha_pago: null,
                        comprobante_pagado_at: null,
                        comprobante_fecha: null,
                        comprobante_path: null,
                        created_at: null
                    }
                });
            }

            // Oportunidad encontrada - Buscar orden asociada
            let ordenAsociada = null;
            if (oportunidad.numero_orden) {
                ordenAsociada = await db('ordenes')
                    .where('numero_orden', oportunidad.numero_orden)
                    .first();
            }

            if (ordenAsociada) {
                // Consolidar datos de ciudad
                const ciudadFinal = ordenAsociada.ciudad_cliente || ordenAsociada.ciudad || '';
                const estadoFinal = ordenAsociada.estado_cliente || '';
                
                // Obtener número de teléfono
                let telefonoFinal = ordenAsociada.telefono_cliente || 
                                   ordenAsociada.telefono ||
                                   '';
                
                return res.json({
                    success: true,
                    ok: true,
                    es_oportunidad: true,
                    data: {
                        numero: numero,
                        estado: ordenAsociada.estado === 'confirmada' ? 'vendido' : 'apartado',
                        numero_orden: ordenAsociada.numero_orden,
                        nombre_cliente: ordenAsociada.nombre_cliente || '',
                        apellido_cliente: ordenAsociada.apellido_cliente || '',
                        email: ordenAsociada.email || '',
                        telefono: telefonoFinal,
                        ciudad: ciudadFinal,
                        estado_cliente: estadoFinal,
                        ciudad_cliente: ciudadFinal,
                        estado_orden: ordenAsociada.estado,
                        cantidad_boletos: ordenAsociada.cantidad_boletos || 0,
                        total: ordenAsociada.total || 0,
                        fecha_pago: ordenAsociada.fecha_pago,
                        comprobante_pagado_at: ordenAsociada.comprobante_pagado_at,
                        comprobante_fecha: ordenAsociada.comprobante_fecha || ordenAsociada.updated_at || ordenAsociada.comprobante_pagado_at || ordenAsociada.created_at,
                        comprobante_path: ordenAsociada.comprobante_path,
                        created_at: ordenAsociada.created_at
                    }
                });
            }

            // Oportunidad sin orden asociada - Estado disponible o apartado
            return res.json({
                success: true,
                ok: true,
                es_oportunidad: true,
                data: {
                    numero: numero,
                    estado: oportunidad.estado || 'disponible',
                    numero_orden: null,
                    nombre_cliente: '',
                    apellido_cliente: '',
                    email: '',
                    telefono: '',
                    ciudad: '',
                    estado_cliente: '',
                    ciudad_cliente: '',
                    estado_orden: oportunidad.estado || 'disponible',
                    cantidad_boletos: 0,
                    total: 0,
                    fecha_pago: null,
                    comprobante_pagado_at: null,
                    comprobante_fecha: null,
                    comprobante_path: null,
                    created_at: null
                }
            });
        }

        // ===== CASO 2: BOLETO =====
        else {
            // Buscar órdenes que contienen este boleto
            const ordenes = await dbUtils.ordersContainingBoletoQuery(numero).select('*');

            let ordenEncontrada = null;
            for (const orden of ordenes) {
                try {
                    let boletosArr = [];
                    const raw = orden.boletos;
                    
                    if (!raw) {
                        boletosArr = [];
                    } else if (Array.isArray(raw)) {
                        boletosArr = raw;
                    } else if (typeof raw === 'object' && raw !== null) {
                        boletosArr = Object.values(raw);
                    } else if (typeof raw === 'string') {
                        try {
                            const parsed = JSON.parse(raw);
                            if (Array.isArray(parsed)) {
                                boletosArr = parsed;
                            } else if (typeof parsed === 'object' && parsed !== null) {
                                boletosArr = Object.values(parsed);
                            } else if (typeof parsed === 'string') {
                                boletosArr = parsed.split(',').map(s => s.trim()).filter(Boolean);
                            }
                        } catch (err) {
                            boletosArr = raw.split(',').map(s => s.trim()).filter(Boolean);
                        }
                    }

                    const boletosNumericos = boletosArr.map(b => {
                        if (b === null || typeof b === 'undefined') return NaN;
                        if (typeof b === 'number') return b;
                        if (typeof b === 'string') {
                            const n = Number(b);
                            if (!isNaN(n)) return n;
                            try {
                                const inner = JSON.parse(b);
                                if (inner && typeof inner === 'object') {
                                    return Number(inner.numero || inner.numero_boleto || inner.n || inner.id || NaN);
                                }
                            } catch (e) {
                                return NaN;
                            }
                        }
                        if (typeof b === 'object') {
                            return Number(b.numero || b.numero_boleto || b.n || b.id || NaN);
                        }
                        return NaN;
                    }).filter(n => !isNaN(n));

                    if (boletosNumericos.includes(numero)) {
                        if (!ordenEncontrada || new Date(orden.created_at) > new Date(ordenEncontrada.created_at)) {
                            ordenEncontrada = orden;
                        }
                    }
                } catch (e) {
                    console.warn('Warning parsing boletos for orden', orden.id, e && e.message);
                }
            }
            
            if (ordenEncontrada) {
                const ciudadFinal = ordenEncontrada.ciudad_cliente || ordenEncontrada.ciudad || '';
                const estadoFinal = ordenEncontrada.estado_cliente || '';
                
                let telefonoFinal = ordenEncontrada.telefono_cliente || 
                                   ordenEncontrada.telefono ||
                                   '';
                
                return res.json({
                    success: true,
                    ok: true,
                    es_oportunidad: false,
                    data: {
                        numero: numero,
                        estado: ordenEncontrada.estado === 'confirmada' ? 'vendido' : 'apartado',
                        numero_orden: ordenEncontrada.numero_orden,
                        nombre_cliente: ordenEncontrada.nombre_cliente || '',
                        apellido_cliente: ordenEncontrada.apellido_cliente || '',
                        email: ordenEncontrada.email || '',
                        telefono: telefonoFinal,
                        ciudad: ciudadFinal,
                        estado_cliente: estadoFinal,
                        ciudad_cliente: ciudadFinal,
                        estado_orden: ordenEncontrada.estado,
                        cantidad_boletos: ordenEncontrada.cantidad_boletos || 0,
                        total: ordenEncontrada.total || 0,
                        fecha_pago: ordenEncontrada.fecha_pago,
                        comprobante_pagado_at: ordenEncontrada.comprobante_pagado_at,
                        comprobante_fecha: ordenEncontrada.comprobante_fecha || ordenEncontrada.updated_at || ordenEncontrada.comprobante_pagado_at || ordenEncontrada.created_at,
                        comprobante_path: ordenEncontrada.comprobante_path,
                        created_at: ordenEncontrada.created_at
                    }
                });
            }

            // Boleto disponible
            return res.json({
                success: true,
                ok: true,
                es_oportunidad: false,
                data: {
                    numero: numero,
                    estado: 'disponible',
                    numero_orden: null,
                    nombre_cliente: '',
                    apellido_cliente: '',
                    email: '',
                    telefono: '',
                    ciudad: '',
                    estado_cliente: '',
                    ciudad_cliente: '',
                    estado_orden: 'disponible',
                    total: 0,
                    fecha_pago: null,
                    comprobante_pagado_at: null,
                    created_at: null
                }
            });
        }
    } catch (error) {
        console.error('GET /api/admin/numero-inteligente/:numero error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al buscar número',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/admin/boleto/:numero
 * Busca una orden por número de boleto específico
 * Protegido con JWT
 */
app.get('/api/admin/boleto/:numero', verificarToken, async (req, res) => {
    try {
        const numeroboleto = Number(req.params.numero);
        
        if (isNaN(numeroboleto)) {
            return res.status(400).json({
                success: false,
                message: 'Número de boleto inválido'
            });
        }
        
        // Buscar la orden que contiene este boleto
        const ordenes = await db('ordenes').select('*');
        
        let ordenEncontrada = null;
        for (const orden of ordenes) {
            try {
                const boletos = JSON.parse(orden.boletos || '[]');
                const boletosNumericos = boletos.map(b => Number(b));
                
                if (boletosNumericos.includes(numeroboleto)) {
                    ordenEncontrada = orden;
                    break;
                }
            } catch (e) {
                // Ignorar errores de parseo
            }
        }
        
        if (!ordenEncontrada) {
            return res.status(404).json({
                success: false,
                message: 'Boleto no encontrado',
                numero_boleto: numeroboleto
            });
        }
        
        // Devolver datos de la orden
        return res.json({
            success: true,
            data: {
                id: ordenEncontrada.id,
                numero_orden: ordenEncontrada.numero_orden,
                nombre_cliente: ordenEncontrada.nombre_cliente,
                apellido_cliente: ordenEncontrada.apellido_cliente,
                email: ordenEncontrada.email,
                telefono: ordenEncontrada.telefono,
                ciudad: ordenEncontrada.ciudad,
                estado: ordenEncontrada.estado,
                fecha_pago: ordenEncontrada.fecha_pago,
                numero_boleto: numeroboleto,
                cantidad_boletos: ordenEncontrada.cantidad_boletos,
                total_pagado: ordenEncontrada.total_pagado,
                created_at: ordenEncontrada.created_at
            }
        });
    } catch (error) {
        console.error('GET /api/admin/boleto/:numero error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al buscar boleto',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/public/ordenes-stats
 * Estadísticas públicas de órdenes (SIN autenticación)
 * Usado por el countdown para mostrar progreso de venta
 */
app.get('/api/public/ordenes-stats', async (req, res) => {
    try {
        // Obtener solo órdenes confirmadas y completadas (boletos vendidos)
        const stats = await db('ordenes')
            .whereIn('estado', ['confirmada', 'completada'])
            .select(
                db.raw('COUNT(*) as total_ordenes'),
                db.raw('SUM(cantidad_boletos) as total_boletos_vendidos')
            )
            .first();

        return res.json({
            success: true,
            data: {
                total_ordenes: stats.total_ordenes || 0,
                total_boletos_vendidos: stats.total_boletos_vendidos || 0,
                porcentaje_vendido: 0 // Será calculado en el frontend
            }
        });
    } catch (error) {
        console.error('GET /api/public/ordenes-stats error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/public/boletos
 * ⚠️ CRÍTICO: Devuelve estado REAL DE BOLETOS directamente de boletos_estado
 * - "sold": boletos en estado 'vendido' (ya pagados y confirmados)
 * - "reserved": boletos en estado 'reservado' (en orden pendiente o con comprobante)
 * 
 * SIN CACHE: Siempre devuelve datos frescos directamente de BD para sincronización 100%
 * Esta es la fuente única de verdad para UI
 */

/**
 * GET /api/admin/clear-cache
 * 🧹 Limpiar caché de stats (debug/desarrollo)
 */
app.get('/api/admin/clear-cache', verificarToken, (req, res) => {
    global.boletosStatsCache = null;
    global.boletosStatsCacheTime = null;
    console.log('🧹 [Admin] Caché limpia');
    res.json({ success: true, message: 'Caché limpia correctamente' });
});

/**
 * GET /api/public/boletos/stats
 * ⚡ ULTRA-RÁPIDO: Solo conteos cacheados + índices
 * Devuelve en < 50ms usando caché en memoria
 * 
 * ✅ DINÁMICO: Lee totalBoletos desde config.json en tiempo real
 * ✅ CACHEADO: Stats se cachean por 5 segundos (TTL configurable)
 */
app.get('/api/public/boletos/stats', async (req, res) => {
    try {
        const startTime = Date.now();
        const config = cargarConfigSorteo();
        const totalBoletos = config.totalBoletos;
        
        // ⭐ CACHÉ LOCAL EN MEMORIA (5 segundos en desarrollo, 60 en producción)
        const cacheKey = 'boletosStats';
        const now = Date.now();
        const CACHE_TTL = process.env.NODE_ENV === 'production' ? 60000 : 5000; // 5s dev, 60s prod
        
        if (global.boletosStatsCache && global.boletosStatsCacheTime && (now - global.boletosStatsCacheTime) < CACHE_TTL) {
            // Usar caché si existe y no es viejo
            const cached = global.boletosStatsCache;
            const age = now - global.boletosStatsCacheTime;
            return res.json({
                success: true,
                data: {
                    vendidos: cached.vendidos,
                    apartados: cached.apartados,
                    disponibles: cached.disponibles,
                    total: totalBoletos,
                    queryTime: age,
                    cached: true
                }
            });
        }
        
        // Función para obtener stats desde BD con estrategia más rápida
        const fetchStats = async () => {
            try {
                // ⭐ OPTIMIZACIÓN: Query más rápida usando índices
                // Separar en dos queries para cada estado (usa índices mejor)
                const [vendidosResult, apartadosResult] = await Promise.all([
                    db('boletos_estado').where('estado', 'vendido').count('* as count').first(),
                    db('boletos_estado').where('estado', 'apartado').count('* as count').first()
                ]);
                
                return {
                    vendidos: parseInt(vendidosResult?.count) || 0,
                    apartados: parseInt(apartadosResult?.count) || 0
                };
            } catch (dbError) {
                console.warn('[PublicBoletoStats] DB Query error (usando caché anterior):', dbError.message);
                // Si la BD falla, usar caché anterior si existe
                if (global.boletosStatsCache) {
                    return global.boletosStatsCache;
                }
                // Si no hay caché, devolver error
                throw dbError;
            }
        };
        
        // Obtener desde BD (con timeout más corto)
        const stats = await fetchStats();
        const disponibles = totalBoletos - stats.vendidos - stats.apartados;
        const queryTime = Date.now() - startTime;

        // ⭐ GUARDAR EN CACHÉ (20 segundos)
        global.boletosStatsCache = { vendidos: stats.vendidos, apartados: stats.apartados, disponibles: disponibles };
        global.boletosStatsCacheTime = now;

        // Log si toma más de 1000ms
        if (queryTime > 1000) {
            console.warn(`⚠️  [PublicBoletoStats] Query lenta: ${queryTime}ms`);
        }

        return res.json({
            success: true,
            data: {
                vendidos: stats.vendidos,
                apartados: stats.apartados,
                disponibles: disponibles,
                total: totalBoletos,
                queryTime: queryTime,
                cached: false
            }
        });

    } catch (error) {
        console.error('[PublicBoletoStats] Error:', error.message);
        const config = cargarConfigSorteo();
        
        // ⭐ FALLBACK: Usar caché anterior o valores por defecto
        if (global.boletosStatsCache) {
            console.warn('[PublicBoletoStats] Error - usando cache anterior');
            return res.json({
                success: true,
                data: {
                    vendidos: global.boletosStatsCache.vendidos,
                    apartados: global.boletosStatsCache.apartados,
                    disponibles: global.boletosStatsCache.disponibles,
                    total: config.totalBoletos,
                    queryTime: 0,
                    cached: true,
                    error: error.message
                }
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas',
            data: {
                vendidos: 0,
                apartados: 0,
                disponibles: config.totalBoletos,
                total: config.totalBoletos,
                queryTime: 0,
                error: error.message
            }
        });
    }
});

app.get('/api/public/boletos', async (req, res) => {
    try {
        const inicioQuery = req.query.inicio !== undefined ? parseInt(req.query.inicio, 10) : null;
        const finQuery = req.query.fin !== undefined ? parseInt(req.query.fin, 10) : null;
        const usarRango = Number.isInteger(inicioQuery) && Number.isInteger(finQuery);

        if (usarRango && inicioQuery > finQuery) {
            return res.status(400).json({
                success: false,
                message: 'inicio no puede ser mayor que fin'
            });
        }

        if (usarRango) {
            const cacheKey = `${inicioQuery}-${finQuery}`;
            const cachedRange = serverCache.boletosPublicosByRange.get(cacheKey);
            if (cachedRange && (Date.now() - cachedRange.time) < 5000) {
                return res.json(cachedRange.payload);
            }
        }

        // ⭐ CACHE EN MEMORIA: Reutilizar datos por 3 segundos
        if (!usarRango && serverCache.boletosPublicosCached && serverCache.boletosPublicosCachedTime) {
            const age = Date.now() - serverCache.boletosPublicosCachedTime;
            if (age < 5000) { // 5 segundos - caché más agresivo para reducir carga
                console.debug(`[PublicBoletos] Usando cache (${age}ms viejo)`);
                return res.json(serverCache.boletosPublicosCached);
            }
        }
        
        const startTime = Date.now();
        
        // ✅ OBTENER TOTAL DE BOLETOS DESDE config.js
        const configExpiracion = obtenerConfigExpiracion();
        const totalBoletos = configExpiracion.totalBoletos;

        if (usarRango && (inicioQuery < 0 || finQuery >= totalBoletos)) {
            return res.status(400).json({
                success: false,
                message: `Rango inválido. Debe estar entre 0 y ${totalBoletos - 1}`
            });
        }

        // ⭐ QUERY ULTRA OPTIMIZADA: Usar índices para contar en paralelo
        // IMPORTANTE: Aumentar timeouts de 5s a 10s para evitar timeouts
        const [countResult, oportunidadesCount] = await Promise.all([
            db.raw(`
                SELECT 
                    COUNT(*) FILTER (WHERE estado = 'vendido')::int as vendidos,
                    COUNT(*) FILTER (WHERE estado = 'apartado')::int as reservados
                FROM boletos_estado
            `).timeout(10000),
            db.raw(`
                SELECT COUNT(*)::int as count FROM orden_oportunidades 
                WHERE estado = 'disponible'
            `).timeout(10000)
        ]);
        
        const countData = countResult.rows && countResult.rows[0] ? countResult.rows[0] : { vendidos: 0, reservados: 0 };
        const vendidos = parseInt(countData.vendidos) || 0;
        const reservados = parseInt(countData.reservados) || 0;
        const boletosOcultos = parseInt(oportunidadesCount.rows?.[0]?.count || 0);

        // Traer las listas reales CON ÍNDICES (paralelo para máxima velocidad)
        // OPTIMIZACIÓN: Aumentar timeouts a 15s para garantizar que terminen
        let boletosNoDisponiblesQuery = db('boletos_estado')
            .whereIn('estado', ['vendido', 'apartado'])
            .select('numero', 'estado')
            .timeout(15000)
            .orderBy('numero');

        if (usarRango) {
            boletosNoDisponiblesQuery = boletosNoDisponiblesQuery.whereBetween('numero', [inicioQuery, finQuery]);
        }

        const [boletosNoDisponibles, oportunidadesList] = await Promise.all([
            boletosNoDisponiblesQuery,
            db('orden_oportunidades')
                .where('estado', 'reservado')
                .select('numero_oportunidad')
                .timeout(15000)
                .orderBy('numero_oportunidad')
        ]);

        // Procesar en JavaScript (más rápido que en SQL)
        const sold = new Set();
        const reserved = new Set();
        
        boletosNoDisponibles.forEach(b => {
            if (b.estado === 'vendido') {
                sold.add(Number(b.numero));
            } else {
                reserved.add(Number(b.numero));
            }
        });
        
        // Agregar oportunidades en un SET SEPARADO (no mezclar con boletos)
        const oportunidadesSet = new Set();
        oportunidadesList.forEach(o => {
            oportunidadesSet.add(Number(o.numero_oportunidad));
        });

        const totalApartados = reserved.size + boletosOcultos;
        const disponibles = Math.max(0, totalBoletos - vendidos - totalApartados);
        const queryTime = Date.now() - startTime;
        
        const payload = {
            success: true,
            data: {
                sold: Array.from(sold),
                reserved: Array.from(reserved),
                oportunidades: Array.from(oportunidadesSet)  // ← SEPARADO, no mezclado
            },
            stats: {
                vendidos: vendidos,
                reservados: reservados,
                boletosOcultos: boletosOcultos,
                totalApartados: totalApartados,
                disponibles: disponibles,
                total: totalBoletos,
                rango: usarRango ? { inicio: inicioQuery, fin: finQuery } : null,
                queryTime: queryTime,
                cached: false
            }
        };

        // ⭐ GUARDAR EN CACHÉ para siguiente request
        if (usarRango) {
            serverCache.boletosPublicosByRange.set(`${inicioQuery}-${finQuery}`, {
                time: Date.now(),
                payload
            });
            if (serverCache.boletosPublicosByRange.size > 200) {
                const oldestKey = serverCache.boletosPublicosByRange.keys().next().value;
                if (oldestKey) serverCache.boletosPublicosByRange.delete(oldestKey);
            }
        } else {
            serverCache.boletosPublicosCached = payload;
            serverCache.boletosPublicosCachedTime = Date.now();
        }

        if (queryTime > 1000 || Math.random() < 0.05) {
            console.log(`[PublicBoletos] Vendidos: ${vendidos}, Apartados: ${reserved.size}, Oportunidades: ${boletosOcultos}, Total apartados: ${totalApartados}, Time: ${queryTime}ms`);
        }

        return res.json(payload);

    } catch (error) {
        console.error('GET /api/public/boletos error:', error.message);

        if (usarRango) {
            const cachedRange = serverCache.boletosPublicosByRange.get(`${inicioQuery}-${finQuery}`);
            if (cachedRange?.payload) {
                console.warn(`[PublicBoletos] Error en rango ${inicioQuery}-${finQuery} - usando cache de rango`);
                return res.json(cachedRange.payload);
            }
        }
        
        // ⭐ SI FALLA, USAR CACHÉ ANTERIOR O DEVOLVER VACÍO
        if (serverCache.boletosPublicosCached) {
            console.warn('[PublicBoletos] Error - usando cache antiguo');
            return res.json(serverCache.boletosPublicosCached);
        }
        
        return res.json({
            success: false,
            message: 'Error temporal',
            data: { sold: [], reserved: [] },
            stats: {
                vendidos: 0, reservados: 0, disponibles: 60000, total: 60000,
                cached: false, error: error.message
            }
        });
    }
});

/**
 * GET /api/admin/stats
 * Estadísticas del sistema (protegido con JWT)
 * ⭐ FASE 1: HTTP caching habilitado (30s, private)
 */
app.get('/api/admin/stats', verificarToken, async (req, res) => {
    try {
        const stats = await db('ordenes').select(
            db.raw('COUNT(*) as total_ordenes'),
            db.raw('SUM(cantidad_boletos) as total_boletos'),
            db.raw('SUM(total) as ingresos_totales'),
            db.raw("SUM(CASE WHEN estado IN ('confirmada','completada') THEN total ELSE 0 END) as ingresos_confirmados"),
            db.raw("SUM(CASE WHEN estado IN ('confirmada','completada') THEN cantidad_boletos ELSE 0 END) as total_boletos_vendidos"),
            db.raw('AVG(total) as promedio_orden')
        ).first();

        const porEstado = await db('ordenes').select('estado')
            .count('* as cantidad')
            .groupBy('estado');

        // Asegurar que los campos numéricos se convierten correctamente
        const data = {
            total_ordenes: parseInt(stats.total_ordenes) || 0,
            total_boletos: parseInt(stats.total_boletos) || 0,
            ingresos_totales: parseFloat(stats.ingresos_totales) || 0,
            ingresos_confirmados: parseFloat(stats.ingresos_confirmados) || 0,
            total_boletos_vendidos: parseInt(stats.total_boletos_vendidos) || 0,
            promedio_orden: parseFloat(stats.promedio_orden) || 0,
            por_estado: porEstado
        };

        // ⭐ FASE 1: Agregar headers de caching HTTP (respuesta privada, 30s)
        setHttpCacheHeaders(res, 30, false);
        
        return res.json({
            success: true,
            data: data
        });
    } catch (error) {
        console.error('GET /api/admin/stats error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/public/boletos/:numero/oportunidades
 * 🎁 Obtiene las 3 oportunidades PRE-ASIGNADAS al boleto desde BD
 * 
 * Las oportunidades se pre-poblaron en orden_oportunidades con:
 * - 750,000 registros (250k boletos × 3 oportunidades)
 * - Asignación 1:1 distribuida (sin repeticiones)
 * 
 * @param numero - Número del boleto (ej: 1, 100, 500)
 * @returns {Array} Array de 3 números de oportunidades desde BD
 */
app.get('/api/public/boletos/:numero/oportunidades', limiterOrdenes, async (req, res) => {
    try {
        const { numero } = req.params;
        const numeroBoleto = parseInt(numero, 10);
        
        // Validar que sea un número válido (0-249999)
        if (isNaN(numeroBoleto) || numeroBoleto < 0 || numeroBoleto > 249999) {
            return res.status(400).json({
                success: false,
                message: 'Número de boleto inválido (debe ser 0-249999)'
            });
        }
        
        // 🎯 QUERY SIMPLE: Obtener las 3 oportunidades pre-asignadas a este boleto
        // Desde la tabla orden_oportunidades que fue pre-poblada
        const oportunidades = await db('orden_oportunidades')
            .where('numero_boleto', numeroBoleto)
            .select('numero_oportunidad')
            .orderBy('numero_oportunidad')
            .limit(3);
        
        // Si no hay registros, error en datos de inicialización
        if (oportunidades.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No hay oportunidades pre-asignadas para boleto ${numeroBoleto}`,
                debug: 'Ejecutar populate-oportunidades.js en backend'
            });
        }
        
        const numeros = oportunidades.map(o => o.numero_oportunidad);
        
        return res.json({
            success: true,
            numero_boleto: numeroBoleto,
            oportunidades: numeros,
            cantidad: numeros.length
        });
    } catch (error) {
        console.error('GET /api/public/boletos/:numero/oportunidades error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener oportunidades del boleto',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/public/boletos/oportunidades/batch
 * ⚡ OPTIMIZADO: Obtiene oportunidades para múltiples boletos EN 1 REQUEST
 * 
 * En lugar de hacer 12,000 requests (1 por boleto):
 * - ANTES: 12,000 boletos = 12,000 requests = ~40 segundos (3 concurrent)
 * - AHORA: 12,000 boletos = 240 requests (batch de 50) = ~8 segundos (15 concurrent)
 * 
 * @body { numeros: [1, 2, 3, ..., 50] }  // Array de hasta 100 boletos
 * @returns { success: true, datos: { 1: [o1, o2, o3], 2: [...], ... } }
 */
app.post('/api/public/boletos/oportunidades/batch', limiterOrdenes, async (req, res) => {
    try {
        const { numeros } = req.body;
        
        // Validar entrada
        if (!Array.isArray(numeros) || numeros.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Requiere: { numeros: [1, 2, 3, ...] }'
            });
        }
        
        if (numeros.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Máximo 100 boletos por batch (recibidos: ' + numeros.length + ')'
            });
        }
        
        // Validar que sean números válidos
        const numerosValidos = numeros
            .map(n => parseInt(n, 10))
            .filter(n => !isNaN(n) && n >= 0 && n <= 249999);
        
        if (numerosValidos.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No hay números de boleto válidos'
            });
        }
        
        // 🚀 QUERY OPTIMIZADO: Un solo WHERE IN() para todos los boletos
        const oportunidades = await db('orden_oportunidades')
            .whereIn('numero_boleto', numerosValidos)
            .select('numero_boleto', 'numero_oportunidad')
            .orderBy('numero_boleto')
            .orderBy('numero_oportunidad');
        
        // Agrupar por número de boleto
        const resultado = {};
        numerosValidos.forEach(n => {
            resultado[n] = [];
        });
        
        oportunidades.forEach(row => {
            if (!resultado[row.numero_boleto]) {
                resultado[row.numero_boleto] = [];
            }
            resultado[row.numero_boleto].push(row.numero_oportunidad);
        });
        
        return res.json({
            success: true,
            totales: {
                solicitados: numerosValidos.length,
                procesados: Object.keys(resultado).length,
                oportunidades: oportunidades.length
            },
            datos: resultado
        });
    } catch (error) {
        console.error('POST /api/public/boletos/oportunidades/batch error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener oportunidades en batch',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/public/oportunidades/disponibles
 * ✅ FASE 2: Obtiene oportunidades disponibles CON SOPORTE PARA PAGINACIÓN
 * 
 * Query params opcionales:
 * - limit=10000    → Retorna máximo 10,000 números (default: todos)
 * - offset=0       → Comienza desde este índice (default: 0)
 * 
 * Respuesta (sin paginación - BACKWARD COMPATIBLE):
 * { 
 *   success: true,
 *   disponibles: [250000, 250001, ...],  // Array de números
 *   cantidad: 750000,                     // Total disponibles
 *   rango: { inicio: 250000, fin: 999999 },
 *   cached: true/false,
 *   timestamp: 1234567890
 * }
 * 
 * Respuesta (con paginación):
 * {
 *   success: true,
 *   disponibles: [250000, 250001, ...],  // 10,000 números max
 *   cantidad: 10000,                      // Números en esta página
 *   total: 750000,                        // Total disponibles en BD
 *   offset: 0,
 *   limit: 10000,
 *   paginas: 75,                          // ceil(total / limit)
 *   pagina_actual: 1,                     // offset/limit + 1
 *   cached: true/false,
 *   timestamp: 1234567890
 * }
 */
app.get('/api/public/oportunidades/disponibles', limiterOrdenes, async (req, res) => {
    const tiempoInicio = Date.now();
    try {
        const config = cargarConfigSorteo();
        const rangoOculto = config?.rifa?.oportunidades?.rango_oculto || { inicio: 250000, fin: 999999 };
        
        // 📊 PARÁMETROS: Soporte para paginación
        const limit = req.query.limit ? parseInt(req.query.limit) : null;
        const offset = req.query.offset ? parseInt(req.query.offset) : 0;
        
        // Validar parámetros
        if (limit !== null) {
            if (isNaN(limit) || limit < 1 || limit > 100000) {
                return res.status(400).json({
                    success: false,
                    message: 'limit debe ser un número entre 1 y 100000'
                });
            }
            if (isNaN(offset) || offset < 0) {
                return res.status(400).json({
                    success: false,
                    message: 'offset debe ser un número >= 0'
                });
            }
        }
        
        const ahora = Date.now();
        const CACHE_TTL = 60000; // ⭐ 60 segundos
        const modosPaginado = limit !== null;
        
        // ⭐ CACHE INTELIGENTE: Por página o global
        let cacheKey = 'oportunidades_disponibles';
        let caché = null;
        
        if (modosPaginado) {
            // Cache por página
            cacheKey = `oportunidades_page_${offset}_${limit}`;
            if (!global.oportunidadesCachePages) {
                global.oportunidadesCachePages = {};
            }
            caché = global.oportunidadesCachePages[cacheKey];
        } else {
            // Cache global (modo completo)
            caché = global.oportunidadesCache;
        }
        
        // Verificar si hay cache válido
        if (caché && global.oportunidadesCacheTime) {
            const edad = ahora - global.oportunidadesCacheTime;
            if (edad < CACHE_TTL) {
                // Cache hit - usando cache local
                setHttpCacheHeaders(res, 60, true);
                return res.json({ ...caché, cached: true, queryTime: Date.now() - tiempoInicio });
            }
        }

        // ⭐ FUNCIÓN AUXILIAR: Construir respuesta
        const construirRespuesta = (disponibles, esCompleto = false) => {
            if (esCompleto) {
                // Modo sin paginación (BACKWARD COMPATIBLE)
                return {
                    success: true,
                    disponibles: disponibles,
                    cantidad: disponibles.length,
                    rango: rangoOculto,
                    timestamp: Date.now(),
                    cached: false,
                    queryTime: Date.now() - tiempoInicio
                };
            } else {
                // Modo paginado
                const total = disponibles.total;
                const numeros = disponibles.items;
                const paginas = Math.ceil(total / limit);
                // Calcular página actual, garantizando que no exceda el máximo
                const paginaActual = Math.min(Math.floor(offset / limit) + 1, paginas);
                
                return {
                    success: true,
                    disponibles: numeros,
                    cantidad: numeros.length,
                    total: total,
                    offset: offset,
                    limit: limit,
                    paginas: paginas,
                    pagina_actual: paginaActual,
                    rango: rangoOculto,
                    timestamp: Date.now(),
                    cached: false,
                    queryTime: Date.now() - tiempoInicio
                };
            }
        };

        // 🔍 QUERY OPTIMIZADA: Field limiting (solo numero_oportunidad)
        let query = db('orden_oportunidades')
            .where('estado', 'disponible')
            .whereNull('numero_orden')
            .whereBetween('numero_oportunidad', [rangoOculto.inicio, rangoOculto.fin])
            .select('numero_oportunidad');
        
        let respuesta;
        
        if (modosPaginado) {
            // PAGINACIÓN: 2 queries (count + data)
            // Query 1: Contar total disponibles
            const countQuery = db('orden_oportunidades')
                .where('estado', 'disponible')
                .whereNull('numero_orden')
                .whereBetween('numero_oportunidad', [rangoOculto.inicio, rangoOculto.fin])
                .count('* as total')
                .first()
                .timeout(30000);  // 30s suficiente para paginado
            
            // Query 2: Obtener datos paginados
            const dataQuery = query
                .limit(limit)
                .offset(offset)
                .timeout(30000);  // 30s suficiente para paginado
            
            // Ejecutar en paralelo
            const [countResult, disponibles] = await Promise.all([countQuery, dataQuery]);
            
            const numeros = disponibles.map(o => o.numero_oportunidad);
            const totalEnBD = countResult.total || 0;
            
            // Validar offset
            if (offset > totalEnBD && offset > 0) {
                return res.status(400).json({
                    success: false,
                    message: `offset ${offset} excede total disponibles (${totalEnBD})`
                });
            }
            
            // Guardar en cache de página
            const respuestaPaginada = construirRespuesta({ total: totalEnBD, items: numeros }, false);
            if (!global.oportunidadesCachePages) {
                global.oportunidadesCachePages = {};
            }
            global.oportunidadesCachePages[cacheKey] = respuestaPaginada;
            global.oportunidadesCacheTime = ahora;
            
            respuesta = respuestaPaginada;
        } else {
            // MODO COMPLETO: Sin paginación (backwards compatible)
            const disponibles = await query.timeout(90000);  // ⭐ 90s para query completa (750k registros puede tardar)
            const numeros = disponibles.map(o => o.numero_oportunidad);
            
            // Guardar en cache global
            global.oportunidadesCache = { numeros, rango: rangoOculto };
            global.oportunidadesCacheTime = ahora;
            
            respuesta = construirRespuesta(numeros, true);
        }

        setHttpCacheHeaders(res, 60, true);
        return res.json(respuesta);
        
    } catch (error) {
        console.error('❌ [GET /api/public/oportunidades/disponibles] Error:', error.message);
        console.error('   Stack:', error.stack);
        return res.status(500).json({
            success: false,
            message: 'Error obteniendo oportunidades disponibles',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/public/oportunidades/validar
 * ✅ NUEVO: Valida si oportunidades están REALMENTE disponibles en BD
 * 
 * Payload: { numeros: [250112, 252496, ...] }
 * Respuesta: { 
 *   disponibles: [250112, ...],      // Números que SÍ están disponibles
 *   noDisponibles: [252496, ...],    // Números que NO están disponibles
 *   cantidad: 100
 * }
 * 
 * ⚠️ CRÍTICO: El frontend usa esto para VALIDAR antes de enviar la orden
 * Evita el auto-reemplazo automático del backend
 */
app.post('/api/public/oportunidades/validar', limiterOrdenes, async (req, res) => {
    try {
        const { numeros } = req.body;
        
        // Validar entrada
        if (!Array.isArray(numeros) || numeros.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Números de oportunidades requeridos'
            });
        }

        // Limitar a máximo 500 para no saturar
        const numerosValidados = numeros.slice(0, 500);

        console.log(`🔍 [POST /api/public/oportunidades/validar] Validando ${numerosValidados.length} oportunidades...`);

        // Consultar BD: cuáles REALMENTE están disponibles
        const oportunidadesEnBD = await db('orden_oportunidades')
            .whereIn('numero_oportunidad', numerosValidados)
            .select('numero_oportunidad', 'estado', 'numero_orden');

        // Separar disponibles de no-disponibles
        const disponiblesEnBD = new Set(
            oportunidadesEnBD
                .filter(o => o.estado === 'disponible' && o.numero_orden === null)
                .map(o => o.numero_oportunidad)
        );

        const disponibles = numerosValidados.filter(n => disponiblesEnBD.has(n));
        const noDisponibles = numerosValidados.filter(n => !disponiblesEnBD.has(n));

        console.log(`✅ [POST /api/public/oportunidades/validar] Resultado:`);
        console.log(`   • Disponibles: ${disponibles.length}/${numerosValidados.length}`);
        console.log(`   • No-disponibles: ${noDisponibles.length}`);

        return res.json({
            success: true,
            disponibles: disponibles,
            noDisponibles: noDisponibles,
            cantidad: disponibles.length,
            cantidadNoDisponibles: noDisponibles.length
        });
    } catch (error) {
        console.error('❌ [POST /api/public/oportunidades/validar] Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Error validando oportunidades',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/admin/oportunidades-stats
 * Obtiene estadísticas COMPLETAS de oportunidades:
 * - Total configurado (del sistema)
 * - Conteos REALES de BD (disponibles, asignadas, apartadas, canceladas)
 * - Cálculos derivados (en uso, porcentaje)
 * Protegido: JWT token requerido
 */
app.get('/api/admin/oportunidades-stats', verificarToken, async (req, res) => {
    try {
        console.log('📊 [GET /api/admin/oportunidades-stats] Iniciando...');

        // Contar disponibles: estado='disponible' Y sin número de orden (NULL o 0)
        const disponibles = await db('orden_oportunidades')
            .where('estado', 'disponible')
            .where(qb => {
                qb.whereNull('numero_orden').orWhere('numero_orden', '0');
            })
            .count('* as count')
            .first();

        // Contar apartadas: estado='apartado' Y con número de orden asignado (no '0')
        const apartadas = await db('orden_oportunidades')
            .where('estado', 'apartado')
            .where('numero_orden', '<>', '0')
            .whereNotNull('numero_orden')
            .count('* as count')
            .first();

        // Contar asignadas: estado='vendido' (órdenes CONFIRMADAS)
        const asignadas = await db('orden_oportunidades')
            .where('estado', 'vendido')
            .whereNotNull('numero_orden')
            .count('* as count')
            .first();

        // Contar canceladas: estado='cancelado'
        const canceladas = await db('orden_oportunidades')
            .where('estado', 'cancelado')
            .count('* as count')
            .first();

        const conteos = {
            disponible: parseInt(disponibles.count) || 0,
            apartado: parseInt(apartadas.count) || 0,
            asignado: parseInt(asignadas.count) || 0,
            cancelado: parseInt(canceladas.count) || 0
        };

        console.log('📋 [GET /api/admin/oportunidades-stats] Conteos:', conteos);

        // Obtener total configurado del sistema
        const config = global.rifaplusConfig || {};
        const totalConfigurado = config.rifa?.totalOportunidades || 750000;

        // Calcular totales
        const totalEnBD = Object.values(conteos).reduce((sum, val) => sum + val, 0);
        const enUso = conteos.asignado + conteos.apartado;
        const porcentajeUso = totalConfigurado > 0 ? Math.round((enUso / totalConfigurado) * 100) : 0;

        console.log('✅ [GET /api/admin/oportunidades-stats] Cálculos:', {
            totalConfigurado,
            totalEnBD,
            disponible: conteos.disponible,
            asignado: conteos.asignado,
            apartado: conteos.apartado,
            enUso,
            porcentajeUso
        });

        // Retornar datos COMPLETOS para admin
        return res.json({
            success: true,
            data: {
                // Totales
                totalConfigurado: totalConfigurado,  // Total del sorteo actual
                totalEnBD: totalEnBD,                // Total real en BD
                
                // Conteos por estado
                disponibles: conteos.disponible,
                asignadas: conteos.asignado,
                apartadas: conteos.apartado,
                canceladas: conteos.cancelado,
                
                // Derivados
                enUso: enUso,                        // asignadas + apartadas
                porcentajeUso: porcentajeUso         // % del total configurado
            }
        });

    } catch (error) {
        console.error('❌ [GET /api/admin/oportunidades-stats] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas de oportunidades',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/admin/boletos
 * Obtener lista detallada de boletos (protegido con JWT)
 */
app.get('/api/admin/boletos', verificarToken, async (req, res) => {
    try {
        const ordenes = await db('ordenes')
            .select('numero_orden', 'boletos', 'estado', 'nombre_cliente', 'telefono_cliente', 'created_at');

        // Obtener totalBoletos desde config.js
        const configSorteo = cargarConfigSorteo();
        const totalBoletos = configSorteo.totalBoletos;
        
        // Crear set de boletos vendidos/reservados
        const boletosEnOrdenes = new Set();
        const boletosDetallados = [];

        ordenes.forEach(orden => {
            try {
                const numerosArr = JSON.parse(orden.boletos || '[]');
                if (Array.isArray(numerosArr)) {
                    numerosArr.forEach(num => {
                        const numNum = Number(num);
                        boletosEnOrdenes.add(numNum);
                        boletosDetallados.push({
                            numero: numNum,
                            numero_orden: orden.numero_orden,
                            estado: orden.estado.includes('confirmada') || orden.estado.includes('completada') ? 'vendido' : orden.estado.includes('pendiente') || orden.estado.includes('comprobante') ? 'apartado' : orden.estado,
                            cliente_nombre: orden.nombre_cliente || '',
                            cliente_whatsapp: orden.telefono_cliente || '',
                            created_at: orden.created_at
                        });
                    });
                }
            } catch (e) {
                // Ignorar órdenes con boletos inválidos
            }
        });

        // Agregar boletos disponibles (los que no están en ninguna orden)
        for (let i = 1; i <= totalBoletos; i++) {
            if (!boletosEnOrdenes.has(i)) {
                boletosDetallados.push({
                    numero: i,
                    estado: 'disponible',
                    numero_orden: null,
                    cliente_nombre: '',
                    cliente_whatsapp: ''
                });
            }
        }

        // Ordenar por número de boleto
        boletosDetallados.sort((a, b) => a.numero - b.numero);

        return res.json({
            success: true,
            data: boletosDetallados
        });
    } catch (error) {
        console.error('GET /api/admin/boletos error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener boletos',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
/**
 * PATCH /api/ordenes/:id/estado
 * 
 * Actualizar estado de una orden (protegido con JWT admin)
 * Usa transacción ACID para garantizar consistencia atómica
 * 
 * FLUJO DE ESTADOS:
 * - pendiente → confirmada: Boletos pasan a 'vendido', Oportunidades a 'vendido'
 * - pendiente → cancelada: Boletos vuelven a 'disponible', Oportunidades a 'disponible'
 * - cualquier estado → cualquier estado: Cambio atómico garantizado
 * 
 * SEGURIDAD:
 * - Requiere JWT con rol 'admin' (verificarToken)
 * - Transacción rollback automático si hay error
 * - Protección contra race conditions con consulta dentro de transacción
 * 
 * Body: { estado: 'confirmada' | 'cancelada' | 'pendiente' | 'completada' }
 */
app.patch('/api/ordenes/:id/estado', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        const estadosValidos = ['pendiente', 'confirmada', 'cancelada'];
        if (!estadosValidos.includes(estado)) {
            return res.status(400).json({
                success: false,
                message: `Estado inválido. Válidos: ${estadosValidos.join(', ')}`
            });
        }

        // Usar transacción para cambios de estado
        const resultado = await db.transaction(async (trx) => {
            // Leer orden actual (con lock implícito dentro de transacción)
            const ordenActual = await trx('ordenes')
                .where('numero_orden', id)
                .first();
            
            if (!ordenActual) {
                throw new Error('ORDER_NOT_FOUND');
            }

            const allowedTransitions = {
                pendiente: ['pendiente', 'confirmada', 'cancelada'],
                confirmada: ['confirmada', 'cancelada'],
                cancelada: ['cancelada', 'confirmada']
            };

            const estadoActual = ordenActual.estado || 'pendiente';
            const transicionesPermitidas = allowedTransitions[estadoActual] || [];
            if (!transicionesPermitidas.includes(estado)) {
                throw new Error(`INVALID_STATE_TRANSITION:${estadoActual}->${estado}`);
            }
            
            let boletosActualizados = 0;

            // LÓGICA DE TRANSICIÓN DE ESTADOS Y BOLETOS
            // ==========================================
            
            // Si cambia a 'confirmada' → boletos pasan a 'vendido'
            if (estado === 'confirmada' && ordenActual.estado !== 'confirmada') {
                let boletos = [];
                
                // Manejar diferentes formatos de almacenamiento de boletos
                if (Array.isArray(ordenActual.boletos)) {
                    // Ya es un array (PostgreSQL devuelve JSONB como objeto)
                    boletos = ordenActual.boletos.map(n => {
                        const num = parseInt(n, 10);
                        return isNaN(num) ? null : num;
                    }).filter(n => n !== null);
                } else if (typeof ordenActual.boletos === 'string') {
                    // Es un string - intentar parsear como JSON o CSV
                    try {
                        boletos = JSON.parse(ordenActual.boletos || '[]');
                        if (!Array.isArray(boletos)) boletos = [];
                    } catch (e) {
                        // Si falla JSON, intentar split por comas
                        if (ordenActual.boletos.length > 0) {
                            boletos = ordenActual.boletos.split(',').map(n => {
                                const num = parseInt(n.trim(), 10);
                                return isNaN(num) ? null : num;
                            }).filter(n => n !== null);
                        }
                    }
                }

                console.log(`[Orden ${id}] Boletos a confirmar:`, boletos);

                if (boletos.length > 0) {
                    // Actualizar boletos a 'vendido' en chunks de 1000
                    const CHUNK_SIZE = 1000;
                    for (let i = 0; i < boletos.length; i += CHUNK_SIZE) {
                        const chunk = boletos.slice(i, i + CHUNK_SIZE);
                        const actualizado = await trx('boletos_estado')
                            .whereIn('numero', chunk)
                            .update({
                                estado: 'vendido',
                                numero_orden: id,
                                updated_at: new Date()
                            });
                        boletosActualizados += actualizado;
                    }
                    console.log(`[Orden ${id}] Confirmada: ${boletosActualizados} boletos marcados como VENDIDO`);
                }
            }
            
            // Si cambia a 'cancelada' → boletos vuelven a 'disponible'
            if (estado === 'cancelada' && ordenActual.estado !== 'cancelada') {
                let boletos = [];
                
                // Manejar diferentes formatos de almacenamiento de boletos
                if (Array.isArray(ordenActual.boletos)) {
                    // Ya es un array (PostgreSQL devuelve JSONB como objeto)
                    boletos = ordenActual.boletos.map(n => {
                        const num = parseInt(n, 10);
                        return isNaN(num) ? null : num;
                    }).filter(n => n !== null);
                } else if (typeof ordenActual.boletos === 'string') {
                    // Es un string - intentar parsear como JSON o CSV
                    try {
                        boletos = JSON.parse(ordenActual.boletos || '[]');
                        if (!Array.isArray(boletos)) boletos = [];
                    } catch (e) {
                        // Si falla JSON, intentar split por comas
                        if (ordenActual.boletos.length > 0) {
                            boletos = ordenActual.boletos.split(',').map(n => {
                                const num = parseInt(n.trim(), 10);
                                return isNaN(num) ? null : num;
                            }).filter(n => n !== null);
                        }
                    }
                }

                console.log(`[Orden ${id}] Boletos a cancelar:`, boletos);

                if (boletos.length > 0) {
                    const CHUNK_SIZE = 1000;
                    for (let i = 0; i < boletos.length; i += CHUNK_SIZE) {
                        const chunk = boletos.slice(i, i + CHUNK_SIZE);
                        const actualizado = await trx('boletos_estado')
                            .whereIn('numero', chunk)
                            .update({
                                estado: 'disponible',
                                numero_orden: null,
                                updated_at: new Date()
                            });
                        boletosActualizados += actualizado;
                    }
                    console.log(`[Orden ${id}] Cancelada: ${boletosActualizados} boletos devueltos a DISPONIBLE`);
                }
                
                // NUEVO: Liberar OPORTUNIDADES (apartadas O vendidas) para esta orden
                const oportunidadesLiberadas = await trx('orden_oportunidades')
                    .where('numero_orden', id)
                    .whereIn('estado', ['apartado', 'vendido'])  // ✅ CRITICAL FIX: Liberar también 'vendido'
                    .update({
                        estado: 'disponible',
                        numero_orden: null  // ✅ CORREGIDO: null en lugar de '0'
                    });
                
                if (oportunidadesLiberadas > 0) {
                    console.log(`[Orden ${id}] Cancelada: ${oportunidadesLiberadas} oportunidades devueltas a DISPONIBLE`);
                }
            }
            
            // Actualizar estado de orden dentro de transacción (atomic)
            await trx('ordenes')
                .where('numero_orden', id)
                .update({
                    estado: estado,
                    updated_at: new Date()
                });
            
            // 📌 NOTA: Las columnas de auditoría (confirmado_por, cancelado_por, etc.)
            // NO EXISTEN en el schema actual. Si necesitas agregar auditoría:
            // 1. Crear migración que agregue: confirmado_por, cancelado_por, 
            //    confirmado_en, cancelado_en, actualizado_por
            // 2. Descomentar el código en ENDPOINT-PATCH-ORDENES-ESTADO.md línea 4309-4325
            // Ver: ENDPOINT-PATCH-ORDENES-ESTADO.md para detalles
            
            return { success: true, boletosActualizados };
        });

        // ✅ PASO 2a: Cambiar oportunidades a 'vendido' si orden se confirma
        if (estado === 'confirmada' && resultado.success) {
            try {
                const cantidadActualizada = await db('orden_oportunidades')
                    .where('numero_orden', id)
                    .where('estado', 'apartado')
                    .update({
                        estado: 'vendido'
                    });
                if (cantidadActualizada > 0) {
                    console.log(`✅ [Orden ${id}] ${cantidadActualizada} oportunidades confirmadas (apartado → vendido)`);
                }
            } catch (error) {
                console.error(`❌ [Orden ${id}] Error confirmando oportunidades:`, error.message);
            }
        }

        // ✅ NOTA: Las oportunidades ya fueron liberadas dentro de la transacción (líneas 3457-3464)
        // No necesitamos liberarlas nuevamente aquí

        if (resultado && resultado.success) {
            console.log(`✅ Orden ${id} actualizada a estado: ${estado} (${resultado.boletosActualizados} boletos actualizados)`);
        }

        return res.json({
            success: true,
            message: `Orden actualizada a estado: ${estado}`,
            boletosActualizados: resultado.boletosActualizados || 0
        });
    } catch (error) {
        if (error.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({
                success: false,
                message: 'Orden no encontrada'
            });
        }

        if (error.message?.startsWith('INVALID_STATE_TRANSITION:')) {
            const transition = error.message.replace('INVALID_STATE_TRANSITION:', '');
            return res.status(400).json({
                success: false,
                message: `Transición de estado no permitida: ${transition}`
            });
        }
        
        log('error', 'PATCH /api/ordenes/:id/estado error', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Error al actualizar orden',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/admin/sales-stats
 * Estadísticas de ventas por día (últimos 7 días)
 * Query params: ?range=7 (días)
 * Estadísticas de ventas (PostgreSQL)
 */
app.get('/api/admin/sales-stats', verificarToken, async (req, res) => {
    try {
        const range = Math.max(1, Math.min(parseInt(req.query.range, 10) || 7, 90));

        const hoyUtc = new Date();
        hoyUtc.setUTCHours(0, 0, 0, 0);

        const fechaInicio = new Date(hoyUtc);
        fechaInicio.setUTCDate(fechaInicio.getUTCDate() - (range - 1));

        const agregados = await db('ordenes')
            .whereIn('estado', ['confirmada', 'completada'])
            .where('created_at', '>=', fechaInicio.toISOString())
            .select(
                db.raw(`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') as fecha`),
                db.raw('COALESCE(SUM(cantidad_boletos), 0) as boletos'),
                db.raw('COUNT(*) as ordenes')
            )
            .groupByRaw(`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')`);

        const agregadosPorFecha = new Map(
            agregados.map((item) => [
                item.fecha,
                {
                    boletos: parseInt(item.boletos, 10) || 0,
                    ordenes: parseInt(item.ordenes, 10) || 0
                }
            ])
        );

        const stats = [];

        for (let i = range - 1; i >= 0; i--) {
            const fecha = new Date(hoyUtc);
            fecha.setUTCDate(fecha.getUTCDate() - i);

            const year = fecha.getUTCFullYear();
            const month = String(fecha.getUTCMonth() + 1).padStart(2, '0');
            const day = String(fecha.getUTCDate()).padStart(2, '0');
            const fechaStr = `${year}-${month}-${day}`;
            const agregado = agregadosPorFecha.get(fechaStr);

            stats.push({
                fecha: fechaStr,
                boletos: agregado?.boletos || 0,
                ordenes: agregado?.ordenes || 0
            });
        }
        
        return res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('GET /api/admin/sales-stats error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas de ventas',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/admin/declarar-ganador
 * Declarar un boleto como ganador (protegido con JWT)
 * Body: { numero: 5000 }
 */
app.post('/api/admin/declarar-ganador', verificarToken, async (req, res) => {
    try {
        const { numero, premio, valor_premio, tipo_ganador, posicion } = req.body || {};

        if (!numero) {
            return res.status(400).json({ success: false, message: 'Número de boleto requerido' });
        }

        const [hasOrdenesEmail, hasOrdenesEmailCliente] = await Promise.all([
            db.schema.hasColumn('ordenes', 'email'),
            db.schema.hasColumn('ordenes', 'email_cliente')
        ]);

        // Buscar la orden real del boleto usando la misma lógica tolerante que el resto del sistema.
        // No limitamos a un único formato de `boletos` ni a una sola variante histórica de esquema.
        const ordenesQuery = dbUtils
            .ordersContainingBoletoQuery(numero)
            .select('numero_orden', 'boletos', 'telefono_cliente', 'nombre_cliente', 'estado', 'created_at')
            .whereNot('estado', 'cancelada');

        if (hasOrdenesEmail) {
            ordenesQuery.select(db.raw('email as email'));
        } else if (hasOrdenesEmailCliente) {
            ordenesQuery.select(db.raw('email_cliente as email'));
        }

        const ordenes = await ordenesQuery;

        let ordenEncontrada = null;
        for (const orden of ordenes) {
            try {
                let boletosArr = [];
                const raw = orden.boletos;

                if (!raw) {
                    boletosArr = [];
                } else if (Array.isArray(raw)) {
                    boletosArr = raw;
                } else if (typeof raw === 'object' && raw !== null) {
                    boletosArr = Object.values(raw);
                } else if (typeof raw === 'string') {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) {
                            boletosArr = parsed;
                        } else if (typeof parsed === 'object' && parsed !== null) {
                            boletosArr = Object.values(parsed);
                        } else if (typeof parsed === 'string') {
                            boletosArr = parsed.split(',').map(s => s.trim()).filter(Boolean);
                        }
                    } catch (err) {
                        boletosArr = raw.split(',').map(s => s.trim()).filter(Boolean);
                    }
                }

                const boletosNumericos = boletosArr.map((b) => {
                    if (b === null || typeof b === 'undefined') return NaN;
                    if (typeof b === 'number') return b;
                    if (typeof b === 'string') {
                        const n = Number(b);
                        if (!Number.isNaN(n)) return n;
                        try {
                            const inner = JSON.parse(b);
                            if (inner && typeof inner === 'object') {
                                return Number(inner.numero || inner.numero_boleto || inner.n || inner.id || NaN);
                            }
                        } catch (e) {
                            return NaN;
                        }
                    }
                    if (typeof b === 'object') {
                        return Number(b.numero || b.numero_boleto || b.n || b.id || NaN);
                    }
                    return NaN;
                }).filter(n => !Number.isNaN(n));

                if (boletosNumericos.includes(Number(numero))) {
                    if (!ordenEncontrada || new Date(orden.created_at) > new Date(ordenEncontrada.created_at)) {
                        ordenEncontrada = orden;
                    }
                }
            } catch (e) {
                // ignorar
            }
        }

        if (!ordenEncontrada) {
            return res.status(404).json({ success: false, message: 'Boleto no encontrado o no vendido' });
        }

        const tipoGanadorNormalizado = (() => {
            const valor = String(tipo_ganador || 'sorteo').toLowerCase().trim();
            if (valor === 'sorteo' || valor === 'principal') return 'principal';
            if (valor === 'presorteo' || valor === 'presorte') return 'presorte';
            if (valor === 'ruletazos' || valor === 'ruletazo') return 'ruletazo';
            return 'principal';
        })();

        const ganadorExistente = await db('ganadores')
            .where({ numero_boleto: Number(numero) })
            .first();

        if (ganadorExistente) {
            return res.status(409).json({
                success: false,
                message: 'Este boleto ya fue declarado como ganador',
                ganador: ganadorExistente
            });
        }

        const ganadorMismaOrden = await db('ganadores')
            .where({ numero_orden: ordenEncontrada.numero_orden })
            .first();

        // Compatibilidad con esquemas viejos donde numero_orden quedó como UNIQUE.
        // Si ya existe otro ganador de la misma orden, preservar referencia pero evitar choque.
        const numeroOrdenPersistir = ganadorMismaOrden
            ? `${ordenEncontrada.numero_orden}:${Number(numero)}`
            : ordenEncontrada.numero_orden;

        const [
            hasNumeroOrden,
            hasNumeroBoleto,
            hasWhatsapp,
            hasEmail,
            hasNombreGanador,
            hasNombreSorteo,
            hasPosicion,
            hasTipoGanador,
            hasPremio,
            hasValorPremio,
            hasFechaSorteo,
            hasEstado
        ] = await Promise.all([
            db.schema.hasColumn('ganadores', 'numero_orden'),
            db.schema.hasColumn('ganadores', 'numero_boleto'),
            db.schema.hasColumn('ganadores', 'whatsapp'),
            db.schema.hasColumn('ganadores', 'email'),
            db.schema.hasColumn('ganadores', 'nombre_ganador'),
            db.schema.hasColumn('ganadores', 'nombre_sorteo'),
            db.schema.hasColumn('ganadores', 'posicion'),
            db.schema.hasColumn('ganadores', 'tipo_ganador'),
            db.schema.hasColumn('ganadores', 'premio'),
            db.schema.hasColumn('ganadores', 'valor_premio'),
            db.schema.hasColumn('ganadores', 'fecha_sorteo'),
            db.schema.hasColumn('ganadores', 'estado')
        ]);

        // Insertar solo columnas realmente existentes para soportar esquemas viejos y optimizados.
        const payload = {};
        if (hasNumeroOrden) payload.numero_orden = numeroOrdenPersistir;
        if (hasNumeroBoleto) payload.numero_boleto = Number(numero) || null;
        if (hasWhatsapp) payload.whatsapp = ordenEncontrada.telefono_cliente || null;
        if (hasEmail) payload.email = ordenEncontrada.email || null;
        if (hasNombreGanador) payload.nombre_ganador = ordenEncontrada.nombre_cliente || null;
        if (hasNombreSorteo) payload.nombre_sorteo = configManager?.getConfig?.()?.rifa?.nombreSorteo || null;
        if (hasPosicion) payload.posicion = Number(posicion) || null;
        if (hasTipoGanador) payload.tipo_ganador = tipoGanadorNormalizado;
        if (hasPremio) payload.premio = premio || null;
        if (hasValorPremio) payload.valor_premio = valor_premio || null;
        if (hasFechaSorteo) payload.fecha_sorteo = new Date();
        if (hasEstado) payload.estado = 'notificado';

        await db('ganadores').insert(payload);

        const creado = await db('ganadores')
            .where({ numero_boleto: Number(numero) })
            .orderBy('id', 'desc')
            .first();

        return res.json({ success: true, message: 'Ganador declarado y guardado', ganador: creado });
    } catch (error) {
        console.error('POST /api/admin/declarar-ganador error:', error);
        return res.status(500).json({ success: false, message: 'Error al declarar ganador', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
});

/**
 * DELETE /api/admin/ganadores/:numero
 * Elimina un ganador por número de boleto (protegido con JWT)
 */
app.delete('/api/admin/ganadores/:numero', verificarToken, async (req, res) => {
    try {
        const numero = Number(req.params.numero);

        if (!Number.isFinite(numero)) {
            return res.status(400).json({ success: false, message: 'Número inválido' });
        }

        const eliminado = await db('ganadores')
            .where({ numero_boleto: numero })
            .del();

        if (!eliminado) {
            return res.status(404).json({ success: false, message: 'Ganador no encontrado' });
        }

        return res.json({ success: true, message: 'Ganador eliminado correctamente' });
    } catch (error) {
        console.error('DELETE /api/admin/ganadores/:numero error:', error);
        return res.status(500).json({ success: false, message: 'Error al eliminar ganador', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
});

/**
 * GET /api/ganadores
 * Devuelve lista pública de ganadores (ordenada por fecha de sorteo desc)
 * Query params: ?limit=100
 */
app.get('/api/ganadores', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit || '100'), 1000);
        const rows = await db('ganadores').select('*').orderBy('fecha_sorteo', 'desc').limit(limit);

        const numeroOrdenesBase = Array.from(new Set(
            rows
                .map((row) => String(row.numero_orden || '').split(':')[0].trim())
                .filter(Boolean)
        ));

        let ordenesPorNumero = new Map();
        if (numeroOrdenesBase.length > 0) {
            const ordenesRelacionadas = await db('ordenes')
                .whereIn('numero_orden', numeroOrdenesBase)
                .select('numero_orden', 'estado_cliente');

            ordenesPorNumero = new Map(
                ordenesRelacionadas.map((orden) => [String(orden.numero_orden), orden])
            );
        }

        const data = rows.map((row) => {
            const numeroOrdenBase = String(row.numero_orden || '').split(':')[0].trim();
            const ordenRelacionada = ordenesPorNumero.get(numeroOrdenBase);
            return {
                ...row,
                estado_cliente: row.estado_cliente || ordenRelacionada?.estado_cliente || ''
            };
        });

        return res.json({ success: true, data });
    } catch (error) {
        console.error('GET /api/ganadores error:', error);
        return res.status(500).json({ success: false, message: 'Error al obtener ganadores', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
});

/* ============================================================ */
/* SECCIÓN: GESTIÓN DE EXPIRACIÓN DE ÓRDENES                   */
/* ============================================================ */

/**
 * GET /api/admin/ordenes-expiradas
 * Obtiene estadísticas de órdenes expiradas (protegido con JWT)
 */
app.get('/api/admin/ordenes-expiradas/stats', verificarToken, async (req, res) => {
    try {
        const stats = await ordenExpirationService.obtenerEstadisticas();
        
        res.json({
            success: true,
            data: stats,
            message: 'Estadísticas de órdenes expiradas'
        });
    } catch (error) {
        console.error('GET /api/admin/ordenes-expiradas/stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo estadísticas'
        });
    }
});

/**
 * GET /api/admin/ordenes-expiradas/estado-servicio
 * Obtiene el estado completo del servicio de expiración (depuración y monitoreo)
 * Incluye: ejecuciones, próxima limpieza, estadísticas, últimos errores
 */
app.get('/api/admin/ordenes-expiradas/estado-servicio', verificarToken, async (req, res) => {
    try {
        const estadoServicio = ordenExpirationService.obtenerEstado();
        const estadisticasOrdenes = await ordenExpirationService.obtenerEstadisticas();
        
        res.json({
            success: true,
            data: {
                servicio: estadoServicio,
                ordenes: estadisticasOrdenes,
                timestamp: new Date().toISOString()
            },
            message: 'Estado completo del servicio de expiración'
        });
    } catch (error) {
        console.error('GET /api/admin/ordenes-expiradas/estado-servicio error:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo estado del servicio'
        });
    }
});

/**
 * GET /api/admin/ordenes-expiradas/listado
 * Obtiene listado de órdenes que han sido liberadas por expiración
 */
app.get('/api/admin/ordenes-expiradas/listado', verificarToken, async (req, res) => {
    try {
        const { limite = 100 } = req.query;

        const ordenesExpiradas = await db('ordenes_expiradas_log')
            .orderBy('fecha_liberacion', 'desc')
            .limit(Math.min(parseInt(limite), 1000));

        res.json({
            success: true,
            data: {
                total: ordenesExpiradas.length,
                ordenes: ordenesExpiradas
            },
            message: 'Listado de órdenes expiradas'
        });
    } catch (error) {
        console.error('GET /api/admin/ordenes-expiradas/listado error:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo listado'
        });
    }
});

/**
 * POST /api/admin/ordenes-expiradas/limpiar
 * Ejecuta manualmente la limpieza de órdenes expiradas (admin)
 */
app.post('/api/admin/ordenes-expiradas/limpiar', verificarToken, async (req, res) => {
    try {
        console.log('🧹 Limpieza manual de órdenes expiradas iniciada por admin');
        
        await ordenExpirationService.limpiarOrdenesExpiradas();
        
        const stats = await ordenExpirationService.obtenerEstadisticas();

        res.json({
            success: true,
            message: 'Limpieza manual ejecutada',
            stats: stats
        });
    } catch (error) {
        console.error('POST /api/admin/ordenes-expiradas/limpiar error:', error);
        res.status(500).json({
            success: false,
            message: 'Error durante limpieza'
        });
    }
});

/**
 * POST /api/admin/ordenes-expiradas/configurar
 * Configura el tiempo de expiración dinámicamente (admin)
 * Body: { tiempoApartadoHoras: 12, intervaloLimpiezaMinutos: 5 }
 */
app.post('/api/admin/ordenes-expiradas/configurar', verificarToken, async (req, res) => {
    try {
        const { tiempoApartadoHoras, intervaloLimpiezaMinutos } = req.body;

        if (!tiempoApartadoHoras || tiempoApartadoHoras < 1) {
            return res.status(400).json({
                success: false,
                message: 'tiempoApartadoHoras debe ser > 0'
            });
        }

        if (!intervaloLimpiezaMinutos || intervaloLimpiezaMinutos < 1) {
            return res.status(400).json({
                success: false,
                message: 'intervaloLimpiezaMinutos debe ser > 0'
            });
        }

        // Configurar el servicio
        ordenExpirationService.configurar(tiempoApartadoHoras, intervaloLimpiezaMinutos);

        log('info', 'POST /api/admin/ordenes-expiradas/configurar success', {
            tiempoApartadoHoras,
            intervaloLimpiezaMinutos
        });

        res.json({
            success: true,
            message: 'Configuración de expiración actualizada',
            data: {
                tiempoApartadoHoras,
                intervaloLimpiezaMinutos
            }
        });
    } catch (error) {
        console.error('POST /api/admin/ordenes-expiradas/configurar error:', error);
        res.status(500).json({
            success: false,
            message: 'Error configurando expiración'
        });
    }
});

/**
 * GET /api/admin/expiration-status
 * Obtiene el estado del servicio de expiración (requiere autenticación admin)
 * Usado por: backend/monitor-expiration.js
 */
app.get('/api/admin/expiration-status', verificarToken, async (req, res) => {
    try {
        const estado = ordenExpirationService.obtenerEstado();
        
        res.json({
            success: true,
            data: estado,
            ...estado  // Spread para compatibilidad con monitor
        });
    } catch (error) {
        console.error('GET /api/admin/expiration-status error:', error);
        res.status(500).json({
            success: false,
            activo: false,
            error: error.message
        });
    }
});

/**
 * GET /api/admin/expiration-stats
 * Obtiene estadísticas de órdenes en el sistema (requiere autenticación admin)
 * Usado por: backend/monitor-expiration.js
 */
app.get('/api/admin/expiration-stats', verificarToken, async (req, res) => {
    try {
        const stats = await ordenExpirationService.obtenerEstadisticas();
        
        res.json({
            success: true,
            data: stats,
            ...stats  // Spread para compatibilidad con monitor
        });
    } catch (error) {
        console.error('GET /api/admin/expiration-stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/admin/ordenes-canceladas
 * Obtiene lista de órdenes canceladas por expiración
 * Con paginación y filtros
 */
app.get('/api/admin/ordenes-canceladas', verificarToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        // Total de órdenes canceladas
        const totalResult = await db('ordenes').where('estado', 'cancelada').count('* as total');
        const total = totalResult[0]?.total || 0;

        // Órdenes canceladas con paginación
        const canceladas = await db('ordenes')
            .where('estado', 'cancelada')
            .select('numero_orden', 'nombre_cliente', 'cantidad_boletos', 'total', 'created_at', 'updated_at')
            .orderBy('updated_at', 'desc')
            .limit(limit)
            .offset(offset);

        res.json({
            success: true,
            data: {
                ordenes: canceladas,
                paginacion: {
                    pagina: page,
                    porPagina: limit,
                    total: total,
                    totalPaginas: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('GET /api/admin/ordenes-canceladas error:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo órdenes canceladas',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/admin/ordenes-estado-resumen
 * Resumen de órdenes por estado: pendiente, confirmada, cancelada
 * Útil para dashboard
 */
app.get('/api/admin/ordenes-estado-resumen', verificarToken, async (req, res) => {
    try {
        // Agrupar por estado y contar
        const estadisticas = await db('ordenes')
            .select(
                'estado',
                db.raw('COUNT(*) as cantidad'),
                db.raw('COALESCE(SUM(total), 0) as total_ingresos')
            )
            .groupBy('estado');

        // Transformar a objeto más legible
        const resumen = {};
        let totalOrdenes = 0;
        let totalIngresos = 0;

        for (const stat of estadisticas) {
            const estado = stat.estado || 'sin_estado';
            resumen[estado] = {
                cantidad: parseInt(stat.cantidad || 0),
                ingresos: parseFloat(stat.total_ingresos || 0)
            };
            totalOrdenes += parseInt(stat.cantidad || 0);
            totalIngresos += parseFloat(stat.total_ingresos || 0);
        }

        res.json({
            success: true,
            data: {
                resumen,
                totales: {
                    ordenes: totalOrdenes,
                    ingresos: totalIngresos.toFixed(2)
                },
                configuracion: {
                    tiempoApartadoHoras: TIEMPO_APARTADO_HORAS,
                    intervaloLimpiezaMinutos: INTERVALO_LIMPIEZA_MINUTOS,
                    precioBoleto: obtenerPrecioDinamico()  // ✅ Lee el precio ACTUAL de config.json
                }
            }
        });
    } catch (error) {
        console.error('GET /api/admin/ordenes-estado-resumen error:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo resumen de estados',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/admin/ordenes-expiradas/restaurar
 * Restaura una orden específica que fue expirada (undo expiración)
 * Body: { numero_orden: "SY-AA001" }
 */
app.post('/api/admin/ordenes-expiradas/restaurar', verificarToken, async (req, res) => {
    try {
        const { numero_orden } = req.body;

        if (!numero_orden) {
            return res.status(400).json({
                success: false,
                message: 'numero_orden es requerido'
            });
        }

        // Buscar la orden
        const orden = await db('ordenes')
            .where('numero_orden', numero_orden)
            .first();

        if (!orden) {
            return res.status(404).json({
                success: false,
                message: 'Orden no encontrada'
            });
        }

        if (orden.estado_pago !== 'expired') {
            return res.status(400).json({
                success: false,
                message: 'Esta orden no está expirada'
            });
        }

        // Restaurar la orden
        await db('ordenes')
            .where('numero_orden', numero_orden)
            .update({
                estado_pago: 'pending',
                liberada_at: null,
                liberada_automaticamente: false,
                updated_at: new Date()
            });

        log('info', 'Orden restaurada desde expiración', { numero_orden });

        res.json({
            success: true,
            message: `Orden ${numero_orden} restaurada`,
            data: { numero_orden }
        });
    } catch (error) {
        console.error('POST /api/admin/ordenes-expiradas/restaurar error:', error);
        res.status(500).json({
            success: false,
            message: 'Error restaurando orden'
        });
    }
});

/**
 * POST /api/admin/ordenes-manual
 * Crear una orden manual de venta en efectivo (protegido con JWT)
 * Body: { cliente_nombre, cliente_whatsapp, boletos: [5000, 5001, ...] }
 */
app.post('/api/admin/ordenes-manual', verificarToken, async (req, res) => {
    try {
        const { cliente_nombre, cliente_whatsapp, boletos } = req.body;
        
        if (!cliente_nombre || !Array.isArray(boletos) || boletos.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cliente nombre y boletos requeridos'
            });
        }

        const numeroOrden = `MAN-${Date.now()}`;
        const resultado = await db('ordenes').insert({
            numero_orden: numeroOrden,
            cliente_nombre: cliente_nombre || 'Venta Manual',
            cliente_whatsapp: cliente_whatsapp || '',
            cantidad_boletos: boletos.length,
            boletos: JSON.stringify(boletos),
            estado: 'completada',
            created_at: new Date(),
            updated_at: new Date(),
            total: 0 // Venta en efectivo, sin registro de pago en sistema
        });

        return res.json({
            success: true,
            message: 'Orden manual creada',
            data: { numero_orden: numeroOrden }
        });
    } catch (error) {
        console.error('POST /api/admin/ordenes-manual error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al crear orden manual',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * PATCH /api/admin/boletos/:numero/liberar
 * Liberar un boleto de una orden (protegido con JWT)
 * Usa transacción para garantizar consistencia
 */
app.patch('/api/admin/boletos/:numero/liberar', verificarToken, async (req, res) => {
    try {
        const { numero } = req.params;
        const numBoleto = Number(numero);

        if (isNaN(numBoleto)) {
            return res.status(400).json({
                success: false,
                message: 'Número de boleto inválido'
            });
        }

        // Usar transacción para garantizar consistencia
        const resultado = await db.transaction(async (trx) => {
            const configSorteo = cargarConfigSorteo();

            // Buscar la orden que contiene este boleto
            const ordenes = await trx('ordenes')
                .select('numero_orden', 'boletos', 'estado', 'cantidad_boletos', 'subtotal', 'descuento', 'total');

            for (const orden of ordenes) {
                try {
                    let numerosArr = [];
                    const rawBoletos = orden.boletos;

                    if (!rawBoletos) {
                        numerosArr = [];
                    } else if (Array.isArray(rawBoletos)) {
                        numerosArr = rawBoletos;
                    } else if (typeof rawBoletos === 'object') {
                        numerosArr = Object.values(rawBoletos);
                    } else if (typeof rawBoletos === 'string') {
                        try {
                            const parsed = JSON.parse(rawBoletos);
                            if (Array.isArray(parsed)) {
                                numerosArr = parsed;
                            } else if (parsed && typeof parsed === 'object') {
                                numerosArr = Object.values(parsed);
                            } else {
                                numerosArr = [];
                            }
                        } catch (parseError) {
                            numerosArr = rawBoletos.split(',').map(v => v.trim()).filter(Boolean);
                        }
                    }

                    numerosArr = numerosArr
                        .map(v => Number(v?.numero || v?.numero_boleto || v))
                        .filter(v => !Number.isNaN(v));

                    const index = numerosArr.indexOf(numBoleto);
                    
                    if (index !== -1) {
                        // Remover el boleto
                        numerosArr.splice(index, 1);
                        
                        await trx('boletos_estado')
                            .where('numero', numBoleto)
                            .update({
                                estado: 'disponible',
                                numero_orden: null,
                                updated_at: new Date()
                            });

                        // Si no quedan boletos, eliminar la orden; si no, actualizar
                        if (numerosArr.length === 0) {
                            await trx('orden_oportunidades')
                                .where('numero_orden', orden.numero_orden)
                                .update({
                                    estado: 'disponible',
                                    numero_orden: null
                                });

                            await trx('ordenes').where('numero_orden', orden.numero_orden).delete();
                        } else {
                            const totalesServidor = calcularTotalesServidor(
                                numerosArr.length,
                                configSorteo,
                                new Date()
                            );

                            await trx('ordenes')
                                .where('numero_orden', orden.numero_orden)
                                .update({
                                    boletos: JSON.stringify(numerosArr),
                                    cantidad_boletos: numerosArr.length,
                                    subtotal: totalesServidor.subtotal,
                                    descuento: totalesServidor.descuento,
                                    total: totalesServidor.totalFinal,
                                    updated_at: new Date()
                                });
                        }
                        
                        return {
                            encontrado: true,
                            orden: orden.numero_orden,
                            boleto: numBoleto
                        };
                    }
                } catch (e) {
                    // Ignorar JSON inválido
                }
            }
            
            // Si llegamos aquí, el boleto no fue encontrado
            throw new Error('BOLETO_NOT_FOUND');
        });

        if (resultado) {
            global.boletosStatsCache = null;
            global.boletosStatsCacheTime = null;
            serverCache.boletosPublicosCached = null;
            serverCache.boletosPublicosCachedTime = 0;
            serverCache.boletosPublicosByRange.clear();

            log('info', 'Boleto liberado', { boleto: resultado.boleto, orden: resultado.orden });
            return res.json({
                success: true,
                message: `Boleto ${resultado.boleto} liberado`,
                data: { numero: resultado.boleto, orden: resultado.orden }
            });
        }
    } catch (error) {
        if (error.message === 'BOLETO_NOT_FOUND') {
            return res.status(404).json({
                success: false,
                message: 'Boleto no encontrado'
            });
        }
        
        log('error', 'PATCH /api/admin/boletos/:numero/liberar error', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Error al liberar boleto',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/* ============================================================ */
/* ENDPOINTS PARA CONFIGURACIÓN DEL CLIENTE (NUEVO)             */
/* ============================================================ */

const clienteConfig = require('./cliente-config.js');

/**
 * GET /api/cliente
 * Obtiene la configuración del cliente actual (desde config.json)
 * No requiere autenticación (datos públicos)
 * ✅ CRÍTICO: Lee desde config.json para reflejar cambios del admin
 */
app.get('/api/cliente', (req, res) => {
    try {
        // ✅ Leer desde config.json en lugar de cliente-config.js hardcodeado
        const configPath = path.join(__dirname, 'config.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);
        
        // ✅ VALIDACIÓN: Asegurar estructura mínima
        if (!config.cliente) config.cliente = {};
        if (!config.rifa) config.rifa = {};
        if (!config.tecnica) config.tecnica = {};
        
        // ✅ VALIDACIÓN: Campos críticos de rifa
        if (!config.rifa.nombreSorteo) {
            console.warn('⚠️  nombreSorteo vacío en config.json, usando fallback');
            config.rifa.nombreSorteo = 'SORTEO EN VIVO';
        }
        if (!config.rifa.totalBoletos || isNaN(config.rifa.totalBoletos) || config.rifa.totalBoletos <= 0) {
            console.warn('⚠️  totalBoletos inválido en config.json, usando fallback');
            config.rifa.totalBoletos = 250000;
        }
        if (!config.rifa.precioBoleto || isNaN(config.rifa.precioBoleto) || config.rifa.precioBoleto <= 0) {
            console.warn('⚠️  precioBoleto inválido en config.json, usando fallback');
            config.rifa.precioBoleto = 100;
        }
        
        // Combinar datos de config.json con estructura esperada
        const clienteData = {
            cliente: config.cliente || {},
            rifa: config.rifa || {},
            tecnica: config.tecnica || {},
            cuentas: config.tecnica?.bankAccounts || [],
            seo: normalizarSeoConfigParaPersistencia(config.seo || {}, config),
            tema: normalizarTemaConfig(config.tema || {})
        };
        
        res.json({
            success: true,
            data: clienteData
        });
    } catch (error) {
        console.error('GET /api/cliente error:', error);
        // Fallback a cliente-config.js si falla lectura de config.json
        try {
            res.json({
                success: true,
                data: clienteConfig
            });
        } catch (fallbackError) {
            res.status(500).json({
                success: false,
                message: 'Error obteniendo configuración del cliente',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
});

/**
 * PATCH /api/admin/cliente
 * Actualiza la configuración del cliente
 * Requiere autenticación (admin)
 * Guarda cambios en cliente-config.js
 */
app.patch('/api/admin/cliente', verificarToken, async (req, res) => {
    try {
        const updates = req.body;
        
        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No hay datos para actualizar'
            });
        }
        
        // Actualizar en memoria
        Object.assign(clienteConfig, updates);
        
        // Guardar en archivo (async)
        const configPath = path.join(__dirname, 'cliente-config.js');
        const configContent = `/**\n * Configuración del cliente\n * Actualizado: ${new Date().toISOString()}\n */\n\nmodule.exports = ${JSON.stringify(clienteConfig, null, 2)};`;
        
        fs.writeFileSync(configPath, configContent, 'utf8');
        
        console.log(`✅ Configuración del cliente actualizada`);
        
        res.json({
            success: true,
            message: 'Configuración guardada correctamente',
            data: clienteConfig
        });
    } catch (error) {
        console.error('PATCH /api/admin/cliente error:', error);
        res.status(500).json({
            success: false,
            message: 'Error actualizando configuración',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/admin/cliente/rifa
 * Actualiza solo la información del sorteo
 * Requiere autenticación
 */
app.post('/api/admin/cliente/rifa', verificarToken, async (req, res) => {
    try {
        const rifaUpdates = req.body;
        
        if (!rifaUpdates) {
            return res.status(400).json({
                success: false,
                message: 'No hay datos del sorteo para actualizar'
            });
        }
        
        // Validaciones básicas
        if (rifaUpdates.totalBoletos && rifaUpdates.totalBoletos < 1) {
            return res.status(400).json({
                success: false,
                message: 'Total de boletos debe ser mayor a 0'
            });
        }
        
        if (rifaUpdates.precioBoleto && rifaUpdates.precioBoleto < 0) {
            return res.status(400).json({
                success: false,
                message: 'Precio del boleto no puede ser negativo'
            });
        }
        
        // Actualizar
        clienteConfig.rifa = Object.assign({}, clienteConfig.rifa, rifaUpdates);
        
        // Guardar en archivo
        const configPath = path.join(__dirname, 'cliente-config.js');
        const configContent = `/**\n * Configuración del cliente\n * Actualizado: ${new Date().toISOString()}\n */\n\nmodule.exports = ${JSON.stringify(clienteConfig, null, 2)};`;
        fs.writeFileSync(configPath, configContent, 'utf8');
        
        console.log(`✅ Configuración del sorteo actualizada`);
        
        res.json({
            success: true,
            message: 'Sorteo actualizado correctamente',
            data: clienteConfig.rifa
        });
    } catch (error) {
        console.error('POST /api/admin/cliente/rifa error:', error);
        res.status(500).json({
            success: false,
            message: 'Error actualizando sorteo',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/admin/cliente/cuentas
 * Actualiza cuentas de pago
 * Requiere autenticación
 */
app.post('/api/admin/cliente/cuentas', verificarToken, async (req, res) => {
    try {
        const cuentas = req.body;
        
        if (!Array.isArray(cuentas)) {
            return res.status(400).json({
                success: false,
                message: 'Las cuentas deben ser un array'
            });
        }
        
        // Validar cada cuenta
        for (const cuenta of cuentas) {
            if (!cuenta.nombreBanco || !cuenta.accountNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'Cada cuenta debe tener banco y número de cuenta'
                });
            }
        }
        
        clienteConfig.cuentas = cuentas;
        
        // Guardar
        const configPath = path.join(__dirname, 'cliente-config.js');
        const configContent = `/**\n * Configuración del cliente\n * Actualizado: ${new Date().toISOString()}\n */\n\nmodule.exports = ${JSON.stringify(clienteConfig, null, 2)};`;
        fs.writeFileSync(configPath, configContent, 'utf8');
        
        console.log(`✅ Cuentas de pago actualizadas`);
        
        res.json({
            success: true,
            message: 'Cuentas de pago actualizadas',
            data: clienteConfig.cuentas
        });
    } catch (error) {
        console.error('POST /api/admin/cliente/cuentas error:', error);
        res.status(500).json({
            success: false,
            message: 'Error actualizando cuentas',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/* ============================================================ */
/* SECCIÓN: GESTIÓN DE BOLETOS (ARQUITECTURA 1M BOLETOS)       */
/* ============================================================ */

/**
 * GET /api/boletos/disponibles
 * Obtiene boletos disponibles con paginación
 * OPTIMIZADO: Devuelve solo X boletos, no los 1M
 * Query params:
 *   - limit: cuántos boletos (default 50, max 500)
 *   - offset: desde dónde empezar (default 0)
 */
app.get('/api/boletos/disponibles', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 500);  // Max 500
        const offset = parseInt(req.query.offset) || 0;

        const boletos = await BoletoService.obtenerBoletosDisponibles(limit, offset);
        const totalDisponibles = await BoletoService.contarBoletosDisponibles();

        res.json({
            success: true,
            boletos: boletos,
            paginacion: {
                total: totalDisponibles,
                offset: offset,
                limit: limit,
                proximo_offset: offset + limit
            }
        });
    } catch (error) {
        log('error', 'GET /api/boletos/disponibles error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error obteniendo boletos disponibles',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/boletos/verificar
 * Verifica disponibilidad de boletos específicos RÁPIDAMENTE
 * CRÍTICO para evitar overselling
 * Body: { numeros: [1, 2, 3, 4, 5] }
 */
app.post('/api/boletos/verificar', async (req, res) => {
    try {
        const { numeros } = req.body;

        if (!Array.isArray(numeros) || numeros.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'numeros debe ser un array con al menos 1 boleto'
            });
        }

        if (numeros.length > 1000) {
            return res.status(400).json({
                success: false,
                message: 'No se pueden verificar más de 1000 boletos a la vez'
            });
        }

        // Validar que sean enteros no negativos.
        // La rifa actual usa rango 0..N-1, así que el boleto 0 debe aceptarse.
        const numerosValidos = numeros.every(n => Number.isInteger(Number(n)) && Number(n) >= 0);
        if (!numerosValidos) {
            return res.status(400).json({
                success: false,
                message: 'Todos los números deben ser enteros no negativos'
            });
        }

        const { disponibles, conflictos } = await BoletoService.verificarDisponibilidad(numeros);

        res.json({
            success: true,
            disponibles: disponibles,
            conflictos: conflictos,
            resumen: {
                solicitados: numeros.length,
                disponibles: disponibles.length,
                conflictos: conflictos.length
            }
        });
    } catch (error) {
        log('error', 'POST /api/boletos/verificar error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error verificando boletos',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/boletos/estadisticas
 * Obtiene estadísticas de boletos (para dashboard)
 * RÁPIDO: Solo suma counts, no carga boletos
 */
app.get('/api/boletos/estadisticas', verificarToken, async (req, res) => {
    try {
        const stats = await BoletoService.obtenerEstadisticas();

        res.json({
            success: true,
            estadisticas: {
                total: stats.total,
                disponibles: stats.disponible,
                reservados: stats.reservado,
                vendidos: stats.vendido,
                cancelados: stats.cancelado,
                porcentaje: {
                    disponibles: ((stats.disponible / stats.total) * 100).toFixed(2) + '%',
                    vendidos: ((stats.vendido / stats.total) * 100).toFixed(2) + '%'
                }
            }
        });
    } catch (error) {
        log('error', 'GET /api/boletos/estadisticas error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error obteniendo estadísticas',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/boletos/init-dev
 * SOLO DESARROLLO: Inicializa boletos sin autenticación
 * ⚠️ NO USAR EN PRODUCCIÓN
 * 
 * Body requerido:
 * {
 *   "totalBoletos": 60000,        // ⭐ DINÁMICO: cantidad total de boletos
 *   "secretKey": "rifa-init-2025" // Llave de seguridad
 * }
 * 
 * Se adaptará automáticamente al número de boletos configurado
 */
app.post('/api/boletos/init-dev', async (req, res) => {
    try {
        // PROTECCIÓN: Solo en desarrollo o si SECRET_KEY es correcto
        const secretKey = req.body.secretKey;
        const isDev = process.env.NODE_ENV !== 'production';
        const isValidSecret = secretKey === process.env.INIT_SECRET || secretKey === 'rifa-init-2025';

        if (!isDev && !isValidSecret) {
            return res.status(403).json({
                success: false,
                message: 'No autorizado'
            });
        }

        // ⭐ DINÁMICO: Leer totalBoletos del config.js o del request body
        const configSorteo = cargarConfigSorteo();
        let TOTAL = parseInt(req.body.totalBoletos) || configSorteo.totalBoletos;
        
        // Validar que sea un número válido y razonable
        if (isNaN(TOTAL) || TOTAL < 1 || TOTAL > 10000000) {
            return res.status(400).json({
                success: false,
                message: 'totalBoletos debe ser un número entre 1 y 10,000,000',
                received: req.body.totalBoletos,
                config: configSorteo.totalBoletos
            });
        }

        console.log(`🔄 Iniciando proceso de creación de boletos...`);
        console.log(`📊 Total a crear: ${TOTAL.toLocaleString('es-MX')} boletos`);

        // Contar boletos actuales
        const result = await db('boletos_estado').count('* as total').first();
        const boletosActuales = result.total || 0;

        console.log(`📊 Boletos actuales: ${boletosActuales.toLocaleString()}`);

        if (boletosActuales >= TOTAL) {
            return res.json({
                success: true,
                message: 'Ya existen suficientes boletos',
                estadistica: {
                    totalActual: boletosActuales,
                    requerido: TOTAL,
                    diferencia: 0
                }
            });
        }

        // Insertar boletos en lotes
        const LOTE = 1000;
        const inicio = boletosActuales;
        let insertados = 0;
        const aInsertar = TOTAL - boletosActuales;

        res.json({
            success: true,
            message: 'Inicialización iniciada en background',
            status: 'en_progreso',
            detalles: {
                totalACrear: TOTAL,
                boletosActuales: boletosActuales,
                aInsertar: aInsertar,
                tiempoEstimado: `${Math.ceil(aInsertar / 1000)} segundos`
            }
        });

        // Ejecutar en background
        (async () => {
            try {
                for (let start = inicio; start < TOTAL; start += LOTE) {
                    const end = Math.min(start + LOTE - 1, TOTAL - 1);
                    const boletos = [];

                    for (let i = start; i <= end; i++) {
                        boletos.push({
                            numero: i,
                            estado: 'disponible',
                            created_at: new Date(),
                            updated_at: new Date()
                        });
                    }

                    await db('boletos_estado').insert(boletos);
                    insertados += boletos.length;
                    const porcentaje = Math.round((insertados / aInsertar) * 100);
                    console.log(`✅ Insertados: ${insertados.toLocaleString()}/${aInsertar.toLocaleString()} (${porcentaje}%)`);
                }

                console.log(`✅ COMPLETADO: ${insertados.toLocaleString()} boletos insertados`);
                
                // Verificar resultado
                const final = await db('boletos_estado').count('* as total').first();
                console.log(`📊 Total final en BD: ${final.total.toLocaleString()} boletos`);

            } catch (err) {
                console.error('❌ Error en background:', err.message);
            }
        })();

    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error iniciando boletos',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/boletos/inicializar
 * Crea boletos en la BD (ejecutar una sola vez)
 * REQUIERE autenticación admin
 * ⚠️ LENTO: Tarda ~ minutos la primera vez
 * ✅ DINÁMICO: Lee totalBoletos desde config.js
 */
app.post('/api/boletos/inicializar', verificarToken, async (req, res) => {
    try {
        const configSorteo = cargarConfigSorteo();
        const { totalBoletos } = req.body;
        const total = totalBoletos || configSorteo.totalBoletos;

        if (total < 1000 || total > 10000000) {
            return res.status(400).json({
                success: false,
                message: 'Total de boletos debe estar entre 1000 y 10M',
                config: configSorteo.totalBoletos
            });
        }

        log('info', 'POST /api/boletos/inicializar INICIADO', { totalBoletos: total });

        // Ejecutar en background para no bloquear
        res.json({
            success: true,
            message: 'Inicialización de boletos iniciada en background',
            status: 'en_progreso'
        });

        // No esperar respuesta, ejecutar en background
        BoletoService.inicializarBoletos(total)
            .then(() => {
                log('info', 'POST /api/boletos/inicializar COMPLETADO', { totalCreados: total });
            })
            .catch(error => {
                log('error', 'POST /api/boletos/inicializar ERROR', { error: error.message });
            });

    } catch (error) {
        log('error', 'POST /api/boletos/inicializar error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error iniciando boletos',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/boletos/limpiar-reservas
 * Libera boletos de órdenes expiradas (cron manual)
 * Se puede ejecutar cada 5 minutos
 */
app.post('/api/boletos/limpiar-reservas', verificarToken, async (req, res) => {
    try {
        const resultado = await BoletoService.limpiarReservasExpiradas();

        log('info', 'POST /api/boletos/limpiar-reservas - Reservas expiradas liberadas', resultado);

        res.json({
            success: true,
            boletosLiberados: resultado.boletosLiberados
        });
    } catch (error) {
        log('error', 'POST /api/boletos/limpiar-reservas error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error limpiando reservas',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Ruta no encontrada'
    });
});

/**
 * 🔧 ENDPOINT DE MANTENIMIENTO: Limpiar boletos huérfanos
 * POST /api/admin/cleanup-boletos
 * Libera boletos apartados sin una orden válida
 * Solo para administradores autenticados
 */
app.post('/api/admin/cleanup-boletos', verificarToken, async (req, res) => {
    try {
        if (req.usuario?.rol !== 'administrador') {
            return res.status(403).json({
                success: false,
                message: 'Permiso denegado: Solo administradores pueden ejecutar limpieza'
            });
        }

        console.log('\n🔧 [CLEANUP] Iniciando limpieza de boletos huérfanos...');

        // Paso 1: Contar cuántos hay
        const resultado = await db.raw(`
            SELECT COUNT(*) as total FROM boletos_estado
            WHERE estado = 'apartado'
            AND (
              numero_orden IS NULL
              OR NOT EXISTS (
                SELECT 1 FROM ordenes o 
                WHERE o.numero_orden = boletos_estado.numero_orden 
                AND o.estado IN ('pendiente', 'confirmada')
              )
            )
        `);

        const totalHuerfanos = resultado.rows[0].total;
        console.log(`📊 Boletos huérfanos encontrados: ${totalHuerfanos}`);

        if (totalHuerfanos === 0) {
            return res.json({
                success: true,
                message: 'No hay boletos huérfanos',
                limpios: 0,
                total: totalHuerfanos
            });
        }

        // Paso 2: Limpiar todos los huérfanos
        const cleanup = await db.raw(`
            UPDATE boletos_estado
            SET estado = 'disponible',
                numero_orden = NULL,
                updated_at = NOW()
            WHERE estado = 'apartado'
            AND (
              numero_orden IS NULL
              OR NOT EXISTS (
                SELECT 1 FROM ordenes o 
                WHERE o.numero_orden = boletos_estado.numero_orden 
                AND o.estado IN ('pendiente', 'confirmada')
              )
            )
        `);

        console.log(`✅ [CLEANUP] Boletos liberados: ${cleanup.rowCount}`);

        return res.json({
            success: true,
            message: `Limpieza completada: ${cleanup.rowCount} boletos liberados`,
            limpios: cleanup.rowCount,
            total: totalHuerfanos
        });

    } catch (error) {
        console.error('❌ [CLEANUP] Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Error durante la limpieza',
            error: error.message
        });
    }
});

/**
 * POST /api/admin/limpiar-ordenes-canceladas
 * Corrije órdenes canceladas cuyos boletos NO fueron liberados
 * Busca todas las órdenes con estado='cancelada' y libera sus boletos
 */
app.post('/api/admin/limpiar-ordenes-canceladas', verificarToken, async (req, res) => {
    try {
        console.log('🧹 [CLEANUP] Iniciando limpieza de órdenes canceladas...');
        
        // PASO 1: Encontrar todas las órdenes canceladas SIN comprobante
        const ordenesCanceladas = await db('ordenes')
            .where('estado', 'cancelada')
            .whereNull('comprobante_path')  // ⭐ Solo sin comprobante
            .select('id', 'numero_orden', 'boletos');

        console.log(`[CLEANUP] Encontradas ${ordenesCanceladas.length} órdenes canceladas sin comprobante`);

        let boletosLiberadosTotal = 0;
        let ordenesProcessadas = 0;

        // PASO 2: Procesar cada orden cancelada
        for (const orden of ordenesCanceladas) {
            try {
                // Parsear boletos
                let boletos = [];
                if (Array.isArray(orden.boletos)) {
                    boletos = orden.boletos.map(n => {
                        const num = parseInt(n, 10);
                        return isNaN(num) ? null : num;
                    }).filter(n => n !== null);
                } else if (typeof orden.boletos === 'string') {
                    try {
                        boletos = JSON.parse(orden.boletos || '[]');
                        if (!Array.isArray(boletos)) boletos = [];
                    } catch (e) {
                        if (orden.boletos.length > 0) {
                            boletos = orden.boletos.split(',').map(n => {
                                const num = parseInt(n.trim(), 10);
                                return isNaN(num) ? null : num;
                            }).filter(n => n !== null);
                        }
                    }
                }

                if (boletos.length === 0) continue;

                // Liberar estos boletos en la BD
                const actualizado = await db('boletos_estado')
                    .whereIn('numero', boletos)
                    .update({
                        estado: 'disponible',
                        numero_orden: null,
                        updated_at: new Date()
                    });

                if (actualizado > 0) {
                    console.log(`  ✓ ${orden.numero_orden}: ${actualizado} boletos liberados`);
                    boletosLiberadosTotal += actualizado;
                    ordenesProcessadas++;
                }
            } catch (error) {
                console.error(`  ❌ Error procesando ${orden.numero_orden}:`, error.message);
            }
        }

        console.log(`✅ [CLEANUP] Completado: ${ordenesProcessadas} órdenes, ${boletosLiberadosTotal} boletos liberados`);

        return res.json({
            success: true,
            message: 'Limpieza completada',
            ordenesProcesadas: ordenesProcessadas,
            boletosLiberados: boletosLiberadosTotal
        });

    } catch (error) {
        console.error('❌ [CLEANUP] Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Error durante limpieza',
            error: error.message
        });
    }
});

// ✅ CREAR TABLA orden_oportunidades SI NO EXISTE
async function asegurarTablaOportunidades() {
    try {
        const existe = await db.schema.hasTable('orden_oportunidades');
        if (!existe) {
            console.log('📋 Creando tabla orden_oportunidades...');
            await db.schema.createTable('orden_oportunidades', (table) => {
                table.increments('id').primary();
                table.string('numero_orden', 50).notNullable();
                table.foreign('numero_orden').references('numero_orden').inTable('ordenes').onDelete('CASCADE');
                table.integer('numero_oportunidad').notNullable();
                table.enum('estado', ['disponible', 'apartado', 'vendido']).defaultTo('disponible');
                table.timestamp('created_at').defaultTo(db.raw('CURRENT_TIMESTAMP'));
                table.timestamp('updated_at').defaultTo(db.raw('CURRENT_TIMESTAMP'));
                table.index('numero_orden');
                table.index('numero_oportunidad');
                table.index('estado');
                table.unique(['numero_orden', 'numero_oportunidad']);
            });
            console.log('✅ Tabla orden_oportunidades creada exitosamente');
        } else {
            console.log('✅ Tabla orden_oportunidades ya existe');
        }
        
        // ✅ CREAR ÍNDICE ÚNICO PARCIAL PARA PREVENIR DUPLICADOS
        await asegurarConstraintUnicoOportunidades();
    } catch (error) {
        console.error('⚠️  Error verificando tabla orden_oportunidades:', error.message);
        // No fallar el servidor, continuar de todas formas
    }
}

/**
 * ✅ Se guridad Crítica: Crear índice único parcial para oportunidades activas
 * Garantiza que el mismo número de oportunidad NO puede estar en estado 'activo' 
 * en más de una orden al mismo tiempo
 */
async function asegurarConstraintUnicoOportunidades() {
    try {
        console.log('🔒 Verificando constraint único para oportunidades activas...');
        
        // Verificar si el índice ya existe
        const indexExists = await db.raw(`
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'idx_numero_opu_activo'
        `);
        
        if (indexExists.rows.length > 0) {
            console.log('✅ Constraint único ya existe');
            return;
        }
        
        // Crear índice único PARCIAL (solo para estados activos)
        // Esto previene duplicados de oportunidades en estado apartado/vendido
        await db.raw(`
            CREATE UNIQUE INDEX idx_numero_opu_activo 
            ON orden_oportunidades(numero_oportunidad) 
            WHERE estado IN ('apartado', 'vendido');
        `);
        
        console.log('✅ Constraint único creado: Oportunidades activas NO pueden duplicarse');
    } catch (error) {
        // Si el índice ya existe o hay error, no es fatal
        if (error.message.includes('already exists') || error.message.includes('duplicate key')) {
            console.log('✅ Constraint único de oportunidades ya estaba presente');
        } else {
            console.warn('⚠️  No se pudo crear constraint único de oportunidades:', error.message);
        }
    }
}

// ===== HANDLERS GLOBALES PARA PREVENIR CRASHES =====
// Capturar excepciones no manejadas
process.on('uncaughtException', (error) => {
    console.error('❌ ¡EXCEPCIÓN NO CAPTURADA!');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('El servidor intentará continuar...\n');
    // NO llamar a process.exit() - dejar que el servidor siga corriendo
});

// Capturar promesas rechazadas sin manejador
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ ¡PROMESA RECHAZADA SIN HANDLER!');
    console.error('Razón:', reason);
    console.error('Promise:', promise);
    console.error('El servidor intentará continuar...\n');
    // NO llamar a process.exit() - dejar que el servidor siga corriendo
});

// ===== MIDDLEWARE DE ERROR GLOBAL =====
// Capturar errores en rutas no encontradas
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Ruta no encontrada: ${req.method} ${req.path}`
    });
});

// 🔒 Middleware de error global (DEBE ser el ÚLTIMO)
// Maneja TODOS los errores no capturados en endpoints
app.use((err, req, res, next) => {
    // Loguear el error COMPLETO (con detalles internos) en servidor
    console.error('');
    console.error('❌ ERROR NO CAPTURADO EN ENDPOINT:');
    console.error(`   Método: ${req.method}`);
    console.error(`   Ruta: ${req.path}`);
    console.error(`   IP: ${req.ip}`);
    console.error(`   Mensaje: ${err.message}`);
    if (err.stack) {
        console.error(`   Stack: ${err.stack.split('\n').slice(0, 5).join('\n   ')}`);
    }
    console.error('');

    // NO dejar que el error mate el servidor
    if (res.headersSent) {
        return next(err); // Headers ya enviados, delegar a Express
    }

    // Determinar status code
    let statusCode = err.statusCode || err.status || 500;
    if (statusCode < 400 || statusCode > 599) statusCode = 500;

    // Sanitizar mensaje para respuesta
    const isDev = process.env.NODE_ENV === 'development';
    const safeMessage = sanitizarErrorMessage(err.message, isDev);

    // Respuesta al cliente (SIN detalles internos en producción)
    res.status(statusCode).json({
        success: false,
        message: safeMessage,
        code: err.code || 'INTERNAL_ERROR',
        ...(isDev && { debug: err.message }) // Solo en desarrollo
    });
});

// Iniciar servidor con WebSocket
const PORT = process.env.PORT || 5001;

// ⭐ Crear servidor HTTP que soporte WebSocket
const http = require('http');
const server = http.createServer(app);

// 🔌 Configurar Socket.io con soporte CORS seguro
const io = socketIO(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? allowedCorsOrigins.length > 0 
                ? allowedCorsOrigins 
                : false // Si no hay orígenes whitelistados, denegar TODOS en producción
            : ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500', 'http://127.0.0.1:3000'],
        methods: ['GET', 'POST'],
        credentials: true,
        maxAge: 86400
    },
    allowEIO3: true,  // Compatibilidad con clientes antiguos
    transports: ['websocket', 'polling'],  // Fallback a polling si falla websocket
    pingInterval: 25000,
    pingTimeout: 60000
});

// Iniciar servidor HTTP
server.listen(PORT, () => {
    console.log(`🚀 Servidor RifaPlus corriendo en puerto ${PORT}`);
    console.log(`📍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔌 WebSocket habilitado en ws://localhost:${PORT}`);
    console.log('🛡️  Protección contra crashes activada\n');
    
    // 🔌 Inicializar eventos de WebSocket
    wsEvents = inicializarEventosWebSocket(io);
    console.log('✅ Sistema WebSocket inicializado\n');
});

// ✅ Tareas de inicialización en BACKGROUND (no bloquean startup)
// Esto permite que el servidor responda inmediatamente
setImmediate(async () => {
    try {
        // Asegurar que exista tabla de oportunidades y constraints
        await asegurarTablaOportunidades();
        
        // Iniciar servicio de expiración de órdenes
        ordenExpirationService.iniciar(INTERVALO_LIMPIEZA_MINUTOS, TIEMPO_APARTADO_HORAS);
    } catch (e) {
        console.error('❌ Error en inicialización de background:', e.message);
    }
});

// Manejar cierre graceful
process.on('SIGTERM', () => {
    console.log('\n🛑 Recibido SIGTERM, cerrando servidor gracefully...');
    server.close(() => {
        console.log('✅ Servidor cerrado');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\n🛑 Recibido SIGINT, cerrando servidor gracefully...');
    server.close(() => {
        console.log('✅ Servidor cerrado');
        process.exit(0);
    });
});
