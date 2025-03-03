<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sistema de Control de Horario</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://kit.fontawesome.com/a076d05399.js" crossorigin="anonymous"></script>
    <style>
        body {
            background-color: #1b1b1b;
            color: white;
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }

        .container {
            text-align: center;
            width: 500px;
            background: #222;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0px 0px 10px rgba(0, 255, 255, 0.5);
        }

        h2 {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 20px;
        }

        .button-group {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .btn {
            font-size: 18px;
            padding: 12px;
            border-radius: 5px;
            transition: 0.3s;
        }

        .btn-primary {
            background: #007bff;
            border: none;
        }

        .btn-primary:hover {
            background: #0056b3;
        }

        .btn-secondary {
            background: #6c757d;
            border: none;
        }

        .btn-secondary:hover {
            background: #545b62;
        }

        .clock {
            font-size: 50px;
            font-weight: bold;
            margin-bottom: 20px;
            text-shadow: 0px 0px 10px cyan;
        }
    </style>
</head>

<body>

    <div class="container">
        <h2>Sistema de Control de Horario</h2>
        <div class="clock" id="clock">00:00</div>
        <div class="button-group">
            <a href="{{ route('login') }}" class="btn btn-primary">
                <i class="fas fa-user-lock"></i> Ingreso Autorizado
            </a>
            <a href="{{ url('/control-horarios') }}" class="btn btn-secondary">
                <i class="fas fa-clock"></i> Registrar Entradas-Salidas
            </a>
            <a href="{{ url('/registro-offline') }}" class="btn btn-secondary">
                <i class="fas fa-clock"></i> Registro Offline
            </a>
        </div>
    </div>

    <script>
        function updateClock() {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            document.getElementById('clock').innerText = hours + ':' + minutes;
        }
        setInterval(updateClock, 1000);
        updateClock();
    </script>

</body>

</html>