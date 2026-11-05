@extends('layouts.crud')

@section('title', 'Empleados')
@section('pageTitle', 'Gestión de Empleados')

@section('headerActions')
<a href="{{ route('empleado.create') }}" class="btn-primary">Nuevo Empleado</a>
@endsection

@section('content')
<div class="overflow-x-auto rounded-xl border border-slate-200">
    <table class="min-w-full divide-y divide-slate-200 bg-white text-sm">
        <thead class="bg-slate-100 text-slate-700">
            <tr>
                <th class="px-4 py-3 text-left">ID</th>
                <th class="px-4 py-3 text-left">Nombre</th>
                <th class="px-4 py-3 text-left">Apellidos</th>
                <th class="px-4 py-3 text-left">Identificación</th>
                <th class="px-4 py-3 text-left">Cargo</th>
                <th class="px-4 py-3 text-left">Salario</th>
                <th class="px-4 py-3 text-left">Horas/Semana</th>
                <th class="px-4 py-3 text-left">Acciones</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
            @forelse($empleados as $empleado)
            <tr class="hover:bg-slate-50">
                <td class="px-4 py-3">{{ $empleado->id }}</td>
                <td class="px-4 py-3">{{ $empleado->nombre }}</td>
                <td class="px-4 py-3">{{ $empleado->apellido }}</td>
                <td class="px-4 py-3">{{ $empleado->identificacion }}</td>
                <td class="px-4 py-3">{{ $empleado->cargo }}</td>
                <td class="px-4 py-3">{{ $empleado->salario }}</td>
                <td class="px-4 py-3">{{ $empleado->horasxsemana }}</td>
                <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-2">
                        <a href="{{ route('empleado.edit', ['empleado' => $empleado->id]) }}" class="btn-secondary">Editar</a>
                        <form action="{{ route('empleado.destroy', ['empleado' => $empleado->id]) }}" method="POST" onsubmit="return confirm('¿Estás seguro?')">
                            @csrf
                            @method('DELETE')
                            <button type="submit" class="btn-danger">Eliminar</button>
                        </form>
                    </div>
                </td>
            </tr>
            @empty
            <tr>
                <td colspan="8" class="px-4 py-8 text-center text-slate-500">No hay empleados registrados.</td>
            </tr>
            @endforelse
        </tbody>
    </table>
</div>
@endsection
