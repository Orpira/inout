<x-guest-layout>
    <div class="mb-6">
        <h2 class="text-2xl font-semibold mb-1">Nueva contrasena</h2>
        <p class="text-slate-600">Define una clave segura para recuperar el acceso a tu cuenta.</p>
    </div>

    <form method="POST" action="{{ route('password.store') }}" class="space-y-4">
        @csrf

        <input type="hidden" name="token" value="{{ $request->route('token') }}">

        <div>
            <x-input-label for="email" value="Correo electronico" />
            <x-text-input id="email" type="email" name="email" :value="old('email', $request->email)" required autofocus autocomplete="username" />
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
            <x-primary-button class="w-full">Actualizar contrasena</x-primary-button>
        </div>
    </form>
</x-guest-layout>
