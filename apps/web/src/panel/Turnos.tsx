import { type HorarioTurno, lunesDeSemana, parametrosEn, sumarDias, validarHorario, ventanasTurno } from '@inout/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../api';
import { DIAS_SEMANA } from './Empleados';
import type { Empleado, Festivo, FilaProgramacion, TurnoCatalogo } from './tipos';
import { Boton, Campo, Entrada, MensajeError, Modal, Selector, Tabla, Vacio, horas, hoyColombia } from './ui';

/** Valor de una celda: id de turno, día de descanso o sin programar. */
type Valor = number | 'DESCANSO' | null;
const clave = (empleadoId: number, fecha: string) => `${empleadoId}|${fecha}`;
const aSelect = (v: Valor) => (v === null ? '' : v === 'DESCANSO' ? 'D' : String(v));
const deSelect = (s: string): Valor => (s === '' ? null : s === 'D' ? 'DESCANSO' : Number(s));
const valorDeFila = (f: FilaProgramacion | undefined): Valor => (!f ? null : f.turnoId ?? 'DESCANSO');

const ordinariaMin = (h: HorarioTurno) => (validarHorario(h) ? 0 : ventanasTurno('2026-01-05', h).ordinariaMin);
const textoHorario = (h: HorarioTurno) =>
  `${h.horaInicio}–${h.horaFin}${h.descansoInicio ? ` (descanso ${h.descansoInicio}–${h.descansoFin})` : ''}`;

