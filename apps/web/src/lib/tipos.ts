import type { Categoria, Horario as HorarioCore, ParametrosVigentes, ValidacionHorario } from "@inout/core";

export type Rol = "ADMIN" | "SUPERVISOR";
export type EstadoMarcacion = "ABIERTA" | "CERRADA" | "REVISION" | "ANULADA";
export type EstadoExtras = "SIN_EXTRAS" | "TOLERANCIA" | "PENDIENTE" | "APROBADAS" | "RECHAZADAS" | "AUTOMATICAS";

export interface Horario extends HorarioCore {
  id: number;
  nombre: string;
  activo: boolean;
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
  minutosTotales: number | null;
  minutosExtra: number | null;
  minutosExtraCalculados: number | null;
  minutosExtraAprobados: number | null;
  minutosDescanso: number | null;
  estadoExtras: EstadoExtras | null;
  valorRecargos: number | null;
  alertas: string[];
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
  serie: { fecha: string; minutosTotales: number; minutosExtra: number; festivo: string | null }[];
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
  valorTotal: number;
  categorias: Partial<Record<Categoria, { minutos: number; valor: number }>>;
  alertas: string[];
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
}
