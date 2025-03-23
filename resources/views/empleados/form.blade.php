@extends('adminlte::page')

@section('title', 'Formulario Empleados')

@section('content')
<div class="card">
    <div class="card-header">
        <h3 class="card-title">{{ isset($empleado) ? 'Editar Empleado' : 'Crear Empleado' }}</h3>
    </div>
    <div class="card-body">
        <form action="{{ isset($empleado) ? route('empleado.update', $empleado) : route('empleado.store') }}" method="POST">
            @csrf
            @if(isset($empleado))
            @method('PUT')
            @endif
            <div class="form-group">
                <label for="nombre">Nombre</label>
                <input type="text" name="nombre" id="nombre" class="form-control" value="{{ $empleado->nombre ?? '' }}" required>
            </div>
            <div class="form-group">
                <label for="apellido">Apellidos</label>
                <input type="text" name="apellido" id="apellido" class="form-control" value="{{ $empleado->apellido ?? '' }}" required>
            </div>
            <div class="form-group">
                <label for="identificacion">Identificación</label>
                <input type="text" name="identificacion" id="identificacion" class="form-control" value="{{ $empleado->identificacion ?? '' }}" required>
            </div>
            <div class="form-group">
                <label for="cargo">Cargo</label>
                <input type="text" name="cargo" id="cargo" class="form-control" value="{{ $empleado->cargo ?? '' }}">
            </div>
            <div class="form-group">
                <label for="salaraio">Salario</label>
                <input type="text" name="salario" id="salario" class="form-control" value="{{ $empleado->salario ?? '' }}">
            </div>
            <div class="form-group">
                <label for="horasxsemana">Horas Semanales</label>
                <input type="text" name="horasxsemana" id="horasxsemana" class="form-control" value="{{ $empleado->horasxsemana ?? '' }}">
            </div>

            <!-- Agregar los demás campos -->
            <button type="submit" class="btn btn-primary">{{ isset($empleado) ? 'Actualizar' : 'Crear' }}</button>
        </form>
    </div>
</div>
@endsection