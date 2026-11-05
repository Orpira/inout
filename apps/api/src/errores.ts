export class ErrorHttp extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly codigo?: string,
  ) {
    super(message);
  }
}

export const noEncontrado = (que = "Recurso") => new ErrorHttp(404, `${que} no encontrado`, "NO_ENCONTRADO");
export const conflicto = (msg: string, codigo = "CONFLICTO") => new ErrorHttp(409, msg, codigo);
export const solicitudInvalida = (msg: string) => new ErrorHttp(400, msg, "SOLICITUD_INVALIDA");
