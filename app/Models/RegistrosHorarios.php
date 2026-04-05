<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class RegistrosHorarios extends Model
{
    use HasFactory;

    protected $fillable = [
        'empleado_id',
        'entrada',
        'salida',
        'tiempo_total',
        'extrasordinarias',
        'nocturnasordinarias',
        'extrasnocturnas',
        'estado',
        'novedad',
    ];

    // Asegura que las fechas se conviertan a objetos Carbon
    protected $casts = [
        'entrada' => 'datetime',
        'salida' => 'datetime',
    ];

    // Relación con el modelo Empleado (opcional)
    public function empleado()
    {
        return $this->belongsTo(Empleado::class);
    }
}
