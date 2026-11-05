<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SetTimeZone
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        // Usar la zona horaria del sistema
        $timezone = date_default_timezone_get() ?: 'UTC';
        date_default_timezone_set($timezone);
        
        // Configurar Carbon para usar la misma zona horaria
        \Carbon\Carbon::setLocale('es');
        \Carbon\Carbon::setToStringFormat('Y-m-d H:i:s');
        
        return $next($request);
    }
}
