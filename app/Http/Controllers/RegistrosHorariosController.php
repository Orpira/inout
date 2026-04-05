<?php

namespace App\Http\Controllers;

use App\Models\RegistrosHorarios;
use App\Models\Empleado;
use App\Models\Turnos;
use App\Models\Mostrar;
use App\Services\Festivos;
use App\Services\CalculoExtras;
use App\Mail\RegistroPendienteMail;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Auth;
use Illuminate\Http\Request;
use Carbon\Carbon;

class RegistrosHorariosController extends Controller
{
    protected Festivos $festivos;
    protected CalculoExtras $calculoExtras;

    public function __construct(Festivos $festivos, CalculoExtras $calculoExtras)
    {
        $this->festivos = $festivos;
        $this->calculoExtras = $calculoExtras;
    }

    /**
     * Maneja tanto la entrada como la salida según corresponda
     */
    public function marcarAsistencia(Request $request)
    {
        try {
            $request->validate([
                'empleado_id' => 'required|integer|exists:empleados,id'
            ]);

            // Usar la zona horaria del sistema
            $timezone = config('app.timezone');
            $now = Carbon::now($timezone);

            // Buscar por ID numérico o por identificación
            $empleado = Empleado::where('id', $request->empleado_id)
                ->orWhere('identificacion', $request->empleado_id)
                ->first();

            if (!$empleado) {
                return response()->json(['error' => 'Empleado no encontrado'], 404);
            }

            // Buscar registro pendiente
            $registroPendiente = RegistrosHorarios::where('empleado_id', $empleado->id)
                ->whereNull('salida')
                ->where('estado', 'PENDIENTE')
                ->first();

            // Si hay un registro pendiente, marcar salida
            if ($registroPendiente) {
                return $this->marcarSalida($request);
            }
            // Si no hay registro pendiente, marcar entrada
            else {
                return $this->marcarEntrada($request);
            }
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Error al procesar la solicitud',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    // Marcar entrada
    public function marcarEntrada(Request $request)
    {
        try {
            // Validar que se proporcione el ID del empleado
            $request->validate([
                'empleado_id' => 'required|integer|exists:empleados,id'
            ]);

            // Usar la zona horaria del sistema
            $timezone = config('app.timezone');
            $now = Carbon::now($timezone);

            // Buscar por ID numérico o por identificación
            $empleado = Empleado::where('id', $request->empleado_id)
                ->orWhere('identificacion', $request->empleado_id)
                ->first();

            if (!$empleado) {
                return response()->json(['error' => 'Empleado no encontrado'], 404);
            }

            // Verifica si hay un registro pendientes por cerrar de días anteriores
            $registrosPendientes = RegistrosHorarios::whereNull('salida')
                ->where('entrada', '<=', $now->copy()->subDay()) // Más de 24 horas
                ->where('estado', 'PENDIENTE')
                ->get();

            foreach ($registrosPendientes as $registroPendiente) {
                $registroPendiente->salida = Carbon::createFromFormat('H:i', '18:00'); // Salida predeterminada
                $registroPendiente->tiempo_total = Carbon::parse($registroPendiente->entrada)
                    ->diff($registroPendiente->salida)
                    ->format('%H:%I:%S');
                $registroPendiente->estado = 'FINALIZADO'; // Estado para reportes
                $registroPendiente->novedad = 'Salida asignada automaticamente despues de 24 horas.';
                $registroPendiente->save();
            }

            // Busca registros pendientes sin salida
            $registroPendiente = RegistrosHorarios::where('empleado_id', $empleado->id)
                ->whereNull('salida')
                ->where('estado', 'PENDIENTE')
                ->first();

            // Si hay un registro pendiente, verificar si tiene entrada nula
            if ($registroPendiente) {
                if (is_null($registroPendiente->entrada)) {
                    // Si la entrada es nula, marcar salida en este registro
                    $registroPendiente->entrada = $now->copy()->subHour(); // Establecer una hora de entrada razonable
                    $registroPendiente->salida = $now;
                    $registroPendiente->tiempo_total = $now->diffInMinutes($registroPendiente->entrada);
                    $registroPendiente->estado = 'FINALIZADO';
                    $registroPendiente->novedad = 'Registro corregido automáticamente (entrada nula)';
                    $registroPendiente->save();

                    // Continuar con el registro de la nueva entrada
                } else {
                    // Si ya tiene entrada, no permitir nueva entrada
                    $mensaje = 'No puedes registrar una nueva entrada. Hay un registro pendiente sin salida. Informar al supervisor.';
                    return response()->json(['error' => $mensaje], 400);
                }
            }

            // Busca mas de 2 entradas el mismo día
            $registrosRepetidos = RegistrosHorarios::whereDate('entrada', Carbon::now()->toDateString())
                ->where('empleado_id', $empleado->id)
                ->count(); // Cuenta los registros del mismo día

            // Verifica si hay mas de 2 registro para el mismo día
            if ($registrosRepetidos >= 2) {
                $mensaje = 'No puedes registrar una nueva entrada. Existen 2 registros de ingreso para el mismo día. Informar al supervisor.';
                //$this->notificarPendientes();
                return response()->json(['error' => $mensaje], 400);
            }

            // Verificar si es festivo o domingo
            $fechaFestiva = $this->festivos->esFestivo($now) || $now->isSunday();

            // Crear el nuevo registro de entrada
            $nuevoRegistro = RegistrosHorarios::create([
                'empleado_id' => $empleado->id,
                'entrada' => $now,
                'estado' => 'PENDIENTE',
                'created_at' => $now,
                'updated_at' => $now
            ]);

            // Crear el registro de turno
            Turnos::create([
                'empleado_id' => $empleado->id,
                'fecha' => $now->toDateString(),
                'hora_inicial' => $now->toTimeString(),
                'hora_final' => null, // Se actualizará cuando marque salida
                'festivo' => $fechaFestiva, // Marcar si es festivo
            ]);

            // Retornar respuesta exitosa
            return response()->json([
                'success' => true,
                'message' => $empleado->nombre . ' ' . $empleado->apellido . '. Entrada registrada con éxito.',
                'empleado' => $empleado->nombre . ' ' . $empleado->apellido,
                'hora_entrada' => $now->format('H:i:s'),
                'fecha' => $now->format('Y-m-d'),
                'registro_id' => $nuevoRegistro->id
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Error al procesar la solicitud',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    // Marcar salida
    public function marcarSalida(Request $request)
    {
        try {
            // Validar que se proporcione el ID del empleado
            $request->validate([
                'empleado_id' => 'required|integer|exists:empleados,id'
            ]);

            // Usar la zona horaria del sistema
            $timezone = config('app.timezone');
            $now = Carbon::now($timezone);

            // Buscar por ID numérico o por identificación
            $empleado = Empleado::where('id', $request->empleado_id)
                ->orWhere('identificacion', $request->empleado_id)
                ->first();

            if (!$empleado) {
                return response()->json(['error' => 'Empleado no encontrado'], 404);
            }

            // Buscar registro de entrada activo sin salida (de cualquier fecha)
            $registro_horario = RegistrosHorarios::where('empleado_id', $empleado->id)
                ->whereNull('salida')
                ->where('estado', 'PENDIENTE')
                ->orderBy('entrada', 'desc')
                ->first();

            // Si no hay registro activo, crear uno automáticamente
            if (!$registro_horario) {
                $registro_horario = RegistrosHorarios::create([
                    'empleado_id' => $empleado->id,
                    'entrada' => $now->copy()->subHour(), // Restar 1 hora para simular una entrada previa
                    'tipo' => 'automatico',
                    'estado' => 'PENDIENTE',
                    'novedad' => 'Entrada asignada automaticamente.',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                // Crear el registro de turno
                Turnos::create([
                    'empleado_id' => $empleado->id,
                    'fecha' => $now->toDateString(),
                    'hora_inicial' => $now->copy()->subHour()->toTimeString(),
                    'hora_final' => $now->toTimeString(),
                    'festivo' => $this->festivos->esFestivo($now) || $now->isSunday(),
                ]);

                return response()->json([
                    'success' => true,
                    'message' => 'Se creó automáticamente un registro de entrada y salida para hoy.',
                    'empleado' => $empleado->nombre . ' ' . $empleado->apellido,
                    'hora_entrada' => $now->copy()->subHour()->format('H:i:s'),
                    'hora_salida' => $now->format('H:i:s'),
                    'fecha' => $now->format('Y-m-d'),
                    'registro_id' => $registro_horario->id
                ], 200);
            }

            // Actualizar registro con la hora de salida actual
            $registro_horario->salida = $now;
            $registro_horario->updated_at = $now;

            // Calcular la diferencia de tiempo
            $entrada = Carbon::parse($registro_horario->entrada, $timezone);
            $salida = Carbon::parse($registro_horario->salida, $timezone);
            $diferencia = $entrada->diff($salida);

            // Formatear la diferencia como intervalo (HH:MM:SS)
            $tiempoTotal = sprintf(
                '%02d:%02d:%02d',
                $diferencia->h + ($diferencia->days * 24),
                $diferencia->i,
                $diferencia->s
            );

            $registro_horario->tiempo_total = $tiempoTotal;
            $registro_horario->estado = 'FINALIZADO';
            $registro_horario->save();

            // Actualizar el turno correspondiente
            $turno = Turnos::where('empleado_id', $empleado->id)
                ->whereDate('fecha', $now->toDateString())
                ->whereNull('hora_final')
                ->latest()
                ->first();

            if ($turno) {
                $turno->hora_final = $now->toTimeString();
                $turno->save();

                // Calcular horas extras si es necesario
                if (method_exists($this->calculoExtras, 'calculateExtraHours')) {
                    $this->calculoExtras->calculateExtraHours($empleado->id, $turno->id);
                }
            } else {
                // Si no hay turno, crear uno nuevo
                $turno = Turnos::create([
                    'empleado_id' => $empleado->id,
                    'fecha' => $now->toDateString(),
                    'hora_inicial' => $registro_horario->entrada->toTimeString(),
                    'hora_final' => $now->toTimeString(),
                    'festivo' => $this->festivos->esFestivo($now) || $now->isSunday(),
                ]);

                // Calcular horas extras si es necesario
                if (method_exists($this->calculoExtras, 'calculateExtraHours')) {
                    $this->calculoExtras->calculateExtraHours($empleado->id, $turno->id);
                }
            }

            // Retornar respuesta exitosa
            return response()->json([
                'success' => true,
                'message' => $empleado->nombre . ' ' . $empleado->apellido . '. Salida registrada con éxito.',
                'empleado' => $empleado->nombre . ' ' . $empleado->apellido,
                'hora_entrada' => $registro_horario->entrada->format('H:i:s'),
                'hora_salida' => $now->format('H:i:s'),
                'tiempo_total' => $tiempoTotal,
                'fecha' => $now->format('Y-m-d'),
                'registro_id' => $registro_horario->id
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error al registrar la salida: ' . $e->getMessage()
            ], 500);
        }
    }

    // Notificar registros pendientes
    public function notificarPendientes()
    {
        $registrosPendientes = RegistrosHorarios::whereNull('salida')->get();

        foreach ($registrosPendientes as $registro) {
            // Ejemplo: enviar correo al supervisor
            Mail::to('orpira@icloud.com')->send(new RegistroPendienteMail($registro));
        }
    }


    // Mostrar todos los registros de horarios
    public function index(Request $request)
    {
        $empleados = Empleado::all();
        $search = $request->get('search');
        $perPage = $request->input('perPage', 10);

        $query = RegistrosHorarios::with('empleado')
            ->orderBy('entrada', 'desc');

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('entrada', 'LIKE', "%{$search}%")
                    ->orWhere('salida', 'LIKE', "%{$search}%")
                    ->orWhere('estado', 'LIKE', "%{$search}%")
                    ->orWhereHas('empleado', function ($q) use ($search) {
                        $q->where('nombre', 'LIKE', "%{$search}%")
                            ->orWhere('apellido', 'LIKE', "%{$search}%");
                    });
            });
        }

        $registros_horarios = $query->paginate($perPage);

        return view('mostrar_registros.index', compact('registros_horarios'));
    }

    // Mostrar el formulario para crear un nuevo registro de horario
    public function createNew()
    {
        $empleados = Empleado::all();
        $registros_horarios = RegistrosHorarios::orderBy('id')->get();
        return view('registro_horario.formCrear', compact('empleados', 'registros_horarios'));
    }

    // Mostrar el formulario para mostrar un registro de horario
    public function create()
    {
        $empleados = Empleado::all(); // Obtener todos los empleados
        return view('registro_horario.form', compact('empleados')); // Pasar los empleados a la vista
    }


    // Mostrar el formulario para crear un nuevo registro de horario
    public function edit($id)
    {
        $registros_horarios = Mostrar::findOrFail($id); // Buscar el registro en la base de datos, se utiliza Mostrar para que se pueda editar
        return view('registro_horario.formCrear', compact('registros_horarios')); // Pasar el registro a la vista
    }


    // Mostrar un registro de horario específico
    public function show($id)
    {
        $registros_horarios = RegistrosHorarios::find($id);

        if (!$registros_horarios) {
            return response()->json(['error' => 'Registro no encontrado'], 404);
        }

        return response()->json($registros_horarios);
    }

    // Actualizar un registro de horario
    public function update(Request $request, $id)

    {
        $registros_horarios = RegistrosHorarios::find($id);

        if (!$registros_horarios) {
            return response()->json(['error' => 'Registro no encontrado'], 404);
        }

        // Obtener el usuario autenticado
        $usuario = Auth::user();
        $nombreUsuario = $usuario ? $usuario->name : 'Usuario no identificado';

        // Verificar si hubo cambios en otros campos
        $cambios = [];
        foreach ($request->except('_token', '_method') as $key => $value) {
            if ($registros_horarios->$key != $value) {
                $cambios[] = "$key: $value";
            }
        }
        // Si hubo cambios, agregarlos a la novedad
        if (!empty($cambios)) {
            $novedadCambios = "Cambios realizados: " . implode(", ", $cambios) . " por el usuario: $nombreUsuario";
            $registros_horarios->novedad .= "\n - Nueva Novedad:" . $novedadCambios;
        } else {
            $registros_horarios->novedad .= "\n - No se efectuaron modificaciones" . now()->format('d-m-Y H:i:s') . " por el usuario: $nombreUsuario";
        }

        //Crear un array con los datos a actualizar, incluyendo el campo novedad
        $datosActualizados = $request->all();
        $datosActualizados['novedad'] = $registros_horarios->novedad;

        //Actualizar los campos, incluyendo novedad
        $registros_horarios->update($datosActualizados);

        if ($datosActualizados['entrada'] > $datosActualizados['salida']) {
            return response()->json(['error' => 'Hora Entrada no puede ser mayor a la Salida'], 404);
        }

        $registros_horarios->salida = Carbon::parse($registros_horarios->salida); // Hora actual
        $registros_horarios->tiempo_total = Carbon::parse($registros_horarios->entrada)
            ->diff($registros_horarios->salida)
            ->format('%H:%I:%S');
        $registros_horarios->save();

        return view('registro_horario.formCrear', compact('registros_horarios'));
    }

    // Eliminar un registro de horario
    public function destroy($id)
    {
        $registros_horarios = RegistrosHorarios::find($id);

        if (!$registros_horarios) {
            return response()->json(['error' => 'Registro no encontrado'], 404);
        }

        $registros_horarios->delete();
        return response()->json(['mensaje' => 'Registro eliminado']);
    }

    // Registrar un nuevo horario
    public function store(Request $request)
    {
        $request->validate([
            'empleado_id' => 'required',
            'entrada' => ['required'],
            'salida' => ['required'],
        ]);

        $registros_horarios = RegistrosHorarios::create($request->all());

        if ($registros_horarios->entrada > $registros_horarios->salida) {
            $registros_horarios = RegistrosHorarios::latest()->first();
            if ($registros_horarios) {
                $registros_horarios->delete();
            }
            return response()->json(['error' => 'Hora Entrada no puede ser mayor a la Salida'], 404);
        }
        $ultimoRegistro = RegistrosHorarios::latest()->first();
        $ultimoId = $ultimoRegistro ? $ultimoRegistro->id : null;

        $registros_horarios = RegistrosHorarios::find($ultimoId);

        // Verifica si hay un registro pendientes por cerrar de dias anteriores
        $registrosPendientes = RegistrosHorarios::whereNull('salida')
            ->where('empleado_id', $registros_horarios->empleado_id)
            ->count();

        // Verifica si hay un registro pendiente
        if ($registrosPendientes >= 1) {
            $mensaje = 'No puedes registrar una nueva entrada. Hay al menos un registro sin salida.';
            //$this->notificarPendientes();
            $registros_horarios = RegistrosHorarios::latest()->first();
            if ($registros_horarios) {
                $registros_horarios->delete();
            }
            return response()->json(['error' => $mensaje], 400);
        }

        $registrosRepetidos = 0;
        // Busca mas de 2 entradas el mismo día
        $registrosRepetidos = RegistrosHorarios::whereDate('entrada', $registros_horarios->entrada)
            ->where('empleado_id', $registros_horarios->empleado_id)
            ->count(); // Cuenta los registros del mismo día

        // Verifica si hay mas de 2 registro para ek mismo día
        if ($registrosRepetidos >= 2) {
            $mensaje = 'No puedes registrar una nueva entrada. Existen 2 registro de ingreso el para el mismo dia.';
            //$this->notificarPendientes();
            return response()->json(['error' => $mensaje], 400);
        }

        $registros_horarios->salida = Carbon::parse($registros_horarios->salida); // Hora actual
        $registros_horarios->tiempo_total = Carbon::parse($registros_horarios->entrada)
            ->diff($registros_horarios->salida)
            ->format('%H:%I:%S');
        $registros_horarios->save();

        return redirect()->route('registro_horario.index');
    }

    // Funcion para activar un registro
    public function activarRegistro(Request $request, $id)
    {
        $registros_horarios = RegistrosHorarios::find($id);

        if (!$registros_horarios) {
            return response()->json(['error' => 'Registro no encontrado'], 404);
        }

        // Obtener el usuario autenticado
        $usuario = Auth::user();
        $nombreUsuario = $usuario ? $usuario->name : 'Usuario no identificado';

        // Cambiar el estado a PENDIENTE si está FINALIZADO
        if ($registros_horarios->estado === 'FINALIZADO' || $registros_horarios->novedad === 'Finalizado automaticamente') {
            $registros_horarios->estado = 'PENDIENTE';
            if ($registros_horarios->novedad) {
                $registros_horarios->novedad .= "\n - Nueva Activacion:" . now()->format('d-m-Y H:i:s') . " por el usuario: $nombreUsuario";
            } else {
                $registros_horarios->novedad = "Registro Activado!! " . now()->format('d-m-Y H:i:s') . " por el usuario: $nombreUsuario";
            }
            //$novedad = "\nRegistro Activado!! " . now()->format('d-m-Y H:i:s') . " por el usuario: $nombreUsuario";
            //$registros_horarios->novedad = $novedad;
            $registros_horarios->save();

            $registros_horarios->estado = 'PENDIENTE';
            $registros_horarios->save();

            return view('registro_horario.formCrear', compact('registros_horarios'));
        }
        return redirect()->route('registro_horario.index')->with('error', 'No se puede cambiar el estado del registro.');
    }

    // Mostrar la vista de control de horarios  
    public function controlHorarios()
    {
        return view('horarios');
    }

    // Generar reporte de registros con novedades
    public function generarReporte()
    {
        $registrosConNovedades = RegistrosHorarios::whereNotNull('novedad')->get();

        $csvData = "Empleado ID, Entrada, Salida, Tiempo Total, Estado, Novedad\n";

        foreach ($registrosConNovedades as $registro) {
            $csvData .= "{$registro->empleado_id},{$registro->entrada},{$registro->salida},{$registro->tiempo_total},{$registro->estado},{$registro->novedad}\n";
        }

        return response($csvData)
            ->header('Content-Type', 'text/csv')
            ->header('Content-Disposition', 'attachment; filename="reporte_novedades.csv"');
    }
}
