@extends('layouts.crud')

@section('title', 'Editar Registro Legacy')
@section('pageTitle', isset($registro) ? 'Editar Registro Legacy' : 'Crear Registro Legacy')

@section('content')
<form action="{{ isset($registro) ? route('registros.update', $registro) : route('registros.store') }}" method="POST" class="grid gap-4 md:grid-cols-2">
    @csrf
    @if(isset($registro))
    @method('PUT')
    @endif

    <div>
        <label class="app-label">Empleado</label>
        <input class="app-input" value="{{ $registro->empleado->nombre . ' ' . $registro->empleado->apellido ?? '' }}" disabled>
    </div>

    <div>
        <label class="app-label">Fecha</label>
        <input class="app-input" value="{{ date('d-m-Y', strtotime($registro->fecha ?? '')) }}" disabled>
    </div>

    <div>
        <label for="entrada" class="app-label">Hora Entrada</label>
        <input type="text" name="entrada" id="entrada" class="app-input" value="{{ $registro->entrada ?? '' }}">
    </div>

    <div>
        <label for="salida" class="app-label">Hora Salida</label>
        <input type="text" name="salida" id="salida" class="app-input" value="{{ $registro->salida ?? '' }}">
    </div>

    <div>
        <label class="app-label">Diurna Ordinaria</label>
        <input class="app-input" value="{{ $registro->extrasordinarias ?? '' }}" disabled>
    </div>

    <div>
        <label class="app-label">Nocturna Ordinaria</label>
        <input class="app-input" value="{{ $registro->nocturnasordinarias ?? '' }}" disabled>
    </div>

    <div class="md:col-span-2 flex justify-end gap-2">
        <a href="{{ route('registros.index') }}" class="btn-secondary">Cancelar</a>
        <button type="submit" class="btn-primary">{{ isset($registro) ? 'Actualizar' : 'Crear' }}</button>
    </div>
</form>
@endsection
