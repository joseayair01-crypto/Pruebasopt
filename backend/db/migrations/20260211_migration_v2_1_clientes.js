/**
 * ============================================================
 * MIGRACIÓN V2: CREAR TABLA CLIENTES
 * ============================================================
 * 
 * Objetivo: Centralizar PII con encriptación
 * Tiempo: ~30 segundos
 * Rollback: Disponible
 */

exports.up = async function(knex) {
    // Verificar si tabla ya existe
    const exists = await knex.schema.hasTable('clientes');
    if (exists) {
        console.log('⚠️  Tabla "clientes" ya existe, saltando...');
        return;
    }

    console.log('📝 Creando tabla clientes...');

    return knex.schema.createTable('clientes', table => {
        // Primary key
        table.bigIncrements('id').primary();

        // Info personal
        table.string('nombre', 255).notNullable();
        table.string('apellido', 255).notNullable();
        
        // PII encriptado (BYTEA para guardar datos encriptados)
        // Nota: La encriptación ocurre en la aplicación (Cipher con AES-256)
        table.text('email_encriptado').nullable();  // Se encripta en APP antes de guardar
        table.text('telefono_encriptado').nullable();  // Se encripta en APP antes de guardar
        
        // Documento
        table.string('documento_tipo', 50).nullable();  // cedula, pasaporte, ruc, etc
        table.text('documento_numero_encriptado').nullable();
        
        // Ubicación
        table.string('pais', 100).nullable();
        table.string('estado_domicilio', 100).nullable();
        table.string('ciudad', 100).nullable();
        
        // GDPR Compliance
        table.boolean('consentimiento_politica_privacidad').notNullable().defaultTo(false);
        table.timestamp('consentimiento_fecha').nullable();
        table.string('consentimiento_ip', 45).nullable();  // IPv4 o IPv6
        
        // Flags
        table.boolean('reclamos_activos').defaultTo(false);
        table.integer('reclamos_count').defaultTo(0);
        table.boolean('bloqueado').defaultTo(false);
        table.text('motivo_bloqueo').nullable();
        
        // Timestamps
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.timestamp('deleted_at').nullable();  // Soft-delete
        
        // Auditoría
        table.bigInteger('creado_por_usuario_id').nullable();
        
        // Índices
        table.index('email_encriptado', 'idx_cliente_email');
        table.index('estado_domicilio', 'idx_cliente_estado');
        table.index('reclamos_activos', 'idx_cliente_reclamos');
        table.index('deleted_at', 'idx_cliente_soft_delete');
        
        // Constraint único
        table.unique('email_encriptado', 'uc_cliente_email');
    });
};

exports.down = async function(knex) {
    console.log('↩️  Eliminando tabla clientes...');
    return knex.schema.dropTableIfExists('clientes');
};
