@extends('adminlte::page')

@section('title', 'Lista de Empleados')

@section('content')
<div class="card">
    <div class="card-header">
        <h3 class="card-title">Empleados</h3>
        <a href="{{ route('empleado.create') }}" class="btn btn-success float-right">Nuevo Empleado</a>
    </div>
    <div class="card-body">
        <table class="table table-bordered">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Nombre</th>
                    <th>Apellidos</th>
                    <th>Identificación</th>
                    <th>Turno</th>
                    <th>Cargo</th>
                    <th>Salario</th>
                    <th>Horas x Semana</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                @foreach($empleados as $empleado)
                <tr>
                    <td>{{ $empleado->id }}</td>
                    <td>{{ $empleado->nombre }}</td>
                    <td>{{ $empleado->apellido }}</td>
                    <td>{{ $empleado->identificacion }}</td>
                    <td>{{ $empleado->turnoid }}</td>
                    <td>{{ $empleado->cargo }}</td>
                    <td>{{ $empleado->salario }}</td>
                    <td>{{ $empleado->horasxsemana }}</td>

                    <td>
                        <a href="{{ route('empleado.edit', ['empleado' => $empleado->id]) }}" class="btn btn-warning">Editar</a>
                        <form action="{{ route('empleado.destroy', ['empleado' => $empleado->id]) }}" method="POST" style="display:inline;">
                            @csrf
                            @method('DELETE')
                            <button class="btn btn-danger" onclick="return confirm('¿Estás seguro?')">Eliminar</button>
                        </form>
                    </td>
                </tr>
                @endforeach
            </tbody>
        </table>
    </div>
</div>
@endsection