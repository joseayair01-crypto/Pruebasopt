# Guia de Variables para Railway y Cloudflare

Este documento te deja claro que variables necesitas configurar para desplegar este proyecto con:

- `Railway` para el backend
- `Cloudflare Pages` para el frontend

Tambien explica cuales son obligatorias, cuales son opcionales y que ajuste debes hacer en el frontend para que deje de apuntar a local.

## Arquitectura recomendada

La forma correcta de desplegar este proyecto es:

- `Railway`: backend Node.js + conexion a PostgreSQL
- `Cloudflare Pages`: frontend estatico + funcion `functions/[[path]].js`

Flujo esperado:

- el navegador abre la web en Cloudflare
- el frontend consume la API del backend en Railway
- Cloudflare Pages usa `RIFAPLUS_API_BASE` para inyectar metadata dinamica
- Railway usa `PUBLIC_BASE_URL` y `CORS_ORIGINS` para confiar en el frontend correcto

## Importante antes de desplegar

Hoy el archivo [js/deploy-config.js](/Users/ayair/Desktop/rifas-web/js/deploy-config.js) esta en modo local:

```js
const FORCE_LOCAL_ONLY = true;
```

Asi como esta, el frontend seguira intentando usar `http://localhost:5001`.

Antes de desplegar debes cambiarlo a:

```js
const FORCE_LOCAL_ONLY = false;
```

Y en el bloque `production` debes poner tus URLs reales:

```js
production: {
    apiBase: 'https://TU-BACKEND.up.railway.app',
    publicBase: 'https://TU-FRONTEND.pages.dev',
    socketScriptUrl: SOCKET_CDN_URL
}
```

Si no haces esto, aunque pongas bien las variables del hosting, el frontend puede seguir apuntando a local.

## Variables para Railway

Estas variables viven en tu servicio del backend en Railway.

### Obligatorias

#### `NODE_ENV`

Valor recomendado:

```env
NODE_ENV=production
```

Sirve para:

- activar comportamiento de produccion
- usar CORS estricto
- ajustar rate limits y logs

#### `DATABASE_URL`

