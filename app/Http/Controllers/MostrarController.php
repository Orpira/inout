<?php

namespace App\Http\Controllers;

use App\Models\Mostrar;
use App\Models\Empleado;
use Illuminate\Http\Request;

class MostrarController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $perPage = $request->input('perPage', 10);
        $registros_horarios = Mostrar::orderBy('id', 'desc')->paginate($perPage); // Muestra 10 registros por página
        //$registros_horarios = Mostrar::all();
        return view('mostrar_registros.index', compact('registros_horarios'));
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        $empleados = Empleado::all();
        $registros_horarios = Mostrar::all();
        return view('registro_horario.form', compact('registros_horarios', 'empleados'));
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        Mostrar::create($request->all());
        return redirect()->route('registro_horario.index');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Mostrar $registros_horarios)
    {

        return view('registro_horario.form', compact('registros_horarios'));
    }

    /**
     * Display the specified resource.
     */
    public function show()
    {
        //return view('mostrar.registro');
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, $id)
    {
        $registros_horarios = Mostrar::find($id);

        //dd($registros_horarios);

        if (!$registros_horarios) {
            return response()->json(['error' => 'Registro no encontrado'], 404);
        }

        // Verificar si el estado debe cambiar a PENDIENTE
        if ($registros_horarios->estado !== 'FINALIZADO' && $registros_horarios->estado !== 'cerrado autom+aicamente') {
            $registros_horarios->estado = 'PENDIENTE'; // Cambia automáticamente si no está en un estado final
        }

        // Actualizar los demás campos
        $registros_horarios->update($request->except('estado'));

        //$registros_horarios->update($request->all());
        //dd($registros_horarios);
        return redirect()->route('registro_horario.index')->with('success', 'Registro actualizado correctamente.');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Mostrar $mostrar)
    {
        $mostrar->delete();
        return redirect()->route('registro_horario.index');
    }
}
