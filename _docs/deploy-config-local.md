# Guia de `js/deploy-config.js`

Este documento explica como funciona `js/deploy-config.js`, por que sirve para "desapuntar" frontend y backend de produccion, y como usarlo para dejar una copia del proyecto trabajando solo en local.

## Objetivo del archivo

`js/deploy-config.js` es la capa central que define a que URLs se conecta el frontend.

Su trabajo principal es resolver estos valores:

- `apiBase`: URL base del backend
- `publicBase`: URL publica del frontend
- `socketScriptUrl`: URL del script de Socket.IO

Despues deja esos valores disponibles en:

- `window.__RIFAPLUS_DEPLOY__`
- `window.RIFAPLUS_ENV`

Con eso, el resto del frontend toma la URL correcta sin que tengas que editar muchos archivos.

## Que problema resuelve

En esta copia del proyecto todavia habia referencias antiguas a produccion, por ejemplo:

- Railway para backend
- Pages para frontend

Eso es peligroso si vas a clonar esta web para otro cliente o para otra rifa, porque podrias seguir pegandole al backend remoto sin darte cuenta.

Por eso dejamos `deploy-config.js` en modo local-only.

## Estado actual

Hoy el archivo esta configurado asi:

```js
const FORCE_LOCAL_ONLY = true;
const LOCAL_API_BASE = 'http://localhost:5001';
const LOCAL_PUBLIC_BASE = 'http://localhost:5001';
```

Eso significa:

- el frontend siempre intenta usar `http://localhost:5001` como backend
- el frontend considera `http://localhost:5001` como base publica
- aunque abras la web desde otro host, la API sigue resolviendo a local

## Como funciona por dentro

## 1. Detecta el host actual

El archivo revisa el hostname:

```js
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const hostname = window.location.hostname;
const isLocalHost = LOCAL_HOSTS.has(hostname);
```

Con eso sabe si abriste la web desde:

- `localhost`
- `127.0.0.1`
- o cualquier otro dominio

## 2. Fuerza entorno local

La linea importante es esta:

```js
const isLocal = FORCE_LOCAL_ONLY || isLocalHost;
```

Si `FORCE_LOCAL_ONLY` esta en `true`, entonces el sistema se comporta como local aunque el hostname no sea local.

Esa es la llave principal para "desapuntar" el proyecto de produccion.

## 3. Define presets de entorno

El archivo tiene un objeto `DEPLOY_TARGETS`:

```js
const DEPLOY_TARGETS = {
    local: {
        apiBase: LOCAL_API_BASE,
        publicBase: isLocalHost ? origin : LOCAL_PUBLIC_BASE,
        socketScriptUrl: SOCKET_CDN_URL
    },
    production: {
        apiBase: LOCAL_API_BASE,
        publicBase: LOCAL_PUBLIC_BASE,
        socketScriptUrl: SOCKET_CDN_URL
    }
};
```

Normalmente aqui habria valores diferentes para `local` y `production`.

Pero en esta copia ambos presets quedaron apuntando a local, justamente para evitar que cualquier pagina termine usando URLs remotas.

## 4. Elige que preset usar

Luego el archivo decide cual preset aplicar:

```js
const selectedPreset = FORCE_LOCAL_ONLY
    ? DEPLOY_TARGETS.local
    : (isLocalHost ? DEPLOY_TARGETS.local : DEPLOY_TARGETS.production);
```

En palabras simples:

- si `FORCE_LOCAL_ONLY = true`, usa siempre `local`
- si `FORCE_LOCAL_ONLY = false`, decide entre `local` o `production` segun el host

## 5. Resuelve las URLs finales

Despues calcula el resultado final:

```js
const apiBase = normalizarBaseUrl(
    existingOverride.apiBase
    || selectedPreset.apiBase
    || obtenerMeta('rifaplus-api-base')
    || (isLocal ? LOCAL_API_BASE : origin)
);
```

La prioridad real es:

1. `window.__RIFAPLUS_DEPLOY__` si alguien ya lo seteo antes
2. el preset elegido en `DEPLOY_TARGETS`
3. la meta `rifaplus-api-base`
4. fallback por host/origin

