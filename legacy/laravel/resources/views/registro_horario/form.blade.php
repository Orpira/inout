@extends('layouts.crud')

@section('title', 'Crear Registro')
@section('pageTitle', 'Nuevo Registro de Asistencia')

@section('content')
<form action="{{ route('registro_horario.store') }}" method="POST" class="grid gap-4 md:grid-cols-2">
    @csrf

    <div>
        <label for="empleado_id" class="app-label">Empleado</label>
        <select name="empleado_id" id="empleado_id" class="app-input" required>
            <option value="">Seleccionar...</option>
            @foreach($empleados as $empleado)
            <option value="{{ $empleado->id }}">{{ $empleado->nombre }} {{ $empleado->apellido }}</option>
            @endforeach
        </select>
    </div>

    <div>
        <label for="estado" class="app-label">Estado</label>
        <select name="estado" id="estado" class="app-input">
            <option value="FINALIZADO">FINALIZADO</option>
            <option value="PENDIENTE">PENDIENTE</option>
        </select>
    </div>

    <div>
        <label for="entrada" class="app-label">Entrada</label>
        <input type="datetime-local" name="entrada" id="entrada" class="app-input" required>
    </div>

    <div>
        <label for="salida" class="app-label">Salida</label>
        <input type="datetime-local" name="salida" id="salida" class="app-input" required>
    </div>

    <div class="md:col-span-2">
        <label for="novedad" class="app-label">Novedades</label>
        <textarea name="novedad" id="novedad" class="app-input" rows="4" maxlength="1000"></textarea>
    </div>

    <div class="md:col-span-2 flex justify-end gap-2 pt-2">
        <a href="{{ route('registro_horario.index') }}" class="btn-secondary">Cancelar</a>
        <button type="submit" class="btn-primary">Crear Registro</button>
    </div>
</form>
@endsection
