<?php

namespace Database\Factories;

use App\Models\RegistrosHorarios;
use App\Models\Empleado;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\Factory;

class RegistrosHorariosFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = RegistrosHorarios::class;

    /**
     * Define the model's default state.
     *
     * @return array
     */
    public function definition()
    {
        return [
            'empleado_id' => Empleado::factory(),
            'entrada' => Carbon::now()->subHours(8),
            'salida' => Carbon::now(),
            'tiempo_total' => '08:00:00',
            'estado' => 'FINALIZADO',
            'novedad' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }

    /**
     * Indica que el registro está pendiente (sin salida)
     *
     * @return \Illuminate\Database\Eloquent\Factories\Factory
     */
    public function pendiente()
    {
        return $this->state(function (array $attributes) {
            return [
                'salida' => null,
                'tiempo_total' => null,
                'estado' => 'PENDIENTE',
            ];
        });
    }
}
