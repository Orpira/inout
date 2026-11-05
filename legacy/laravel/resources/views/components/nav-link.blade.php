@props(['active'])

@php
$classes = ($active ?? false)
            ? 'inline-flex items-center px-3 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white'
            : 'inline-flex items-center px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition';
@endphp

<a {{ $attributes->merge(['class' => $classes]) }}>
    {{ $slot }}
</a>
