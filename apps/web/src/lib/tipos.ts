import type { Categoria, Horario as HorarioCore, ParametrosVigentes, ValidacionHorario } from "@inout/core";

export type Rol = "ADMIN" | "SUPERVISOR" | "CONSULTA";

export const NOMBRE_ROL: Record<Rol, string> = { ADMIN: "Administrador", SUPERVISOR: "Supervisor", CONSULTA: "Solo consulta" };
export type EstadoMarcacion = "ABIERTA" | "CERRADA" | "REVISION" | "ANULADA";
export type EstadoExtras = "SIN_EXTRAS" | "TOLERANCIA" | "PENDIENTE" | "APROBADAS" | "RECHAZADAS" | "AUTOMATICAS";

export interface Horario extends HorarioCore {
  id: number;
  nombre: string;
  activo: boolean;
  /** Sucursal del turno (null = cualquier sucursal). */
  sucursalId?: number | null;
  empleados?: number;
  validacion?: ValidacionHorario;
}

export interface MarcaOffline {
  id: string;
  codigo: string;
  capturadoEn: string;
  recibidoEn: string;
  desfaseSegundos: number;
  dispositivo: string | null;
  estado: "APLICADA" | "RECHAZADA" | "RESUELTA";
  mensaje: string | null;
  notaResolucion: string | null;
  empleado: string | null;
  empleadoId: number | null;
}

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo?: boolean;
  ultimoAcceso?: string | null;
}

export interface Empleado {
  id: number;
  identificacion: string;
  nombre: string;
  apellido: string;
  cargo: string | null;
  email: string | null;
  telefono: string | null;
  salario: number;
  horarioId: number | null;
  horario?: string | null;
  /** Sucursal (centro de costo) base. */
  sucursalId?: number | null;
  sucursal?: string | null;
  fechaIngreso: string | null;
  activo: boolean;
  enTurno?: boolean;
}

export interface Marcacion {
  id: number;
  empleadoId: number;
  entrada: string;
  salida: string | null;
  estado: EstadoMarcacion;
  origen: "KIOSKO" | "KIOSKO_OFFLINE" | "MANUAL" | "MIGRACION";
  observacion: string | null;
  /** La salida la puso el sistema con la hora del horario porque el empleado no la marcó. */
  salidaAutomatica?: boolean;
  /** Entrada marcada después de cerrar el turno del día: necesita la aprobación de un supervisor. */
  reingreso?: boolean;
  minutosTotales: number | null;
  minutosExtra: number | null;
  minutosExtraCalculados: number | null;
  minutosExtraAprobados: number | null;
  minutosDescanso: number | null;
  estadoExtras: EstadoExtras | null;
  valorRecargos: number | null;
  alertas: string[];
  /** Centro de costo donde se trabajó. */
  sucursalId?: number | null;
  sucursal?: string | null;
  /** Turno elegido al cubrir otra sucursal (null = el habitual del empleado). */
  horarioId?: number | null;
  turno?: string | null;
  distanciaSedeMetros?: number | null;
  precisionMetros?: number | null;
  /** La tablet marcó más lejos de la sede que su radio. */
  fueraDeSede?: boolean;
  empleado: Pick<Empleado, "id" | "nombre" | "apellido" | "identificacion" | "cargo">;
}

export interface LineaLiquidacion {
  id: number;
  categoria: Categoria;
  minutos: number;
  factor: number;
  valorHora: number;
  valor: number;
}

export interface EventoAuditoria {
  id: number;
  accion: string;
  motivo: string | null;
  antes: Partial<{ entrada: string; salida: string | null; estado: string; observacion: string | null; estadoExtras: string | null; minutosExtraAprobados: number | null }> | null;
  despues: Partial<{ entrada: string; salida: string | null; estado: string; observacion: string | null; estadoExtras: string | null; minutosExtraAprobados: number | null }> | null;
  creadoEn: string;
  usuario: string | null;
}

export interface MarcacionDetalle extends Marcacion {
  lineas: LineaLiquidacion[];
  historial: EventoAuditoria[];
}

