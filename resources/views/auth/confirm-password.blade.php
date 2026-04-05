<x-guest-layout>
    <div class="mb-6">
        <h2 class="text-2xl font-semibold mb-1">Confirmar identidad</h2>
        <p class="text-slate-600">Por seguridad, ingresa tu contrasena para continuar.</p>
    </div>

    <form method="POST" action="{{ route('password.confirm') }}" class="space-y-4">
        @csrf

        <div>
            <x-input-label for="password" value="Contrasena" />
            <x-text-input id="password" type="password" name="password" required autocomplete="current-password" />
            <x-input-error :messages="$errors->get('password')" class="mt-2 text-sm text-red-700" />
        </div>

        <div class="pt-2">
            <x-primary-button class="w-full">Confirmar</x-primary-button>
        </div>
    </form>
</x-guest-layout>
