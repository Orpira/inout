@extends('adminlte::page')

@section('title', 'Formulario Entradas y Salidas')

@section('content')
<div class="card-body">
    <h3 class=" card-title">{{ isset($registro) ? 'Editar Registro' : 'Crear Registro' }}</h3>
</div>
<div class="container">

    <div class="col-md-8">
        <form class="row g-3" action="{{ isset($registro) ? route('registros.update', $registro) : route('registros.store') }}" method="POST">
            @csrf
            @if(isset($registro))
            @method('PUT')
            @endif
            <div class="col-md-6">
                <label for="nombre" class="form-label">Empleado:</label>
                <input type="text" name="nombre" id="nombre" class="form-control" value="{{ $registro->empleado->nombre . ' ' . $registro->empleado->apellido ?? '' }}" disabled>
            </div>
            <div class="col-md-6" class="form-label">
                <label for="fecha">Fecha Ingreso:</label>
                <input type="text" name="fecha" id="fecha" class="form-control" value="{{date('d-m-Y',strtotime( $registro->fecha  ?? ''))}}" disabled>
            </div>
            <div class="col-md-6" class="form-label">
                <label for="entrada">Hora Entrada:</label>
                <input type="text" name="entrada" id="entrada" class="form-control" ng-model="data.action.date" placeholder="HH:mm" value="{{ $registro->entrada ?? '' }}">
            </div>
            <div class="col-md-6" class="form-label">
                <label for="salida">Hora Salida:</label>
                <input type="text" name="salida" id="salida" class="form-control" ng-model="data.action.date" placeholder="HH:mm" value="{{ $registro->salida ?? '' }}">
            </div>
            <div class="col-md-4" class="form-label">
                <label for="ordinaria">Diurna Ordinaria:</label>
                <input type="text" name="ordinaria" id="ordinaria" class="form-control" value="{{ $registro->extrasordinarias ?? '' }}" disabled>
            </div>
            <div class="col-md-4" class="form-label">
                <label for="ordinariaNocturna">Nocturna Ordinaria:</label>
                <input type="text" name="ordinariaNocturna" id="ordinariaNocturna" class="form-control" value="{{ $registro->nocturnasordinarias ?? '' }}" disabled>
            </div>
            <div class="col-md-4" class="form-label">
                <label for="extraNocturna">Extra Nocturna:</label>
                <input type="text" name="extraNocturna" id="extraNocturna" class="form-control" value="{{ $registro->extrasnocturnas ?? '' }}" disabled>
            </div>


            <!-- Agregar los demás campos -->
            <div class="col-12">
                <button type="submit" class="btn btn-primary">{{ isset($registro) ? 'Actualizar' : 'Crear' }}</button>
                <a href="{{ route('registros.index') }}" class="btn btn-secondary">Cancelar</a>

        </form>

    </div>
</div>
@endsection