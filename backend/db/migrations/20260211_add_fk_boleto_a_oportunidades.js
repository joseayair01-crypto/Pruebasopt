/**
 * Migración: Agregar FK de boletos a oportunidades
 * Esto vincula cada oportunidad a su boleto correspondiente
 * Permite que cuando se compra un boleto, sus oportunidades se actualicen automáticamente
 */

exports.up = function(knex) {
    return knex.schema.table('orden_oportunidades', (table) => {
        // Agregar columna numero_boleto
        table.integer('numero_boleto').nullable();
        
        // Agregar FK con CASCADE (importante para actualizar automáticamente)
        table.foreign('numero_boleto')
            .references('numero')
            .inTable('boletos_estado')
            .onUpdate('CASCADE')
            .onDelete('CASCADE');
        
        // Agregar índice para búsquedas rápidas
        table.index('numero_boleto');
    });
};

exports.down = function(knex) {
    return knex.schema.table('orden_oportunidades', (table) => {
        table.dropIndex('numero_boleto');
        table.dropForeign('numero_boleto');
        table.dropColumn('numero_boleto');
    });
};
