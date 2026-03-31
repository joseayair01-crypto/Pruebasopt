#!/usr/bin/env node

/**
 * ============================================================================
 * FIX: Agregar columnas faltantes comprobante_path y comprobante_fecha
 * ============================================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const knex = require('knex');
const knexConfig = require('./knexfile');

const db = knex(knexConfig.development);

async function fixColumns() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   FIX: Agregar columnas comprobante_path/comprobante_fecha ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Conectar a BD
    console.log('🔗 Conectando a PostgreSQL...');
    await db.raw('SELECT 1');
    console.log('✅ Conectado\n');

    // Verificar columnas en tabla ordenes
    console.log('📋 Consultando estructura de tabla ordenes...');
    const columns = await db.raw(`
      SELECT column_name, data_type
      FROM information_schema.columns 
      WHERE table_name = 'ordenes'
      ORDER BY ordinal_position
    `);

    const columnNames = columns.rows.map(c => c.column_name);
    console.log(`   Columnas existentes: ${columnNames.join(', ')}\n`);

    // Verificar si falta comprobante_path
    if (!columnNames.includes('comprobante_path')) {
      console.log('➕ Agregando columna comprobante_path...');
      await db.schema.table('ordenes', (table) => {
        table.string('comprobante_path').nullable();
      });
      console.log('   ✅ comprobante_path agregada\n');
    } else {
      console.log('✅ comprobante_path ya existe\n');
    }

    // Verificar si falta comprobante_fecha
    if (!columnNames.includes('comprobante_fecha')) {
      console.log('➕ Agregando columna comprobante_fecha...');
      await db.schema.table('ordenes', (table) => {
        table.timestamp('comprobante_fecha').nullable();
      });
      console.log('   ✅ comprobante_fecha agregada\n');
    } else {
      console.log('✅ comprobante_fecha ya existe\n');
    }

    // Verificar si falta comprobante_path (URL de Cloudinary)
    // En algunas versiones podría ser string(500) para URLs largas
    console.log('🔍 Verificando que las columnas sean del tipo correcto...');
    const revisarColumnas = await db.raw(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'ordenes'
      AND column_name IN ('comprobante_path', 'comprobante_fecha')
    `);

    revisarColumnas.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''}`);
    });

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   ✅ COLUMNAS AGREGADAS EXITOSAMENTE                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

fixColumns();
