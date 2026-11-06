import { desdeLocal, diaSemana, fechaLocal, horarioLegalPorDefecto, liquidar, minutosOrdinariosHorario, sumarDias, type Horario } from "@inout/core";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Db, DbTx } from "../db/client.js";
import {
  auditoria,
  empleados,
  horarios,
  liquidacionLineas,
  marcaciones,
  type Empleado,
  type Marcacion,
} from "../db/schema.js";
import type { Env } from "../env.js";
import { conflicto, noEncontrado, solicitudInvalida } from "../errores.js";
import type { ServicioCalendario } from "./calendario.js";

export type TipoMarca = "ENTRADA" | "SALIDA";

export interface ResultadoMarca {
  tipo: TipoMarca;
  marcacion: Marcacion;
  empleado: Pick<Empleado, "id" | "nombre" | "apellido" | "identificacion" | "cargo">;
  aviso?: string;
}

const resumenEmpleado = (e: Empleado) => ({
  id: e.id,
  nombre: e.nombre,
  apellido: e.apellido,
  identificacion: e.identificacion,
  cargo: e.cargo,
});

/** Instantáneas para auditoría (sin campos derivados). */
const instantanea = (m: Marcacion) => ({
  entrada: m.entrada.toISOString(),
  salida: m.salida?.toISOString() ?? null,
  estado: m.estado,
  observacion: m.observacion,
});

export class ServicioMarcaciones {
  constructor(
    private readonly db: Db,
    private readonly calendario: ServicioCalendario,
    private readonly env: Pick<Env, "MAX_HORAS_TURNO" | "ANTIREBOTE_SEGUNDOS" | "MAX_HORAS_OFFLINE">,
  ) {}

  async buscarEmpleadoPorCodigo(codigo: string) {
    const [e] = await this.db
      .select()
      .from(empleados)
      .where(and(eq(empleados.identificacion, codigo.trim()), eq(empleados.activo, true)));
    if (!e) throw noEncontrado("Empleado");
    const [abierta] = await this.db
      .select({ entrada: marcaciones.entrada })
      .from(marcaciones)
      .where(and(eq(marcaciones.empleadoId, e.id), eq(marcaciones.estado, "ABIERTA")));
    return { ...resumenEmpleado(e), proximaMarca: (abierta ? "SALIDA" : "ENTRADA") as TipoMarca, abiertaDesde: abierta?.entrada ?? null };
  }

