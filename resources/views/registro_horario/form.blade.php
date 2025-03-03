@extends('adminlte::page')

@section('title', 'Formulario Entradas y Salidas')

@section('content')
<div class="card">
    <div class="card-header">
        <h3 class="card-title">Crear Registro</h3>
    </div>
    <div class="card-body">
        <form action="{{ route('registro_horario.store') }}" method="POST">
            @csrf
            @if(isset($registros_horarios))
            @method('PUT')
            @endif

            <div class="col-md-6">
                <label for="empleado_id" class="form-label">Empleado:</label>
                <select name="empleado_id" id="empleado_id" class="form-control">
                    @foreach($empleados as $empleado)
                    <option value="{{ $empleado->id }}" {{ (isset($registros_horarios) && $registros_horarios->empleado_id == $empleado->id) ? 'selected' : '' }} required>
                        {{ $empleado->nombre }} {{ $empleado->apellido }}
                    </option>
                    @endforeach
                </select>
            </div>

            <div class="form-group">

                <div class="row">
                    <div class="col-md-6">
                        <label for="entrada">Entrada</label>
                        <input type="datetime-local" name="entrada" id="entrada" class="form-control" value="{{ $registros_horarios->entrada ?? '' }} " required>
                    </div>
                    <div class="col-md-6">
                        <label for="salida">Salida</label>
                        <input type="datetime-local" name="salida" id="salida" class="form-control" value="{{ $registros_horarios->salida ?? '' }}" required>
                    </div>
                </div>

            </div>

            <div class="form-group">
                <label for="estado">Estado</label>
                <select name="estado" id="estado" class="form-control">
                    <option value="FINALIZADO">FINALIZADO</option>
                </select>
            </div>
            <div class="form-group">
                <label for="novedad">Novedades:</label>
                <textarea name="novedad" id="novedad" class="form-control" rows="5" maxlength="1000">{{ old('novedad', $registros_horarios->novedad ?? '') }}</textarea>
            </div>

            <!-- Agregar los demás campos -->

            <button type="submit" class="btn btn-primary">Crear</button>
            <a href="{{ route('registro_horario.index') }}" class="btn btn-secondary">Cancelar</a>
        </form>
    </div>
</div>
@endsection