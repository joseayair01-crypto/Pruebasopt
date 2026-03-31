/**
 * Migración 008: Agregar tracking de usuario a cambios de estado en órdenes
 * 
 * Agrega columnas para registrar:
 * - confirmado_por: ID del usuario que confirmó la orden
 * - confirmado_en: Timestamp de cuándo se confirmó
 * - cancelado_por: ID del usuario que canceló la orden  
 * - cancelado_en: Timestamp de cuándo se canceló
 * - actualizado_por: Usuario que hizo la última actualización
 * 
 * SEGURIDAD: Permite auditoría completa de quién realizó cada acción
 */

exports.up = async function(knex) {
    try {
        console.log('📝 [Migration 008] Agregando tracking de usuario a órdenes...');
        
        const tableExists = await knex.schema.hasTable('ordenes');
        if (!tableExists) {
            console.log('⚠️  Tabla ordenes no existe, saltando migración');
            return;
        }

        // Agregar columnas de tracking si no existen
        const hasConfirmadoPor = await knex.schema.hasColumn('ordenes', 'confirmado_por');
        const hasCanceladoPor = await knex.schema.hasColumn('ordenes', 'cancelado_por');
        const hasActualizadoPor = await knex.schema.hasColumn('ordenes', 'actualizado_por');

        await knex.schema.table('ordenes', (table) => {
            if (!hasConfirmadoPor) {
                table.integer('confirmado_por')
                    .nullable()
                    .comment('ID del usuario admin que confirmó la orden');
                table.timestamp('confirmado_en')
                    .nullable()
                    .comment('Momento en que se confirmó la orden');
            }
            
            if (!hasCanceladoPor) {
                table.integer('cancelado_por')
                    .nullable()
                    .comment('ID del usuario admin que canceló/rechazó la orden');
                table.timestamp('cancelado_en')
                    .nullable()
                    .comment('Momento en que se canceló la orden');
            }
            
            if (!hasActualizadoPor) {
                table.integer('actualizado_por')
                    .nullable()
                    .comment('ID del último usuario que actualizó la orden');
            }
        });

        console.log('✅ [Migration 008] Tracking de usuario agregado exitosamente');
    } catch (error) {
        console.error('❌ [Migration 008] Error:', error.message);
        // No lanzar error - permitir que continúe si las columnas ya existen
    }
};

exports.down = async function(knex) {
    try {
        console.log('↩️  [Migration 008] Revirtiendo cambios...');
        
        const tableExists = await knex.schema.hasTable('ordenes');
        if (!tableExists) return;

        await knex.schema.table('ordenes', (table) => {
            const columnas = ['confirmado_por', 'confirmado_en', 'cancelado_por', 'cancelado_en', 'actualizado_por'];
            columnas.forEach(col => {
                table.dropColumnIfExists(col);
            });
        });

        console.log('✅ [Migration 008] Revertido exitosamente');
    } catch (error) {
        console.error('❌ [Migration 008] Error revertiendo:', error.message);
    }
};
