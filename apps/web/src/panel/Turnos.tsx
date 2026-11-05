import { type HorarioTurno, parametrosEn, validarHorario, validarSemanaTipo, ventanasTurno } from '@inout/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, Fragment, useState } from 'react';
import { api } from '../api';
import { DIAS_SEMANA } from './Empleados';
import type { Empleado, TurnoCatalogo, VersionHorario } from './tipos';
import { Boton, Campo, Entrada, MensajeError, Modal, Selector, Tabla, Vacio, horas, hoyColombia } from './ui';

const ordinariaMin = (h: HorarioTurno) => (validarHorario(h) ? 0 : ventanasTurno('2026-01-05', h).ordinariaMin);
const textoHorario = (h: HorarioTurno) =>
  `${h.horaInicio}–${h.horaFin}${h.descansoInicio ? ` (descanso ${h.descansoInicio}–${h.descansoFin})` : ''}`;
const totalSemana = (semana: (HorarioTurno | null)[]) => semana.reduce((s, h) => s + (h ? ordinariaMin(h) : 0), 0);

/** Orden de presentación: lunes a domingo (índices de la semana con 0 = domingo). */
const ORDEN = [1, 2, 3, 4, 5, 6, 0];
const CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Versión vigente en una fecha (la última con vigenteDesde <= fecha). */
const vigenteEn = (versiones: VersionHorario[], fecha: string) => versiones.filter((v) => v.vigenteDesde <= fecha).at(-1);

// ---------------------------------------------------------------------------
// Horarios fijos de los empleados
// ---------------------------------------------------------------------------

type Celda = number | 'DESCANSO';