function semana(lunes: string) {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

// ---------------------------------------------------------------------------
// Programación semanal
// ---------------------------------------------------------------------------

function useFestivos(fechas: string[]) {
  const anios = [...new Set(fechas.map((f) => Number(f.slice(0, 4))))];
  const qs = useQuery({
    queryKey: ['festivos', ...anios],
    queryFn: async () => (await Promise.all(anios.map((a) => api<{ festivos: Festivo[] }>(`/festivos/${a}`)))).flatMap((r) => r.festivos),
  });
  return new Map((qs.data ?? []).map((f) => [f.fecha, f.nombre]));
}

function ProgramacionSemanal() {
  const qc = useQueryClient();
  const hoy = hoyColombia();
  const [lunes, setLunes] = useState(() => lunesDeSemana(hoy));
  const [cambios, setCambios] = useState(new Map<string, Valor>());
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [avisos, setAvisos] = useState<string[]>([]);
  const dias = semana(lunes);
  const domingo = dias[6]!;

  const empleados = useQuery({ queryKey: ['empleados'], queryFn: () => api<Empleado[]>('/empleados') });
  const turnos = useQuery({ queryKey: ['turnos'], queryFn: () => api<TurnoCatalogo[]>('/turnos') });
  const prog = useQuery({
    queryKey: ['programacion', lunes],
    queryFn: () => api<FilaProgramacion[]>(`/programacion?desde=${lunes}&hasta=${domingo}`),
  });
  const festivos = useFestivos(dias);

  const filas = new Map((prog.data ?? []).map((f) => [clave(f.empleadoId, f.fecha), f]));
  const catalogo = new Map((turnos.data ?? []).map((t) => [t.id, t]));
  const activos = (empleados.data ?? []).filter((e) => e.activo);
  const maxSemanaMin = parametrosEn(domingo).jornadaSemanalHoras * 60;

  const valor = (empleadoId: number, fecha: string): Valor => {
    const k = clave(empleadoId, fecha);
    return cambios.has(k) ? cambios.get(k)! : valorDeFila(filas.get(k));
  };
  /** Horas ordinarias de una celda: la copia guardada si no cambió; si cambió, la del catálogo. */
  const minutosCelda = (empleadoId: number, fecha: string) => {
    const k = clave(empleadoId, fecha);
    const f = filas.get(k);
    if (!cambios.has(k)) return f?.horaInicio && f.horaFin ? ordinariaMin(f as HorarioTurno) : 0;
    const v = cambios.get(k);
    const t = typeof v === 'number' ? catalogo.get(v) : undefined;
    return t ? ordinariaMin(t) : 0;
  };

  const cambiar = (empleadoId: number, fecha: string, v: Valor) => {
    const k = clave(empleadoId, fecha);
    const nuevo = new Map(cambios);
    if (v === valorDeFila(filas.get(k))) nuevo.delete(k);
    else nuevo.set(k, v);
    setCambios(nuevo);
  };

  const irA = (l: string) => {
    if (cambios.size && !confirm('Hay cambios sin guardar en esta semana. ¿Descartarlos?')) return;
    setCambios(new Map());
    setAvisos([]);
    setLunes(l);
  };

  const copiarAnterior = async () => {
    const anterior = sumarDias(lunes, -7);
    const filasAnt = await api<FilaProgramacion[]>(`/programacion?desde=${anterior}&hasta=${sumarDias(anterior, 6)}`);
    const porClave = new Map(filasAnt.map((f) => [clave(f.empleadoId, f.fecha), f]));
    const nuevo = new Map(cambios);
    for (const e of activos)
      dias.forEach((fecha, i) => {
        const v = valorDeFila(porClave.get(clave(e.id, sumarDias(anterior, i))));
        if (v !== valorDeFila(filas.get(clave(e.id, fecha)))) nuevo.set(clave(e.id, fecha), v);
        else nuevo.delete(clave(e.id, fecha));
      });
    setCambios(nuevo);
  };

  const guardar = useMutation({
    mutationFn: () =>
      api<{ avisos: string[] }>('/programacion', {
        method: 'PUT',
        body: JSON.stringify({
          cambios: [...cambios].map(([k, turnoId]) => {
            const [empleadoId, fecha] = k.split('|');
            return { empleadoId: Number(empleadoId), fecha, turnoId };
          }),
          motivo: motivo || undefined,
        }),
      }),
    onSuccess: (r) => {
      setAvisos(r.avisos);
      setCambios(new Map());
      setPidiendoMotivo(false);
      setMotivo('');
      qc.invalidateQueries({ queryKey: ['programacion'] });
      qc.invalidateQueries({ queryKey: ['liquidacion'] });
    },
  });
  const hayPasados = [...cambios.keys()].some((k) => k.split('|')[1]! < hoy);
  const pedirGuardar = () => (hayPasados ? setPidiendoMotivo(true) : guardar.mutate());

  const turnosActivos = (turnos.data ?? []).filter((t) => t.activo);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Boton onClick={() => irA(sumarDias(lunes, -7))}>‹</Boton>
        <span className="min-w-56 text-center font-semibold">
          Semana del {lunes} al {domingo}
        </span>
        <Boton onClick={() => irA(sumarDias(lunes, 7))}>›</Boton>
        <Boton onClick={() => irA(lunesDeSemana(hoy))}>Esta semana</Boton>
        <Boton onClick={copiarAnterior}>Copiar semana anterior</Boton>
        <div className="ml-auto flex gap-2">
          {cambios.size > 0 && <Boton onClick={() => setCambios(new Map())}>Descartar</Boton>}
          <Boton variante="primario" disabled={!cambios.size || guardar.isPending} onClick={pedirGuardar}>
            Guardar{cambios.size ? ` (${cambios.size})` : ''}
          </Boton>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Máximo legal esta semana: {maxSemanaMin / 60} h ordinarias, en 5 o 6 días y con al menos un día de descanso. Más de 8 h en un día exige
        pacto escrito de jornada flexible (hasta 9 h). Lo que se trabaje por encima del turno programado se liquida como extra; un día de
        descanso trabajado es todo extra.
      </p>
      {!pidiendoMotivo && <MensajeError error={guardar.error} />}
      {avisos.length > 0 && (
        <ul className="rounded bg-amber-50 p-2 text-sm text-amber-800">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <MensajeError error={empleados.error ?? turnos.error ?? prog.error} />
      {activos.length === 0 ? (
        <Vacio>No hay empleados activos.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Empleado</th>
              {dias.map((f, i) => (
                <th key={f} className={festivos.has(f) ? 'text-rose-700' : ''} title={festivos.get(f)}>
                  <div>{DIAS_SEMANA[(i + 1) % 7]}</div>
                  <div className="text-xs font-normal tabular-nums">
                    {f.slice(8)}/{f.slice(5, 7)}
                    {festivos.has(f) && ' · festivo'}
                  </div>
                </th>
              ))}
              <th>Horas</th>
            </tr>
          </thead>
          <tbody>
            {activos.map((e) => {
              const totalMin = dias.reduce((s, f) => s + minutosCelda(e.id, f), 0);
              const diasConTurno = dias.filter((f) => typeof valor(e.id, f) === 'number').length;
              const exceso = totalMin > maxSemanaMin;
              return (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{e.nombre}</td>
                  {dias.map((f) => {
                    const v = valor(e.id, f);
                    const cambiado = cambios.has(clave(e.id, f));
                    const guardada = filas.get(clave(e.id, f));
                    // Un turno ya programado que hoy está inactivo sigue apareciendo en su celda.
                    const opciones = typeof v === 'number' && !turnosActivos.some((t) => t.id === v) && catalogo.get(v) ? [...turnosActivos, catalogo.get(v)!] : turnosActivos;
                    const titulo = guardada?.horaInicio && !cambiado ? `Programado: ${textoHorario(guardada as HorarioTurno)}` : undefined;
                    return (
                      <td key={f} className={`${cambiado ? 'bg-amber-50' : ''} ${f < hoy ? 'opacity-70' : ''}`}>
                        <Selector
                          value={aSelect(v)}
                          title={titulo}
                          onChange={(ev) => cambiar(e.id, f, deSelect(ev.target.value))}
                          className={`w-28 rounded border px-1 py-1 text-xs ${v === 'DESCANSO' ? 'border-sky-300 bg-sky-50' : 'border-slate-300 bg-white'}`}
                        >
                          <option value="">—</option>
                          <option value="D">Descanso</option>
                          {opciones.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.nombre}
                            </option>
                          ))}
                        </Selector>
                      </td>
                    );
                  })}
                  <td className={`whitespace-nowrap tabular-nums ${exceso || diasConTurno === 7 ? 'font-semibold text-rose-700' : ''}`}>
                    {horas(totalMin)} / {maxSemanaMin / 60}
                    {diasConTurno === 7 && <div className="text-xs">sin descanso</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
      <p className="text-xs text-slate-500">
        «—» = sin programar (se aplica la jornada pactada o la legal ÷ 6). Las celdas en amarillo tienen cambios sin guardar. Cambiar días
        ya pasados exige un motivo porque altera la liquidación.
      </p>
      {pidiendoMotivo && (
        <Modal titulo="Cambios en días pasados" onCerrar={() => setPidiendoMotivo(false)}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(ev: FormEvent) => {
              ev.preventDefault();
              guardar.mutate();
            }}
          >
            <p className="text-sm">Algunos cambios son de días que ya pasaron y modifican la liquidación de esos días.</p>
            <Campo etiqueta="Motivo">
              <Entrada value={motivo} onChange={(ev) => setMotivo(ev.target.value)} minLength={5} required />
            </Campo>
            <MensajeError error={guardar.error} />
            <div className="flex justify-end gap-2">
              <Boton onClick={() => setPidiendoMotivo(false)}>Cancelar</Boton>
              <Boton variante="primario" type="submit" disabled={guardar.isPending}>
                Guardar
              </Boton>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Catálogo de turnos
// ---------------------------------------------------------------------------

function FormTurno({ turno, onCerrar }: { turno?: TurnoCatalogo; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(turno?.nombre ?? '');
  const [horaInicio, setHoraInicio] = useState(turno?.horaInicio ?? '');
  const [horaFin, setHoraFin] = useState(turno?.horaFin ?? '');
  const [descansoInicio, setDescansoInicio] = useState(turno?.descansoInicio ?? '');
  const [descansoFin, setDescansoFin] = useState(turno?.descansoFin ?? '');
  const [activo, setActivo] = useState(turno?.activo ?? true);
  const [motivo, setMotivo] = useState('');

  const horario: HorarioTurno = { horaInicio, horaFin, descansoInicio: descansoInicio || null, descansoFin: descansoFin || null };
  const completo = horaInicio && horaFin;
  const error = completo ? validarHorario(horario) : null;
  const ordinaria = completo && !error ? ordinariaMin(horario) : 0;

  const guardar = useMutation({
    mutationFn: () => {
      const datos = { nombre, ...horario, activo };
      return turno
        ? api(`/turnos/${turno.id}`, { method: 'PATCH', body: JSON.stringify({ ...datos, motivo }) })
        : api('/turnos', { method: 'POST', body: JSON.stringify({ nombre, ...horario }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['turnos'] });
      onCerrar();
    },
  });

  return (
    <Modal titulo={turno ? `Editar turno · ${turno.nombre}` : 'Nuevo turno'} onCerrar={onCerrar}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <Campo etiqueta="Nombre (p. ej. Mañana, Noche)">
          <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} minLength={2} required />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Entrada">
            <Entrada type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Salida">
            <Entrada type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Inicio del descanso (opcional)">
            <Entrada type="time" value={descansoInicio} onChange={(e) => setDescansoInicio(e.target.value)} />
          </Campo>
          <Campo etiqueta="Fin del descanso">
            <Entrada type="time" value={descansoFin} onChange={(e) => setDescansoFin(e.target.value)} required={!!descansoInicio} />
          </Campo>
        </div>
        <p className={`text-sm ${error ? 'text-rose-700' : 'text-slate-600'}`}>
          {error ?? (completo ? `${horas(ordinaria)} h ordinarias${horaFin <= horaInicio ? ' · termina al día siguiente' : ''}${ordinaria > 480 ? ' · más de 8 h: requiere pacto de jornada flexible' : ''}` : '')}
        </p>
        <p className="text-xs text-slate-500">
          El descanso (almuerzo) no es tiempo de trabajo. Si el empleado no marca la pausa, se presume tomada en este horario. Cambiar un turno
          solo afecta a lo que se programe después.
        </p>
        {turno && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activo (se puede programar)
            </label>
            <Campo etiqueta="Motivo del cambio">
              <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={5} required />
            </Campo>
          </>
        )}
        <MensajeError error={guardar.error} />
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" type="submit" disabled={guardar.isPending || !!error}>
            Guardar
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

function CatalogoTurnos({ esAdmin }: { esAdmin: boolean }) {
  const [editando, setEditando] = useState<TurnoCatalogo | 'nuevo'>();
  const q = useQuery({ queryKey: ['turnos'], queryFn: () => api<TurnoCatalogo[]>('/turnos') });
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center">
        <h2 className="font-semibold">Catálogo de turnos</h2>
        {esAdmin && (
          <Boton variante="primario" className="ml-auto" onClick={() => setEditando('nuevo')}>
            Nuevo turno
          </Boton>
        )}
      </div>
      <MensajeError error={q.error} />
      {q.data &&
        (q.data.length ? (
          <Tabla>
            <thead>
              <tr>
                <th>Turno</th>
                <th>Horario</th>
                <th>Horas ordinarias</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.map((t) => (
                <tr key={t.id} className={t.activo ? '' : 'text-slate-400'}>
                  <td>{t.nombre}</td>
                  <td className="tabular-nums">{textoHorario(t)}</td>
                  <td className="tabular-nums">{horas(ordinariaMin(t))}</td>
                  <td>{t.activo ? 'Activo' : 'Inactivo'}</td>
                  <td className="text-right">{esAdmin && <Boton onClick={() => setEditando(t)}>Editar</Boton>}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        ) : (
          <Vacio>Aún no hay turnos. {esAdmin ? 'Crea el primero con «Nuevo turno».' : 'Pide a un administrador que los cree.'}</Vacio>
        ))}
      {editando && <FormTurno turno={editando === 'nuevo' ? undefined : editando} onCerrar={() => setEditando(undefined)} />}
    </section>
  );
}

export function Turnos({ esAdmin }: { esAdmin: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <ProgramacionSemanal />
      <CatalogoTurnos esAdmin={esAdmin} />
    </div>
  );
}
