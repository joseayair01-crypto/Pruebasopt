const path = require('path');

const migrationsDirectory = process.env.KNEX_MIGRATIONS_DIR
  ? path.resolve(__dirname, process.env.KNEX_MIGRATIONS_DIR)
  : path.resolve(__dirname, './db/migrations');

// ✅ AMBOS AMBIENTES USAN POSTGRESQL para consistencia dev/prod
const postgresConfig = {
  client: 'pg',
  connection: (() => {
    if (process.env.DATABASE_URL) {
      // Parsear DATABASE_URL para extraer componentes y agregar SSL
      const url = new URL(process.env.DATABASE_URL);
      return {
        host: url.hostname,
        port: url.port || 5432,
        user: url.username,
        password: decodeURIComponent(url.password),
        database: url.pathname.slice(1), // Remover el /
        ssl: { rejectUnauthorized: false } // CRÍTICO: Permitir Supabase
      };
    } else {
      // Fallback a localhost si no hay DATABASE_URL (solo para desarrollo local)
      return {
        host: 'localhost',
        port: 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'rifaplus_dev'
      };
    }
  })(),
  migrations: {
    directory: migrationsDirectory
  },
  seeds: {
    directory: './db/seeds'
  },
  // ⚠️ CRÍTICO: Configurar pool de conexiones para Neon (mejor que Supabase Free)
  // Neon: Soporta múltiples conexiones simultáneas sin límite severo
  // Pool recomendado: 2-10 conexiones (Neon pooler es generoso)
  pool: {
    min: 2,                       // Mínimo 2 conexiones
    max: 15,                      // Máximo 15 para dar más aire en picos sin sobrecargar Supabase Free
    acquireTimeoutMillis: 30000,  // Esperar 30s si no hay conexión disponible
    idleTimeoutMillis: 30000,     // Cerrar conexiones inactivas después de 30s
    reapIntervalMillis: 1000      // Verificar conexiones cada 1s
  },
  asyncStackTraces: true // Para mejor debugging si hay errores
};

module.exports = {
  development: postgresConfig,
  production: postgresConfig
};
