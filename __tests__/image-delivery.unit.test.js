const {
    esUrlCloudinary,
    resolverUrlImagen,
    construirSrcset,
    autoOptimizarImagen
} = require('../js/image-delivery.js');

describe('image-delivery', () => {
    test('detecta URLs de Cloudinary validas', () => {
        expect(esUrlCloudinary('https://res.cloudinary.com/demo/image/upload/v123/test.png')).toBe(true);
        expect(esUrlCloudinary('https://example.com/test.png')).toBe(false);
    });

    test('optimiza logo raster con transformacion limpia', () => {
        const url = 'https://res.cloudinary.com/demo/image/upload/v1775517228/rifaplus/sorteos/logo-test.png';
        expect(resolverUrlImagen(url, 'logo')).toBe(
            'https://res.cloudinary.com/demo/image/upload/c_limit,w_320,h_180,dpr_auto,q_auto:best,f_auto/v1775517228/rifaplus/sorteos/logo-test.png'
        );
    });

    test('reemplaza transformaciones existentes en vez de encimarlas', () => {
        const url = 'https://res.cloudinary.com/demo/image/upload/c_fill,w_100/f_auto,q_auto/v1775517228/rifaplus/sorteos/logo-test.png';
        expect(resolverUrlImagen(url, 'logoPreload')).toBe(
            'https://res.cloudinary.com/demo/image/upload/c_limit,w_320,h_180,dpr_auto,q_auto:best,f_auto/v1775517228/rifaplus/sorteos/logo-test.png'
        );
    });

    test('respeta SVG sin rasterizarlo', () => {
        const url = 'https://res.cloudinary.com/demo/image/upload/v1775517228/rifaplus/sorteos/logo-test.svg';
        expect(resolverUrlImagen(url, 'logo')).toBe(url);
    });

    test('genera srcset para carrusel responsive', () => {
        const url = 'https://res.cloudinary.com/demo/image/upload/v1775517228/rifaplus/sorteos/slide-test.png';
        expect(construirSrcset(url, [480, 960], 'carousel')).toBe(
            'https://res.cloudinary.com/demo/image/upload/c_limit,w_480,h_1280,dpr_auto,q_auto:good,f_auto/v1775517228/rifaplus/sorteos/slide-test.png 480w, https://res.cloudinary.com/demo/image/upload/c_limit,w_960,h_1280,dpr_auto,q_auto:good,f_auto/v1775517228/rifaplus/sorteos/slide-test.png 960w'
        );
    });

    test('auto optimiza imagenes Cloudinary con perfil detectado', () => {
        document.body.innerHTML = '<img class="orden-imagen-dinamica" src="https://res.cloudinary.com/demo/image/upload/v1775517228/rifaplus/sorteos/cover-test.png" loading="eager" fetchpriority="high">';
        const img = document.querySelector('img');

        const optimizedUrl = autoOptimizarImagen(img);

        expect(optimizedUrl).toBe(
            'https://res.cloudinary.com/demo/image/upload/c_limit,w_1200,h_675,dpr_auto,q_auto:good,f_auto/v1775517228/rifaplus/sorteos/cover-test.png'
        );
        expect(img.srcset).toContain('w_480,h_675');
        expect(img.dataset.rifaplusOptimized).toBe('true');
        expect(img.sizes).toBe('(max-width: 768px) 100vw, min(92vw, 1200px)');
    });

    test('no toca imagenes fuera de Cloudinary', () => {
        document.body.innerHTML = '<img class="hero-image" src="/images/local-cover.png">';
        const img = document.querySelector('img');

        const result = autoOptimizarImagen(img);

        expect(result).toBe('/images/local-cover.png');
        expect(img.getAttribute('src')).toBe('/images/local-cover.png');
        expect(img.dataset.rifaplusOptimized).toBeUndefined();
    });
});
