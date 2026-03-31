/**
 * Servicio: Gestión de boletos para 1M+ registros
 * Maneja reservas, ventas y disponibilidad de forma optimizada
 * 
 * Características:
 * - Queries optimizadas con índices
 * - Transacciones para prevenir race conditions
 * - Reservas temporales durante checkout
 * - Expiración automática de reservas
 * - Retry automático con backoff exponencial
 */

const db = require('../db');
const retryService = require('./retryService');

class BoletoService {
  /**
   * Obtiene X boletos disponibles para mostrar en UI
   * OPTIMIZADO: No carga 1M registros, solo pagina actual
   * @param {number} limit - Cuántos boletos devolver
   * @param {number} offset - Desde dónde empezar (para pagination)
   * @returns {Promise<Array>}
   */
  static async obtenerBoletosDisponibles(limit = 50, offset = 0) {
    try {
      const boletos = await db('boletos_estado')
        .where('estado', 'disponible')
        .orderBy('numero', 'asc')
        .limit(limit)
        .offset(offset)
        .select('numero');

      // Retornar solo los números
      return boletos.map(b => b.numero);
    } catch (error) {
      console.error('Error obtenerBoletosDisponibles:', error.message);
      throw error;
    }
  }

  /**
   * Cuenta cuántos boletos disponibles hay (sin cargarlos todos)
   * @returns {Promise<number>}
   */
  static async contarBoletosDisponibles() {
    try {
      const resultado = await db('boletos_estado')
        .where('estado', 'disponible')
        .count('* as total')
        .first();

      return resultado.total || 0;
    } catch (error) {
      console.error('Error contarBoletosDisponibles:', error.message);
      throw error;
    }
  }

  /**
   * Verifica si boletos específicos están disponibles
   * CRÍTICO: Rápido incluso con 1M registros gracias a índices
   * @param {Array<number>} numeros - Números de boletos a verificar
   * @returns {Promise<{disponibles: Array, conflictos: Array}>}
   */
  static async verificarDisponibilidad(numeros) {
    try {
      // Validar que numeros sea un array
      if (!Array.isArray(numeros)) {
        console.error('verificarDisponibilidad recibió no-array:', { type: typeof numeros, value: numeros });
        throw new Error(`verificarDisponibilidad: boletos debe ser un array, recibido ${typeof numeros}`);
      }

      if (numeros.length === 0) {
        return { disponibles: [], conflictos: [] };
      }

      // ===== VALIDAR RANGO DE NÚMEROS =====
      // Obtener totalBoletos desde config manager (cachea en memoria)
      const configManager = require('../config-manager').getInstance();
      const totalBoletos = configManager.totalBoletos;
      
      const boletosInvalidos = numeros.filter(num => {
        const n = Number(num);
        return isNaN(n) || n < 0 || n >= totalBoletos;
      });
      
      if (boletosInvalidos.length > 0) {
        throw new Error(`Boletos inválidos (rango válido: 0-${totalBoletos-1}): ${boletosInvalidos.join(', ')}`);
      }

      // Query optimizada: busca solo los boletos solicitados
      const boletos = await db('boletos_estado')
        .whereIn('numero', numeros)
        .select('numero', 'estado');

      // Separar disponibles y conflictos
      const disponibles = [];
      const conflictos = [];
      const boletosEncontrados = new Set(boletos.map(b => b.numero));

      numeros.forEach(num => {
        const boleto = boletos.find(b => b.numero === num);
        
        if (!boleto) {
          // No existe = disponible (se creará)
          disponibles.push(num);
        } else if (boleto.estado === 'disponible') {
          // SOLO estado 'disponible' puede comprarse
          disponibles.push(num);
        } else {
          // CUALQUIER otro estado (apartado, vendido, cancelado) = conflicto
          conflictos.push({
            numero: num,
            estado: boleto.estado,
            razon: boleto.estado === 'vendido' ? 'Ya fue pagado y vendido' : `Estado: ${boleto.estado}`
          });
        }
      });

      return { disponibles, conflictos };
    } catch (error) {
      console.error('Error verificarDisponibilidad:', error.message);
      throw error;
    }
  }

  /**
   * TRANSACCIÓN CRÍTICA: Reservar boletos y crear orden
   * Todo ocurre en una transacción para evitar race conditions
  /**
   * Confirmar venta: cambiar boletos de RESERVADO a VENDIDO
   * @param {string} ordenId - ID de la orden
   * @returns {Promise<{success: boolean}>}
   */
  static async confirmarVenta(ordenId) {
    try {
      const resultado = await db('boletos_estado')
        .where('numero_orden', ordenId)
        .where('estado', 'apartado')
        .update({
          estado: 'vendido',
          updated_at: new Date()
        });

      return {
        success: true,
        boletosActualizados: resultado
      };
    } catch (error) {
      console.error('Error confirmarVenta:', error.message);
      throw error;
    }
  }

