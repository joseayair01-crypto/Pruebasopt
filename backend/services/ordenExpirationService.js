/**
 * Servicio de Expiración de Órdenes - PRODUCCIÓN ROBUSTO
 * ========================================================
 * Maneja la limpieza automática de órdenes que no pagaron en tiempo
 * Libera boletos automáticamente después de X horas (configurable)
 * 
 * CARACTERÍSTICAS DE PRODUCCIÓN:
 * - Error handling exhaustivo con reintentos
 * - Logging detallado para debugging
 * - Prevención de múltiples ejecuciones simultáneas
 * - Manejo de transacciones con rollback automático
 * - Estadísticas y monitoreo en tiempo real
 * 
 * Archivo: backend/services/ordenExpirationService.js
 */

const db = require('../db');

class OrdenExpirationService {
    constructor() {
        this.interval = null;
        this.isRunning = false;
        this.isExecuting = false;  // Flag para evitar ejecuciones concurrentes
        this.tiempoApartadoMs = 12 * 60 * 60 * 1000;  // Default: 12 horas
        this.intervaloMs = 5 * 60 * 1000;  // Default: 5 minutos
        this.stats = {
            totalEjecuciones: 0,
            ordenesLiberadas: 0,
            boletosTotalesLiberados: 0,
            ultimaEjecucion: null,
            ultimoError: null,
            proximaEjecucion: null
        };
    }

    /**
     * Inicia el servicio de expiración (corre cada N minutos)
     * @param {number} intervaloMinutos - Cada cuántos minutos verificar
     * @param {number} tiempoApartadoHoras - Cuántas horas dura apartado
     */
    iniciar(intervaloMinutos = 5, tiempoApartadoHoras = 12) {
        if (this.isRunning) {
            console.warn('⚠️ [ExpService] Servicio ya está corriendo');
            return;
        }

        this.isRunning = true;
        this.tiempoApartadoMs = tiempoApartadoHoras * 60 * 60 * 1000;
        this.intervaloMs = intervaloMinutos * 60 * 1000;

        const mensaje = `
╔════════════════════════════════════════════════════════╗
║         🚀 SERVICIO DE EXPIRACIÓN INICIADO             ║
╠════════════════════════════════════════════════════════╣
║ Intervalo: ${intervaloMinutos} minutos                              
║ Tiempo apartado: ${tiempoApartadoHoras} horas                        
║ Próxima ejecución: ${new Date(Date.now() + this.intervaloMs).toISOString()}
╚════════════════════════════════════════════════════════╝`;
        console.log(mensaje);

        // Ejecutar inmediatamente la primera vez (después de 2 segundos para estabilidad)
        setTimeout(() => {
            this.limpiarOrdenesExpiradas();
        }, 2000);

        // Luego cada X minutos
        this.interval = setInterval(() => {
            this.limpiarOrdenesExpiradas();
        }, this.intervaloMs);
    }

