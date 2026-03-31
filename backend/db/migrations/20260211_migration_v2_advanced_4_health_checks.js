/**
 * ============================================================
 * MIGRACIÓN V2+: HEALTH CHECKS Y MONITOREO DE BD
 * ============================================================
 * 
 * Objetivo:
 * - Detectar problemas antes de que causen downtime
 * - Monitorear tamaño, conexiones, index bloat, etc
 * - Alertas automáticas
 * 
 * Tiempo: ~10 segundos
 * Riesgo: BAJO (solo lectura)
 */

exports.up = async function(knex) {
    console.log('📝 Creando sistema de health checks...');

    // ============================================================
    // 1. CREAR TABLA DE HEALTH CHECKS
    // ============================================================
    const exists = await knex.schema.hasTable('bd_health_checks');
    if (!exists) {
        await knex.schema.createTable('bd_health_checks', table => {
            table.bigIncrements('id').primary();
            
            // Tipo de check
            table.string('check_type', 50).notNullable();  // 'size', 'connection_count', 'index_bloat', etc
            table.string('tabla_nombre', 100).nullable();  // Tabla afectada (si aplica)
            
            // Resultado
            table.string('resultado', 50).notNullable();   // 'ok', 'warning', 'critical'
            table.text('descripcion').nullable();          // Descripción del resultado
            
            // Valores
            table.decimal('valor', 15, 2).nullable();       // El valor actual
            table.decimal('umbral_warning', 15, 2).nullable();  // Umbral de warning
            table.decimal('umbral_critical', 15, 2).nullable();  // Umbral de critical
            
            // Recomendación
            table.text('recomendacion').nullable();         // Si es warning/critical, recomendación
            
            // Timestamps
            table.timestamp('checked_at').defaultTo(knex.fn.now());
            
            // Índices
            table.index('check_type');
            table.index('tabla_nombre');
            table.index('resultado');
            table.index('checked_at');
        });
        console.log('  ✅ Tabla bd_health_checks creada');
    }

    // ============================================================
    // 2. FUNCIÓN: VERIFICAR TAMAÑO DE BD
    // ============================================================
    await knex.raw(`
        CREATE OR REPLACE FUNCTION check_bd_size()
        RETURNS TABLE (
            check_type VARCHAR,
            resultado VARCHAR,
            valor NUMERIC,
            umbral_warning NUMERIC,
            umbral_critical NUMERIC,
            descripcion TEXT,
            recomendacion TEXT
        ) AS $$
        DECLARE
            v_size_mb NUMERIC;
            v_max_size_mb NUMERIC := 50000;  -- 50GB límite de alerta
        BEGIN
            SELECT pg_database_size(current_database()) / 1024 / 1024 INTO v_size_mb;
            
            RETURN QUERY SELECT
                'bd_size'::VARCHAR,
                CASE 
                    WHEN v_size_mb > v_max_size_mb THEN 'critical'::VARCHAR
                    WHEN v_size_mb > (v_max_size_mb * 0.8) THEN 'warning'::VARCHAR
                    ELSE 'ok'::VARCHAR
                END,
                v_size_mb,
                (v_max_size_mb * 0.8)::NUMERIC,
                v_max_size_mb::NUMERIC,
                'Tamaño bd: ' || ROUND(v_size_mb, 2) || 'MB',
                CASE 
                    WHEN v_size_mb > v_max_size_mb THEN 'Archivar datos viejos, hacer VACUUM FULL'
                    WHEN v_size_mb > (v_max_size_mb * 0.8) THEN 'Monitorear crecimiento'
                    ELSE NULL
                END;
        END;
        $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función check_bd_size()');

    // ============================================================
    // 3. FUNCIÓN: VERIFICAR CONEXIONES ACTIVAS
    // ============================================================
    await knex.raw(`
        CREATE OR REPLACE FUNCTION check_conexiones_activas()
        RETURNS TABLE (
            check_type VARCHAR,
            resultado VARCHAR,
            valor NUMERIC,
            umbral_warning NUMERIC,
            umbral_critical NUMERIC,
            descripcion TEXT
        ) AS $$
        DECLARE
            v_active_count INTEGER;
            v_max_connections INTEGER;
        BEGIN
            SELECT count(*), current_setting('max_connections')::INTEGER
            INTO v_active_count, v_max_connections
            FROM pg_stat_activity;
            
            RETURN QUERY SELECT
                'conexiones_activas'::VARCHAR,
                CASE 
                    WHEN v_active_count > (v_max_connections * 0.9) THEN 'critical'::VARCHAR
                    WHEN v_active_count > (v_max_connections * 0.7) THEN 'warning'::VARCHAR
                    ELSE 'ok'::VARCHAR
                END,
                v_active_count::NUMERIC,
                (v_max_connections * 0.7)::NUMERIC,
                (v_max_connections * 0.9)::NUMERIC,
                'Conexiones: ' || v_active_count || ' de ' || v_max_connections;
        END;
        $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función check_conexiones_activas()');

    // ============================================================
    // 4. FUNCIÓN: VERIFICAR TRANSACCIONES LARGAS
    // ============================================================
    await knex.raw(`
        CREATE OR REPLACE FUNCTION check_transacciones_largas()
        RETURNS TABLE (
            check_type VARCHAR,
            resultado VARCHAR,
            valor NUMERIC,
            descripcion TEXT
        ) AS $$
        BEGIN
            RETURN QUERY SELECT
                'transacciones_largas'::VARCHAR,
                CASE 
                    WHEN count(*) > 0 THEN 'warning'::VARCHAR
                    ELSE 'ok'::VARCHAR
                END,
                count(*)::NUMERIC,
                'Transacciones activas > 10 minutos: ' || count(*)::TEXT
            FROM pg_stat_activity
            WHERE state = 'active' 
            AND query_start < NOW() - INTERVAL '10 minutes'
            GROUP BY 1;
        END;
        $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función check_transacciones_largas()');

    // ============================================================
    // 5. FUNCIÓN: VERIFICAR TABLE BLOAT (índices innecesarios)
    // ============================================================
    await knex.raw(`
        CREATE OR REPLACE FUNCTION check_table_bloat()
        RETURNS TABLE (
            tabla_nombre VARCHAR,
            tamaño_real_mb NUMERIC,
            tamaño_estimado_mb NUMERIC,
            pct_bloat NUMERIC,
            resultado VARCHAR
        ) AS $$
        BEGIN
            RETURN QUERY
            SELECT
                schemaname || '.' || tablename::VARCHAR,
                (pg_total_relation_size(schemaname||'.'||tablename) / 1024 / 1024)::NUMERIC,
                (pg_relation_size(schemaname||'.'||tablename) / 1024 / 1024)::NUMERIC,
                ROUND(100.0 * (pg_total_relation_size(schemaname||'.'||tablename) - 
                        pg_relation_size(schemaname||'.'||tablename)) / 
                        pg_total_relation_size(schemaname||'.'||tablename), 2),
                CASE 
                    WHEN (100.0 * (pg_total_relation_size(schemaname||'.'||tablename) - 
                            pg_relation_size(schemaname||'.'||tablename)) / 
                            pg_total_relation_size(schemaname||'.'||tablename)) > 50 THEN 'critical'::VARCHAR
                    WHEN (100.0 * (pg_total_relation_size(schemaname||'.'||tablename) - 
                            pg_relation_size(schemaname||'.'||tablename)) / 
                            pg_total_relation_size(schemaname||'.'||tablename)) > 30 THEN 'warning'::VARCHAR
                    ELSE 'ok'::VARCHAR
                END
            FROM pg_tables
            WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
            ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
            LIMIT 10;
        END;
        $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función check_table_bloat()');

    // ============================================================
    // 6. FUNCIÓN AGREGADA: EJECUTAR TODOS LOS CHECKS
    // ============================================================
    await knex.raw(`
        CREATE OR REPLACE FUNCTION run_all_health_checks()
        RETURNS void AS $$
        BEGIN
            -- Limpiar checks antiguos (solo guardar últimas 24h)
            DELETE FROM bd_health_checks WHERE checked_at < NOW() - INTERVAL '24 hours';
            
            -- BD Size
            INSERT INTO bd_health_checks (check_type, tabla_nombre, resultado, valor, umbral_warning, umbral_critical, descripcion)
            SELECT check_type, NULL, resultado, valor, umbral_warning, umbral_critical, descripcion
            FROM check_bd_size();
            
            -- Conexiones
            INSERT INTO bd_health_checks (check_type, tabla_nombre, resultado, valor, umbral_warning, umbral_critical, descripcion)
            SELECT check_type, NULL, resultado, valor, umbral_warning, umbral_critical, descripcion
            FROM check_conexiones_activas();
            
            -- Transacciones largas
            INSERT INTO bd_health_checks (check_type, tabla_nombre, resultado, valor, descripcion)
            SELECT check_type, NULL, resultado, valor, descripcion
            FROM check_transacciones_largas();
        END;
        $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función run_all_health_checks()');

    console.log('\n✅ Sistema de health checks creado exitosamente');
    console.log('   Uso: SELECT run_all_health_checks();\n');
};

exports.down = async function(knex) {
    console.log('↩️  Eliminando health checks...');

    try {
        await knex.raw('DROP FUNCTION IF EXISTS run_all_health_checks()');
        await knex.raw('DROP FUNCTION IF EXISTS check_table_bloat()');
        await knex.raw('DROP FUNCTION IF EXISTS check_transacciones_largas()');
        await knex.raw('DROP FUNCTION IF EXISTS check_conexiones_activas()');
        await knex.raw('DROP FUNCTION IF EXISTS check_bd_size()');
        await knex.schema.dropTableIfExists('bd_health_checks');
    } catch (err) {
        console.warn('⚠️  Error durante rollback:', err.message);
    }
};