  /**
   * Marcación desde el kiosko: abre o cierra el turno según el estado actual.
   * `momento` permite sincronizar marcaciones capturadas sin conexión.
   */
  async marcar(codigo: string, opciones: { momento?: Date; offline?: boolean } = {}): Promise<ResultadoMarca> {
    const ahora = new Date();
    const momento = opciones.momento ?? ahora;
    if (opciones.momento) {
      const desfaseMin = (ahora.getTime() - momento.getTime()) / 60_000;
      if (desfaseMin < -2) throw solicitudInvalida("La hora de la marcación está en el futuro.");
      if (desfaseMin > this.env.MAX_HORAS_OFFLINE * 60) {
        throw solicitudInvalida("La marcación sin conexión es demasiado antigua; regístrela manualmente.");
      }
    }
    const origen = opciones.offline ? "KIOSKO_OFFLINE" : "KIOSKO";

    return this.db.transaction(async (tx) => {
      const [empleado] = await tx
        .select()
        .from(empleados)
        .where(and(eq(empleados.identificacion, codigo.trim()), eq(empleados.activo, true)));
      if (!empleado) throw noEncontrado("Empleado");

      // Serializa marcaciones concurrentes del mismo empleado.
      await tx.execute(sql`select pg_advisory_xact_lock(${empleado.id})`);

      const [abierta] = await tx
        .select()
        .from(marcaciones)
        .where(and(eq(marcaciones.empleadoId, empleado.id), eq(marcaciones.estado, "ABIERTA")));

      const antirreboteMs = this.env.ANTIREBOTE_SEGUNDOS * 1000;

      if (abierta) {
        const transcurridoMs = momento.getTime() - abierta.entrada.getTime();
        if (transcurridoMs < 0) throw conflicto("La marcación es anterior a la entrada registrada.");
        if (transcurridoMs < antirreboteMs) {
          throw conflicto("Ya registraste tu entrada hace un momento.", "MARCA_DUPLICADA");
        }
        if (transcurridoMs > this.env.MAX_HORAS_TURNO * 3_600_000) {
          // Turno sin salida: se envía a revisión y se abre uno nuevo.
          const [revision] = await tx
            .update(marcaciones)
            .set({
              estado: "REVISION",
              observacion: añadir(abierta.observacion, `Sin salida registrada en ${this.env.MAX_HORAS_TURNO} h.`),
            })
            .where(eq(marcaciones.id, abierta.id))
            .returning();
          await this.auditar(tx, null, revision!.id, "ENVIAR_REVISION", "Turno sin salida", instantanea(abierta), instantanea(revision!));
          const nueva = await this.crearEntrada(tx, empleado.id, momento, origen);
          return {
            tipo: "ENTRADA",
            marcacion: nueva,
            empleado: resumenEmpleado(empleado),
            aviso: "Tenías un turno anterior sin salida; quedó pendiente de revisión por tu supervisor.",
          };
        }
        const cerrada = await this.cerrar(tx, abierta, momento);
        return { tipo: "SALIDA", marcacion: cerrada, empleado: resumenEmpleado(empleado) };
      }

      const [ultima] = await tx
        .select()
        .from(marcaciones)
        .where(and(eq(marcaciones.empleadoId, empleado.id), ne(marcaciones.estado, "ANULADA")))
        .orderBy(desc(marcaciones.entrada))
        .limit(1);
      // Salida guardada sin conexión que llega después de que el turno pasara a revisión
      // por falta de salida: cierra ese turno en lugar de abrir uno nuevo.
      if (
        opciones.offline &&
        ultima?.estado === "REVISION" &&
        !ultima.salida &&
        momento.getTime() > ultima.entrada.getTime() &&
        momento.getTime() - ultima.entrada.getTime() <= this.env.MAX_HORAS_TURNO * 3_600_000
      ) {
        const cerrada = await this.cerrar(tx, ultima, momento);
        await this.auditar(tx, null, ultima.id, "CERRAR_SIN_CONEXION", "Salida recibida del kiosko al recuperar la conexión", instantanea(ultima), instantanea(cerrada));
        return { tipo: "SALIDA", marcacion: cerrada, empleado: resumenEmpleado(empleado) };
      }
      if (ultima?.salida && momento.getTime() - ultima.salida.getTime() < antirreboteMs) {
        throw conflicto("Ya registraste tu salida hace un momento.", "MARCA_DUPLICADA");
      }
      if (ultima?.salida && momento.getTime() < ultima.salida.getTime()) {
        throw conflicto("La marcación es anterior a tu última salida registrada.");
      }
      const nueva = await this.crearEntrada(tx, empleado.id, momento, origen);
      return { tipo: "ENTRADA", marcacion: nueva, empleado: resumenEmpleado(empleado) };
    });
  }

  private async crearEntrada(tx: DbTx, empleadoId: number, entrada: Date, origen: Marcacion["origen"]) {
    const [m] = await tx.insert(marcaciones).values({ empleadoId, entrada, origen, estado: "ABIERTA" }).returning();
    return m!;
  }

  private async cerrar(tx: DbTx, m: Marcacion, salida: Date): Promise<Marcacion> {
    await tx.update(marcaciones).set({ salida, estado: "CERRADA" }).where(eq(marcaciones.id, m.id));
    await this.recalcularDia(tx, m.empleadoId, fechaLocal(m.entrada));
    const [actual] = await tx.select().from(marcaciones).where(eq(marcaciones.id, m.id));
    return actual!;
  }

