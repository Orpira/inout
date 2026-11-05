import { describe, expect, it } from "vitest";
import {
  crearCalendario,
  desdeLocal,
  divisorMensual,
  domingoDePascua,
  festivosColombia,
  inicioNocturno,
  liquidar,
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
