import type { Categoria, DiaProgramado } from '@inout/core';

/** Instante tal como lo devuelve la API: ISO + fecha/hora ya en Colombia. */
export interface Momento {
  iso: string;
  fecha: string;
  hora: string;
}

export interface Marcacion {
  id: number;
  empleadoId: number;
  empleado?: string;
  estado: 'ABIERTA' | 'CERRADA' | 'REVISION' | 'ANULADA';
  entrada: Momento;
  salida: Momento | null;
}

export interface Empleado {
  id: number;
  documento: string;
  nombre: string;
  salarioMensual: number;
  jornadaPactadaMin: number | null;
  /** 0 = domingo … 6 = sábado. */
  diaDescanso: number;
  activo: boolean;
}

export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: 'ADMIN' | 'SUPERVISOR';
  activo: boolean;
}

export interface RegistroAuditoria {
  id: number;
  motivo: string;
  usuario: string;
  creadoEn: Momento;
  antes: unknown;
  despues: unknown;
}

export interface DiaLiquidado {
  fecha: string;
  minutos: Record<Categoria, number>;
  totalMin: number;
  extrasMin: number;
  valorAdicional: number;
  alertaExtrasDia: boolean;
  jornadaDiariaMin: number;
  origenJornada: 'TURNO' | 'DESCANSO' | 'PACTADA' | 'LEGAL';
  programado: DiaProgramado | null;
  tardanzaMin: number;
  salidaAnticipadaMin: number;
  ausente: boolean;
  descansoPresuntoMin: number;
}

export interface LiquidacionEmpleado {
  empleado: Pick<Empleado, 'id' | 'nombre' | 'documento' | 'salarioMensual' | 'activo'>;
  totales: Record<Categoria, number>;
  totalMin: number;
  extrasMin: number;
  valorAdicional: number;
  pendientes: number;
  cumplimiento: { ausencias: string[]; tardanzas: number; tardanzaMin: number; salidasAnticipadas: number; trabajoEnDescanso: string[] };
  alertas: { dias: string[]; semanas: string[] };
  dias: DiaLiquidado[];
}

export interface TurnoCatalogo {
  id: number;
  nombre: string;
  horaInicio: string;
  horaFin: string;
  descansoInicio: string | null;
  descansoFin: string | null;
  activo: boolean;
}

/** Día dentro de un horario fijo (copia del turno); null = descanso. */
export interface DiaHorario {
  turnoId: number;
  nombre: string;
  horaInicio: string;
  horaFin: string;
  descansoInicio: string | null;
  descansoFin: string | null;
}

/** Versión del horario fijo de un empleado. semana: índice 0 = domingo. */
export interface VersionHorario {
  empleadoId: number;
  vigenteDesde: string;
  semana: (DiaHorario | null)[];
}

export interface Festivo {
  fecha: string;
  nombre: string;
}