  /**
   * Recalcula la liquidación de todas las marcaciones cerradas de un empleado en un día local,
   * en orden cronológico, para que la jornada ordinaria se consuma correctamente entre turnos.
   *
   * La jornada del día, el descanso, la tolerancia y la aprobación de extras salen del horario
   * asignado al empleado (o de la jornada legal L-S si no tiene horario).
   */
  async recalcularDia(tx: DbTx, empleadoId: number, fecha: string) {
    const [fila] = await tx
      .select({ empleado: empleados, horario: horarios })
      .from(empleados)
      .leftJoin(horarios, eq(horarios.id, empleados.horarioId))
      .where(eq(empleados.id, empleadoId));
    if (!fila) throw noEncontrado("Empleado");
    const { empleado } = fila;
    const horario: Horario = fila.horario ?? horarioLegalPorDefecto(fecha);
    const calendario = await this.calendario.obtener(tx);
    const delDia = await tx
      .select()
      .from(marcaciones)
      .where(
        and(
          eq(marcaciones.empleadoId, empleadoId),
          gte(marcaciones.entrada, desdeLocal(fecha)),
          lt(marcaciones.entrada, desdeLocal(sumarDias(fecha, 1))),
        ),
      )
      .orderBy(asc(marcaciones.entrada));

    if (delDia.length) {
      await tx.delete(liquidacionLineas).where(inArray(liquidacionLineas.marcacionId, delDia.map((m) => m.id)));
    }

    const cerradas = delDia.filter((m) => m.estado === "CERRADA" && m.salida);
    const limite = minutosOrdinariosHorario(horario, diaSemana(fecha));
    // Una pausa por duración solo se descuenta si el día tiene un único turno;
    // si el empleado marcó salida y entrada para su pausa, ya está fuera del tiempo trabajado.
    const descanso =
      horario.descanso?.tipo === "DURACION" && cerradas.length > 1 ? null : horario.descanso;

    let previos = 0;
    for (const m of delDia) {
      if (m.estado !== "CERRADA" || !m.salida) {
        await tx
          .update(marcaciones)
          .set({
            minutosTotales: null,
            minutosExtra: null,
            minutosExtraCalculados: null,
            minutosDescanso: null,
            estadoExtras: null,
            valorRecargos: null,
            alertas: [],
          })
          .where(eq(marcaciones.id, m.id));
        continue;
      }
      const params = {
        entrada: m.entrada,
        salida: m.salida,
        salarioMensual: empleado.salario,
        minutosOrdinariosDia: limite,
        minutosPreviosDia: previos,
        descanso,
        calendario,
      };
      const bruto = liquidar(params);
      const calculadas = bruto.minutosExtraCalculados;

      // Decide cuántas extras se reconocen.
      let estadoExtras: NonNullable<Marcacion["estadoExtras"]>;
      let tope: number | null = null;
      if (calculadas === 0) {
        estadoExtras = "SIN_EXTRAS";
      } else if (calculadas <= horario.toleranciaMinutos) {
        estadoExtras = "TOLERANCIA";
        tope = 0;
      } else if (horario.requiereAprobacion) {
        if (m.estadoExtras === "APROBADAS" || m.estadoExtras === "RECHAZADAS") {
          estadoExtras = m.estadoExtras;
          tope = m.minutosExtraAprobados ?? 0;
        } else {
          estadoExtras = "PENDIENTE";
          tope = 0;
        }
      } else {
        estadoExtras = "AUTOMATICAS";
      }
      const r = tope === null ? bruto : liquidar({ ...params, maxMinutosExtra: tope });
      previos += r.minutosTrabajados;

      if (r.lineas.length) {
        await tx.insert(liquidacionLineas).values(
          r.lineas.map((l) => ({
            marcacionId: m.id,
            categoria: l.categoria,
            minutos: l.minutos,
            factor: l.factor,
            valorHora: r.valorHora,
            valor: l.valor,
          })),
        );
      }
      await tx
        .update(marcaciones)
        .set({
          minutosTotales: r.minutosTotales,
          minutosExtra: r.minutosExtra,
          minutosExtraCalculados: calculadas,
          minutosDescanso: r.minutosDescanso,
          estadoExtras,
          valorRecargos: r.valorTotal,
          alertas: r.alertas,
        })
        .where(eq(marcaciones.id, m.id));
    }
  }

  /**
   * Aprueba (total o parcialmente) o rechaza las horas extra de una marcación cerrada.
   * Solo aplica a horarios que exigen aprobación.
   */
  async revisarExtras(
    usuarioId: number,
    id: number,
    decision: { aprobar: boolean; minutos?: number | null; motivo?: string | null },
  ) {
    return this.db.transaction(async (tx) => {
      const [m] = await tx.select().from(marcaciones).where(eq(marcaciones.id, id));
      if (!m) throw noEncontrado("Marcación");
      if (!["PENDIENTE", "APROBADAS", "RECHAZADAS"].includes(m.estadoExtras ?? "")) {
        throw conflicto("Esta marcación no tiene horas extra por aprobar.");
      }
      const calculadas = m.minutosExtraCalculados ?? 0;
      const minutos = decision.aprobar ? Math.min(decision.minutos ?? calculadas, calculadas) : 0;
      if (decision.aprobar && minutos <= 0) throw solicitudInvalida("Indica cuántos minutos se aprueban.");
      if (!decision.aprobar && !decision.motivo) throw solicitudInvalida("Indica el motivo del rechazo.");
      const estadoExtras = decision.aprobar ? "APROBADAS" : "RECHAZADAS";
      await tx
        .update(marcaciones)
        .set({ estadoExtras, minutosExtraAprobados: minutos, extrasRevisadasPor: usuarioId, extrasRevisadasEn: new Date() })
        .where(eq(marcaciones.id, id));
      await this.recalcularDia(tx, m.empleadoId, fechaLocal(m.entrada));
      await this.auditar(
        tx,
        usuarioId,
        id,
        decision.aprobar ? "APROBAR_EXTRAS" : "RECHAZAR_EXTRAS",
        decision.motivo ?? (minutos < calculadas ? `Aprobadas ${minutos} de ${calculadas} min` : null),
        { estadoExtras: m.estadoExtras, minutosExtraAprobados: m.minutosExtraAprobados },
        { estadoExtras, minutosExtraAprobados: minutos },
      );
      const [final] = await tx.select().from(marcaciones).where(eq(marcaciones.id, id));
      return final!;
    });
  }

