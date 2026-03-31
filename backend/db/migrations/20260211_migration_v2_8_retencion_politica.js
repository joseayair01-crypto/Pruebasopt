/**
 * ============================================================
 * MIGRACIÓN V2: CREAR TABLA POLÍTICA DE RETENCIÓN DE DATOS
 * ============================================================
 * 
 * Objetivo: Cumplir con GDPR "data minimization"
 * - Automáticamente limpiar datos antiguos
 * - Anonimizar PII después de período
 * - Auditar limpieza
 * 
 * GDPR Requisito: Datos no deben ser retenidos más de lo necesario
 * 
 * Tiempo: ~5 segundos
 */

exports.up = async function(knex) {
    const exists = await knex.schema.hasTable('datos_retencion_politica');
    if (exists) {
        console.log('⚠️  Tabla "datos_retencion_politica" ya existe, saltando...');
        return;
    }

    console.log('📝 Creando tabla de política de retención de datos...');

    await knex.schema.createTable('datos_retencion_politica', table => {
        table.bigIncrements('id').primary();

        // Tabla a la que aplica
        table.string('tabla_nombre', 100).notNullable().unique();

        // Política
        table.integer('dias_retencion').notNullable();  // Ej: 2555 (7 años)
        
        // Modo de eliminación
        table.enum('modo_eliminacion', ['delete', 'anonymize', 'archive'])
            .notNullable()
            .defaultTo('delete');
        
        // Descripción
        table.text('descripcion').nullable();

        // Control
        table.boolean('activo').notNullable().defaultTo(true);

        // Auditoría de limpieza
        table.timestamp('last_cleanup_at').nullable();
        table.integer('registros_limpiados').defaultTo(0);

        // Timestamps
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());

        // Índices
        table.index('tabla_nombre', 'idx_retencion_tabla');
        table.index('activo', 'idx_retencion_activo');
    });

    // Insertar políticas por defecto (GDPR compliant)
    console.log('  → Insertando políticas de retención por defecto...');

    const policies = [
        {
            tabla_nombre: 'ordenes',
            dias_retencion: 2555,  // 7 años
            modo_eliminacion: 'delete',
            descripcion: 'GDPR: Retener órdenes por 7 años (legal-financiero)'
        },
        {
            tabla_nombre: 'ganadores',
            dias_retencion: 2555,  // 7 años
            modo_eliminacion: 'delete',
            descripcion: 'Retener ganadores por 7 años (auditoría)'
        },
        {
            tabla_nombre: 'clientes',
            dias_retencion: 1095,  // 3 años
            modo_eliminacion: 'anonymize',
            descripcion: 'GDPR: Anonimizar PII después de 3 años'
        },
        {
            tabla_nombre: 'auditoría_logs',
            dias_retencion: 1825,  // 5 años
            modo_eliminacion: 'delete',
            descripcion: 'Retener logs por 5 años (compliance)'
        },
        {
            tabla_nombre: 'ordenes_expiradas_log',
            dias_retencion: 1095,  // 3 años
            modo_eliminacion: 'delete',
            descripcion: 'Retener logs de liberación por 3 años'
        }
    ];

    for (const policy of policies) {
        const exists = await knex('datos_retencion_politica')
            .where('tabla_nombre', policy.tabla_nombre)
            .first();
        
        if (!exists) {
            await knex('datos_retencion_politica').insert(policy);
        }
    }

    console.log('✅ Tabla datos_retencion_politica creada con políticas por defecto');
};

exports.down = async function(knex) {
    console.log('↩️  Eliminando tabla datos_retencion_politica...');
    return knex.schema.dropTableIfExists('datos_retencion_politica');
};
