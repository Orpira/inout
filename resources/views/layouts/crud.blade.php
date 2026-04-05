<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'INOUT CRUD')</title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">

    @vite(['resources/css/app.css', 'resources/ts/app.ts'])
</head>
<body class="antialiased">
    <div class="app-shell">
        <header class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
            <div class="surface-panel px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between gap-3">
                <a href="{{ url('/') }}" class="inline-flex items-center gap-3 no-underline">
                    <span class="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--brand)] text-white font-bold">IO</span>
                    <span class="font-semibold text-slate-800">INOUT · Gestión Operativa</span>
                </a>
                <div class="flex items-center gap-2">
                    <a href="{{ route('dashboard') }}" class="btn-secondary">Panel</a>
                    <a href="{{ route('control.horarios') }}" class="btn-primary">Marcación</a>
                </div>
            </div>
        </header>

        <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <section class="surface-panel p-6 sm:p-7 fade-rise">
                <div class="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p class="text-xs font-semibold tracking-[0.14em] uppercase text-slate-500">Módulo CRUD</p>
                        <h1 class="text-2xl sm:text-3xl font-semibold">@yield('pageTitle', 'Gestión de registros')</h1>
                    </div>
                    @yield('headerActions')
                </div>

                @if(session('success'))
                    <div class="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        {{ session('success') }}
                    </div>
                @endif

                @if(session('error'))
                    <div class="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {{ session('error') }}
                    </div>
                @endif

                @yield('content')
            </section>
        </main>
    </div>

    @yield('scripts')
</body>
</html>
