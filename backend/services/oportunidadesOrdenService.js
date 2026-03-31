/**
 * ============================================================
 * ARCHIVO: backend/services/oportunidadesOrdenService.js (NUEVO)
 * DESCRIPCIÓN: Servicio para gestionar oportunidades
 * ESTRATEGIA: Idéntico a BoletoService - sin complicaciones
 * ============================================================
 */

const db = require('../db');

class OportunidadesOrdenService {
    /**
    /**
     * REMOVED METHODS (Old dynamic opportunity assignment)
     * 
     * The following methods were removed as they are no longer needed
     * with the new pre-assigned opportunities system in the database:
     * 
     * - guardarOportunidades() - Used to assign opportunities dynamically
     * - generarYGuardarOportunidades() - Used to generate and assign opportunities
     * 
     * NEW FLOW:
     * 1. Population phase: 750k pre-assigned opportunities (3 per boleto)
     * 2. Order creation: FK CASCADE automatically updates orden_oportunidades
     * 3. Retrieval: obtenerOportunidades() returns assigned opportunities
     */


    static async obtenerOportunidades(numeroOrden) {
        try {
            const opps = await db('orden_oportunidades')
                .where('numero_orden', numeroOrden)
                .pluck('numero_oportunidad');
            
            // ✅ Retornar estructura CORRECTA con 'tipo'
            if (opps.length === 0) {
                return { tipo: 'no_data', data: [], error: null };
            }
            
            return { tipo: 'success', data: opps, error: null };
        } catch (error) {
            console.error(`Error obtenerOportunidades:`, error.message);
            return { tipo: 'error', data: [], error: error.message };
        }
    }

    /**
     * Liberar oportunidades cuando se cancela orden
     */
    static async liberarOportunidades(numeroOrden) {
        try {
            const cantidad = await db('orden_oportunidades')
                .where('numero_orden', numeroOrden)
                .whereIn('estado', ['apartado', 'vendido'])
                .update({
                    numero_orden: null,
                    estado: 'disponible'
                });

            console.log(`✅ Liberadas ${cantidad} oportunidades de ${numeroOrden}`);
            return { success: true, cantidad };
        } catch (error) {
            console.error(`Error liberarOportunidades:`, error.message);
            throw error;
        }
    }

    /**
     * Estadísticas
     */
    static async obtenerEstadisticas() {
        try {
            const resultado = await db('orden_oportunidades')
                .select(
                    db.raw('COUNT(*) as total'),
                    db.raw(`SUM(CASE WHEN estado = 'disponible' AND numero_orden IS NULL THEN 1 ELSE 0 END) as disponibles`),
                    db.raw(`SUM(CASE WHEN estado = 'apartado' THEN 1 ELSE 0 END) as apartadas`),
                    db.raw(`SUM(CASE WHEN estado = 'vendido' THEN 1 ELSE 0 END) as vendidas`)
                )
                .first();

            return {
                total: resultado?.total || 0,
                disponibles: resultado?.disponibles || 0,
                apartadas: resultado?.apartadas || 0,
                vendidas: resultado?.vendidas || 0
            };
        } catch (error) {
            console.error(`Error obtenerEstadisticas:`, error.message);
            return { total: 0, disponibles: 0, apartadas: 0, vendidas: 0 };
        }
    }
}

module.exports = OportunidadesOrdenService;
