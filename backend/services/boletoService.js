/**
 * Servicio: Gestión de boletos para 1M+ registros
 * Maneja reservas, ventas y disponibilidad de forma optimizada
 * 
 * Características:
 * - Queries optimizadas con índices
 * - Transacciones para prevenir race conditions
 * - Reservas temporales durante checkout
 * - Expiración automática de reservas
 */

const db = require('../db');

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
          // CUALQUIER otro estado (reservado, vendido, cancelado) = conflicto
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
   * @param {Array<number>} numeros - Boletos a reservar
   * @param {string} ordenId - ID de la orden
   * @param {Object} datos - Datos de la orden
   * @returns {Promise<{success: boolean, ordenId: string}>}
   */
  static async crearOrdenConBoletos(numeros, ordenId, datos) {
    // VALIDACIÓN 1: Parámetros requeridos
    if (!numeros || !ordenId || !datos) {
      throw new Error('Parámetros requeridos: numeros, ordenId, datos');
    }

    // VALIDACIÓN 2: Que numeros sea un array
    if (!Array.isArray(numeros)) {
      throw new Error(`Los boletos deben ser un array. Recibido: ${typeof numeros}`);
    }

    if (numeros.length === 0) {
      throw new Error('Se requiere al menos un boleto');
    }

    if (numeros.length > 60000) {
      throw new Error('Máximo 60,000 boletos por orden');
    }

    // VALIDACIÓN 3: Convertir todos a números y validar
    const numerosValidos = numeros.map(n => {
      const num = Number(n);
      if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
        throw new Error(`Número de boleto inválido: ${n}`);
      }
      return num;
    });

    // VALIDACIÓN 3.5: DETECTAR BOLETOS DUPLICADOS EN LA MISMA ORDEN
    const boletos_unicos = new Set(numerosValidos);
    if (boletos_unicos.size !== numerosValidos.length) {
      const duplicados = numerosValidos.filter((num, idx) => numerosValidos.indexOf(num) !== idx);
      const duplicadosUnicos = [...new Set(duplicados)];
      throw new Error(`Boletos duplicados en la orden: ${duplicadosUnicos.join(', ')}`);
    }

    // VALIDACIÓN 4: Datos de orden
    if (typeof datos.nombreCliente !== 'string' || datos.nombreCliente.trim().length === 0) {
      throw new Error('Nombre del cliente requerido');
    }
    if (typeof datos.telefonoCliente !== 'string' || datos.telefonoCliente.length < 10) {
      throw new Error('Teléfono inválido');
    }
    if (typeof datos.precioUnitario !== 'number' || datos.precioUnitario <= 0) {
      throw new Error('Precio unitario inválido');
    }
    if (typeof datos.total !== 'number' || datos.total <= 0) {
      throw new Error('Total inválido');
    }

    // VALIDACIÓN 5: Validar ID de orden
    if (typeof ordenId !== 'string' || ordenId.trim().length === 0 || ordenId.length > 50) {
      throw new Error('ID de orden inválido (1-50 caracteres)');
    }

    return db.transaction(async (trx) => {
      try {
        // PASO 1: Verificar que NO hay órdenes duplicadas
        const ordenExistente = await trx('ordenes')
          .where('numero_orden', ordenId)
          .first();

        if (ordenExistente) {
          throw new Error('DUPLICATE_ORDER');
        }

        // PASO 2: Verificar disponibilidad de todos los boletos CON LOCK
        const boletosActuales = await trx('boletos_estado')
          .whereIn('numero', numerosValidos)
          .forUpdate()  // LOCK exclusivo en PostgreSQL
          .select('numero', 'estado');

        // Verificar que existan TODOS, si no existen CREARLOS
        const numerosEncontrados = new Set(boletosActuales.map(b => b.numero));
        const faltantes = numerosValidos.filter(n => !numerosEncontrados.has(n));
        
        // Si hay boletos faltantes, crearlos automáticamente como disponibles (en batches)
        if (faltantes.length > 0) {
          const ahora = new Date();
          const BATCH_CREATE = 1000;  // Reducido de 5000 a 1000 para mejor rendimiento
          
          for (let i = 0; i < faltantes.length; i += BATCH_CREATE) {
            const batch = faltantes.slice(i, i + BATCH_CREATE);
            const boletosParaCrear = batch.map(numero => ({
              numero: numero,
              estado: 'disponible',
              created_at: ahora,
              updated_at: ahora
            }));
            
            await trx('boletos_estado').insert(boletosParaCrear);
          }
          
          console.log(`[BoletoService] Creados ${faltantes.length} boletos faltantes`);
          
          // Re-cargar los boletos ahora que todos existen
          const boletosActualesRe = await trx('boletos_estado')
            .whereIn('numero', numerosValidos)
            .forUpdate()
            .select('numero', 'estado');
          
          boletosActuales.length = 0;
          boletosActuales.push(...boletosActualesRe);
        }

        // Verificar que TODOS sean disponibles
        const conflictos = boletosActuales.filter(b => b.estado !== 'disponible');
        if (conflictos.length > 0) {
          const conflictosStr = conflictos.map(c => `${c.numero}(${c.estado})`).join(', ');
          throw new Error(`Boletos no disponibles: ${conflictosStr}`);
        }

        // PASO 3: Crear orden
        const ordenData = {
          numero_orden: ordenId,
          cantidad_boletos: numerosValidos.length,
          precio_unitario: Math.round(datos.precioUnitario * 100) / 100,
          subtotal: Math.round(datos.subtotal * 100) / 100,
          descuento: Math.round((datos.descuento || 0) * 100) / 100,
          total: Math.round(datos.total * 100) / 100,
          nombre_cliente: (datos.nombreCliente || '').trim().slice(0, 100),
          estado_cliente: (datos.estadoCliente || '').trim().slice(0, 50),
          ciudad_cliente: (datos.ciudadCliente || '').trim().slice(0, 50),
          telefono_cliente: (datos.telefonoCliente || '').trim().slice(0, 20),
          metodo_pago: (datos.metodoPago || 'transferencia').slice(0, 20),
          detalles_pago: (datos.detallesPago || '').slice(0, 255),
          estado: 'pendiente',
          boletos: JSON.stringify(numerosValidos),
          notas: (datos.notas || '').slice(0, 500),
          created_at: new Date(),
          updated_at: new Date()
        };

        const insertResult = await trx('ordenes').insert(ordenData);
        console.log('[BoletoService] Orden insertada:', { ordenId, registros: insertResult });

        // PASO 4: Actualizar estado de boletos (ATÓMICO) - En batches para mejor performance
        const BATCH_SIZE = 1000;  // Aumentado de 5000 a 1000 para mejor paralelismo
        let totalActualizados = 0;
        const ahora = new Date();

        for (let i = 0; i < numerosValidos.length; i += BATCH_SIZE) {
          const batch = numerosValidos.slice(i, i + BATCH_SIZE);
          const actualizados = await trx('boletos_estado')
            .whereIn('numero', batch)
            .update({
              estado: 'reservado',
              numero_orden: ordenId,
              reservado_en: ahora,
              updated_at: ahora
            });
          totalActualizados += actualizados;
        }

        if (totalActualizados !== numerosValidos.length) {
          throw new Error(
            `Inconsistencia: se actualizaron ${totalActualizados} boletos de ${numerosValidos.length}`
          );
        }

        console.log('[BoletoService] Orden completada:', { 
          ordenId, 
          boletos: numerosValidos.length,
          total: ordenData.total
        });

        return {
          success: true,
          ordenId: ordenId,
          cantidad: numerosValidos.length,
          total: ordenData.total
        };

      } catch (transactionError) {
        // Rollback automático de transacción
        console.error('[BoletoService] Error en transacción:', {
          ordenId,
          error: transactionError.message,
          code: transactionError.code
        });
        throw transactionError;
      }
    }).catch(error => {
      // Capturar errores de transacción fallida
      console.error('[BoletoService] Error crítico:', error.message);
      throw error;
    });
  }

  /**
   * Confirmar venta: cambiar boletos de RESERVADO a VENDIDO
   * @param {string} ordenId - ID de la orden
   * @returns {Promise<{success: boolean}>}
   */
  static async confirmarVenta(ordenId) {
    try {
      const resultado = await db('boletos_estado')
        .where('numero_orden', ordenId)
        .where('estado', 'reservado')
        .update({
          estado: 'vendido',
          vendido_en: new Date(),
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
   * @param {string} ordenId - ID de la orden
   * @returns {Promise<{success: boolean}>}
   */
  static async cancelarOrden(ordenId) {
    return db.transaction(async (trx) => {
      try {
        // Cambiar boletos a disponibles
        await trx('boletos_estado')
          .where('numero_orden', ordenId)
          .update({
            estado: 'disponible',
            numero_orden: null,
            reservado_en: null,
            updated_at: new Date()
          });

        // Cambiar orden a cancelada
        await trx('ordenes')
          .where('numero_orden', ordenId)
          .update({
            estado: 'cancelada',
            updated_at: new Date()
          });

        return { success: true };
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
            reservado_en: null,
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

      for (let inicio = 1; inicio <= totalBoletos; inicio += batchSize) {
        const fin = Math.min(inicio + batchSize - 1, totalBoletos);
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
        creados = fin;

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
