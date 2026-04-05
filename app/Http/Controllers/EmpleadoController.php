<?php

namespace App\Http\Controllers;

use \DateTime;

use App\Models\Empleado;
use App\Models\Registro;
use Illuminate\Http\Request;

class EmpleadoController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        $empleados = Empleado::all();
        return view('empleados.index', compact('empleados'));
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        return view('empleados.form');
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        Empleado::create($request->all());
        return redirect()->route('empleado.index');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Empleado $empleado)
    {
        return view('empleados.form', compact('empleado'));
    }

    /**
     * Display the specified resource.
     */
    public function show()
    {
        return view('empleados.registros');
    }
    
    /**
     * Busca un empleado por su código de identificación.
     *
     * @param  string  $codigo
     * @return \Illuminate\Http\JsonResponse
     */
    public function buscarPorCodigo($codigo)
    {
        $empleado = Empleado::where('identificacion', $codigo)->first();
        
        if (!$empleado) {
            return response()->json(['error' => 'Empleado no encontrado'], 404);
        }
        
        return response()->json([
            'id' => $empleado->id,
            'nombre' => $empleado->nombre,
            'apellido' => $empleado->apellido,
            'identificacion' => $empleado->identificacion,
            'cargo' => $empleado->cargo
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Empleado $empleado)
    {
        $empleado->update($request->all());
        return redirect()->route('empleado.index');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Empleado $empleado)
    {
        $empleado->delete();
        return redirect()->route('empleado.index');
    }

    /**
     * Muestra la tabla de registros.
     */
    public function datosRegistros()
    {
        $registros = Registro::all();
        return view('empleados.registros');
    }
}
