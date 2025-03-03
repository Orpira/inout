<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Turnos extends Model
{
    protected $fillable = [
        'empleado_id',
        'fecha',
        'hora_inicial',
        'hora_final',
        'festivo',
    ];

    // Relación uno a muchos con el modelo HorasExtra
    public function HorasExtras()
    {
        return $this->hasMany(HorasExtras::class);
    }

    // Relación con el modelo Empleado 
    public function empleado()
    {
        return $this->belongsTo(Empleado::class);
    }
}
