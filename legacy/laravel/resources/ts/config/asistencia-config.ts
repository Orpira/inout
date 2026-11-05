interface AsistenciaUrls {
    marcar_entrada: string;
    marcar_salida: string;
    api_empleados: string;
    marcar_asistencia?: string;
    buscar_empleado?: string;
}

interface AsistenciaConfig {
    confirmacion_automatica?: boolean;
    urls: AsistenciaUrls;
}

declare global {
    interface Window {
        configAsistencia: AsistenciaConfig;
    }
}

const getMetaContent = (name: string, fallback: string): string => {
    const meta = document.querySelector(
        `meta[name="${name}"]`,
    ) as HTMLMetaElement | null;
    return meta?.content ?? fallback;
};

const getMetaFlag = (name: string, fallback = false): boolean => {
    const meta = document.querySelector(
        `meta[name="${name}"]`,
    ) as HTMLMetaElement | null;
    return meta ? meta.content === "true" : fallback;
};

window.configAsistencia = {
    get confirmacion_automatica(): boolean {
        return getMetaFlag("asistencia-confirmacion-automatica");
    },
    urls: {
        get marcar_entrada(): string {
            return getMetaContent(
                "asistencia-url-marcar-entrada",
                "/marcar-entrada",
            );
        },
        get marcar_salida(): string {
            return getMetaContent(
                "asistencia-url-marcar-salida",
                "/marcar-salida",
            );
        },
        get api_empleados(): string {
            return getMetaContent(
                "asistencia-url-api-empleados",
                "/empleados/",
            );
        },
    },
};

export {};
