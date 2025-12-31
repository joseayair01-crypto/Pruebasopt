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
// ⚠️ CRÍTICO: cargar .env desde el directorio backend para DATABASE_URL
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const db = require('./db'); // Instancia Knex (Postgres)
const ordenExpirationService = require('./services/ordenExpirationService'); // Servicio de expiración
const { obtenerConfigExpiracion } = require('./config-loader'); // Carga config.js
const dbUtils = require('./db-utils');
const BoletoService = require('./services/boletoService'); // ✅ NUEVO: Servicio de boletos para 1M

// ===== VALIDACIÓN CRÍTICA DE CONFIGURACIÓN =====
// Verificar que variables de entorno REQUERIDAS existan
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

// Configuración
const JWT_SECRET = process.env.JWT_SECRET; // REQUERIDO en .env (no fallback)
const JWT_EXPIRES_IN = '24h'; // Token expira en 24 horas

// Configuración de expiración de órdenes
// Prioridad: .env > config.js > defaults
const configExpiracion = obtenerConfigExpiracion();
const TIEMPO_APARTADO_HORAS = configExpiracion.tiempoApartadoHoras;
const INTERVALO_LIMPIEZA_MINUTOS = configExpiracion.intervaloLimpiezaMinutos;
const PRECIO_BOLETO_DEFAULT = configExpiracion.precioBoleto; // ✅ PRECIO DINÁMICO desde config.js

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

// Configurar CORS para desarrollo y producción
app.use(cors({
    origin: function(origin, callback) {
        // Lista de orígenes permitidos (desarrollo local)
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5500',
            'http://127.0.0.1:5500',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5001',
        ];
        
        // En producción, permitir HTTPS (cualquier origen)
        // En desarrollo, usar lista blanca
        if (process.env.NODE_ENV === 'production') {
            // Producción: permitir todos los orígenes HTTPS
            callback(null, true);
        } else if (!origin || allowedOrigins.includes(origin)) {
            // Desarrollo: usar lista blanca
            callback(null, true);
        } else {
            callback(new Error('CORS policy: Origin not allowed'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Parsear JSON y form data
app.use(bodyParser.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Parsear archivos de formularios (FormData con archivos)
app.use(fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    abortOnLimit: true,
    responseOnLimit: 'El archivo es demasiado grande. Máximo 5MB.'
}));

// - Mantiene servicio responsivo para usuarios legítimos

const limiterGeneral = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: process.env.NODE_ENV === 'production' ? 1000 : 500, // Aumentado significativamente
    message: 'Demasiadas solicitudes, intenta más tarde',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req, res) => {
        // Excluir: archivos estáticos, boletos públicos, y requests GET simples
        return req.path === '/api/public/boletos' || 
               req.method === 'GET' && !req.path.startsWith('/api/') ||
               req.path.match(/\.(html|css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/i);
    }
});

const limiterLogin = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // máximo 10 intentos de login (protección contra fuerza bruta)
    message: 'Demasiados intentos de login, intenta más tarde',
    skipSuccessfulRequests: true // No cuenta intentos exitosos
});

const limiterOrdenes = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: process.env.NODE_ENV === 'production' ? 50 : 30, // Aumentado: 50 en producción, 30 en desarrollo
    message: 'Demasiadas órdenes, intenta más tarde'
    // Considera la cantidad de boletos en la orden (max 1000)
    // 50 órdenes × 500 boletos promedio = 25k boletos/minuto ≈ 1.5M/hora = cómodo
});

app.use(limiterGeneral); // Aplicar a todas las rutas

// Servir archivos estáticos en /public
app.use('/public', express.static(path.join(__dirname, 'public')));

// Servir archivos HTML del frontend desde la raíz
app.use(express.static(path.join(__dirname, '..')));

// Ruta catch-all para SPA: si no encuentra un archivo, sirve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

/**
 * Middleware: Verificar JWT
 * Usado en endpoints protegidos (/api/admin/*, /api/ordenes POST, PATCH, etc.)
 */
function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    console.log('🔐 [verificarToken] Authorization header:', !!authHeader);
    console.log('🔐 [verificarToken] Token extraído:', !!token);
    console.log('🔐 [verificarToken] Longitud del token:', token?.length || 0);
    console.log('🔐 [verificarToken] Primeros 20 caracteres:', token?.substring(0, 20) || 'N/A');

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
        console.log('✅ [verificarToken] Token válido, usuario:', usuario?.username);
        req.usuario = usuario; // Adjuntar usuario al request
        next();
    });
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
 * Valida teléfono (básico)
 */
function esTelefonoValido(tel) {
    return tel && tel.length >= 10 && tel.length <= 20;
}

/**
 * Valida que cantidad de boletos sea válida
 */
function esCantidadBoletosValida(cantidad) {
    return Number.isInteger(cantidad) && cantidad > 0 && cantidad <= 10000;
}

/**
 * Valida precio (número positivo)
 */
function esPrecioValido(precio) {
    const num = parseFloat(precio);
    return !isNaN(num) && num > 0;
}

/**
 * FUNCIÓN CRÍTICA: Calcula descuento basado en cantidad de boletos y promociones
 * Esta función se ejecuta en BACKEND para garantizar consistencia
 * Usa promociones DINÁMICAS de config.js si está disponible, con fallback a hardcodeadas
 * @param {number} cantidad - Número de boletos
 * @param {number} precioUnitario - Precio por boleto (default 50)
 * @returns {number} Monto de descuento en pesos
 */
