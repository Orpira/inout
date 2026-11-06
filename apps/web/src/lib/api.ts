import { aplicarZona } from "./zona";

export class ErrorApi extends Error {
  constructor(
    public status: number,
    message: string,
    public codigo?: string,
  ) {
    super(message);
  }
}

const tokenKiosko = () => {
  try {
    return localStorage.getItem("inout.kioskoToken") ?? undefined;
  } catch {
    return undefined;
  }
};

export async function api<T>(ruta: string, opciones: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opciones.body !== undefined) headers["Content-Type"] = "application/json";
  const tk = tokenKiosko();
  if (tk && ruta.startsWith("/kiosko")) headers["x-kiosko-token"] = tk;

  // Una red inestable puede dejar la petición colgada: pasado el plazo se trata como sin conexión.
  const control = new AbortController();
  const plazo = opciones.timeoutMs ? setTimeout(() => control.abort(), opciones.timeoutMs) : null;
  let res: Response;
  try {
    res = await fetch(`/api${ruta}`, {
      method: opciones.method ?? (opciones.body !== undefined ? "POST" : "GET"),
      headers,
      credentials: "same-origin",
      body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
      signal: control.signal,
    });
  } catch {
    throw new ErrorApi(0, "Sin conexión con el servidor", "SIN_CONEXION");
  } finally {
    if (plazo) clearTimeout(plazo);
  }
  aplicarZona(res.headers.get("x-zona-horaria"));
  if (!res.ok) {
    let cuerpo: { error?: string; codigo?: string } = {};
    try {
      cuerpo = await res.json();
    } catch {
      /* respuesta sin JSON */
    }
    if (res.status === 401 && !ruta.startsWith("/auth/login") && !ruta.startsWith("/kiosko")) {
      window.dispatchEvent(new Event("inout:sesion-expirada"));
    }
    throw new ErrorApi(res.status, cuerpo.error ?? `Error ${res.status}`, cuerpo.codigo);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const descargar = (ruta: string) => {
  window.location.href = `/api${ruta}`;
};
