@extends('layouts.crud')

@section('title', 'Formulario de Registro')
@section('pageTitle', isset($registro) ? 'Editar Registro' : 'Crear Registro')

@section('content')
<form action="{{ isset($registro) ? route('registros.update', $registro) : route('registros.store') }}" method="POST" class="grid gap-4 md:grid-cols-2">
    @csrf
    @if(isset($registro))
    @method('PUT')
    @endif

    <div class="md:col-span-2">
        <label for="empleado_id" class="app-label">Empleado</label>
        @if(isset($empleados) && count($empleados) > 0)
            <select name="empleado_id" id="empleado_id" class="app-input" required>
                <option value="">Seleccionar...</option>
                @foreach($empleados as $empleado)
                <option value="{{ $empleado->id }}" {{ old('empleado_id', $registro->empleado_id ?? '') == $empleado->id ? 'selected' : '' }}>
                    {{ $empleado->nombre }} {{ $empleado->apellido }}
                </option>
                @endforeach
            </select>
        @else
            <input type="hidden" name="empleado_id" value="{{ old('empleado_id', $registro->empleado_id ?? '') }}">
            <input class="app-input" value="{{ $registro->empleado->nombre . ' ' . $registro->empleado->apellido ?? 'No disponible' }}" disabled>
        @endif
    </div>

    <div>
        <label for="fecha" class="app-label">Fecha</label>
        <input type="text" name="fecha" id="fecha" class="app-input" value="{{ old('fecha', $registro->fecha ?? '') }}" required>
    </div>

    <div>
        <label for="entrada" class="app-label">Entrada</label>
        <input type="text" name="entrada" id="entrada" class="app-input" value="{{ old('entrada', $registro->entrada ?? '') }}" required>
    </div>

    <div>
        <label for="salida" class="app-label">Salida</label>
        <input type="text" name="salida" id="salida" class="app-input" value="{{ old('salida', $registro->salida ?? '') }}">
    </div>

    <div>
        <label class="app-label">Ext. Diurna Ordinaria</label>
        <input class="app-input" value="{{ $registro->extrasordinarias ?? '' }}" disabled>
    </div>

    <div>
        <label class="app-label">Ext. Nocturna Ordinaria</label>
        <input class="app-input" value="{{ $registro->nocturnasordinarias ?? '' }}" disabled>
    </div>

    <div>
        <label class="app-label">Extra Nocturna</label>
        <input class="app-input" value="{{ $registro->extrasnocturnas ?? '' }}" disabled>
    </div>

    <div class="md:col-span-2 flex justify-end gap-2 pt-2">
        <a href="{{ route('registro_horario.index') }}" class="btn-secondary">Cancelar</a>
        <button type="submit" class="btn-primary">{{ isset($registro) ? 'Actualizar' : 'Crear' }}</button>
    </div>
</form>
@endsection
