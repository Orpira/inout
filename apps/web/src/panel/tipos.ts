import type { Categoria } from '@inout/core';

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
}

export interface LiquidacionEmpleado {
  empleado: Pick<Empleado, 'id' | 'nombre' | 'documento' | 'salarioMensual' | 'activo'>;
  totales: Record<Categoria, number>;
  totalMin: number;
  extrasMin: number;
  valorAdicional: number;
  pendientes: number;
  alertas: { dias: string[]; semanas: string[] };
  dias: DiaLiquidado[];
}

export interface Festivo {
  fecha: string;
  nombre: string;
}
