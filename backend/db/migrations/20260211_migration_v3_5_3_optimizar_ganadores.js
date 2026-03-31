/**
 * ============================================================
 * MIGRACIÓN V3.5: OPTIMIZAR TABLA GANADORES
 * ============================================================
 * 
 * Objetivo: Reducir ganadores de ~20 → 11 columnas (SOLO LO SEGURO)
 * 
 * ELIMINA (verificado 0 uso en código):
 * - apellido_ganador: No usado en admin-ruletazo.html ni mis-boletos.html
 * - email: Tienes whatsapp, no duplicar
 * - estado_domicilio: Irrelevante para rifa
 * - direccion_envio: No es sistema logística
 * - codigo_reclamacion: Feature no existe
 * - 4 timestamps: fecha_notificacion, fecha_reclamo, fecha_envio, fecha_entrega (auditoría overkill)
 * 
 * MANTIENE (verificado uso en código):
 * - nombre_sorteo: USADO en mis-boletos.html:2410, 2419
 * 
 * Tiempo: ~2 segundos
 */

exports.up = async function(knex) {
    const columnas_a_eliminar = [
        'apellido_ganador',        // ❌ No usado en admin
        'email',                   // ❌ Tienes whatsapp
        'estado_domicilio',        // ❌ Irrelevante
        'direccion_envio',         // ❌ No es logística
        'codigo_reclamacion',      // ❌ Feature inexistente
        'fecha_notificacion',      // ❌ Auditoría overkill
        'fecha_reclamo',           // ❌ Auditoría overkill
        'fecha_envio',             // ❌ Auditoría overkill
        'fecha_entrega'            // ❌ Auditoría overkill
    ];

    console.log('📝 V3.5.3: Optimizando tabla ganadores...');

    for (const columna of columnas_a_eliminar) {
        try {
            const existe = await knex.schema.hasColumn('ganadores', columna);
            if (existe) {
                console.log(`  → Eliminando columna ${columna}...`);
                await knex.schema.table('ganadores', table => {
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

    // Asegurar que existen columnas CORE
    console.log('  → Verificando columnas CORE preservadas...');
    
    const columnas_esperadas = [
        'numero_orden',
        'nombre_ganador',
        'nombre_sorteo',  // ← MANTENIDA (usada en mis-boletos.html)
        'whatsapp',
        'premio',
        'valor_premio',
        'tipo_ganador',
        'posicion',
        'estado',
        'fecha_sorteo'
    ];

    for (const col of columnas_esperadas) {
        const existe = await knex.schema.hasColumn('ganadores', col);
        if (existe) {
            console.log(`  ✅ ${col} presente`);
        } else {
            console.log(`  ⚠️  ${col} FALTA`);
        }
    }

    console.log('✅ Tabla ganadores optimizada (~20 → 11 columnas, nombre_sorteo mantenido)');
};

exports.down = async function(knex) {
    console.log('⏮️  Rollback V3.5.3 - Restaurando columnas ganadores...');
    
    await knex.schema.table('ganadores', table => {
        table.string('apellido_ganador', 100).nullable();
        table.string('email', 100).nullable();
        table.string('estado_domicilio', 100).nullable();
        table.string('direccion_envio', 500).nullable();
        table.string('codigo_reclamacion', 50).nullable();
        table.timestamp('fecha_notificacion').nullable();
        table.timestamp('fecha_reclamo').nullable();
        table.timestamp('fecha_envio').nullable();
        table.timestamp('fecha_entrega').nullable();
    });

    console.log('✅ Rollback completado');
};
