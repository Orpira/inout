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
            $table->string('identificacion')->unique()->after('id');
            $table->string('apellido')->after('nombre');
            $table->string('telefono')->nullable()->after('email');
            $table->text('direccion')->nullable()->after('telefono');
            $table->date('fecha_ingreso')->nullable()->after('direccion');
            $table->string('estado')->default('activo')->after('fecha_ingreso');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('empleados', function (Blueprint $table) {
            $table->dropColumn([
                'identificacion',
                'apellido',
                'telefono',
                'direccion',
                'fecha_ingreso',
                'estado'
            ]);
        });
    }
};
