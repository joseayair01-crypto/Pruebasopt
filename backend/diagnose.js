#!/usr/bin/env node

/**
 * ============================================================================
 * DIAGNÓSTICO PROFESIONAL DEL BACKEND - RIFAPLUS
 * Script que identifica y soluciona problemas de arranque
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Colores para terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

const log = {
  error: (msg) => console.error(`${colors.red}❌${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ️${colors.reset} ${msg}`),
  step: (num, msg) => console.log(`\n${colors.bright}📋 [${num}/8] ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.bright}${colors.blue}╔════════════════════════════════════════════════════════════╗${colors.reset}
${colors.bright}${colors.blue}║ ${msg.padEnd(58)}║${colors.reset}
${colors.bright}${colors.blue}╚════════════════════════════════════════════════════════════╝${colors.reset}`),
};

// Variables globales
let diagnosticoPasado = true;

async function runDiagnostic() {
  log.header('DIAGNÓSTICO PROFESIONAL - BACKEND RIFAPLUS');

  // ============================================================================
  // 1️⃣  VERIFICAR NODE.JS Y NPM
  // ============================================================================
  log.step(1, 'Verificando Node.js y npm');
  try {
    const nodeVersion = require('child_process').execSync('node -v', { encoding: 'utf8' }).trim();
    const npmVersion = require('child_process').execSync('npm -v', { encoding: 'utf8' }).trim();
    log.success(`Node.js: ${nodeVersion}`);
    log.success(`npm: ${npmVersion}`);
  } catch (e) {
    log.error('No se pudo verificar Node.js/npm');
    diagnosticoPasado = false;
  }

  // ============================================================================
  // 2️⃣  VERIFICAR DEPENDENCIAS
  // ============================================================================
  log.step(2, 'Verificando dependencias instaladas');
  const criticalDeps = ['express', 'knex', 'pg', 'dotenv', 'jsonwebtoken'];
  let depsOk = true;

  for (const dep of criticalDeps) {
    const depPath = path.join(__dirname, 'node_modules', dep);
    if (fs.existsSync(depPath)) {
      log.success(`${dep}`);
    } else {
      log.error(`${dep} - FALTA`);
      depsOk = false;
      diagnosticoPasado = false;
    }
  }

  if (!depsOk) {
    log.warn('Instalando dependencias faltantes...');
    await executeCommand('npm', ['install'], {
      cwd: __dirname,
      stdio: 'pipe'
    });
    log.success('Dependencias instaladas');
  }

  // ============================================================================
  // 3️⃣  VERIFICAR .ENV
  // ============================================================================
  log.step(3, 'Verificando configuración (.env)');
  const envPath = path.join(__dirname, '.env');
  
  if (!fs.existsSync(envPath)) {
    log.error('.env no encontrado');
    log.info('Copia .env.example a .env y configura las variables');
    diagnosticoPasado = false;
  } else {
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    if (envContent.includes('JWT_SECRET=')) {
      log.success('JWT_SECRET configurado');
    } else {
      log.error('JWT_SECRET falta en .env');
      diagnosticoPasado = false;
    }
    
    if (envContent.includes('DATABASE_URL=')) {
      log.success('DATABASE_URL configurado');
    } else {
      log.error('DATABASE_URL falta en .env');
      diagnosticoPasado = false;
    }
    
    if (envContent.includes('CLOUDINARY')) {
      log.success('Cloudinary configurado');
    } else {
      log.warn('Cloudinary no configurado (opcional)');
    }
  }

  // ============================================================================
  // 4️⃣  VALIDAR SINTAXIS DE ARCHIVOS CRÍTICOS
  // ============================================================================
  log.step(4, 'Validando sintaxis de archivos críticos');
  const criticalFiles = ['server.js', 'db.js', 'knexfile.js'];
  
  for (const file of criticalFiles) {
    const filePath = path.join(__dirname, file);
    try {
      require(filePath);
      log.success(`${file}`);
    } catch (e) {
      log.error(`${file}: ${e.message.split('\n')[0]}`);
      diagnosticoPasado = false;
    }
  }

  // ============================================================================
  // 5️⃣  PROBAR CONEXIÓN A POSTGRESQL
  // ============================================================================
  log.step(5, 'Probando conectividad a PostgreSQL');
  
  try {
    // Usar dotenv para cargar variables
    require('dotenv').config({ path: envPath });
    
    const knex = require('knex');
    const knexConfig = require('./knexfile');
    const db = knex(knexConfig.development);
    
    await db.raw('SELECT 1');
    log.success('Conexión a PostgreSQL exitosa');
    db.destroy();
  } catch (e) {
    log.error(`No se puede conectar a PostgreSQL: ${e.message}`);
    log.info('Verifica:');
    log.info('  1. DATABASE_URL en .env es válido');
    log.info('  2. PostgreSQL está corriendo');
    log.info('  3. Credenciales de conexión son correctas');
    log.info('  4. Firewall/Red permite la conexión');
    diagnosticoPasado = false;
  }

  // ============================================================================
  // 6️⃣  VERIFICAR PERMISOS DE ARCHIVOS
  // ============================================================================
  log.step(6, 'Verificando permisos de archivos');
  const filesToCheck = ['.env', 'server.js', 'db.js'];
  
  for (const file of filesToCheck) {
    const filePath = path.join(__dirname, file);
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
      log.success(`${file} (lectura OK)`);
    } catch (e) {
      log.error(`${file}: No tiene permisos de lectura`);
      diagnosticoPasado = false;
    }
  }

  // ============================================================================
  // 7️⃣  VERIFICAR PUERTO 5001
  // ============================================================================
  log.step(7, 'Verificando disponibilidad del puerto 5001');
  
  try {
    const net = require('net');
    const server = net.createServer();
    
    await new Promise((resolve, reject) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          log.warn('Puerto 5001 ya está en uso');
          log.info('Terminando procesos anteriores...');
          reject(err);
        } else {
          reject(err);
        }
      });
      
      server.once('listening', () => {
        server.close();
        resolve();
      });
      
      server.listen(5001, '127.0.0.1');
    });
    
    log.success('Puerto 5001 disponible');
  } catch (e) {
    log.warn('Puerto 5001 está ocupado, intentando liberar...');
    try {
      require('child_process').execSync('lsof -i :5001 | grep LISTEN | awk "{print $2}" | xargs kill -9 2>/dev/null', { shell: true });
      log.success('Puerto 5001 liberado');
    } catch (e2) {
      log.error('No se pudo liberar el puerto automáticamente');
      log.info('Ejecuta manualmente: lsof -i :5001 | grep LISTEN | awk "{print $2}" | xargs kill -9');
      diagnosticoPasado = false;
    }
  }

  // ============================================================================
  // 8️⃣  RESUMEN Y DECISIÓN
  // ============================================================================
  log.step(8, 'Resumen de diagnóstico');
  
  if (diagnosticoPasado) {
    log.success('Todos los diagnósticos pasaron ✅');
    log.header('INICIANDO SERVIDOR EN PUERTO 5001');
    
    // Iniciar servidor
    const servidor = spawn('node', ['server.js'], {
      cwd: __dirname,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'development'
      }
    });
    
    servidor.on('error', (err) => {
      log.error(`Error iniciando servidor: ${err.message}`);
      process.exit(1);
    });
    
    servidor.on('exit', (code) => {
      if (code !== 0) {
        log.error(`Servidor terminó con código: ${code}`);
        process.exit(code);
      }
    });
    
  } else {
    log.header('DIAGNÓSTICO FALLÓ ❌');
    console.log('\n' + colors.red + '⚠️  El servidor NO puede iniciarse hasta que corrijas los errores anteriores' + colors.reset);
    console.log('\n' + colors.yellow + '💡 Próximos pasos:' + colors.reset);
    console.log('   1. Lee los errores 🔴  arriba');
    console.log('   2. Soluciona cada problema');
    console.log('   3. Ejecuta este script nuevamente: node diagnose.js\n');
    process.exit(1);
  }
}

// Utilidad para ejecutar comandos
function executeCommand(cmd, args, options) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, options);
    let stdout = '';
    let stderr = '';
    
    if (proc.stdout) proc.stdout.on('data', (data) => { stdout += data; });
    if (proc.stderr) proc.stderr.on('data', (data) => { stderr += data; });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Command failed with code ${code}`));
      }
    });
    
    proc.on('error', reject);
  });
}

// Ejecutar diagnóstico
runDiagnostic().catch((err) => {
  log.error(`Error fatal: ${err.message}`);
  process.exit(1);
});
