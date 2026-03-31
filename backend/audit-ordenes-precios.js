/**
 * ============================================================
 * SCRIPT: backend/audit-ordenes-precios.js
 * DESCRIPCIÓN: Audita todas las órdenes para detectar inconsistencias de precio
 * Busca órdenes potencialmente afectadas por bug ST-AA074
 * ============================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = require('./db');
const { calcularDescuentoCompartido, auditarConsistenciaPrecios } = require('./calculo-precios-server');

/**
 * Lee config.json para obtener reglas de descuento
 */
function cargarConfigSorteo() {
    try {
        const fs = require('fs');
        const configPath = path.join(__dirname, 'config.json');
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error cargando config.json:', e.message);
    }
    return {};
}

/**
 * Audita una orden individual
 */
function auditarOrden(orden, config) {
    const cantidadBoletos = orden.cantidad_boletos || 0;
    const precioUnitario = orden.precio_unitario || 15;
    const descuentoGuardado = orden.descuento || 0;
    const totalGuardado = orden.total || 0;

    // Recalcular como servidor actual
    const descuentoRecalculado = calcularDescuentoCompartido(
        cantidadBoletos,
        precioUnitario,
        config?.rifa?.descuentos?.reglas
    );

    // Comparar
    const diferenciaMonto = Math.abs(descuentoGuardado - descuentoRecalculado.monto);
    const diferenciaTotal = Math.abs(totalGuardado - descuentoRecalculado.total);

    return {
        numero_orden: orden.numero_orden,
        cantidad_boletos: cantidadBoletos,
        precio_unitario: precioUnitario,
        descuentoGuardado,
        descuentoRecalculado: descuentoRecalculado.monto,
        totalGuardado,
        totalRecalculado: descuentoRecalculado.total,
        diferenciaMonto,
        diferenciaTotal,
        esInconsistente: diferenciaMonto > 0.01 || diferenciaTotal > 0.01,
        estado_cliente: orden.estado_cliente,
        fecha_creacion: orden.created_at
    };
}

/**
 * MAIN: Auditar todas las órdenes
 */
async function auditarTodasLasOrdenes() {
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔍 AUDITORÍA DE PRECIOS: Todas las órdenes');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    const config = cargarConfigSorteo();
    
    try {
        // Obtener todas las órdenes
        const ordenes = await db('ordenes').orderBy('created_at', 'desc');
        console.log(`📊 Total de órdenes en BD: ${ordenes.length}`);
        console.log('');

        let inconsistentes = [];
        let consistentes = 0;

        // Auditar cada orden
        for (const orden of ordenes) {
            const auditoria = auditarOrden(orden, config);
            
            if (auditoria.esInconsistente) {
                inconsistentes.push(auditoria);
            } else {
                consistentes++;
            }
        }

        // Mostrar resultados
        console.log(`✅ Órdenes CONSISTENTES: ${consistentes}`);
        console.log(`❌ Órdenes INCONSISTENTES: ${inconsistentes.length}`);
        console.log('');

        if (inconsistentes.length > 0) {
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('⚠️  ÓRDENES CON INCONSISTENCIAS:');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('');

            // Ordenar por diferencia (mayor primero)
            inconsistentes.sort((a, b) => b.diferenciaTotal - a.diferenciaTotal);

            // Mostrar tabla
            console.log('Orden ID'.padEnd(15) + 
                        'Boletos'.padStart(8) + 
                        'Desc Guardado'.padStart(14) + 
                        'Desc Recalc'.padStart(13) + 
                        'Dif Total'.padStart(12) + 
                        'Cliente'.padStart(30));
            console.log('─'.repeat(90));

            for (const order of inconsistentes) {
                console.log(
                    (order.numero_orden || 'N/A').slice(0, 14).padEnd(15) +
                    String(order.cantidad_boletos).padStart(8) +
                    `$${order.descuentoGuardado.toFixed(2)}`.padStart(14) +
                    `$${order.descuentoRecalculado.toFixed(2)}`.padStart(13) +
                    `$${order.diferenciaTotal.toFixed(2)}`.padStart(12) +
                    (order.estado_cliente ? order.estado_cliente.slice(0, 26) : 'N/A').padStart(30)
                );
            }
            console.log('');

            // Estadísticas
            const totalInconsis = inconsistentes.reduce((acc, o) => acc + o.diferenciaTotal, 0);
            console.log(`📈 Total diferencia acumulada: $${totalInconsis.toFixed(2)}`);
            console.log(`📈 Diferencia promedio: $${(totalInconsis / inconsistentes.length).toFixed(2)}`);
            console.log(`📈 Diferencia máxima: $${Math.max(...inconsistentes.map(o => o.diferenciaTotal)).toFixed(2)}`);
            console.log('');
        }

        // Exportar resultado a JSON
        const resultadoAuditoria = {
            fecha_auditoria: new Date().toISOString(),
            total_ordenes: ordenes.length,
            ordenes_consistentes: consistentes,
            ordenes_inconsistentes: inconsistentes.length,
            diferencia_total_acumulada: inconsistentes.reduce((acc, o) => acc + o.diferenciaTotal, 0),
            ordenes_inconsistentes_detalle: inconsistentes.slice(0, 50)  // Primeras 50
        };

        const fs = require('fs');
        const jsonPath = path.join(__dirname, 'audit-ordenes-precios.json');
        fs.writeFileSync(jsonPath, JSON.stringify(resultadoAuditoria, null, 2));
        console.log(`✅ Reporte guardado en: ${jsonPath}`);
        console.log('');

        console.log('═══════════════════════════════════════════════════════════════');
        console.log('✨ Auditoría completada');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('');

    } catch (error) {
        console.error('❌ Error durante auditoría:', error);
    } finally {
        process.exit(0);
    }
}

// Ejecutar
auditarTodasLasOrdenes();
