const fs = require('fs');
const path = require('path');
const vm = require('vm');

function leerArchivo(relPath) {
    return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function extraerBloque(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    if (start === -1) {
        throw new Error(`No se encontro el inicio: ${startMarker}`);
    }

    const end = source.indexOf(endMarker, start);
    if (end === -1) {
        throw new Error(`No se encontro el fin: ${endMarker}`);
    }

    return source.slice(start, end);
}

describe('Confiabilidad del grid de compra', () => {
    const compraSource = leerArchivo('js/compra.js');
    const socketSource = leerArchivo('js/socket-handler.js');

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('vuelve a consultar el mismo rango si el refresco es forzado', async () => {
        const functionSource = extraerBloque(
            compraSource,
            'async function cargarEstadoRangoVisibleEnBackground',
            '\n// Fallback defensivo'
        );

        const context = {
            console: {
                debug: jest.fn(),
                warn: jest.fn()
            },
            logCompraDebug: jest.fn(),
            encodeURIComponent,
            obtenerClaveEstadoRango: (endpoint, inicio, fin) => `${String(endpoint || '').replace(/\/+$/, '')}::${inicio}-${fin}`,
            fetch: jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    data: {
                        sold: [12],
                        reserved: [18]
                    }
                })
            }),
            procesarBoletosEnBackground: jest.fn(),
            rifaplusEstadoRangoActual: {
                inicio: 0,
                fin: 99,
                cargado: true,
                requestId: 0,
                endpoint: 'https://api.test'
            }
        };

        vm.createContext(context);
        vm.runInContext(functionSource, context);

        const sinForzar = await context.cargarEstadoRangoVisibleEnBackground('https://api.test', 0, 99);
        expect(sinForzar).toBe(true);
        expect(context.fetch).not.toHaveBeenCalled();

        const forzado = await context.cargarEstadoRangoVisibleEnBackground('https://api.test', 0, 99, {
            force: true,
            reason: 'socket'
        });

        expect(forzado).toBe(true);
        expect(context.fetch).toHaveBeenCalledTimes(1);
        expect(context.fetch).toHaveBeenCalledWith(
            'https://api.test/api/public/boletos?inicio=0&fin=99',
            expect.objectContaining({
                cache: 'no-store',
                priority: 'low'
            })
        );
        expect(context.procesarBoletosEnBackground).toHaveBeenCalledWith([12], [18]);
        expect(context.rifaplusEstadoRangoActual.cargado).toBe(true);
    });

    test('cancela trabajo anterior y reaplica estados nuevos del grid por lotes', () => {
        const functionSource = extraerBloque(
            compraSource,
            'function actualizarEstadoBoletosVisibles()',
            '\nfunction inicializarMaquinaSuerteMejorada'
        );

        document.body.innerHTML = `
            <div id="numerosGrid">
                <button data-numero="1"></button>
                <button data-numero="2"></button>
            </div>
        `;

        const observerAnterior = {
            disconnect: jest.fn()
        };
        const frameQueue = [];

        const context = {
            console: {
                debug: jest.fn(),
                warn: jest.fn()
            },
            document,
            navigator: {
                userAgent: 'Chrome'
            },
            requestIdleCallback: (callback) => callback(),
            obtenerEstadoLocalBoletos: () => ({
                soldSet: new Set([1]),
                reservedSet: new Set([2])
            }),
            aplicarFiltroDisponibles: jest.fn(),
            requestAnimationFrame: (callback) => {
                frameQueue.push(callback);
                return 42;
            },
            cancelAnimationFrame: jest.fn(),
            __observerAnterior: observerAnterior,
            __frameAnterior: 7
        };

        vm.createContext(context);
        vm.runInContext(
            `
            var observerEstadoBoletosVisibles = __observerAnterior;
            var filtroDisponiblesActivo = false;
            var actualizacionEstadoGridFrameId = __frameAnterior;
            var actualizacionEstadoGridVersion = 0;
            function obtenerTamanoChunkActualizacionGrid() {
                return 1;
            }
            function aplicarEstadoVisualABoton(boton, soldSet, reservedSet) {
                const numero = parseInt(boton.getAttribute('data-numero'), 10);
                boton.classList.toggle('sold', soldSet.has(numero));
                boton.classList.toggle('reserved', reservedSet.has(numero));
                boton.disabled = soldSet.has(numero) || reservedSet.has(numero);
            }
            ${functionSource}
            function __obtenerEstadoFrame() {
                return {
                    observer: observerEstadoBoletosVisibles,
                    frameId: actualizacionEstadoGridFrameId,
                    version: actualizacionEstadoGridVersion
                };
            }
            `,
            context
        );

        context.actualizarEstadoBoletosVisibles();
        while (frameQueue.length > 0) {
            const callback = frameQueue.shift();
            callback();
        }

        expect(observerAnterior.disconnect).toHaveBeenCalledTimes(1);
        expect(context.cancelAnimationFrame).toHaveBeenCalledWith(7);

        const estado = context.__obtenerEstadoFrame();
        expect(estado.observer).toBe(null);
        expect(estado.frameId).toBe(0);
        expect(estado.version).toBe(1);

        const botones = document.querySelectorAll('#numerosGrid button');
        expect(botones[0].classList.contains('sold')).toBe(true);
        expect(botones[0].disabled).toBe(true);
        expect(botones[1].classList.contains('reserved')).toBe(true);
        expect(botones[1].disabled).toBe(true);
    });

    test('los eventos de socket actualizan contadores y fuerzan resincronizacion del grid', () => {
        document.body.innerHTML = '<div id="availabilityNote"></div>';

        const context = {
            console: {
                log: jest.fn(),
                warn: jest.fn(),
                error: jest.fn()
            },
            document,
            CustomEvent,
            setTimeout: jest.fn(() => 1),
            clearTimeout: jest.fn(),
            setInterval: jest.fn(() => 1),
            clearInterval: jest.fn()
        };
        context.window = context;

        vm.createContext(context);
        vm.runInContext(socketSource, context);

        context.rifaplusConfig = {
            estado: {
                boletosVendidos: 0,
                boletosApartados: 0,
                boletosDisponibles: 100
            }
        };
        context.solicitarRefrescoEstadoBoletosActual = jest.fn();

        context.rifaplusSocketHandler._onBoletosActualizados({
            vendidos: 5,
            apartados: 7,
            disponibles: 88
        });

        expect(context.rifaplusConfig.estado).toEqual({
            boletosVendidos: 5,
            boletosApartados: 7,
            boletosDisponibles: 88
        });
        expect(document.getElementById('availabilityNote').textContent).toBe('88 boletos disponibles');
        expect(context.solicitarRefrescoEstadoBoletosActual).toHaveBeenCalledWith({
            motivo: 'socket-boletos-actualizados',
            delayMs: 40,
            fullRefresh: true
        });
    });
});
