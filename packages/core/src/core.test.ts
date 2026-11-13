import { describe, expect, it } from "vitest";
import {
  crearCalendario,
  desdeLocal,
  divisorMensual,
  domingoDePascua,
  festivosColombia,
  inicioNocturno,
  liquidar,
  minutosHorarioFijo,
  minutosOrdinariosHorario,
  validarHorario,
  horarioLegalPorDefecto,
  salidaProgramada,
  type Horario,
  recargoDominical,
  type Categoria,
} from "./index.js";

const cal = crearCalendario();
const minutos = (r: ReturnType<typeof liquidar>, c: Categoria) =>
  r.lineas.filter((l) => l.categoria === c).reduce((s, l) => s + l.minutos, 0);

describe("festivos de Colombia", () => {
  it("calcula la Pascua", () => {
    expect(domingoDePascua(2024)).toBe("2024-03-31");
    expect(domingoDePascua(2025)).toBe("2025-04-20");
    expect(domingoDePascua(2026)).toBe("2026-04-05");
  });

  it("genera los 19 festivos de 2026 (incluye Ley 2578 de 2026)", () => {
    expect(festivosColombia(2026).map((f) => f.fecha)).toEqual([
      "2026-01-01",
      "2026-01-12",
      "2026-03-23",
      "2026-04-02",
      "2026-04-03",
      "2026-05-01",
      "2026-05-18",
      "2026-06-08",
      "2026-06-15",
      "2026-06-29",
      "2026-07-13",
      "2026-07-20",
      "2026-08-07",
      "2026-08-17",
      "2026-10-12",
      "2026-11-02",
      "2026-11-16",
      "2026-12-08",
      "2026-12-25",
    ]);
  });

  it("no incluye el 9 de julio antes de 2026 ni marca domingos como festivos", () => {
    expect(festivosColombia(2025)).toHaveLength(18);
    expect(cal.esFestivo("2026-11-08")).toBe(false); // domingo cualquiera
  });

  it("admite ajustes manuales", () => {
    const c = crearCalendario([
      { fecha: "2026-07-13", tipo: "QUITAR" },
      { fecha: "2026-03-10", tipo: "AGREGAR", descripcion: "Día cívico" },
    ]);
    expect(c.esFestivo("2026-07-13")).toBe(false);
    expect(c.nombre("2026-03-10")).toBe("Día cívico");
  });
});

describe("parámetros legales por vigencia", () => {
  it("divisor mensual según la Ley 2101", () => {
    expect(divisorMensual("2023-01-10")).toBe(240);
    expect(divisorMensual("2025-07-14")).toBe(230);
    expect(divisorMensual("2025-07-15")).toBe(220);
    expect(divisorMensual("2026-07-14")).toBe(220);
    expect(divisorMensual("2026-07-15")).toBe(210);
  });

  it("jornada nocturna desde las 19:00 a partir del 25-dic-2025", () => {
    expect(inicioNocturno("2025-12-24")).toBe(21 * 60);
    expect(inicioNocturno("2025-12-25")).toBe(19 * 60);
  });

  it("recargo dominical progresivo (Ley 2466)", () => {
    expect(recargoDominical("2025-06-30")).toBe(0.75);
    expect(recargoDominical("2025-07-01")).toBe(0.8);
    expect(recargoDominical("2026-07-01")).toBe(0.9);
    expect(recargoDominical("2027-07-01")).toBe(1);
  });
});

