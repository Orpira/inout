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
        if (!Schema::hasTable('registros_horarios')) {
            Schema::create('registros_horarios', function (Blueprint $table) {
                $table->id();
                $table->unsignedInteger('empleado_id');
                $table->date('fecha');
                $table->time('hora_entrada')->nullable();
                $table->time('hora_salida')->nullable();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('registros_horarios');
    }
};
