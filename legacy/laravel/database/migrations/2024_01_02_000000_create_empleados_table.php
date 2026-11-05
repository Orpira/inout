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
        Schema::create('empleados', function (Blueprint $table) {
            $table->id();
            $table->string('nombre');
            $table->string('email')->unique();
            $table->unsignedBigInteger('turno_id')->nullable();
            $table->decimal('salario', 10, 2)->default(0);
            $table->integer('horasxsemana')->default(44);
            $table->timestamps();
            
            $table->foreign('turno_id')->references('id')->on('turnos')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('empleados');
    }
};
