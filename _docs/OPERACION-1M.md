# Operacion 1M+

Esta guia deja un camino practico para acercar la plataforma a sorteos grandes. No garantiza por si sola que una instancia aguante 1M de boletos o picos masivos, pero si baja mucho el riesgo operativo.

## 1. Prueba de carga real

Usar antes de cada lanzamiento grande:

```bash
npm run health-check
npm run load:public -- --baseUrl=http://localhost:5001 --path=/api/public/boletos/stats --duration=60 --concurrency=50
npm run load:public -- --baseUrl=http://localhost:5001 --path=/api/public/ordenes-stats --duration=60 --concurrency=50
```

Criterios recomendados:

- `0` fallos
- `p95 < 500ms` en stats publicos
- `p99 < 1000ms`
- `api/health` en `healthy` durante toda la prueba

## 2. Simulacion punta a punta

Checklist minimo:

1. Configurar una rifa nueva desde admin.
2. Abrir `index.html` y confirmar carga publica.
3. Comprar boletos desde web publica.
4. Subir comprobante.
5. Confirmar orden desde admin.
6. Verificar aparicion en `mis-boletos`.
7. Correr ruletazo o mecanismo real de ganador.
8. Confirmar modal de sorteo finalizado y ganadores visibles.
9. Ejecutar `nueva rifa` y comprobar que desaparece el modal finalizado.

## 3. Validacion de cierre y finalizacion

Antes de dar por listo un sorteo:

- confirmar fecha/hora real del cierre
- verificar que ya no se puedan crear ordenes despues del cierre
- revisar que el modal finalizado tome el snapshot correcto
- validar que los ganadores persistidos coincidan con la BD
- preparar una nueva rifa de prueba y asegurar que el frontend vuelve a estado activo

## 4. Revision legal minima

Esto no sustituye asesoria legal, pero no deberia faltarte:

- Terminos y condiciones visibles y consistentes con la mecanica real
- Aviso de privacidad visible
- Datos del organizador y medios de contacto
- Reglas de validacion de pagos y comprobantes
- Restricciones geograficas, edad minima y condiciones de entrega
- Forma exacta de eleccion del ganador
- Plazo para reclamar premio
- Politica de aclaraciones
- Permiso aplicable si el tipo de sorteo lo requiere

## 5. Plan de contingencia operativo

Si hay pico o incidente:

- Pausar campañas pagadas si `api/health` deja de estar sana
- Mantener una sola persona validando ordenes en ventana critica si el admin se congestiona
- Si falla el realtime admin, recargar y trabajar con la vista principal sin filtros
- Si cae el backend, comunicar pausa temporal y no reabrir ventas hasta confirmar integridad
- Antes de reabrir, validar:
  - conteo de ordenes
  - conteo de boletos vendidos/apartados
  - ultimas ordenes creadas
  - consistencia de ganadores si el sorteo ya cerro

## 6. Go / No-Go

Go:

- health-check limpio
- validate y validate:launch limpios
- carga publica sin fallos en ventana de prueba
- flujo completo de compra y cierre validado

No-Go:

- errores en DB o migraciones
- fallos en stats publicos bajo carga
- inconsistencia entre ordenes y boletos
- cierre/finalizacion sin validacion real previa
