@extends('layouts.app')

@section('content')
<div class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
    <div class="surface-panel p-6 sm:p-7 fade-rise">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div>
                <h1 class="text-2xl font-semibold mb-1">Resumen de Horas Extras</h1>
                <p class="text-slate-600">Consolidado por empleado y tipo de recargo para soporte de nómina.</p>
            </div>
        </div>

        <div class="overflow-x-auto">
            <table class="min-w-full text-sm border border-slate-200 rounded-xl overflow-hidden">
                <thead class="bg-slate-100 text-slate-700">
                    <tr>
                        <th class="px-4 py-3 text-left">Empleado</th>
                        <th class="px-4 py-3 text-left">Tipo</th>
                        <th class="px-4 py-3 text-left">Horas</th>
                        <th class="px-4 py-3 text-left">Valor Calculado</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 bg-white">
                    @forelse($horas_extras as $hora_extra)
                    <tr>
                        <td class="px-4 py-3">{{ $hora_extra->turnos->empleados->nombre ?? 'N/A' }}</td>
                        <td class="px-4 py-3">{{ $hora_extra->tipo }}</td>
                        <td class="px-4 py-3">{{ $hora_extra->horas }}</td>
                        <td class="px-4 py-3">{{ number_format($hora_extra->valor_calculado, 2, ',', '.') }}</td>
                    </tr>
                    @empty
                    <tr>
                        <td colspan="4" class="px-4 py-6 text-center text-slate-500">No hay datos de horas extras para mostrar.</td>
                    </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </div>
</div>
@endsection