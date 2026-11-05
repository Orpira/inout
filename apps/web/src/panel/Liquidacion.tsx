import { CATEGORIAS, type Categoria } from '@inout/core';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { api } from '../api';
import type { DiaLiquidado, LiquidacionEmpleado } from './tipos';
import { Boton, Campo, Entrada, MensajeError, Tabla, Vacio, horas, hoyColombia, pesos } from './ui';

export const ETIQUETAS: Record<Categoria, string> = {
  ordinariaDiurna: 'Ordinaria diurna',
  ordinariaNocturna: 'Recargo nocturno',
  ordinariaDiurnaDominical: 'Dominical/festivo diurno',
  ordinariaNocturnaDominical: 'Dominical/festivo nocturno',
  extraDiurna: 'Extra diurna',
  extraNocturna: 'Extra nocturna',
  extraDiurnaDominical: 'Extra diurna dom./fest.',
  extraNocturnaDominical: 'Extra nocturna dom./fest.',
};

/** Jornada que se aplicó en el día y de dónde sale. */
function textoJornada(d: DiaLiquidado) {
  const p = d.programado;
  if (p?.tipo === 'TURNO') return `Turno ${p.horaInicio}–${p.horaFin} · ${horas(d.jornadaDiariaMin)}`;
  if (p?.tipo === 'DESCANSO') return 'Descanso programado · 0:00';
  return `${d.origenJornada === 'PACTADA' ? 'Pactada' : 'Legal'} · ${horas(d.jornadaDiariaMin)}`;
}

function avisosDia(d: DiaLiquidado) {
  const a: { texto: string; color: string }[] = [];
  if (d.ausente) a.push({ texto: 'Ausente', color: 'text-rose-700' });
  if (d.tardanzaMin > 0) a.push({ texto: `Llegó ${horas(d.tardanzaMin)} tarde`, color: 'text-amber-700' });
  if (d.salidaAnticipadaMin > 0) a.push({ texto: `Salió ${horas(d.salidaAnticipadaMin)} antes`, color: 'text-amber-700' });
  if (d.programado?.tipo === 'DESCANSO' && d.totalMin > 0) a.push({ texto: 'Trabajó en día de descanso', color: 'text-rose-700' });
  if (d.descansoPresuntoMin > 0) a.push({ texto: `Pausa no marcada: ${horas(d.descansoPresuntoMin)} descontada`, color: 'text-slate-500' });
  if (d.alertaExtrasDia) a.push({ texto: '> 2 h extra', color: 'text-rose-700' });
  return a;
}

/** Primera o segunda quincena del mes actual en Colombia. */
function quincenaActual(): [string, string] {
  const hoy = hoyColombia();
  const [a, m, d] = hoy.split('-').map(Number) as [number, number, number];
  const mes = `${a}-${String(m).padStart(2, '0')}`;
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return d <= 15 ? [`${mes}-01`, `${mes}-15`] : [`${mes}-16`, `${mes}-${ultimo}`];
}

