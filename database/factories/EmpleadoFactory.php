<?php

namespace Database\Factories;

use App\Models\Empleado;
use Illuminate\Database\Eloquent\Factories\Factory;

class EmpleadoFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = Empleado::class;

    /**
     * Define the model's default state.
     *
     * @return array
     */
    public function definition()
    {
        return [
            'identificacion' => $this->faker->unique()->randomNumber(8),
            'nombre' => $this->faker->name,
            'apellido' => $this->faker->lastName,
            'email' => $this->faker->unique()->safeEmail,
            'telefono' => $this->faker->phoneNumber,
            'direccion' => $this->faker->address,
            'fecha_ingreso' => $this->faker->date(),
            'estado' => 'activo',
            'turno_id' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
}
