<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
//use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
//use Illuminate\Mail\Mailables\Content;
//use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use App\Models\RegistrosHorarios;
use Carbon\Carbon;

class RegistroPendienteMail extends Mailable
{
    use Queueable, SerializesModels;

    public $datos;

    /**
     * Create a new message instance.
     */
    public function __construct($datos)
    {
        $this->datos = $datos;
    }

    public function build()
    {
        return $this->view('emails.registroPendiente')
            ->with(['datos' => $this->datos])
            ->subject('Asunto del Correo');
    }

    /**
     * Get the message envelope.
     */
    /*public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Registro Pendiente Mail',
        );
    }*/

    /**
     * Get the message content definition.
     */
    /*public function content(): Content
    {
        return new Content(
            view: 'emails.registrosPendiente',
            with: ['datos' => $this->datos]
        );
    }*/

    /**
     * Get the attachments for the message.
     *
     * @return array<int, \Illuminate\Mail\Mailables\Attachment>
     */
    public function attachments(): array
    {
        return [];
    }

    public function handle()
    {
        $registrosPendientes = RegistrosHorarios::whereNull('salida')
            ->where('entrada', '<=', Carbon::now()->subDay()) // Más de 24 horas
            ->get();

        foreach ($registrosPendientes as $registro) {
            $registro->salida = Carbon::createFromFormat('H:i', '18:00'); // Salida predeterminada
            $registro->tiempo_total = Carbon::parse($registro->entrada)
                ->diff($registro->salida)
                ->format('%H:%I:%S');
            $registro->estado = 'cerrado automáticamente'; // Estado para reportes
            $registro->novedad = 'Salida asignada automaticamente despues de 24 horas.';
            $registro->save();
        }
    }
}
