<nav x-data="{ open: false }" class="border-b border-slate-200/70 bg-white/90 backdrop-blur sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
            <div class="flex items-center gap-3">
                <a href="{{ route('dashboard') }}" class="inline-flex items-center gap-3">
                    <span class="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--brand)] text-white font-bold">IO</span>
                    <span class="hidden sm:block text-sm font-semibold tracking-[0.08em] uppercase text-slate-600">Control Horario</span>
                </a>
                <div class="hidden sm:flex items-center gap-2 ms-4">
                    <x-nav-link :href="route('dashboard')" :active="request()->routeIs('dashboard')">Panel</x-nav-link>
                    <x-nav-link :href="route('empleado.index')" :active="request()->routeIs('empleado.*')">Empleados</x-nav-link>
                    <x-nav-link :href="route('registro_horario.index')" :active="request()->routeIs('registro_horario.*')">Entradas y Salidas</x-nav-link>
                    <x-nav-link :href="route('control.horarios')" :active="request()->routeIs('control.horarios')">Marcación</x-nav-link>
                </div>
            </div>

            <div class="hidden sm:flex sm:items-center sm:ms-6">
                <x-dropdown align="right" width="48">
                    <x-slot name="trigger">
                        <button class="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition">
                            <span class="w-7 h-7 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                                {{ strtoupper(substr(Auth::user()->name, 0, 1)) }}
                            </span>
                            <span>{{ Auth::user()->name }}</span>
                            <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
                            </svg>
                        </button>
                    </x-slot>

                    <x-slot name="content">
                        <x-dropdown-link :href="route('profile.edit')">Perfil</x-dropdown-link>
                        <form method="POST" action="{{ route('logout') }}">
                            @csrf
                            <x-dropdown-link :href="route('logout')" onclick="event.preventDefault(); this.closest('form').submit();">
                                Cerrar sesión
                            </x-dropdown-link>
                        </form>
                    </x-slot>
                </x-dropdown>
            </div>

            <div class="-me-2 flex items-center sm:hidden">
                <button @click="open = ! open" class="inline-flex items-center justify-center p-2 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 focus:outline-none transition">
                    <svg class="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                        <path :class="{'hidden': open, 'inline-flex': ! open }" class="inline-flex" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                        <path :class="{'hidden': ! open, 'inline-flex': open }" class="hidden" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>

        <div :class="{'block': open, 'hidden': ! open}" class="hidden sm:hidden pb-3">
            <div class="space-y-1">
                <x-responsive-nav-link :href="route('dashboard')" :active="request()->routeIs('dashboard')">Panel</x-responsive-nav-link>
                <x-responsive-nav-link :href="route('empleado.index')" :active="request()->routeIs('empleado.*')">Empleados</x-responsive-nav-link>
                <x-responsive-nav-link :href="route('registro_horario.index')" :active="request()->routeIs('registro_horario.*')">Entradas y Salidas</x-responsive-nav-link>
                <x-responsive-nav-link :href="route('control.horarios')" :active="request()->routeIs('control.horarios')">Marcación</x-responsive-nav-link>
            </div>

            <div class="pt-4 mt-3 border-t border-slate-200">
                <div class="px-3 mb-2">
                    <p class="font-semibold text-sm text-slate-800">{{ Auth::user()->name }}</p>
                    <p class="text-xs text-slate-500">{{ Auth::user()->email }}</p>
                </div>
                <x-responsive-nav-link :href="route('profile.edit')">Perfil</x-responsive-nav-link>
                <form method="POST" action="{{ route('logout') }}">
                    @csrf
                    <x-responsive-nav-link :href="route('logout')" onclick="event.preventDefault(); this.closest('form').submit();">
                        Cerrar sesión
                    </x-responsive-nav-link>
                </form>
            </div>
        </div>
    </div>
</nav>