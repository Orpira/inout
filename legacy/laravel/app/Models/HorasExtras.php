<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class HorasExtras extends Model
{
    use HasFactory;

    protected $fillable = [
        'turno_id',
        'tipo',
        'horas',
        'rate_multiplier',
        'valor_calculado',
    ];

    // Relación pertenece a un turno
    public function shift()
    {
        return $this->belongsTo(Turnos::class);
    }
}
