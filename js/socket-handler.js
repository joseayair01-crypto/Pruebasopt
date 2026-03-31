// js/socket-handler.js
// Cliente WebSocket para actualizaciones en tiempo real de boletos
// Reemplaza polling de 5 minutos por actualizaciones instantáneas vía WebSocket
// Con fallback automático a polling si WebSocket falla

class SocketHandler {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000; // 3 segundos inicial
        this.fallbackToPolling = false;
    }

    /**
     * Cargar dinámicamente el script socket.io desde el backend
     * Detecta automáticamente si estamos en desarrollo o producción
     */
    async cargarSocketIOScript() {
        return new Promise((resolve, reject) => {
            // Verificar si socket.io ya está cargado
            if (typeof io !== 'undefined') {
                console.log('✅ [Socket] socket.io ya está cargado en window.io');
                resolve(true);
                return;
            }

            // Obtener URL dinámica del environment config
            const socketUrl = window.RIFAPLUS_ENV?.socketUrl
                || window.rifaplusConfig?.obtenerSocketScriptUrl?.()
                || `${window.rifaplusConfig?.backend?.apiBase || window.location.origin}/socket.io/socket.io.js`;
            
            // console.log(`📕 [Socket] Cargando socket.io desde: ${socketUrl}`);

            const script = document.createElement('script');
            script.src = socketUrl;
            script.async = true;
            script.onerror = () => {
                console.error('❌ [Socket] Error cargando socket.io');
                reject(new Error('Socket.io script load failed'));
            };
            script.onload = () => {
                // console.log('✅ [Socket] socket.io cargado exitosamente');
                resolve(true);
            };
            document.head.appendChild(script);
        });
    }

    /**
     * Inicializar conexión WebSocket
     * Se llama desde compra.html después de que se carga todo
     */
    async iniciar() {
        // console.log('🔌 [Socket] Iniciando cliente WebSocket...');

        try {
            // PASO 1: Cargar socket.io script dinámicamente (si aún no está cargado)
            await this.cargarSocketIOScript();
        } catch (loadError) {
            console.error('❌ [Socket] No se pudo cargar socket.io:', loadError.message);
            console.warn('⚠️  [Socket] Socket.io client no disponible. Fallback a polling.');
            this.fallbackToPolling = true;
            return false;
        }

        // Verificar si socket.io está disponible en window
        if (typeof io === 'undefined') {
            console.warn('⚠️  [Socket] Socket.io client no disponible. Fallback a polling.');
            this.fallbackToPolling = true;
            return false;
        }

        try {
            // Conectarse al servidor WebSocket
            const apiBase = (window.RIFAPLUS_ENV?.apiBase)
                || (window.rifaplusConfig?.backend?.apiBase)
                || (window.rifaplusConfig?.obtenerApiBase?.())
                || window.location.origin;
            
            this.socket = io(`${apiBase}/boletos`, {
                reconnection: true,
                reconnectionDelay: this.reconnectDelay,
                reconnectionDelayMax: 30000,
                reconnectionAttempts: 10,
                transports: ['websocket', 'polling'], // Intentar WebSocket primero, fallback a polling
                autoConnect: true
            });

            // Listeners de conexión
            this.socket.on('connect', () => this._onConnect());
            this.socket.on('disconnect', () => this._onDisconnect());
            this.socket.on('error', (error) => this._onError(error));

            // Listeners de eventos de cambios
            this.socket.on('boletosActualizados', (evento) => this._onBoletosActualizados(evento));
            this.socket.on('ordenCreada', (evento) => this._onOrdenCreada(evento));
            this.socket.on('ordenCancelada', (evento) => this._onOrdenCancelada(evento));

            console.log('✅ [Socket] Cliente WebSocket inicializado');
            return true;

        } catch (error) {
            console.error('❌ [Socket] Error inicializando WebSocket:', error.message);
            this.fallbackToPolling = true;
            return false;
        }
    }

    /**
     * Manejador: Conexión exitosa
     */
    _onConnect() {
        // console.log(`✅ [Socket] Conectado al servidor: ${this.socket.id}`);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Notificar que WebSocket está activo
        this._emitirEvento('socketConectado');
    }

    /**
     * Manejador: Desconexión
     */
    _onDisconnect(razon) {
        // console.warn(`🔌 [Socket] Desconectado: ${razon}`);
        this.isConnected = false;
        this._emitirEvento('socketDesconectado');
    }

    /**
     * Manejador: Error de conexión
     */
    _onError(error) {
        console.error(`❌ [Socket] Error de conexión:`, error);
        
        // Si hay muchos errores, fallback a polling
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn(`⚠️  [Socket] Demasiados intentos fallidos. Fallback a polling.`);
            this.fallbackToPolling = true;
            this.desconectar();
            this._activarPollingFallback();
        }
    }

    /**
     * Manejador: Evento de actualización de boletos disponibles
     */
    _onBoletosActualizados(evento) {
        console.log(`📤 [Socket] Boletos actualizados:`, {
            vendidos: evento.vendidos,
            apartados: evento.apartados,
            disponibles: evento.disponibles
        });

        // Actualizar UI sin necesidad de polling
        if (typeof actualizarEstadoBoletosVisibles === 'function') {
            actualizarEstadoBoletosVisibles();
        }

        // Actualizar contador de disponibles
        const availabilityNote = document.getElementById('availabilityNote');
        if (availabilityNote && evento.disponibles !== undefined) {
            availabilityNote.textContent = `${evento.disponibles} boletos disponibles`;
        }

        // Emitir evento global para otros listeners
        this._emitirEvento('boletosActualizados', evento);
    }

    /**
     * Manejador: Nueva orden creada (otro usuario)
     */
    _onOrdenCreada(evento) {
        console.log(`📦 [Socket] Nueva orden detectada:`, {
            cantidad: evento.cantidad,
            timestamp: evento.timestamp
        });

        // Refrescar disponibilidad si es necesario
        if (typeof cargarBoletosPublicos === 'function') {
            cargarBoletosPublicos().catch(e => {
                console.warn('⚠️  Error refrescando disponibilidad:', e.message);
            });
        }

        this._emitirEvento('ordenCreada', evento);
    }

    /**
     * Manejador: Orden cancelada/expirada (boletos liberados)
     */
    _onOrdenCancelada(evento) {
        console.log(`✅ [Socket] Orden cancelada - Boletos liberados:`, {
            cantidad: evento.cantidad,
            razon: evento.razon
        });

        // Refrescar disponibilidad
        if (typeof cargarBoletosPublicos === 'function') {
            cargarBoletosPublicos().catch(e => {
                console.warn('⚠️  Error refrescando disponibilidad:', e.message);
            });
        }

        this._emitirEvento('ordenCancelada', evento);
    }

    /**
     * Fallback: Si WebSocket no funciona, reactivar polling
     */
    _activarPollingFallback() {
        console.warn('⚠️  [Socket] Activando polling como fallback...');
        
        // Restaurar el polling original (5 minutos)
        if (typeof cargarBoletosPublicos === 'function') {
            // Ejecutar inmediatamente
            cargarBoletosPublicos().catch(e => {
                console.warn('Error en polling fallback:', e.message);
            });

            // Programar cada 5 minutos
            if (window.rifaplusFetchTimeoutId) {
                clearTimeout(window.rifaplusFetchTimeoutId);
            }
            window.rifaplusFetchTimeoutId = setInterval(
                cargarBoletosPublicos,
                300000 // 5 minutos
            );
        }
    }

    /**
     * Emitir evento global customizado
     */
    _emitirEvento(nombreEvento, datos) {
        try {
            const evento = new CustomEvent(`rifaplus:${nombreEvento}`, {
                detail: datos
            });
            document.dispatchEvent(evento);
        } catch (e) {
            console.warn(`Advertencia emitiendo evento ${nombreEvento}:`, e.message);
        }
    }

    /**
     * Desconectar explícitamente
     */
    desconectar() {
        if (this.socket) {
            console.log('🔌 [Socket] Desconectando...');
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
        }
    }

    /**
     * Obtener estado de la conexión
     */
    estaConectado() {
        return this.isConnected && !this.fallbackToPolling;
    }

    /**
     * Obtener información de estadísticas
     */
    obtenerEstadisticas() {
        return {
            conectado: this.isConnected,
            fallbackActivo: this.fallbackToPolling,
            socketId: this.socket?.id || null,
            intentosReconexion: this.reconnectAttempts
        };
    }
}

// ✅ Instancia global
window.rifaplusSocketHandler = new SocketHandler();

// 🔌 Inicializar WebSocket cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 [Socket] DOM listo, iniciando WebSocket...');
    
    // Esperar un poco a que se carguen las dependencias
    setTimeout(async () => {
        try {
            const inicializado = await window.rifaplusSocketHandler.iniciar();
            if (!inicializado) {
                console.warn('⚠️  [Socket] WebSocket no inicializado, usando polling');
            }
        } catch (e) {
            console.error('❌ [Socket] Error en inicialización:', e.message);
        }
    }, 500);
});

// Mantener conexión viva con heartbeat
setInterval(() => {
    if (window.rifaplusSocketHandler && window.rifaplusSocketHandler.socket) {
        window.rifaplusSocketHandler.socket.emit('ping');
    }
}, 30000); // Cada 30 segundos
