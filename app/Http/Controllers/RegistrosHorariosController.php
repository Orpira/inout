<?php

namespace App\Http\Controllers;

use App\Models\RegistrosHorarios;
use App\Models\Empleado;
use App\Models\Turnos;
use App\Models\Mostrar;

use App\Services\Festivos;
use App\Services\CalculoExtras;

use App\Mail\RegistroPendienteMail;

use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Auth;
use Illuminate\Http\Request;

use Carbon\Carbon;

use function PHPSTORM_META\registerArgumentsSet;

class RegistrosHorariosController extends Controller
{
    protected Festivos $festivos;
    protected CalculoExtras $calculoExtras;

    public function __construct(Festivos $festivos, CalculoExtras $calculoExtras)
    {
        $this->festivos = $festivos;
        $this->calculoExtras = $calculoExtras;
    }

    // Marcar entrada
    public function marcarEntrada(Request $request)
    {
        $empleado = Empleado::where('identificacion', $request->empleado_id)->first();

        if (!$empleado) {
            $mensaje = 'Empleado no encontrado';
            return response()->json(['error' => $mensaje], 404);
        }

        // Verifica si hay un registro pendientes por cerrar de dias anteriores
        $registrosPendientes = RegistrosHorarios::whereNull('salida')
            ->where('entrada', '<=', Carbon::now()->subDay()) // Más de 24 horas
            ->where('estado', 'PENDIENTE')
            ->get();

        foreach ($registrosPendientes as $registroPendiente) {
            $registroPendiente->salida = Carbon::createFromFormat('H:i', '18:00'); // Salida predeterminada
            $registroPendiente->tiempo_total = Carbon::parse($registroPendiente->entrada)
                ->diff($registroPendiente->salida)
                ->format('%H:%I:%S');
            $registroPendiente->estado = 'cerrado automaticamente'; // Estado para reportes
            $registroPendiente->novedad = 'Salida asignada automaticamente despues de 24 horas.';
            $registroPendiente->save();
        }

        $registrosPendientes = 0;
        // Busca las entradas sin salida del empleado
        $registrosPendientes = RegistrosHorarios::where('empleado_id', $empleado->id)
            ->whereNull('salida')
            ->where('estado', 'PENDIENTE')
            ->count(); // Cuenta los registros pendientes

        // Verifica si hay un registro pendiente
        if ($registrosPendientes >= 1) {
            $mensaje = 'No puedes registrar una nueva entrada. Hay al menos un registro sin salida. Informar al supervisor.';
            //$this->notificarPendientes();
            return response()->json(['error' => $mensaje], 400);
        }

        $registrosRepetidos = 0;
        // Busca mas de 2 entradas el mismo día
        $registrosRepetidos = RegistrosHorarios::whereDate('entrada', Carbon::now()->toDateString())
            ->where('empleado_id', $empleado->id)
            ->count(); // Cuenta los registros del mismo día

        // Verifica si hay mas de 2 registro para ek mismo día
        if ($registrosRepetidos >= 2) {
            $mensaje = 'No puedes registrar una nueva entrada. Existen 2 registro de ingreso el para el mismo día. Informar al supervisor.';
            //$this->notificarPendientes();
            return response()->json(['error' => $mensaje], 400);
        }

        // Crear el nuevo registro de entrada
        $nuevoRegistro = RegistrosHorarios::create([
            'empleado_id' => $empleado->id,
            'entrada' => now(),
        ]);

        // Verificar si es festivo o domingo
        $fechaFestiva = $this->festivos->esFestivo(now()) || now()->isSunday();

        //Crear el nuevo registro de turno
        Turnos::create([
            'empleado_id' => $empleado->id,
            'fecha' => now()->toDateString(),
            'hora_inicial' => now()->toTimeString(),
            'hora_final' => null, // Se actualizará cuando marque salida
            'festivo' => $fechaFestiva, // Marcar si es festivo
        ]);

        return response()->json([
            'mensaje' =>  $empleado->nombre . ' ' . $empleado->apellido . '. Entrada registrada con éxito. Hora de entrada: ' . date('H:i:s', strtotime(now())),
            'registro' => $nuevoRegistro,
        ]);
    }

    // Marcar salida
    public function marcarSalida(Request $request)
    {
        $empleado = Empleado::where('identificacion', $request->empleado_id)->first();

        if (!$empleado) {
            $mensaje = 'Empleado no encontrado';
            return response()->json(['error' => $mensaje], 404);
        }

        $registro_horario = RegistrosHorarios::where('empleado_id', $empleado->id)
            ->whereNull('salida')
            ->first();

        if (!$registro_horario) {
            $mensaje = 'No se encontró una entrada activa para este empleado.';
            return response()->json(['error' => $mensaje], 404);
        }

        $registro_horario->salida = Carbon::now(); // Hora actual
        $registro_horario->tiempo_total = Carbon::parse($registro_horario->entrada)
            ->diff($registro_horario->salida)
            ->format('%H:%I:%S');

        $registro_horario->estado = 'FINALIZADO'; // Cambiar el estado a FINALIZADO
        $registro_horario->save();

        // Convertir las horas a timestamps
        $startTime = strtotime($registro_horario->entrada);
        $endTime = strtotime($registro_horario->salida);


        //$registro->nocturnasordinarias = $this->calcularExtras($registro->id, "NOCTORD") ?? 0;
        //$registro->extrasnocturnas = $this->calcularExtras($registro->id, "NOCTURNA") ?? 0;

        // Guarda el registro
        //$registro_horario->save();

        // Crear el nuevo registro de turno
        $turnos = Turnos::where('empleado_id', $empleado->id)
            ->whereNull('hora_final') // Buscar turno sin hora de salida
            ->whereDate('created_at', Carbon::today()) // Asegurarse de que el turno sea del día actual
            ->latest() // Último turno
            ->first(); // Buscar el último turno

        if ($turnos) {
            $turnos->hora_final = now()->toTimeString(); // Actualizar la hora final
            $turnos->save(); // Guardar el turno actualizado
        }
        // Calcula horas extras y valida los valores
        $this->calculoExtras->calculateExtraHours($empleado->id, $turnos->id);
        return response()->json(['mensaje' => 'Salida registrada con éxito', 'registro' => $registro_horario]);
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

        if ($search) {
            $registros_horarios = RegistrosHorarios::where('entrada', 'LIKE', "%{$search}%")
                ->orWhere('salida', 'LIKE', "%{$search}%")
                ->orWhere('entrada', 'LIKE', "%{$search}%")
                ->orWhere('estado', 'LIKE', "%{$search}%")
                ->orWhereHas('empleado', function ($query) use ($search) {
                    $query->where('nombre', 'LIKE', "%{$search}%")
                        ->orWhere('apellido', 'LIKE', "%{$search}%");
                })
                ->get();
        } else {
            $registros_horarios = RegistrosHorarios::orderBy('id')->get();
        }
        //dd($registros_horarios);
        $perPage = $request->input('perPage', 10);
        $registros_horarios = Mostrar::orderBy('id', 'desc')->paginate($perPage); // Muestra 10 registros por página
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
        //dd($cambios);
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
        if ($registros_horarios->estado === 'FINALIZADO' || $registros_horarios->estado === 'cerrado automaticamente') {
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