function calcularDescuentoBackend(cantidad, precioUnitario = PRECIO_BOLETO_DEFAULT || 15) {
    let boletosRestantes = cantidad;
    let montoDescuento = 0;

    // PROMOCIONES HARDCODEADAS COMO FALLBACK (versión segura)
    const promocionesDefecto = [
        { cantidad: 20, precio: 250 },
        { cantidad: 10, precio: 130 }
    ];

    // Intentar leer promociones desde js/config.js para mantener consistencia
    let promociones = promocionesDefecto.slice();
    try {
        const configPath = path.join(__dirname, '..', 'js', 'config.js');
        if (fs.existsSync(configPath)) {
            const code = fs.readFileSync(configPath, 'utf8');
            const promosMatch = code.match(/promociones\s*:\s*\[([\s\S]*?)\]/);
            if (promosMatch && promosMatch[1]) {
                const inner = promosMatch[1];
                const objMatches = inner.match(/\{[^}]*\}/g) || [];
                const parsed = objMatches.map(s => {
                    const cMatch = s.match(/cantidad\s*:\s*([0-9]+)/);
                    const pMatch = s.match(/precio\s*:\s*([0-9]+)/);
                    return {
                        cantidad: cMatch ? parseInt(cMatch[1], 10) : 0,
                        precio: pMatch ? parseInt(pMatch[1], 10) : 0
                    };
                }).filter(p => p.cantidad > 0 && p.precio > 0);
                if (parsed.length > 0) promociones = parsed;
            }
        }
    } catch (e) {
        console.warn('⚠️ calcularDescuentoBackend: no se pudo leer promociones desde config.js', e.message);
        promociones = promocionesDefecto.slice();
    }

    // Ordenar promociones por cantidad (descendente)
    promociones = promociones.sort((a, b) => b.cantidad - a.cantidad);

    // Aplicar cada promoción de mayor a menor cantidad
    for (const promo of promociones) {
        if (boletosRestantes >= promo.cantidad) {
            const cantidadPromos = Math.floor(boletosRestantes / promo.cantidad);
            // Sólo aplicar la promoción si realmente ofrece ahorro
            const ahorroPorPromo = promo.cantidad * precioUnitario - promo.precio;
            if (ahorroPorPromo > 0) {
                montoDescuento += cantidadPromos * ahorroPorPromo;
                boletosRestantes -= cantidadPromos * promo.cantidad;
            }
        }
    }

    return montoDescuento;
}

/**
 * Logger simple (futuro: usar Winston o Pino)
 */
