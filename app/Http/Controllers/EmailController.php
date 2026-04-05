<?php

namespace App\Http\Controllers;

use App\Mail\MiCorreo;
use App\Mail\RegistroPendienteMail;
use Illuminate\Support\Facades\Mail;

class EmailController extends Controller
{
    public function enviarCorreo()
    {
        $datos = [
            'nombre' => 'Juan Pérez',
            'mensaje' => 'Este es un mensaje de prueba.'
        ];

        Mail::to('orpira@icloud.com')->send(new RegistroPendienteMail($datos));

        return response()->json(['mensaje' => 'Correo enviado correctamente.']);
    }
}
