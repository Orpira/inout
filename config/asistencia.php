<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Configuración de Confirmación de Asistencia
    |--------------------------------------------------------------------------
    |
    | Esta opción controla el comportamiento de confirmación de los registros
    | de asistencia en el sistema.
    |
    | confirmacion_automatica: (bool) Si es true, los registros se confirmarán
    | automáticamente al escanear o ingresar un código. Si es false, se
    | requerirá confirmación manual para cada registro.
    |
    */

    'confirmacion_automatica' => env('ASISTENCIA_CONFIRMACION_AUTOMATICA', false),
];