describe("motor de liquidación", () => {
  // 2.100.000 / 210 = 10.000 por hora (vigencia desde 15-jul-2026)
  const salario = 2_100_000;
  const base = { salarioMensual: salario, calendario: cal };

  it("jornada ordinaria diurna sin recargos", () => {
    const r = liquidar({ ...base, entrada: desdeLocal("2026-11-05", "08:00"), salida: desdeLocal("2026-11-05", "15:00") });
    expect(r.valorHora).toBe(10_000);
    expect(r.minutosOrdinariosDia).toBe(420);
    expect(minutos(r, "ORD_DIURNA")).toBe(420);
    expect(r.valorTotal).toBe(0);
  });

  it("horas extra diurnas y alerta por exceder 2 h", () => {
    const r = liquidar({ ...base, entrada: desdeLocal("2026-11-05", "08:00"), salida: desdeLocal("2026-11-05", "18:00") });
    expect(minutos(r, "EXT_DIURNA")).toBe(180);
    expect(r.valorTotal).toBe(37_500);
    expect(r.alertas.length).toBe(1);
  });

  it("extra que entra a la franja nocturna (19:00)", () => {
    const r = liquidar({ ...base, entrada: desdeLocal("2026-11-05", "12:00"), salida: desdeLocal("2026-11-05", "21:00") });
    expect(minutos(r, "ORD_DIURNA")).toBe(420);
    expect(minutos(r, "EXT_NOCTURNA")).toBe(120);
    expect(r.valorTotal).toBe(35_000); // 2 h × 10.000 × 1,75
  });

  it("turno nocturno que cruza la medianoche", () => {
    const r = liquidar({ ...base, entrada: desdeLocal("2026-11-05", "22:00"), salida: desdeLocal("2026-11-06", "05:00") });
    expect(minutos(r, "ORD_NOCTURNA")).toBe(420);
    expect(r.valorTotal).toBe(24_500);
  });

  it("domingo diurno con recargo del 90 %", () => {
    const r = liquidar({ ...base, entrada: desdeLocal("2026-11-08", "08:00"), salida: desdeLocal("2026-11-08", "15:00") });
    expect(minutos(r, "ORD_DIURNA_DF")).toBe(420);
    expect(r.valorTotal).toBe(63_000);
  });

  it("noche de sábado a domingo divide la categoría en la medianoche", () => {
    const r = liquidar({ ...base, entrada: desdeLocal("2026-11-07", "20:00"), salida: desdeLocal("2026-11-08", "03:00") });
    expect(minutos(r, "ORD_NOCTURNA")).toBe(240);
    expect(minutos(r, "ORD_NOCTURNA_DF")).toBe(180);
    expect(r.valorTotal).toBe(14_000 + 37_500);
  });

  it("festivo (lunes 16-nov-2026) con extras nocturnas festivas", () => {
    const r = liquidar({ ...base, entrada: desdeLocal("2026-11-16", "12:00"), salida: desdeLocal("2026-11-16", "20:00") });
    expect(minutos(r, "ORD_DIURNA_DF")).toBe(420);
    expect(minutos(r, "EXT_NOCTURNA_DF")).toBe(60);
    // 7 × 10.000 × 0,9 + 1 × 10.000 × (1 + 0,9 + 0,75)
    expect(r.valorTotal).toBe(63_000 + 26_500);
  });

  it("considera minutos ya trabajados en el mismo día", () => {
    const r = liquidar({
      ...base,
      entrada: desdeLocal("2026-11-05", "16:00"),
      salida: desdeLocal("2026-11-05", "17:00"),
      minutosPreviosDia: 400,
    });
    expect(minutos(r, "ORD_DIURNA")).toBe(20);
    expect(minutos(r, "EXT_DIURNA")).toBe(40);
  });

  it("respeta la jornada pactada por empleado", () => {
    const r = liquidar({
      ...base,
      entrada: desdeLocal("2026-11-05", "08:00"),
      salida: desdeLocal("2026-11-05", "17:00"),
      minutosOrdinariosDia: 8 * 60,
    });
    expect(minutos(r, "EXT_DIURNA")).toBe(60);
  });

  it("aplica normas anteriores en fechas antiguas (nocturno 21:00, divisor 220)", () => {
    const r = liquidar({
      salarioMensual: 2_200_000,
      calendario: cal,
      entrada: desdeLocal("2025-12-01", "13:00"),
      salida: desdeLocal("2025-12-01", "20:00"),
    });
    expect(r.valorHora).toBe(10_000);
    expect(minutos(r, "ORD_NOCTURNA")).toBe(0);
  });

  it("rechaza salidas anteriores a la entrada", () => {
    expect(() =>
      liquidar({ ...base, entrada: desdeLocal("2026-11-05", "10:00"), salida: desdeLocal("2026-11-05", "09:00") }),
    ).toThrow();
  });
});