function log(nivel, mensaje, datos = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${nivel.toUpperCase()}] ${mensaje}`, datos);
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
        const token = jwt.sign(
            { 
                id: usuario.id, 
                username: usuario.username, 
                email: usuario.email 
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        // Actualizar último acceso
        await db('admin_users').where('id', usuario.id).update({
            ultimo_acceso: new Date()
        });

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
        const usuarios = await db('admin_users')
            .select('id', 'username', 'email', 'rol', 'activo', 'created_at', 'ultimo_acceso')
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
        const rolValido = ['admin', 'operador', 'solo_lectura'].includes(rol) ? rol : 'operador';

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
            creado_por: req.usuario.username
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
        res.status(500).json({
            success: false,
            message: 'Error al crear usuario'
        });
    }
});

/**
 * POST /api/admin/change-password
 * Permite al usuario cambiar su propia contraseña
 * Body: { password_actual, password_nueva, password_repetida }
 */
app.post('/api/admin/change-password', verificarToken, async (req, res) => {
    try {
        const { password_actual, password_nueva, password_repetida } = req.body;
        const usuarioId = req.usuario.id;

        // Validaciones
        if (!password_actual || !password_nueva || !password_repetida) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos de password son requeridos'
            });
        }

        if (password_nueva.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'La nueva contraseña debe tener al menos 8 caracteres'
            });
        }

        if (password_nueva !== password_repetida) {
            return res.status(400).json({
                success: false,
                message: 'Las contraseñas no coinciden'
            });
        }

        // Obtener usuario actual
        const usuario = await db('admin_users').where('id', usuarioId).first();
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

        // Hashear nueva password
        const nuevoHash = await bcrypt.hash(password_nueva, 10);

        // Actualizar en BD
        await db('admin_users').where('id', usuarioId).update({
            password_hash: nuevoHash,
            updated_at: new Date()
        });

        log('info', 'POST /api/admin/change-password - Password cambiado', { usuario_id: usuarioId });

        res.json({
            success: true,
            message: 'Contraseña cambiada exitosamente'
        });
    } catch (error) {
        log('error', 'POST /api/admin/change-password error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error al cambiar contraseña'
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
app.get('/api/admin/config', verificarToken, async (req, res) => {
    try {
        // Por ahora devolvemos una configuración básica
        // En el futuro esto vendría de una tabla de configuración en la BD
        const config = {
            nombreSistema: 'RifaPlus',
            tiempoApartadoHoras: 4,
            intervaloLimpiezaMinutos: 5
        };

        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        log('error', 'GET /api/admin/config error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error al obtener configuración'
        });
    }
});

/**
 * PATCH /api/admin/config
 * Actualiza la configuración del sistema
 */
app.patch('/api/admin/config', verificarToken, async (req, res) => {
    try {
        const { nombreSistema, tiempoApartadoHoras, intervaloLimpiezaMinutos } = req.body;

        // Validaciones básicas
        if (tiempoApartadoHoras && tiempoApartadoHoras < 1) {
            return res.status(400).json({
                success: false,
                message: 'Tiempo reservado debe ser mayor a 0'
            });
        }

        // Por ahora solo simulamos la actualización
        // En el futuro guardaríamos en la BD
        res.json({
            success: true,
            message: 'Configuración actualizada exitosamente',
            data: {
                nombreSistema,
                tiempoApartadoHoras,
                intervaloLimpiezaMinutos
            }
        });
    } catch (error) {
        log('error', 'PATCH /api/admin/config error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error al actualizar configuración'
        });
    }
});

/* ============================================================ */
/* SECCIÓN: GESTIÓN DE CONTADOR DE IDs DE ORDEN                */
/* ============================================================ */

/**
 * POST /api/admin/order-counter/next
 * Genera el siguiente ID de orden único
 * Patrón: SY-AA001 → SY-AA999 → SY-AB000 → SY-ZZ999
 * Cliente: frontend o backend
 */
app.post('/api/admin/order-counter/next', async (req, res) => {
    try {
        const { cliente_id } = req.body;
        
        if (!cliente_id) {
            return res.status(400).json({
                success: false,
                message: 'cliente_id es requerido'
            });
        }

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
            const prefijo = cliente_id.split('_').map(p => p.charAt(0).toUpperCase()).join('') || 'SY';
            const fullOrderId = `${prefijo}-${counter.ultima_secuencia}${numero}`;

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

        log('info', 'POST /api/admin/order-counter/next success', { cliente_id, orden_id: orderId });

        return res.json({
            success: true,
            orden_id: orderId,
            message: 'ID de orden generado exitosamente'
        });

    } catch (error) {
        log('error', 'POST /api/admin/order-counter/next error', { error: error.message, stack: error.stack });
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
        const prefijo = cliente_id.split('_').map(p => p.charAt(0).toUpperCase()).join('') || 'SY';
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

/**
 * Genera el siguiente ID de orden para un cliente dado usando la misma lógica
 * que /api/admin/order-counter/next pero permitiendo pasar una transacción
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
    const prefijo = cid.split('_').map(p => p.charAt(0).toUpperCase()).join('') || 'SY';
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
app.post('/api/ordenes', limiterOrdenes, async (req, res) => {
    try {
        const orden = req.body;
        let ordenId = ''; // INICIALIZAR AQUÍ para que esté disponible en catch
        
        // ===== VALIDACIONES BÁSICAS =====
        
        // Validar ordenId
        if (typeof orden.ordenId !== 'undefined' && orden.ordenId !== null && orden.ordenId !== '') {
            if (typeof orden.ordenId !== 'string') {
                return res.status(400).json({ success: false, message: 'Orden ID inválido' });
            }
            ordenId = sanitizar(orden.ordenId);
            if (ordenId.length === 0 || ordenId.length > 50) {
                return res.status(400).json({ success: false, message: 'Orden ID debe tener entre 1-50 caracteres' });
            }
        } else {
            // Si no se proporciona ordenId, generar uno automáticamente
            ordenId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        
        // Validar cliente
        if (!orden.cliente || typeof orden.cliente !== 'object') {
            return res.status(400).json({ success: false, message: 'Datos del cliente requeridos' });
        }

        const nombre = sanitizar(orden.cliente.nombre || '');
        const apellidos = sanitizar(orden.cliente.apellidos || '');
        const whatsapp = sanitizar(orden.cliente.whatsapp || '');

        if (nombre.length === 0) {
            return res.status(400).json({ success: false, message: 'Nombre del cliente requerido' });
        }
        if (!esTelefonoValido(whatsapp)) {
            return res.status(400).json({ success: false, message: 'Teléfono debe tener 10-20 dígitos' });
        }

        // Validar boletos
        if (!Array.isArray(orden.boletos) || orden.boletos.length === 0) {
            return res.status(400).json({ success: false, message: 'Boletos requeridos' });
        }

        if (orden.boletos.length > 60000) {
            return res.status(400).json({ success: false, message: 'No se pueden comprar más de 60,000 boletos en una orden' });
        }

        // Validar totales
        if (!orden.totales || typeof orden.totales !== 'object') {
            return res.status(400).json({ success: false, message: 'Totales requeridos' });
        }

        const subtotalVal = parseFloat(orden.totales.subtotal || orden.totales.total || 0);
        if (!esPrecioValido(subtotalVal)) {
            return res.status(400).json({ success: false, message: 'Subtotal inválido' });
        }
        if (!esPrecioValido(orden.totales.totalFinal)) {
            return res.status(400).json({ success: false, message: 'Total final inválido' });
        }

        // Validar precioUnitario
        const precioUnitario = parseFloat(orden.precioUnitario || PRECIO_BOLETO_DEFAULT || 15);
        if (!esPrecioValido(precioUnitario)) {
            return res.status(400).json({ success: false, message: 'Precio unitario inválido' });
        }

        // ===== VERIFICACIÓN RÁPIDA DE DISPONIBILIDAD (CON ÍNDICES) =====
        const { disponibles, conflictos } = await BoletoService.verificarDisponibilidad(orden.boletos);

        if (conflictos.length > 0) {
            log('warn', 'Intento de compra de boletos no disponibles', { 
                ordenId, 
                conflictos: conflictos.map(c => c.numero),
                ip: req.ip 
            });
            return res.status(409).json({ 
                success: false, 
                message: `Los siguientes boletos no están disponibles: ${conflictos.map(c => c.numero).join(', ')}`,
                boletosConflicto: conflictos.map(c => c.numero)
            });
        }

        // ===== RECALCULAR DESCUENTO LOCALMENTE =====
        const descuentoRecalculado = calcularDescuentoBackend(orden.boletos.length, precioUnitario);
        const whatsappSanitizado = whatsapp.replace(/[^0-9]/g, '');
        const subtotalCalculado = orden.boletos.length * precioUnitario;
        const totalRecalculado = subtotalCalculado - descuentoRecalculado;

        // ===== TRANSACCIÓN ATÓMICA CON BoletoService =====
        // Esto verifica y reserva todos los boletos en una sola transacción
        const datosOrden = {
            nombreCliente: `${nombre} ${apellidos}`.trim(),
            estadoCliente: sanitizar(orden.cliente?.estado || ''),
            ciudadCliente: sanitizar(orden.cliente?.ciudad || ''),
            telefonoCliente: whatsappSanitizado,
            metodoPago: sanitizar(orden.metodoPago || 'transferencia'),
            detallesPago: sanitizar(orden.cuenta?.accountNumber || ''),
            precioUnitario: precioUnitario,
            subtotal: parseFloat(subtotalCalculado.toFixed(2)),
            descuento: parseFloat(descuentoRecalculado.toFixed(2)),
            total: parseFloat(totalRecalculado.toFixed(2)),
            notas: sanitizar(orden.notas || '')
        };

        try {
            log('debug', 'Llamando a BoletoService.crearOrdenConBoletos', {
                boletosType: typeof orden.boletos,
                boletosArray: Array.isArray(orden.boletos),
                boletosLength: orden.boletos?.length,
                primerosBoletos: orden.boletos?.slice(0, 3),
                ordenId: ordenId,
                nombreCliente: nombre
            });

            const resultado = await BoletoService.crearOrdenConBoletos(
                orden.boletos,
                ordenId,
                datosOrden
            );

            if (!resultado || !resultado.ordenId) {
                throw new Error('Respuesta inválida del servicio de boletos');
            }

            log('info', 'Orden creada exitosamente (BoletoService)', { 
                ordenId, 
                cantidad: resultado.cantidad, 
                total: totalRecalculado,
                insertResult: resultado.insertResult
            });

            const host = req.headers.host || `localhost:${PORT}`;
            const url = `http://${host}/api/ordenes/${ordenId}`;

            return res.json({ 
                success: true, 
                url: url,
                ordenId: ordenId,
                cantidad: resultado.cantidad,
                total: totalRecalculado
            });

        } catch (serviceError) {
            log('error', 'Error en BoletoService.crearOrdenConBoletos', {
                ordenId,
                error: serviceError.message,
                code: serviceError.code,
                boletosCount: orden.boletos?.length
            });

            if (serviceError.message.includes('Boletos no disponibles')) {
                return res.status(409).json({
                    success: false,
                    message: 'Algunos boletos ya fueron vendidos. Intenta con otros números.',
                    error: process.env.NODE_ENV === 'development' ? serviceError.message : undefined
                });
            }
            if (serviceError.message === 'DUPLICATE_ORDER') {
                log('warn', 'Intento de orden duplicada', { ordenId, ip: req.ip });
                return res.status(409).json({
                    success: false,
                    message: 'Orden duplicada - ya existe una orden con este ID'
                });
            }
            if (serviceError.message.includes('no existen') || serviceError.message.includes('no existe')) {
                return res.status(404).json({
                    success: false,
                    message: 'Algunos de los boletos no existen en la base de datos'
                });
            }

            // Re-lanzar para que lo maneje el catch global
            throw serviceError;
        }

    } catch (error) {
        const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const safeOrdenId = typeof ordenId !== 'undefined' ? ordenId : 'UNKNOWN';
        
        log('error', 'POST /api/ordenes error', { 
            errorId,
            error: error.message,
            stack: error.stack?.split('\n').slice(0, 3).join(' | '),
            ordenId: safeOrdenId,
            ip: req.ip
        });

        // Validar que no hayamos enviado una respuesta ya
        if (!res.headersSent) {
            const isDevMode = process.env.NODE_ENV === 'development';
            
            return res.status(500).json({ 
                success: false, 
                message: 'Error al guardar orden en la base de datos',
                errorId: errorId,
                error: isDevMode ? error.message : undefined,
                detail: isDevMode ? error.stack?.split('\n').slice(0, 2) : undefined
            });
        }
    }
});

