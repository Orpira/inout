@extends('layouts.crud')

@section('title', 'Registro de Ingreso y Salida')
@section('pageTitle', 'Registro Manual por Código')

@section('content')
<form action="{{ route('registrar_empleado') }}" method="POST" class="max-w-xl">
    @csrf
    <div class="space-y-3">
        <label for="codigo_identificacion" class="app-label">Código de Identificación</label>
        <input type="password" name="codigo_identificacion" id="codigo_identificacion" class="app-input" placeholder="Ingrese el código del empleado" required>
        <button type="submit" class="btn-primary">Registrar Entrada o Salida</button>
    </div>
</form>
@endsection
