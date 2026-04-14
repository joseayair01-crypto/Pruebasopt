#!/usr/bin/env node

/**
 * ============================================================================
 * RESETEAR CREDENCIALES DE ADMIN
 * Script para restablecer usuario/contraseña de administrador
 * ============================================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const knex = require('knex');
const knexConfig = require('./knexfile');
const bcrypt = require('bcryptjs');

const db = knex(knexConfig.development);

async function resetearAdmin() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   RESETEAR CREDENCIALES DE ADMIN                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Verificar conexión a BD
    console.log('🔗 Conectando a PostgreSQL...');
    await db.raw('SELECT 1');
    console.log('✅ Conectado a PostgreSQL\n');

    // Verificar que tabla admin_users existe
    console.log('📋 Verificando tabla admin_users...');
    const hasTable = await db.schema.hasTable('admin_users');
    if (!hasTable) {
      console.log('❌ Tabla admin_users no existe');
      console.log('   Ejecuta: npm run migrate');
      process.exit(1);
    }
    console.log('✅ Tabla admin_users existe\n');

    // Credenciales por defecto
    const defaultUsername = 'admin';
    const defaultPassword = 'admin123';
    const defaultRol = 'administrador';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    console.log('🔐 Reseteando credenciales de admin...');
    console.log(`   Usuario: ${defaultUsername}`);
    console.log(`   Contraseña: ${defaultPassword}\n`);
    console.log(`   Rol: ${defaultRol}\n`);

    // Verificar si existe el usuario
    const usuarioExistente = await db('admin_users')
      .where('username', defaultUsername)
      .first();

    let resultado;
    if (usuarioExistente) {
      // Actualizar usuario existente
      console.log('📝 Usuario encontrado, actualizando...');
      resultado = await db('admin_users')
        .where('username', defaultUsername)
        .update({
          password_hash: hashedPassword,
          rol: defaultRol,
          updated_at: new Date()
        });
      console.log(`✅ Usuario ${defaultUsername} actualizado\n`);
    } else {
      // Crear nuevo usuario
      console.log('➕ Usuario no encontrado, creando...');
      resultado = await db('admin_users').insert({
        username: defaultUsername,
        password_hash: hashedPassword,
        email: 'admin@rifaplus.local',
        rol: defaultRol,
        activo: true,
        created_at: new Date(),
        updated_at: new Date()
      });
      console.log(`✅ Usuario ${defaultUsername} creado\n`);
    }

    // Verificar que funciona
    console.log('🧪 Verificando credenciales...');
    const usuarioVerificado = await db('admin_users')
      .where('username', defaultUsername)
      .first();

    if (usuarioVerificado) {
      console.log('✅ Credenciales verificadas correctamente\n');

      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║   ✅ CREDENCIALES RESETEADAS EXITOSAMENTE                 ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');

      console.log('📌 Próximos pasos:');
      console.log(`   1. Abre: http://localhost:3000/admin-dashboard.html`);
      console.log(`   2. Usuario: ${defaultUsername}`);
      console.log(`   3. Contraseña: ${defaultPassword}`);
      console.log(`\n⚠️  IMPORTANTE: Cambia tu contraseña después del primer login\n`);

      process.exit(0);
    } else {
      console.log('❌ Error: No se pudo verificar el usuario\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 Soluciones posibles:');
    console.error('   1. Verifica que PostgreSQL está corriendo');
    console.error('   2. Verifica DATABASE_URL en .env');
    console.error('   3. Ejecuta: npm run migrate');
    console.error('   4. Ejecuta: npm run seed');
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

resetearAdmin();
