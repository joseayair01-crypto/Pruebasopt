// js/environment-config.js
// Detecta automáticamente si estamos en desarrollo o producción
// y configura las URLs correctas para socket.io y API

(function setupEnvironment() {
    console.log('⚙️  [Environment] Detectando entorno...');
    
    // Obtener hostname actual (ej: localhost, 127.0.0.1, rifas-torres.com, etc)
    const hostname = window.location.hostname;
    const protocol = window.location.protocol; // http: o https:
    
    const apiBase = typeof window.rifaplusConfig?.obtenerApiBase === 'function'
        ? window.rifaplusConfig.obtenerApiBase()
        : (hostname === 'localhost' || hostname === '127.0.0.1'
            ? 'http://localhost:5001'
            : `${protocol}//${hostname}`);

    const socketUrl = typeof window.rifaplusConfig?.obtenerSocketScriptUrl === 'function'
        ? window.rifaplusConfig.obtenerSocketScriptUrl()
        : `${apiBase}/socket.io/socket.io.js`;

    console.log(
        (hostname === 'localhost' || hostname === '127.0.0.1')
            ? '🔧 [Environment] DESARROLLO detectado'
            : '🌍 [Environment] PRODUCCIÓN detectado'
    );
    
    // Guardar en window para que otros scripts los usen
    window.RIFAPLUS_ENV = {
        apiBase,
        socketUrl,
        hostname,
        protocol,
        isProduction: !['localhost', '127.0.0.1'].includes(hostname),
        isDevelopment: ['localhost', '127.0.0.1'].includes(hostname)
    };
    
    console.log('✅ [Environment] Config cargada:', {
        apiBase,
        socketUrl,
        isDevelopment: window.RIFAPLUS_ENV.isDevelopment,
        isProduction: window.RIFAPLUS_ENV.isProduction
    });
})();
