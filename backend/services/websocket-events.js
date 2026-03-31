// backend/services/websocket-events.js
// Servicios de eventos WebSocket para actualización en tiempo real
// Emite a todos los clientes conectados cuando hay cambios en boletos/órdenes

/**
 * Inicializa los eventos de WebSocket
 * Se llama desde server.js una vez que socket.io está configurado
 * 
 * @param {Object} io - Instancia de socket.io
 * @returns {Object} Funciones públicas para emitir eventos
 */
function inicializarEventosWebSocket(io) {
    console.log('🔌 [WebSocket] Inicializando eventos de tiempo real...');

    // Namespace /boletos para eventos relacionados con boletos
    const boletosNamespace = io.of('/boletos');

    // Rastrear clientes conectados (para debugging)
    let clientesConectados = 0;

    boletosNamespace.on('connection', (socket) => {
        clientesConectados++;
        console.log(`✅ [WebSocket] Cliente conectado: ${socket.id} (Total: ${clientesConectados})`);

        // Escuchar heartbeat para detectar clientes "vivos"
        socket.on('ping', (callback) => {
            if (typeof callback === 'function') {
                callback('pong');
            }
        });

        // Limpiar contador al desconectar
        socket.on('disconnect', () => {
            clientesConectados--;
            console.log(`🔌 [WebSocket] Cliente desconectado: ${socket.id} (Total: ${clientesConectados})`);
        });

        // Manejar errores de conexión
        socket.on('error', (error) => {
            console.error(`❌ [WebSocket] Error en socket ${socket.id}:`, error);
        });
    });

    /**
     * Emitir evento cuando cambien los boletos disponibles
     * Se llama desde POST /api/ordenes después de guardar la orden
     * 
     * @param {Object} cambios - Objeto con cambios: { vendidos, apartados, disponibles, nuevosBoletos }
     */
    function emitirCambioBoletosDisponibles(cambios) {
        const evento = {
            timestamp: new Date().toISOString(),
            tipo: 'actualización',
            ...cambios
        };

        console.log(`📤 [WebSocket] Emitiendo cambio de boletos:`, {
            vendidos: cambios.vendidos,
            apartados: cambios.apartados,
            disponibles: cambios.disponibles,
            clientes: boletosNamespace.sockets.size
        });

        // Emitir a todos los clientes conectados al namespace /boletos
        boletosNamespace.emit('boletosActualizados', evento);
    }

    /**
     * Emitir evento cuando se crea una nueva orden
     * 
     * @param {Array} numerosApartados - Array de números que se acaban de apartar
     * @param {Object} metadatos - Info adicional (cantidad, cliente, etc)
     */
    function emitirNuevaOrden(numerosApartados = [], metadatos = {}) {
        const evento = {
            timestamp: new Date().toISOString(),
            tipo: 'nuevaOrden',
            boletos: numerosApartados,
            cantidad: numerosApartados.length,
            metadatos // { clienteNombre, whatsapp, etc }
        };

        console.log(`📤 [WebSocket] Emitiendo nueva orden:`, {
            cantidad: numerosApartados.length,
            clientes: boletosNamespace.sockets.size
        });

        boletosNamespace.emit('ordenCreada', evento);
    }

    /**
     * Emitir evento cuando una orden se cancela/expira
     * 
     * @param {Array} numerosLiberados - Números que vuelven a quedar disponibles
     * @param {string} razon - Razón de la cancelación (expiración, usuario, etc)
     */
    function emitirOrdenCancelada(numerosLiberados = [], razon = 'cancelación') {
        const evento = {
            timestamp: new Date().toISOString(),
            tipo: 'ordenCancelada',
            boletos: numerosLiberados,
            cantidad: numerosLiberados.length,
            razon
        };

        console.log(`📤 [WebSocket] Emitiendo cancelación:`, {
            cantidad: numerosLiberados.length,
            razon,
            clientes: boletosNamespace.sockets.size
        });

        boletosNamespace.emit('ordenCancelada', evento);
    }

    /**
     * Obtener estadísticas de conexiones (para debugging)
     */
    function obtenerEstadisticas() {
        return {
            clientesConectados,
            sockets: boletosNamespace.sockets.size,
            timestamp: new Date().toISOString()
        };
    }

    // Retornar interfaz pública
    return {
        emitirCambioBoletosDisponibles,
        emitirNuevaOrden,
        emitirOrdenCancelada,
        obtenerEstadisticas,
        boletosNamespace
    };
}

module.exports = { inicializarEventosWebSocket };
