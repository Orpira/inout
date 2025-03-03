@extends('adminlte::page')




@section('title', 'Formulario Entradas y Salidas')

@section('content')
<div class="card">
    <div class="card-header">
        <h3 class="card-title">{{ isset($registro) ? 'Editar Registro' : 'Crear Registro' }}</h3>
    </div>
    <div class="card-body">
        <form action="{{ isset($registro) ? route('registros.update', $registro) : route('registros.store') }}" method="POST">
            @csrf
            @if(isset($registro))
            @method('PUT')
            @endif
            <!-- CSS de Bootstrap -->
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">

            <!-- JS de Bootstrap -->
            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>

            <div class="form-group">
                <label for="empleado_id">Empleado</label>
                <input type="hidden" name="empleado_id" id="empleado_id" value="{{ old('empleado_id') }}" required>
                <div class="input-group">
                    <input type="text" id="empleado_nombre" class="form-control" value="{{ old('empleado_nombre') }}" readonly placeholder="Selecciona Empleado" required>
                    <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#empleadoModal">
                        Seleccionar
                    </button>
                </div>
            </div>
            <div class="form-group">
                <label for="fecha">Fecha</label>
                <input type="text" name="fecha" id="fecha" class="form-control" value="{{ $registro->fecha ?? '' }}" required>
            </div>
            <div class="form-group">
                <label for="entrada">Entrada</label>
                <input type="text" name="entrada" id="entrada" class="form-control" value="{{ $registro->entrada ?? '' }}" required>
            </div>
            <div class="form-group">
                <label for="salida">Salida</label>
                <input type="text" name="salida" id="salida" class="form-control" value="{{ $registro->salida ?? '' }}">
            </div>
            <div class="col-md-4" class="form-label">
                <label for="ordinaria">Diurna Ordinaria:</label>
                <input type="text" name="ordinaria" id="ordinaria" class="form-control" value="{{ $registro->extrasordinarias ?? '' }}" disabled>
            </div>
            <div class="col-md-4" class="form-label">
                <label for="ordinariaNocturna">Nocturna Ordinaria:</label>
                <input type="text" name="ordinariaNocturna" id="ordinariaNocturna" class="form-control" value="{{ $registro->nocturnasordinarias ?? '' }}" disabled>
            </div>
            <div class="col-md-4" class="form-label">
                <label for="extraNocturna">Extra Nocturna:</label>
                <input type="text" name="extraNocturna" id="extraNocturna" class="form-control" value="{{ $registro->extrasnocturnas ?? '' }}" disabled>
            </div>


            <!-- Agregar los demás campos -->
            <button type="submit" class="btn btn-primary">{{ isset($registro) ? 'Actualizar' : 'Crear' }}</button>

        </form>

        <!-- Modal para seleccionar la categoría -->
        <div class="modal fade" id="empleadoModal" tabindex="-1" aria-labelledby="empleadoModalLabel" aria-hidden="false">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="empleadoModalLabel">Seleccionar Empleado</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                    </div>
                    <div class="modal-body">
                        <ul class="list-group">
                            @foreach ($empleados as $empleado)
                            <li class="list-group-item d-flex justify-content-between align-items-center">
                                {{ $empleado->nombre }}
                                <button type="button" class="btn btn-sm btn-success select-empleado"
                                    data-id="{{ $empleado->id }}"
                                    data-nombre="{{ $empleado->nombre }}">
                                    Seleccionar
                                </button>
                            </li>
                            @endforeach
                        </ul>
                    </div>
                </div>
            </div>
        </div>
        @stop

        @section('js')
        <script>
            document.addEventListener('DOMContentLoaded', function() {
                const empleadoButtons = document.querySelectorAll('.select-empleado');

                empleadoButtons.forEach(button => {
                    button.addEventListener('click', function() {
                        const empleadoId = this.dataset.id;
                        const empleadoNombre = this.dataset.nombre;

                        // Actualiza los campos ocultos del formulario
                        document.getElementById('empleado_id').value = empleadoId;
                        document.getElementById('empleado_nombre').value = empleadoNombre;

                        // Cierra el modal
                        const myModal = document.getElementById('empleadoModal');
                        const mainContent = document.querySelector('main'); // Or the relevant container for main content

                        // Open the modal
                        function openModal() {
                            modal.style.display = 'block'; // Show the modal visually
                            modal.removeAttribute('aria-hidden'); // Allow screen readers to access modal content
                            mainContent.inert = true; // Inert main content
                            modal.querySelector('button').focus(); //Focus on an element of the modal (best practices: first interactive element)
                        }

                        // Close the modal
                        function closeModal() {
                            modal.style.display = 'none'; // Hide the modal visually
                            modal.setAttribute('aria-hidden', 'true'); // Hide the modal from screen readers
                            mainContent.inert = false; // Inert main content
                            //Focus where it was before open the modal
                        }

                        // Initialize a new Bootstrap modal
                        const modal = new bootstrap.Modal(myModal);

                        // Then you can use modal.hide();
                        modal.hide();
                    });
                });
            });
        </script>
        @stop

    </div>
</div>