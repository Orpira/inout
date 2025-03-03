<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\EmpleadoController;
use App\Http\Controllers\RegistroController;
use App\Http\Controllers\MostrarController;
use App\Http\Controllers\RegistrosHorariosController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/dashboard', function () {
    return view('dashboard');
})->middleware(['auth', 'verified'])->name('dashboard');

// Rutas protegidas por autenticación
Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    Route::resource('empleado', EmpleadoController::class);
    Route::resource('mostrar', MostrarController::class);
    Route::get('mostrar', [MostrarController::class, 'index'])->name('mostrar.index');

    // Rutas para creacion, actualización y activación de registros_horarios
    Route::middleware(['auth'])->group(function () {
        Route::put('/registro_horario/{id}', [RegistrosHorariosController::class, 'update']);
        Route::post('/registro_horario/{id}/activarRegistro', [RegistrosHorariosController::class, 'activarRegistro'])->name('registro_horario.activarRegistro');
        Route::post('/registro_horario/createNew', [RegistrosHorariosController::class, 'createNew'])->name('registro_horario.createNew');
    });
});

// Rutas públicas (sin autenticación)
Route::resource('registros', RegistroController::class);
Route::get('registros/registrar_empleado', [RegistroController::class, 'show'])->name('registros.show');
Route::post('/sincronizar-registros', [RegistroController::class, 'sincronizar'])->name('sincronizar');


Route::post('/marcar-entrada', [RegistrosHorariosController::class, 'marcarEntrada']); // Ruta para marcar la entrada del empleado
Route::post('/marcar-salida', [RegistrosHorariosController::class, 'marcarSalida']); // Ruta para marcar la salida del empleado

Route::get('/control-horarios', function () { // Ruta para mostrar el registro para control de horarios
    return view('horarios');
});

Route::resource('registro_horario', RegistrosHorariosController::class); // Recursos para registros_horarios   

require __DIR__ . '/auth.php';