  /**
   * Cancelar orden: volver boletos a disponibles
   * ✅ MEJORADO: Triple validación para evitar boletos huérfanos
   * @param {string} ordenId - ID de la orden
   * @returns {Promise<{success: boolean, boletosLiberados: number}>}
   */
  static async cancelarOrden(ordenId) {
    return db.transaction(async (trx) => {
      try {
        // PASO 1: Cambiar boletos a disponibles (por numero_orden)
        const actualizado = await trx('boletos_estado')
          .where('numero_orden', ordenId)
          .update({
            estado: 'disponible',
            numero_orden: null,
            updated_at: new Date()
          });

        console.log(`[BoletoService.cancelarOrden] PASO 1: ${actualizado} boletos liberados`);

        // PASO 2: PROTECCIÓN: Verificar que NO haya quedado ningún boleto en estado 'apartado' con esta orden
        const huerfanos = await trx('boletos_estado')
          .where('numero_orden', ordenId)
          .where('estado', 'apartado')
          .count('* as cnt');

        if (huerfanos[0].cnt > 0) {
          console.warn(`⚠️  [PROTECCIÓN] ${huerfanos[0].cnt} boletos apartados aún vinculados a orden ${ordenId}`);
          // Limpiar los que quedaron
          await trx('boletos_estado')
            .where('numero_orden', ordenId)
            .update({
              estado: 'disponible',
              numero_orden: null,
              updated_at: new Date()
            });
        }

        // PASO 3: Cambiar orden a cancelada
        await trx('ordenes')
          .where('numero_orden', ordenId)
          .update({
            estado: 'cancelada',
            updated_at: new Date()
          });

        console.log(`[BoletoService.cancelarOrden] Orden ${ordenId} cancelada`);

        return { success: true, boletosLiberados: actualizado };
      } catch (error) {
        throw error;
      }
    });
  }

  /**
   * Limpiar reservas expiradas (cron job)
   * Se ejecuta cada 5 minutos para liberar boletos no vendidos
   * @returns {Promise<{boletosLiberados: number}>}
   */
  static async limpiarReservasExpiradas() {
    return db.transaction(async (trx) => {
      try {
        // Buscar órdenes pendientes más viejas que 4 horas
        const ordenesExpiradas = await trx('ordenes')
          .where('estado', 'pendiente')
          .where('created_at', '<', new Date(Date.now() - 4 * 60 * 60 * 1000))
          .select('numero_orden');

        if (ordenesExpiradas.length === 0) {
          return { boletosLiberados: 0 };
        }

        const ordenIds = ordenesExpiradas.map(o => o.numero_orden);

        // Liberar boletos
        const resultado = await trx('boletos_estado')
          .whereIn('numero_orden', ordenIds)
          .update({
            estado: 'disponible',
            numero_orden: null,
            updated_at: new Date()
          });

        // Marcar órdenes como expiradas
        await trx('ordenes')
          .whereIn('numero_orden', ordenIds)
          .update({
            estado: 'expirada',
            updated_at: new Date()
          });

        return { boletosLiberados: resultado };
      } catch (error) {
        console.error('Error limpiarReservasExpiradas:', error.message);
        throw error;
      }
    });
  }

  /**
   * Inicializar todos los boletos (se ejecuta una sola vez)
   * Crea 1M registros de boletos disponibles
   * @param {number} totalBoletos - Cuántos crear (default 1000000)
   * @returns {Promise<{creados: number}>}
   */
  static async inicializarBoletos(totalBoletos = 1000000) {
    try {
      console.log(`🚀 Inicializando ${totalBoletos} boletos...`);

      // Verificar cuántos existen
      const existentes = await db('boletos_estado').count('* as total').first();
      
      if (existentes.total > 0) {
        console.log(`ℹ️  Ya existen ${existentes.total} boletos en la BD`);
        return { creados: 0, existentes: existentes.total };
      }

      // Crear en batches de 10K para no saturar memoria
      const batchSize = 10000;
      let creados = 0;

      for (let inicio = 0; inicio < totalBoletos; inicio += batchSize) {
        const fin = Math.min(inicio + batchSize - 1, totalBoletos - 1);
        const batch = [];

        for (let i = inicio; i <= fin; i++) {
          batch.push({
            numero: i,
            estado: 'disponible',
            created_at: new Date(),
            updated_at: new Date()
          });
        }

        await db('boletos_estado').insert(batch);
        creados = fin + 1;

        // Log de progreso
        if (creados % 100000 === 0) {
          console.log(`✅ ${creados}/${totalBoletos} boletos creados`);
        }
      }

      console.log(`✅ ${creados} boletos inicializados exitosamente`);
      return { creados };

    } catch (error) {
      console.error('Error inicializarBoletos:', error.message);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de boletos
   * Para dashboard admin
   * @returns {Promise<Object>}
   */
  static async obtenerEstadisticas() {
    try {
      const stats = await db('boletos_estado')
        .select(
          db.raw('estado, COUNT(*) as cantidad')
        )
        .groupBy('estado');

      const resultado = {
        total: 0,
        disponible: 0,
        reservado: 0,
        vendido: 0,
        cancelado: 0
      };

      stats.forEach(s => {
        resultado[s.estado] = s.cantidad;
        resultado.total += s.cantidad;
      });

      return resultado;
    } catch (error) {
      console.error('Error obtenerEstadisticas:', error.message);
      throw error;
    }
  }
}

module.exports = BoletoService;
