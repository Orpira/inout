# INOUT: control horario y liquidación de horas extras

Sistema cliente-servidor para registrar entradas y salidas del personal y liquidar recargos y horas extras según la legislación laboral colombiana vigente en cada fecha.

Pensado para una operación logística con dos grupos de personal:

- **Administrativo**: horario fijo (p. ej. L-V 08:00 a 17:00 con almuerzo). Salir unos minutos tarde no genera extras (tolerancia) y las horas extra reales esperan la aprobación de un supervisor.
- **Operativo de bodega**: turnos rotativos. Cuando un despacho alarga el turno, las horas por encima de la jornada se liquidan como extra automáticamente, con recargo nocturno, dominical o festivo según corresponda.

Componentes:

- **Kiosko de marcación** (`/kiosko`): pantalla táctil para tablet en la entrada. Funciona con teclado numérico, lector de código de barras USB o la cámara, y **sigue funcionando sin conexión** (ver más abajo).
- **Panel de supervisión**: personal en turno, extras por aprobar, turnos por revisar, correcciones con motivo obligatorio e historial, liquidación por periodo exportable a CSV para nómina, horarios, empleados, festivos y usuarios.

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
│                   · tarea periódica que cierra los turnos sin salida (16 h)   
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
| El cierre automático inventaba una salida a las 18:00 (de otra fecha) | A las 16 h el turno se cierra con la hora del horario del empleado ese día y queda marcado como **salida automática**; sin referencia en el horario pasa a **Por revisar** |
| Misma jornada para todos y el almuerzo contaba como tiempo trabajado | Horarios por grupo (fijo o por turnos) con descanso no remunerado, tolerancia y aprobación de extras |
| Las marcaciones sin red se perdían si se recargaba la página | PWA instalable con directorio local, cola con identificador único y sincronización idempotente |
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

### Simulación de un mes (demostración completa)

```bash
npm run db:simular                 # ~5 semanas de marcaciones hasta hoy
npm run db:simular -- --limpiar    # borra solo lo creado por la simulación
# Docker: docker compose exec app node dist/scripts/simular-mes.js [--limpiar]
```

Crea 7 empleados (códigos 2001 a 2007) y 3 horarios terminados en "(simulación)", y recorre el periodo usando los mismos servicios y endpoints de la aplicación, de modo que todo queda auditado con usuario y motivo. Necesita el administrador de `db:seed` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) y crea el supervisor `supervisor.simulacion@inout.local`, cuya clave se muestra al terminar (o se fija con `SIM_SUPERVISOR_PASSWORD`).

| Empleado | Horario | Qué muestra |
| --- | --- | --- |
| 2001 Laura Gómez | Bodega L-S, rota mañana/tarde | Temporada alta la última semana completa: alerta de más de 2 h extra al día y de más de 12 h a la semana (en Liquidación). Un día marcó sin conexión: tablet con el reloj 3 min atrasado, doble toque descartado y código mal digitado (uno resuelto y otro en la bandeja). |
| 2002 Andrés Ramírez | Bodega L-S, turno tarde 14:00-21:30 | Recargo nocturno desde las 19:00, extras nocturnas, festivos trabajados y un domingo de inventario (todo extra dominical). |
| 2003 Paola Castro | Nocturno D-V 22:00-05:30 | Recargo nocturno dominical/festivo, extras nocturnas y diurnas al pasar las 06:00. Ahora mismo puede aparecer en turno. |
| 2004 Jhon Restrepo | Administrativo L-V con aprobación | Tolerancia, extras aprobadas, aprobadas en parte, rechazadas y pendientes; sábado de inventario; festivo trabajado; corrección de horas que anula la aprobación y se vuelve a aprobar. |
| 2005 Diana Moreno | Administrativo L-V con aprobación | Turno sin salida que el sistema cierra con la hora del horario y corrige el supervisor, registro manual por kiosko caído, corrección de la hora de entrada, registro anulado por error y aprobación en lote. |
| 2006 Carlos Pérez | Sin horario (jornada legal L-S) | Primera hora nocturna (05:00), extras automáticas, cambio de salario con recálculo y un turno reciente sin salida pendiente de revisar. |
| 2007 Sofía Herrera | Bodega L-S | Temporal: trabaja dos semanas y se da de baja con motivo. |

El horario administrativo se crea con 10 minutos de tolerancia y se edita a 15 con motivo, para que también haya historial en Horarios.

