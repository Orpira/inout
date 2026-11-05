<?php

namespace Tests\Feature\Controllers;

use Tests\TestCase;
use App\Models\Empleado;
use App\Models\RegistrosHorarios;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;

class RegistrosHorariosControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        
        // Configurar fechas de prueba
        Carbon::setTestNow(Carbon::create(2025, 9, 3, 8, 0, 0));
    }

    /** @test */
    public function test_marcar_entrada_exitosa()
    {
        // Crear empleado de prueba
        $empleado = Empleado::factory()->create([
            'identificacion' => '12345678',
            'nombre' => 'Empleado de Prueba'
        ]);

        // Realizar petición de entrada
        $response = $this->postJson('/api/marcar-entrada', [
            'empleado_id' => $empleado->identificacion
        ]);

        // Verificar respuesta exitosa
        $response->assertStatus(200)
                 ->assertJson([
                     'mensaje' => 'Entrada registrada correctamente',
                     'empleado' => $empleado->nombre
                 ]);

        // Verificar que se creó el registro
        $this->assertDatabaseHas('registros_horarios', [
            'empleado_id' => $empleado->id,
            'estado' => 'PENDIENTE'
        ]);
    }

    /** @test */
    public function test_marcar_salida_exitosa()
    {
        // Crear empleado y registro de entrada
        $empleado = Empleado::factory()->create([
            'identificacion' => '12345678',
            'nombre' => 'Empleado de Prueba'
        ]);

        $entrada = Carbon::now()->subHours(8);
        
        $registro = RegistrosHorarios::create([
            'empleado_id' => $empleado->id,
            'entrada' => $entrada,
            'estado' => 'PENDIENTE'
        ]);

        // Avanzar el tiempo 8 horas
        Carbon::setTestNow(Carbon::now()->addHours(8));

        // Realizar petición de salida
        $response = $this->postJson('/api/marcar-salida', [
            'empleado_id' => $empleado->identificacion
        ]);

        // Verificar respuesta exitosa
        $response->assertStatus(200)
                 ->assertJson([
                     'mensaje' => 'Salida registrada correctamente',
                     'tiempo_total' => '08:00:00'
                 ]);

        // Verificar que se actualizó el registro
        $this->assertDatabaseHas('registros_horarios', [
            'id' => $registro->id,
            'empleado_id' => $empleado->id,
            'estado' => 'FINALIZADO',
            'tiempo_total' => '08:00:00'
        ]);
    }

    /** @test */
    public function test_no_se_puede_marcar_entrada_si_ya_tiene_una_pendiente()
    {
        // Crear empleado
        $empleado = Empleado::factory()->create([
            'identificacion' => '12345678'
        ]);

        // Crear registro pendiente
        RegistrosHorarios::create([
            'empleado_id' => $empleado->id,
            'entrada' => Carbon::now()->subHour(),
            'estado' => 'PENDIENTE'
        ]);

        // Intentar marcar otra entrada
        $response = $this->postJson('/api/marcar-entrada', [
            'empleado_id' => $empleado->identificacion
        ]);

        // Verificar error
        $response->assertStatus(400)
                 ->assertJson([
                     'error' => 'Ya existe un registro de entrada sin cerrar para este empleado.'
                 ]);
    }

    /** @test */
    public function test_no_se_puede_marcar_salida_sin_entrada_prevista()
    {
        // Crear empleado
        $empleado = Empleado::factory()->create([
            'identificacion' => '12345678'
        ]);

        // Intentar marcar salida sin entrada previa
        $response = $this->postJson('/api/marcar-salida', [
            'empleado_id' => $empleado->identificacion
        ]);

        // Verificar error
        $response->assertStatus(404)
                 ->assertJson([
                     'error' => 'No se encontró una entrada activa para este empleado.'
                 ]);
    }

    /** @test */
    public function test_cierre_automatico_de_registros_pendientes()
    {
        // Crear empleado
        $empleado = Empleado::factory()->create([
            'identificacion' => '12345678'
        ]);

        // Crear registro pendiente de más de 24 horas
        $registro = RegistrosHorarios::create([
            'empleado_id' => $empleado->id,
            'entrada' => Carbon::now()->subDays(2),
            'estado' => 'PENDIENTE'
        ]);

        // Marcar nueva entrada (debería cerrar la anterior)
        $response = $this->postJson('/api/marcar-entrada', [
            'empleado_id' => $empleado->identificacion
        ]);

        // Verificar que se cerró el registro anterior
        $this->assertDatabaseHas('registros_horarios', [
            'id' => $registro->id,
            'estado' => 'FINALIZADO',
            'novedad' => 'Cierre automático por nueva entrada'
        ]);

        // Verificar que se creó un nuevo registro con un ID diferente
        $this->assertDatabaseCount('registros_horarios', 2);
        $this->assertDatabaseHas('registros_horarios', [
            'empleado_id' => $empleado->id,
            'estado' => 'PENDIENTE'
        ]);
    }
}
