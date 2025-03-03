@extends('adminlte::page')

@section('title', 'Registro Entradas y Salidas')

@section('content')
<div class="card">
    <div class="card-header">
        <h3 class="card-title">Entradas y Salidas </h3>

        <h3 class="card-title">{{ isset($registro)  }}</h3>
    </div>
    <div class="card-body">
        <table class="table table-bordered">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Nombre</th>
                    <th>Fecha</th>
                    <th>H.Entrada</th>
                    <th>H.Salida</th>
                    <th>Ext.Ord.Diurna</th>
                    <th>Ext.Ord.Noctuna</th>
                    <th>Ext.Noctuna</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                @foreach($registros as $registro)
                <tr>
                    <td>{{ $registro->id }}</td>
                    <td>{{ $registro->empleado->nombre . ' ' . $registro->empleado->apellido }}</td>
                    <td>{{ $registro->fecha }}</td>
                    <td>{{ $registro->entrada }}</td>
                    <td>{{ $registro->salida }}</td>
                    <td>{{ $registro->extrasordinarias }}</td>
                    <td>{{ $registro->nocturnasordinarias }}</td>
                    <td>{{ $registro->extrasnocturnas }}</td>

                    <td>
                        <a href="{{ route('registros.edit', ['registro' => $registro->id]) }}" class="btn btn-warning">Editar</a>
                        <form action="{{ route('registros.destroy', ['registro' => $registro->id]) }}" method="POST" style="display:inline;">
                            @csrf
                            @method('DELETE')
                            <button class="btn btn-danger" onclick="return confirm('¿Estás seguro?')">Eliminar</button>
                        </form>

                    </td>
                </tr>
                @endforeach
            </tbody>

        </table>
        <form id="logout-form" action="{{ route('logout') }}" method="POST">
            @csrf
            <button type="submit" class="btn btn-danger">Salir</button>
        </form>
    </div>
</div>

@endsection