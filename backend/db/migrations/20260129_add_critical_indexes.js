/**
 * MIGRACIÓN: Crear índices críticos para escala (FASE 3)
 * 
 * Optimizaciones para queries frecuentes bajo carga:
 * 1. Índice compuesto: orden_oportunidades (numero_orden, estado)
 * 2. Índice compuesto: orden_oportunidades (estado, numero_orden)
 * 3. Índice simple: orden_oportunidades (numero_oportunidad)
 * 4. Índice compuesto: boletos_estado (numero_orden, estado)
 * 5. Índice simple: boletos_estado (estado)
 * 
 * Beneficio esperado: -80% tiempo de query bajo carga
 */

exports.up = async (knex) => {
    console.log('📊 [Migración] Creando índices críticos para escala...');
    
    try {
        // ✅ ÍNDICE 1: orden_oportunidades - búsqueda por numero_orden Y estado
        // Usado en: guardarOportunidades(), liberarOportunidades()
        await knex.raw(`
            CREATE INDEX IF NOT EXISTS idx_opp_numero_orden_estado 
            ON orden_oportunidades(numero_orden, estado);
        `);
        console.log('   ✅ idx_opp_numero_orden_estado creado');

        // ✅ ÍNDICE 2: orden_oportunidades - búsqueda por estado Y numero_orden (orden inverso)
        // Optimiza queries WHERE estado='disponible' AND numero_orden IS NULL
        await knex.raw(`
            CREATE INDEX IF NOT EXISTS idx_opp_estado_numero_orden 
            ON orden_oportunidades(estado, numero_orden);
        `);
        console.log('   ✅ idx_opp_estado_numero_orden creado');

        // ✅ ÍNDICE 3: orden_oportunidades - búsqueda por numero_oportunidad
        // Usado en: whereIn('numero_oportunidad', [array])
        await knex.raw(`
            CREATE INDEX IF NOT EXISTS idx_opp_numero_oportunidad 
            ON orden_oportunidades(numero_oportunidad);
        `);
        console.log('   ✅ idx_opp_numero_oportunidad creado');

        // ✅ ÍNDICE 4: boletos_estado - búsqueda por numero_orden Y estado
        // Usado en: liberarBoletos(), actualizaciones de boletos
        await knex.raw(`
            CREATE INDEX IF NOT EXISTS idx_boletos_numero_orden_estado 
            ON boletos_estado(numero_orden, estado);
        `);
        console.log('   ✅ idx_boletos_numero_orden_estado creado');

        // ✅ ÍNDICE 5: boletos_estado - búsqueda por estado
        // Usado en: queries de disponibilidad
        await knex.raw(`
            CREATE INDEX IF NOT EXISTS idx_boletos_estado 
            ON boletos_estado(estado);
        `);
        console.log('   ✅ idx_boletos_estado creado');

        // ✅ ÍNDICE 6: ordenes - para acceso por numero_orden (FK)
        await knex.raw(`
            CREATE INDEX IF NOT EXISTS idx_ordenes_numero_orden 
            ON ordenes(numero_orden);
        `);
        console.log('   ✅ idx_ordenes_numero_orden creado');

        console.log('✅ Todos los índices críticos creados exitosamente');
    } catch (error) {
        console.error('❌ Error creando índices:', error.message);
        throw error;
    }
};

exports.down = async (knex) => {
    console.log('🔄 [Migración] Eliminando índices críticos...');
    
    try {
        await knex.raw('DROP INDEX IF EXISTS idx_opp_numero_orden_estado CASCADE;');
        await knex.raw('DROP INDEX IF EXISTS idx_opp_estado_numero_orden CASCADE;');
        await knex.raw('DROP INDEX IF EXISTS idx_opp_numero_oportunidad CASCADE;');
        await knex.raw('DROP INDEX IF EXISTS idx_boletos_numero_orden_estado CASCADE;');
        await knex.raw('DROP INDEX IF EXISTS idx_boletos_estado CASCADE;');
        await knex.raw('DROP INDEX IF EXISTS idx_ordenes_numero_orden CASCADE;');
        console.log('✅ Índices eliminados');
    } catch (error) {
        console.error('❌ Error eliminando índices:', error.message);
        throw error;
    }
};
