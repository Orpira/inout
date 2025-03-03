<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Correo</title>
</head>

<body>
    <h1>Hola, {{ $datos['nombre'] }}</h1>
    <p>Este es un ejemplo de correo dinámico.</p>
    <p>Mensaje: {{ $datos['mensaje'] }}</p>
</body>

</html>