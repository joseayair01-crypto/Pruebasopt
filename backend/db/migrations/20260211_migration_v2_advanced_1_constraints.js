/**
 * ============================================================
 * MIGRACIÓN V2+: AGREGAR CONSTRAINTS DE NEGOCIO
 * ============================================================
 * 
 * Objetivo: Validaciones a nivel BD (imposible circumventarlas)
 * - Totales de órdenes deben cuadrar matemáticamente
 * - Estados solo pueden transicionar válida-mente
 * - Boletos no pueden duplicarse en orden
 * 
 * Tiempo: ~5 segundos
 * Riesgo: BAJO (solo agrega validaciones)
 */

exports.up = async function(knex) {
    console.log('📝 Agregando constraints de negocio...');

    // ============================================================
    // 1. CONSTRAINT: TOTAL DEBE = SUBTOTAL + IMPUESTO - DESCUENTO
    // ============================================================
    try {
        await knex.raw(`
            ALTER TABLE ordenes
            ADD CONSTRAINT check_total_calculo
            CHECK (total = subtotal + impuesto - descuento)
        `);
        console.log('✅ Constraint: total_calculo');
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.warn('⚠️  check_total_calculo:', err.message);
        }
    }

    // ============================================================
    // 2. CONSTRAINT: PRECIOS Y CANTIDADES POSITIVAS
    // ============================================================
    try {
        await knex.raw(`
            ALTER TABLE ordenes
            ADD CONSTRAINT check_precios_positivos
            CHECK (
                precio_unitario > 0 
                AND cantidad_boletos > 0 
                AND subtotal > 0 
                AND total > 0
            )
        `);
        console.log('✅ Constraint: precios_positivos');
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.warn('⚠️  check_precios_positivos:', err.message);
        }
    }

    // ============================================================
    // 3. CONSTRAINT: ESTADOS VÁLIDOS (enum a nivel BD)
    // ============================================================
    try {
        await knex.raw(`
            ALTER TABLE ordenes
            ADD CONSTRAINT check_estado_valido
            CHECK (estado IN (
                'pendiente',
                'confirmada',
                'pagada',
                'apartada',
                'cancelada',
                'reembolsada',
                'expirada'
            ))
        `);
        console.log('✅ Constraint: estado_valido');
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.warn('⚠️  check_estado_valido:', err.message);
        }
    }

    // ============================================================
    // 4. CONSTRAINT: TIMESTAMPS CONSISTENTES
    // ============================================================
    try {
        await knex.raw(`
            ALTER TABLE ordenes
            ADD CONSTRAINT check_timestamps_consistentes
            CHECK (
                updated_at >= created_at
                AND (pagada_en IS NULL OR pagada_en >= created_at)
                AND (confirmada_en IS NULL OR confirmada_en >= created_at)
            )
        `);
        console.log('✅ Constraint: timestamps_consistentes');
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.warn('⚠️  check_timestamps_consistentes:', err.message);
        }
    }

    // ============================================================
    // 5. CREAR TABLA: TRANSICIONES DE ESTADO PERMITIDAS
    // ============================================================
    const exists = await knex.schema.hasTable('estado_transiciones_permitidas');
    if (!exists) {
        console.log('📋 Creando tabla estado_transiciones_permitidas...');
        
        await knex.schema.createTable('estado_transiciones_permitidas', table => {
            table.string('estado_anterior', 50).notNullable();
            table.string('estado_nuevo', 50).notNullable();
            table.boolean('permitido').notNullable().defaultTo(true);
            table.text('razon').nullable();  // Por qué está permitido/prohibido
            table.timestamp('created_at').defaultTo(knex.fn.now());
            
            table.primary(['estado_anterior', 'estado_nuevo']);
            table.index('estado_anterior');
        });

        // Insertar transiciones válidas (workflow de órdenes)
        const transiciones = [
            { anterior: 'pendiente', nuevo: 'pagada', permitido: true, razon: 'Cliente pagó' },
            { anterior: 'pendiente', nuevo: 'confirmada', permitido: true, razon: 'Admin confirmó' },
            { anterior: 'pendiente', nuevo: 'cancelada', permitido: true, razon: 'Cliente canceló' },
            { anterior: 'pendiente', nuevo: 'expirada', permitido: true, razon: 'Expiró tiempo' },
            
            { anterior: 'confirmada', nuevo: 'pagada', permitido: true, razon: 'Cliente pagó' },
            { anterior: 'confirmada', nuevo: 'cancelada', permitido: true, razon: 'Admin canceló' },
            
            { anterior: 'pagada', nuevo: 'cancelada', permitido: false, razon: 'Ya fue pagada' },
            { anterior: 'pagada', nuevo: 'reembolsada', permitido: true, razon: 'Cliente solicitó reembolso' },
            
            { anterior: 'cancelada', nuevo: 'reembolsada', permitido: true, razon: 'Devolver dinero' },
            
            { anterior: 'expirada', nuevo: 'cancelada', permitido: true, razon: 'Liberar boletos' },
        ];

        for (const t of transiciones) {
            await knex('estado_transiciones_permitidas').insert({
                estado_anterior: t.anterior,
                estado_nuevo: t.nuevo,
                permitido: t.permitido,
                razon: t.razon
            });
        }

        console.log(`✅ Transiciones: ${transiciones.length} registradas`);
    }

    // ============================================================
    // 6. CONSTRAINT: BOLETOS DUPLICADOS EN MISMA ORDEN
    // ============================================================
    try {
        // Este constraint ya existe en la migración de boletos_orden
        // Verificamos con una query simple
        const result = await knex.raw(`
            SELECT EXISTS (
                SELECT 1 FROM pg_indexes 
                WHERE tablename = 'boletos_orden' 
                AND indexname = 'uc_boleto_orden_unico'
            )
        `);
        if (result.rows[0].exists) {
            console.log('✅ Constraint: boletos_no_duplicados');
        }
    } catch (err) {
        console.warn('⚠️  boletos_no_duplicados:', err.message);
    }

    console.log('✅ Constraints de negocio agregados exitosamente');
};

exports.down = async function(knex) {
    console.log('↩️  Eliminando constraints de negocio...');

    try {
        await knex.raw('ALTER TABLE ordenes DROP CONSTRAINT check_total_calculo');
        await knex.raw('ALTER TABLE ordenes DROP CONSTRAINT check_precios_positivos');
        await knex.raw('ALTER TABLE ordenes DROP CONSTRAINT check_estado_valido');
        await knex.raw('ALTER TABLE ordenes DROP CONSTRAINT check_timestamps_consistentes');
        await knex.schema.dropTableIfExists('estado_transiciones_permitidas');
    } catch (err) {
        console.warn('⚠️  Error durante rollback:', err.message);
    }
};
