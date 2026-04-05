<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>INOUT | Marcacion de Asistencia</title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">
    @vite(['resources/css/app.css', 'resources/ts/app.ts'])

    <style>
        body {
            font-family: "Source Sans 3", sans-serif;
            margin: 0;
            background:
                radial-gradient(1000px 420px at 8% -15%, rgba(0, 106, 111, 0.12), transparent 60%),
                radial-gradient(900px 350px at 88% 0%, rgba(247, 179, 75, 0.15), transparent 60%),
                #f3f6f8;
            color: #0f2231;
        }

        .page-wrap {
            max-width: 1080px;
            margin: 0 auto;
            padding: 1.25rem;
        }

        .top-nav {
            background: rgba(255, 255, 255, 0.92);
            border: 1px solid #d7e2ea;
            border-radius: 1rem;
            box-shadow: 0 12px 34px rgba(15, 34, 49, 0.08);
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1rem;
            padding: 0.9rem 1rem;
            margin-bottom: 1rem;
        }

        .brand {
            display: inline-flex;
            align-items: center;
            gap: 0.7rem;
            text-decoration: none;
            color: #0f2231;
            font-weight: 700;
        }

        .brand-badge {
            width: 2.2rem;
            height: 2.2rem;
            border-radius: 0.75rem;
            background: #006a6f;
            color: #fff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 0.92rem;
        }

        .surface {
            background: #fff;
            border: 1px solid #d7e2ea;
            border-radius: 1rem;
            box-shadow: 0 12px 34px rgba(15, 34, 49, 0.08);
        }

        .hero {
            padding: 1.5rem;
            margin-bottom: 1rem;
        }

        .hero h1 {
            font-family: "Sora", sans-serif;
            margin: 0;
            font-size: clamp(1.4rem, 2.6vw, 2rem);
        }

        .hero p {
            margin: 0.55rem 0 0;
            color: #4f6576;
        }

        .grid-main {
            display: grid;
            grid-template-columns: 1.3fr 0.7fr;
            gap: 1rem;
        }

        @media (max-width: 960px) {
            .grid-main {
                grid-template-columns: 1fr;
            }
        }

        .scanner-container {
            position: relative;
            width: 100%;
            border-radius: 0.8rem;
            overflow: hidden;
            min-height: 180px;
            background: #0f2231;
        }

        .scanner-overlay {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background: rgba(15, 34, 49, 0.78);
            color: white;
            text-align: center;
            z-index: 3;
        }

        .scanner-animation {
            width: 100%;
            height: 3px;
            background: #f7b34b;
            position: absolute;
            animation: scan 2s linear infinite;
            box-shadow: 0 0 10px #f7b34b;
            top: 0;
            left: 0;
        }

        @keyframes scan {
            0% { top: 0; }
            100% { top: calc(100% - 3px); }
        }

        .status-card {
            border-left: 5px solid #006a6f;
            transition: all 0.3s ease;
        }

        .status-card.entrada {
            border-left-color: #1e8158;
        }

        .status-card.salida {
            border-left-color: #bb1f3f;
        }

        .block-card {
            padding: 1.1rem;
        }

        .block-card h3,
        .block-card h4,
        .block-card h5 {
            font-family: "Sora", sans-serif;
            margin-top: 0;
        }

        .field-code {
            border: 1px solid #d7e2ea;
            border-radius: 0.8rem;
            font-size: 1.1rem;
            text-align: center;
            padding: 0.7rem 0.9rem;
            width: 100%;
            box-sizing: border-box;
        }

        .field-code:focus {
            outline: none;
            border-color: #006a6f;
            box-shadow: 0 0 0 4px rgba(0, 106, 111, 0.12);
        }

        .btn-main {
            background: linear-gradient(135deg, #006a6f, #004f55);
            border: none;
            color: #fff;
            border-radius: 0.8rem;
            padding: 0.7rem 1rem;
            font-weight: 600;
            cursor: pointer;
        }

        .btn-main:hover {
            filter: brightness(1.05);
        }

        .btn-main:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }

        .btn-outline-main {
            background: #fff;
            border: 1px solid #d7e2ea;
            color: #213947;
            border-radius: 0.8rem;
            padding: 0.7rem 1rem;
            font-weight: 600;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .btn-outline-main:hover {
            background: #f8fbfd;
        }

        .muted {
            color: #4f6576;
        }

        .history-list {
            border: 1px solid #d7e2ea;
            border-radius: 0.8rem;
            overflow: hidden;
        }

        .history-item {
            padding: 0.85rem 1rem;
            border-bottom: 1px solid #e6edf2;
            font-size: 0.95rem;
        }

        .history-item:last-child {
            border-bottom: 0;
        }

        .history-item strong {
            color: #0f2231;
        }

        .alert {
            border-radius: 0.8rem;
            border: 1px solid transparent;
            padding: 0.8rem 1rem;
            margin-bottom: 0.6rem;
            font-size: 0.95rem;
        }

        .alert-info { background: #ebf7ff; border-color: #b9e3ff; color: #0b4b73; }
        .alert-success { background: #eafaf2; border-color: #bde9d0; color: #145c3f; }
        .alert-warning { background: #fff8e8; border-color: #ffe3ad; color: #734c07; }
        .alert-danger { background: #feeef1; border-color: #f5bcc8; color: #7a1530; }

        .alert button {
            float: right;
            border: 0;
            background: transparent;
            font-size: 1rem;
            cursor: pointer;
            color: inherit;
        }
    </style>
</head>

<body>
    <div class="page-wrap">
        <nav class="top-nav">
            <a href="{{ url('/') }}" class="brand">
                <span class="brand-badge">IO</span>
                <span>INOUT Marcacion</span>
            </a>
            <a href="{{ url('/') }}" class="btn-outline-main">Volver al inicio</a>
        </nav>

        <section class="surface hero">
            <h1>Registro de Asistencia por Turnos</h1>
            <p>Escanea o ingresa el codigo del empleado, valida el estado y confirma el evento de entrada o salida.</p>
        </section>

        <div id="notificaciones"></div>

        <section class="grid-main">
            <div>
                <div class="surface status-card block-card" id="tarjeta-estado" style="margin-bottom: 1rem;">
                    <h3 id="estado-texto">Listo para escanear</h3>
                    <div id="empleado-info" style="display:none;">
                        <h4 id="nombre-empleado" style="margin-bottom:0.2rem;"></h4>
                        <p id="hora-registro" class="muted" style="margin:0;"></p>
                    </div>
                </div>

                <div class="surface block-card" style="margin-bottom: 1rem;">
                    <h4>Captura de Codigo</h4>
                    <div class="scanner-container" style="margin-bottom: 0.8rem;">
                        <video id="scanner" style="width:100%; display:none;" autoplay muted></video>
                        <div id="scanner-overlay" class="scanner-overlay">
                            <i class="fas fa-barcode" style="font-size:2.4rem; margin-bottom:0.8rem;"></i>
                            <p style="margin:0 1rem;">Acerca el codigo de barras para escanear</p>
                            <div class="scanner-animation"></div>
                        </div>
                    </div>

                    <div id="acciones-empleado" style="display:none; margin-bottom: 0.8rem;">
                        <button id="marcar-entrada-btn" class="btn-main" style="margin-right:0.5rem;">Marcar Entrada</button>
                        <button id="marcar-salida-btn" class="btn-main" style="background:#8f2943;">Marcar Salida</button>
                    </div>

                    <label for="codigo-manual" class="muted" style="display:block; margin-bottom:0.4rem;">O ingresa el codigo manualmente</label>
                    <div style="display:grid; grid-template-columns: 1fr auto; gap:0.5rem; margin-bottom:0.8rem;">
                        <input type="text" id="codigo-manual" class="field-code" placeholder="Codigo de empleado" autofocus>
                        <button class="btn-main" type="button" id="btn-escanear">Escanear</button>
                    </div>

                    <button id="btn-confirmar" class="btn-main" style="width:100%; padding:0.85rem;" disabled>
                        Confirmar Registro
                    </button>
                </div>

                <a href="{{ route('login') }}" class="btn-outline-main" style="width:100%; box-sizing:border-box;">Ir a acceso administrativo</a>
            </div>

            <aside class="surface block-card">
                <h5>Registros Recientes</h5>
                <div id="historial" class="history-list">
                    <div class="history-item muted" style="text-align:center;">Sin registros recientes</div>
                </div>

                <div class="surface" style="background:#f8fbfd; border-style:dashed; box-shadow:none; padding:1rem; margin-top:1rem;">
                    <p style="margin:0 0 0.4rem; font-weight:700;">Guia rapida</p>
                    <ul class="muted" style="margin:0; padding-left:1rem;">
                        <li>Captura el codigo del empleado.</li>
                        <li>Selecciona entrada o salida cuando aplique.</li>
                        <li>Confirma y verifica en historial.</li>
                    </ul>
                </div>
            </aside>
        </section>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/quagga@0.12.1/dist/quagga.min.js"></script>
    <script>
        window.configAsistencia = {
            urls: {
                marcar_asistencia: "{{ url('/marcar-asistencia') }}",
                buscar_empleado: "{{ route('empleados.buscar', '') }}"
            }
        };
    </script>
    @vite(['resources/ts/modules/horarios.ts'])
</body>

</html>
                        }
                    );

                    const data = response.data;
                    const tipo = data.hora_salida ? 'Salida' : 'Entrada';
                    const hora = data.hora_salida || data.hora_entrada || '--:--:--';
                    const fecha = data.fecha || new Date().toISOString().slice(0, 10);

                    mostrarNotificacion(data.message || 'Registro guardado correctamente', 'success');
                    actualizarEstado(`${tipo} registrada con exito`, tipo === 'Entrada' ? 'entrada' : 'salida');
                    agregarAlHistorial({
                        empleado: data.empleado || `${empleadoActual.nombre} ${empleadoActual.apellido}`,
                        tipo,
                        hora,
                        fecha
                    });

                    codigoManual.value = '';
                    codigoManual.focus();
                } catch (error) {
                    const msg = error.response?.data?.error || error.response?.data?.message || 'No se pudo registrar asistencia';
                    mostrarNotificacion(msg, 'danger');
                    actualizarEstado('Error en el registro');
                } finally {
                    btnConfirmar.disabled = false;
                }
            };

            btnEscanear.addEventListener('click', () => {
                const codigo = codigoManual.value.trim();
                if (codigo) {
                    verificarEmpleado(codigo);
                } else {
                    inicializarEscaner();
                }
            });

            codigoManual.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    btnEscanear.click();
                }
            });

            btnConfirmar.addEventListener('click', registrarAsistencia);

            marcarEntradaBtn.addEventListener('click', () => {
                modoEntrada = true;
                actualizarEstado('Modo entrada seleccionado', 'entrada');
            });

            marcarSalidaBtn.addEventListener('click', () => {
                modoEntrada = false;
                actualizarEstado('Modo salida seleccionado', 'salida');
            });

            document.addEventListener('visibilitychange', function() {
                if (document.visibilityState === 'hidden') {
                    detenerEscaner();
                }
            });
        });
    </script>
</body>

</html>
