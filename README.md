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
npm install
npm run db:up                     # Postgres 16 en Docker (localhost:5432)
npm run dev                       # API en :3000 (aplica migraciones) + web en :5173
npm run crear-admin -w @inout/api -- admin@empresa.co "Nombre" "clave-larga"
```

Abrir http://localhost:5173 (panel) y http://localhost:5173/kiosko. `npm run dev:api` y `npm run dev:web` arrancan cada parte por separado.

Otros comandos: `npm test`, `npm run typecheck`, `npm run db:generate -w @inout/api` (tras cambiar `schema.ts`).

## Producción

```bash
JWT_SECRET=... POSTGRES_PASSWORD=... docker compose up -d --build
```

Un solo proceso en el puerto 3000 sirve la API y el frontend. Las migraciones se aplican al arrancar.

## Panel de supervisión

| Pestaña | Rol | Qué hace |
| --- | --- | --- |
| Revisión | Todos | Turnos sin salida que superaron `MAX_HORAS_TURNO`. Se corrigen escribiendo la salida o se anulan. |
| Marcaciones | Todos | Consulta por periodo, empleado y estado. Correcciones y altas manuales con motivo e historial. |
| Liquidación | Todos | Horas por categoría, valor adicional, alertas de extras y exportación CSV (separador `;`, abre en Excel). |
| Empleados | Admin | Alta y edición: salario y jornada pactada. Los cambios exigen motivo. |
| Festivos | Todos (editar: Admin) | Calendario de ley por año. Se puede quitar, restaurar o agregar un festivo, con motivo. |
| Usuarios | Admin | Supervisores y administradores, activación y cambio de clave. |

Cada cambio queda en la tabla `auditoria` con el usuario, el motivo y los valores antes y después. Las fechas y horas del panel se escriben y se muestran en hora de Colombia.

## Pendiente

- Migración de datos desde Laravel. Antes hay que confirmar si las horas se guardaban en hora de Colombia o en UTC.
- Confirmar si el festivo del 9 de julio (Ley 2578/2026) se traslada al lunes.
- Supuestos a validar con nómina: recargo en todo domingo; recálculos con el salario actual.
- El kiosko no exige sesión. Si se expone fuera de la red local, hay que restringirlo (por IP o con un token de dispositivo).
