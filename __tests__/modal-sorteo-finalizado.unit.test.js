const fs = require('fs');
const path = require('path');
const vm = require('vm');

function leerArchivo(relPath) {
    return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

describe('Modal sorteo finalizado', () => {
    const source = leerArchivo('js/modal-sorteo-finalizado.js');

    function cargarModalEnContexto() {
        document.body.innerHTML = '';
        document.head.innerHTML = '';

        const context = {
            window,
            document,
            console,
            sessionStorage,
            localStorage,
            setTimeout,
            clearTimeout
        };

        vm.createContext(context);
        vm.runInContext(source, context);

        return context.window.ModalSorteoFinalizado;
    }

    test('el boton verificar dispara la navegacion restringida al hacer click directo', () => {
        const ModalSorteoFinalizado = cargarModalEnContexto();
        const instancia = new ModalSorteoFinalizado();

        document.body.innerHTML = `
            <div id="modalSorteoFinalizadoOverlay">
                <a id="btnVerMisBoletos" class="btn btn-verificar" href="mis-boletos-restringido.html">Verificar</a>
            </div>
        `;

        const navegarSpy = jest
            .spyOn(instancia, 'navegarAMisBoletosRestringido')
            .mockImplementation(() => {});

        instancia.configurarEventListeners();

        document.getElementById('btnVerMisBoletos').click();

        expect(navegarSpy).toHaveBeenCalledTimes(1);
    });

    test('genera el boton verificar con enlace nativo al destino restringido', () => {
        const ModalSorteoFinalizado = cargarModalEnContexto();
        const instancia = new ModalSorteoFinalizado();

        const html = instancia.generarHTMLModal({
            documentos: {},
            fechaCierre: new Date().toISOString(),
            fechaCierreFormato: 'Hoy',
            mensajeAgradecimiento: 'Gracias'
        }, {
            sorteoActivo: {
                nombreSorteo: 'Sorteo Test'
            },
            cliente: {
                nombre: 'Organizador Test'
            }
        }, {
            sorteo: [],
            presorteo: [],
            ruletazos: []
        });

        expect(html).toContain('id="btnVerMisBoletos"');
        expect(html).toContain('href="mis-boletos-restringido.html"');
    });

    test('ignora snapshots de otra rifa y deja ganadores vacios si el servidor no devuelve ninguno', async () => {
        const ModalSorteoFinalizado = cargarModalEnContexto();
        const instancia = new ModalSorteoFinalizado();

        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: [] })
        });

        const configActual = {
            backend: { apiBase: 'https://api.test' },
            rifa: {
                edicionNombre: 'Edicion 2',
                nombreSorteo: 'Rifa Nueva',
                fechaSorteo: '2026-05-01T00:00:00.000Z',
                totalBoletos: 1000,
                precioBoleto: 10
            }
        };

        const snapshotViejo = {
            meta: {
                huellaRifa: JSON.stringify({
                    edicionNombre: 'Edicion 1',
                    nombreSorteo: 'Rifa Vieja',
                    fechaSorteo: '2026-04-01T00:00:00.000Z',
                    totalBoletos: 500,
                    precioBoleto: 5
                })
            },
            ganadores: {
                sorteo: [{ numero: '123' }],
                presorteo: [],
                ruletazos: []
            }
        };

        const ganadores = await instancia.obtenerGanadoresReales(snapshotViejo, configActual);

        expect(ganadores).toEqual({
            sorteo: [],
            presorteo: [],
            ruletazos: []
        });
    });
});
