<x-guest-layout>
    <div class="mb-6">
        <h2 class="text-2xl font-semibold mb-1">Verificar correo</h2>
        <p class="text-slate-600">
            Antes de continuar, confirma tu direccion de correo usando el enlace que enviamos.
            Si no lo recibiste, puedes solicitar uno nuevo.
        </p>
    </div>

    @if (session('status') == 'verification-link-sent')
        <div class="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-medium text-emerald-700">
            Se envio un nuevo enlace de verificacion a tu correo.
        </div>
    @endif

    <div class="mt-4 flex items-center justify-between gap-3">
        <form method="POST" action="{{ route('verification.send') }}">
            @csrf

            <x-primary-button>Reenviar correo de verificacion</x-primary-button>
        </form>

        <form method="POST" action="{{ route('logout') }}">
            @csrf

            <button type="submit" class="text-sm font-semibold text-slate-600 hover:text-slate-900">
                Cerrar sesion
            </button>
        </form>
    </div>
</x-guest-layout>
