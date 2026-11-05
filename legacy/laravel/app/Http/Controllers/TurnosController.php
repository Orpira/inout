<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Turnos;

class TurnosController extends Controller
{
    public function index()
    {
        return view('turnos.index');
    }

    public function create()
    {
        return view('turnos.create');
    }

    public function store(Request $request)
    {
        $turno = Turnos::create($request->all());

        return response()->json(['mensaje' => 'Turno creado', 'turno' => $turno]);
    }

    public function show($id)
    {
        $turno = Turnos::find($id);

        if (!$turno) {
            return response()->json(['error' => 'Turno no encontrado'], 404);
        }

        return response()->json($turno);
    }

    public function edit($id)
    {
        $turno = Turnos::find($id);

        if (!$turno) {
            return response()->json(['error' => 'Turno no encontrado'], 404);
        }

        return view('turnos.edit', compact('turno'));
    }

    public function update(Request $request, $id)
    {
        $turno = Turnos::find($id);

        if (!$turno) {
            return response()->json(['error' => 'Turno no encontrado'], 404);
        }

        $turno->update($request->all());

        return response()->json(['mensaje' => 'Turno actualizado', 'turno' => $turno]);
    }

    public function destroy($id)
    {
        $turno = Turnos::find($id);

        if (!$turno) {
            return response()->json(['error' => 'Turno no encontrado'], 404);
        }

        $turno->delete();

        return response()->json(['mensaje' => 'Turno eliminado']);
    }

    public function controlTurnos()
    {
        return view('turnos');
    }
}
