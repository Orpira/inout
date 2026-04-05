<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\RegistrosHorarios;
use Carbon\Carbon;

class AsignarSalidaAutomatica extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'RegistrosHorarios:cerrar';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Command description';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $registrosPendientes = RegistrosHorarios::whereNull('salida')
            ->where('entrada', '<=', Carbon::now()->subDay()) // Más de 24 horas
            ->get();

        foreach ($registrosPendientes as $registro) {
            $registro->salida = Carbon::createFromFormat('H:i', '18:00'); // Salida predeterminada
            $registro->tiempo_total = Carbon::parse($registro->entrada)
                ->diff($registro->salida)
                ->format('%H:%I:%S');
            $registro->estado = 'cerrado automáticamente'; // Estado para reportes
            $registro->novedad = 'Salida asignada automaticamente despues de 24 horas.';
            $registro->save();
        }
    }
}
