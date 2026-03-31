/**
 * ============================================================
 * MIGRACIÓN V3: SIMPLIFICAR O ELIMINAR TABLA CLIENTES
 * ============================================================
 * 
 * Opciones:
 * 1. Si usas tabla clientes: Eliminar 14 columnas innecesarias
 *    - Mantener solo: id, nombre, telefono, email, created_at
 * 2. Si NO usas: Eliminar tabla completa
 * 
 * Para esta migración: SIMPLIFICAR a 5 columnas core
 * (Si después quieres eliminar tabla, fácil en V3_3)
 * 
 * Tiempo: ~20 segundos
 */

exports.up = async function(knex) {
    console.log('📝 V3.2: Simplificando tabla clientes...');

    const tableExists = await knex.schema.hasTable('clientes');
    
    if (!tableExists) {
        console.log('  ⚠️  Tabla clientes no existe, saltando...');
        return;
    }

    // Columnas a eliminar (todo lo que NO es core)
    const columnasAEliminar = [
        'apellido',
        'email_encriptado',
        'telefono_encriptado',
        'documento_tipo',
        'documento_numero_encriptado',
        'pais',
        'estado_domicilio',
        'ciudad',
        'consentimiento_politica_privacidad',
        'consentimiento_fecha',
        'consentimiento_ip',
        'reclamos_activos',
        'reclamos_count',
        'bloqueado',
        'motivo_bloqueo',
        'updated_at',
        'deleted_at',
        'creado_por_usuario_id'
    ];

    console.log(`  → Verificando qué columnas existen para eliminar...`);
    
    // Verificar cada columna individualmente
    const existentes = [];
    for (const col of columnasAEliminar) {
        const exists = await knex.schema.hasColumn('clientes', col);
        if (exists) {
            existentes.push(col);
        }
    }
    
    if (existentes.length > 0) {
        console.log(`  → Eliminando ${existentes.length} columnas innecesarias...`);
        await knex.schema.table('clientes', table => {
            existentes.forEach(col => {
                try {
                    table.dropColumn(col);
                } catch (e) {
                    // Ignorar si no puede eliminar (constraint issues)
                }
            });
        });
        console.log(`  ✅ Eliminadas: ${existentes.join(', ')}`);
    } else {
        console.log('  ⚠️  No hay columnas innecesarias para eliminar');
    }

    // Asegurar que las columnas core existan
    console.log('  → Verificando columnas core...');
    const coreNeeded = ['nombre', 'telefono', 'email'];
    
    for (const col of coreNeeded) {
        const exists = await knex.schema.hasColumn('clientes', col);
        if (!exists) {
            console.log(`  ⚠️  Columna ${col} no existe, creando...`);
            if (col === 'nombre') {
                await knex.schema.table('clientes', t => t.string('nombre', 255).nullable());
            } else if (col === 'telefono') {
                await knex.schema.table('clientes', t => t.string('telefono', 20).nullable());
            } else if (col === 'email') {
                await knex.schema.table('clientes', t => t.string('email', 255).nullable());
            }
        }
    }

    console.log('✅ Tabla clientes simplificada (5 columnas core)');
};

exports.down = async function(knex) {
    console.log('↩️  V3.2: Revirtiendo simplificación de clientes...');
    
    const tableExists = await knex.schema.hasTable('clientes');
    if (!tableExists) return;

    await knex.schema.table('clientes', table => {
        table.string('apellido', 255).nullable();
        table.text('email_encriptado').nullable();
        table.text('telefono_encriptado').nullable();
        table.string('documento_tipo', 50).nullable();
        table.text('documento_numero_encriptado').nullable();
        table.string('pais', 100).nullable();
        table.string('estado_domicilio', 100).nullable();
        table.string('ciudad', 100).nullable();
        table.boolean('consentimiento_politica_privacidad').defaultTo(false);
        table.timestamp('consentimiento_fecha').nullable();
        table.string('consentimiento_ip', 45).nullable();
        table.boolean('reclamos_activos').defaultTo(false);
        table.integer('reclamos_count').defaultTo(0);
        table.boolean('bloqueado').defaultTo(false);
        table.text('motivo_bloqueo').nullable();
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.timestamp('deleted_at').nullable();
        table.bigInteger('creado_por_usuario_id').nullable();
    });
};