export interface Pagina<T> {
  datos: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface Dashboard {
  hoy: string;
  esFestivoHoy: string | null;
  empleadosActivos: number;
  presentes: Marcacion[];
  entradasHoy: number;
  empleadosHoy: number;
  enRevision: number;
  extrasPendientes: { marcaciones: number; minutos: number };
  offlineRechazadas: number;
  mes: { minutosExtra: number; valor: number; turnos: number };
  serie: {
    fecha: string;
    ordinarias: number;
    extraLiquidadas: number;
    extraPendientes: number;
    extraNoReconocidas: number;
    enCurso: number;
    festivo: string | null;
  }[];
  topExtras: { empleadoId: number; nombre: string; minutosExtra: number; valor: number }[];
  ultimas: Marcacion[];
  proximosFestivos: { fecha: string; nombre: string }[];
  parametros: ParametrosVigentes;
}

export interface FilaLiquidacion {
  empleadoId: number;
  identificacion: string;
  nombre: string;
  cargo: string | null;
  salario: number;
  turnos: number;
  minutosTotales: number;
  minutosExtra: number;
  minutosExtraPendientes: number;
  /** Turnos del periodo sin resolver: no están incluidos en los valores. */
  turnosPorRevisar: number;
  turnosEnCurso: number;
  valorTotal: number;
  categorias: Partial<Record<Categoria, { minutos: number; valor: number }>>;
  alertas: string[];
  /** Desglose por centro de costo. */
  centros?: CentroCosto[];
}

export interface PendientesPeriodo {
  porRevisar: number;
  enTurno: number;
  extrasPorAprobar: number;
  offlineSinResolver: number;
  total: number;
}

export interface ResumenPeriodo {
  empleados: number;
  turnos: number;
  minutosTotales: number;
  minutosExtra: number;
  valorTotal: number;
}

/** Un cierre de liquidación. Si se reabrió, queda como historial (vigente = false). */
export interface PeriodoLiquidado {
  id: number;
  desde: string;
  hasta: string;
  nota: string | null;
  resumen: ResumenPeriodo;
  detalle: { empleadoId: number; identificacion: string; nombre: string; turnos: number; minutosTotales: number; minutosExtra: number; valorTotal: number }[];
  cerradoEn: string;
  cerradoPorNombre: string | null;
  reabiertoEn: string | null;
  reabiertoPorNombre: string | null;
  motivoReapertura: string | null;
  vigente: boolean;
}

export interface ReporteLiquidacion {
  desde: string;
  hasta: string;
  datos: FilaLiquidacion[];
  totales: {
    empleados: number;
    turnos: number;
    minutosTotales: number;
    minutosExtra: number;
    minutosExtraPendientes: number;
    valorTotal: number;
    categorias: Record<Categoria, { minutos: number; valor: number }>;
  };
  /** Subtotales por centro de costo de la misma liquidación (puede faltar con una API anterior). */
  porCentroCosto?: CentroCosto[];
  pendientes: PendientesPeriodo;
  cierre: {
    /** LIQUIDADO: todos los días del rango están cerrados. MIXTO: solo una parte. */
    estado: "ABIERTO" | "LIQUIDADO" | "MIXTO";
    periodos: { id: number; desde: string; hasta: string; cerradoEn: string; nota: string | null }[];
  };
}

export interface FilaExtrasDiarias {
  marcacionId: number;
  empleadoId: number;
  fecha: string;
  empleado: string;
  identificacion: string;
  entrada: string;
  salida: string | null;
  salidaAutomatica: boolean;
  codigoCentro?: string | null;
  centro?: string | null;
  minDiurnas: number;
  minNocturnas: number;
  minFestivas: number;
  minPendientes: number;
}

export interface ReporteExtrasDiarias {
  desde: string;
  hasta: string;
  datos: FilaExtrasDiarias[];
  totales: { empleados: number; dias: number; minDiurnas: number; minNocturnas: number; minFestivas: number; minPendientes: number };
}

export interface CentroCosto {
  sucursalId: number | null;
  codigo: string | null;
  nombre: string;
  turnos: number;
  minutosTotales: number;
  minutosExtra: number;
  valorTotal: number;
  categorias: Partial<Record<Categoria, { minutos: number; valor: number }>>;
}

export interface Sucursal {
  id: number;
  codigo: string;
  nombre: string;
  ciudad: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  radioMetros: number;
  activa: boolean;
}

export interface DatosEmpresa {
  empresa: { nombre: string; nit: string | null; definida: boolean };
  sucursales: Sucursal[];
}