function FormHorario({ empleado, actual, onCerrar }: { empleado: Empleado; actual?: VersionHorario; onCerrar: () => void }) {
  const qc = useQueryClient();
  const hoy = hoyColombia();
  const turnos = useQuery({ queryKey: ['turnos'], queryFn: () => api<TurnoCatalogo[]>('/turnos') });
  const activos = (turnos.data ?? []).filter((t) => t.activo);
  const [semana, setSemana] = useState<Celda[]>(() => (actual ? actual.semana.map((d) => d?.turnoId ?? 'DESCANSO') : Array(7).fill('DESCANSO')));
  const [desde, setDesde] = useState(hoy);
  const [motivo, setMotivo] = useState('');
  const [rapido, setRapido] = useState('');
  const [avisos, setAvisos] = useState<string[]>();

  const horarioDe = (c: Celda) => (c === 'DESCANSO' ? null : (activos.find((t) => t.id === c) ?? null));
  const horariosSemana = semana.map(horarioDe);
  const validacion = validarSemanaTipo(horariosSemana, desde || hoy);
  const turnoInactivo = semana.some((c) => c !== 'DESCANSO' && !activos.some((t) => t.id === c));
  const pasado = desde < hoy;

  const rellenar = (dias: number[]) => {
    if (!rapido) return;
    setSemana(semana.map((_, i) => (dias.includes(i) ? Number(rapido) : 'DESCANSO')));
  };

  const guardar = useMutation({
    mutationFn: () =>
      api<{ avisos: string[] }>('/horarios', {
        method: 'POST',
        body: JSON.stringify({ empleadoId: empleado.id, vigenteDesde: desde, semana, motivo: motivo || undefined }),
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['horarios'] });
      qc.invalidateQueries({ queryKey: ['liquidacion'] });
      if (r.avisos.length) setAvisos(r.avisos);
      else onCerrar();
    },
  });

  if (avisos)
    return (
      <Modal titulo="Horario guardado" onCerrar={onCerrar}>
        <ul className="rounded bg-amber-50 p-2 text-sm text-amber-800">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Boton variante="primario" onClick={onCerrar}>
            Entendido
          </Boton>
        </div>
      </Modal>
    );

  return (
    <Modal titulo={`Horario fijo · ${empleado.nombre}`} onCerrar={onCerrar}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <div className="flex flex-wrap items-end gap-2 rounded bg-slate-50 p-2">
          <Campo etiqueta="Rellenar rápido con">
            <Selector value={rapido} onChange={(e) => setRapido(e.target.value)}>
              <option value="">Elegir turno…</option>
              {activos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre} · {textoHorario(t)}
                </option>
              ))}
            </Selector>
          </Campo>
          <Boton disabled={!rapido} onClick={() => rellenar([1, 2, 3, 4, 5])}>
            Lunes a viernes
          </Boton>
          <Boton disabled={!rapido} onClick={() => rellenar([1, 2, 3, 4, 5, 6])}>
            Lunes a sábado
          </Boton>
        </div>
        <div className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-1.5">
          {ORDEN.map((i) => (
            <Fragment key={i}>
              <span className={`text-sm ${i === empleado.diaDescanso ? 'font-semibold' : ''}`}>
                {DIAS_SEMANA[i]}
                {i === empleado.diaDescanso && <span className="block text-xs font-normal text-slate-500">desc. obligatorio</span>}
              </span>
              <Selector
                value={String(semana[i])}
                onChange={(e) => setSemana(semana.map((c, k) => (k === i ? (e.target.value === 'DESCANSO' ? 'DESCANSO' : Number(e.target.value)) : c)))}
              >
                <option value="DESCANSO">Descanso</option>
                {activos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} · {textoHorario(t)}
                  </option>
                ))}
              </Selector>
            </Fragment>
          ))}
        </div>
        <p className="text-sm">
          Total: <b>{horas(totalSemana(horariosSemana))}</b> h ordinarias por semana (máximo legal {parametrosEn(desde || hoy).jornadaSemanalHoras} h).
        </p>
        {turnoInactivo && <p className="text-sm text-rose-700">Hay días con un turno inactivo: elige otro.</p>}
        {validacion.errores.length > 0 && <MensajeError error={new Error(validacion.errores.join('\n'))} />}
        {validacion.avisos.length > 0 && (
          <ul className="rounded bg-amber-50 p-2 text-xs text-amber-800">
            {[...new Set(validacion.avisos)].map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Rige desde">
            <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} required />
          </Campo>
          <Campo etiqueta={pasado ? 'Motivo (fecha pasada: cambia liquidaciones)' : 'Motivo (opcional)'}>
            <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={5} required={pasado} />
          </Campo>
        </div>
        <p className="text-xs text-slate-500">
          Los días anteriores a esa fecha se siguen liquidando con el horario que tenían. Las horas trabajadas por encima del turno son extras; un
          día de descanso trabajado es todo extra.
        </p>
        <MensajeError error={guardar.error} />
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" type="submit" disabled={guardar.isPending || validacion.errores.length > 0 || turnoInactivo}>
            Guardar horario
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

function Historial({ versiones, esAdmin }: { versiones: VersionHorario[]; esAdmin: boolean }) {
  const qc = useQueryClient();
  const borrar = useMutation({
    mutationFn: ({ v, motivo }: { v: VersionHorario; motivo: string }) =>
      api(`/horarios/${v.empleadoId}/${v.vigenteDesde}`, { method: 'DELETE', body: JSON.stringify({ motivo }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['horarios'] });
      qc.invalidateQueries({ queryKey: ['liquidacion'] });
    },
  });
  return (
    <div className="flex flex-col gap-1 text-xs">
      <MensajeError error={borrar.error} />
      {[...versiones].reverse().map((v) => (
        <div key={v.vigenteDesde} className="flex items-center gap-2">
          <span className="w-28 tabular-nums">Desde {v.vigenteDesde}</span>
          <span className="text-slate-600">
            {ORDEN.map((i) => `${CORTO[i]} ${v.semana[i]?.nombre ?? '—'}`).join(' · ')} · {horas(totalSemana(v.semana))} h
          </span>
          {esAdmin && (
            <button
              type="button"
              className="ml-auto text-rose-700 hover:underline"
              onClick={() => {
                const motivo = prompt(`Motivo para eliminar el horario vigente desde ${v.vigenteDesde}:`);
                if (motivo) borrar.mutate({ v, motivo });
              }}
            >
              Eliminar
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function HorariosEmpleados({ esAdmin }: { esAdmin: boolean }) {
  const hoy = hoyColombia();
  const [editando, setEditando] = useState<Empleado>();
  const [abierto, setAbierto] = useState<number>();
  const empleados = useQuery({ queryKey: ['empleados'], queryFn: () => api<Empleado[]>('/empleados') });
  const versiones = useQuery({ queryKey: ['horarios'], queryFn: () => api<VersionHorario[]>('/horarios') });
  const activos = (empleados.data ?? []).filter((e) => e.activo);
  const maxMin = parametrosEn(hoy).jornadaSemanalHoras * 60;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Horario fijo de cada empleado</h2>
      <p className="text-xs text-slate-500">
        Cada empleado tiene un turno por día de la semana. Se asigna una vez y se cambia solo cuando haga falta, indicando desde qué fecha rige.
        Sin horario se aplica la jornada pactada o la legal ÷ 6. Máximo legal hoy: {maxMin / 60} h ordinarias por semana.
      </p>
      <MensajeError error={empleados.error ?? versiones.error} />
      {activos.length === 0 ? (
        <Vacio>No hay empleados activos.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Empleado</th>
              {ORDEN.map((i) => (
                <th key={i}>{CORTO[i]}</th>
              ))}
              <th>Horas</th>
              <th>Rige desde</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {activos.map((e) => {
              const propias = (versiones.data ?? []).filter((v) => v.empleadoId === e.id);
              const actual = vigenteEn(propias, hoy);
              const futura = propias.find((v) => v.vigenteDesde > hoy);
              return (
                <Fragment key={e.id}>
                  <tr>
                    <td className="whitespace-nowrap">
                      {propias.length > 0 ? (
                        <button type="button" className="text-left" onClick={() => setAbierto(abierto === e.id ? undefined : e.id)}>
                          <span className="mr-1 text-slate-400">{abierto === e.id ? '▾' : '▸'}</span>
                          {e.nombre}
                        </button>
                      ) : (
                        e.nombre
                      )}
                    </td>
                    {actual ? (
                      ORDEN.map((i) => {
                        const d = actual.semana[i];
                        return (
                          <td key={i} className={`whitespace-nowrap text-xs ${d ? '' : 'text-sky-700'}`} title={d ? textoHorario(d) : undefined}>
                            {d ? d.nombre : 'Descanso'}
                          </td>
                        );
                      })
                    ) : (
                      <td colSpan={7} className="text-xs text-slate-400">
                        Sin horario fijo ({e.jornadaPactadaMin ? `pactada ${horas(e.jornadaPactadaMin)}` : 'jornada legal ÷ 6'})
                      </td>
                    )}
                    <td className="whitespace-nowrap tabular-nums">{actual ? horas(totalSemana(actual.semana)) : '—'}</td>
                    <td className="whitespace-nowrap text-xs tabular-nums">
                      {actual?.vigenteDesde ?? '—'}
                      {futura && <div className="text-amber-700">cambia el {futura.vigenteDesde}</div>}
                    </td>
                    <td className="text-right">
                      {esAdmin && <Boton onClick={() => setEditando(e)}>{propias.length ? 'Cambiar' : 'Asignar'}</Boton>}
                    </td>
                  </tr>
                  {abierto === e.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={11} className="pl-8">
                        <Historial versiones={propias} esAdmin={esAdmin} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </Tabla>
      )}
      {editando && (
        <FormHorario
          empleado={editando}
          actual={(versiones.data ?? []).filter((v) => v.empleadoId === editando.id).at(-1)}
          onCerrar={() => setEditando(undefined)}
        />
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
          solo afecta a los horarios que se asignen después.
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
      <HorariosEmpleados esAdmin={esAdmin} />
      <CatalogoTurnos esAdmin={esAdmin} />
    </div>
  );
}
