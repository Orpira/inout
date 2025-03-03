@extends('adminlte::page')

@section('title', 'Formulario Entradas y Salidas')

@section('content')
<div class="card">
    <div class="card-header">
        <h3 class="card-title">{{ isset($registros_horarios) ? 'Editar Registro' : 'Crear Registro' }}</h3>
    </div>
    <div class="card-body">
        <form action="{{ isset($registros_horarios) ? route('registro_horario.update', '$registros_horarios') : route('registro_horario.store') }}" method="POST">
            @csrf
            @if(isset($registros_horarios))
            @method('PUT')
            @endif
            <div class="form-group">
                <label for="empleado_id" class="form-label">Empleado:</label>
                <input type="text" name="empleado_id" id="empleado_id" class="form-control" value="{{ $registros_horarios->empleado_id ?? '' }}" disabled>
            </div>
            <div class="form-group">
                <label for="fecha">Fecha</label>
                <input type="text" name="fecha" id="fecha" class="form-control" value="{{ $registros_horarios->entrada ?? '' }}">
            </div>
            <div class="form-group">
                <label for="entrada">Entrada</label>
                <input type="text" name="entrada" id="entrada" class="form-control" value="{{ $registros->entrada ?? '' }}">
            </div>
            <div class="form-group">
                <label for="salida">Salida</label>
                <input type="text" name="salida" id="salida" class="form-control" value="{{ $registros_horarios->salida ?? '' }}">
            </div>
            <div class="form-group" class="form-label">
                <label for="ordinaria">Diurna Ordinaria:</label>
                <input type="text" name="ordinaria" id="ordinaria" class="form-control" value="{{ $registros_horarios->extrasordinarias ?? '' }}" disabled>
            </div>
            <div class="form-group" class="form-label">
                <label for="ordinariaNocturna">Nocturna Ordinaria:</label>
                <input type="text" name="ordinariaNocturna" id="ordinariaNocturna" class="form-control" value="{{ $registros_horarios->nocturnasordinarias ?? '' }}" disabled>
            </div>
            <div class="form-group" class="form-label">
                <label for="extraNocturna">Extra Nocturna:</label>
                <input type="text" name="extraNocturna" id="extraNocturna" class="form-control" value="{{ $registros_horarios->extrasnocturnas ?? '' }}" disabled>
            </div>
            <div class="form-group" class="form-label">
                <label for="estado">Estado:</label>
                <input type="text" name="estado" id="estado" class="form-control" value="{{ $registros_horarios->estado ?? '' }}">
            </div>
            <div class="form-group" class="form-label">
                <label for="novedad">Novedad:</label>
                <input type="text" name="novedad" id="novedad" class="form-control" value="{{ $registros_horarios->novedad ?? '' }}">
            </div>



            <!-- Agregar los demás campos -->
            <button type="submit" class="btn btn-primary">{{ isset($registros_horarios) ? 'Actualizar' : 'Crear' }}</button>

        </form>
    </div>
</div>
@endsection