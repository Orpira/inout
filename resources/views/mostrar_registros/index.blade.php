@extends('adminlte::page')

@section('title', 'Registro Entradas y Salidas')

@section('content')

<div class="card">
    <div class="card-header">
        <h3 class="card-title">Entradas - Salidas</h3>
        <a href="{{ route('registro_horario.create') }}" class="btn btn-success float-right">Nuevo Registro</a>
    </div>
</div>
<nav class="navbar bg-body-tertiary">
    <div class="container-fluid">
        <a class="navbar-brand"></a>
        <form class="d-flex" role="search" method="GET" action="{{ route('registro_horario.index') }}">
            <input class="form-control me-2" type="search" name="search" placeholder="Buscar Registro" aria-label="Search">
            <button class="btn btn-outline-success" type="submit">Buscar</button>
        </form>
    </div>
</nav>
<div class="card-body">
    <form action="{{ route('mostrar.index') }}" method="GET">
        <select name="perPage" onchange="this.form.submit()">
            <option value="10" {{ request('perPage') == 10 ? 'selected' : '' }}>10</option>
            <option value="25" {{ request('perPage') == 25 ? 'selected' : '' }}>25</option>
            <option value="50" {{ request('perPage') == 50 ? 'selected' : '' }}>50</option>
            <option value="100" {{ request('perPage') == 100 ? 'selected' : '' }}>100</option>
        </select>
    </form>
    <table class="table table-bordered">
        <thead>
            <tr>
                <th>Id</th>
                <th>Nombre</th>
                <th>Fecha</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Horas Trabajadas</th>
                <th>Ext.Ord.Diurna</th>
                <th>Ext.Ord.Noctuna</th>
                <th>Ext.Noctuna</th>
                <th>Estado</th>
                <th>Acciones</th>
            </tr>
        </thead>
        <tbody>
            @foreach($registros_horarios as $registro_horario)
            <tr>
                <td>{{ $registro_horario->id }}</td>
                <td>{{ $registro_horario->empleado->nombre . ' ' . $registro_horario->empleado->apellido }}</td>
                <td>{{date('d-m-Y',strtotime( $registro_horario->entrada)) }}</td>
                <td>{{date('H:i:s',strtotime( $registro_horario->entrada)) }}</td>
                <td>{{date('H:i:s',strtotime( $registro_horario->salida)) }}</td>
                <td>{{date('H:i:s',strtotime( $registro_horario->tiempo_total)) }}</td>
                <td>{{ $registro_horario->extrasordinarias }}</td>
                <td>{{ $registro_horario->nocturnasordinarias }}</td>
                <td>{{ $registro_horario->extrasnocturnas }}</td>
                <td>{{ $registro_horario->estado }}</td>

                <td>
                    <a href="{{ route('registro_horario.edit', ['registro_horario' => $registro_horario->id]) }}" class="btn btn-warning">Editar</a>
                    <form action="{{ route('registro_horario.destroy', ['registro_horario' => $registro_horario->id]) }}" method="POST" style="display:inline;">
                        @csrf
                        @method('DELETE')
                        <button class="btn btn-danger" onclick="return confirm('¿Estás seguro?')">Eliminar</button>
                    </form>

                </td>
            </tr>
            @endforeach
        </tbody>

    </table>
    {{ $registros_horarios->links() }}
</div>
@endsection