/**
 * ============================================================
 * MIGRACIÓN V2: CREAR TABLA AUDITORÍA_LOGS
 * ============================================================
 * 
 * Objetivo: Implementar auditoría completa (ISO 27001)
 * - Quién hizo qué
 * - Cuándo
 * - Desde dónde
 * - Qué cambió
 * 
 * Crítico para: GDPR, Compliance Bancaria, Forense
 * 
 * Tiempo: ~10 segundos
 */

exports.up = async function(knex) {
    const exists = await knex.schema.hasTable('auditoría_logs');
    if (exists) {
        console.log('⚠️  Tabla "auditoría_logs" ya existe, saltando...');
        return;
    }

    console.log('📝 Creando tabla auditoría_logs...');

    return knex.schema.createTable('auditoría_logs', table => {
        table.bigIncrements('id').primary();

        // ============= IDENTIDAD =============
        // Quién hizo la acción
        table.bigInteger('usuario_id').notNullable();
        table.foreign('usuario_id')
            .references('id')
            .inTable('admin_users')
            .onDelete('RESTRICT');  // Nunca eliminar usuario si hay logs

        // ============= ACCIÓN =============
        // Qué acción realizó
        table.string('accion', 50).notNullable();  // CREATE, UPDATE, DELETE, READ
        
        // Qué tabla afectó
        table.string('tabla_afectada', 100).notNullable();
        
        // Qué registro específico
        table.bigInteger('registro_id').nullable();

        // ============= CAMBIOS =============
        // Valores antes del cambio (para auditar cambios)
        table.jsonb('valores_anteriores').nullable();
        
        // Valores después del cambio
        table.jsonb('valores_nuevos').nullable();

        // ============= CONTEXTO =============
        // Contexto del acceso
        table.string('ip_address', 45).nullable();  // IPv4 o IPv6
        table.text('user_agent').nullable();
        
        // Detalles adicionales
        table.text('descripcion').nullable();
        table.enum('resultado', ['exito', 'fallo', 'denegado'])
            .notNullable()
            .defaultTo('exito');

        // ============= TIMESTAMPS =============
        table.timestamp('created_at').defaultTo(knex.fn.now());

        // ============= ÍNDICES =============
        // Búsquedas comunes
        table.index('usuario_id', 'idx_audit_usuario_id');
        table.index('tabla_afectada', 'idx_audit_tabla');
        table.index('registro_id', 'idx_audit_registro_id');
        table.index('created_at', 'idx_audit_created_at');
        
        // Búsqueda compuesta: usuario + tabla
        table.index(['usuario_id', 'tabla_afectada'], 'idx_audit_usuario_tabla');
        
        // Para limpiar datos antiguos (retención GDPR)
        table.index(['tabla_afectada', 'created_at'], 'idx_audit_tabla_fecha');
    });
};

exports.down = async function(knex) {
    console.log('↩️  Eliminando tabla auditoría_logs...');
    return knex.schema.dropTableIfExists('auditoría_logs');
};