function descargarCsv(desde: string, hasta: string, filas: LiquidacionEmpleado[]) {
  const cab = [
    'Documento',
    'Empleado',
    ...CATEGORIAS.map((c) => `${ETIQUETAS[c]} (h)`),
    'Total (h)',
    'Extras (h)',
    'Valor adicional',
    'Pendientes',
    'Ausencias',
    'Tardanzas',
    'Minutos tarde',
  ];
  const h = (min: number) => (min / 60).toFixed(2).replace('.', ',');
  const lineas = filas.map((r) => [
    r.empleado.documento,
    r.empleado.nombre,
    ...CATEGORIAS.map((c) => h(r.totales[c])),
    h(r.totalMin),
    h(r.extrasMin),
    String(r.valorAdicional),
    String(r.pendientes),
    String(r.cumplimiento.ausencias.length),
    String(r.cumplimiento.tardanzas),
    String(r.cumplimiento.tardanzaMin),
  ]);
  // Separador ';' y BOM: Excel en español lo abre bien.
  const csv = '﻿' + [cab, ...lineas].map((l) => l.map((v) => `"${v.replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `liquidacion_${desde}_${hasta}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Liquidacion() {
  const [inicial] = useState(quincenaActual);
  const [desde, setDesde] = useState(inicial[0]);
  const [hasta, setHasta] = useState(inicial[1]);
  const [abierto, setAbierto] = useState<number>();
  const q = useQuery({
    queryKey: ['liquidacion', desde, hasta],
    queryFn: () => api<{ empleados: LiquidacionEmpleado[] }>(`/liquidacion?desde=${desde}&hasta=${hasta}`),
  });
  const filas = q.data?.empleados ?? [];
  const usadas = CATEGORIAS.filter((c) => filas.some((r) => r.totales[c] > 0));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Desde">
          <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Campo>
        <Campo etiqueta="Hasta">
          <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Campo>
        <Boton className="ml-auto" disabled={!filas.length} onClick={() => descargarCsv(desde, hasta, filas)}>
          Descargar CSV
        </Boton>
      </div>
      <p className="text-xs text-slate-500">
        Horas en h:mm. El valor adicional es lo que se paga además del salario básico (recargos y extras), calculado con el salario actual
        de cada empleado y las normas vigentes en cada fecha. La jornada de cada día es la del turno programado; sin turno, la pactada o la
        legal ÷ 6. Lo que exceda esa jornada es extra. Los turnos abiertos o en revisión no se liquidan hasta corregirlos.
      </p>
      <MensajeError error={q.error} />
      {q.data &&
        (filas.length ? (
          <Tabla>
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Jornada</th>
                {usadas.map((c) => (
                  <th key={c}>{ETIQUETAS[c]}</th>
                ))}
                <th>Total</th>
                <th>Valor adicional</th>
                <th>Avisos</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <Fragment key={r.empleado.id}>
                  <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setAbierto(abierto === r.empleado.id ? undefined : r.empleado.id)}>
                    <td>
                      <span className="mr-1 text-slate-400">{abierto === r.empleado.id ? '▾' : '▸'}</span>
                      {r.empleado.nombre}
                    </td>
                    <td />
                    {usadas.map((c) => (
                      <td key={c} className="tabular-nums">
                        {horas(r.totales[c])}
                      </td>
                    ))}
                    <td className="tabular-nums font-medium">{horas(r.totalMin)}</td>
                    <td className="tabular-nums font-medium">{pesos(r.valorAdicional)}</td>
                    <td className="text-xs">
                      {r.pendientes > 0 && <div className="text-amber-700">{r.pendientes} sin cerrar</div>}
                      {r.cumplimiento.ausencias.length > 0 && <div className="text-rose-700">{r.cumplimiento.ausencias.length} ausencia(s)</div>}
                      {r.cumplimiento.tardanzas > 0 && (
                        <div className="text-amber-700">
                          {r.cumplimiento.tardanzas} tardanza(s) · {horas(r.cumplimiento.tardanzaMin)}
                        </div>
                      )}
                      {r.cumplimiento.trabajoEnDescanso.length > 0 && (
                        <div className="text-rose-700">Trabajó {r.cumplimiento.trabajoEnDescanso.length} día(s) de descanso</div>
                      )}
                      {r.alertas.dias.length > 0 && <div className="text-rose-700">&gt; 2 h extra: {r.alertas.dias.length} día(s)</div>}
                      {r.alertas.semanas.length > 0 && <div className="text-rose-700">&gt; 12 h extra/semana</div>}
                    </td>
                  </tr>
                  {abierto === r.empleado.id &&
                    r.dias.map((d) => (
                      <tr key={d.fecha} className="bg-slate-50 text-xs text-slate-600">
                        <td className="pl-8">{d.fecha}</td>
                        <td className="whitespace-nowrap">{textoJornada(d)}</td>
                        {usadas.map((c) => (
                          <td key={c} className="tabular-nums">
                            {horas(d.minutos[c])}
                          </td>
                        ))}
                        <td className="tabular-nums">{horas(d.totalMin)}</td>
                        <td className="tabular-nums">{pesos(d.valorAdicional)}</td>
                        <td>
                          {avisosDia(d).map((a) => (
                            <div key={a.texto} className={a.color}>
                              {a.texto}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </Tabla>
        ) : (
          <Vacio>Sin turnos en el periodo.</Vacio>
        ))}
    </section>
  );
}