Valor:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DBNAME
```

Sirve para:

- conectar el backend a PostgreSQL
- migraciones
- lecturas y escrituras del sistema

Es una de las variables mas importantes del proyecto.

#### `JWT_SECRET`

Valor:

```env
JWT_SECRET=una_clave_larga_segura_y_unica
```

Sirve para:

- firmar y validar tokens del admin
- proteger rutas privadas

Usa una cadena larga, aleatoria y privada.

#### `CORS_ORIGINS`

Valor:

```env
CORS_ORIGINS=https://tu-proyecto.pages.dev,https://www.tudominio.com
```

Sirve para:

- permitir que el frontend haga requests al backend
- permitir Socket.IO en produccion

Pon todos los dominios reales desde donde se abrira el frontend.

#### `PUBLIC_BASE_URL`

Valor recomendado:

```env
PUBLIC_BASE_URL=https://tu-proyecto.pages.dev
```

Sirve para:

- generar URLs publicas correctas
- SEO
- Open Graph
- links construidos desde el backend

Si luego usas dominio propio, cambia este valor a tu dominio final.

#### `FRONTEND_URL`

Valor recomendado:

```env
FRONTEND_URL=https://tu-proyecto.pages.dev
```

En este proyecto actua como respaldo de `PUBLIC_BASE_URL`.

Mi recomendacion:

- deja `PUBLIC_BASE_URL` y `FRONTEND_URL` con el mismo valor

#### `CLOUDINARY_CLOUD_NAME`

Valor:

```env
CLOUDINARY_CLOUD_NAME=tu_cloud_name
```

#### `CLOUDINARY_API_KEY`

Valor:

```env
CLOUDINARY_API_KEY=tu_api_key
```

#### `CLOUDINARY_API_SECRET`

Valor:

```env
CLOUDINARY_API_SECRET=tu_api_secret
```

Estas tres sirven para:

- subir imagen principal
- subir galeria
- subir comprobantes
- borrar imagenes en Cloudinary

Tambien puedes usar `CLOUDINARY_URL`, pero en este proyecto ya se trabaja bien con las 3 variables separadas.

### Recomendadas

#### `INIT_SECRET`

Valor:

```env
INIT_SECRET=otra_clave_privada_para_init
```

Sirve para rutas de inicializacion protegidas.

No es la variable principal del sistema, pero si la pondria para no dejar ese flujo con fallback debil.

### Opcionales

#### `ORDEN_APARTADO_HORAS`

Valor ejemplo:

```env
ORDEN_APARTADO_HORAS=2
```

Solo actua como fallback de arranque si aun no esta lista la configuracion dinamica.

#### `ORDEN_LIMPIEZA_MINUTOS`

Valor ejemplo:

```env
ORDEN_LIMPIEZA_MINUTOS=10
```

Tambien es fallback.

#### `PRECIO_BOLETO`

Valor ejemplo:

```env
PRECIO_BOLETO=10
```

Fallback de arranque.

#### `TOTAL_BOLETOS`

Valor ejemplo:

```env
TOTAL_BOLETOS=20000
```

Fallback de arranque.

#### `DEBUG_ORDENES`

```env
DEBUG_ORDENES=false
```

#### `DEBUG_ORDENES_PERF`

```env
DEBUG_ORDENES_PERF=false
```

Solo para diagnostico. No son necesarias en despliegue normal.

#### `SENTRY_DSN`

Opcional si luego quieres monitoreo de errores.

## Resumen corto para Railway

Si quieres lo minimo serio para que funcione bien, configura esto:

```env
NODE_ENV=production
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DBNAME
JWT_SECRET=una_clave_larga_segura_y_unica
CORS_ORIGINS=https://tu-proyecto.pages.dev
PUBLIC_BASE_URL=https://tu-proyecto.pages.dev
FRONTEND_URL=https://tu-proyecto.pages.dev
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret
INIT_SECRET=otra_clave_privada_para_init
```

## Variables para Cloudflare Pages

En este proyecto, Cloudflare Pages necesita mucho menos.

### Obligatoria

#### `RIFAPLUS_API_BASE`

Valor:

```env
RIFAPLUS_API_BASE=https://tu-backend.up.railway.app
```

Sirve para:

- `functions/[[path]].js`
- resolver la API base para metadata dinamica
- no depender del fallback automatico

Esta es la variable importante en Cloudflare para este proyecto.

### No obligatorias para Cloudflare Pages

No necesitas en Pages:

- `DATABASE_URL`
- `JWT_SECRET`
- `CLOUDINARY_*`
- `CORS_ORIGINS`

Esas viven en Railway, no en Cloudflare.

## Resumen corto para Cloudflare

Lo minimo:

```env
RIFAPLUS_API_BASE=https://tu-backend.up.railway.app
```

## Valores ejemplo reales de estructura

### Railway

```env
NODE_ENV=production
DATABASE_URL=postgresql://postgres:password123@db.railway.internal:5432/railway
JWT_SECRET=SaDev_super_secret_2026_xxxxxxxxx
CORS_ORIGINS=https://sadev.pages.dev,https://www.sadev.com
PUBLIC_BASE_URL=https://sadev.pages.dev
FRONTEND_URL=https://sadev.pages.dev
CLOUDINARY_CLOUD_NAME=demo-cloud
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=xxxxxxxxxxxxxxxxxxxx
INIT_SECRET=SaDev_init_secret_xxxxxxxxx
```

### Cloudflare Pages

```env
RIFAPLUS_API_BASE=https://sadev-production.up.railway.app
```

## Orden correcto de configuracion

### 1. Prepara Railway

Configura primero:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `PUBLIC_BASE_URL`
- `FRONTEND_URL`
- `CLOUDINARY_*`
- `INIT_SECRET`

### 2. Ajusta frontend para produccion

En [js/deploy-config.js](/Users/ayair/Desktop/rifas-web/js/deploy-config.js):

- cambia `FORCE_LOCAL_ONLY` a `false`
- define `production.apiBase`
- define `production.publicBase`

### 3. Configura Cloudflare Pages

Agrega:

- `RIFAPLUS_API_BASE`

apuntando al backend de Railway.

### 4. Verifica consistencia

Debe quedar asi:

- `Cloudflare Pages` -> llama a `Railway`
- `Railway CORS_ORIGINS` -> permite el dominio de `Cloudflare`
- `Railway PUBLIC_BASE_URL` -> apunta al dominio del frontend
- `Cloudflare RIFAPLUS_API_BASE` -> apunta al dominio del backend

## Errores comunes

### El frontend sigue llamando a localhost

Causa:

- `FORCE_LOCAL_ONLY` sigue en `true`

Solucion:

- cambia ese valor a `false`
- revisa el bloque `production`

### CORS bloquea peticiones

Causa:

- `CORS_ORIGINS` no incluye el dominio real del frontend

Solucion:

- agrega el dominio exacto de Pages o de tu dominio custom

### Open Graph no toma metadata dinamica

Causa probable:

- falta `RIFAPLUS_API_BASE` en Cloudflare Pages

Solucion:

- configurala apuntando al backend en Railway

### El backend no sube imagenes

Causa:

- falta Cloudinary

Solucion:

- configura `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

## Recomendacion final

Para este proyecto, la configuracion mas sana es:

- Railway con todas las variables sensibles y operativas
- Cloudflare Pages solo con `RIFAPLUS_API_BASE`
- frontend apuntando a produccion desde `js/deploy-config.js`

Si quieres, el siguiente paso te lo puedo hacer yo tambien:

1. dejarte un `.env.example` limpio para Railway
2. ajustar `js/deploy-config.js` para produccion
3. revisar contigo los valores exactos antes del deploy
