(() => {
    const HERO_SUBTITULO = 'Elige tus boletos y participa ahora';
    const HERO_TITULO_DEFAULT = 'Estás a un paso de ser el próximo ganador';
    const FOOTER_ESLOGAN_DEFAULT = 'Rifas 100% Transparentes y Seguras';
    const REMOTE_PRICE_TTL_MS = 15000;
    const LOCAL_PRICE_CACHE_KEY = 'rifaplus_compra_precio_cache_v1';

    let promocionesSnapshot = '';
    let bonosSnapshot = '';
    let footerSnapshot = '';
    let remotePriceValue = null;
    let remotePriceFetchedAt = 0;
    let remotePricePromise = null;
    let renderPublicoPendiente = false;
    let renderFooterPendiente = false;
    let pageReadyCompraEmitida = false;

    function notificarPaginaListaCompra() {
        window.dispatchEvent(new CustomEvent('rifaplus:page-ready', {
            detail: { page: 'compra' }
        }));
    }

    function esHeroCompraListo() {
        const hero = document.querySelector('.compra-hero');
        const title = document.getElementById('compraHeroTitle');
        const subtitle = document.getElementById('compraHeroSub');

        if (!hero || !title || !subtitle) {
            return false;
        }

        return Boolean(String(title.textContent || '').trim())
            && Boolean(String(subtitle.textContent || '').trim());
    }

    function esCardPrecioCompraLista() {
        const card = document.getElementById('precioCardCompra');
        const precio = document.getElementById('precioDinamico');

        if (!card || !precio) {
            return false;
        }

        return !card.classList.contains('loading')
            && card.getAttribute('aria-busy') !== 'true'
            && Boolean(String(precio.textContent || '').trim());
    }

    function evaluarPaginaListaCompra() {
        if (pageReadyCompraEmitida) {
            return;
        }

        if (!esHeroCompraListo() || !esCardPrecioCompraLista()) {
            return;
        }

        pageReadyCompraEmitida = true;
        requestAnimationFrame(() => {
            notificarPaginaListaCompra();
        });
    }

    function cuandoDomEsteListo(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
            return;
        }

        callback();
    }

    function obtenerConfigCompra() {
        return window.rifaplusConfig && typeof window.rifaplusConfig === 'object'
            ? window.rifaplusConfig
            : {};
    }

    function obtenerUtilidadesHeroCompra() {
        const heroUtils = window.__RIFAPLUS_COMPRA_HERO_UTILS__;
        if (heroUtils?.resolverNombreSorteo && heroUtils?.construirTitulo) {
            return heroUtils;
        }

        return {
            normalizarTexto(valor) {
                return String(valor || '').replace(/\s+/g, ' ').trim();
            },
            limpiarEmojis(valor) {
                return this.normalizarTexto(valor)
                    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D]/gu, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            },
            resolverNombreSorteo(...candidatos) {
                for (const candidato of candidatos) {
                    const nombre = this.limpiarEmojis(candidato);
                    if (nombre) {
                        return nombre;
                    }
                }

                return '';
            },
            construirTitulo(nombreSorteo, fallback = HERO_TITULO_DEFAULT) {
                const nombre = this.resolverNombreSorteo(nombreSorteo);
                return nombre
                    ? `Estás a un paso de ser el próximo ganador de ${nombre}`
                    : fallback;
            },
            construirEstadoHero(nombreSorteo, subtitulo = HERO_SUBTITULO) {
                const nombre = this.resolverNombreSorteo(nombreSorteo);
                return {
                    nombreSorteo: nombre,
                    titulo: this.construirTitulo(nombre, HERO_TITULO_DEFAULT),
                    subtitulo,
                    tieneNombreSorteo: Boolean(nombre)
                };
            },
            debeActualizarHero(actual, siguiente) {
                const actualNombre = this.resolverNombreSorteo(actual?.nombreSorteo);
                const siguienteNombre = this.resolverNombreSorteo(siguiente?.nombreSorteo);
                const actualTitulo = this.normalizarTexto(actual?.titulo);

                if (!actualTitulo) {
                    return true;
                }

                if (!actualNombre && siguienteNombre) {
                    return true;
                }

                if (actualNombre && siguienteNombre && actualNombre !== siguienteNombre) {
                    return true;
                }

                return !this.normalizarTexto(actual?.subtitulo) && Boolean(this.normalizarTexto(siguiente?.subtitulo));
            }
        };
    }

    function obtenerConfigLocalCompartida() {
        try {
            return JSON.parse(localStorage.getItem('rifaplus_config_actual_v2') || '{}');
        } catch (error) {
            return {};
        }
    }

    function leerPrecioCompraCacheLocal() {
        try {
            const payload = JSON.parse(localStorage.getItem(LOCAL_PRICE_CACHE_KEY) || 'null');
            const precio = Number(payload?.precio);
            if (!Number.isFinite(precio) || precio <= 0) {
                return null;
            }

            return {
                precio,
                timestamp: Number(payload?.timestamp) || 0
            };
        } catch (error) {
            return null;
        }
    }

    function guardarPrecioCompraCacheLocal(precio) {
        const numero = Number(precio);
        if (!Number.isFinite(numero) || numero <= 0) {
            return;
        }

        try {
            localStorage.setItem(LOCAL_PRICE_CACHE_KEY, JSON.stringify({
                precio: numero,
                timestamp: Date.now()
            }));
        } catch (error) {
            // Ignorar errores de almacenamiento para no frenar la UI.
        }
    }

    function hidratarPrecioCompraDesdeSnapshot(config) {
        if (!config?.rifa) {
            return;
        }

        const snapshot = window.__RIFAPLUS_COMPRA_PRICE_SNAPSHOT__;
        const precioSnapshot = Number(snapshot?.precioBoleto);
        const precioVisibleSnapshot = Number(snapshot?.precioVisible);

        if (Number.isFinite(precioSnapshot) && precioSnapshot > 0) {
            config.rifa.precioBoleto = precioSnapshot;
        } else if (Number.isFinite(precioVisibleSnapshot) && precioVisibleSnapshot > 0) {
            config.rifa.precioBoleto = precioVisibleSnapshot;
        }

        if (snapshot?.promocionPorTiempo) {
            config.rifa.promocionPorTiempo = snapshot.promocionPorTiempo;
        }

        if (snapshot?.descuentoPorcentaje) {
            config.rifa.descuentoPorcentaje = snapshot.descuentoPorcentaje;
        }
    }

    function obtenerNombreSorteoInicialCompra() {
        const heroUtils = obtenerUtilidadesHeroCompra();
        const config = obtenerConfigCompra();
        try {
            return heroUtils.resolverNombreSorteo(
                config?.rifa?.nombreSorteo,
                obtenerConfigLocalCompartida()?.rifa?.nombreSorteo,
                window.__RIFAPLUS_COMPRA_HERO__?.nombreSorteo,
                localStorage.getItem('rifaplus_compra_hero_sorteo')
            );
        } catch (error) {
            return '';
        }
    }

    function actualizarHeroCompraDesdeConfig() {
        const title = document.getElementById('compraHeroTitle');
        const subtitle = document.getElementById('compraHeroSub');

        if (!title) {
            return;
        }

        const heroUtils = obtenerUtilidadesHeroCompra();
        const nombreSorteo = obtenerNombreSorteoInicialCompra();
        const estadoSiguiente = heroUtils.construirEstadoHero(nombreSorteo, HERO_SUBTITULO);
        const estadoActual = {
            nombreSorteo: window.__RIFAPLUS_COMPRA_HERO__?.nombreSorteo,
            titulo: title.textContent,
            subtitulo: subtitle?.textContent || ''
        };

        if (!heroUtils.debeActualizarHero(estadoActual, estadoSiguiente)) {
            if (subtitle && !subtitle.textContent.trim()) {
                subtitle.textContent = estadoSiguiente.subtitulo;
            }
            evaluarPaginaListaCompra();
            return;
        }

        title.textContent = estadoSiguiente.titulo;

        if (subtitle) {
            subtitle.textContent = estadoSiguiente.subtitulo;
        }

        if (!estadoSiguiente.nombreSorteo) {
            return;
        }

        try {
            localStorage.setItem('rifaplus_compra_hero_sorteo', estadoSiguiente.nombreSorteo);
        } catch (error) {
            // Ignorar errores de storage para no romper la UI.
        }

        if (window.__RIFAPLUS_COMPRA_HERO__) {
            window.__RIFAPLUS_COMPRA_HERO__ = {
                ...window.__RIFAPLUS_COMPRA_HERO__,
                ...estadoSiguiente
            };
        }

        evaluarPaginaListaCompra();
    }

    async function obtenerPrecioBoletoRemoto() {
        const config = obtenerConfigCompra();
        const precioLocal = Number(config?.rifa?.precioBoleto);
        const precioCacheado = leerPrecioCompraCacheLocal()?.precio;

        if (Date.now() - remotePriceFetchedAt < REMOTE_PRICE_TTL_MS && Number.isFinite(remotePriceValue)) {
            return remotePriceValue;
        }

        if (typeof config?.obtenerConfigPublicaCompartida !== 'function') {
            return Number.isFinite(precioLocal) ? precioLocal : (Number.isFinite(precioCacheado) ? precioCacheado : null);
        }

        if (remotePricePromise) {
            return remotePricePromise;
        }

        remotePricePromise = config.obtenerConfigPublicaCompartida()
            .then((configPublica) => {
                const precioRemoto = Number(configPublica?.rifa?.precioBoleto ?? configPublica?.precioBoleto);
                remotePriceFetchedAt = Date.now();

                if (!Number.isFinite(precioRemoto) || precioRemoto <= 0) {
                    return Number.isFinite(precioLocal) ? precioLocal : (Number.isFinite(precioCacheado) ? precioCacheado : null);
                }

                remotePriceValue = precioRemoto;
                guardarPrecioCompraCacheLocal(precioRemoto);
                if (config.rifa) {
                    config.rifa.precioBoleto = precioRemoto;
                }
                return precioRemoto;
            })
            .catch(() => (Number.isFinite(precioLocal) ? precioLocal : (Number.isFinite(precioCacheado) ? precioCacheado : null)))
            .finally(() => {
                remotePricePromise = null;
            });

        return remotePricePromise;
    }

    function formatearMoneda(valor) {
        const numero = Number(valor);
        return `$${Number.isFinite(numero) ? numero.toFixed(2) : '0.00'}`;
    }

    function formatearVigencia(fecha) {
        const valorFecha = new Date(fecha);
        if (Number.isNaN(valorFecha.getTime())) {
            return '';
        }

        const dia = String(valorFecha.getDate()).padStart(2, '0');
        const mes = String(valorFecha.getMonth() + 1).padStart(2, '0');
        const anio = valorFecha.getFullYear();
        let hora = valorFecha.getHours();
        const minutos = String(valorFecha.getMinutes()).padStart(2, '0');
        const ampm = hora >= 12 ? 'PM' : 'AM';

        hora = hora % 12;
        hora = hora || 12;

        return `Vigencia hasta: ${dia}/${mes}/${anio} a las ${String(hora).padStart(2, '0')}:${minutos} ${ampm}`;
    }

    function resolverPromocionActiva(rifa) {
        const precioBase = Number(rifa?.precioBoleto);
        if (!Number.isFinite(precioBase) || precioBase <= 0) {
            return {
                activa: false,
                precioBase: 0,
                precioFinal: 0,
                etiqueta: 'OFERTA',
                vigencia: ''
            };
        }

        const ahora = new Date();
        const promoTiempo = rifa?.promocionPorTiempo;
        const descuentoPorcentaje = rifa?.descuentoPorcentaje;
        let mejorPrecio = precioBase;
        let etiqueta = 'OFERTA';
        let vigencia = '';
        let activa = false;

        if (promoTiempo?.enabled && promoTiempo?.precioProvisional !== null && promoTiempo?.precioProvisional !== undefined) {
            const inicio = new Date(promoTiempo.fechaInicio);
            const fin = new Date(promoTiempo.fechaFin);

            if (!Number.isNaN(inicio.getTime()) && !Number.isNaN(fin.getTime()) && ahora >= inicio && ahora <= fin) {
                const precioTiempo = Number(promoTiempo.precioProvisional);
                if (Number.isFinite(precioTiempo) && precioTiempo >= 0 && precioTiempo < mejorPrecio) {
                    mejorPrecio = precioTiempo;
                    activa = true;
                    etiqueta = 'OFERTA';
                    vigencia = formatearVigencia(fin);
                }
            }
        }

        if (descuentoPorcentaje?.enabled && descuentoPorcentaje?.porcentaje) {
            const inicio = new Date(descuentoPorcentaje.fechaInicio);
            const fin = new Date(descuentoPorcentaje.fechaFin);

            if (!Number.isNaN(inicio.getTime()) && !Number.isNaN(fin.getTime()) && ahora >= inicio && ahora <= fin) {
                const porcentaje = Number(descuentoPorcentaje.porcentaje);
                const precioConDescuento = precioBase - ((precioBase * porcentaje) / 100);
                if (Number.isFinite(precioConDescuento) && precioConDescuento >= 0 && precioConDescuento < mejorPrecio) {
                    mejorPrecio = precioConDescuento;
                    activa = true;
                    etiqueta = `${Math.round(((precioBase - precioConDescuento) / precioBase) * 100)}% OFF`;
                    vigencia = formatearVigencia(fin);
                }
            }
        }

        return {
            activa,
            precioBase,
            precioFinal: mejorPrecio,
            etiqueta,
            vigencia
        };
    }

    function aplicarLayoutCards(contenedor) {
        if (!contenedor) {
            return;
        }

        contenedor.classList.remove(
            'cards-layout--1',
            'cards-layout--2',
            'cards-layout--3',
            'cards-layout--4',
            'cards-layout--many'
        );

        const total = contenedor.children.length;
        if (total === 1) contenedor.classList.add('cards-layout--1');
        else if (total === 2) contenedor.classList.add('cards-layout--2');
        else if (total === 3) contenedor.classList.add('cards-layout--3');
        else if (total === 4) contenedor.classList.add('cards-layout--4');
        else if (total > 4) contenedor.classList.add('cards-layout--many');
    }

    function vaciarNodo(nodo) {
        if (!nodo) {
            return;
        }

        while (nodo.firstChild) {
            nodo.removeChild(nodo.firstChild);
        }
    }

    function crearPromoCard({ tag, simple, operator, strong, desc, className }) {
        const card = document.createElement('div');
        card.className = `promo-card ${className}`.trim();

        if (tag) {
            const tagEl = document.createElement('span');
            tagEl.className = 'promo-tag';
            tagEl.textContent = tag;
            card.appendChild(tagEl);
        }

        const simpleEl = document.createElement('p');
        simpleEl.className = 'promo-simple';
        simpleEl.textContent = simple;
        card.appendChild(simpleEl);

        const operatorEl = document.createElement('p');
        operatorEl.className = 'promo-operator';
        operatorEl.textContent = operator;
        card.appendChild(operatorEl);

        const strongEl = document.createElement('p');
        strongEl.className = 'promo-strong';
        strongEl.textContent = strong;
        card.appendChild(strongEl);

        if (desc) {
            const descEl = document.createElement('span');
            descEl.className = 'promo-desc';
            descEl.textContent = desc;
            card.appendChild(descEl);
        }

        return card;
    }

    function renderizarPromociones(rifa) {
        const promocionesPanel = document.getElementById('promocionesPanel');
        const promocionesHeader = document.getElementById('promocionesHeader');
        const promocionesSubText = document.getElementById('promocionesSubText');
        const promosCards = document.getElementById('promosCards');
        const descuentosBlock = document.getElementById('descuentosBlock');
        const descuentosSubText = document.getElementById('descuentosSubText');
        const oportunidadesBlock = document.getElementById('oportunidadesBlock');
        const oportunidadesSubText = document.getElementById('oportunidadesSubText');
        const oportunidadesCards = document.getElementById('oportunidadesCards');

        if (!promocionesPanel || !promocionesSubText || !promosCards || !descuentosBlock || !oportunidadesBlock || !oportunidadesCards) {
            return;
        }

        const descuentosConfig = rifa?.descuentos;
        const oportunidadesConfig = rifa?.oportunidades;
        const promosOportunidadesConfig = rifa?.promocionesOportunidades;
        const oportunidadesActivas = oportunidadesConfig?.enabled === true &&
            promosOportunidadesConfig?.enabled === true &&
            Array.isArray(promosOportunidadesConfig?.ejemplos) &&
            promosOportunidadesConfig.ejemplos.length > 0;

        const promocionesDescuento = [];
        const tarjetasOportunidades = [];

        if (descuentosConfig?.enabled && Array.isArray(descuentosConfig.reglas)) {
            descuentosConfig.reglas.forEach((regla) => {
                const cantidad = Number(regla?.cantidad);
                const totalPaquete = Number(regla?.total ?? regla?.precio);

                if (!Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(totalPaquete) || totalPaquete <= 0) {
                    return;
                }

                promocionesDescuento.push({
                    sortKey: cantidad,
                    tag: 'Promocion',
                    simple: `${cantidad} Boletos`,
                    operator: 'Solo por:',
                    strong: formatearMoneda(totalPaquete),
                    desc: '',
                    className: 'promo-card--paquete'
                });
            });

            promocionesDescuento.sort((a, b) => {
                return (a.sortKey || 0) - (b.sortKey || 0);
            });
        }

        if (oportunidadesActivas) {
            promosOportunidadesConfig.ejemplos.forEach((ejemplo) => {
                const boletos = Number(ejemplo?.boletos);
                const oportunidades = Number(ejemplo?.oportunidades);

                if (!Number.isFinite(boletos) || boletos <= 0 || !Number.isFinite(oportunidades) || oportunidades <= 0) {
                    return;
                }

                tarjetasOportunidades.push({
                    sortKey: boletos,
                    tag: '',
                    simple: `${boletos} Boleto${boletos === 1 ? '' : 's'}`,
                    operator: '=',
                    strong: `${oportunidades} Oportunidade${oportunidades === 1 ? '' : 's'}`,
                    desc: '',
                    className: 'promo-card--oportunidad'
                });
            });

            tarjetasOportunidades.sort((a, b) => {
                return (a.sortKey || 0) - (b.sortKey || 0);
            });
        }

        const multiplicador = Number(oportunidadesConfig?.multiplicador) > 0
            ? Number(oportunidadesConfig.multiplicador)
            : 1;
        const tieneDescuentos = promocionesDescuento.length > 0;
        const tieneOportunidades = tarjetasOportunidades.length > 0;

        if (tieneDescuentos && tieneOportunidades) {
            promocionesSubText.textContent = `Aprovecha descuentos por volumen y recibe ${multiplicador} oportunidades extra por cada boleto.`;
        } else if (tieneDescuentos) {
            promocionesSubText.textContent = 'Mientras más boletos compras, mejor precio obtienes.';
        } else if (tieneOportunidades) {
            promocionesSubText.textContent = `Cada boleto te da ${multiplicador} oportunidades extra para participar con más fuerza.`;
        } else {
            promocionesSubText.textContent = 'Promociones disponibles por tiempo limitado';
        }

        if (descuentosSubText) {
            descuentosSubText.textContent = 'Llevate mas boletos por un mejor precio.';
        }

        if (oportunidadesSubText) {
            oportunidadesSubText.textContent = 'Cada boleto multiplica tus posibilidades de ganar.';
        }

        const snapshot = JSON.stringify({
            promocionesDescuento,
            tarjetasOportunidades
        });
        if (snapshot === promocionesSnapshot) {
            promocionesPanel.style.display = (tieneDescuentos || tieneOportunidades) ? '' : 'none';
            promocionesHeader.style.display = (tieneDescuentos || tieneOportunidades) ? '' : 'none';
            descuentosBlock.style.display = tieneDescuentos ? '' : 'none';
            oportunidadesBlock.style.display = tieneOportunidades ? '' : 'none';
            promosCards.style.display = tieneDescuentos ? 'grid' : 'none';
            oportunidadesCards.style.display = tieneOportunidades ? 'grid' : 'none';
            return;
        }

        promocionesSnapshot = snapshot;
        vaciarNodo(promosCards);
        vaciarNodo(oportunidadesCards);

        if (!tieneDescuentos && !tieneOportunidades) {
            promocionesPanel.style.display = 'none';
            promocionesHeader.style.display = 'none';
            descuentosBlock.style.display = 'none';
            oportunidadesBlock.style.display = 'none';
            promosCards.style.display = 'none';
            oportunidadesCards.style.display = 'none';
            return;
        }

        if (tieneDescuentos) {
            const descuentosFragment = document.createDocumentFragment();
            promocionesDescuento.forEach((tarjeta) => {
                descuentosFragment.appendChild(crearPromoCard(tarjeta));
            });
            promosCards.appendChild(descuentosFragment);
            promosCards.style.display = 'grid';
            descuentosBlock.style.display = '';
            aplicarLayoutCards(promosCards);
        } else {
            descuentosBlock.style.display = 'none';
            promosCards.style.display = 'none';
        }

        if (tieneOportunidades) {
            const oportunidadesFragment = document.createDocumentFragment();
            tarjetasOportunidades.forEach((tarjeta) => {
                oportunidadesFragment.appendChild(crearPromoCard(tarjeta));
            });
            oportunidadesCards.appendChild(oportunidadesFragment);
            oportunidadesCards.style.display = 'grid';
            oportunidadesBlock.style.display = '';
            aplicarLayoutCards(oportunidadesCards);
        } else {
            oportunidadesBlock.style.display = 'none';
            oportunidadesCards.style.display = 'none';
        }

        promocionesPanel.style.display = '';
        promocionesHeader.style.display = '';
    }

    function renderizarBonosCompra(rifa) {
        const bonosCompraSection = document.getElementById('bonosCompraSection');
        const bonosCompraCards = document.getElementById('bonosCompraCards');
        const items = Array.isArray(rifa?.bonosCompra?.items) ? rifa.bonosCompra.items : [];
        const bonosActivos = rifa?.bonosCompra?.enabled === true;

        if (!bonosCompraSection || !bonosCompraCards) {
            return;
        }

        if (!bonosActivos || items.length === 0) {
            bonosCompraSection.style.display = 'none';
            bonosSnapshot = '';
            return;
        }

        const bonosValidos = items
            .map((item) => ({
                titulo: String(item?.titulo || '').trim(),
                descripcion: String(item?.descripcion || '').trim(),
                emoji: String(item?.emoji || '🎁').trim() || '🎁'
            }))
            .filter((item) => item.titulo && item.descripcion);

        const snapshot = JSON.stringify(bonosValidos);
        if (snapshot === bonosSnapshot) {
            bonosCompraSection.style.display = bonosValidos.length > 0 ? 'block' : 'none';
            return;
        }

        bonosSnapshot = snapshot;
        vaciarNodo(bonosCompraCards);

        if (bonosValidos.length === 0) {
            bonosCompraSection.style.display = 'none';
            return;
        }

        const fragment = document.createDocumentFragment();
        bonosValidos.forEach((item) => {
            const card = document.createElement('article');
            card.className = 'bono-compra-card';

            const titulo = document.createElement('h4');
            titulo.className = 'bono-compra-titulo';
            titulo.textContent = item.titulo;
            card.appendChild(titulo);

            const emoji = document.createElement('div');
            emoji.className = 'bono-compra-emoji';
            emoji.setAttribute('aria-hidden', 'true');
            emoji.textContent = item.emoji;
            card.appendChild(emoji);

            const descripcion = document.createElement('p');
            descripcion.className = 'bono-compra-descripcion';
            descripcion.textContent = item.descripcion;
            card.appendChild(descripcion);

            fragment.appendChild(card);
        });

        bonosCompraCards.appendChild(fragment);
        aplicarLayoutCards(bonosCompraCards);
        bonosCompraSection.style.display = 'block';
    }

    function actualizarCardPrecio(rifa) {
        const precioCardCompra = document.getElementById('precioCardCompra');
        const precioDinamico = document.getElementById('precioDinamico');
        const precioNormalCompra = document.getElementById('precioNormalCompra');
        const precioOfertaCompra = document.getElementById('precioOfertaCompra');
        const ofertaVigenciaCompra = document.getElementById('ofertaVigenciaCompra');
        const precioNormalOfertaCompra = document.getElementById('precioNormalOfertaCompra');
        const precioEspecialOfertaCompra = document.getElementById('precioEspecialOfertaCompra');
        const badgeText = document.querySelector('.oferta-badge-text');
        const vigenciaOfertaCompra = document.getElementById('vigenciaOfertaCompra');

        if (!precioDinamico) {
            return;
        }

        const promo = resolverPromocionActiva(rifa);
        const precioFinal = Number(promo.precioFinal);
        const snapshotPrecio = Number(window.__RIFAPLUS_COMPRA_PRICE_SNAPSHOT__?.precioVisible);
        const precioExistente = Number(String(precioDinamico.textContent || '').replace(/[^0-9.]+/g, ''));
        const precioRespaldo = Number.isFinite(snapshotPrecio) && snapshotPrecio > 0
            ? snapshotPrecio
            : (Number.isFinite(precioExistente) && precioExistente > 0 ? precioExistente : null);

        if (!Number.isFinite(precioFinal) || precioFinal <= 0) {
            if (Number.isFinite(precioRespaldo) && precioRespaldo > 0) {
                precioDinamico.textContent = formatearMoneda(precioRespaldo);
            }
            return;
        }

        precioDinamico.textContent = formatearMoneda(promo.precioFinal);
        if (precioCardCompra) {
            precioCardCompra.classList.remove('loading');
            precioCardCompra.setAttribute('aria-busy', 'false');
        }
        evaluarPaginaListaCompra();

        if (!promo.activa) {
            if (precioNormalCompra) precioNormalCompra.style.display = 'flex';
            if (precioOfertaCompra) precioOfertaCompra.style.display = 'none';
            if (ofertaVigenciaCompra) ofertaVigenciaCompra.style.display = 'none';
            return;
        }

        if (precioNormalCompra) precioNormalCompra.style.display = 'none';
        if (precioOfertaCompra) precioOfertaCompra.style.display = 'flex';
        if (precioNormalOfertaCompra) precioNormalOfertaCompra.textContent = formatearMoneda(promo.precioBase);
        if (precioEspecialOfertaCompra) precioEspecialOfertaCompra.textContent = formatearMoneda(promo.precioFinal);
        if (badgeText) badgeText.textContent = promo.etiqueta;

        if (ofertaVigenciaCompra && vigenciaOfertaCompra && promo.vigencia) {
            ofertaVigenciaCompra.style.display = 'flex';
            vigenciaOfertaCompra.textContent = promo.vigencia;
        } else if (ofertaVigenciaCompra) {
            ofertaVigenciaCompra.style.display = 'none';
        }
    }

    function animarBotonFlotanteSiExiste() {
        const boton = document.querySelector('.btn-flotante-comprobante');
        if (!boton) {
            return;
        }

        boton.classList.add('bounce-animate');
        window.setTimeout(() => {
            boton.classList.remove('bounce-animate');
        }, 1800);
    }

    async function renderizarCompraPublica() {
        const config = obtenerConfigCompra();
        if (!config?.rifa) {
            return;
        }

        pageReadyCompraEmitida = false;

        hidratarPrecioCompraDesdeSnapshot(config);
        actualizarHeroCompraDesdeConfig();
        actualizarCardPrecio(config.rifa);
        renderizarPromociones(config.rifa);
        renderizarBonosCompra(config.rifa);
        animarBotonFlotanteSiExiste();
        evaluarPaginaListaCompra();

        const precioAntes = Number(config.rifa.precioBoleto);
        const precioRemoto = await obtenerPrecioBoletoRemoto();
        if (Number.isFinite(precioRemoto) && precioRemoto > 0 && precioRemoto !== precioAntes) {
            actualizarCardPrecio(config.rifa);
            renderizarPromociones(config.rifa);
        }

        evaluarPaginaListaCompra();
    }

    function programarRenderCompraPublica() {
        if (renderPublicoPendiente) {
            return;
        }

        renderPublicoPendiente = true;
        requestAnimationFrame(() => {
            renderPublicoPendiente = false;
            renderizarCompraPublica().catch(() => {
                // Ignorar errores para no frenar la pagina.
            });
        });
    }

    function construirRedSocial({ href, title, iconClass }) {
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.title = title;

        const icon = document.createElement('i');
        icon.className = iconClass;
        anchor.appendChild(icon);
        return anchor;
    }

    function renderizarFooterCompra() {
        const config = obtenerConfigCompra();
        const cliente = config?.cliente || {};
        const redes = cliente?.redesSociales || {};
        const socialData = {
            whatsapp: redes?.whatsapp ? `https://wa.me/${String(redes.whatsapp).replace(/[^0-9]/g, '')}` : '',
            facebook: String(redes?.facebook || '').trim(),
            instagram: String(redes?.instagram || '').trim()
        };

        const snapshot = JSON.stringify({
            nombre: String(cliente?.nombre || '').trim(),
            eslogan: String(cliente?.eslogan || '').trim(),
            email: String(cliente?.email || '').trim(),
            telefono: String(cliente?.telefono || '').trim(),
            redes: socialData
        });

        if (snapshot === footerSnapshot) {
            return;
        }

        footerSnapshot = snapshot;

        if (typeof config?.actualizarNombreClienteEnUI === 'function') {
            config.actualizarNombreClienteEnUI();
        }

        const footerEslogan = document.getElementById('footerEslogan');
        if (footerEslogan) {
            footerEslogan.textContent = cliente?.eslogan || FOOTER_ESLOGAN_DEFAULT;
        }

        const footerEmail = document.getElementById('footerEmail');
        if (footerEmail && cliente?.email) {
            footerEmail.href = `mailto:${cliente.email}`;
            footerEmail.textContent = cliente.email;
        }

        const footerTelefono = document.getElementById('footerTelefono');
        if (footerTelefono && cliente?.telefono) {
            footerTelefono.href = `tel:${String(cliente.telefono).replace(/[^0-9+]/g, '')}`;
            footerTelefono.textContent = cliente.telefono;
        }

        const footerSocial = document.getElementById('footerSocial');
        if (!footerSocial) {
            return;
        }

        vaciarNodo(footerSocial);

        if (socialData.whatsapp) {
            footerSocial.appendChild(construirRedSocial({
                href: socialData.whatsapp,
                title: 'WhatsApp',
                iconClass: 'fab fa-whatsapp'
            }));
        }

        if (socialData.facebook) {
            footerSocial.appendChild(construirRedSocial({
                href: socialData.facebook,
                title: 'Facebook',
                iconClass: 'fab fa-facebook-f'
            }));
        }

        if (socialData.instagram) {
            footerSocial.appendChild(construirRedSocial({
                href: socialData.instagram,
                title: 'Instagram',
                iconClass: 'fab fa-instagram'
            }));
        }
    }

    function programarRenderFooter() {
        if (renderFooterPendiente) {
            return;
        }

        renderFooterPendiente = true;
        requestAnimationFrame(() => {
            renderFooterPendiente = false;
            renderizarFooterCompra();
        });
    }

    function actualizarDisponibilidadFallback() {
        if (typeof window.actualizarNotaDisponibilidad === 'function') {
            window.actualizarNotaDisponibilidad();
            return;
        }

        const note = document.getElementById('availabilityNote');
        const disponibles = Number(obtenerConfigCompra()?.estado?.boletosDisponibles);
        if (!note || !Number.isFinite(disponibles) || disponibles < 0) {
            return;
        }

        note.textContent = `${disponibles} boletos disponibles`;
        note.style.visibility = 'visible';
        note.style.opacity = '1';
        note.style.display = 'inline-block';
    }

    function sincronizarCompraPublica() {
        programarRenderCompraPublica();
        programarRenderFooter();
        actualizarDisponibilidadFallback();
    }

    cuandoDomEsteListo(() => {
        sincronizarCompraPublica();

        window.addEventListener('configSyncCompleto', sincronizarCompraPublica);
        window.addEventListener('configuracionActualizada', sincronizarCompraPublica);
        window.addEventListener('configActualizada', sincronizarCompraPublica);
        window.addEventListener('boletosListos', actualizarDisponibilidadFallback);
    });
})();
