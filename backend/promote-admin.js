#!/usr/bin/env node

/**
 * ============================================================================
 * FIX: Establecer usuario admin como Administrador (no Gestor)
 * ============================================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const knex = require('knex');
const knexConfig = require('./knexfile');

const db = knex(knexConfig.development);

async function fixAdminRole() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   FIX: Promocionar admin a Administrador                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Conectar a BD
    console.log('🔗 Conectando a PostgreSQL...');
    await db.raw('SELECT 1');
    console.log('✅ Conectado\n');

    // Verificar usuario actual
    console.log('👤 Buscando usuario admin...');
    const usuario = await db('admin_users')
      .where('username', 'admin')
      .first();

    if (!usuario) {
      console.error('❌ Usuario admin no encontrado\n');
      process.exit(1);
    }

    console.log(`✅ Usuario encontrado`);
    console.log(`   - Username: ${usuario.username}`);
    console.log(`   - Rol actual: ${usuario.rol}\n`);

    // Actualizar rol a administrador
    console.log('⏫ Promocionando a Administrador...');
    await db('admin_users')
      .where('username', 'admin')
      .update({
        rol: 'administrador',
        updated_at: new Date()
      });

    console.log('✅ Rol actualizado\n');

    // Verificar
    const usuarioActualizado = await db('admin_users')
      .where('username', 'admin')
      .first();

    console.log('🔍 Verificando cambios...');
    console.log(`   - Username: ${usuarioActualizado.username}`);
    console.log(`   - Rol nuevo: ${usuarioActualizado.rol}`);
    console.log(`   - Email: ${usuarioActualizado.email}`);
    console.log(`   - Activo: ${usuarioActualizado.activo ? 'SI' : 'NO'}\n`);

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   ✅ USUARIO ADMIN PROMOCIONADO A ADMINISTRADOR           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📌 Ahora el usuario admin tiene acceso a:');
    console.log('   ✓ Dashboard de Administración');
    console.log('   ✓ Gestión de Órdenes');
    console.log('   ✓ Panel de Configuración');
    console.log('   ✓ Ver todas las opciones de admin\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

fixAdminRole();
