<x-guest-layout>
    <div class="mb-6">
        <h2 class="text-2xl font-semibold mb-1">Iniciar sesion</h2>
        <p class="text-slate-600">Accede al panel para gestionar asistencia, turnos y novedades.</p>
    </div>

    <x-auth-session-status class="mb-4" :status="session('status')" />

    <form method="POST" action="{{ route('login') }}" class="space-y-4">
        @csrf

        <div>
            <x-input-label for="email" value="Correo electronico" />
            <x-text-input id="email" type="email" name="email" :value="old('email')" required autofocus autocomplete="username" />
            <x-input-error :messages="$errors->get('email')" class="mt-2 text-sm text-red-700" />
        </div>

        <div>
            <x-input-label for="password" value="Contrasena" />
            <x-text-input id="password" type="password" name="password" required autocomplete="current-password" />
            <x-input-error :messages="$errors->get('password')" class="mt-2 text-sm text-red-700" />
        </div>

        <div class="flex items-center justify-between gap-3">
            <label for="remember_me" class="inline-flex items-center gap-2 text-sm text-slate-600">
                <input id="remember_me" type="checkbox" class="rounded border-slate-300 text-[var(--brand)]" name="remember">
                <span>Recordar sesion</span>
            </label>

            @if (Route::has('password.request'))
                <a class="text-sm font-semibold text-[var(--brand)] hover:underline" href="{{ route('password.request') }}">
                    Olvide mi contrasena
                </a>
            @endif
        </div>

        <div class="pt-2">
            <x-primary-button class="w-full">Entrar al sistema</x-primary-button>
        </div>
    </form>

    @if (Route::has('register'))
        <p class="mt-5 text-sm text-slate-600 text-center">
            No tienes cuenta?
            <a href="{{ route('register') }}" class="font-semibold text-[var(--brand)] hover:underline">Crear cuenta</a>
        </p>
    @endif
</x-guest-layout>
