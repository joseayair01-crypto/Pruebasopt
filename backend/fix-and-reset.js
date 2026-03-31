#!/usr/bin/env node

/**
 * ============================================================================
 * FIX: Agregar columna password a admin_users si no existe
 * ============================================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const knex = require('knex');
const knexConfig = require('./knexfile');
const bcrypt = require('bcryptjs');

const db = knex(knexConfig.development);

async function fixAndReset() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   FIX: Agregar columna password + Resetear admin           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Conectar a BD
    console.log('🔗 Conectando a PostgreSQL...');
    await db.raw('SELECT 1');
    console.log('✅ Conectado\n');

    // Verificar si columna password existe
    console.log('📋 Verificando estructura de tabla admin_users...');
    const columns = await db.raw(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'admin_users'
    `);
    
    const columnNames = columns.rows.map(c => c.column_name);
    console.log(`   Columnas encontradas: ${columnNames.join(', ')}`);

    // Si no existe password, agregarla
    if (!columnNames.includes('password')) {
      console.log('\n⚠️  Columna password no existe, agregando...');
      await db.schema.table('admin_users', (table) => {
        table.string('password', 255).notNullable().defaultTo('');
      });
      console.log('✅ Columna password agregada\n');
    } else {
      console.log('✅ Columna password ya existe\n');
    }

    // Ahora resetear credenciales
    console.log('🔐 Reseteando credenciales de admin...');
    const defaultUsername = 'admin';
    const defaultPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const usuarioExistente = await db('admin_users')
      .where('username', defaultUsername)
      .first();

    if (usuarioExistente) {
      console.log('   📝 Usuario encontrado, actualizando...');
      await db('admin_users')
        .where('username', defaultUsername)
        .update({
          password: hashedPassword,
          updated_at: new Date()
        });
      console.log(`   ✅ Usuario ${defaultUsername} actualizado\n`);
    } else {
      console.log('   ➕ Usuario no encontrado, creando...');
      await db('admin_users').insert({
        username: defaultUsername,
        password: hashedPassword,
        email: 'admin@rifaplus.local',
        rol: 'admin',
        activo: true,
        created_at: new Date(),
        updated_at: new Date()
      });
      console.log(`   ✅ Usuario ${defaultUsername} creado\n`);
    }

    // Verificar
    console.log('🧪 Verificando...');
    const usuario = await db('admin_users')
      .where('username', defaultUsername)
      .first();

    if (usuario && usuario.password) {
      console.log('✅ Contraseña guardada correctamente\n');

      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║   ✅ CREDENCIALES RESETEADAS EXITOSAMENTE                 ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');

      console.log('📌 Te puede iniciar sesión con:');
      console.log(`   Usuario: ${defaultUsername}`);
      console.log(`   Contraseña: ${defaultPassword}`);
      console.log(`   URL: http://localhost:3000/admin-dashboard.html\n`);

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

fixAndReset();
