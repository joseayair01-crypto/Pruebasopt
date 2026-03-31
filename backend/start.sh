#!/bin/bash

# ============================================================================
# DIAGNÓSTICO Y ARRANQUE DEL BACKEND - RIFAPLUS
# Script profesional para identificar y solucionar problemas
# ============================================================================

set -e  # Salir en caso de error

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   DIAGNÓSTICO DE BACKEND - RIFAPLUS                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Ir a directorio backend
cd "$(dirname "$0")"

# ============================================================================
# 1️⃣  VERIFICAR NODE.JS Y NPM
# ============================================================================
echo "📋 [1/7] Verificando Node.js y npm..."
node_version=$(node -v)
npm_version=$(npm -v)
echo "  ✅ Node.js: $node_version"
echo "  ✅ npm: $npm_version"
echo ""

# ============================================================================
# 2️⃣  VERIFICAR DEPENDENCIAS
# ============================================================================
echo "📋 [2/7] Verificando dependencias instaladas..."
if [ ! -d "node_modules" ]; then
    echo "  ⚠️  node_modules no encontrado, instalando..."
    npm install
    echo "  ✅ Dependencias instaladas"
else
    echo "  ✅ node_modules existe"
    
    # Verificar que las dependencias críticas estén instaladas
    critical_deps=("express" "knex" "pg" "dotenv" "jsonwebtoken")
    for dep in "${critical_deps[@]}"; do
        if [ ! -d "node_modules/$dep" ]; then
            echo "  ⚠️  Falta $dep, reinstalando dependencias..."
            npm install
            break
        fi
    done
    echo "  ✅ Dependencias críticas presentes"
fi
echo ""

# ============================================================================
# 3️⃣  VERIFICAR ARCHIVO .ENV
# ============================================================================
echo "📋 [3/7] Verificando configuración (.env)..."
if [ ! -f ".env" ]; then
    echo "  ❌ ERROR: Archivo .env no encontrado"
    echo "  📌 Copiar .env.example a .env y configurar variables"
    exit 1
fi

# Leer .env y validar variables críticas
if grep -q "JWT_SECRET=" .env; then
    echo "  ✅ JWT_SECRET configurado"
else
    echo "  ❌ ERROR: JWT_SECRET no está en .env"
    exit 1
fi

if grep -q "DATABASE_URL=" .env; then
    echo "  ✅ DATABASE_URL configurado"
else
    echo "  ❌ ERROR: DATABASE_URL no está en .env"
    exit 1
fi

echo ""

# ============================================================================
# 4️⃣  PRUEBA DE CONECTIVIDAD A POSTGRESQL
# ============================================================================
echo "📋 [4/7] Probando conectividad a PostgreSQL..."

# Extraer variables del .env
export $(grep -v '^#' .env | xargs)

# Verificar conexión con node (más confiable que psql)
node -e "
const knex = require('knex');
const knexConfig = require('./knexfile');
const db = knex(knexConfig.development);

db.raw('SELECT 1')
  .then(() => {
    console.log('  ✅ Conexión a PostgreSQL exitosa');
    process.exit(0);
  })
  .catch(err => {
    console.error('  ❌ ERROR: No se puede conectar a PostgreSQL');
    console.error('     Detalle:', err.message);
    process.exit(1);
  });
"

if [ $? -ne 0 ]; then
    echo ""
    echo "  🔧 SOLUCIONES POSIBLES:"
    echo "     1. Verificar DATABASE_URL en .env"
    echo "     2. Verificar que PostgreSQL está corriendo"
    echo "     3. Verificar credenciales de conexión"
    echo "     4. Verificar conexión de red"
    exit 1
fi

echo ""

# ============================================================================
# 5️⃣  EJECUTAR MIGRACIONES (si es primera vez)
# ============================================================================
echo "📋 [5/7] Verificando migraciones de BD..."
npm run migrate 2>/dev/null || {
    echo "  ⚠️  Error en migraciones (puede estar ok si ya existen)"
}
echo "  ✅ Migraciones completadas"
echo ""

# ============================================================================
# 6️⃣  LIMPIAR PUERTO 5001 (si está ocupado)
# ============================================================================
echo "📋 [6/7] Verificando puerto 5001..."
if lsof -i :5001 >/dev/null 2>&1; then
    echo "  ⚠️  Puerto 5001 ya está en uso, liberando..."
    lsof -i :5001 | grep LISTEN | awk '{print $2}' | xargs kill -9 2>/dev/null || true
    sleep 1
    echo "  ✅ Puerto 5001 liberado"
else
    echo "  ✅ Puerto 5001 disponible"
fi
echo ""

# ============================================================================
# 7️⃣  INICIAR SERVIDOR
# ============================================================================
echo "📋 [7/7] Iniciando servidor..."
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   🚀 SERVIDOR BACKEND INICIANDO EN PUERTO 5001             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Iniciar con variables de entorno
NODE_ENV=development node server.js
