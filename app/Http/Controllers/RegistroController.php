<?php

namespace App\Http\Controllers;

use \DateTime;
use App\Models\Registro;
use App\Models\RegistrosHorarios;
use App\Models\Empleado;
use Illuminate\Http\Request;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;

use Carbon\Carbon;


class RegistroController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $empleados = Empleado::all();
        $search = $request->get('search');

        if ($search) {
            $registros = Registro::where('fecha', 'LIKE', "%{$search}%")
                ->orWhere('salida', 'LIKE', "%{$search}%")
                ->orWhere('entrada', 'LIKE', "%{$search}%")
                ->orWhereHas('empleado', function ($query) use ($search) {
                    $query->where('nombre', 'LIKE', "%{$search}%")
                        ->orWhere('apellido', 'LIKE', "%{$search}%");
                })
                ->get();
        } else {
            $registros = Registro::all();
        }

        return view('registro_horario.index', compact('registros'));
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        $empleados = Empleado::all();
        $registros = Registro::all();
        return view('registro_horario.form');
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        //Registro::create($request->all());
        //return redirect()->route('registro_horario.index');
        // Validar los datos del formulario
        $validatedData = $request->validate([
            'empleado_id' => 'required|exists:empleados,id',
            'hora_entrada' => 'required|date_format:H:i:s',
            // Agrega más reglas de validación según tus necesidades
        ]);

        // Crear un nuevo registro
        $registro = Registro::create([
            'empleado_id' => $validatedData['empleado_id'],
            'fecha' => now(),
            'hora_entrada' => $validatedData['hora_entrada'],
            'sincronizado' => false,
        ]);

        // Intentar sincronizar inmediatamente
        try {
            $this->sincronizar($registro);
        } catch (\Exception $e) {
            // Si hay un error, almacenar en local storage
            $this->almacenarLocalmente($registro);
        }

        return response()->json(['message' => 'Registro creado correctamente']);
    }

    // Esta función se encarga de sincronizar los registros con el servidor
    private function sincronizar(Request $request)
    {
        try {
            DB::beginTransaction();

            // Recorrer los registros y sincronizar con el servidor
            foreach ($request->registros as $registro) {
                if ($registro['tipo'] === 'entrada') {
                    RegistrosHorarios::create([
                        'empleado_id' => $registro['empleado_id'],
                        'entrada'  => $registro['hora'],
                    ]);
                } else {
                    $registro_horario = RegistrosHorarios::where('empleado_id', $registro['empleado_id'])
                        ->whereNull('salida')
                        ->first();

                    $registro_horario->salida = Carbon::now(); // Hora actual
                    $registro_horario->tiempo_total = Carbon::parse($registro_horario->entrada)
                        ->diff($registro_horario->salida)
                        ->format('%H:%I:%S');

                    $registro_horario->estado = 'FINALIZADO'; // Cambiar el estado a FINALIZADO
                    $registro_horario->save();
                }
            }
            DB::commit();
            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    private function almacenarLocalmente(Registro $registro)
    {
        // Obtener los registros pendientes de localStorage (si es necesario)
        $registrosPendientes = json_decode(Storage::disk('local')->get('registros_pendientes.json'), true) ?? [];

        // Agregar el nuevo registro
        $registrosPendientes[] = $registro->toArray();

        // Guardar en localStorage
        Storage::disk('local')->put('registros_pendientes.json', json_encode($registrosPendientes));
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Registro $registro)
    {
        return view('registros.form', compact('registro'));
    }

    /**
     * Display the specified resource.
     */
    public function show()
    {
        return view('registros.registro');
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Registro $registro)
    {
        $registro->update($request->all());
        return redirect()->route('registros.index');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Registro $registro)
    {
        $registro->delete();
        return redirect()->route('registros.index');
    }

    // Esta función se encarga de registrar la entrada y salida de un empleado
    public function registrar(int $empleadosx)
    {
        $horaActual = date('H:i:s');
        $fecha = date('Y-m-d', strtotime($horaActual));

        $empleadoId = $empleadosx;

        // Obtiene el registro del empleado en la fecha actual
        $registro = $this->obtenerRegistro($empleadoId, $fecha);

        $fechaOld = $registro->fecha;

        $empleado = Empleado::find($empleadoId);

        if (!$registro || !$registro['entrada']) {
            $this->registrarEntrada($empleadoId, $horaActual);
            return redirect()->back()->with('success', 'Bienvenido ' . $empleado->nombre . ',     Entrada registrada: ' . $horaActual . ' horas.');
        } elseif (!$registro['salida']) {
            $this->registrarSalida($empleadoId, $horaActual);
            $tiempoExtra = $this->calcularTiempoExtra($empleadoId, $fecha);

            // Convertir las horas a timestamps
            $startTime = strtotime($registro->entrada);
            $endTime = strtotime($registro->salida);

            $extraNocturna = 0;
            $nocturnaOrdinaria = 0;

            // Comprobar si el fin es después de la medianoche
            if ($endTime < $startTime) {
                $extraNocturna = $this->calcularTiempoExtra($empleadoId, $fecha);
            } else {
                $nocturnaOrdinaria = $this->calcularTiempoExtra($empleadoId, $fecha);
            }

            if ($tiempoExtra > 8 && $extraNocturna == 0) {
                // Calcular las horas trabajadas
                $totalHours = ($endTime - $startTime) / 3600;
                // Calcular las extras nocturnas
                $nocturnaOrdinaria = max(0, min(2, $totalHours - 8));
                return redirect()->back()->with('error', 'Hasta Pronto1 ' . $empleado->nombre . ' ,   Salida registrada: ' . $horaActual . ' Horas trabajado: ' . $totalHours, ' horas.', ' Ext.Noct.Ord.: ' . $nocturnaOrdinaria . ' horas.');
            }

            if ($tiempoExtra >= 0 && $tiempoExtra <= 8) {
                return redirect()->back()->with('error', 'Hasta Pronto2 ' . $empleado->nombre . ' ,   Salida registrada: ' . $horaActual . ' Horas trabajado: ' . $tiempoExtra . ' horas.');
            }

            if ($nocturnaOrdinaria > 0)
                return redirect()->back()->with('error', 'Hasta Pronto3 ' . $empleado->nombre . ' ,   Salida registrada: ' . $horaActual . ' Tiempo extra: ' . $tiempoExtra, ' horas.', ' Tiempo Noct.Ord.: ' . $nocturnaOrdinaria . ' horas.', ' Tiempo Extra Noct.: ' . $extraNocturna . ' horas.');
        } else
            return redirect()->back()->with('error', $empleado->nombre . ',   Ya registró entrada y salida para hoy.');
    }

    // Esta función se encarga de mostrar el formulario para registrar un empleado
    public function registrarEmpleado(Request $request)
    {
        $request->validate([
            'codigo_identificacion' => 'required|string|max:255',
        ]);
        // Obtiene el código de identificación del formulario
        $codigoIdentificacion = $request->input('codigo_identificacion');

        // Aquí se llama la lógica existente para validar el empleado
        $empleado = $this->obtenerEmpleadoIdPorCodigo($codigoIdentificacion);

        // Si el empleado no existe, se muestra un mensaje de error
        if (!$empleado) {
            return redirect()->back()->with('error', 'Empleado no encontrado.');
        }

        // Obtener el registro del empleado en la fecha actual
        $fechaActual = now()->toDateString(); // Obtiene la fecha actual
        $registro = $this->obtenerRegistro($empleado->id, $fechaActual);

        // Si el registro existe, se muestra un mensaje con la entrada y salida
        if ($registro) {
            return $this->registrar($empleado->id);
        } else {
            return $this->registrar($empleado->id);
        }
    }

    // Esta función se encarga de obtener el empleado por su código de identificación
    private function obtenerEmpleadoIdPorCodigo($codigoIdentificacion)
    {
        return Empleado::where('identificacion', $codigoIdentificacion)->first();
    }

    // Esta función se encarga de obtener el registro de un empleado en una fecha específica
    private function obtenerRegistro($empleadoId, $fecha)
    {
        // Busca el registro en la base de datos usando Eloquent
        $registro = Registro::where('empleado_id', $empleadoId)
            ->where('fecha', $fecha)
            ->select('entrada', 'salida')
            ->first();

        // Retorna el registro encontrado o null si no existe
        return $registro;
    }

    // Esta función se encarga de registrar la entrada de un empleado
    public function registrarEntrada($empleadoId, $hora)
    {
        // Convierte la hora a un formato de fecha y hora
        $fecha = date('Y-m-d', strtotime($hora));

        // Verificar si ya existe un registro antes de actualizar
        $registro = Registro::where('empleado_id', $empleadoId)
            ->where('fecha', $fecha)
            ->first();

        // Si no existe un registro, se crea uno nuevo
        if (!$registro) {
            $registro = new Registro();
            $registro->empleado_id = $empleadoId;
            $registro->fecha = $fecha;
        }

        $registro->entrada = $hora;
        $registro->save();
    }

    // Esta función se encarga de registrar la salida de un empleado
    public function registrarSalida($empleadoId, $hora)
    {
        $fecha = date('Y-m-d', strtotime($hora));
        $registro = Registro::where('empleado_id', $empleadoId)
            ->where('fecha', $fecha)
            ->first();

        if ($registro) {
            $registro->salida = $hora;
            $registro->save();
        }
    }

    // Esta función se encarga de calcular el tiempo extra trabajado por un empleado
    public function calcularTiempoExtra($empleadoId, $fecha)
    {
        $registro = Registro::where('empleado_id', $empleadoId)
            ->where('fecha', $fecha)
            ->first();

        // Convertir las horas a timestamps
        $startTime = strtotime($registro->entrada);
        $endTime = strtotime($registro->salida);

        // Ajustar si el fin es después de la medianoche
        if ($endTime < $startTime) {
            $endTime += 24 * 60 * 60;
        }

        // Calcular las horas trabajadas
        $totalHours = ($endTime - $startTime) / 3600;

        // Calcular las categorías
        $ordinaryHours = min(8, $totalHours);

        // Si el registro existe y tiene hora de entrada y salida
        if ($registro && $registro->entrada && $registro->salida) {
            if ($registro->entrada > $registro->salida) {
                return $extraNightHours = max(0, $totalHours - 10);

                //return $nightHours = max(0, min(2, $totalHours - 8));
            }
            /*$entrada = new DateTime($registro->entrada);
            $salida = new DateTime($registro->salida);
            $intervalo = $entrada->diff($salida);

            $horasTrabajadas = $intervalo->h + ($intervalo->i / 60);
            $tiempoExtra = max(0, $horasTrabajadas - 8);*/
            return $ordinaryHours;
        }
        return 0;
    }
}
