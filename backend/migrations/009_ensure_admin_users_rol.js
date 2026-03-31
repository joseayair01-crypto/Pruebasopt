/**
 * Migración 009: Asegurar columna 'rol' en tabla admin_users
 * 
 * Agrega la columna 'rol' si no existe, para manejar diferentes permisos:
 * - admin: Acceso total, puede crear/eliminar usuarios y acceder a configuración
 * - operador: Acceso a órdenes, no puede tocar configuración
 * 
 * SEGURIDAD: Validación de roles en roles en endpoints del backend
 */

exports.up = async function(knex) {
    try {
        console.log('👥 [Migration 009] Verificando columna rol en admin_users...');
        
        const tableExists = await knex.schema.hasTable('admin_users');
        if (!tableExists) {
            console.log('⚠️  Tabla admin_users no existe, saltando migración');
            return;
        }

        const hasRol = await knex.schema.hasColumn('admin_users', 'rol');
        
        if (!hasRol) {
            await knex.schema.table('admin_users', (table) => {
                table.enum('rol', ['admin', 'operador', 'solo_lectura'])
                    .defaultTo('operador')
                    .notNullable()
                    .comment('Rol del usuario: admin=acceso total, operador=órdenes, solo_lectura=lectura');
            });
            console.log('✅ [Migration 009] Columna rol agregada exitosamente');
        } else {
            console.log('ℹ️  [Migration 009] Columna rol ya existe');
        }
    } catch (error) {
        console.error('❌ [Migration 009] Error:', error.message);
        // No lanzar error
    }
};

exports.down = async function(knex) {
    try {
        const tableExists = await knex.schema.hasTable('admin_users');
        if (!tableExists) return;

        const hasRol = await knex.schema.hasColumn('admin_users', 'rol');
        if (hasRol) {
            await knex.schema.table('admin_users', (table) => {
                table.dropColumn('rol');
            });
        }
    } catch (error) {
        console.error('❌ [Migration 009] Error revertiendo:', error.message);
    }
};
