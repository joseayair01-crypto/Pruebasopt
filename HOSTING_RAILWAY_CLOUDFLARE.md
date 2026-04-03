# Hosting Paso a Paso: Railway + Cloudflare Pages

Este proyecto ya esta preparado para:

- Backend en Railway
- Frontend estatico en Cloudflare Pages
- Metadata social dinamica por ruta desde la configuracion actual del admin

## 1. GitHub

1. Sube el proyecto a GitHub.
2. Confirma que la rama correcta es `main`.

## 2. Backend en Railway

1. Crea un proyecto nuevo en Railway.
2. Conecta el repo.
3. Crea un servicio desde ese repo.
4. Configura:
   - Root Directory: `backend`
   - Start Command: `npm start`

## 3. Variables en Railway

Agrega estas variables:

```env
NODE_ENV=production
JWT_SECRET=tu_secret_largo
DATABASE_URL=tu_database_url
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret
CORS_ORIGINS=https://tu-frontend.pages.dev
PUBLIC_BASE_URL=https://tu-frontend.pages.dev
```

Notas:

- `PORT` no se configura manualmente en Railway.
- `PUBLIC_BASE_URL` ayuda a que canonical y previews usen el dominio publico correcto.

## 4. Verifica backend en Railway

Cuando termine el deploy, prueba:

- `https://tu-backend.up.railway.app/api/public/config`
- `https://tu-backend.up.railway.app/api/public/boletos/stats`
- `https://tu-backend.up.railway.app/api/og-metadata?path=/compra&publicBase=https://tu-frontend.pages.dev`

## 5. Frontend en Cloudflare Pages

1. Crea un proyecto en Cloudflare Pages.
2. Conecta el mismo repo.
3. Usa:
   - Framework preset: `None`
   - Build command: vacio
   - Build output directory: `/`

## 6. Variables en Cloudflare Pages

Agrega esta variable de entorno:

```env
RIFAPLUS_API_BASE=https://tu-backend.up.railway.app
```

Esta variable la usa la funcion `functions/[[path]].js` para pedir la metadata actual al backend y reescribir el HTML antes de entregarlo.

## 7. Configuracion de frontend

El frontend ya tiene:

- `js/deploy-config.js` para definir la base del backend en cliente
- `js/meta-inyector.js` para refrescar metadata en navegador
- `functions/[[path]].js` para que bots y previews reciban HTML con metadata real

Si cambia el dominio del backend:

1. Actualiza `js/deploy-config.js`
2. Actualiza `RIFAPLUS_API_BASE` en Cloudflare Pages

## 8. Validacion final

Prueba en produccion:

1. Home
2. Compra
3. Busqueda avanzada
4. Crear orden
5. Subir comprobante
6. Mis boletos
7. Panel admin
8. Compartir `https://tu-frontend.pages.dev/compra` por WhatsApp

## 9. Si la vista previa social sale mal

Revisa esto en orden:

1. Que Cloudflare Pages ya termino el deploy
2. Que `RIFAPLUS_API_BASE` apunta al backend correcto
3. Que Railway responde `200` en `/api/og-metadata`
4. Que `PUBLIC_BASE_URL` y `CORS_ORIGINS` usan el dominio real del frontend
5. Que el backend tenga la configuracion actual del admin ya sincronizada

## 10. Flujo recomendado para futuros deploys

1. Actualiza configuracion desde admin
2. Verifica en Railway que `/api/public/config` devuelve la config actual
3. Sube cambios a GitHub
4. Espera deploy de Railway
5. Espera deploy de Cloudflare
6. Haz hard refresh
7. Valida share preview y flujo de compra
