const path = require('path');

// ✅ AMBOS AMBIENTES USAN POSTGRESQL para consistencia dev/prod
const postgresConfig = {
  client: 'pg',
  connection: process.env.DATABASE_URL ? {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  } : {
    // Fallback a localhost si no hay DATABASE_URL (solo para desarrollo local)
    host: 'localhost',
    port: 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'rifaplus_dev'
  },
  migrations: {
    directory: './db/migrations'
  },
  seeds: {
    directory: './db/seeds'
  },
  // ⚠️ CRÍTICO: Configurar pool de conexiones para evitar "MaxClientsInSessionMode"
  // Vercel + Supabase en Session mode limita conexiones simultáneas
  pool: {
    min: 1,
    max: 3, // Vercel free tier soporta ~10 conexiones, pero Session mode limita
    acquireTimeoutMillis: 30000, // Esperar 30s si no hay conexión disponible
    idleTimeoutMillis: 30000,    // Cerrar conexiones inactivas después de 30s
    reapIntervalMillis: 1000     // Verificar conexiones cada 1s
  },
  asyncStackTraces: true // Para mejor debugging si hay errores
};

module.exports = {
  development: postgresConfig,
  production: postgresConfig
};
