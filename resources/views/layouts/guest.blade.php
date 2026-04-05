<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">

        <title>{{ config('app.name', 'INOUT') }}</title>

        <!-- Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">

        <!-- Scripts -->
        @vite(['resources/css/app.css', 'resources/ts/app.ts'])
    </head>
    <body class="antialiased">
        <div class="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
            <div class="mx-auto max-w-5xl grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-center">
                <section class="surface-panel p-8 sm:p-10 fade-rise">
                    <a href="{{ url('/') }}" class="inline-flex items-center gap-3 mb-8">
                        <span class="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--brand)] text-white font-bold">IO</span>
                        <span class="text-lg font-semibold text-slate-800">INOUT Control Horario</span>
                    </a>
                    <h1 class="text-3xl sm:text-4xl font-semibold mb-4">Gestión clara de turnos, ingresos y salidas</h1>
                    <p class="text-slate-600 text-lg leading-relaxed mb-8">
                        Centraliza la asistencia del equipo, reduce errores de marcación y mejora el cálculo de horas extras con trazabilidad completa.
                    </p>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <div class="surface-panel-soft p-4">
                            <p class="font-semibold text-slate-800">1. Registro</p>
                            <p class="text-slate-600 mt-1">Marcación rápida por código y confirmación inmediata.</p>
                        </div>
                        <div class="surface-panel-soft p-4">
                            <p class="font-semibold text-slate-800">2. Validación</p>
                            <p class="text-slate-600 mt-1">Control de estado por empleado y turno activo.</p>
                        </div>
                        <div class="surface-panel-soft p-4">
                            <p class="font-semibold text-slate-800">3. Liquidación</p>
                            <p class="text-slate-600 mt-1">Horas ordinarias y extras listas para reporte.</p>
                        </div>
                    </div>
                </section>

                <section class="surface-panel p-6 sm:p-8 fade-rise" style="animation-delay: 120ms;">
                    {{ $slot }}
                </section>
            </div>
        </div>
    </body>
</html>
