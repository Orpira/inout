// Vista Blade (resumen de cálculo)
@extends('layouts.app')

@section('content')
<div class="container">
    <h1>Resumen de Horas Extras</h1>
    <table class="table">
        <thead>
            <tr>
                <th>Empleado</th>
                <th>Tipo</th>
                <th>Horas</th>
                <th>Valor Calculado</th>
            </tr>
        </thead>
        <tbody>
            @foreach($horas_extras as $hora_extra)
            <tr>
                <td>{{ $hora_extra->turnos->empleados->nombre }}</td>
                <td>{{ $hora_extra->tipo }}</td>
                <td>{{ $hora_extra->horas }}</td>
                <td>{{ $hora_extra->valor_calculado }}</td>
            </tr>
            @endforeach
        </tbody>
    </table>
</div>
@endsection