<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Registro de Asistencia</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>

<body>
    <div class="d-flex justify-content-center align-items-center vh-100" style="background-color: #ffffff; color: white;">

        <!-- Cuadro de acceso -->
        <div class="card p-4 shadow-lg" style="width: 400px; background: #FFFFFF; border-radius: 10px;">
            <h2 class="text-center mb-3">Registro Asistencia Laboral</h2>

            @if(session('success'))
            <div class="alert alert-success">
                {{ session('success') }}
            </div>
            @endif

            <div class="mb-3">
                <input type="password" id="empleado_id" class="form-control" placeholder="Ingrese identificación del empleado">
            </div>

            <button id="marcarEntrada" class="btn btn-success w-100">Marcar Entrada</button>
            <button id="marcarSalida" class="btn btn-danger w-100 mt-2">Marcar Salida</button>

            <div id="resultado" class="mt-4"></div>

            <!-- Botón de regreso -->
            <a href="javascript:history.back()" class="btn btn-secondary w-100 mt-3">
                ⬅ Regresar
            </a>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
            const empleadoIdInput = document.getElementById('empleado_id');
            const resultadoDiv = document.getElementById('resultado');
            const marcarEntradaBtn = document.getElementById('marcarEntrada');
            const marcarSalidaBtn = document.getElementById('marcarSalida');

            // Habilitar/deshabilitar botones según el input
            const toggleButtons = () => {
                const isInputEmpty = empleadoIdInput.value.trim() === "";
                marcarEntradaBtn.disabled = isInputEmpty;
                marcarSalidaBtn.disabled = isInputEmpty;
            };

            empleadoIdInput.addEventListener('input', toggleButtons);
            toggleButtons();

            // Función para mostrar notificaciones
            function showNotification(message, type) {
                const notification = document.createElement('div');
                notification.classList.add('alert', type === 'info' ? 'alert-info' : 'alert-warning');
                notification.innerHTML = message;
                document.body.appendChild(notification);

                // Desaparecer la notificación después de 5 segundos
                setTimeout(() => {
                    notification.remove();
                }, 5000);
            }

            // Función de sincronización de registros offline
            function sincronizarRegistros() {
                let registros = JSON.parse(localStorage.getItem('registros_offline')) || [];

                if (registros.length === 0) {
                    return;
                }

                axios.post('/sincronizar', {
                        registros
                    }, {
                        headers: {
                            'X-CSRF-TOKEN': csrfToken
                        }
                    })
                    .then(response => {
                        if (response.data.success) {
                            localStorage.removeItem('registros_offline');
                            alert("Registros sincronizados con éxito.");
                        } else {
                            alert("Error al sincronizar registros.");
                        }
                    })
                    .catch(error => {
                        alert("No se pudo sincronizar los registros: " + error.message);
                    });
            }

            // Escuchar cuando se recupere la conexión
            window.addEventListener("online", function() {
                let registros = JSON.parse(localStorage.getItem('registros_offline')) || [];
                if (registros.length > 0) {
                    showNotification("📡 Conexión recuperada. Sincronizando registros...", "info");
                    sincronizarRegistros();
                }
            });

            // Función para manejar la marcación de entrada
            marcarEntradaBtn.addEventListener('click', () => {
                const empleadoId = empleadoIdInput.value;
                const registro = {
                    tipo: 'entrada',
                    empleado_id: empleadoId,
                    timestamp: new Date().toISOString()
                };

                axios.post('/marcar-entrada', {
                        empleado_id: empleadoId
                    }, {
                        headers: {
                            'X-CSRF-TOKEN': csrfToken
                        }
                    })
                    .then(response => {
                        resultadoDiv.innerHTML = `<div class="alert alert-success">✔ Bienvenido: <strong>${response.data.mensaje}</strong></div>`;
                        empleadoIdInput.value = "";
                        toggleButtons();
                    })
                    .catch(error => {
                        // Si no hay conexión, almacenar el registro en localStorage
                        if (navigator.onLine === false) {
                            let registrosOffline = JSON.parse(localStorage.getItem('registros_offline')) || [];
                            registrosOffline.push(registro);
                            localStorage.setItem('registros_offline', JSON.stringify(registrosOffline));
                            resultadoDiv.innerHTML = `<div class="alert alert-warning">🚫 No hay conexión. El registro se guardará y sincronizará más tarde.</div>`;
                        } else {
                            resultadoDiv.innerHTML = `<div class="alert alert-danger">Error: ${error.response.data.error}</div>`;
                        }
                    });
            });

            // Función para manejar la marcación de salida
            marcarSalidaBtn.addEventListener('click', () => {
                const empleadoId = empleadoIdInput.value;
                const registro = {
                    tipo: 'salida',
                    empleado_id: empleadoId,
                    timestamp: new Date().toISOString()
                };

                axios.post('/marcar-salida', {
                        empleado_id: empleadoId
                    }, {
                        headers: {
                            'X-CSRF-TOKEN': csrfToken
                        }
                    })
                    .then(response => {
                        resultadoDiv.innerHTML = `<div class="alert alert-success">${response.data.mensaje}</div>`;
                        empleadoIdInput.value = "";
                        toggleButtons();
                    })
                    .catch(error => {
                        // Si no hay conexión, almacenar el registro en localStorage
                        if (navigator.onLine === false) {
                            let registrosOffline = JSON.parse(localStorage.getItem('registros_offline')) || [];
                            registrosOffline.push(registro);
                            localStorage.setItem('registros_offline', JSON.stringify(registrosOffline));
                            resultadoDiv.innerHTML = `<div class="alert alert-warning">🚫 No hay conexión. El registro se guardará y sincronizará más tarde.</div>`;
                        } else {
                            resultadoDiv.innerHTML = `<div class="alert alert-danger">Error: ${error.response.data.error}</div>`;
                        }
                    });
            });
        });
    </script>

</body>

</html>