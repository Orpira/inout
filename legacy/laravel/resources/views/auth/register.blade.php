<x-guest-layout>
    <div class="mb-6">
        <h2 class="text-2xl font-semibold mb-1">Crear cuenta</h2>
        <p class="text-slate-600">Registra un usuario para administrar empleados, turnos y asistencia.</p>
    </div>

    <form method="POST" action="{{ route('register') }}" class="space-y-4">
        @csrf

        <div>
            <x-input-label for="name" value="Nombre completo" />
            <x-text-input id="name" type="text" name="name" :value="old('name')" required autofocus autocomplete="name" />
            <x-input-error :messages="$errors->get('name')" class="mt-2 text-sm text-red-700" />
        </div>

        <div>
            <x-input-label for="email" value="Correo electronico" />
            <x-text-input id="email" type="email" name="email" :value="old('email')" required autocomplete="username" />
            <x-input-error :messages="$errors->get('email')" class="mt-2 text-sm text-red-700" />
        </div>

        <div>
            <x-input-label for="password" value="Contrasena" />
            <x-text-input id="password" type="password" name="password" required autocomplete="new-password" />
            <x-input-error :messages="$errors->get('password')" class="mt-2 text-sm text-red-700" />
        </div>

        <div>
            <x-input-label for="password_confirmation" value="Confirmar contrasena" />
            <x-text-input id="password_confirmation" type="password" name="password_confirmation" required autocomplete="new-password" />
            <x-input-error :messages="$errors->get('password_confirmation')" class="mt-2 text-sm text-red-700" />
        </div>

        <div class="pt-2">
            <x-primary-button class="w-full">Crear usuario</x-primary-button>
        </div>
    </form>

    <p class="mt-5 text-sm text-slate-600 text-center">
        Ya tienes cuenta?
        <a href="{{ route('login') }}" class="font-semibold text-[var(--brand)] hover:underline">Iniciar sesion</a>
    </p>
</x-guest-layout>
