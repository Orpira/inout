import axios from "axios";

/* ──────────────────────────────────────────
   Tipos
   ────────────────────────────────────────── */

interface EmpleadoData {
    id: number;
    nombre: string;
    apellido: string;
    identificacion: string;
    cargo?: string;
}

interface RegistroResponse {
    message?: string;
    empleado?: string;
    hora_entrada?: string;
    hora_salida?: string;
    fecha?: string;
    error?: string;
}

interface HistorialEntry {
    empleado: string;
    tipo: string;
    hora: string;
    fecha: string;
}

declare global {
    interface Window {
        Quagga?: any;
    }
}

/* ──────────────────────────────────────────
   Elementos del DOM
   ────────────────────────────────────────── */

function el<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

/* ──────────────────────────────────────────
   Módulo principal
   ────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
    const csrfToken =
        (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)
            ?.content ?? "";
    const config = window.configAsistencia;

    // Elementos
    const codigoManual = el<HTMLInputElement>("codigo-manual");
    const btnEscanear = el<HTMLButtonElement>("btn-escanear");
    const btnConfirmar = el<HTMLButtonElement>("btn-confirmar");
    const estadoTexto = el<HTMLHeadingElement>("estado-texto");
    const empleadoInfo = el<HTMLDivElement>("empleado-info");
    const nombreEmpleado = el<HTMLHeadingElement>("nombre-empleado");
    const horaRegistro = el<HTMLParagraphElement>("hora-registro");
    const historialBox = el<HTMLDivElement>("historial");
    const tarjetaEstado = el<HTMLDivElement>("tarjeta-estado");
    const accionesEmpleado = el<HTMLDivElement>("acciones-empleado");
    const marcarEntradaBtn = el<HTMLButtonElement>("marcar-entrada-btn");
    const marcarSalidaBtn = el<HTMLButtonElement>("marcar-salida-btn");
    const scannerOverlay = el<HTMLDivElement>("scanner-overlay");
    const videoElement = el<HTMLVideoElement>("scanner");
    const notificaciones = el<HTMLDivElement>("notificaciones");

    let scannerActivo = false;
    let empleadoActual: EmpleadoData | null = null;
    let _modoEntrada = true;

    /* ── Notificaciones ─────────────────── */

    const mostrarNotificacion = (
        mensaje: string,
        tipo: "info" | "success" | "warning" | "danger" = "info",
    ): void => {
        const alerta = document.createElement("div");
        alerta.className = `alert alert-${tipo}`;
        alerta.innerHTML = `${mensaje}<button type="button" aria-label="Cerrar">×</button>`;
        alerta
            .querySelector("button")!
            .addEventListener("click", () => alerta.remove());
        notificaciones.prepend(alerta);
        setTimeout(() => alerta.remove(), 5000);
    };

    /* ── Estado visual ───────────────────── */

    const actualizarEstado = (
        texto: string,
        clase: "" | "entrada" | "salida" = "",
    ): void => {
        estadoTexto.textContent = texto;
        tarjetaEstado.classList.remove("entrada", "salida");
        if (clase) tarjetaEstado.classList.add(clase);
    };

    /* ── Historial ───────────────────────── */

    const agregarAlHistorial = (registro: HistorialEntry): void => {
        const vacio = historialBox.querySelector(".muted");
        vacio?.remove();

        const item = document.createElement("div");
        item.className = "history-item";
        item.innerHTML = `<strong>${registro.empleado}</strong><br>${registro.tipo} · ${registro.hora} · ${registro.fecha}`;
        historialBox.prepend(item);

        while (historialBox.children.length > 8) {
            historialBox.removeChild(historialBox.lastChild!);
        }
    };

    /* ── Escáner de código de barras ─────── */

    const inicializarEscaner = (): void => {
        if (scannerActivo || !window.Quagga) return;

        window.Quagga.init(
            {
                inputStream: {
                    name: "Live",
                    type: "LiveStream",
                    target: videoElement,
                    constraints: {
                        width: 480,
                        height: 280,
                        facingMode: "environment",
                    },
                },
                decoder: {
                    readers: [
                        "code_128_reader",
                        "ean_reader",
                        "code_39_reader",
                        "upc_reader",
                    ],
                },
            },
            (err: Error | null) => {
                if (err) {
                    mostrarNotificacion(
                        "No se pudo activar la cámara. Usa ingreso manual.",
                        "warning",
                    );
                    return;
                }
                scannerActivo = true;
                videoElement.style.display = "block";
                scannerOverlay.style.display = "none";
                window.Quagga!.start();
            },
        );

        window.Quagga.offDetected();
        window.Quagga.onDetected((result: any) => {
            if (!result?.codeResult?.code) return;
            codigoManual.value = result.codeResult.code;
            detenerEscaner();
            verificarEmpleado(result.codeResult.code);
        });
    };

    const detenerEscaner = (): void => {
        if (scannerActivo && window.Quagga) {
            window.Quagga.stop();
            scannerActivo = false;
        }
        videoElement.style.display = "none";
        scannerOverlay.style.display = "flex";
    };

    /* ── Verificar empleado ──────────────── */

    const verificarEmpleado = async (codigo: string): Promise<void> => {
        try {
            actualizarEstado("Verificando empleado...");
            empleadoInfo.style.display = "none";
            accionesEmpleado.style.display = "none";
            btnConfirmar.disabled = true;

            const { data } = await axios.get<EmpleadoData>(
                `${config.urls.buscar_empleado!}/${encodeURIComponent(codigo)}`,
                { headers: { Accept: "application/json" } },
            );

            empleadoActual = data;
            nombreEmpleado.textContent = `${data.nombre} ${data.apellido}`;
            horaRegistro.textContent = `Código ${data.identificacion} · Cargo: ${data.cargo ?? "No definido"}`;
            empleadoInfo.style.display = "block";
            accionesEmpleado.style.display = "block";
            btnConfirmar.disabled = false;
            actualizarEstado(
                "Empleado encontrado, selecciona acción",
                "entrada",
            );
        } catch (error: any) {
            const mensaje =
                error.response?.data?.error ??
                "No fue posible validar el código";
            mostrarNotificacion(mensaje, "danger");
            actualizarEstado("Empleado no encontrado");
            empleadoActual = null;
        }
    };

    /* ── Registrar asistencia ────────────── */

    const registrarAsistencia = async (): Promise<void> => {
        if (!empleadoActual) {
            mostrarNotificacion("Primero valida un empleado.", "warning");
            return;
        }

        try {
            btnConfirmar.disabled = true;
            actualizarEstado("Registrando asistencia...");

            const { data } = await axios.post<RegistroResponse>(
                config.urls.marcar_asistencia!,
                { empleado_id: empleadoActual.id },
                {
                    headers: {
                        "X-CSRF-TOKEN": csrfToken,
                        Accept: "application/json",
                        "Content-Type": "application/json",
                    },
                },
            );

            const tipo = data.hora_salida ? "Salida" : "Entrada";
            const hora = data.hora_salida ?? data.hora_entrada ?? "--:--:--";
            const fecha = data.fecha ?? new Date().toISOString().slice(0, 10);

            mostrarNotificacion(
                data.message ?? "Registro guardado correctamente",
                "success",
            );
            actualizarEstado(
                `${tipo} registrada con éxito`,
                tipo === "Entrada" ? "entrada" : "salida",
            );
            agregarAlHistorial({
                empleado:
                    data.empleado ??
                    `${empleadoActual.nombre} ${empleadoActual.apellido}`,
                tipo,
                hora,
                fecha,
            });

            codigoManual.value = "";
            codigoManual.focus();
        } catch (error: any) {
            const msg =
                error.response?.data?.error ??
                error.response?.data?.message ??
                "No se pudo registrar asistencia";
            mostrarNotificacion(msg, "danger");
            actualizarEstado("Error en el registro");
        } finally {
            btnConfirmar.disabled = false;
        }
    };

    /* ── Event listeners ─────────────────── */

    btnEscanear.addEventListener("click", () => {
        const codigo = codigoManual.value.trim();
        if (codigo) {
            verificarEmpleado(codigo);
        } else {
            inicializarEscaner();
        }
    });

    codigoManual.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            btnEscanear.click();
        }
    });

    btnConfirmar.addEventListener("click", registrarAsistencia);

    marcarEntradaBtn.addEventListener("click", () => {
        _modoEntrada = true;
        actualizarEstado("Modo entrada seleccionado", "entrada");
    });

    marcarSalidaBtn.addEventListener("click", () => {
        _modoEntrada = false;
        actualizarEstado("Modo salida seleccionado", "salida");
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") detenerEscaner();
    });
});
