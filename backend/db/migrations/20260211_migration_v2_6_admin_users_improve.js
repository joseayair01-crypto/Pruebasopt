/**
 * ============================================================
 * MIGRACIÓN V2: AGREGAR CAMPOS COMPLIANCE A ADMIN_USERS
 * ============================================================
 * 
 * Objetivo: Mejorar seguridad y compliance de usuarios admin
 * - Rolebased access control
 * - Bloqueo de intentos fallidos
 * - Seguimiento de accesos
 * 
 * Tiempo: ~10 segundos
 */

exports.up = async function(knex) {
    const hasRol = await knex.schema.hasColumn('admin_users', 'rol');
    
    console.log('📝 Mejorando tabla admin_users...');

    // 1. Agregar rol si no existe
    if (!hasRol) {
        console.log('  → Agregando columna rol...');
        await knex.schema.table('admin_users', table => {
            table.string('rol', 50)
                .notNullable()
                .defaultTo('operador');
        });
    }

    // 2. Agregar permisos RBAC
    const hasPermisos = await knex.schema.hasColumn('admin_users', 'permisos');
    if (!hasPermisos) {
        console.log('  → Agregando columna permisos (RBAC)...');
        await knex.schema.table('admin_users', table => {
            table.jsonb('permisos').defaultTo('[]');  // Array de permisos granulares
        });
    }

    // 3. Agregar tracking de intentos fallidos
    const hasIntentos = await knex.schema.hasColumn('admin_users', 'intentos_fallidos');
    if (!hasIntentos) {
        console.log('  → Agregando columna intentos_fallidos...');
        await knex.schema.table('admin_users', table => {
            table.integer('intentos_fallidos').defaultTo(0);
        });
    }

    // 4. Agregar bloqueo temporal
    const hasBloqueadoHasta = await knex.schema.hasColumn('admin_users', 'bloqueado_hasta');
    if (!hasBloqueadoHasta) {
        console.log('  → Agregando columna bloqueado_hasta...');
        await knex.schema.table('admin_users', table => {
            table.timestamp('bloqueado_hasta').nullable();
        });
    }

    // 5. Agregar último acceso para auditoría
    const hasUltimoAcceso = await knex.schema.hasColumn('admin_users', 'ultimo_acceso');
    if (!hasUltimoAcceso) {
        console.log('  → Agregando columna ultimo_acceso...');
        await knex.schema.table('admin_users', table => {
            table.timestamp('ultimo_acceso').nullable();
        });
    }

    // 6. Agregar índice de búsqueda por rol
    console.log('  → Agregando índices...');
    try {
        await knex.raw('CREATE INDEX IF NOT EXISTS idx_admin_rol ON admin_users(rol)');
    } catch (e) {
        // Index ya existe, ignorar
    }

    try {
        await knex.raw('CREATE INDEX IF NOT EXISTS idx_admin_activo ON admin_users(activo)');
    } catch (e) {
        // Index ya existe, ignorar
    }

    console.log('✅ Tabla admin_users mejorada');
};

exports.down = async function(knex) {
    console.log('↩️  Revirtiendo cambios en admin_users...');

    return knex.schema.table('admin_users', table => {
        table.dropColumn('rol');
        table.dropColumn('permisos');
        table.dropColumn('intentos_fallidos');
        table.dropColumn('bloqueado_hasta');
        table.dropColumn('ultimo_acceso');
    });
};