describe("salida programada de un turno sin salida", () => {
  const dias = (d: (i: number) => object) => Array.from({ length: 7 }, (_, i) => d(i)) as Horario["dias"];
  const fijo: Horario = {
    tipo: "FIJO",
    dias: dias((i) => (i >= 1 && i <= 5 ? { laborable: true, minutos: 480, inicio: "08:00", fin: "17:00" } : { laborable: false, minutos: 0 })),
    descanso: { tipo: "VENTANA", inicio: "12:00", fin: "13:00" },
    toleranciaMinutos: 0,
    requiereAprobacion: false,
  };
  const turnos: Horario = {
    tipo: "TURNOS",
    dias: dias((i) => ({ laborable: i !== 0, minutos: i === 0 ? 0 : 420 })),
    descanso: { tipo: "DURACION", minutos: 30, despuesDe: 300 },
    toleranciaMinutos: 0,
    requiereAprobacion: false,
  };
  // 2026-11-09 es lunes; 2026-11-08, domingo
  it("horario fijo: la hora de salida del día, aunque haya llegado tarde", () => {
    expect(salidaProgramada(fijo, desdeLocal("2026-11-09", "07:50"))).toEqual(desdeLocal("2026-11-09", "17:00"));
    expect(salidaProgramada(fijo, desdeLocal("2026-11-09", "10:30"))).toEqual(desdeLocal("2026-11-09", "17:00"));
  });
  it("turnos: entrada más la jornada del día y el descanso", () => {
    expect(salidaProgramada(turnos, desdeLocal("2026-11-09", "06:00"))).toEqual(desdeLocal("2026-11-09", "13:30"));
    expect(salidaProgramada(horarioLegalPorDefecto("2026-11-09"), desdeLocal("2026-11-09", "22:00"))).toEqual(desdeLocal("2026-11-10", "05:00"));
  });
  it("sin referencia: día no laborable o entrada después de la salida del horario", () => {
    expect(salidaProgramada(fijo, desdeLocal("2026-11-08", "08:00"))).toBeNull();
    expect(salidaProgramada(turnos, desdeLocal("2026-11-08", "08:00"))).toBeNull();
    expect(salidaProgramada(fijo, desdeLocal("2026-11-09", "18:00"))).toBeNull();
  });
});

