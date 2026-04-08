# Readiness para terceros

Esta guia baja a tierra los riesgos que siguen vivos cuando la plataforma se ofrece para sorteos de terceros.

## 1. Riesgo: no hay prueba dura de creacion masiva de ordenes

### Que ya existe

- cache y single-flight para endpoints publicos clave
- protecciones de concurrencia en `POST /api/ordenes`
- manejo controlado de `deadlock`, `lock timeout` y `statement timeout`

### Que falta validar

- volumen alto de `POST /api/ordenes`
- comportamiento sostenido con muchas ordenes por minuto
- conflictos reales de boletos bajo concurrencia

### Como probarlo

Primero en staging o local controlado:

```bash
npm run health-check
npm run load:orders -- --baseUrl=http://localhost:3000 --duration=30 --concurrency=2 --ticketStart=200000 --ticketsPerOrder=3 --pricePerTicket=6
```

Luego subir gradualmente:

- `concurrency=2`
- `concurrency=5`
- `concurrency=10`

No subir directo sobre produccion sin ventana controlada.

### Criterio minimo

- `0` errores `500`
- `0` errores de consistencia
- si aparecen `409 BOLETOS_CONFLICTO`, confirmar si provienen de tickets repetidos del test o de contencion real
- si aparecen `503 ORDEN_TEMPORALMENTE_BLOQUEADA`, medir frecuencia y ajustar operacion o capacidad

## 2. Riesgo: 1M+ sigue siendo meta, no demostracion

### Lo correcto que se puede prometer hoy

- la plataforma ya soporta flujo real de compra y administracion
- endpoints publicos criticos ya fueron validados con carga corta real
- existe base tecnica para escalar mejor que antes

### Lo que no se debe prometer todavia

- “1M+ garantizado” sin prueba especifica del evento
- saturacion cero en cualquier escenario
- escalado ilimitado sin plan operativo

### Recomendacion profesional

Cada evento grande debe tener:

- prueba de carga propia
- ventana de monitoreo
- checklist de go/no-go
- plan de contingencia

## 3. Riesgo: operacion, legalidad y soporte

## Operacion minima

Antes de cada lanzamiento:

- confirmar que admin login funciona
- confirmar `api/health`
- confirmar compra real con una orden de prueba
- confirmar cambio de estado admin
- confirmar cierre/finalizacion si aplica

Durante el evento:

- una persona monitoreando ordenes nuevas
- una persona validando comprobantes si el flujo lo requiere
- un canal directo con el cliente

## Legal minimo

No sustituye asesoria legal, pero no deberia faltar:

- terminos y condiciones publicados
- aviso de privacidad publicado
- identidad y contacto del organizador
- mecanica exacta del sorteo
- plazo para reclamar premio
- restricciones geograficas o de edad
- politica de aclaraciones
- permiso aplicable si el sorteo lo requiere

## Soporte minimo

Definir por adelantado:

- horario de soporte
- tiempo objetivo de respuesta
- quien decide pausa/reanudacion de ventas
- como se comunica un incidente al cliente

## 4. Riesgo: sigue siendo plataforma gestionada, no SaaS puro

### Estado actual real

El producto hoy se comporta mejor como:

- solucion gestionada por SaDev
- implementacion personalizada por cliente
- acompanamiento operativo por evento

No todavia como:

- multicliente autoservicio puro
- plataforma donde cada tercero opera sin apoyo

### Como venderlo hoy

Promesa correcta:

- “Te montamos y operamos una boletera digital profesional para tu sorteo”

Promesa que todavia no conviene:

- “Es una plataforma totalmente autoservicio para cualquier volumen y cualquier cliente”

## 5. Checklist final antes de vender a terceros

- `health-check` limpio
- `load:public` limpio
- `load:orders` limpio en staging
- e2e de compra/admin en verde
- textos legales visibles
- runbook de incidente listo
- responsable operativo definido

## 6. Go / No-Go comercial

Go:

- cliente piloto o evento controlado
- volumen esperado probado o razonable
- acompanamiento operativo disponible

No-Go:

- evento enorme sin prueba previa
- cliente que exige autoservicio total sin soporte
- reglas legales o de premio sin definir
