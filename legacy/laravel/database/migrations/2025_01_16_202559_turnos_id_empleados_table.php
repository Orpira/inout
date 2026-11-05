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
        Schema::table('empleados', function (Blueprint $table) {
            if (!Schema::hasColumn('empleados', 'salario')) {
                $table->decimal('salario', 10, 2)->default(0);
            }
            if (!Schema::hasColumn('empleados', 'horasxsemana')) {
                $table->integer('horasxsemana')->default(44); // Jornada semanal por defecto
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('empleados', function (Blueprint $table) {
            //
        });
    }
};
