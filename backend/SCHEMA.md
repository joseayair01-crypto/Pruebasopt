# 📋 Esquema de la BD - RifaPlus

**Última actualización:** 15 de febrero de 2026  
**BD:** Supabase PostgreSQL  
**Estado:** ✅ Sincronizado

## 🚨 Columnas ELIMINADAS (NO USAR)

Estas columnas existieron pero fueron eliminadas. **NO deben usarse en el código:**

- ❌ `whatsapp` → Usar `telefono_cliente` en su lugar
- ❌ `oportunidades` → La tabla `oportunidades` es separada

## ✅ Tabla: `ordenes`

Columnas que existen actualmente:

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | SERIAL | PK |
| `numero_orden` | VARCHAR | Único |
| `nombre_cliente` | VARCHAR | - |
| `apellido_cliente` | VARCHAR | - |
| `email` | VARCHAR | - |
| `telefono_cliente` | VARCHAR | **Usar esto, NO whatsapp** |
| `telefono` | VARCHAR | Alternativo/legacy |
| `cantidad_boletos` | INTEGER | - |
| `precio_unitario` | DECIMAL | - |
| `subtotal` | DECIMAL | - |
| `descuento` | DECIMAL | - |
| `total` | DECIMAL | - |
| `boletos` | JSON | Array de números |
| `tipo_pago` | VARCHAR | - |
| `metodo_pago` | VARCHAR | - |
| `estado` | VARCHAR | (pendiente, confirmada, cancelada) |
| `estado_cliente` | VARCHAR | (estado/provincia) |
| `ciudad_cliente` | VARCHAR | Ciudad |
| `ciudad` | VARCHAR | Alternativo/legacy |
| `detalles_pago` | VARCHAR | - |
| `nombre_banco` | VARCHAR | - |
| `numero_referencia` | VARCHAR | - |
| `nombre_beneficiario` | VARCHAR | - |
| `comprobante_path` | VARCHAR | URL en Cloudinary |
| `created_at` | TIMESTAMP | - |
| `updated_at` | TIMESTAMP | - |

## 🔄 Patrones de Resiliencia

### ✅ Hacer: Usar fallbacks lógicos
```javascript
// CORRECTO: fallback a alternativas que existen
let telefono = orden.telefono_cliente || orden.telefono || '';
```

### ❌ NO hacer: Referenciar columnas inexistentes
```javascript
// INCORRECTO: whatsapp no existe
let whatsapp = orden.whatsapp || ''; // ❌ Siempre será undefined
```

### ✅ Hacer: Usar select('*')
```javascript
// Seguro: obtiene todas las columnas reales
let query = db('ordenes').select('*');
```

### ❌ NO hacer: Listar columnas específicas sin verificar
```javascript
// Riesgoso: puede fallar si las columnas fueron eliminadas
let query = db('ordenes').select('id', 'nombre', 'whatsapp'); // ❌ PELIGRO
```

## 🛠️ Verificación

Para verificar que el código está sincronizado con la BD:

```bash
node backend/diagnostico-esquema.js
```

Esto verificará:
- ✅ Que todas las columnas esperadas existan
- ❌ Que ninguna columna prohibida exista
- ⚠️ Que no haya referencias a columnas eliminadas en el código

## 📝 Al hacer migraciones

**Importante:** Si eliminas una columna:

1. ✅ Eliminarla de la BD
2. ✅ Actualizar este documento
3. ✅ Remover todas las referencias del código
4. ✅ Ejecutar `node diagnostico-esquema.js` para verificar
5. ✅ Actualizar fallbacks si es necesario

## 🔗 Tablas relacionadas

- `boletos_disponibles` - Catálogo de boletos
- `oportunidades` - Boletos dentro del rango especial (tabla separada)
- `admin_users` - Credenciales de admin

