<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\View;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //View::addNamespace('adminlte', resource_path('vendor/adminlte'));
        DB::listen(function ($query) {
            Log::info(
                "Query ejecutado: {$query->sql}, Valores: [" . implode(", ", $query->bindings) . "], Tiempo: {$query->time}ms"
            );
        });
    }
}