/**
 * 🔧 ENDPOINT: Limpiar boletos huérfanos
 * GET /api/boletos/cleanup-orphaned
 */
app.get('/api/boletos/cleanup-orphaned', async (req, res) => {
    try {
        console.log('\n🔧 [CLEANUP] Iniciando limpieza de boletos huérfanos...');

        // Paso 1: Contar cuántos hay
        const resultado = await db.raw(`
            SELECT COUNT(*) as total FROM boletos_estado
            WHERE estado = 'reservado'
            AND (
              numero_orden IS NULL
              OR NOT EXISTS (
                SELECT 1 FROM ordenes o 
                WHERE o.numero_orden = boletos_estado.numero_orden 
                AND o.estado IN ('pendiente', 'comprobante_recibido', 'confirmada')
              )
            )
        `);

        const totalHuerfanos = resultado.rows[0]?.total || 0;
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
                reservado_en = NULL,
                updated_at = NOW()
            WHERE estado = 'reservado'
            AND (
              numero_orden IS NULL
              OR NOT EXISTS (
                SELECT 1 FROM ordenes o 
                WHERE o.numero_orden = boletos_estado.numero_orden 
                AND o.estado IN ('pendiente', 'comprobante_recibido', 'confirmada')
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
                reservado_en = NULL,
                updated_at = NOW()
            WHERE estado = 'reservado'
            AND (
              numero_orden IS NULL
              OR NOT EXISTS (
                SELECT 1 FROM ordenes o 
                WHERE o.numero_orden = boletos_estado.numero_orden 
                AND o.estado IN ('pendiente', 'comprobante_recibido')
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
                        vendido_en: new Date(),
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
                vendido_en = NULL,
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
        console.log(`   TOTAL: ${total}/60000\n`);
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
                        <td>$${ordenRow.subtotal.toFixed(2)}</td>
                    </tr>
                    ${ordenRow.descuento > 0 ? `
                    <tr class="total-row">
                        <td colspan="2">Descuento</td>
                        <td>-$${ordenRow.descuento.toFixed(2)}</td>
                    </tr>
                    ` : ''}
                    <tr class="total-row">
                        <td colspan="2"><strong>TOTAL A PAGAR</strong></td>
                        <td><strong>$${ordenRow.total.toFixed(2)}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>

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

        // Consultar órdenes por WhatsApp sanitizado
        const ordenes = await db('ordenes')
            .where('telefono_cliente', whatsappSanitizado)
            .orderBy('created_at', 'desc')
            .select(
                'id',
                'numero_orden',
                'nombre_cliente',
                'estado_cliente',
                'ciudad_cliente',
                'nombre_beneficiario',
                'nombre_banco',
                'numero_referencia',
                'telefono_cliente',
                'cantidad_boletos',
                'precio_unitario',
                'subtotal',
                'descuento',
                'boletos',
                'total',
                'metodo_pago',
                'detalles_pago',
                'estado',
                'notas',
                'created_at',
                'updated_at'
            );

        // DEBUG: Log si no encuentra nada
        if (ordenes.length === 0) {
            console.log(`⚠️ No se encontraron órdenes para: ${whatsappSanitizado}`);
            // Mostrar todos los números de teléfono únicos para debugging
            const todosLosNumeros = await db('ordenes').distinct('telefono_cliente').select('telefono_cliente');
            console.log('Números en BD:', todosLosNumeros.map(o => o.telefono_cliente));
        }

        // Parsear boletos JSON a array
        const ordenesFormateadas = ordenes.map(orden => {
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

            return {
                id: orden.numero_orden,
                numero_orden: orden.numero_orden,
                nombre_cliente: orden.nombre_cliente || '',
                estado_cliente: orden.estado_cliente || '',
                ciudad_cliente: orden.ciudad_cliente || '',
                nombre_beneficiario: orden.nombre_beneficiario || '',
                nombre_banco: orden.nombre_banco || '',
                numero_referencia: orden.numero_referencia || '',
                whatsapp: orden.telefono_cliente || '',
                telefono_cliente: orden.telefono_cliente || '',
                cantidad_boletos: orden.cantidad_boletos || 0,
                precio_unitario: parseFloat(orden.precio_unitario) || 0,
                subtotal: parseFloat(orden.subtotal) || 0,
                descuento: parseFloat(orden.descuento) || 0,
                boletos: boletosParsados,
                total: parseFloat(orden.total) || 0,
                tipo_pago: orden.metodo_pago || 'No especificado',
                metodo_pago: orden.metodo_pago || 'No especificado',
                detalles_pago: orden.detalles_pago || '',
                estado: orden.estado || 'pendiente',
                notas: orden.notas || '',
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
 * NO requiere JWT
 * 
 * Body: FormData con:
 * - comprobante (file): imagen JPG/PNG o PDF
 * - whatsapp (string): WhatsApp del cliente (validación de seguridad)
 * 
 * Respuesta:
 * - Éxito: { success: true, message: "Comprobante subido" }
 * - Error: { success: false, message: "..." }
 */
app.post('/api/public/ordenes-cliente/:numero_orden/comprobante', async (req, res) => {
    try {
        const { numero_orden } = req.params;
        // Obtener whatsapp de FormData (req.body cuando express-fileupload lo parsea)
        const whatsapp = req.body?.whatsapp;
        const archivo = req.files?.comprobante;

        console.log('[Comprobante Upload] Iniciando upload:', {
            numero_orden,
            whatsapp_received: !!whatsapp,
            archivo_received: !!archivo,
            archivo_mimetype: archivo?.mimetype,
            archivo_size: archivo?.size,
            req_files_keys: Object.keys(req.files || {}),
            req_body_keys: Object.keys(req.body || {})
        });

        // ===== VALIDACIONES =====

        // Orden ID es obligatorio
        if (!numero_orden || typeof numero_orden !== 'string' || numero_orden.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Número de orden inválido'
            });
        }

        // WhatsApp es obligatorio
        if (!whatsapp) {
            console.log('[Comprobante Upload] Error: WhatsApp no recibido');
            return res.status(400).json({
                success: false,
                message: 'WhatsApp es obligatorio'
            });
        }

        // Validar formato WhatsApp: solo dígitos, 10-12 caracteres
        const whatsappSanitizado = String(whatsapp).replace(/[^0-9]/g, '');
        if (whatsappSanitizado.length < 10 || whatsappSanitizado.length > 12) {
            return res.status(400).json({
                success: false,
                message: 'WhatsApp inválido'
            });
        }

        // Archivo es obligatorio
        if (!archivo) {
            console.log('[Comprobante Upload] Error: Archivo no recibido');
            return res.status(400).json({
                success: false,
                message: 'Archivo de comprobante es obligatorio'
            });
        }

        // Validar MIME type
        const TIPOS_VALIDOS = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!TIPOS_VALIDOS.includes(archivo.mimetype)) {
            return res.status(400).json({
                success: false,
                message: 'Tipo de archivo no permitido. Solo JPG, PNG o PDF'
            });
        }

        // Validar tamaño (máximo 5MB)
        const MAX_SIZE = 5 * 1024 * 1024;
        if (archivo.size > MAX_SIZE) {
            return res.status(413).json({
                success: false,
                message: `Archivo demasiado grande. Máximo 5MB. Tamaño actual: ${(archivo.size / 1024 / 1024).toFixed(2)}MB`
            });
        }

        // ===== VERIFICACIÓN DE SEGURIDAD =====

        // Buscar orden
        const orden = await db('ordenes')
            .where('numero_orden', numero_orden)
            .first();

        if (!orden) {
            log('warn', 'Intento de subir comprobante para orden inexistente', {
                numero_orden,
                ip: req.ip
            });
            return res.status(404).json({
                success: false,
                message: 'Orden no encontrada'
            });
        }

        // Verificar que el WhatsApp coincida con la orden (validación de propiedad)
        const whatsappEnBd = String(orden.telefono_cliente).replace(/[^0-9]/g, '');
        if (whatsappSanitizado !== whatsappEnBd) {
            log('warn', 'Intento de subir comprobante con WhatsApp no coincidente', {
                numero_orden,
                whatsapp_enviado: whatsappSanitizado,
                whatsapp_bd: whatsappEnBd,
                ip: req.ip
            });
            return res.status(403).json({
                success: false,
                message: 'No tienes permiso para subir comprobante a esta orden'
            });
        }

        // Verificar que el estado sea "pendiente"
        if (orden.estado !== 'pendiente') {
            log('warn', 'Intento de subir comprobante a orden no pendiente', {
                numero_orden,
                estado_actual: orden.estado,
                ip: req.ip
            });
            return res.status(400).json({
                success: false,
                message: `No puedes subir comprobante. La orden está en estado: ${orden.estado}`
            });
        }

        // ===== GUARDAR COMPROBANTE =====

        // Crear carpeta si no existe
        const carpetaComprobantes = path.join(__dirname, 'public', 'comprobantes');
        if (!fs.existsSync(carpetaComprobantes)) {
            fs.mkdirSync(carpetaComprobantes, { recursive: true });
        }

        // Generar nombre de archivo único y seguro
        const timestamp = Date.now();
        const extension = archivo.mimetype === 'application/pdf' ? 'pdf' : 'jpg';
        const nombreArchivo = `${numero_orden}_${timestamp}.${extension}`;
        const rutaArchivo = path.join(carpetaComprobantes, nombreArchivo);

        // Guardar archivo
        await archivo.mv(rutaArchivo);

        // Actualizar orden: cambiar estado a "comprobante_recibido" y guardar ruta del comprobante
        const rutaRelativa = `comprobantes/${nombreArchivo}`; // ruta relativa dentro de /public
        const timestampUTC = new Date().toISOString();  // Convertir a ISO string para BD
        await db('ordenes')
            .where('numero_orden', numero_orden)
            .update({
                estado: 'comprobante_recibido',
                comprobante_path: rutaRelativa,
                comprobante_fecha: timestampUTC,
                updated_at: timestampUTC
            });

        // Los caché de boletos se actualizarán automáticamente en el siguiente GET /api/public/boletos
        // No hay caché a invalidar aquí

        log('info', 'Comprobante subido exitosamente', {
            numero_orden,
            whatsapp: whatsappSanitizado,
            archivo: nombreArchivo,
            tamaño_mb: (archivo.size / 1024 / 1024).toFixed(2),
            ip: req.ip
        });

        return res.json({
            success: true,
            message: 'Comprobante subido exitosamente. Se revisará en breve',
            numero_orden
        });

    } catch (error) {
        console.error('[Comprobante Upload] Error capturado:', error);
        log('error', 'POST /api/public/ordenes-cliente/:numero_orden/comprobante error', {
            error: error.message,
            stack: error.stack,
            ip: req.ip
        });
        return res.status(500).json({
            success: false,
            message: 'Error al subir comprobante',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
        const { estado, limit = 50, offset = 0 } = req.query;
        
        let query = db('ordenes');
        
        if (estado) {
            query = query.where('estado', estado);
        }
        
        const total = await db('ordenes').count('* as count').first();
        const ordenes = await query
            .orderBy('created_at', 'desc')
            .limit(Math.min(parseInt(limit), 100))
            .offset(parseInt(offset));

        // Parsear boletos de cada orden - manejo seguro para PostgreSQL
        const ordenesParsadas = ordenes.map(o => {
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

        return res.json({
            success: true,
            data: ordenesParsadas,
            total: total.count,
            limit: parseInt(limit),
            offset: parseInt(offset)
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

        // Obtener total de boletos desde configuración
        const totalBoletos = 100000; // Valor desde configuración

        // Validar que el número está en rango
        if (numeroboleto < 1 || numeroboleto > totalBoletos) {
            return res.status(404).json({
                success: false,
                message: `Boleto fuera de rango (1-${totalBoletos})`
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
        
        // DEBUG: Mostrar qué datos se encontraron
        if (ordenEncontrada) {
            console.log(`🔍 Boleto #${numeroboleto} encontrado en orden ${ordenEncontrada.numero_orden}:`);
            console.log(`   - nombre_cliente: "${ordenEncontrada.nombre_cliente}"`);
            console.log(`   - apellido_cliente: "${ordenEncontrada.apellido_cliente}"`);
            console.log(`   - estado_cliente: "${ordenEncontrada.estado_cliente}"`);
            console.log(`   - ciudad_cliente: "${ordenEncontrada.ciudad_cliente}"`);
            console.log(`   - ciudad: "${ordenEncontrada.ciudad}"`);
        }

        // Devolver boleto vendido
        if (ordenEncontrada) {
            // Consolidar datos de ciudad - preferir ciudad_cliente, fallback a ciudad
            const ciudadFinal = ordenEncontrada.ciudad_cliente || ordenEncontrada.ciudad || '';
            const estadoFinal = ordenEncontrada.estado_cliente || '';
            
            return res.json({
                success: true,
                ok: true,
                data: {
                    numero: numeroboleto,
                    estado: ordenEncontrada.estado === 'confirmada' ? 'vendido' : 'reservado',
                    numero_orden: ordenEncontrada.numero_orden,
                    nombre_cliente: ordenEncontrada.nombre_cliente || '',
                    apellido_cliente: ordenEncontrada.apellido_cliente || '',
                    email: ordenEncontrada.email || '',
                    telefono: ordenEncontrada.telefono || '',
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
app.get('/api/public/boletos', async (req, res) => {
    try {
        const startTime = Date.now();

        // ⭐ MÁXIMA SIMPLIFICACIÓN: Solo usar el índice de estado para contar
        // Esto debería ser MUCHO más rápido en PostgreSQL
        const connection = await db.raw(`
            SELECT 
                COUNT(*) FILTER (WHERE estado = 'vendido') as vendidos,
                COUNT(*) FILTER (WHERE estado = 'reservado') as reservados
            FROM boletos_estado
        `);
        
        const result = connection.rows && connection.rows[0] ? connection.rows[0] : { vendidos: 0, reservados: 0 };
        const vendidos = parseInt(result.vendidos) || 0;
        const reservados = parseInt(result.reservados) || 0;

        // Traer las listas reales SOLO si es crítico
        const boletosNoDisponibles = await db('boletos_estado')
            .whereIn('estado', ['vendido', 'reservado'])
            .select('numero', 'estado')
            .timeout(20000);

        const sold = boletosNoDisponibles
            .filter(b => b.estado === 'vendido')
            .map(b => Number(b.numero))
            .sort((a, b) => a - b);
        
        const reserved = boletosNoDisponibles
            .filter(b => b.estado === 'reservado')
            .map(b => Number(b.numero))
            .sort((a, b) => a - b);

        const disponibles = 60000 - vendidos - reservados;
        const queryTime = Date.now() - startTime;
        
        const payload = {
            success: true,
            data: {
                sold,
                reserved
            },
            stats: {
                vendidos: vendidos,
                reservados: reservados,
                disponibles: disponibles,
                total: 60000,
                queryTime: queryTime
            }
        };

        if (queryTime > 1000 || Math.random() < 0.05) {
            console.log(`[PublicBoletos] Sold: ${vendidos}, Apartados: ${reservados}, Time: ${queryTime}ms`);
        }

        return res.json(payload);

    } catch (error) {
        console.error('GET /api/public/boletos error:', error.message);
        return res.json({
            success: false,
            message: 'Error temporal',
            data: { sold: [], reserved: [] },
            stats: {
                vendidos: 0, reservados: 0, disponibles: 60000, total: 60000
            }
        });
    }
});

/**
 * GET /api/admin/stats
 * Estadísticas del sistema (protegido con JWT)
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
 * GET /api/admin/boletos
 * Obtener lista detallada de boletos (protegido con JWT)
 */
app.get('/api/admin/boletos', verificarToken, async (req, res) => {
    try {
        const ordenes = await db('ordenes')
            .select('numero_orden', 'boletos', 'estado', 'nombre_cliente', 'telefono_cliente', 'created_at');

        // Obtener totalBoletos desde config.js
        const { obtenerConfigExpiracion } = require('./config-loader');
        const config = obtenerConfigExpiracion(); // O cargar desde config.js
        const totalBoletos = 100000; // Valor por defecto - puede obtener de config si lo necesita
        
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
                            estado: orden.estado.includes('confirmada') || orden.estado.includes('completada') ? 'vendido' : orden.estado.includes('pendiente') || orden.estado.includes('comprobante') ? 'reservado' : orden.estado,
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
 * Actualizar estado de una orden (protegido con JWT)
 * Usa transacción para garantizar consistencia en cambios de estado críticos
 * 
 * CRÍTICO: Cuando se confirma (confirmada), los boletos pasan a 'vendido'
 * Cuando se cancela, los boletos vuelven a 'disponible'
 * 
 * Body: { estado: 'confirmada' | 'cancelada' | 'pendiente' | 'completada' }
 */
app.patch('/api/ordenes/:id/estado', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        const estadosValidos = ['pendiente', 'confirmada', 'cancelada', 'completada'];
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
                                vendido_en: new Date(),
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
                                reservado_en: null,
                                vendido_en: null,
                                updated_at: new Date()
                            });
                        boletosActualizados += actualizado;
                    }
                    console.log(`[Orden ${id}] Cancelada: ${boletosActualizados} boletos devueltos a DISPONIBLE`);
                }
            }
            
            // Actualizar estado de orden dentro de transacción (atomic)
            await trx('ordenes')
                .where('numero_orden', id)
                .update({
                    estado: estado,
                    updated_at: new Date()
                });
            
            return { success: true, boletosActualizados };
        });

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
        const range = parseInt(req.query.range) || 7; // Últimos 7 días por defecto
        
        // Generar datos de tendencia de los últimos N días
        const stats = [];
        
        for (let i = range - 1; i >= 0; i--) {
            // Calcular la fecha en UTC (igual que en la BD)
            const fecha = new Date();
            fecha.setUTCDate(fecha.getUTCDate() - i);
            
            // Obtener fecha en formato YYYY-MM-DD (UTC)
            const year = fecha.getUTCFullYear();
            const month = String(fecha.getUTCMonth() + 1).padStart(2, '0');
            const day = String(fecha.getUTCDate()).padStart(2, '0');
            const fechaStr = `${year}-${month}-${day}`;
            
            // Obtener cantidad de boletos vendidos en esa fecha (Postgres)
            let query = db('ordenes')
                .whereIn('estado', ['confirmada', 'completada'])
                .where(db.raw(`to_char(created_at, 'YYYY-MM-DD') = ?`, [fechaStr]));
            
            const resultado = await query
                .select('cantidad_boletos', 'estado')
                .orderBy('created_at', 'asc');
            
            const boletosCount = resultado.reduce((sum, o) => sum + (o.cantidad_boletos || 0), 0);
            const ordenesCount = resultado.length;
            
            stats.push({
                fecha: fechaStr,
                boletos: boletosCount,
                ordenes: ordenesCount
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

        // Buscar la orden que contiene este boleto entre órdenes confirmadas/completadas
        const ordenes = await db('ordenes')
            .select('numero_orden', 'boletos', 'telefono_cliente', 'nombre_cliente', 'email')
            .whereIn('estado', ['confirmada', 'completada']);

        let ordenEncontrada = null;
        for (const orden of ordenes) {
            try {
                const arr = JSON.parse(orden.boletos || '[]').map(n => Number(n));
                if (arr.includes(Number(numero))) {
                    ordenEncontrada = orden;
                    break;
                }
            } catch (e) {
                // ignorar
            }
        }

        if (!ordenEncontrada) {
            return res.status(404).json({ success: false, message: 'Boleto no encontrado o no vendido' });
        }

        // Preparar payload para tabla ganadores
        const payload = {
            numero_orden: ordenEncontrada.numero_orden,
            numero_boleto: Number(numero) || null,
            whatsapp: ordenEncontrada.telefono_cliente || null,
            email: ordenEncontrada.email || null,
            nombre_ganador: ordenEncontrada.nombre_cliente || null,
            posicion: posicion || null,
            tipo_ganador: tipo_ganador || 'sorteo',
            premio: premio || null,
            valor_premio: valor_premio || null,
            fecha_sorteo: new Date(),
            estado: 'declarado'
        };

        // Insert directo usando returning (Postgres)
        const resp = await db('ganadores').insert(payload).returning('*');
        const creado = Array.isArray(resp) ? resp[0] : resp;

        return res.json({ success: true, message: 'Ganador declarado y guardado', ganador: creado });
    } catch (error) {
        console.error('POST /api/admin/declarar-ganador error:', error);
        return res.status(500).json({ success: false, message: 'Error al declarar ganador', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
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
        return res.json({ success: true, data: rows });
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
 * GET /api/admin/expiration-status [SIN AUTENTICACIÓN - MONITOREO]
 * Obtiene el estado del servicio de expiración (para scripts de monitoreo)
 * Usado por: backend/monitor-expiration.js
 */
app.get('/api/admin/expiration-status', async (req, res) => {
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
 * GET /api/admin/expiration-stats [SIN AUTENTICACIÓN - MONITOREO]
 * Obtiene estadísticas de órdenes en el sistema (para scripts de monitoreo)
 * Usado por: backend/monitor-expiration.js
 */
app.get('/api/admin/expiration-stats', async (req, res) => {
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
 * Resumen de órdenes por estado: pendiente, comprobante_recibido, cancelada, confirmada, completada
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
                    precioBoleto: PRECIO_BOLETO_DEFAULT
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
            // Buscar la orden que contiene este boleto
            const ordenes = await trx('ordenes')
                .select('numero_orden', 'boletos', 'estado', 'cantidad_boletos');

            for (const orden of ordenes) {
                try {
                    const numerosArr = JSON.parse(orden.boletos || '[]');
                    const index = numerosArr.indexOf(numBoleto);
                    
                    if (index !== -1) {
                        // Remover el boleto
                        numerosArr.splice(index, 1);
                        
                        // Si no quedan boletos, eliminar la orden; si no, actualizar
                        if (numerosArr.length === 0) {
                            await trx('ordenes').where('numero_orden', orden.numero_orden).delete();
                        } else {
                            await trx('ordenes')
                                .where('numero_orden', orden.numero_orden)
                                .update({
                                    boletos: JSON.stringify(numerosArr),
                                    cantidad_boletos: numerosArr.length,
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
 * Obtiene la configuración del cliente actual
 * No requiere autenticación (datos públicos)
 */
app.get('/api/cliente', (req, res) => {
    try {
        res.json({
            success: true,
            data: clienteConfig
        });
    } catch (error) {
        console.error('GET /api/cliente error:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo configuración del cliente',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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

        // Validar que sean números
        const numerosValidos = numeros.every(n => !isNaN(n) && n > 0);
        if (!numerosValidos) {
            return res.status(400).json({
                success: false,
                message: 'Todos los números deben ser enteros positivos'
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

        // ⭐ DINÁMICO: Leer totalBoletos del request body
        // Si no se proporciona, usar default de 60000
        let TOTAL = parseInt(req.body.totalBoletos) || 60000;
        
        // Validar que sea un número válido y razonable
        if (isNaN(TOTAL) || TOTAL < 1 || TOTAL > 10000000) {
            return res.status(400).json({
                success: false,
                message: 'totalBoletos debe ser un número entre 1 y 10,000,000',
                received: req.body.totalBoletos
            });
        }

        console.log(`🔄 Iniciando proceso de creación de boletos...`);
        console.log(`📊 Total a crear: ${TOTAL.toLocaleString()} boletos`);

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
        const inicio = boletosActuales + 1;
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
                for (let start = inicio; start <= TOTAL; start += LOTE) {
                    const end = Math.min(start + LOTE - 1, TOTAL);
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
 * Crea 1M boletos en la BD (ejecutar una sola vez)
 * REQUIERE autenticación admin
 * ⚠️ LENTO: Tarda ~5 minutos la primera vez
 */
app.post('/api/boletos/inicializar', verificarToken, async (req, res) => {
    try {
        const { totalBoletos } = req.body;
        const total = totalBoletos || 1000000;

        if (total < 1000 || total > 10000000) {
            return res.status(400).json({
                success: false,
                message: 'Total de boletos debe estar entre 1000 y 10M'
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
 * Libera boletos stuck en 'reservado' sin una orden válida
 * Solo para desarrollo/admin
 */
app.post('/api/admin/cleanup-boletos', async (req, res) => {
    try {
        console.log('\n🔧 [CLEANUP] Iniciando limpieza de boletos huérfanos...');

        // Paso 1: Contar cuántos hay
        const resultado = await db.raw(`
            SELECT COUNT(*) as total FROM boletos_estado
            WHERE estado = 'reservado'
            AND (
              numero_orden IS NULL
              OR NOT EXISTS (
                SELECT 1 FROM ordenes o 
                WHERE o.numero_orden = boletos_estado.numero_orden 
                AND o.estado IN ('pendiente', 'comprobante_recibido', 'confirmada')
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
                reservado_en = NULL,
                updated_at = NOW()
            WHERE estado = 'reservado'
            AND (
              numero_orden IS NULL
              OR NOT EXISTS (
                SELECT 1 FROM ordenes o 
                WHERE o.numero_orden = boletos_estado.numero_orden 
                AND o.estado IN ('pendiente', 'comprobante_recibido', 'confirmada')
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

// Iniciar servidor
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`🚀 Servidor RifaPlus corriendo en puerto ${PORT}`);
    console.log(`📍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    
    // Iniciar servicio de expiración de órdenes
    ordenExpirationService.iniciar(INTERVALO_LIMPIEZA_MINUTOS, TIEMPO_APARTADO_HORAS);
});