  /** Aprueba todas las extras calculadas de varias marcaciones pendientes. */
  async aprobarExtrasEnLote(usuarioId: number, ids: number[]) {
    let n = 0;
    for (const id of ids) {
      const [m] = await this.db.select({ estado: marcaciones.estadoExtras }).from(marcaciones).where(eq(marcaciones.id, id));
      if (m?.estado !== "PENDIENTE") continue;
      await this.revisarExtras(usuarioId, id, { aprobar: true });
      n++;
    }
    return n;
  }

  /** Recalcula todas las marcaciones cerradas en un rango (p. ej. tras cambiar festivos o salarios). */
  async recalcularRango(desde: string, hasta: string, empleadoId?: number) {
    const filas = await this.db
      .selectDistinct({
        empleadoId: marcaciones.empleadoId,
        fecha: sql<string>`to_char(${marcaciones.entrada} at time zone 'America/Bogota', 'YYYY-MM-DD')`,
      })
      .from(marcaciones)
      .where(
        and(
          gte(marcaciones.entrada, desdeLocal(desde)),
          lt(marcaciones.entrada, desdeLocal(sumarDias(hasta, 1))),
          empleadoId ? eq(marcaciones.empleadoId, empleadoId) : undefined,
        ),
      );
    for (const f of filas) {
      await this.db.transaction((tx) => this.recalcularDia(tx, f.empleadoId, f.fecha));
    }
    return filas.length;
  }

  private async validarSolape(tx: DbTx, empleadoId: number, entrada: Date, salida: Date | null, excluirId?: number) {
    const fin = salida ?? new Date("9999-12-31T00:00:00Z");
    const [choque] = await tx
      .select({ id: marcaciones.id, entrada: marcaciones.entrada })
      .from(marcaciones)
      .where(
        and(
          eq(marcaciones.empleadoId, empleadoId),
          ne(marcaciones.estado, "ANULADA"),
          excluirId ? ne(marcaciones.id, excluirId) : undefined,
          lt(marcaciones.entrada, fin),
          or(isNull(marcaciones.salida), gt(marcaciones.salida, entrada)),
        ),
      )
      .limit(1);
    if (choque) {
      throw conflicto(`Se solapa con la marcación #${choque.id}.`, "SOLAPE");
    }
  }

  async crearManual(
    usuarioId: number,
    datos: { empleadoId: number; entrada: Date; salida: Date | null; observacion?: string | null; motivo: string },
  ) {
    if (datos.salida && datos.salida <= datos.entrada) throw solicitudInvalida("La salida debe ser posterior a la entrada.");
    if (datos.entrada > new Date()) throw solicitudInvalida("La entrada no puede estar en el futuro.");
    if (datos.salida && datos.salida > new Date(Date.now() + 60_000)) throw solicitudInvalida("La salida no puede estar en el futuro.");
    return this.db.transaction(async (tx) => {
      const [e] = await tx.select().from(empleados).where(eq(empleados.id, datos.empleadoId));
      if (!e) throw noEncontrado("Empleado");
      await tx.execute(sql`select pg_advisory_xact_lock(${e.id})`);
      await this.validarSolape(tx, e.id, datos.entrada, datos.salida);
      const [m] = await tx
        .insert(marcaciones)
        .values({
          empleadoId: e.id,
          entrada: datos.entrada,
          salida: datos.salida,
          estado: datos.salida ? "CERRADA" : "ABIERTA",
          origen: "MANUAL",
          observacion: datos.observacion ?? null,
          creadoPor: usuarioId,
        })
        .returning();
      if (m!.salida) await this.recalcularDia(tx, e.id, fechaLocal(m!.entrada));
      await this.auditar(tx, usuarioId, m!.id, "CREAR", datos.motivo, null, instantanea(m!));
      return m!;
    });
  }

