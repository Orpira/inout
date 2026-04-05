<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">

    <title>INOUT | Control de Horario Laboral</title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">

    @vite(['resources/css/app.css', 'resources/ts/app.ts'])
</head>

<body class="antialiased">
    <div class="min-h-screen">
        <header class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
            <nav class="surface-panel px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between fade-rise">
                <a href="{{ url('/') }}" class="inline-flex items-center gap-3">
                    <span class="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--brand)] text-white font-bold">IO</span>
                    <span class="font-semibold text-slate-800">INOUT Control Horario</span>
                </a>
                <div class="flex items-center gap-2 sm:gap-3">
                    <a href="{{ route('control.horarios') }}" class="btn-secondary">Marcar Asistencia</a>
                    @auth
                        <a href="{{ route('dashboard') }}" class="btn-primary">Abrir Panel</a>
                    @else
                        <a href="{{ route('login') }}" class="btn-primary">Iniciar Sesion</a>
                    @endauth
                </div>
            </nav>
        </header>

        <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
            <section class="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 items-stretch">
                <article class="surface-panel p-7 sm:p-10 fade-rise">
                    <div class="flex items-center gap-3 mb-6">
                        <div class="shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center overflow-hidden">
                            <img src="{{ asset('logo.png') }}" alt="INOUT Control Horario" class="w-[88%] h-[88%] object-contain">
                        </div>
                         <h1 class="text-xl m:text-5xl font-semibold leading-tight mb-5">
                         <span class="text-[var(--brand)]">Sistema de Asistencia por Turnos</span>
                    </h1>
                    </div>
                    <h1 class="text-4xl m:text-5xl font-semibold leading-tight mb-5">
                        Claridad operativa para <span class="text-[var(--brand)]">ingresos, salidas y horas extras</span>
                    </h1>
                    <p class="text-lg text-slate-600 leading-relaxed max-w-2xl mb-8">
                        Registra marcaciones de forma rapida, audita novedades por empleado y liquida jornadas con criterios diurnos, nocturnos y festivos en un solo flujo.
                    </p>
                    <div class="flex flex-wrap gap-3">
                        <a href="{{ route('control.horarios') }}" class="btn-primary">Registrar Entrada o Salida</a>
                        @auth
                            <a href="{{ route('dashboard') }}" class="btn-secondary">Ver indicadores</a>
                        @else
                            <a href="{{ route('login') }}" class="btn-secondary">Acceso administrativo</a>
                        @endauth
                    </div>
                </article>

                <aside class="surface-panel p-7 sm:p-8 fade-rise" style="animation-delay: 120ms;">
                    <h2 class="text-xl font-semibold mb-5">Flujo de uso recomendado</h2>
                    <ol class="space-y-4">
                        <li class="surface-panel-soft p-4">
                            <p class="font-semibold text-slate-800">1. Marcacion en punto operativo</p>
                            <p class="text-slate-600 mt-1">El colaborador registra su codigo y confirma tipo de evento (entrada o salida).</p>
                        </li>
                        <li class="surface-panel-soft p-4">
                            <p class="font-semibold text-slate-800">2. Validacion y trazabilidad</p>
                            <p class="text-slate-600 mt-1">El sistema guarda fecha, hora, estado y novedades para seguimiento diario.</p>
                        </li>
                        <li class="surface-panel-soft p-4">
                            <p class="font-semibold text-slate-800">3. Consolidado para nomina</p>
                            <p class="text-slate-600 mt-1">Horas ordinarias y extras quedan listas para consulta y liquidacion.</p>
                        </li>
                    </ol>
                </aside>
            </section>

            <section class="grid md:grid-cols-3 gap-4 mt-8">
                <article class="surface-panel p-6 fade-rise" style="animation-delay: 160ms;">
                    <h3 class="font-semibold text-lg mb-2">Control de turnos</h3>
                    <p class="text-slate-600">Organiza horarios por empleado y visualiza cumplimiento operativo en tiempo real.</p>
                </article>
                <article class="surface-panel p-6 fade-rise" style="animation-delay: 220ms;">
                    <h3 class="font-semibold text-lg mb-2">Calculo confiable</h3>
                    <p class="text-slate-600">Soporte para recargos diurnos, nocturnos y festivos con base salarial mensual.</p>
                </article>
                <article class="surface-panel p-6 fade-rise" style="animation-delay: 280ms;">
                    <h3 class="font-semibold text-lg mb-2">Toma de decisiones</h3>
                    <p class="text-slate-600">Datos claros para supervisores, RRHH y administracion de operaciones.</p>
                </article>
            </section>
        </main>
    </div>
</body>

</html>