Como el preset local ya esta fijo a `localhost:5001`, eso gana antes que las metas viejas de HTML.

## 6. Expone la configuracion al frontend

El resultado termina en:

```js
window.__RIFAPLUS_DEPLOY__
window.RIFAPLUS_ENV
```

Y otros archivos del proyecto consumen eso para hacer `fetch`, cargar sockets y formar URLs.

## Que significa cada variable importante

## `FORCE_LOCAL_ONLY`

Es el interruptor principal.

- `true`: esta copia trabaja solo en local
- `false`: vuelve a comportarse como proyecto con local y produccion

## `LOCAL_API_BASE`

Es la URL del backend local.

Ejemplo:

```js
const LOCAL_API_BASE = 'http://localhost:5001';
```

Si algun dia corres el backend en otro puerto, este es el valor que tendrias que cambiar.

## `LOCAL_PUBLIC_BASE`

Es la base publica que se usa para construir URLs del frontend, por ejemplo canonicales u Open Graph.

Ejemplo actual:

```js
const LOCAL_PUBLIC_BASE = 'http://localhost:5001';
```

## `DEPLOY_TARGETS.local`

Es el preset de desarrollo/local.

## `DEPLOY_TARGETS.production`

Es el preset de produccion.

En esta copia tambien apunta a local a proposito, para que no quede ningun camino a servicios remotos desde `deploy-config.js`.

## Casos de uso practicos

## Caso 1. Quiero esta web solo local

Dejala asi:

```js
const FORCE_LOCAL_ONLY = true;
const LOCAL_API_BASE = 'http://localhost:5001';
const LOCAL_PUBLIC_BASE = 'http://localhost:5001';
```

No necesitas tocar mas.

## Caso 2. Quiero otra copia de esta web para otro proyecto, tambien local

Haz esto:

1. Duplica el repo o la carpeta
2. Deja `FORCE_LOCAL_ONLY = true`
3. Levanta el backend local en el puerto que vayas a usar
4. Si cambias de puerto, actualiza `LOCAL_API_BASE`

Ejemplo si usas puerto `5100`:

```js
const LOCAL_API_BASE = 'http://localhost:5100';
const LOCAL_PUBLIC_BASE = 'http://localhost:5100';
```

## Caso 3. Quiero volver a habilitar produccion despues

Tendrias que cambiar esto:

```js
const FORCE_LOCAL_ONLY = false;
```

Y luego definir el bloque `production` con URLs reales:

```js
production: {
    apiBase: 'https://tu-backend.com',
    publicBase: 'https://tu-frontend.com',
    socketScriptUrl: SOCKET_CDN_URL
}
```

Con eso el proyecto volveria a decidir automaticamente:

- si estas en localhost: usa local
- si estas en un dominio remoto: usa production

## Como levantarlo local

Si tu backend sirve tambien los archivos del frontend, el flujo mas simple es:

```bash
cd backend
npm run dev
```

Y abrir:

```text
http://localhost:5001
```

Asi frontend y backend quedan en la misma URL base.

## Que no cambia este archivo

`deploy-config.js` solo resuelve a donde apunta el frontend.

No controla por si mismo:

- la base de datos
- Cloudinary
- variables del backend
- migraciones
- credenciales

O sea: este archivo evita que el frontend siga llamando produccion, pero no reemplaza la configuracion interna del backend.

## Recomendacion para trabajar con otra web desde esta base

Si vas a reutilizar este proyecto para otro negocio, usa esta secuencia:

1. Deja `FORCE_LOCAL_ONLY = true`
2. Levanta y prueba todo en local
3. Cambia branding, textos, imagenes y config del negocio
4. Cuando ya este lista la nueva web, entonces decides si habilitas un deploy remoto

Eso evita mezclar la web nueva con la infraestructura de la anterior.

## Resumen corto

Si quieres que esta copia no toque produccion:

- deja `FORCE_LOCAL_ONLY = true`
- deja `LOCAL_API_BASE = 'http://localhost:5001'`
- deja `LOCAL_PUBLIC_BASE = 'http://localhost:5001'`

Con eso `js/deploy-config.js` se convierte en el punto central para mantener frontend y backend trabajando solo en local.
