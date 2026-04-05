@extends('layouts.crud')

@section('title', 'Entradas y Salidas')
@section('pageTitle', 'Registros de Asistencia')

@section('headerActions')
<a href="{{ route('registro_horario.create') }}" class="btn-primary">Nuevo Registro</a>
@endsection

@section('content')
<form class="mb-4 flex flex-wrap gap-2" method="GET" action="{{ route('registro_horario.index') }}">
    <input class="app-input max-w-md" type="search" name="search" value="{{ request('search') }}" placeholder="Buscar por nombre, fecha o estado">
    <button class="btn-secondary" type="submit">Buscar</button>
</form>

<div class="overflow-x-auto rounded-xl border border-slate-200">
    <table class="min-w-full divide-y divide-slate-200 bg-white text-sm">
        <thead class="bg-slate-100 text-slate-700">
            <tr>
                <th class="px-4 py-3 text-left">ID</th>
                <th class="px-4 py-3 text-left">Empleado</th>
                <th class="px-4 py-3 text-left">Fecha</th>
                <th class="px-4 py-3 text-left">Entrada</th>
                <th class="px-4 py-3 text-left">Salida</th>
                <th class="px-4 py-3 text-left">Horas Trabajadas</th>
                <th class="px-4 py-3 text-left">Diurnas</th>
                <th class="px-4 py-3 text-left">Nocturnas</th>
                <th class="px-4 py-3 text-left">Festivas</th>
                <th class="px-4 py-3 text-left">Estado</th>
                <th class="px-4 py-3 text-left">Acciones</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
            @forelse($registros_horarios as $registro_horario)
            <tr class="hover:bg-slate-50">
                <td class="px-4 py-3">{{ $registro_horario->id }}</td>
                <td class="px-4 py-3">{{ $registro_horario->empleado->nombre . ' ' . $registro_horario->empleado->apellido }}</td>
                <td class="px-4 py-3">{{ date('d-m-Y', strtotime($registro_horario->entrada)) }}</td>
                <td class="px-4 py-3">{{ date('H:i:s', strtotime($registro_horario->entrada)) }}</td>
                <td class="px-4 py-3">{{ $registro_horario->salida ? date('H:i:s', strtotime($registro_horario->salida)) : 'Pendiente' }}</td>
                <td class="px-4 py-3">{{ $registro_horario->tiempo_total ? date('H:i:s', strtotime($registro_horario->tiempo_total)) : 'N/A' }}</td>
                <td class="px-4 py-3">{{ $registro_horario->extrasordinarias }}</td>
                <td class="px-4 py-3">{{ $registro_horario->nocturnasordinarias }}</td>
                <td class="px-4 py-3">{{ $registro_horario->extrasnocturnas }}</td>
                <td class="px-4 py-3">
                    <span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {{ $registro_horario->estado === 'PENDIENTE' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700' }}">
                        {{ $registro_horario->estado }}
                    </span>
                </td>
                <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-2">
                        <a href="{{ route('registro_horario.edit', ['registro_horario' => $registro_horario->id]) }}" class="btn-secondary">Editar</a>
                        <form action="{{ route('registro_horario.destroy', ['registro_horario' => $registro_horario->id]) }}" method="POST" onsubmit="return confirm('¿Estás seguro?')">
                            @csrf
                            @method('DELETE')
                            <button class="btn-danger" type="submit">Eliminar</button>
                        </form>
                    </div>
                </td>
            </tr>
            @empty
            <tr>
                <td colspan="11" class="px-4 py-8 text-center text-slate-500">No hay registros para mostrar.</td>
            </tr>
            @endforelse
        </tbody>
    </table>
</div>
@endsection
