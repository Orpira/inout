<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('horas_extras', function (Blueprint $table) {
            $table->id();
            $table->foreignId('turno_id')->constrained('turnos')->onDelete('cascade');
            $table->enum('tipo', ['diurna', 'nocturna', 'diurna_festiva', 'nocturna_festiva']);
            $table->integer('horas');
            $table->decimal('rate_multiplier', 4, 2); // Multiplicador basado en las fórmulas
            $table->decimal('valor_calculado', 10, 2);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('horas_extras');
    }
};
