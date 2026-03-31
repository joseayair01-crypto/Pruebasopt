#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const knex = require('knex');
const knexConfig = require('./knexfile');

const db = knex(knexConfig.development);

async function checkAdmin() {
  try {
    await db.raw('SELECT 1');
    
    const usuario = await db('admin_users').where('username', 'admin').first();
    
    console.log('\n📋 Usuario Admin en BD:');
    console.log(JSON.stringify(usuario, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

checkAdmin();