  async editar(
    usuarioId: number,
    id: number,
    cambios: { entrada?: Date; salida?: Date | null; observacion?: string | null; motivo: string },
  ) {
    return this.db.transaction(async (tx) => {
      const [m] = await tx.select().from(marcaciones).where(eq(marcaciones.id, id));
      if (!m) throw noEncontrado("Marcación");
      if (m.estado === "ANULADA") throw conflicto("No se puede editar una marcación anulada.");
      await tx.execute(sql`select pg_advisory_xact_lock(${m.empleadoId})`);

      const entrada = cambios.entrada ?? m.entrada;
      const salida = cambios.salida === undefined ? m.salida : cambios.salida;
      if (salida && salida <= entrada) throw solicitudInvalida("La salida debe ser posterior a la entrada.");
      if (salida && salida > new Date(Date.now() + 60_000)) throw solicitudInvalida("La salida no puede estar en el futuro.");
      const observacion = cambios.observacion === undefined ? m.observacion : cambios.observacion;
      const sinCambios =
        entrada.getTime() === m.entrada.getTime() &&
        (salida?.getTime() ?? null) === (m.salida?.getTime() ?? null) &&
        (observacion ?? null) === (m.observacion ?? null);
      if (sinCambios) throw solicitudInvalida("No hay cambios que guardar.");
      await this.validarSolape(tx, m.empleadoId, entrada, salida, m.id);

      // Sin salida: queda abierta (si no hay otra abierta) o en revisión.
      let estado: Marcacion["estado"] = "CERRADA";
      if (!salida) {
        const [otraAbierta] = await tx
          .select({ id: marcaciones.id })
          .from(marcaciones)
          .where(and(eq(marcaciones.empleadoId, m.empleadoId), eq(marcaciones.estado, "ABIERTA"), ne(marcaciones.id, m.id)));
        estado = otraAbierta ? "REVISION" : "ABIERTA";
      }

      const cambianHoras = entrada.getTime() !== m.entrada.getTime() || (salida?.getTime() ?? null) !== (m.salida?.getTime() ?? null);
      const [actual] = await tx
        .update(marcaciones)
        .set({
          entrada,
          salida,
          estado,
          // Si cambian las horas, una aprobación previa de extras deja de ser válida.
          ...(cambianHoras ? { estadoExtras: null, minutosExtraAprobados: null, extrasRevisadasPor: null, extrasRevisadasEn: null } : {}),
          observacion,
        })
        .where(eq(marcaciones.id, id))
        .returning();

      const dias = new Set([fechaLocal(m.entrada), fechaLocal(entrada)]);
      for (const d of dias) await this.recalcularDia(tx, m.empleadoId, d);
      await this.auditar(tx, usuarioId, id, "EDITAR", cambios.motivo, instantanea(m), instantanea(actual!));
      const [final] = await tx.select().from(marcaciones).where(eq(marcaciones.id, id));
      return final!;
    });
  }

  async anular(usuarioId: number, id: number, motivo: string) {
    return this.db.transaction(async (tx) => {
      const [m] = await tx.select().from(marcaciones).where(eq(marcaciones.id, id));
      if (!m) throw noEncontrado("Marcación");
      if (m.estado === "ANULADA") throw conflicto("La marcación ya está anulada.");
      const [actual] = await tx.update(marcaciones).set({ estado: "ANULADA" }).where(eq(marcaciones.id, id)).returning();
      await this.recalcularDia(tx, m.empleadoId, fechaLocal(m.entrada));
      await this.auditar(tx, usuarioId, id, "ANULAR", motivo, instantanea(m), instantanea(actual!));
      return actual!;
    });
  }

  /** Envía a revisión las marcaciones abiertas que superan el máximo de horas de turno. */
  async enviarVencidasARevision(): Promise<number> {
    const limite = new Date(Date.now() - this.env.MAX_HORAS_TURNO * 3_600_000);
    const vencidas = await this.db
      .update(marcaciones)
      .set({
        estado: "REVISION",
        observacion: sql`concat_ws(E'\n', ${marcaciones.observacion}, ${`Sin salida registrada en ${this.env.MAX_HORAS_TURNO} h.`}::text)`,
      })
      .where(and(eq(marcaciones.estado, "ABIERTA"), lt(marcaciones.entrada, limite)))
      .returning({ id: marcaciones.id });
    for (const v of vencidas) {
      await this.auditar(this.db, null, v.id, "ENVIAR_REVISION", "Cierre automático por turno vencido", null, null);
    }
    return vencidas.length;
  }

  private async auditar(
    tx: DbTx,
    usuarioId: number | null,
    entidadId: number,
    accion: string,
    motivo: string | null,
    antes: unknown,
    despues: unknown,
  ) {
    await tx.insert(auditoria).values({ usuarioId, entidad: "marcacion", entidadId, accion, motivo, antes, despues });
  }
}

function añadir(texto: string | null, linea: string) {
  return texto ? `${texto}\n${linea}` : linea;
}
