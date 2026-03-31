# Baseline de BD

Para una base nueva no conviene correr todo el historial de migraciones.

Este proyecto ahora tiene una opcion baseline:

```bash
cd backend
KNEX_MIGRATIONS_DIR=./db/migrations_baseline npx knex migrate:latest
```

Tambien puedes usar el script:

```bash
cd backend
npm run migrate:baseline
```

Notas:

- Esto crea una BD vacia con la estructura operativa actual.
- No corre seeds.
- Despues debes poblar `boletos_estado` y `orden_oportunidades` segun la nueva rifa.
- Para mantener compatibilidad con Supabase, usa `DATABASE_URL` en tu `.env`.
