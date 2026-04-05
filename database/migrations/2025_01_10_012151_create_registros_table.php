<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

use function Laravel\Prompts\table;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('registros', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('empleado_id');
            $table->date('fecha');
            $table->time('entrada');
            $table->time('salida');
            $table->decimal('extrasordinarias');
            $table->decimal('nocturnasordinarias');
            $table->decimal('extrasnocturnas');
            $table->timestamps(); // Agrega las columnas `created_at` y `updated_at`
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('registros', function (Blueprint $table) {
            $table->dropIfExists('registros');
            $table->dropTimestamps(); // Elimina las columnas en caso de rollback
        });
    }
};
