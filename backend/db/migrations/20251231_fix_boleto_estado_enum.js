/**
 * Migración: Fix boleto estado enum
 * 
 * NOTA: Por ahora esta migración no hace nada.
 * Estamos usando 'reservado' en el código que coincide con el enum de PostgreSQL.
 * Cuando podamos hacer cambios de enum en Render, haremos la conversión a 'apartado'.
 */

exports.up = async function(knex) {
    console.log('✅ Migración preparada (sin cambios por ahora)');
};

exports.down = async function(knex) {
    console.log('⬅️  Migración revertida');
};
