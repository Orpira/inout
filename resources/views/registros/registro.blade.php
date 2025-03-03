@extends('adminlte::page')

@section('title', 'Registro de Ingreso y Salida')

@section('content_header')
<h1>Registro de Ingreso y Salida</h1>

@endsection

@section('content')
<div class="card">
    <div class="card-body">

        @if(session('success'))
        <div class="alert alert-success">
            {{ session('success') }}
        </div>
        @endif

        @if(session('error'))
        <div class="alert alert-danger">
            {{ session('error') }}
        </div>
        @endif

        <form action="{{ route('registrar_empleado') }}" method="POST">
            @csrf

            <div class="form-group">
                <label for="codigo_identificacion">Código de Identificación</label>
                <input type="password" name="codigo_identificacion" id="codigo_identificacion"
                    class="form-control" placeholder="Ingrese el código del empleado">
            </div>
        </form>

    </div>
</div>
@endsection