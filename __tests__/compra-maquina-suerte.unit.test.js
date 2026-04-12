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

describe('Maquina de la suerte', () => {
    const compraSource = leerArchivo('js/compra.js');

    test('solicita hasta 5000 en una sola llamada y excluye solo los seleccionados reales', async () => {
        document.body.innerHTML = '<div id="numerosSuerte" data-numeros="11,22,33"></div>';

        const functionSource = extraerBloque(
            compraSource,
            'async function generarNumerosVerificadosEnServidor(cantidad)',
            '\nasync function cargarEstadoRangoVisibleEnBackground'
        );

        const context = {
            document,
            Set,
            Array,
            Number,
            JSON,
            selectedNumbersGlobal: new Set([7, 8]),
            fetch: jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    success: true,
                    boletos: [101, 202, 303]
                })
            }),
            obtenerApiBaseCompra: jest.fn(() => 'https://api.test')
        };

        vm.createContext(context);
        vm.runInContext(`${functionSource}; this.generarNumerosVerificadosEnServidor = generarNumerosVerificadosEnServidor;`, context);

        const resultado = await context.generarNumerosVerificadosEnServidor(5000);

        expect(resultado).toEqual([101, 202, 303]);
        expect(context.fetch).toHaveBeenCalledTimes(1);
        expect(context.fetch).toHaveBeenCalledWith(
            'https://api.test/api/boletos/disponibles-aleatorios',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cantidad: 5000,
                    excludeNumbers: [7, 8]
                })
            })
        );
    });

    test('propaga el mensaje del backend cuando la solicitud falla', async () => {
        document.body.innerHTML = '<div id="numerosSuerte"></div>';

        const functionSource = extraerBloque(
            compraSource,
            'async function generarNumerosVerificadosEnServidor(cantidad)',
            '\nasync function cargarEstadoRangoVisibleEnBackground'
        );

        const context = {
            document,
            Set,
            Array,
            Number,
            JSON,
            selectedNumbersGlobal: new Set(),
            fetch: jest.fn().mockResolvedValue({
                ok: false,
                status: 400,
                json: async () => ({
                    message: 'No se pueden solicitar mas de 5000 boletos aleatorios por intento'
                })
            }),
            obtenerApiBaseCompra: jest.fn(() => 'https://api.test')
        };

        vm.createContext(context);
        vm.runInContext(`${functionSource}; this.generarNumerosVerificadosEnServidor = generarNumerosVerificadosEnServidor;`, context);

        await expect(context.generarNumerosVerificadosEnServidor(5001)).rejects.toThrow(
            'No se pueden solicitar mas de 5000 boletos aleatorios por intento'
        );
    });
});