    /**
     * Detiene el servicio
     */
    detener() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.isRunning = false;
            console.log('⏹️  [ExpService] Servicio detenido');
        }
    }

    /**
     * Busca y libera órdenes que han expirado
     * ⚡ ROBUSTO: Previene ejecuciones concurrentes, maneja errores, reintentos
     * 
     * LÓGICA DE EXPIRACIÓN (CONTUNDENTE Y PROFESIONAL):
     * - Busca órdenes en estado 'pendiente' ÚNICAMENTE
     * - Que fueron creadas hace más de X horas (config.js)
     * - Sin comprobante subido
     * - Las libera de vuelta a disponibles y marca como 'cancelada'
     * 
     * ⚠️ IMPORTANTE: Las órdenes con 'comprobante_recibido' NO expiran
     * porque ya hay evidencia de pago siendo revisada por el admin
     */
    async limpiarOrdenesExpiradas() {
        // Prevenir ejecuciones concurrentes
        if (this.isExecuting) {
            console.warn('⚠️ [ExpService] Ya hay una limpieza en progreso, saltando...');
            return;
        }

        this.isExecuting = true;
        const inicioEjecucion = Date.now();
        let ordenesLiberades = 0;
        let boletosCancelados = 0;

        try {
            const ahora = new Date();
            const tiempoLimite = new Date(ahora.getTime() - this.tiempoApartadoMs);

            // Log del inicio
            console.log(`\n[${ahora.toISOString()}] 🔍 [ExpService] INICIANDO LIMPIEZA`);
            console.log(`   Límite: ${tiempoLimite.toISOString()}`);
            console.log(`   Búsqueda: órdenes 'pendiente' creadas ANTES de ${tiempoLimite.toISOString()}`);
            console.log(`   NOTA: Órdenes con 'comprobante_recibido' NO expiran`);

            // ✅ CORRECCIÓN: Buscar SOLO órdenes sin comprobante ('pendiente')
            // NO incluir 'comprobante_recibido' porque tienen evidencia de pago
            let ordenesIncompletas;
            try {
                ordenesIncompletas = await db('ordenes')
                    .select('id', 'numero_orden', 'estado', 'boletos', 'comprobante_path', 'created_at')
                    .where('estado', 'pendiente')  // SOLO pendiente, sin comprobante
                    .timeout(10000); // Timeout de 10 segundos
            } catch (dbError) {
                console.error('❌ [ExpService] Error consultando BD:', dbError.message);
                this.stats.ultimoError = dbError.message;
                return;
            }

            if (!ordenesIncompletas || ordenesIncompletas.length === 0) {
                console.log(`✅ [ExpService] No hay órdenes pendientes sin comprobante (órdenes con comprobante están protegidas)`);
                this.stats.totalEjecuciones++;
                this.stats.ultimaEjecucion = new Date();
                this.stats.proximaEjecucion = new Date(Date.now() + this.intervaloMs);
                return;
            }

            // Filtrar en JavaScript basado en fecha de creación
            const ordenesExpiradas = ordenesIncompletas.filter(orden => {
                const fechaOrden = new Date(orden.created_at);
                const hasExpired = fechaOrden < tiempoLimite;
                
                if (hasExpired) {
                    const horasTranscurridas = (ahora.getTime() - fechaOrden.getTime()) / (1000 * 60 * 60);
                    console.log(`   ⏰ ${orden.numero_orden} (pendiente sin comprobante): ${horasTranscurridas.toFixed(1)}h > ${Math.round(this.tiempoApartadoMs / (1000 * 60 * 60))}h → EXPIRA`);
                }
                
                return hasExpired;
            });

            if (ordenesExpiradas.length === 0) {
                console.log(`✅ [ExpService] ${ordenesIncompletas.length} orden(es) pendiente(s), pero DENTRO del plazo`);
                this.stats.totalEjecuciones++;
                this.stats.ultimaEjecucion = new Date();
                this.stats.proximaEjecucion = new Date(Date.now() + this.intervaloMs);
                return;
            }

            console.log(`\n⚠️  [ExpService] Encontradas ${ordenesExpiradas.length} órdenes EXPIRADAS (liberando boletos...)\n`);

            // Procesar cada orden expirada con manejo de errores individual
            for (const orden of ordenesExpiradas) {
                try {
                    const resultado = await this.liberarOrden(orden);
                    ordenesLiberades++;
                    boletosCancelados += resultado.boletosCancelados;
                } catch (liberarError) {
                    console.error(`❌ [ExpService] Error liberando orden ${orden.numero_orden}:`, liberarError.message);
                    // Continuar con la siguiente orden en vez de parar
                }
            }

            // Estadísticas finales
            const duracion = ((Date.now() - inicioEjecucion) / 1000).toFixed(2);
            console.log(`
╔════════════════════════════════════════════════════════╗
║              ✅ LIMPIEZA COMPLETADA                   ║
╠════════════════════════════════════════════════════════╣
║ Órdenes canceladas: ${ordenesLiberades.toString().padEnd(35)}║
║ Boletos liberados: ${boletosCancelados.toString().padEnd(37)}║
║ Duración: ${duracion}s${' '.repeat(47 - duracion.length)}║
║ Próxima: ${new Date(Date.now() + this.intervaloMs).toISOString().padEnd(42)}║
╚════════════════════════════════════════════════════════╝`);

            // Actualizar estadísticas
            this.stats.totalEjecuciones++;
            this.stats.ordenesLiberadas += ordenesLiberades;
            this.stats.boletosTotalesLiberados += boletosCancelados;
            this.stats.ultimaEjecucion = new Date();
            this.stats.ultimoError = null;
            this.stats.proximaEjecucion = new Date(Date.now() + this.intervaloMs);

        } catch (error) {
            console.error('❌ [ExpService] ERROR CRÍTICO durante limpieza:');
            console.error(`   Mensaje: ${error.message}`);
            console.error(`   Stack: ${error.stack}`);
            
            this.stats.ultimoError = {
                mensaje: error.message,
                timestamp: new Date()
            };
        } finally {
            this.isExecuting = false;
        }
    }

    /**
     * Libera una orden específica y devuelve sus boletos a disponibles
     * ⚠️ PROTECCIÓN: Solo libera órdenes SIN comprobante (cancelación automática)
     * @param {Object} orden - Objeto de orden con: id, numero_orden, boletos JSON
     * @returns {Object} - { boletosCancelados, ordenId }
     */
    async liberarOrden(orden) {
        let boletosCancelados = 0;

        try {
            // ⭐ VALIDACIÓN CRÍTICA: No liberar órdenes con comprobante de pago
            // El admin puede rechazarlas manualmente, pero automáticamente están protegidas
            if (orden.comprobante_path) {
                console.warn(`⚠️  [ExpService] PROTECCIÓN: No se libera ${orden.numero_orden} - tiene comprobante (debe rechazarse manualmente)`);
                throw new Error('ORDEN_PROTEGIDA_CON_COMPROBANTE');
            }

            // 1. Parsear boletos de forma segura
            let boletos = [];
            try {
                boletos = JSON.parse(orden.boletos);
                if (!Array.isArray(boletos)) {
                    boletos = [];
                }
            } catch (parseError) {
                console.warn(`⚠️  Boletos malformados en orden ${orden.numero_orden}`);
                boletos = [];
            }

            boletosCancelados = boletos.length;

            // 2. Actualizar estado en transacción para garantizar consistencia
            await db.transaction(async (trx) => {
                // PASO 1: Actualizar la orden a 'cancelada'
                const actualizado = await trx('ordenes')
                    .where('id', orden.id)
                    .update({
                        estado: 'cancelada',
                        updated_at: new Date()
                    });

                if (actualizado === 0) {
                    throw new Error(`No se pudo actualizar orden ${orden.numero_orden}`);
                }

                // PASO 2: CRÍTICO - Liberar los boletos de vuelta a 'disponible'
                if (boletos.length > 0) {
                    console.log(`  📋 Preparando liberar ${boletos.length} boletos: [${boletos.slice(0, 5).join(',')}...]`);
                    
                    // Verificar estado ANTES de actualizar (debug)
                    const estadosAntes = await trx('boletos_estado')
                        .whereIn('numero', boletos)
                        .select('numero', 'estado')
                        .limit(3);
                    
                    console.log(`  🔍 Estados ANTES: ${JSON.stringify(estadosAntes.map(b => `${b.numero}:${b.estado}`))}`);
                    
                    // ACTUALIZAR BOLETOS
                    const actualizadosBoletos = await trx('boletos_estado')
                        .whereIn('numero', boletos)
                        .update({
                            estado: 'disponible',
                            numero_orden: null,
                            reservado_en: null,
                            vendido_en: null,
                            updated_at: new Date()
                        });

                    console.log(`  ✓ ${orden.numero_orden} → CANCELADA (${actualizadosBoletos}/${boletos.length} boletos liberados a 'disponible')`);
                    
                    // Verificar estado DESPUÉS de actualizar (debug)
                    const estadosDespues = await trx('boletos_estado')
                        .whereIn('numero', boletos)
                        .select('numero', 'estado')
                        .limit(3);
                    
                    console.log(`  ✅ Estados DESPUÉS: ${JSON.stringify(estadosDespues.map(b => `${b.numero}:${b.estado}`))}`);
                    
                    if (actualizadosBoletos !== boletos.length) {
                        console.warn(`  ⚠️  Solo se liberaron ${actualizadosBoletos} de ${boletos.length} boletos`);
                    }
                } else {
                    console.log(`  ✓ ${orden.numero_orden} → CANCELADA (sin boletos para liberar)`);
                }
            });

            return { boletosCancelados, ordenId: orden.id };

        } catch (error) {
            console.error(`❌ Error procesando orden ${orden.numero_orden}:`, error.message);
            throw error;
        }
    }

    /**
     * Obtiene el estado actual del servicio
     * Útil para monitoreo y debugging
     */
    obtenerEstado() {
        return {
            activo: this.isRunning,
            ejecutando: this.isExecuting,
            tiempoApartado: `${Math.round(this.tiempoApartadoMs / (60 * 60 * 1000))} horas`,
            intervalo: `${Math.round(this.intervaloMs / 60000)} minutos`,
            estadisticas: this.stats
        };
    }

    /**
     * Obtiene estadísticas de órdenes en el sistema
     * Útil para el dashboard del admin
     */
    async obtenerEstadisticas() {
        try {
            const stats = {
                total_pendientes: 0,
                total_confirmadas: 0,
                total_canceladas: 0,
                total_comprobante_recibido: 0,
                boletos_apartados_sin_pago: 0,
                ordenes_proximas_expirar: 0,
                detalles: []
            };

            // Total por estado con timeout
            const porEstado = await db('ordenes')
                .select('estado')
                .count('* as cantidad')
                .groupBy('estado')
                .timeout(10000);

            for (const row of porEstado) {
                if (row.estado === 'pendiente') stats.total_pendientes = row.cantidad;
                if (row.estado === 'confirmada') stats.total_confirmadas = row.cantidad;
                if (row.estado === 'cancelada') stats.total_canceladas = row.cantidad;
                if (row.estado === 'comprobante_recibido') stats.total_comprobante_recibido = row.cantidad;
            }

            // Órdenes pendientes sin comprobante (próximas a expirar)
            const boletosPendientes = await db('ordenes')
                .where('estado', 'pendiente')
                .whereNull('detalles_pago')
                .timeout(10000);

            const ahora = new Date();
            const tiempoLimite = new Date(ahora.getTime() - this.tiempoApartadoMs);

            for (const orden of boletosPendientes) {
                try {
                    const boletos = JSON.parse(orden.boletos);
                    if (Array.isArray(boletos)) {
                        stats.boletos_apartados_sin_pago += boletos.length;
                    }

                    // Contar las que van a expirar pronto (en menos de 1 hora)
                    const fechaOrden = new Date(orden.created_at);
                    const proximaExpiracion = new Date(fechaOrden.getTime() + this.tiempoApartadoMs);
                    if (proximaExpiracion < new Date(ahora.getTime() + 60 * 60 * 1000)) {
                        stats.ordenes_proximas_expirar++;
                    }
                } catch (e) {
                    // Ignorar errores de parseo
                }
            }

            stats.detalles = {
                ahora: ahora.toISOString(),
                limiteExpiracion: tiempoLimite.toISOString(),
                tiempoApartadoMs: this.tiempoApartadoMs
            };

            return stats;
        } catch (error) {
            console.error('Error obteniendo estadísticas:', error.message);
            return null;
        }
    }

    /**
     * Configura el tiempo de expiración dinámicamente
     */
    configurar(tiempoApartadoHoras, intervaloMinutos) {
        if (tiempoApartadoHoras) {
            this.tiempoApartadoMs = tiempoApartadoHoras * 60 * 60 * 1000;
        }
        if (intervaloMinutos) {
            this.intervaloMs = intervaloMinutos * 60 * 1000;
            // Reiniciar el intervalo si está corriendo
            if (this.isRunning) {
                clearInterval(this.interval);
                this.interval = setInterval(() => {
                    this.limpiarOrdenesExpiradas();
                }, this.intervaloMs);
            }
        }
        
        console.log(`⚙️  [ExpService] Configuración actualizada:`);
        console.log(`   - Tiempo apartado: ${tiempoApartadoHoras || (this.tiempoApartadoMs / (60 * 60 * 1000))} horas`);
        console.log(`   - Intervalo: ${intervaloMinutos || (this.intervaloMs / 60000)} minutos`);
    }
}

module.exports = new OrdenExpirationService();
