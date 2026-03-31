#!/usr/bin/env node

/**
 * ============================================================================
 * CLEANUP: Eliminar columna password duplicada y usar password_hash existente
 * ============================================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const knex = require('knex');
const knexConfig = require('./knexfile');
const bcrypt = require('bcryptjs');

const db = knex(knexConfig.development);

async function cleanup() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   CLEANUP: Eliminar password duplicada + usar password_hash║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Conectar a BD
    console.log('🔗 Conectando a PostgreSQL...');
    await db.raw('SELECT 1');
    console.log('✅ Conectado\n');

    // Verificar columnas
    console.log('📋 Verificando estructura de tabla admin_users...');
    const columns = await db.raw(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'admin_users'
      ORDER BY ordinal_position
    `);
    
    const columnNames = columns.rows.map(c => c.column_name);
    console.log(`   Columnas: ${columnNames.join(', ')}\n`);

    // Eliminar columna password si existe (la que agregué por error)
    if (columnNames.includes('password')) {
      console.log('🗑️  Eliminando columna password duplicada...');
      await db.schema.table('admin_users', (table) => {
        table.dropColumn('password');
      });
      console.log('✅ Columna password eliminada\n');
    }

    // Ahora actualizar password_hash (que ya existía)
    console.log('🔐 Actua password_hash del usuario admin...');
    const defaultUsername = 'admin';
    const defaultPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    await db('admin_users')
      .where('username', defaultUsername)
      .update({
        password_hash: hashedPassword,
        updated_at: new Date()
      });
    
    console.log(`✅ password_hash de admin actualizado\n`);

    // Verificar
    console.log('🧪 Verificando resultado final...');
    const usuario = await db('admin_users')
      .where('username', defaultUsername)
      .first();

    if (usuario && usuario.password_hash) {
      console.log('✅ Stock actualizada correctamente\n');

      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║   ✅ ARREGLADO: Solo password_hash, credenciales OK       ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');

      console.log('📌 Puedes iniciar sesión con:');
      console.log(`   Usuario: ${defaultUsername}`);
      console.log(`   Contraseña: ${defaultPassword}\n`);

      process.exit(0);
    } else {
      console.log('❌ Error: No se pudo verificar\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

cleanup();
