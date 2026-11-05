# InOut 2

Control de entradas y salidas, y liquidación de recargos y horas extra según la legislación laboral colombiana.

Se desarrolla fuera de Colombia y se usa en Colombia. Por eso **toda la lógica de negocio trabaja en hora de Colombia (America/Bogota, UTC-5) sin importar la zona horaria del servidor, del contenedor o del navegador**.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `packages/core` | TypeScript puro: hora de Colombia, festivos, parámetros legales con vigencia por fecha y motor de liquidación minuto a minuto. Lo usan la API y la web. |
| `apps/api` | Fastify 5 + Drizzle + PostgreSQL. Sesión JWT en cookie httpOnly (ADMIN/SUPERVISOR). En producción sirve también el frontend. |
| `apps/web` | React 19 + Vite + Tailwind 4 + TanStack Query. Kiosko táctil en `/kiosko` y panel de supervisión. |
| `legacy/laravel` | Versión anterior, solo como referencia para migrar los datos. |

## Hora de Colombia: reglas

1. En la base de datos, los instantes son `timestamptz` (PostgreSQL los guarda en UTC). La conexión de la API fija `TimeZone=UTC`.
2. Para pasar a fecha y hora de Colombia se usa `@inout/core` (`fechaLocal`, `horaLocal`, `desdeLocal`, `formatearLocal`). No se usan `getHours()`, `getDate()` ni `new Date('YYYY-MM-DD')` en la lógica.
3. Las fechas civiles (festivos) son texto `'YYYY-MM-DD'` y nunca `Date`.
4. El CI ejecuta las pruebas con `TZ=UTC`, `Europe/Madrid` y `America/Bogota`, y el resultado tiene que ser el mismo en las tres.

En el contenedor de Postgres, `PGTZ=America/Bogota` solo afecta a cómo `psql` muestra las horas a quien consulta a mano.

## Desarrollo

```bash
cp .env.example .env              # ajusta JWT_SECRET
docker compose up -d db           # Postgres 16 en localhost:5432
npm install
npm run dev:api                   # aplica migraciones y arranca en :3000
npm run dev:web                   # Vite en :5173 (proxy de /api)
npm run crear-admin -w @inout/api -- admin@empresa.co "Nombre" "clave-larga"
```

Otros comandos: `npm test`, `npm run typecheck`, `npm run db:generate -w @inout/api` (tras cambiar `schema.ts`).

## Producción

```bash
JWT_SECRET=... POSTGRES_PASSWORD=... docker compose up -d --build
```

Un solo proceso en el puerto 3000 sirve la API y el frontend. Las migraciones se aplican al arrancar.

## Pendiente

- Panel: marcaciones en revisión, correcciones con motivo (tabla `auditoria`), liquidación por periodo y ajustes del calendario de festivos.
- Migración de datos desde Laravel. Antes hay que confirmar si las horas se guardaban en hora de Colombia o en UTC.
- Confirmar si el festivo del 9 de julio (Ley 2578/2026) se traslada al lunes.
- Supuestos a validar con nómina: recargo en todo domingo; recálculos con el salario actual.
- El kiosko no exige sesión. Si se expone fuera de la red local, hay que restringirlo (por IP o con un token de dispositivo).
