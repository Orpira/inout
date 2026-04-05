<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('registros_horarios', function (Blueprint $table) {
            // Rename columns if they exist
            if (Schema::hasColumn('registros_horarios', 'hora_entrada')) {
                $table->renameColumn('hora_entrada', 'entrada');
            }
            
            if (Schema::hasColumn('registros_horarios', 'hora_salida')) {
                $table->renameColumn('hora_salida', 'salida');
            }
            
            // Add new columns if they don't exist
            if (!Schema::hasColumn('registros_horarios', 'tiempo_total')) {
                $table->time('tiempo_total')->nullable()->after('salida');
            }
            
            if (!Schema::hasColumn('registros_horarios', 'estado')) {
                $table->string('estado', 20)->default('PENDIENTE')->after('tiempo_total');
            } else {
                // Si la columna ya existe, asegurarse de que tenga el valor por defecto correcto
                DB::statement("ALTER TABLE registros_horarios ALTER COLUMN estado SET DEFAULT 'PENDIENTE'");
            }
            
            if (!Schema::hasColumn('registros_horarios', 'novedad')) {
                $table->text('novedad')->nullable()->after('estado');
            }
            
            // Change column types if needed
            if (Schema::hasColumn('registros_horarios', 'entrada') && 
                Schema::getColumnType('registros_horarios', 'entrada') !== 'datetime') {
                $table->dateTime('entrada')->change();
            }
            
            if (Schema::hasColumn('registros_horarios', 'salida') && 
                Schema::getColumnType('registros_horarios', 'salida') !== 'datetime') {
                $table->dateTime('salida')->nullable()->change();
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // This is a one-way migration to fix the schema
        // Rolling back would be complex due to potential data loss
        // In a production environment, you would need to handle this carefully
    }
};