### Con Docker

```bash
JWT_SECRET=$(openssl rand -base64 48) docker compose up -d --build
docker compose exec app node dist/db/seed.js   # crea admin@inout.local (cambia la clave al entrar)
```

La aplicación queda en `http://localhost:3000`. Las migraciones se aplican al arrancar.

### Pruebas

```bash
npm test          # motor de liquidación + API contra PostgreSQL (TEST_DATABASE_URL)
TZ=Europe/Madrid npm test   # el CI repite las pruebas en UTC, Europe/Madrid y America/Bogota
npm run typecheck
```

## Migrar los datos de la versión Laravel

Laravel guardaba `registros_horarios.entrada/salida` como `timestamp` **sin zona**, en la zona de `config('app.timezone')`. Nunca usó la hora de Colombia:

| Periodo | Zona en que están guardadas las horas |
| --- | --- |
| Hasta el despliegue del commit `372b7dd` (6-abr-2026) | `APP_TIMEZONE` del `.env` de producción (por defecto `UTC`) |
| Desde ese despliegue | `Europe/Madrid` (fijo en `config/app.php`) |

Por eso la zona se indica por periodos, con nombres IANA que respetan el horario de verano de Madrid. El script tiene tres pasos (desde `apps/api`, con `DATABASE_URL` apuntando a una base INOUT 2 vacía):

```bash
# 1. Analizar: a qué hora de Colombia caerían las entradas con cada zona posible.
npm run migrar:laravel -- --origen postgres://usuario:clave@host/laravel --analizar
# 2. Simular (no escribe nada) con las zonas elegidas. Usa la fecha real del despliegue.
npm run migrar:laravel -- --origen … --tz UTC --tz-desde 2026-04-06=Europe/Madrid
# 3. Migrar.
npm run migrar:laravel -- --origen … --tz UTC --tz-desde 2026-04-06=Europe/Madrid --ejecutar --admins=jefe@empresa.co
```

En el análisis, la zona correcta es la columna cuyo pico coincide con la hora real de llegada del personal.

- **Usuarios:** se conservan las contraseñas (los hashes bcrypt de Laravel son compatibles).
- **Empleados:** se conservan los `id` y la identificación. Después, asigna a cada uno su horario.
- **Registros:** los corregidos a mano en Laravel se respetan. Pasan a **Por revisar** las salidas inventadas por el cierre automático (se descartan), las entradas inventadas (1 h antes de la salida), las salidas anteriores a la entrada, los turnos de más de 24 h y los registros abiertos antiguos.
- **Trazabilidad:** cada marcación migrada guarda en la auditoría el registro original con sus horas tal cual estaban.
- **Seguridad:** el script se niega a escribir si la base destino ya tiene datos.

## Auditoría

Todo cambio queda en la tabla `auditoria` con usuario, fecha, motivo y valores antes y después: correcciones, anulaciones y aprobaciones de marcaciones; altas y cambios de empleados (incluido el salario); horarios; y ajustes de festivos. Los cambios de empleados, horarios y festivos exigen motivo y se consultan en su propia pantalla.

## Horarios

En **Horarios** se define la jornada de cada grupo (Ley 2101: máximo 6 días, de 4 a 9 h diarias, total semanal dentro de la jornada vigente):

| Opción | Administrativo | Bodega |
| --- | --- | --- |
| Tipo | Horario fijo: entrada y salida por día | Turnos: horas ordinarias por día |
| Descanso no remunerado | Franja fija (12:00 a 13:00) | Pausa de N minutos tras X horas, o ninguno si marcan salida al almuerzo |
| Tolerancia | p. ej. 15 min | 0 |
| Extras | Requieren aprobación | Se liquidan automáticamente |

Todo lo trabajado en un día no laborable del horario (p. ej. el sábado de un administrativo) es hora extra. En festivos que caen en día laborable se aplica la jornada de ese día con recargo festivo. Los empleados sin horario usan la jornada legal de lunes a sábado.

Las extras **por aprobar** no entran en la liquidación hasta que un supervisor las aprueba (todas, una parte o ninguna, con motivo). Si después se corrigen las horas del turno, la aprobación se anula y vuelve a quedar pendiente.

## Kiosko y funcionamiento sin conexión

