<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\EmpleadoController;
use App\Http\Controllers\RegistroController;
use App\Http\Controllers\MostrarController;
use App\Http\Controllers\RegistrosHorariosController;
use App\Http\Middleware\SetTimeZone;
use Illuminate\Support\Facades\Route;

// Aplicar el middleware de zona horaria a todas las rutas web
Route::middleware([SetTimeZone::class])->group(function () {
    // Ruta principal
    Route::get('/', function () {
        return view('welcome');
    });

    // Dashboard
    Route::get('/dashboard', function () {
        return view('dashboard');
    })->middleware(['auth', 'verified'])->name('dashboard');

    // Rutas protegidas por autenticación
    Route::middleware('auth')->group(function () {
        // Perfil de usuario
        Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
        Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
        Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

        // Recursos
        Route::resource('empleado', EmpleadoController::class);
        Route::resource('mostrar', MostrarController::class);
        Route::get('mostrar', [MostrarController::class, 'index'])->name('mostrar.index');

        // Registros horarios
        Route::prefix('registro_horario')->group(function () {
            Route::put('/{id}', [RegistrosHorariosController::class, 'update']);
            Route::post('/{id}/activarRegistro', [RegistrosHorariosController::class, 'activarRegistro'])->name('registro_horario.activarRegistro');
            Route::post('/createNew', [RegistrosHorariosController::class, 'createNew'])->name('registro_horario.createNew');
        });
    });

    // Rutas públicas (sin autenticación)
    // Ruta para buscar empleados por código
    Route::get('/empleados/{codigo}', [EmpleadoController::class, 'buscarPorCodigo'])->name('empleados.buscar');

    Route::resource('registros', RegistroController::class);
    Route::get('registros/registrar_empleado', [RegistroController::class, 'show'])->name('registros.show');
    Route::post('/sincronizar-registros', [RegistroController::class, 'sincronizar'])->name('sincronizar');

    // Control de horarios
    Route::get('/control-horarios', function () {
        return view('horarios');
    })->name('control.horarios');

    // Marcación de asistencia (maneja tanto entrada como salida)
    Route::post('/marcar-asistencia', [RegistrosHorariosController::class, 'marcarAsistencia'])->name('marcar.asistencia');
    
    // Recursos para registros_horarios
    Route::resource('registro_horario', RegistrosHorariosController::class);

    // Rutas de autenticación
    require __DIR__ . '/auth.php';
});
