<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-2xl leading-tight">
            Centro de Operaciones
        </h2>
    </x-slot>

    <div class="py-4 sm:py-6 space-y-6 fade-rise">
        <section class="grid gap-4 md:grid-cols-3">
            <article class="surface-panel p-5">
                <p class="text-xs uppercase tracking-[0.12em] text-slate-500 font-semibold">Punto Operativo</p>
                <h3 class="mt-2 text-xl font-semibold">Marcacion del Dia</h3>
                <p class="mt-2 text-slate-600">Registra entradas y salidas en la interfaz de asistencia.</p>
                <a href="{{ route('control.horarios') }}" class="btn-primary mt-4">Abrir Marcacion</a>
            </article>

            <article class="surface-panel p-5">
                <p class="text-xs uppercase tracking-[0.12em] text-slate-500 font-semibold">Gestion</p>
                <h3 class="mt-2 text-xl font-semibold">Empleados</h3>
                <p class="mt-2 text-slate-600">Administra informacion de personal y su estructura operativa.</p>
                <a href="{{ route('empleado.index') }}" class="btn-secondary mt-4">Ir a Empleados</a>
            </article>

            <article class="surface-panel p-5">
                <p class="text-xs uppercase tracking-[0.12em] text-slate-500 font-semibold">Seguimiento</p>
                <h3 class="mt-2 text-xl font-semibold">Entradas y Salidas</h3>
                <p class="mt-2 text-slate-600">Consulta movimientos y verifica trazabilidad de asistencia.</p>
                <a href="{{ route('registro_horario.index') }}" class="btn-secondary mt-4">Ver Registros</a>
            </article>
        </section>

        <section class="surface-panel p-6 sm:p-7">
            <h3 class="text-xl font-semibold mb-3">Flujo recomendado para el equipo administrativo</h3>
            <div class="grid gap-4 md:grid-cols-3 text-sm">
                <div class="surface-panel-soft p-4">
                    <p class="font-semibold text-slate-800">1. Validar marcaciones</p>
                    <p class="mt-1 text-slate-600">Revisa ingresos y salidas del dia para detectar novedades.</p>
                </div>
                <div class="surface-panel-soft p-4">
                    <p class="font-semibold text-slate-800">2. Ajustar turnos</p>
                    <p class="mt-1 text-slate-600">Sincroniza horarios por empleado segun la operacion real.</p>
                </div>
                <div class="surface-panel-soft p-4">
                    <p class="font-semibold text-slate-800">3. Consolidar horas</p>
                    <p class="mt-1 text-slate-600">Prepara datos de horas extras y asistencia para reportes.</p>
                </div>
            </div>
        </section>
    </div>
</x-app-layout>
