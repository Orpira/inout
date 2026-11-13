# Reglas de liquidación

Implementadas en `packages/core`. Cada minuto trabajado se clasifica con las normas vigentes **en la fecha de ese minuto**, en hora de Colombia (UTC−5).

## Parámetros con vigencia

| Desde | Cambio | Norma |
| --- | --- | --- |
| 15-jul-2023 | Jornada 47 h (divisor 235) | Ley 2101 de 2021 |
| 15-jul-2024 | Jornada 46 h (divisor 230) | Ley 2101 de 2021 |
| 1-jul-2025 | Recargo dominical/festivo 80 % | Ley 2466 de 2025, art. 14 |
| 15-jul-2025 | Jornada 44 h (divisor 220) | Ley 2101 de 2021 |
| 25-dic-2025 | Jornada nocturna de 19:00 a 06:00 (antes 21:00) | Ley 2466 de 2025, art. 10 |
| 1-jul-2026 | Recargo dominical/festivo 90 % | Ley 2466 de 2025, art. 14 |
| 15-jul-2026 | Jornada 42 h (divisor 210) | Ley 2101 de 2021 |
| 1-jul-2027 | Recargo dominical/festivo 100 % | Ley 2466 de 2025, art. 14 |

Fijos: recargo nocturno 35 %, hora extra diurna 25 %, hora extra nocturna 75 % (CST art. 168).

**Valor hora ordinaria** = salario mensual ÷ (jornada semanal × 30 ÷ 6), con la jornada vigente el día de la entrada.

## Jornada ordinaria diaria y horarios

La jornada ordinaria de cada día sale del **horario** asignado al empleado:

- **Horario fijo** (administrativo): entrada a salida menos la franja de descanso. 08:00 a 17:00 con almuerzo de 12:00 a 13:00 = 8 h.
- **Turnos** (bodega): horas ordinarias definidas por día de la semana.
- **Sin horario**: jornada legal vigente ÷ 6 de lunes a sábado (7 h con 42 h).

Los minutos que superan la jornada del día (sumando todos los turnos que empiezan ese día) son horas extra. En un día **no laborable** del horario, todo lo trabajado es extra. Un festivo que cae en día laborable conserva la jornada de ese día y lleva recargo festivo.

**Descanso no remunerado.** Se descuenta del tiempo de presencia: la franja fija si el turno la cubre, o la pausa por duración tras X horas de trabajo (solo si el día tiene un único turno; si el empleado marcó salida y entrada para su pausa, ya está fuera).

**Reconocimiento de extras:**

| Situación | Estado | Se liquida |
| --- | --- | --- |
| Extras ≤ tolerancia del horario | Tolerancia | No |
| Horario sin aprobación | Automáticas | Sí, todas |
| Horario con aprobación, sin decidir | Por aprobar | No |
| Aprobadas (total o parcial) | Aprobadas | Solo lo aprobado |
| Rechazadas (con motivo) | Rechazadas | No |

## Conceptos y factores

El factor es lo que se paga **adicional** al salario, sobre el valor hora ordinaria (d = recargo dominical vigente):

| Código | Concepto | Factor |
| --- | --- | --- |
| HOD | Ordinaria diurna | 0 (incluida en el salario) |
| RN | Recargo nocturno | 0,35 |
| RDF | Recargo dominical/festivo diurno | d |
| RNDF | Recargo dominical/festivo nocturno | d + 0,35 |
| HED | Extra diurna | 1,25 |
| HEN | Extra nocturna | 1,75 |
| HEDDF | Extra diurna dominical/festiva | 1 + d + 0,25 |
| HENDF | Extra nocturna dominical/festiva | 1 + d + 0,75 |

Ejemplo con salario de $2.100.000 (valor hora $10.000) un domingo después del 1-jul-2026: 7 h ordinarias diurnas = 7 × 10.000 × 0,90 = $63.000.

## Festivos

Fijos: 1 ene, 1 may, 20 jul, 7 ago, 8 dic, 25 dic. Trasladables al lunes (Ley 51 de 1983): 6 ene, 19 mar, 29 jun, 15 ago, 12 oct, 1 nov, 11 nov y, desde 2026, 9 jul (Ley 2578 de 2026). Ligados a la Pascua: Jueves y Viernes Santo, Ascensión (+43 días), Corpus Christi (+64) y Sagrado Corazón (+71).

El calendario se puede ajustar desde **Festivos y normas** (días cívicos, o si la Corte Constitucional deja sin efecto un festivo). Tras un ajuste, recalcula el periodo afectado.

## Alertas (no bloquean)

- Más de 2 h extra en un día.
- Más de 12 h extra en una semana (lunes a domingo), en el reporte de liquidación.
- Turnos de más de 16 h.

## Cierre de periodos liquidados

La liquidación es un reporte: mientras un periodo no se cierra, sus valores cambian si se corrige una marcación. Al **cerrar** un periodo (cualquier rango de fechas, no solo meses) sus días quedan de **solo consulta**.

- **Quién**: solo administradores. Cualquier usuario puede consultar.
- **Requisitos para cerrar**: el periodo ya terminó (fecha final anterior a hoy), no comparte días con otro cierre vigente y no tiene nada por resolver: turnos por revisar, turnos sin cerrar, horas extra por aprobar ni marcaciones sin conexión rechazadas. Así ningún turno se queda sin pagar.
- **Qué bloquea**: crear, corregir, anular, aprobar extras y recalcular marcaciones cuya entrada cae en el periodo, también desde el kiosko sin conexión. El recálculo por cambio de salario o de festivos omite esos días.
- **Rangos mezclados**: si el rango consultado incluye días liquidados y sin liquidar, se avisa y no se puede descargar el CSV ni cerrar, para no pagar dos veces.
- **Reabrir**: un administrador puede reabrir un cierre indicando el motivo. El cierre anterior se conserva en el historial con su total, el detalle por empleado y el motivo; al volver a cerrar se registra una liquidación nueva y se muestra la diferencia.
- Cierres y reaperturas quedan en la auditoría (`CERRAR_PERIODO`, `REABRIR_PERIODO`).

El reporte y el CSV indican además los turnos del periodo que no están incluidos (columna «Turnos por revisar (no incluidos)»); los empleados que solo tienen turnos sin resolver aparecen con valores en cero.

## Supuestos a validar con nómina

- Las horas trabajadas en un día no laborable del horario (sábado del administrativo, domingo) se liquidan como **extra** (con recargo dominical si es domingo o festivo), porque superan la jornada semanal ya distribuida. Si la empresa liquida el domingo ocasional como ordinario con recargo y descanso compensatorio, se puede reflejar marcando ese día como laborable en el horario.
- Todo trabajo en domingo se liquida con recargo dominical. El CST distingue el dominical habitual del ocasional a efectos de descanso compensatorio; ese descanso no lo gestiona el sistema.
- El valor hora se calcula con el salario actual del empleado. Si el salario cambia a mitad de periodo, recalcula solo desde la fecha del cambio.
- Los turnos que empiezan un día cuentan para la jornada ordinaria de ese día aunque terminen al siguiente.
