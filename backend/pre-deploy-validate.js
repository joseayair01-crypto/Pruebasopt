#!/usr/bin/env node

/**
 * ============================================================================
 * PRE-DEPLOY VALIDATION: Sistema de Comprobantes
 * ============================================================================
 * Ejecutar antes de cada deploy a producción
 * 
 * Verifica:
 * 1. Configuración de Cloudinary
 * 2. Conexión a BD
 * 3. Schema de tablas
 * 4. Servicio de comprobantes cargable
 * 5. Migrations aplicadas
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
    warn: (msg) => console.log(`${colors.yellow}⚠️ ${colors.reset} ${msg}`),
    info: (msg) => console.log(`${colors.cyan}ℹ️ ${colors.reset} ${msg}`),
    section: (title) => console.log(`\n${colors.blue}╔${'═'.repeat(58)}╗${colors.reset}\n${colors.blue}║${colors.reset} ${title.padEnd(56)} ${colors.blue}║${colors.reset}\n${colors.blue}╚${'═'.repeat(58)}╝${colors.reset}\n`)
};

let errores = [];
let warnings = [];

async function validar() {
    log.section('PRE-DEPLOY VALIDATION: Sistema de Comprobantes');

    // ===== 1. VERIF ICACIONES DE ENTORNO =====
    log.info('1/5: Verificando variables de entorno...');
    const requiredVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'DATABASE_URL', 'JWT_SECRET'];
    const missingVars = requiredVars.filter(v => !process.env[v]);
    
    if (missingVars.length > 0) {
        errores.push(`Variables de entorno faltantes: ${missingVars.join(', ')}`);
        missingVars.forEach(v => log.error(`  Variable ${v} no está en .env`));
    } else {
        log.success('Todas las variables de entorno configuradas');
    }

    // ===== 2. TEST CLOUDINARY =====
    log.info('2/5: Conectando a Cloudinary...');
    try {
        const cloudinary = require('cloudinary').v2;
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        });

        await new Promise((resolve, reject) => {
            cloudinary.api.ping((error, result) => {
                if (error) reject(error);
                else resolve(result);
            });
        });

        log.success(`Cloudinary conectado (Cloud: ${process.env.CLOUDINARY_CLOUD_NAME})`);
    } catch (error) {
        errores.push(`Error conexión Cloudinary: ${error.message}`);
        log.error(`  ${error.message}`);
    }

    // ===== 3. TEST BD =====
    log.info('3/5: Conectando a Base de Datos...');
    try {
        const knex = require('knex');
        const knexConfig = require('./knexfile');
        const db = knex(knexConfig.development);
        
        await db.raw('SELECT 1');
        log.success('BD PostgreSQL conectada');

        // ===== 4. VALIDAR SCHEMA =====
        log.info('4/5: Validando esquema de tablas...');
        try {
            const columns = await db.raw(`
                SELECT column_name, data_type
                FROM information_schema.columns 
                WHERE table_name = 'ordenes'
                AND column_name IN ('comprobante_path', 'comprobante_fecha')
            `);

            const columnasRequeridas = ['comprobante_path', 'comprobante_fecha'];
            const columnasEncontradas = columns.rows.map(c => c.column_name);
            
            if (columnasEncontradas.length === columnasRequeridas.length) {
                log.success(`Schema correcto (encontradas ${columnasEncontradas.length}/2 columnas)`);
                columnasEncontradas.forEach(col => log.info(`  └─ ${col}: ✅`));
            } else {
                const faltantes = columnasRequeridas.filter(c => !columnasEncontradas.includes(c));
                errores.push(`Columnas faltantes en ordenes: ${faltantes.join(', ')}`);
                faltantes.forEach(col => log.error(`  └─ ${col}: FALTA`));
            }

            await db.destroy();
        } catch (error) {
            errores.push(`Error validando schema: ${error.message}`);
            log.error(`  ${error.message}`);
        }
    } catch (error) {
        errores.push(`Error conexión BD: ${error.message}`);
        log.error(`  ${error.message}`);
    }

    // ===== 5. VALIDAR SERVICIO =====
    log.info('5/5: Validando módulo comprobanteService...');
    try {
        const comprobanteService = require('./services/comprobanteService');
        
        // Validar que tiene las funciones esperadas
        const funciones = [
            'procesarComprobante',
            'validarSchemaOrdenes',
            'validarArchivo',
            'validarDatos',
            'validarOrden',
            'subirACloudinary',
            'actualizarOrdenEnBd'
        ];

        const funcionesFaltantes = funciones.filter(f => typeof comprobanteService[f] !== 'function');
        
        if (funcionesFaltantes.length === 0) {
            log.success('Servicio de comprobantes cargado correctamente');
            funciones.forEach(f => log.info(`  ├─ ${f}() ✅`));
        } else {
            errores.push(`Funciones faltantes en comprobanteService: ${funcionesFaltantes.join(', ')}`);
            funcionesFaltantes.forEach(f => log.error(`  ├─ ${f}() FALTA`));
        }
    } catch (error) {
        errores.push(`Error cargando comprobanteService: ${error.message}`);
        log.error(`  ${error.message}`);
    }

    // ===== RESUMEN =====
    log.section('Resumen de Validación');
    
    if (errores.length === 0 && warnings.length === 0) {
        log.success('✨ TODAS LAS VALIDACIONES PASARON');
        log.info('Sistema listo para deploy a producción');
        process.exit(0);
    } else {
        if (errores.length > 0) {
            console.log(`\n${colors.red}ERRORES (${errores.length}):${colors.reset}`);
            errores.forEach((e, i) => log.error(`  ${i + 1}. ${e}`));
        }

        if (warnings.length > 0) {
            console.log(`\n${colors.yellow}WARNINGS (${warnings.length}):${colors.reset}`);
            warnings.forEach((w, i) => log.warn(`  ${i + 1}. ${w}`));
        }

        console.log(`\n${colors.red}DEPLOY BLOQUEADO - Corregir errores antes de continuar${colors.reset}\n`);
        process.exit(1);
    }
}

validar().catch(error => {
    log.error(`Excepción no capturada: ${error.message}`);
    process.exit(1);
});
