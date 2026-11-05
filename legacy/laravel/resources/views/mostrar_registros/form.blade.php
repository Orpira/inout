@extends('adminlte::page')

@section('title', 'Formulario Entradas y Salidas')

@section('content')
<div class="card">
    <div class="card-header">
        <h3 class="card-title">{{ isset($registros_horarios) ? 'Editar Registro' : 'Crear Registro' }}</h3>
    </div>
    <div class="card-footer">
        @if($registros_horarios->estado === 'FINALIZADO' || $registros_horarios->estado === 'cerrado automaticamente')
        <form action="{{ route('registro_horario.activarRegistro', $registros_horarios->id) }}" method="POST" style="display: inline;">
            @csrf
            <button type="submit" class="btn btn-warning">ACTIVAR</button>
        </form>
        @endif
    </div>
    <div class="card-body">
        <form action="{{ isset($registros_horarios) ? route('registro_horario.update', $registros_horarios->id) : route('registro_horario.store') }}" method="POST">
            @csrf
            @if(isset($registros_horarios))
            @method('PUT')
            @endif
            <div class="form-group">
                <label for="id" class="form-label">Id:</label>
                <input type="text" name="id" id="id" class="form-control" value="{{ $registros_horarios->id ?? '' }}" disabled>
            </div>
            <div class="form-group">
                <label for="empleado_id" class="form-label">Empleado:</label>
                <input type="text" name="empleado_id" id="empleado_id" class="form-control" value="{{ $registros_horarios->empleado->nombre . ' ' . $registros_horarios->empleado->apellido ?? '' }}" disabled>
            </div>
            <div class="form-group">
                <label for="fecha">Fecha</label>
                <input type="text" name="fecha" id="fecha" class="form-control" value="{{ date('d-m-Y',strtotime($registros_horarios->entrada)) ?? '' }}" disabled> <!-- /* Se utiliza para mostrar fecha, este campo no existe en la tabla -->
            </div>
            <div class="form-group">
                <fieldset class="border p-3 rounded">
                    <legend class="w-auto px-2">Horas Registradas</legend>
                    <div class="row">
                        <div class="col-md-6">
                            <label for="entrada">Entrada</label>
                            <input type="datetime-local" name="entrada" id="entrada" class="form-control" {{ $registros_horarios->estado === 'FINALIZADO' || $registros_horarios->estado === 'cerrado automaticamente' ? 'disabled' : '' }} value="{{ $registros_horarios->entrada ?? '' }}">
                        </div>
                        <div class="col-md-6">
                            <label for="salida">Salida</label>
                            <input type="datetime-local" name="salida" id="salida" class="form-control" {{ $registros_horarios->estado === 'FINALIZADO' || $registros_horarios->estado === 'cerrado automaticamente' ? 'disabled' : '' }} value="{{ $registros_horarios->salida ?? '' }}">
                        </div>
                    </div>
                </fieldset>
            </div>
            <div class="form-group">
                <fieldset class="border p-3 rounded">
                    <legend class="w-auto px-2">Horas Extras</legend>

                    <div class="row">
                        <div class="col-md-6">
                            <label for="ordinaria">Ext. Diurna:</label>
                            <input type="text" name="ordinaria" id="ordinaria" class="form-control" value="{{ $registros_horarios->extrasordinarias ?? '' }}" disabled>
                        </div>
                        <div class="col-md-6">
                            <label for="ordinariaNocturna">Ext. Nocturna:</label>
                            <input type="text" name="ordinariaNocturna" id="ordinariaNocturna" class="form-control" value="{{ $registros_horarios->nocturnasordinarias ?? '' }}" disabled>
                        </div>
                    </div>

                    <div class="row mt-2">
                        <div class="col-md-6">
                            <label for="extraDiurna">Festiva Diurna:</label>
                            <input type="text" name="extraDiurna" id="extraDiurna" class="form-control" value="{{ $registros_horarios->extrasnocturnas ?? '' }}" disabled>
                        </div>
                        <div class="col-md-6">
                            <label for="extraNocturna">Festiva Nocturna:</label>
                            <input type="text" name="extraNocturna" id="extraNocturna" class="form-control" value="{{ $registros_horarios->extrasnocturnas ?? '' }}" disabled>
                        </div>
                    </div>
                </fieldset>
            </div>

            <div class="form-group">
                <label for="estado">Estado</label>
                <select name="estado" id="estado" class="form-control {{ $registros_horarios->estado === 'FINALIZADO' || $registros_horarios->estado === 'cerrado automaticamente' ? 'disabled-select' : '' }}" {{ $registros_horarios->estado === 'FINALIZADO' || $registros_horarios->estado === 'cerrado automaticamente' ? 'disabled' : '' }}>
                    <option value="FINALIZADO" {{ $registros_horarios->estado === 'FINALIZADO' ? 'selected' : '' }}>FINALIZADO</option>
                    <option value="PENDIENTE" {{ $registros_horarios->estado === 'PENDIENTE' ? 'selected' : '' }}>PENDIENTE</option>
                    <option value="cerrado automaticamente" {{ $registros_horarios->estado === 'cerrado automaticamente' ? 'selected' : '' }}>cerrado automaticamente</option>
                </select>
            </div>
            <div class="form-group">
                <label for="novedad">Novedades:</label>
                <textarea name="novedad" id="novedad" class="form-control" rows="5" maxlength="1000" disabled>{{ old('novedad', $registros_horarios->novedad ?? '') }}</textarea>
            </div>

            <!-- Agregar los demás campos -->

            <button type="submit" class="btn btn-primary" {{ $registros_horarios->estado === 'FINALIZADO' || $registros_horarios->estado === 'cerrado automaticamente' ? 'disabled' : '' }}>Actualizar</button>
            <a href="{{ route('registro_horario.index') }}" class="btn btn-secondary">Cancelar</a>
        </form>
    </div>
</div>
@endsection