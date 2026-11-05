export class ErrorApi extends Error {
  constructor(
    public readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export async function api<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${ruta}`, {
    credentials: 'same-origin',
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...opciones.headers },
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErrorApi(res.status, cuerpo.error ?? 'Error inesperado');
  return cuerpo as T;
}

export interface RespuestaMarcacion {
  tipo: 'ENTRADA' | 'SALIDA';
  empleado: string;
  fecha: string;
  hora: string;
  aviso?: string;
}

export interface Sesion {
  id: number;
  nombre: string;
  rol: 'ADMIN' | 'SUPERVISOR';
}
