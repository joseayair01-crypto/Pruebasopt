(function inicializarIndexPublico() {
    const INDEX_DEBUG = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const indexLog = (...args) => {
        if (INDEX_DEBUG) console.log(...args);
    };
    const indexWarn = (...args) => {
        if (INDEX_DEBUG) console.warn(...args);
    };

    const state = window.__RIFAPLUS_INDEX_STATE__ = window.__RIFAPLUS_INDEX_STATE__ || {
        firmas: {},
        precioRefreshTimeoutId: 0,
        secondaryRenderFrameId: 0,
        secondaryRenderIdleId: 0,
        sectionObservers: {},
        activatedSections: {},
        footerBounceTimerId: 0,
        boletosObserver: null,
        initialized: false
    };

    function obtenerRifaPublica() {
        return window.rifaplusConfig?.rifa || window.config?.rifa || null;
    }

    function obtenerClientePublico() {
        return window.rifaplusConfig?.cliente || window.config?.cliente || null;
    }

    function serializarFirmaIndex(valor) {
        try {
            return JSON.stringify(valor) || '';
        } catch (error) {
            return String(valor ?? '');
        }
    }

    function actualizarFirmaIndex(clave, valor) {
        const firma = serializarFirmaIndex(valor);
        if (state.firmas[clave] === firma) {
            return false;
        }

        state.firmas[clave] = firma;
        return true;
    }

    function persistirDatoHero(clave, valor, campoEstado) {
        if (!valor) return;

        try {
            localStorage.setItem(clave, valor);
            if (window.__RIFAPLUS_INDEX_HERO__) {
                window.__RIFAPLUS_INDEX_HERO__[campoEstado] = valor;
            }
        } catch (error) {
            indexWarn(`No se pudo cachear ${campoEstado} del hero:`, error?.message || error);
        }
    }

    function esViewportMovil() {
        return window.matchMedia('(max-width: 768px)').matches;
    }

    function activarRenderDiferidoEnMovil(sectionId, renderFn, options = {}) {
        const section = document.getElementById(sectionId);
        if (!section || typeof renderFn !== 'function') return;

        const stateKey = options.stateKey || sectionId;
        if (state.activatedSections[stateKey]) {
            renderFn();
            return;
        }

        const activar = () => {
            state.activatedSections[stateKey] = true;
            if (state.sectionObservers[stateKey]) {
                state.sectionObservers[stateKey].disconnect();
                delete state.sectionObservers[stateKey];
            }
            renderFn();
        };

        if (!esViewportMovil() || !('IntersectionObserver' in window)) {
            activar();
            return;
        }

        if (section.getBoundingClientRect().top <= window.innerHeight + 240) {
            activar();
            return;
        }

        if (state.sectionObservers[stateKey]) return;

        state.sectionObservers[stateKey] = new IntersectionObserver((entries, observer) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            delete state.sectionObservers[stateKey];
            activar();
        }, {
            rootMargin: options.rootMargin || '240px 0px'
        });

        state.sectionObservers[stateKey].observe(section);
    }

    function formatearNumero(num) {
        return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function renderizarTarjetasInfo() {
        const infoGrid = document.getElementById('infoRifaGrid');
        const config = window.rifaplusConfig;
        if (!infoGrid || !config?.rifa) {
            return false;
        }

        const rifa = config.rifa;
        const firmaTarjetas = {
            infoRifa: Array.isArray(rifa.infoRifa) ? rifa.infoRifa : [],
            fechaSorteoFormato: config.obtenerFechaSorteoFormato?.() || rifa.fechaSorteoFormato || '',
            fechaPresorteoFormato: config.obtenerFechaPresorteoFormato?.() || rifa.fechaPresorteoFormato || '',
            horaSorteo: rifa.horaSorteo || '',
            horaPresorteo: rifa.horaPresorteo || '',
            totalBoletos: rifa.totalBoletos || 0,
            modalidadSorteo: rifa.modalidadSorteo || '',
            zonaHoraria: rifa.zonaHoraria || '',
            presorteo: Array.isArray(rifa.sistemaPremios?.presorteo) ? rifa.sistemaPremios.presorteo.length : 0,
            facebook: config.cliente?.redesSociales?.facebook || ''
        };

        if (!actualizarFirmaIndex('tarjetasInfoIndex', firmaTarjetas)) {
            return true;
        }

        infoGrid.innerHTML = '';

        let infoItems = [];
        const configItems = Array.isArray(rifa.infoRifa) ? rifa.infoRifa : [];
        const itemsSinFechaPrincipal = configItems.filter((item, index) => {
            if (index === 0) return false;
            const contenido = String(item?.contenido || '').trim();
            return !['dinamico-fecha-hora', 'dinamico-fecha', 'dinamico-hora'].includes(contenido);
        });

        const tarjetaFechaSorteo = {
            titulo: 'Fecha del Sorteo',
            icono: '🗓️',
            contenido: 'dinamico-fecha'
        };

        const tarjetaHoraSorteo = {
            titulo: 'Hora del Sorteo',
            icono: '⏰',
            contenido: 'dinamico-hora'
        };

        const tarjetaFechaHoraSorteo = {
            titulo: 'Fecha y Hora del Sorteo',
            icono: '🗓️',
            contenido: 'dinamico-fecha-hora'
        };

        const presorteoActivo = Array.isArray(rifa.sistemaPremios?.presorteo) && rifa.sistemaPremios.presorteo.length > 0;
        if (presorteoActivo) {
            const fechaPresorteoTexto = (() => {
                const fechaFormateada = config.obtenerFechaPresorteoFormato?.() || rifa.fechaPresorteoFormato;
                const horaFormateada = rifa.horaPresorteo;

                if (fechaFormateada && horaFormateada) return `${fechaFormateada} a las ${horaFormateada}`;
                if (fechaFormateada) return fechaFormateada;
                if (horaFormateada) return `Hora por confirmar: ${horaFormateada}`;
                return 'Fecha y hora por confirmar';
            })();

            infoItems = [
                tarjetaFechaHoraSorteo,
                { titulo: 'Presorteo', icono: '🎊', contenido: fechaPresorteoTexto },
                ...itemsSinFechaPrincipal.slice(0, 2)
            ];
        } else {
            infoItems = [
                tarjetaFechaSorteo,
                tarjetaHoraSorteo,
                ...itemsSinFechaPrincipal.slice(0, 2)
            ];
        }

        infoItems.forEach((item) => {
            const infoItem = document.createElement('div');
            infoItem.className = 'info-item';

            let contenido = item.contenido;
            if (contenido === 'dinamico-fecha') {
                contenido = config.obtenerFechaSorteoFormato?.() || config.rifa.fechaSorteoFormato;
            } else if (contenido === 'dinamico-hora') {
                contenido = `${config.rifa.horaSorteo} (${config.rifa.zonaHoraria})`;
            } else if (contenido === 'dinamico-fecha-hora') {
                contenido = `${config.obtenerFechaSorteoFormato?.() || config.rifa.fechaSorteoFormato} a las ${config.rifa.horaSorteo}`;
            } else if (contenido === 'dinamico-modalidad') {
                contenido = config.rifa.modalidadSorteo;
            } else if (contenido === 'dinamico-boletos') {
                contenido = `<span id="total-boletos-info">${config.rifa.totalBoletos}</span> disponibles`;
            } else if (contenido === 'dinamico-emisiones') {
                contenido = `<span id="total-emisiones-info">${formatearNumero(config.rifa.totalBoletos)}</span>`;
            }

            const esModalidad = item.titulo === 'Modalidad del Sorteo' || item.titulo === 'Modalidad';
            if (esModalidad) {
                const facebookUrl = config.cliente?.redesSociales?.facebook;
                infoItem.style.cursor = 'pointer';
                infoItem.onclick = function() {
                    if (facebookUrl) {
                        window.open(facebookUrl, '_blank');
                    }
                };
                infoItem.style.transition = 'all var(--transition-normal)';
                infoItem.onmouseover = function() {
                    this.style.transform = 'translateY(-8px)';
                    this.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.15)';
                };
                infoItem.onmouseout = function() {
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
                };
                infoItem.innerHTML = `
                    <span class="info-icon" aria-hidden="true"><i class="fab fa-facebook-f" style="color: #1877F2;"></i></span>
                    <h3>${item.titulo}</h3>
                    <p>${contenido}</p>
                    <p style="font-size: 0.85rem; color: #1877F2; margin-top: 0.5rem; font-weight: 600;">Haz click para visitarnos →</p>
                `;
            } else {
                infoItem.innerHTML = `
                    <span class="info-icon" aria-hidden="true">${item.icono}</span>
                    <h3>${item.titulo}</h3>
                    <p>${contenido}</p>
                `;
            }

            infoGrid.appendChild(infoItem);
        });

        indexLog(`✅ [index-public] Tarjetas renderizadas: ${infoItems.length} items`);
        return true;
    }

    function cargarNombreEdicion() {
        const edicionEl = document.getElementById('edicionNombre');
        const rifa = obtenerRifaPublica();
        const edicionNombre = String(rifa?.edicionNombre || '').trim();

        if (!edicionEl || !edicionNombre) return;
        if (edicionEl.innerHTML === edicionNombre) return;

        edicionEl.innerHTML = edicionNombre;
        persistirDatoHero('rifaplus_index_hero_edicion', edicionNombre, 'edicion');
    }

    function cargarHeroContent() {
        const titleEl = document.getElementById('heroTitle');
        const descEl = document.getElementById('heroDescription');
        const rifa = obtenerRifaPublica();

        if (!titleEl || !descEl || !rifa) return;

        const nombreCompleto = String(rifa.nombreSorteo || '').trim();
        const descripcion = String(rifa.descripcion || '').trim();

        if (descripcion && descEl.textContent !== descripcion) {
            descEl.textContent = descripcion;
            persistirDatoHero('rifaplus_index_hero_descripcion', descripcion, 'descripcion');
        }

        if (nombreCompleto) {
            const tituloFinal = `<span class="highlight" id="heroHighlight">${nombreCompleto}</span>`;
            if (titleEl.innerHTML !== tituloFinal) {
                titleEl.innerHTML = tituloFinal;
                persistirDatoHero('rifaplus_index_hero_nombre', nombreCompleto, 'nombre');
            }
        }
    }

    function cancelarActualizacionPrecioUnitario() {
        if (state.precioRefreshTimeoutId) {
            clearTimeout(state.precioRefreshTimeoutId);
            state.precioRefreshTimeoutId = 0;
        }
    }

    function programarActualizacionPrecioUnitario(delay = 1000) {
        cancelarActualizacionPrecioUnitario();
        if (document.hidden) return;

        state.precioRefreshTimeoutId = window.setTimeout(() => {
            state.precioRefreshTimeoutId = 0;
            cargarPrecioUnitario();
        }, delay);
    }

    function cargarPrecioUnitario() {
        const precioEl = document.getElementById('precioDinamicoIndex');
        const textoOportunidadesEl = document.getElementById('oportunidadesTexto');
        const precioNormalDiv = document.getElementById('precioNormal');
        const precioOfertaDiv = document.getElementById('precioOferta');
        const ofertaVigenciaDiv = document.getElementById('ofertaVigencia');
        if (!precioEl) return;

        const rifa = obtenerRifaPublica();
        const precioBoleto = window.rifaplusConfig?.obtenerPrecioBoleto?.() || Number(rifa?.precioBoleto || 100);
        const ahora = new Date();
        let hayPromocionActiva = false;
        let precioEspecial = precioBoleto;
        let fechaFin = null;
        let tipoPromo = null;

        const promoTiempo = rifa?.promocionPorTiempo;
        if (promoTiempo?.enabled && promoTiempo?.precioProvisional) {
            const fechaInicio = new Date(promoTiempo.fechaInicio);
            const fechaFinPromo = new Date(promoTiempo.fechaFin);
            if (ahora >= fechaInicio && ahora <= fechaFinPromo) {
                precioEspecial = promoTiempo.precioProvisional;
                fechaFin = fechaFinPromo;
                tipoPromo = 'tiempo';
                hayPromocionActiva = true;
            }
        }

        const descuentoPorcentaje = rifa?.descuentoPorcentaje;
        if (descuentoPorcentaje?.enabled && descuentoPorcentaje?.porcentaje) {
            const fechaInicio = new Date(descuentoPorcentaje.fechaInicio);
            const fechaFinPorcentaje = new Date(descuentoPorcentaje.fechaFin);
            if (ahora >= fechaInicio && ahora <= fechaFinPorcentaje) {
                const descuento = (precioBoleto * descuentoPorcentaje.porcentaje) / 100;
                const precioConPorcentaje = precioBoleto - descuento;
                if (!hayPromocionActiva || precioConPorcentaje < precioEspecial) {
                    precioEspecial = precioConPorcentaje;
                    fechaFin = fechaFinPorcentaje;
                    tipoPromo = 'porcentaje';
                    hayPromocionActiva = true;
                }
            }
        }

        if (hayPromocionActiva) {
            if (precioNormalDiv) precioNormalDiv.style.display = 'none';
            if (precioOfertaDiv) precioOfertaDiv.style.display = 'flex';

            const precioNormalOfertaEl = document.getElementById('precioNormalOferta');
            const precioEspecialOfertaEl = document.getElementById('precioEspecialOferta');
            const badgeText = document.querySelector('.oferta-badge-text');

            if (precioNormalOfertaEl) precioNormalOfertaEl.textContent = `$${precioBoleto.toFixed(2)}`;
            if (precioEspecialOfertaEl) precioEspecialOfertaEl.textContent = `$${precioEspecial.toFixed(2)}`;
            if (badgeText) {
                badgeText.textContent = tipoPromo === 'porcentaje'
                    ? `${Math.round(((precioBoleto - precioEspecial) / precioBoleto) * 100)}% OFF`
                    : 'OFERTA';
            }

            if (ofertaVigenciaDiv && fechaFin) {
                ofertaVigenciaDiv.style.display = 'flex';
                const vigenciaEl = document.getElementById('vigenciaOferta');
                if (vigenciaEl) {
                    const fechaFinal = new Date(fechaFin);
                    const dia = String(fechaFinal.getDate()).padStart(2, '0');
                    const mes = String(fechaFinal.getMonth() + 1).padStart(2, '0');
                    const anio = fechaFinal.getFullYear();
                    let hora = fechaFinal.getHours();
                    const minuto = String(fechaFinal.getMinutes()).padStart(2, '0');
                    const ampm = hora >= 12 ? 'PM' : 'AM';
                    hora = hora % 12 || 12;
                    const horaFormato = String(hora).padStart(2, '0');
                    vigenciaEl.textContent = `Vigencia hasta: ${dia}/${mes}/${anio} a las ${horaFormato}:${minuto} ${ampm}`;
                }
            }

            precioEl.innerHTML = `$${precioEspecial.toFixed(2)}`;
            programarActualizacionPrecioUnitario();
        } else {
            cancelarActualizacionPrecioUnitario();
            if (precioNormalDiv) precioNormalDiv.style.display = 'flex';
            if (precioOfertaDiv) precioOfertaDiv.style.display = 'none';
            if (ofertaVigenciaDiv) ofertaVigenciaDiv.style.display = 'none';
            precioEl.innerHTML = `$${precioBoleto.toFixed(2)}`;
        }

        if (rifa?.oportunidades?.enabled && rifa?.promocionesOportunidades?.enabled && textoOportunidadesEl) {
            const oportunidadesPorBoleto = Number(rifa.oportunidades?.multiplicador) > 0
                ? Number(rifa.oportunidades.multiplicador)
                : 1;
            textoOportunidadesEl.style.display = 'block';
            textoOportunidadesEl.textContent = `Cada boleto que compres te regala ${oportunidadesPorBoleto} oportunidades EXTRA de ganar`;
        } else if (textoOportunidadesEl) {
            textoOportunidadesEl.style.display = 'none';
        }
    }

    window.carruselState = window.carruselState || {
        currentIndex: 0,
        isInitialized: false,
        controlsBound: false,
        slides: [],
        autoAdvanceId: 0
    };

    function actualizarModoCarrusel(slideActivo) {
        const carrusel = document.querySelector('.carrusel');
        if (!carrusel || !slideActivo) return;
        carrusel.classList.toggle('carrusel--vertical-active', slideActivo.dataset.orientation === 'vertical');
    }

    function detenerAutoAdvanceCarrusel() {
        if (window.carruselState.autoAdvanceId) {
            clearInterval(window.carruselState.autoAdvanceId);
            window.carruselState.autoAdvanceId = 0;
        }
    }

    function mostrarSlideCarrusel(index) {
        const slides = window.carruselState.slides;
        if (!slides || slides.length === 0) return;

        if (index >= slides.length) index = 0;
        if (index < 0) index = slides.length - 1;

        window.carruselState.currentIndex = index;
        slides.forEach((slide) => slide.classList.remove('active'));
        slides[index].classList.add('active');
        actualizarModoCarrusel(slides[index]);
    }

    function reiniciarAutoAdvanceCarrusel() {
        detenerAutoAdvanceCarrusel();
        if (document.hidden || window.carruselState.slides.length <= 1) return;

        window.carruselState.autoAdvanceId = window.setInterval(() => {
            mostrarSlideCarrusel(window.carruselState.currentIndex + 1);
        }, 5000);
    }

    function inicializarCarruselControles() {
        const prevBtn = document.querySelector('.carrusel-prev');
        const nextBtn = document.querySelector('.carrusel-next');
        if (!prevBtn || !nextBtn || window.carruselState.slides.length === 0) return;

        if (!window.carruselState.controlsBound) {
            prevBtn.addEventListener('click', () => {
                mostrarSlideCarrusel(window.carruselState.currentIndex - 1);
                reiniciarAutoAdvanceCarrusel();
            });
            nextBtn.addEventListener('click', () => {
                mostrarSlideCarrusel(window.carruselState.currentIndex + 1);
                reiniciarAutoAdvanceCarrusel();
            });
            window.carruselState.controlsBound = true;
        }

        mostrarSlideCarrusel(0);
        window.carruselState.isInitialized = true;
        reiniciarAutoAdvanceCarrusel();
    }

    function cargarGaleria() {
        const carruselInner = document.querySelector('.carrusel-inner');
        const carrusel = document.querySelector('.carrusel');
        const carruselSection = document.querySelector('.carrusel-section');
        const galeria = obtenerRifaPublica()?.galeria;

        if (!carruselInner || !carruselSection || !galeria) return;
        if (!galeria.enabled || !Array.isArray(galeria.imagenes) || galeria.imagenes.length === 0) {
            carruselSection.style.display = 'none';
            detenerAutoAdvanceCarrusel();
            return;
        }

        const firmaCarrusel = {
            enabled: galeria.enabled,
            imagenes: galeria.imagenes.map((imagen) => ({ url: imagen.url, titulo: imagen.titulo || '' }))
        };

        if (!actualizarFirmaIndex('galeriaIndex', firmaCarrusel)) {
            if (!document.hidden && window.carruselState.isInitialized) {
                reiniciarAutoAdvanceCarrusel();
            }
            return;
        }

        carruselSection.style.display = 'block';
        carruselInner.innerHTML = '';
        galeria.imagenes.forEach((imagen, index) => {
            const slide = document.createElement('div');
            slide.className = 'carrusel-item';
            if (index === 0) slide.classList.add('active');

            const img = document.createElement('img');
            img.src = imagen.url;
            img.alt = imagen.titulo || `Imagen ${index + 1}`;
            img.loading = index === 0 ? 'eager' : 'lazy';
            img.decoding = 'async';
            img.onload = () => {
                slide.dataset.orientation = img.naturalHeight > img.naturalWidth ? 'vertical' : 'horizontal';
                if (slide.classList.contains('active')) {
                    actualizarModoCarrusel(slide);
                }
            };

            slide.appendChild(img);
            carruselInner.appendChild(slide);
        });

        if (carrusel) {
            carrusel.classList.remove('carrusel--vertical-active');
        }

        window.carruselState.slides = Array.from(carruselInner.querySelectorAll('.carrusel-item'));
        window.carruselState.currentIndex = 0;
        inicializarCarruselControles();
    }

    function cargarPreciosYDescuentos() {
        const preciosGrid = document.getElementById('preciosGrid');
        const config = obtenerRifaPublica();
        if (!preciosGrid || !config) return;

        const firmaPromociones = {
            descuentos: config.descuentos || null,
            promocionesOportunidades: config.promocionesOportunidades || null,
            oportunidades: config.oportunidades || null
        };
        if (!actualizarFirmaIndex('preciosYDescuentosIndex', firmaPromociones)) return;

        preciosGrid.innerHTML = '';
        preciosGrid.style.display = 'grid';
        let tarjetasRenderizadas = 0;
        const oportunidadesPromosActivas = config.oportunidades?.enabled === true
            && config.promocionesOportunidades?.enabled === true
            && Array.isArray(config.promocionesOportunidades?.ejemplos)
            && config.promocionesOportunidades.ejemplos.length > 0;

        const aplicarLayoutPreciosGrid = () => {
            preciosGrid.classList.remove(
                'precios-grid-promos--1',
                'precios-grid-promos--2',
                'precios-grid-promos--3',
                'precios-grid-promos--4',
                'precios-grid-promos--many'
            );
            const totalCards = preciosGrid.children.length;
            if (totalCards === 1) preciosGrid.classList.add('precios-grid-promos--1');
            else if (totalCards === 2) preciosGrid.classList.add('precios-grid-promos--2');
            else if (totalCards === 3) preciosGrid.classList.add('precios-grid-promos--3');
            else if (totalCards === 4) preciosGrid.classList.add('precios-grid-promos--4');
            else if (totalCards > 4) preciosGrid.classList.add('precios-grid-promos--many');
        };

        if (config.descuentos?.enabled && config.descuentos?.reglas?.length > 0) {
            config.descuentos.reglas.forEach((regla) => {
                const precioCard = document.createElement('div');
                precioCard.className = 'promo-card-grande descuento-card';
                const totalPaquete = Number(regla.total ?? regla.precio ?? 0);
                precioCard.innerHTML = `
                    <div class="promo-card-body">
                        <span class="promo-card-tag">Promocion</span>
                        <div class="promo-card-cantidad">${regla.cantidad} Boletos</div>
                        <div class="promo-card-label">Solo por:</div>
                        <div class="promo-card-precio">$${totalPaquete}</div>
                    </div>
                    <button class="btn btn-secondary promo-card-btn" onclick="window.location.href='compra.html'">Comprar Ahora</button>
                `;
                preciosGrid.appendChild(precioCard);
                tarjetasRenderizadas++;
            });
        }

        if (oportunidadesPromosActivas) {
            config.promocionesOportunidades.ejemplos.forEach((ejemplo) => {
                const oportunidadCard = document.createElement('div');
                oportunidadCard.className = 'promo-card-grande oportunidad-card';
                oportunidadCard.innerHTML = `
                    <div class="promo-card-body">
                        <span class="promo-card-tag">Oportunidades</span>
                        <div class="promo-card-cantidad">${ejemplo.boletos} Boleto${ejemplo.boletos > 1 ? 's' : ''}</div>
                        <div class="promo-card-equals">=</div>
                        <div class="promo-card-precio promo-card-precio--dark">${ejemplo.oportunidades} Oportunidade${ejemplo.oportunidades > 1 ? 's' : ''}</div>
                        <div class="promo-card-note">Mas oportunidades de ganar</div>
                    </div>
                    <button class="btn btn-secondary promo-card-btn" onclick="window.location.href='compra.html'">Comprar Ahora</button>
                `;
                preciosGrid.appendChild(oportunidadCard);
                tarjetasRenderizadas++;
            });
        }

        if (tarjetasRenderizadas === 0) {
            preciosGrid.style.display = 'none';
            return;
        }

        preciosGrid.style.display = 'grid';
        aplicarLayoutPreciosGrid();
    }

    function renderizarBonos() {
        const bonosSection = document.getElementById('bonosSection');
        const bonosGrid = document.getElementById('bonosGrid');
        const config = obtenerRifaPublica()?.bonos;
        if (!bonosSection || !bonosGrid || !config) return;

        const firmaBonos = {
            enabled: config.enabled === true,
            items: Array.isArray(config.items) ? config.items : []
        };
        if (!actualizarFirmaIndex('bonosIndex', firmaBonos)) return;

        if (!config.enabled) {
            bonosSection.style.display = 'none';
            return;
        }

        bonosSection.style.display = 'block';
        bonosGrid.innerHTML = '';

        const esBonoRedesDiezMil = (bono) => {
            const texto = `${bono?.titulo || ''} ${bono?.descripcion || ''}`.toLowerCase().replace(/\s+/g, ' ');
            const textoCompacto = texto.replace(/[^\d]/g, '');
            return texto.includes('10,000')
                || texto.includes('$10,000')
                || texto.includes('10000')
                || textoCompacto.includes('10000');
        };

        if (Array.isArray(config.items)) {
            config.items.forEach((bono) => {
                const colorMap = {
                    success: 'bono-success',
                    warning: 'bono-warning',
                    info: 'bono-info',
                    primary: 'bono-primary'
                };

                const bonoCard = document.createElement('div');
                bonoCard.className = `bono-card ${colorMap[bono.color] || 'bono-primary'}`;
                let contenido = `
                    <div class="bono-icono">${bono.emoji || '✔️'}</div>
                    <div class="bono-header">
                        <span class="bono-badge">Bono especial</span>
                        <p class="bono-titulo">${bono.titulo}</p>
                        <p class="bono-descripcion">${bono.descripcion}</p>
                    </div>
                `;

                if (bono.accion === 'unirseWhatsapp') {
                    const whatsappUrl = obtenerClientePublico()?.redesSociales?.canalWhatsapp;
                    if (whatsappUrl) {
                        contenido += `
                            <div class="bono-accion">
                                <a href="${whatsappUrl}" target="_blank" class="bono-btn-whatsapp">
                                    <i class="fab fa-whatsapp"></i>
                                    Unirte al canal
                                </a>
                            </div>
                        `;
                    }
                }

                if (esBonoRedesDiezMil(bono)) {
                    contenido += `
                        <div class="bono-accion">
                            <a href="#contacto" class="bono-btn-redes">Ver redes</a>
                        </div>
                    `;
                }

                bonoCard.innerHTML = contenido;
                bonosGrid.appendChild(bonoCard);
            });
        }
    }

    function renderizarInformacionDelSorteo() {
        const container = document.getElementById('descripcionTextoDinamico');
        const informacion = obtenerRifaPublica()?.informacionSorteo;
        if (!container || !Array.isArray(informacion)) return;
        if (!actualizarFirmaIndex('informacionSorteoIndex', informacion)) return;

        container.innerHTML = '';
        informacion.forEach((item) => {
            try {
                const titulo = String(item.titulo || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const descripcion = String(item.descripcion || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                container.insertAdjacentHTML('beforeend', `
                    <div class="descripcion-seccion">
                        <h3>${titulo}</h3>
                        <p>${descripcion}</p>
                    </div>
                `);
            } catch (error) {
                indexWarn('Error renderizando elemento:', error);
            }
        });
    }

    function renderizarInformacionSorteoIntro() {
        const container = document.getElementById('descripcionIntro');
        const introText = obtenerRifaPublica()?.informacionSorteoIntro;
        if (!container || !introText) return;
        if (!actualizarFirmaIndex('informacionSorteoIntroIndex', introText)) return;

        try {
            container.innerHTML = `<p>${String(introText).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
        } catch (error) {
            indexWarn('Error renderizando intro del sorteo:', error);
        }
    }

    function aplicarVisibilidadConfianza() {
        const section = document.getElementById('confianzaSection');
        if (!section) return;

        const publicacion = obtenerRifaPublica()?.publicacion || {};
        section.style.display = publicacion.confianza !== false ? '' : 'none';
    }

    function actualizarMensajeCompras() {
        const el = document.getElementById('compras-mensaje');
        const rifa = window.rifaplusConfig?.rifa;
        if (!el || !rifa) return;

        const boletosVendidosTexto = document.getElementById('boletos-vendidos')?.textContent || '0';
        const boletosVendidos = parseInt(boletosVendidosTexto.replace(/[^\d]/g, ''), 10) || 0;
        const totalBoletos = typeof window.rifaplusConfig?.obtenerTotalBoletos === 'function'
            ? window.rifaplusConfig.obtenerTotalBoletos()
            : (rifa.totalBoletos || 0);

        let mensaje = 'Miles de personas confían en nosotros cada día';
        if (boletosVendidos > 0) {
            const porcentaje = totalBoletos > 0 ? (boletosVendidos / totalBoletos * 100).toFixed(0) : '0';
            if (boletosVendidos < 10) mensaje = `¡${boletosVendidos} personas ya compraron hoy! ¿Será tu día de suerte?`;
            else if (boletosVendidos < 50) mensaje = `¡${boletosVendidos} compradores ya participan! Únete ahora`;
            else if (boletosVendidos < 100) mensaje = `🔥 ¡${boletosVendidos} personas compradas y contando! La emoción sube`;
            else mensaje = `🎉 ¡Más de ${boletosVendidos} personas ya participan! (${porcentaje}% del total)`;
        }

        el.textContent = mensaje;
    }

    const actualizarMensajeComprasDebounced = (() => {
        let frameId = 0;
        return () => {
            if (frameId) cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(() => {
                frameId = 0;
                actualizarMensajeCompras();
            });
        };
    })();

    async function renderizarSeccionGanadores() {
        const seccion = document.getElementById('seccionGanadores');
        const contenedor = document.getElementById('ganadoresContenedor');
        if (!seccion || !contenedor) return;

        try {
            const apiBase = window.rifaplusConfig?.backend?.apiBase
                || window.rifaplusConfig?.obtenerApiBase?.()
                || window.location.origin;
            const res = await fetch(`${apiBase}/api/ganadores?limit=500`);
            if (!res.ok) throw new Error('no_server');
            const payload = await res.json();
            const rows = payload?.data || [];

            if (!Array.isArray(rows) || rows.length === 0) {
                seccion.style.display = 'none';
                return;
            }

            const mapped = { sorteo: [], presorteo: [], ruletazos: [] };
            rows.forEach((row, idx) => {
                const tipoRaw = String(row.tipo_ganador || '').toLowerCase();
                let key = 'sorteo';
                if (tipoRaw.includes('presorte')) key = 'presorteo';
                else if (tipoRaw.includes('rulet')) key = 'ruletazos';
                mapped[key].push({
                    numero: String(row.numero_boleto || row.numero_orden || ''),
                    posicion: row.posicion || (idx + 1),
                    nombre: row.nombre_ganador || row.nombre_cliente || ''
                });
            });

            if (!actualizarFirmaIndex('ganadoresIndex', mapped)) return;

            seccion.style.display = 'block';
            contenedor.innerHTML = '';
            ['sorteo', 'presorteo', 'ruletazos'].forEach((tipo) => {
                const arr = mapped[tipo];
                if (!arr || arr.length === 0) return;

                const tipoSeccion = document.createElement('div');
                tipoSeccion.className = 'ganadores-por-tipo';
                tipoSeccion.innerHTML = `
                    <div class="ganadores-tipo-header">
                        <h3>${tipo.toUpperCase()}</h3>
                        <div class="ganadores-tipo-counter">${arr.length} ganador${arr.length > 1 ? 'es' : ''}</div>
                    </div>
                    <div class="ganadores-lista">
                        ${arr.map((ganador) => `
                            <div class="ganador-card">
                                <div class="ganador-numero">${ganador.numero}</div>
                                <div class="ganador-nombre">${ganador.nombre}</div>
                            </div>
                        `).join('')}
                    </div>
                `;
                contenedor.appendChild(tipoSeccion);
            });
        } catch (error) {
            indexWarn('[index] Error fetching ganadores from server, hiding section', error);
            seccion.style.display = 'none';
        }
    }

    function renderizarRedesSociales() {
        const contactoGrid = document.getElementById('contactoGrid');
        const footerSocial = document.getElementById('footerSocial');
        const redes = obtenerClientePublico()?.redesSociales || null;

        if ((!contactoGrid && !footerSocial) || !redes) return;
        if (!actualizarFirmaIndex('redesSocialesIndex', redes)) return;

        if (contactoGrid) {
            contactoGrid.innerHTML = '';

            if (redes.canalWhatsapp) {
                const whatsappCard = document.createElement('div');
                whatsappCard.className = 'contacto-icono-btn';
                whatsappCard.innerHTML = `
                    <i class="fab fa-whatsapp contacto-icon-grande"></i>
                    <span class="contacto-nombre-usuario">Canal ${redes.canalWhatsappNombre || 'WhatsApp'}</span>
                    <a href="${redes.canalWhatsapp}" class="btn btn-contacto" target="_blank">Unirte</a>
                `;
                contactoGrid.appendChild(whatsappCard);
            }

            if (redes.facebook) {
                const facebookCard = document.createElement('div');
                facebookCard.className = 'contacto-icono-btn';
                facebookCard.innerHTML = `
                    <i class="fab fa-facebook-f contacto-icon-grande"></i>
                    <span class="contacto-nombre-usuario">${redes.facebookUsuario || 'Facebook'}</span>
                    <a href="${redes.facebook}" class="btn btn-contacto" target="_blank">Seguir</a>
                `;
                contactoGrid.appendChild(facebookCard);
            }

            if (redes.instagram) {
                const instagramCard = document.createElement('div');
                instagramCard.className = 'contacto-icono-btn';
                instagramCard.innerHTML = `
                    <i class="fab fa-instagram contacto-icon-grande"></i>
                    <span class="contacto-nombre-usuario">${redes.instagramUsuario || 'Instagram'}</span>
                    <a href="${redes.instagram}" class="btn btn-contacto" target="_blank">Seguir</a>
                `;
                contactoGrid.appendChild(instagramCard);
            }
        }

        if (footerSocial) {
            footerSocial.innerHTML = '';

            if (redes.facebook) {
                const facebookLink = document.createElement('a');
                facebookLink.href = redes.facebook;
                facebookLink.target = '_blank';
                facebookLink.title = 'Facebook';
                facebookLink.innerHTML = '<i class="fab fa-facebook-f"></i>';
                footerSocial.appendChild(facebookLink);
            }
            if (redes.instagram) {
                const instagramLink = document.createElement('a');
                instagramLink.href = redes.instagram;
                instagramLink.target = '_blank';
                instagramLink.title = 'Instagram';
                instagramLink.innerHTML = '<i class="fab fa-instagram"></i>';
                footerSocial.appendChild(instagramLink);
            }
            if (redes.whatsapp) {
                const whatsappLink = document.createElement('a');
                whatsappLink.href = `https://wa.me/${redes.whatsapp.replace(/\D/g, '')}`;
                whatsappLink.target = '_blank';
                whatsappLink.title = 'WhatsApp';
                whatsappLink.innerHTML = '<i class="fab fa-whatsapp"></i>';
                footerSocial.appendChild(whatsappLink);
            }
            if (redes.tiktok) {
                const tiktokLink = document.createElement('a');
                tiktokLink.href = redes.tiktok;
                tiktokLink.target = '_blank';
                tiktokLink.title = 'TikTok';
                tiktokLink.innerHTML = '<i class="fab fa-tiktok"></i>';
                footerSocial.appendChild(tiktokLink);
            }
        }
    }

    function actualizarFooterPublico() {
        const cliente = obtenerClientePublico();
        if (!cliente) return;

        if (typeof window.rifaplusConfig?.actualizarNombreClienteEnUI === 'function') {
            window.rifaplusConfig.actualizarNombreClienteEnUI();
        }

        const footerEslogan = document.getElementById('footerEslogan');
        if (footerEslogan) {
            footerEslogan.textContent = cliente.eslogan || 'Rifas 100% Transparentes y Seguras';
        }

        const logoLink = document.getElementById('logoLink');
        if (logoLink) {
            logoLink.href = './index.html';
            logoLink.target = '_self';
            logoLink.setAttribute('aria-label', 'Ir a la página de inicio');
        }

        const footerEmail = document.getElementById('footerEmail');
        if (footerEmail && cliente.email) {
            footerEmail.href = `mailto:${cliente.email}`;
            footerEmail.textContent = cliente.email;
        }

        const footerTelefono = document.getElementById('footerTelefono');
        if (footerTelefono && cliente.telefono) {
            footerTelefono.href = `tel:${cliente.telefono.replace(/[^0-9+]/g, '')}`;
            footerTelefono.textContent = cliente.telefono;
        }

        renderizarRedesSociales();
    }

    function animarEntradaBotonFlotante() {
        const btnFlotante = document.querySelector('.btn-flotante-comprobante');
        if (!btnFlotante) return;

        btnFlotante.classList.add('bounce-animate');
        if (state.footerBounceTimerId) {
            clearTimeout(state.footerBounceTimerId);
        }
        state.footerBounceTimerId = window.setTimeout(() => {
            btnFlotante.classList.remove('bounce-animate');
            state.footerBounceTimerId = 0;
        }, 2000);
    }

    function actualizarContenidoIndexCritico() {
        renderizarTarjetasInfo();
        cargarNombreEdicion();
        cargarHeroContent();
        cargarPrecioUnitario();
        cargarPreciosYDescuentos();
    }

    function actualizarContenidoIndexSecundario() {
        renderizarInformacionDelSorteo();
        renderizarInformacionSorteoIntro();
        cargarGaleria();
        aplicarVisibilidadConfianza();
        renderizarRedesSociales();
        actualizarFooterPublico();
        activarRenderDiferidoEnMovil('bonosSection', renderizarBonos, { stateKey: 'bonos' });
        activarRenderDiferidoEnMovil('seccionGanadores', renderizarSeccionGanadores, { stateKey: 'ganadores', rootMargin: '340px 0px' });
    }

    function cancelarRenderSecundarioIndex() {
        if (state.secondaryRenderFrameId) {
            cancelAnimationFrame(state.secondaryRenderFrameId);
            state.secondaryRenderFrameId = 0;
        }
        if (state.secondaryRenderIdleId) {
            const cancelIdle = window.cancelIdleCallback || clearTimeout;
            cancelIdle(state.secondaryRenderIdleId);
            state.secondaryRenderIdleId = 0;
        }
    }

    function programarActualizacionIndexSecundaria() {
        cancelarRenderSecundarioIndex();
        state.secondaryRenderFrameId = requestAnimationFrame(() => {
            state.secondaryRenderFrameId = 0;
            const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 180));
            state.secondaryRenderIdleId = idle(() => {
                state.secondaryRenderIdleId = 0;
                actualizarContenidoIndexSecundario();
            }, { timeout: 1200 });
        });
    }

    function configurarObservadorBoletos() {
        if (state.boletosObserver) return;

        state.boletosObserver = new MutationObserver(() => {
            actualizarMensajeCompras();
        });

        const boletosVendidosEl = document.getElementById('boletos-vendidos');
        if (boletosVendidosEl) {
            state.boletosObserver.observe(boletosVendidosEl, { childList: true, characterData: true, subtree: true });
        }
    }

    function manejarVisibilidadPagina() {
        if (document.hidden) {
            cancelarActualizacionPrecioUnitario();
            detenerAutoAdvanceCarrusel();
            return;
        }

        cargarPrecioUnitario();
        reiniciarAutoAdvanceCarrusel();
        programarActualizacionIndexSecundaria();
    }

    function onConfigRefresh() {
        actualizarContenidoIndexCritico();
        programarActualizacionIndexSecundaria();
        actualizarMensajeComprasDebounced();
    }

    function inicializar() {
        if (state.initialized) {
            onConfigRefresh();
            return;
        }

        state.initialized = true;
        actualizarContenidoIndexCritico();
        programarActualizacionIndexSecundaria();
        actualizarFooterPublico();
        animarEntradaBotonFlotante();
        actualizarMensajeComprasDebounced();
        configurarObservadorBoletos();

        window.addEventListener('configSyncCompleto', onConfigRefresh);
        window.addEventListener('configuracionActualizada', onConfigRefresh);
        window.addEventListener('boletosListos', actualizarMensajeComprasDebounced);
        window.addEventListener('estadoActualizado', actualizarMensajeComprasDebounced);
        document.addEventListener('visibilitychange', manejarVisibilidadPagina);
        window.addEventListener('ganadoresActualizados', () => activarRenderDiferidoEnMovil('seccionGanadores', renderizarSeccionGanadores, { stateKey: 'ganadores', rootMargin: '340px 0px' }));
        window.addEventListener('ganadesoresActualizados', () => activarRenderDiferidoEnMovil('seccionGanadores', renderizarSeccionGanadores, { stateKey: 'ganadores', rootMargin: '340px 0px' }));
        window.addEventListener('storage', (event) => {
            try {
                const expected = window.GanadoresManager?.STORAGE_KEY;
                if (event.key && expected && event.key === expected) {
                    activarRenderDiferidoEnMovil('seccionGanadores', renderizarSeccionGanadores, { stateKey: 'ganadores', rootMargin: '340px 0px' });
                }
            } catch (error) {
                indexWarn('No se pudo sincronizar ganadores desde storage:', error);
            }
        });
    }

    window.renderizarTarjetasInfo = renderizarTarjetasInfo;
    window.renderizarBonos = renderizarBonos;
    window.renderizarInformacionDelSorteo = renderizarInformacionDelSorteo;
    window.renderizarInformacionSorteoIntro = renderizarInformacionSorteoIntro;
    window.renderizarSeccionGanadores = renderizarSeccionGanadores;
    window.renderizarRedesSociales = renderizarRedesSociales;
    window.actualizarFooterPublico = actualizarFooterPublico;
    window.actualizarMensajeCompras = actualizarMensajeCompras;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar, { once: true });
    } else {
        inicializar();
    }
})();