1. Configura `KIOSKO_TOKEN` y abre en cada tablet `https://tu-dominio/kiosko?token=EL_TOKEN`. Añádelo a la pantalla de inicio: queda como aplicación a pantalla completa.
2. Los lectores de código de barras USB/Bluetooth funcionan sin configuración (escriben el código y Enter).

Sin red, el kiosko:

- **Abre igualmente**, aunque la tablet se reinicie: la aplicación queda guardada en el dispositivo (service worker). Requiere servir la app por **HTTPS**.
- **Reconoce a cada empleado** con un directorio local (código, nombre, cargo y si tiene turno abierto) que se actualiza cada 15 minutos. Rechaza códigos inexistentes y sabe si toca entrada o salida.
- **Guarda cada marcación** en la tablet con la hora local y un identificador único.

Al recuperar la conexión, la tablet envía la cola en lotes y en orden cronológico (`POST /api/kiosko/sincronizar`):

- **Idempotente**: si se corta a mitad de envío, reenviar no duplica marcaciones.
- **Corrige el reloj**: si la tablet tiene la hora desfasada, el servidor ajusta las marcaciones con la diferencia medida al enviar.
- **Salidas tardías**: si un turno se cerró automáticamente (o pasó a revisión) por llevar demasiado tiempo abierto y luego llega su salida guardada, la salida real sustituye a la automática.
- **Nada se pierde en silencio**: lo que no se puede aplicar (código dado de baja, marca de más de `MAX_HORAS_OFFLINE`, conflicto con otra marcación) aparece en **Marcaciones** y en el inicio para que un supervisor lo resuelva. Los toques repetidos se descartan solos.

Reglas de marcación: la misma acción alterna entrada y salida; se ignoran repeticiones en menos de `ANTIREBOTE_SEGUNDOS`; un turno abierto más de `MAX_HORAS_TURNO` (16 h) se cierra solo con la hora de su horario, o pasa a revisión si el horario no da una referencia. Detalle en `docs/reglas-liquidacion.md`.

## Reglas de liquidación

Ver [docs/reglas-liquidacion.md](docs/reglas-liquidacion.md).

## API

Todas las rutas cuelgan de `/api`. Las del panel requieren la cookie de sesión.

| Método y ruta | Rol | Descripción |
| --- | --- | --- |
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password` | — | Sesión |
| `GET /kiosko/empleado/:codigo`, `POST /kiosko/marcar` | kiosko | Consulta y marcación |
| `GET /kiosko/directorio`, `POST /kiosko/sincronizar` | kiosko con token | Directorio local y envío de marcaciones guardadas sin conexión |
| `GET /horarios` / `POST`, `PUT /horarios/:id` | sesión / ADMIN | Horarios por grupo |
| `GET /dashboard` | sesión | Resumen del día y del mes |
| `GET /empleados`, `GET /empleados/:id` | sesión | Consulta |
| `POST /empleados`, `PUT /empleados/:id` | ADMIN | Alta y edición |
| `GET /marcaciones`, `GET /marcaciones/:id` | sesión | Listado filtrable y detalle con liquidación e historial |
| `POST /marcaciones`, `PATCH /marcaciones/:id`, `POST /marcaciones/:id/anular` | sesión | Registro manual, corrección y anulación (motivo obligatorio) |
| `POST /marcaciones/:id/extras`, `POST /marcaciones/extras/aprobar-lote` | sesión | Aprobar (total o parcial) o rechazar horas extra |
| `GET /marcaciones/offline`, `POST /marcaciones/offline/:id/resolver` | sesión | Marcaciones sin conexión que no se pudieron aplicar |
| `POST /marcaciones/recalcular` | ADMIN | Recalcula un rango tras cambiar festivos, horarios o salarios |
| `GET /reportes/liquidacion?desde&hasta[&formato=csv]` | sesión | Liquidación por empleado y concepto |
| `GET /reportes/marcaciones?desde&hasta` | sesión | Detalle de marcaciones en CSV |
| `GET /config/parametros`, `GET /config/festivos?anio` | sesión | Normas vigentes y calendario |
| `GET /config/auditoria?entidad&entidadId` | sesión | Historial de empleados, horarios o festivos |
| `POST /config/festivos/ajustes`, `DELETE /config/festivos/ajustes/:fecha` | ADMIN | Añadir o quitar festivos |
| `GET/POST/PUT /usuarios` | ADMIN | Gestión de usuarios |

Los CSV usan `;` como separador y coma decimal para abrirse directamente en Excel con configuración regional de Colombia.