describe("horarios: administrativo fijo y operativo de bodega", () => {
  const cal2 = crearCalendario();
  const base = { salarioMensual: 2_100_000, calendario: cal2 };
  const almuerzo = { tipo: "VENTANA" as const, inicio: "12:00", fin: "13:00" };
  const dia = (inicio: string, fin: string) => ({ laborable: true, inicio, fin, minutos: minutosHorarioFijo(inicio, fin, almuerzo) });
  const administrativo: Horario = {
    tipo: "FIJO",
    dias: [
      { laborable: false, minutos: 0 },
      dia("08:00", "17:00"),
      dia("08:00", "17:00"),
      dia("08:00", "17:00"),
      dia("08:00", "17:00"),
      dia("08:00", "17:00"),
      { laborable: false, minutos: 0 },
    ],
    descanso: almuerzo,
    toleranciaMinutos: 15,
    requiereAprobacion: true,
  };

  it("deriva 8 h diarias de 08:00 a 17:00 con almuerzo de 12:00 a 13:00", () => {
    expect(minutosHorarioFijo("08:00", "17:00", almuerzo)).toBe(480);
    expect(minutosOrdinariosHorario(administrativo, 4)).toBe(480);
    expect(minutosOrdinariosHorario(administrativo, 6)).toBe(0);
    expect(validarHorario(administrativo, "2026-11-05").errores).toEqual([]);
  });

  it("valida la Ley 2101: máximo 9 h diarias, total semanal y día de descanso", () => {
    const largo = { ...administrativo, dias: administrativo.dias.map((d) => (d.laborable ? { ...d, minutos: 600 } : d)) };
    expect(validarHorario(largo, "2026-11-05").errores.join(" ")).toMatch(/9 horas/);
    const seisDias = { ...administrativo, dias: administrativo.dias.map((d, i) => (i === 0 ? d : { ...d, laborable: true, minutos: 480 })) };
    expect(validarHorario(seisDias, "2026-11-05").errores.join(" ")).toMatch(/42 h/);
    const sieteDias = { ...administrativo, dias: administrativo.dias.map(() => ({ laborable: true, minutos: 300 })) };
    expect(validarHorario(sieteDias, "2026-11-05").errores.join(" ")).toMatch(/descanso/);
  });

  it("descuenta el almuerzo y deja las extras pendientes sin liquidar", () => {
    const r = liquidar({
      ...base,
      entrada: desdeLocal("2026-11-05", "07:50"),
      salida: desdeLocal("2026-11-05", "17:40"),
      minutosOrdinariosDia: 480,
      descanso: almuerzo,
      maxMinutosExtra: 0,
    });
    expect(r.minutosPresencia).toBe(590);
    expect(r.minutosDescanso).toBe(60);
    expect(r.minutosExtraCalculados).toBe(50);
    expect(r.minutosExtraNoReconocidos).toBe(50);
    expect(r.minutosTotales).toBe(480);
    expect(r.valorTotal).toBe(0);
  });

  it("liquida solo las extras aprobadas", () => {
    const r = liquidar({
      ...base,
      entrada: desdeLocal("2026-11-05", "08:00"),
      salida: desdeLocal("2026-11-05", "19:00"),
      minutosOrdinariosDia: 480,
      descanso: almuerzo,
      maxMinutosExtra: 60,
    });
    expect(r.minutosExtraCalculados).toBe(120);
    expect(minutos(r, "EXT_DIURNA")).toBe(60);
    expect(r.valorTotal).toBe(12_500);
  });

  it("el sábado de un administrativo es todo hora extra", () => {
    const r = liquidar({
      ...base,
      entrada: desdeLocal("2026-11-07", "08:00"),
      salida: desdeLocal("2026-11-07", "12:00"),
      minutosOrdinariosDia: minutosOrdinariosHorario(administrativo, 6),
    });
    expect(minutos(r, "EXT_DIURNA")).toBe(240);
    expect(r.valorTotal).toBe(50_000);
  });

  it("bodega: pausa de 30 min tras 4 h y extras desde la hora 7", () => {
    const pausa = { tipo: "DURACION" as const, minutos: 30, despuesDe: 240 };
    const r = liquidar({
      ...base,
      entrada: desdeLocal("2026-11-05", "06:00"),
      salida: desdeLocal("2026-11-05", "15:00"),
      minutosOrdinariosDia: 420,
      descanso: pausa,
    });
    expect(r.minutosDescanso).toBe(30);
    expect(minutos(r, "ORD_DIURNA")).toBe(420);
    expect(minutos(r, "EXT_DIURNA")).toBe(90);

    // Si sale antes de cumplir la pausa, no se descuenta.
    const corto = liquidar({ ...base, entrada: desdeLocal("2026-11-05", "06:00"), salida: desdeLocal("2026-11-05", "10:10"), minutosOrdinariosDia: 420, descanso: pausa });
    expect(corto.minutosDescanso).toBe(0);
  });

  it("bodega: turno de noche que se alarga hasta el amanecer", () => {
    const r = liquidar({
      ...base,
      entrada: desdeLocal("2026-11-05", "22:00"),
      salida: desdeLocal("2026-11-06", "08:00"),
      minutosOrdinariosDia: 420,
    });
    expect(minutos(r, "ORD_NOCTURNA")).toBe(420);
    expect(minutos(r, "EXT_NOCTURNA")).toBe(60); // 05:00-06:00
    expect(minutos(r, "EXT_DIURNA")).toBe(120); // 06:00-08:00
    expect(r.alertas.join(" ")).toMatch(/2 horas extra/);
  });
});
