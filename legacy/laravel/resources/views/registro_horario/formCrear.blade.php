@extends('layouts.crud')

@section('title', 'Editar Registro')
@section('pageTitle', isset($registros_horarios) ? 'Editar Registro de Asistencia' : 'Crear Registro')

@section('headerActions')
<a href="{{ route('registro_horario.index') }}" class="btn-secondary">Volver</a>
@endsection

@section('content')
@if(isset($registros_horarios) && ($registros_horarios->estado === 'FINALIZADO' || $registros_horarios->estado === 'cerrado automaticamente'))
    <form action="{{ route('registro_horario.activarRegistro', $registros_horarios->id) }}" method="POST" class="mb-4">
        @csrf
        <button type="submit" class="btn-secondary">Activar Registro</button>
    </form>
@endif

<form action="{{ isset($registros_horarios) ? route('registro_horario.update', $registros_horarios->id) : route('registro_horario.store') }}" method="POST" class="grid gap-4 md:grid-cols-2">
    @csrf
    @if(isset($registros_horarios))
    @method('PUT')
    @endif

    <div>
        <label class="app-label">ID</label>
        <input class="app-input" value="{{ $registros_horarios->id ?? '' }}" disabled>
    </div>

    <div>
        <label class="app-label">Empleado</label>
        <input class="app-input" value="{{ $registros_horarios->empleado->nombre . ' ' . $registros_horarios->empleado->apellido ?? '' }}" disabled>
    </div>

    <div>
        <label class="app-label" for="entrada">Entrada</label>
        <input type="datetime-local" name="entrada" id="entrada" class="app-input" value="{{ $registros_horarios->entrada ?? '' }}" {{ isset($registros_horarios) && ($registros_horarios->estado === 'FINALIZADO' || $registros_horarios->estado === 'cerrado automaticamente') ? 'disabled' : '' }} required>
    </div>

    <div>
        <label class="app-label" for="salida">Salida</label>
        <input type="datetime-local" name="salida" id="salida" class="app-input" value="{{ $registros_horarios->salida ?? '' }}" {{ isset($registros_horarios) && ($registros_horarios->estado === 'FINALIZADO' || $registros_horarios->estado === 'cerrado automaticamente') ? 'disabled' : '' }} required>
    </div>

    <div>
        <label class="app-label">Extras Diurnas</label>
        <input class="app-input" value="{{ $registros_horarios->extrasordinarias ?? '' }}" disabled>
    </div>

    <div>
        <label class="app-label">Extras Nocturnas</label>
        <input class="app-input" value="{{ $registros_horarios->nocturnasordinarias ?? '' }}" disabled>
    </div>

    <div>
        <label class="app-label">Extras Festivas</label>
        <input class="app-input" value="{{ $registros_horarios->extrasnocturnas ?? '' }}" disabled>
    </div>

    <div>
        <label class="app-label" for="estado">Estado</label>
        <select name="estado" id="estado" class="app-input" {{ isset($registros_horarios) && ($registros_horarios->estado === 'FINALIZADO' || $registros_horarios->estado === 'cerrado automaticamente') ? 'disabled' : '' }}>
            <option value="FINALIZADO" {{ isset($registros_horarios) && $registros_horarios->estado === 'FINALIZADO' ? 'selected' : '' }}>FINALIZADO</option>
            <option value="PENDIENTE" {{ isset($registros_horarios) && $registros_horarios->estado === 'PENDIENTE' ? 'selected' : '' }}>PENDIENTE</option>
            <option value="cerrado automaticamente" {{ isset($registros_horarios) && $registros_horarios->estado === 'cerrado automaticamente' ? 'selected' : '' }}>cerrado automaticamente</option>
        </select>
    </div>

    <div class="md:col-span-2">
        <label for="novedad" class="app-label">Novedades</label>
        <textarea name="novedad" id="novedad" class="app-input" rows="4" disabled>{{ old('novedad', $registros_horarios->novedad ?? '') }}</textarea>
    </div>

    <div class="md:col-span-2 flex justify-end gap-2">
        <a href="{{ route('registro_horario.index') }}" class="btn-secondary">Cancelar</a>
        <button type="submit" class="btn-primary" {{ isset($registros_horarios) && ($registros_horarios->estado === 'FINALIZADO' || $registros_horarios->estado === 'cerrado automaticamente') ? 'disabled' : '' }}>Actualizar</button>
    </div>
</form>
@endsection
