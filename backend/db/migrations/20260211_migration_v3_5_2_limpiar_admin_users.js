/**
 * ============================================================
 * MIGRACIÓN V3.5: LIMPIAR ADMIN_USERS (RBAC OVERKILL)
 * ============================================================
 * 
 * Objetivo: Simplificar admin_users de 10 → 6 columnas
 * 
 * ELIMINA (verificado 0 uso):
 * - permisos (JSONB): RBAC nunca implementado
 * - intentos_fallidos: Rate limiting no existe
 * - bloqueado_hasta: Bloqueo temporal no existe
 * - ultimo_acceso: Auditoría nice-to-have, no crítica
 * 
 * MANTIENE (verificado use en código):
 * - rol: USADO en admin-dashboard.html:2055, 2077, 2088 y promote-admin.js
 * 
 * Tiempo: ~1 segundo
 */

exports.up = async function(knex) {
    const columnas_a_eliminar = [
        'permisos',            // ❌ JSONB RBAC nunca usado
        'intentos_fallidos',   // ❌ Rate limiting no implementado
        'bloqueado_hasta',     // ❌ Bloqueo temporal no existe
        'ultimo_acceso'        // ❌ Nice-to-have, no crítico
    ];

    console.log('📝 V3.5.2: Limpiando tabla admin_users...');

    for (const columna of columnas_a_eliminar) {
        try {
            const existe = await knex.schema.hasColumn('admin_users', columna);
            if (existe) {
                console.log(`  → Eliminando columna ${columna}...`);
                await knex.schema.table('admin_users', table => {
                    table.dropColumn(columna);
                });
                console.log(`  ✅ ${columna} eliminada`);
            } else {
                console.log(`  ℹ️  ${columna} no existe, ignorando`);
            }
        } catch (e) {
            console.log(`  ⚠️  Error al eliminar ${columna}: ${e.message.substring(0, 50)}`);
        }
    }

    console.log('✅ Tabla admin_users limpiada - "rol" mantenido (USADO en código)');
};

exports.down = async function(knex) {
    console.log('⏮️  Rollback V3.5.2 - Restaurando admin_users...');
    
    await knex.schema.table('admin_users', table => {
        table.jsonb('permisos').defaultTo('[]');
        table.integer('intentos_fallidos').defaultTo(0);
        table.timestamp('bloqueado_hasta').nullable();
        table.timestamp('ultimo_acceso').nullable();
    });

    console.log('✅ Rollback completado');
};
