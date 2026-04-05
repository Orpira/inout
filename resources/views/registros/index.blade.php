@extends('layouts.crud')

@section('title', 'Registros Legacy')
@section('pageTitle', 'Registros Históricos (Legacy)')

@section('content')
<div class="overflow-x-auto rounded-xl border border-slate-200">
    <table class="min-w-full divide-y divide-slate-200 bg-white text-sm">
        <thead class="bg-slate-100 text-slate-700">
            <tr>
                <th class="px-4 py-3 text-left">ID</th>
                <th class="px-4 py-3 text-left">Nombre</th>
                <th class="px-4 py-3 text-left">Fecha</th>
                <th class="px-4 py-3 text-left">Entrada</th>
                <th class="px-4 py-3 text-left">Salida</th>
                <th class="px-4 py-3 text-left">Diurna</th>
                <th class="px-4 py-3 text-left">Nocturna</th>
                <th class="px-4 py-3 text-left">Festiva</th>
                <th class="px-4 py-3 text-left">Acciones</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
            @forelse($registros as $registro)
            <tr class="hover:bg-slate-50">
                <td class="px-4 py-3">{{ $registro->id }}</td>
                <td class="px-4 py-3">{{ $registro->empleado->nombre . ' ' . $registro->empleado->apellido }}</td>
                <td class="px-4 py-3">{{ $registro->fecha }}</td>
                <td class="px-4 py-3">{{ $registro->entrada }}</td>
                <td class="px-4 py-3">{{ $registro->salida }}</td>
                <td class="px-4 py-3">{{ $registro->extrasordinarias }}</td>
                <td class="px-4 py-3">{{ $registro->nocturnasordinarias }}</td>
                <td class="px-4 py-3">{{ $registro->extrasnocturnas }}</td>
                <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-2">
                        <a href="{{ route('registros.edit', ['registro' => $registro->id]) }}" class="btn-secondary">Editar</a>
                        <form action="{{ route('registros.destroy', ['registro' => $registro->id]) }}" method="POST" onsubmit="return confirm('¿Estás seguro?')">
                            @csrf
                            @method('DELETE')
                            <button class="btn-danger" type="submit">Eliminar</button>
                        </form>
                    </div>
                </td>
            </tr>
            @empty
            <tr>
                <td colspan="9" class="px-4 py-8 text-center text-slate-500">No hay registros legacy.</td>
            </tr>
            @endforelse
        </tbody>
    </table>
</div>
@endsection
