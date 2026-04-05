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
        <div class="app-shell">
            @include('layouts.navigation')

            <!-- Page Heading -->
            @isset($header)
                <header class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-4 fade-rise">
                    <div class="surface-panel px-6 py-5">
                        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p class="text-xs font-semibold tracking-[0.12em] uppercase text-slate-500">Panel Operativo</p>
                                {{ $header }}
                            </div>
                            <p class="text-sm text-slate-500">{{ now()->timezone(config('app.timezone'))->translatedFormat('l, d \d\e F \d\e Y H:i') }}</p>
                        </div>
                    </div>
                </header>
            @endisset

            <!-- Page Content -->
            <main class="max-w-7xl mx-auto px-4 pb-10 sm:px-6 lg:px-8">
                {{ $slot }}
            </main>
        </div>
    </body>
</html>
