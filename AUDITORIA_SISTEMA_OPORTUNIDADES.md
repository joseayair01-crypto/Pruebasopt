
# 📋 AUDITORÍA: Sistema de Oportunidades

**Fecha**: 7 de febrero de 2026  
**Archivos Auditados**: 
- `js/carrito-global.js` ✅
- `js/config.js` ✅  
- `js/flujo-compra.js` ✅
- `js/compra.js` ✅
- `js/modal-contacto.js` ✅
- `js/oportunidades-cache.js` ✅

---

## 🔴 PROBLEMAS ENCONTRADOS

### 1. **INCONSISTENCIA CRÍTICA EN calcularYLlenarOportunidades** 
**Archivo**: [js/carrito-global.js](js/carrito-global.js#L850-L865)  
**Líneas**: 850-865

**Problema**: Hay lógica confusa para seleccionar números del pool
```javascript
// ❌ MAL: Repite chequeo innecesario
const disponiblesSet = new Set(numerosDisponibles); // Crea Set
// ...después...
if (!disponiblesSet.has(numero)) {  // Chequea pero número IGUAL FUE removido del pool
    console.error(`❌ ERROR CRÍTICO: Número ${numero} NO existe en disponiblesSet!`);
}
```

**Impacto**: 
- Si el número fue removido del `disponiblesPoolGlobal`, es IMPOSIBLE que esté en `disponiblesSet`
- El "ERROR CRÍTICO" nunca ocurriría realista porque el Set y Pool usan los mismos números

**Solución**: Eliminar validación redundante o cambiar lógica

---

### 2. **⚠️ DUPLICACIÓN: calcularDescuentoGlobal en dos archivos**
**Archivos**: 
- [js/carrito-global.js](js/carrito-global.js#L632) - Definición
- [js/calculo-precios.js](js/calculo-precios.js#L102) - Definición oficial

**Problema**: 
```javascript
// ❌ Misma función DEFINIDA en DOS lugares
// calculo-precios.js (línea 102) - "Reemplaza calcularDescuentoGlobal de carrito-global.js"
// carrito-global.js (línea 632) - Define su propia versión

// carrito-global.js LLAMA la suya (línea 280):
const calcTotal = calcularDescuentoGlobal(...);
```

**Impacto**: 
- Se llama la versión de `carrito-global.js` aunque calculo-precios.js intenta ser "oficial"
- Potencial inconsistencia si reciben actualizaciones diferentes
- Los comentarios indican que debería usar calculo-precios.js pero no lo hace

**Recomendación**: 
- Eliminar `calcularDescuentoGlobal` de carrito-global.js (línea 632-660)
- Cambiar línea 280 para que IMPORTE de calculo-precios.js

---

### 2b. **✅ actualizarCarritoConDebounceAgresivo - EN REALIDAD SE USA**
**Archivo**: [js/carrito-global.js](js/carrito-global.js#L722)

**Nota de corrección**: Este NO es código muerto
- Se DEFINE en línea 722
- Se LLAMA en línea 540
- Se exporta a window en línea 757 (para uso global)
- Propósito: Agrupa clics rápidos bajo un timeout de 50ms

---

### 3. **DATOS DUPLICADOS: Oportunidades guardadas dos veces**
**Archivos**: 
- [js/carrito-global.js](js/carrito-global.js#L920-L930)
- [js/flujo-compra.js](js/flujo-compra.js#L268-L272)

**Problema**: 
```javascript
// carrito-global.js guarda en localStorage:
localStorage.setItem('rifaplus_oportunidades', JSON.stringify(datosAGuardar));

// flujo-compra.js TAMBIÉN intenta guardarlo (aunque del localStorage):
const oportunidadesGuardadas = localStorage.getItem('rifaplus_oportunidades');
// ↓ SI recupera exitosamente, NO vuelve a guardar
// ↓ SI FALLA, tampoco genera nuevas oportunidades
```

**Impacto**: Si localStorage falla en carrito-global.js, flujo-compra.js NO tiene datos y fallback es []

---

### 4. **INCONSISTENCIA: Nombre del generador**
**Archivo**: [js/carrito-global.js](js/carrito-global.js#L916)

```javascript
// En carrito-global.js:
generador: 'carrito-global-v3' // ✅ MARCADOR

// Pero en flujo-compra.js NO se valida el generador:
datos.generador // Se usa pero NO se valida que sea 'carrito-global-v3'
```

**Recomendación**: Validar que el generador sea correcto en flujo-compra.js

---

### 5. **VALIDAR RANGO OCULTO NO TIENE FALLBACK**
**Archivo**: [js/carrito-global.js](js/carrito-global.js#L825-L832)

```javascript
const rangoOculto = rifaConfig?.oportunidades?.rango_oculto || { inicio: 250000, fin: 999999 };
const fueraRango = numerosDisponibles.filter(n => n < rangoOculto.inicio || n > rangoOculto.fin);

if (fueraRango.length > 0) {
    console.error(`❌ [CARRITO] ${fueraRango.length} números FUERA del rango`);
    // ⚠️ PERO CONTINÚA IGUALMENTE - No hay mitigación
}
```

**Impacto**: Si hay números fuera de rango, simplemente se loguea pero los números se usan igual

**Recomendación**: Filtrar fueraRango si es > 0

---

## 🟡 ADVERTENCIAS (No crítico pero riesgoso)

### 1. **Reintentos con setTimeout vs requestAnimationFrame**
**Archivo**: [js/carrito-global.js](js/carrito-global.js#L789)

```javascript
// ✅ BIEN: Usa setTimeout para reintentos
setTimeout(() => calcularYLlenarOportunidades(...), 0);

// ⚠️ PERO: 500ms es muy corto si el navegador está ocupado
setTimeout(() => calcularYLlenarOportunidades(...), 500);
```

**Recomendación**: Aumentar a 1000ms en segundo intento

---

### 2. **Falta Validación de cantidad vs disponibles**
**Archivo**: [js/carrito-global.js](js/carrito-global.js#L837)

```javascript
// Si numerosOrdenados.length = 100 boletos
// Y oportunidades_por_boleto = 3 → 300 oportunidades necesarias
// PERO solo hay 697k disponible total

// ✅ El código lo maneja con splice() pero NO evalúa de antemano
// Si disponiblesPoolGlobal < (numerosOrdenados.length * oportunidades_por_boleto)
// → Algunos boletos NO tendrían suficientes oportunidades
```

**Recomendación**: Validar antes de generar, mostrar advertencia

---

## 🟢 BUENAS PRÁCTICAS ENCONTRADAS

✅ **carrito-global.js**:
- Límite de reintentos (5) para evitar loop infinito
- Uso de Set para búsquedas O(1)
- Comentarios claros en español
- Structured logging con [CARRITO] prefix

✅ **oportunidades-cache.js**:
- IndexedDB + Memory + Set (arquitectura robusta)
- Exponential backoff en reintentos
- Auto-cleanup después de 5 minutos
- Fallback chain completo

✅ **flujo-compra.js**:
- NO regenera oportunidades (evita duplicados)
- Respeta lo que carrito-global.js generó
- Fallback propicio con valor []

---

## 📊 TABLA DE CONSISTENCIA

| Concepto | Definición | Ubicación | ¿Consistente? |
|----------|-----------|-----------|---------------|
| Rango de oportunidades | 250,000 - 999,999 | config.js + carrito-global.js | ✅ Sí |
| Cantidad por boleto | 3 oportunidades | config.js + carrito-global.js | ✅ Sí |
| Lugar de generación | carrito-global.js | Documentado en modal-contacto.js | ✅ Sí |
| localStorage key | 'rifaplus_oportunidades' | carrito-global.js + flujo-compra.js | ✅ Sí |
| Fallback si fallan | Array vacío [] | Ambos archivos | ✅ Sí |
| Evento disparado | 'oportunidadesListas' | main.js + carrito-global.js | ✅ Sí |

---

## 🔧 RECOMENDACIONES

### Priorit 1 (Crítico - ✅ COMPLETADO)
1. ✅ **DONE**: Fijar boot-cache.js y defer scripts en compra.html
2. ✅ **DONE**: Filtrar números fuera de rango en carrito-global.js (línea 827)
3. ✅ **DONE**: Validar generador en flujo-compra.js (línea 270)
4. ✅ **DONE**: Backoff exponencial en reintentos (500ms → 750ms → 1.1s → 1.7s → 2.5s)

### Prioridad 2 (Mejora - TODO Esta Semana)
1. Eliminar `calcularDescuentoGlobal` de carrito-global.js e IMPORTAR de calculo-precios.js
2. Verificar que calculo-precios.js tiene la versión correcta

### Prioridad 3 (Opcional - Futuro)
1. Validar cantidad total de oportunidades antes de generar
2. Considerar usar Worker para calcular oportunidades (>100 boletos)
3. Agregar métrica de "oportunidades no asignadas por falta de pool"

---

## 🧪 TEST RECOMENDADOS

```javascript
// Test 1: Verificar que 100 boletos generan exactamente 300 oportunidades
const opp = generarOportunidadesPrueba(100, 3);
console.assert(opp.length === 300, "❌ No se generaron 300 oportunidades");

// Test 2: Verificar que NO hay duplicados
const unicos = new Set(opp);
console.assert(unicos.size === opp.length, "❌ Hay duplicados");

// Test 3: Verificar rango
const fueraRango = opp.filter(n => n < 250000 || n > 999999);
console.assert(fueraRango.length === 0, "❌ Números fuera de rango");
```

---

## 📝 CONCLUSIÓN

**Estado General**: ✅ **FUNCIONAL** pero con oportunidades de mejora

- **Robustez**: Alta (fallbacks, reintentos, boot sequence)
- **Consistencia**: Alta (datos sincronizados correctamente)
- **Mantenibilidad**: Media (hay algo de código muerto)
- **Performance**: Alta (Set, IndexedDB, debounce)

**Riesgo de falla**: Bajísimo (recuperable de todas formas)

