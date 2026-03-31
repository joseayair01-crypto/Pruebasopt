/**
 * ============================================================
 * MIGRACIÓN V2: CREAR TABLA BOLETOS_ORDEN
 * ============================================================
 * 
 * Objetivo: Normalizar JSON de boletos
 * Relación N:N entre órdenes y boletos
 * Reemplaza almacenamiento JSON
 * 
 * Tiempo: ~2-3 minutos (transformación de 1M boletos)
 */

exports.up = async function(knex) {
    const exists = await knex.schema.hasTable('boletos_orden');
    if (exists) {
        console.log('⚠️  Tabla "boletos_orden" ya existe, saltando...');
        return;
    }

    console.log('📝 Creando tabla boletos_orden...');

    // 1. Crear tabla
    await knex.schema.createTable('boletos_orden', table => {
        table.bigIncrements('id').primary();

        // Identificación del boleto
        table.integer('numero_boleto').notNullable();

        // FK a orden
        table.bigInteger('orden_id').notNullable();
        table.foreign('orden_id')
            .references('id')
            .inTable('ordenes')
            .onDelete('CASCADE');  // Si se elimina orden, se eliminan boletos

        // Timestamp de asignación
        table.timestamp('asignado_en').defaultTo(knex.fn.now());

        // Timestamps de auditoría
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());

        // Índices críticos
        table.index('numero_boleto', 'idx_boleto_orden_numero');
        table.index('orden_id', 'idx_boleto_orden_id');

        // Constraint único: un boleto no puede estar en 2 órdenes
        table.unique(['numero_boleto', 'orden_id'], 'uc_boleto_orden_unico');
    });

    console.log('✅ Tabla boletos_orden creada');

    // 2. Migrar datos del JSON al nuevo formato
    console.log('📊 Transformando datos JSON → tabla normalizada...');
    
    // Usar raw query para comparar JSON correctamente en PostgreSQL
    const ordenes = await knex.raw(`
        SELECT id, boletos FROM ordenes 
        WHERE boletos IS NOT NULL 
        AND boletos::text <> '[]'::text
    `).then(result => result.rows);

    let boletosInsertados = 0;
    let ordenesConBoletos = 0;

    for (const orden of ordenes) {
        try {
            let boletos = [];
            
            // Parsear JSON (puede ser null, [], o array)
            if (typeof orden.boletos === 'string') {
                boletos = JSON.parse(orden.boletos);
            } else if (Array.isArray(orden.boletos)) {
                boletos = orden.boletos;
            }

            // Insertar cada boleto
            if (boletos.length > 0) {
                const boletosPorOrden = boletos.map(num => ({
                    numero_boleto: num,
                    orden_id: orden.id,
                    asignado_en: orden.created_at || knex.fn.now()
                }));

                await knex('boletos_orden').insert(boletosPorOrden);
                boletosInsertados += boletosPorOrden.length;
                ordenesConBoletos++;
            }
        } catch (err) {
            console.error(`⚠️  Error procesando orden ${orden.id}:`, err.message);
        }
    }

    console.log(`✅ Transformados: ${boletosInsertados} boletos de ${ordenesConBoletos} órdenes`);
};

exports.down = async function(knex) {
    console.log('↩️  Eliminando tabla boletos_orden...');
    return knex.schema.dropTableIfExists('boletos_orden');
};
