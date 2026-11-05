<?php

namespace App\Models;



use Illuminate\Database\Eloquent\Factories\HasFactory;

use Illuminate\Database\Eloquent\Model;

class Registro extends Model
{
    use HasFactory;

    protected $table = 'registros';
    protected $fillable = ['empleado_id', 'fecha', 'entrada', 'salida', 'extrasordinarias', 'nocturnasordinarias', 'extrasnocturnas'];

    public function empleado()
    {
        return $this->belongsTo(Empleado::class);
    }
}
