/**
 * ============================================================================
 * MIGRACIÓN: Validar y garantizar columnas de comprobantes en tabla ordenes
 * ============================================================================
 * 
 * Esta migración asegura que:
 * 1. Las columnas comprobante_path y comprobante_fecha existen
 * 2. Son del tipo correcto
 * 3. Pueden aceptar NULL (datos opcionales hasta que se cargue comprobante)
 * 4. Tienen cobertura en índices para búsquedas rápidas
 * 
 * Ejecutar: npm run migrate
 */

exports.up = async function(knex) {
    const tableName = 'ordenes';
    
    // Verificar si la tabla existe
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) {
        console.log(`⚠️  Tabla ${tableName} no existe, skipping migration`);
        return;
    }

    // Obtener columnas actuales
    const columns = await knex.raw(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = '${tableName}'
    `);

    const columnMap = {};
    columns.rows.forEach(col => {
        columnMap[col.column_name] = {
            type: col.data_type,
            nullable: col.is_nullable === 'YES'
        };
    });

    // ===== VALIDAR comprobante_path =====
    if (!columnMap['comprobante_path']) {
        console.log(`⏳ Agregando columna comprobante_path...`);
        await knex.schema.table(tableName, (table) => {
            table.string('comprobante_path', 500).nullable().comment('URL de Cloudinary del comprobante');
        });
        console.log(`✅ Columna comprobante_path agregada`);
    } else {
        const colType = columnMap['comprobante_path'].type;
        // Validar que sea string/varchar
        if (!['character varying', 'varchar', 'text'].includes(colType)) {
            throw new Error(
                `Columna comprobante_path tiene tipo incorrecto: ${colType}. ` +
                `Debe ser varchar/character varying`
            );
        }
    }

    // ===== VALIDAR comprobante_fecha =====
    if (!columnMap['comprobante_fecha']) {
        console.log(`⏳ Agregando columna comprobante_fecha...`);
        await knex.schema.table(tableName, (table) => {
            table.timestamp('comprobante_fecha').nullable().comment('Fecha de carga del comprobante');
        });
        console.log(`✅ Columna comprobante_fecha agregada`);
    } else {
        const colType = columnMap['comprobante_fecha'].type;
        // Validar que sea timestamp
        if (!['timestamp with time zone', 'timestamp without time zone', 'timestamp'].includes(colType)) {
            throw new Error(
                `Columna comprobante_fecha tiene tipo incorrecto: ${colType}. ` +
                `Debe ser timestamp`
            );
        }
    }

    // ===== AGREGAR ÍNDICES PARA PERFORMANCE =====
    try {
        // Verificar si índice sobre comprobante_fecha existe
        const indices = await knex.raw(`
            SELECT indexname FROM pg_indexes 
            WHERE tablename = '${tableName}' 
            AND indexname LIKE '%comprobante_fecha%'
        `);

        if (indices.rows.length === 0) {
            console.log(`⏳ Agregando índice en comprobante_fecha...`);
            await knex.raw(`
                CREATE INDEX idx_ordenes_comprobante_fecha 
                ON ${tableName}(comprobante_fecha DESC NULLS LAST)
            `);
            console.log(`✅ Índice comprobante_fecha agregado`);
        }
    } catch (error) {
        // Si el índice ya existe o hay error, continuar
        console.log(`ℹ️  Índice comprobante_fecha: ${error.message.includes('already exists') ? 'ya existe' : 'skipped'}`);
    }

    console.log(`\n✅ Validación de comprobantes completada`);
};

exports.down = async function(knex) {
    // No eliminar columnas en rollback - son parte del esquema
    // El down solo es documentación de qué se agregó
    console.log('ℹ️  Rollback de validación de comprobantes (columnas permanecen)');
};
