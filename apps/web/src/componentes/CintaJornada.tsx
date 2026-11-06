import { aHoraLocal, desdeLocal, inicioNocturno, sumarDias } from "@inout/core";

/**
 * Cinta de 24 h (06:00 → 06:00) que muestra un turno sobre las franjas diurna y nocturna.
 * La porción final correspondiente a horas extra se pinta en ámbar.
 */
interface Props {
  entrada: string;
  salida: string | null;
  minutosExtra?: number | null;
  variante?: "compacta" | "completa";
  ahora?: Date;
}

const MIN_DIA = 24 * 60;

/** Fecha de la ventana de 06:00 a 06:00 que empieza en ese día. */
function ventanaQueContiene(d: Date) {
  const l = aHoraLocal(d);
  return l.hora >= 6 ? l.fecha : sumarDias(l.fecha, -1);
}

/**
 * Ventana de 24 h (06:00 → 06:00) en la que se dibuja un turno.
 * Un turno que cruza las 06:00 (p. ej. 05:00 a 13:00) se dibuja en la ventana donde pasa más
 * tiempo; si está en curso, en la que contiene "ahora" para que se vea el marcador.
 */
export function ventanaDelTurno(ini: Date, fin: Date, abierta = false) {
  const vIni = ventanaQueContiene(ini);
  const vFin = ventanaQueContiene(fin);
  if (abierta || vIni === vFin) return abierta ? vFin : vIni;
  const corte = desdeLocal(vFin, "06:00").getTime();
  return corte - ini.getTime() >= fin.getTime() - corte ? vIni : vFin;
}

export function CintaJornada({ entrada, salida, minutosExtra, variante = "completa", ahora = new Date() }: Props) {
  const ini = new Date(entrada);
  const fin = salida ? new Date(salida) : ahora;
  const fechaVentana = ventanaDelTurno(ini, fin, !salida);
  const origen = desdeLocal(fechaVentana, "06:00").getTime();
  const nocheDesde = inicioNocturno(fechaVentana) - 6 * 60; // minutos desde las 06:00

  const pos = (d: Date) => Math.max(0, Math.min(MIN_DIA, (d.getTime() - origen) / 60_000));
  const a = pos(ini);
  const b = pos(fin);
  const extra = Math.min(minutosExtra ?? 0, b - a);
  const pct = (m: number) => `${(m / MIN_DIA) * 100}%`;
  const abierta = !salida;
  const compacta = variante === "compacta";
  const etiquetaNoche = `${String(inicioNocturno(fechaVentana) / 60).padStart(2, "0")}`;

  return (
    <div className={compacta ? "w-full" : "w-full pt-1"}>
      <div
        className={`relative w-full overflow-hidden ${compacta ? "h-2.5 rounded-full" : "h-7 rounded-md"}`}
        role="img"
        aria-label={`Turno de ${minutosTexto(b - a)}${extra ? `, ${minutosTexto(extra)} extra` : ""}${abierta ? ", en curso" : ""}`}
      >
        <div className="absolute inset-y-0 left-0 bg-dia" style={{ width: pct(nocheDesde) }} />
        <div className="absolute inset-y-0 right-0 bg-noche-claro" style={{ left: pct(nocheDesde) }} />
        {!compacta &&
          [6, 12, 18].map((h) => (
            <div key={h} className="absolute inset-y-0 w-px bg-white/70" style={{ left: pct(h * 60) }} />
          ))}
        <div
          className={`absolute ${compacta ? "inset-y-0" : "inset-y-1.5 rounded-sm"} bg-petroleo`}
          style={{ left: pct(a), width: pct(Math.max(b - a - extra, 0.5)) }}
        />
        {extra > 0 && (
          <div
            className={`absolute ${compacta ? "inset-y-0" : "inset-y-1.5 rounded-r-sm"} bg-extra`}
            style={{ left: pct(b - extra), width: pct(extra) }}
          />
        )}
        {abierta && (
          <div
            className={`absolute ${compacta ? "inset-y-0" : "inset-y-0.5"} w-0.5 bg-petroleo animate-pulse`}
            style={{ left: pct(b) }}
          />
        )}
      </div>
      {!compacta && (
        <div className="relative mt-1 h-4 text-[0.72rem] text-tinta-tenue tabular-nums">
          {[
            [0, "06"],
            [6 * 60, "12"],
            [nocheDesde, etiquetaNoche],
            [18 * 60, "00"],
          ].map(([m, t]) => (
            <span key={String(t)} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: pct(Number(m)) }}>
              {t}
            </span>
          ))}
          <span className="absolute right-0">06</span>
        </div>
      )}
    </div>
  );
}

function minutosTexto(m: number) {
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return h ? `${h} h ${mm} min` : `${mm} min`;
}

export function LeyendaCinta() {
  const item = (clase: string, texto: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-4 rounded-sm ${clase}`} />
      {texto}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8rem] text-tinta-suave">
      {item("bg-dia border border-linea", "Franja diurna")}
      {item("bg-noche-claro border border-linea", "Franja nocturna")}
      {item("bg-petroleo", "Jornada ordinaria")}
      {item("bg-extra", "Horas extra")}
    </div>
  );
}
