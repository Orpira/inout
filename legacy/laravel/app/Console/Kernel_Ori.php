<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * Define las tareas programadas.
     */
    protected function schedule(Schedule $schedule)
    {
        // Ejemplo de tarea programada cada hora
        $schedule->command('inspire')->hourly();
        $schedule->command('asignar:salida-automatica')->daily();
    }

    /**
     * Registra los comandos de la consola.
     */
    protected function commands()
    {
        $this->load(__DIR__ . '/Commands');

        require base_path('routes/console.php');

        \App\Console\Commands\AsignarSalidaAutomatica::class;
    }
}
