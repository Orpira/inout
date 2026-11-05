<?php

namespace App\Models;



use Illuminate\Database\Eloquent\Factories\HasFactory;

use Illuminate\Database\Eloquent\Model;

class Mostrar extends Model
{
    use HasFactory;

    protected $table = 'registros_horarios';
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

    public function empleado()
    {
        return $this->belongsTo(Empleado::class);
    }
}
