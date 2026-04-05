@extends('layouts.crud')

@section('title', 'Formulario Empleado')
@section('pageTitle', isset($empleado) ? 'Editar Empleado' : 'Crear Empleado')

@section('content')
<form action="{{ isset($empleado) ? route('empleado.update', $empleado) : route('empleado.store') }}" method="POST" class="grid gap-4 md:grid-cols-2">
    @csrf
    @if(isset($empleado))
    @method('PUT')
    @endif

    <div>
        <label for="nombre" class="app-label">Nombre</label>
        <input type="text" name="nombre" id="nombre" class="app-input" value="{{ old('nombre', $empleado->nombre ?? '') }}" required>
    </div>

    <div>
        <label for="apellido" class="app-label">Apellidos</label>
        <input type="text" name="apellido" id="apellido" class="app-input" value="{{ old('apellido', $empleado->apellido ?? '') }}" required>
    </div>

    <div>
        <label for="identificacion" class="app-label">Identificación</label>
        <input type="text" name="identificacion" id="identificacion" class="app-input" value="{{ old('identificacion', $empleado->identificacion ?? '') }}" required>
    </div>

    <div>
        <label for="cargo" class="app-label">Cargo</label>
        <input type="text" name="cargo" id="cargo" class="app-input" value="{{ old('cargo', $empleado->cargo ?? '') }}">
    </div>

    <div>
        <label for="salario" class="app-label">Salario</label>
        <input type="text" name="salario" id="salario" class="app-input" value="{{ old('salario', $empleado->salario ?? '') }}">
    </div>

    <div>
        <label for="horasxsemana" class="app-label">Horas Semanales</label>
        <input type="text" name="horasxsemana" id="horasxsemana" class="app-input" value="{{ old('horasxsemana', $empleado->horasxsemana ?? '') }}">
    </div>

    <div class="md:col-span-2 flex justify-end gap-2 pt-2">
        <a href="{{ route('empleado.index') }}" class="btn-secondary">Cancelar</a>
        <button type="submit" class="btn-primary">{{ isset($empleado) ? 'Actualizar' : 'Crear' }}</button>
    </div>
</form>
@endsection
