# INOUT: control horario y liquidación de horas extras

Sistema cliente-servidor para registrar entradas y salidas del personal y liquidar recargos y horas extras según la legislación laboral colombiana vigente en cada fecha.

- **Kiosko de marcación** (`/kiosko`): pantalla táctil para tablet en la entrada. Funciona con teclado numérico, lector de código de barras USB o la cámara del dispositivo, y guarda marcaciones sin conexión.
- **Panel de supervisión**: personal en turno, turnos por revisar, correcciones con motivo obligatorio e historial, liquidación por periodo exportable a CSV para nómina, gestión de empleados, festivos y usuarios.

## Arquitectura

```
inout/
├── packages/core   Dominio puro en TypeScript (sin dependencias)
│                   · calendario de festivos de Colombia (Ley Emiliani, Pascua, Ley 2578/2026)
│                   · parámetros legales con vigencia por fecha (Ley 2101/2021, Ley 2466/2025)
│                   · motor de liquidación minuto a minuto
├── apps/api        Servidor HTTP: Fastify 5 + Drizzle ORM + PostgreSQL
│                   · sesiones JWT en cookie httpOnly, roles ADMIN / SUPERVISOR
│                   · validación con Zod, límites de peticiones, cabeceras de seguridad
│                   · tarea periódica que envía a revisión los turnos sin salida
└── apps/web        Cliente: React 19 + Vite + Tailwind CSS 4 + TanStack Query
```

El paquete `core` lo comparten el servidor (que liquida) y el cliente (que muestra la franja nocturna vigente, festivos y jornada legal), así que las reglas viven en un único sitio y están cubiertas por pruebas.

En producción la API sirve también el frontend compilado: un solo proceso, un solo origen, sin CORS.

### Por qué se reemplazó Laravel

| Problema en la versión Laravel | Solución |
| --- | --- |
| Valor hora = salario ÷ 240 fijo | Divisor según la jornada vigente en la fecha del turno (210 desde el 15-jul-2026) |
| Jornada nocturna desde las 21:00 | Desde las 19:00 a partir del 25-dic-2025 (Ley 2466) |
| Recargo dominical fijo del 75 % | 80 % (jul-2025), 90 % (jul-2026), 100 % (jul-2027) aplicados por fecha |
| Faltaban Ascensión, Corpus Christi, Sagrado Corazón, 8 de diciembre y 9 de julio; todos los domingos marcados como festivo | Calendario completo y ajustable desde el panel |
| Cálculo por franjas con casos especiales que fallaba al cruzar medianoche | Motor minuto a minuto: medianoche, paso a domingo/festivo y cambios normativos sin casos especiales |
| El cierre automático inventaba una salida a las 18:00 (de otra fecha) | El turno pasa a **Por revisar** y un supervisor registra la hora real |
| Historial de cambios concatenado en un campo de texto | Tabla de auditoría con usuario, motivo y valores antes/después |
| Rutas de alta, edición y borrado de registros sin autenticación | Todo el panel requiere sesión y rol; el kiosko solo puede marcar |
| Tablas duplicadas (`registros`, `turnos`, modelo `Mostrar`) | Un único modelo `marcaciones` con estados explícitos y líneas de liquidación normalizadas |

## Puesta en marcha

Requisitos: Node.js 20 o superior y PostgreSQL 14 o superior.

```bash
npm install
cp .env.example .env            # ajusta DATABASE_URL y JWT_SECRET
npm run db:migrate
ADMIN_EMAIL=tu@empresa.co ADMIN_PASSWORD='una-clave-segura' npm run db:seed
npm run dev                     # API en :3000, web en http://localhost:5173
```

Para probar con datos ficticios: `npm run db:seed -- --demo` (5 empleados y dos semanas de turnos).

### Con Docker

```bash
JWT_SECRET=$(openssl rand -base64 48) docker compose up -d --build
docker compose exec app node dist/db/seed.js   # crea admin@inout.local (cambia la clave al entrar)
```

La aplicación queda en `http://localhost:3000`. Las migraciones se aplican al arrancar.

### Pruebas

```bash
npm test          # motor de liquidación + API contra PostgreSQL (TEST_DATABASE_URL)
npm run typecheck
```

## Migrar los datos de la versión Laravel

```bash
LARAVEL_DATABASE_URL=postgres://usuario:clave@host:5432/base_laravel \
DATABASE_URL=postgres://usuario:clave@host:5432/inout \
npm run migrar:laravel -- --tz=-05:00 --admins=jefe@empresa.co
```

- Usuarios: se conservan las contraseñas (los hashes bcrypt de Laravel son compatibles).
- Empleados: se conservan los `id` y la identificación (código de marcación).
- `registros_horarios` → `marcaciones`. Los cierres automáticos de Laravel y los registros abiertos antiguos quedan **Por revisar**; el resto se liquida de nuevo con las reglas correctas.
- `--tz` indica cómo guardaba Laravel las horas: `-05:00` si estaban en hora de Colombia, `+00:00` si `APP_TIMEZONE=UTC`. Revisa una marcación conocida tras migrar.

## Kiosko

1. Abre `/kiosko` en la tablet y añádelo a la pantalla de inicio.
2. Si defines `KIOSKO_TOKEN`, abre una vez `/kiosko?token=EL_TOKEN`: el dispositivo lo recuerda y ningún otro equipo puede marcar.
3. Los lectores de código de barras USB/Bluetooth funcionan sin configuración (escriben el código y Enter).
4. Sin red, la marcación se guarda con la hora local y se envía al reconectar (hasta `MAX_HORAS_OFFLINE`).

Reglas de marcación: la misma acción alterna entrada y salida; se ignoran repeticiones en menos de `ANTIREBOTE_SEGUNDOS`; un turno abierto más de `MAX_HORAS_TURNO` pasa a revisión.

## Reglas de liquidación

Ver [docs/reglas-liquidacion.md](docs/reglas-liquidacion.md).

## API

Todas las rutas cuelgan de `/api`. Las del panel requieren la cookie de sesión.

| Método y ruta | Rol | Descripción |
| --- | --- | --- |
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password` | — | Sesión |
| `GET /kiosko/empleado/:codigo`, `POST /kiosko/marcar` | kiosko | Consulta y marcación |
| `GET /dashboard` | sesión | Resumen del día y del mes |
| `GET /empleados`, `GET /empleados/:id` | sesión | Consulta |
| `POST /empleados`, `PUT /empleados/:id` | ADMIN | Alta y edición |
| `GET /marcaciones`, `GET /marcaciones/:id` | sesión | Listado filtrable y detalle con liquidación e historial |
| `POST /marcaciones`, `PATCH /marcaciones/:id`, `POST /marcaciones/:id/anular` | sesión | Registro manual, corrección y anulación (motivo obligatorio) |
| `POST /marcaciones/recalcular` | ADMIN | Recalcula un rango tras cambiar festivos o salarios |
| `GET /reportes/liquidacion?desde&hasta[&formato=csv]` | sesión | Liquidación por empleado y concepto |
| `GET /reportes/marcaciones?desde&hasta` | sesión | Detalle de marcaciones en CSV |
| `GET /config/parametros`, `GET /config/festivos?anio` | sesión | Normas vigentes y calendario |
| `POST /config/festivos/ajustes`, `DELETE /config/festivos/ajustes/:fecha` | ADMIN | Añadir o quitar festivos |
| `GET/POST/PUT /usuarios` | ADMIN | Gestión de usuarios |

Los CSV usan `;` como separador y coma decimal para abrirse directamente en Excel con configuración regional de Colombia.
