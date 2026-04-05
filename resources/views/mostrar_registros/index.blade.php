@extends('layouts.crud')

@section('title', 'Consolidado de Registros')
@section('pageTitle', 'Consolidado de Asistencia')

@section('headerActions')
<a href="{{ route('registro_horario.create') }}" class="btn-primary">Nuevo Registro</a>
@endsection

@section('content')
<div class="mb-4 flex flex-wrap gap-2 items-center">
    <form class="flex flex-wrap gap-2" method="GET" action="{{ route('registro_horario.index') }}">
        <input class="app-input max-w-md" type="search" name="search" value="{{ request('search') }}" placeholder="Buscar Registro">
        <button class="btn-secondary" type="submit">Buscar</button>
    </form>

    <form action="{{ route('mostrar.index') }}" method="GET" class="ml-auto flex items-center gap-2">
        <label class="text-sm text-slate-600">Mostrar</label>
        <select class="app-input !w-auto" name="perPage" onchange="this.form.submit()">
            <option value="10" {{ request('perPage') == 10 ? 'selected' : '' }}>10</option>
            <option value="25" {{ request('perPage') == 25 ? 'selected' : '' }}>25</option>
            <option value="50" {{ request('perPage') == 50 ? 'selected' : '' }}>50</option>
            <option value="100" {{ request('perPage') == 100 ? 'selected' : '' }}>100</option>
        </select>
    </form>
</div>

<div class="overflow-x-auto rounded-xl border border-slate-200">
    <table class="min-w-full divide-y divide-slate-200 bg-white text-sm">
        <thead class="bg-slate-100 text-slate-700">
            <tr>
                <th class="px-4 py-3 text-left">ID</th>
                <th class="px-4 py-3 text-left">Empleado</th>
                <th class="px-4 py-3 text-left">Fecha</th>
                <th class="px-4 py-3 text-left">Entrada</th>
                <th class="px-4 py-3 text-left">Salida</th>
                <th class="px-4 py-3 text-left">Horas</th>
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
                <td class="px-4 py-3">{{ $registro_horario->entrada ? date('d-m-Y', strtotime($registro_horario->entrada)) : 'N/A' }}</td>
                <td class="px-4 py-3">{{ $registro_horario->entrada ? date('H:i:s', strtotime($registro_horario->entrada)) : 'N/A' }}</td>
                <td class="px-4 py-3">{{ $registro_horario->salida ? date('H:i:s', strtotime($registro_horario->salida)) : 'Pendiente' }}</td>
                <td class="px-4 py-3">{{ $registro_horario->tiempo_total ? date('H:i:s', strtotime($registro_horario->tiempo_total)) : 'N/A' }}</td>
                <td class="px-4 py-3">{{ $registro_horario->extrasordinarias }}</td>
                <td class="px-4 py-3">{{ $registro_horario->nocturnasordinarias }}</td>
                <td class="px-4 py-3">{{ $registro_horario->extrasnocturnas }}</td>
                <td class="px-4 py-3">
                    <span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {{ $registro_horario->estado === 'PENDIENTE' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700' }}">{{ $registro_horario->estado }}</span>
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

<div class="mt-4">
    {{ $registros_horarios->links() }}
</div>
@endsection
