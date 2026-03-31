#!/usr/bin/env node
/**
 * ============================================================
 * ANÁLISIS: PROYECCIÓN DE CRECIMIENTO DE BD
 * ============================================================
 * Calcula bytes por fila y proyecta crecimiento con registros futuros
 */

require('dotenv').config();
const knex = require('./db');

async function analizarCrecimiento() {
    try {
        console.log('\n' + '='.repeat(70));
        console.log('📈 PROYECCIÓN DE CRECIMIENTO DE BD');
        console.log('='.repeat(70) + '\n');

        // Tabla 1: boletos_estado
        console.log('1️⃣  BOLETOS_ESTADO (crece con cada boleto vendido)\n');
        
        const boletos = await knex.raw(`
            SELECT 
                COUNT(*) as filas,
                round(pg_total_relation_size('boletos_estado') / 1024.0 / 1024.0, 2) as size_mb,
                round((pg_total_relation_size('boletos_estado')::numeric / NULLIF(COUNT(*), 0)), 0) as bytes_por_fila
            FROM boletos_estado
        `);
        
        const boletosFila = boletos.rows[0];
        console.log(`   Filas actuales: ${boletosFila.filas.toLocaleString()}`);
        console.log(`   Tamaño total: ${boletosFila.size_mb} MB`);
        console.log(`   Bytes/fila: ${boletosFila.bytes_por_fila} B\n`);
        
        // Proyecciones boletos
        const proyBoletos = [
            { cantidad: 500000, label: '500K (hoy)' },
            { cantidad: 1000000, label: '1M' },
            { cantidad: 5000000, label: '5M' },
            { cantidad: 10000000, label: '10M' }
        ];
        
        console.log('   Proyecciones boletos_estado:');
        for (const proy of proyBoletos) {
            const mb = (proy.cantidad * boletosFila.bytes_por_fila) / 1024 / 1024;
            console.log(`   - ${proy.label.padEnd(12)}: ${mb.toFixed(1)} MB`);
        }

        // Tabla 2: orden_oportunidades
        console.log('\n2️⃣  ORDEN_OPORTUNIDADES (crece con oportunidades assignadas)\n');
        
        const oportunidades = await knex.raw(`
            SELECT 
                COUNT(*) as filas,
                round(pg_total_relation_size('orden_oportunidades') / 1024.0 / 1024.0, 2) as size_mb,
                round((pg_total_relation_size('orden_oportunidades')::numeric / NULLIF(COUNT(*), 0)), 0) as bytes_por_fila
            FROM orden_oportunidades
        `);
        
        const opFila = oportunidades.rows[0];
        console.log(`   Filas actuales: ${opFila.filas.toLocaleString()}`);
        console.log(`   Tamaño total: ${opFila.size_mb} MB`);
        console.log(`   Bytes/fila: ${opFila.bytes_por_fila} B\n`);
        
        // Proyecciones oportunidades
        const proyOp = [
            { cantidad: 750000, label: '750K (hoy)' },
            { cantidad: 1000000, label: '1M' },
            { cantidad: 5000000, label: '5M' },
            { cantidad: 10000000, label: '10M' }
        ];
        
        console.log('   Proyecciones orden_oportunidades:');
        for (const proy of proyOp) {
            const mb = (proy.cantidad * opFila.bytes_por_fila) / 1024 / 1024;
            console.log(`   - ${proy.label.padEnd(12)}: ${mb.toFixed(1)} MB`);
        }

        // Tabla 3: ordenes
        console.log('\n3️⃣  ORDENES (crece con cada compra)\n');
        
        const ordenes = await knex.raw(`
            SELECT 
                COUNT(*) as filas,
                round(pg_total_relation_size('ordenes') / 1024.0 / 1024.0, 2) as size_mb,
                round((pg_total_relation_size('ordenes')::numeric / NULLIF(COUNT(*), 0)), 0) as bytes_por_fila
            FROM ordenes
        `);
        
        const ordenesFila = ordenes.rows[0];
        console.log(`   Filas actuales: ${ordenesFila.filas.toLocaleString()}`);
        console.log(`   Tamaño total: ${ordenesFila.size_mb} MB`);
        console.log(`   Bytes/fila: ${ordenesFila.bytes_por_fila} B\n`);
        
        // Proyecciones ordenes
        const proyOrdenes = [
            { cantidad: 24, label: '24 (hoy)' },
            { cantidad: 1000, label: '1K' },
            { cantidad: 10000, label: '10K' },
            { cantidad: 100000, label: '100K' }
        ];
        
        console.log('   Proyecciones ordenes:');
        for (const proy of proyOrdenes) {
            const mb = (proy.cantidad * ordenesFila.bytes_por_fila) / 1024 / 1024;
            console.log(`   - ${proy.label.padEnd(12)}: ${mb.toFixed(2)} MB`);
        }

        // TOTALES PROYECTADOS
        console.log('\n' + '='.repeat(70));
        console.log('💾 TAMAÑO TOTAL PROYECTADO\n');
        
        const escenarios = [
            { 
                label: 'ACTUAL', 
                boletos: 250000, 
                oportunidades: 750000, 
                ordenes: 24 
            },
            { 
                label: '1M Boletos', 
                boletos: 1000000, 
                oportunidades: 1000000, 
                ordenes: 1000 
            },
            { 
                label: '5M Boletos', 
                boletos: 5000000, 
                oportunidades: 5000000, 
                ordenes: 5000 
            },
            { 
                label: '10M Boletos', 
                boletos: 10000000, 
                oportunidades: 10000000, 
                ordenes: 10000 
            }
        ];

        // Otros tamaños fijos (no crecen)
        const otrasTablas = 47 + 0.056 + 0.032 + 0.024 + 0.008; // ganadores, order_id_counter, knex_migrations, etc.

        for (const esc of escenarios) {
            const boletosMB = (esc.boletos * boletosFila.bytes_por_fila) / 1024 / 1024;
            const oportunidadesMB = (esc.oportunidades * opFila.bytes_por_fila) / 1024 / 1024;
            const ordenesMB = (esc.ordenes * ordenesFila.bytes_por_fila) / 1024 / 1024;
            
            const totalMB = boletosMB + oportunidadesMB + ordenesMB + otrasTablas;
            const crecimiento = ((totalMB / 211) - 1) * 100;
            
            console.log(`${esc.label.padEnd(15)}: ${totalMB.toFixed(0)} MB ${crecimiento >= 0 ? '+' : ''}${crecimiento.toFixed(0)}%`);
        }

        console.log('\n' + '='.repeat(70) + '\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await knex.destroy();
    }
}

analizarCrecimiento();
