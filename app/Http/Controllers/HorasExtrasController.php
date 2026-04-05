<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

use App\Models\HorasExtras; // Import the ExtraHour model

use Carbon\Carbon;

class HorasExtrasController extends Controller
{
    public function index(Request $request) {}

    // Mostrar un registro de horario específico
    public function show($id)
    {
        $horasextras = HorasExtras::find($id);

        if (!$horasextras) {
            return response()->json(['error' => 'Registro no encontrado'], 404);
        }

        return response()->json($horasextras);
    }

    // Actualizar un registro de horario
    public function update(Request $request, $id)
    {
        $horasextras = HorasExtras::find($id);

        if (!$horasextras) {
            return response()->json(['error' => 'Registro no encontrado'], 404);
        }

        $horasextras->update($request->all());

        return response()->json(['mensaje' => 'Registro actualizado', 'horasextras' => $horasextras]);
    }

    // Eliminar un registro de horario
    public function destroy($id)
    {
        $horasextras = HorasExtras::find($id);

        if (!$horasextras) {
            return response()->json(['error' => 'Registro no encontrado'], 404);
        }

        $horasextras->delete();

        return response()->json(['mensaje' => 'Registro eliminado']);
    }

    // Registrar un nuevo horario
    public function store(Request $request)
    {
        $horasextras = HorasExtras::create($request->all());

        return response()->json(['mensaje' => 'Registro creado', 'horasextras' => $horasextras]);
    }
}
