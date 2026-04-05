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
        Schema::table('registros_horarios', function (Blueprint $table) {
            // Check if columns exist before trying to rename them
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
            }
            
            if (!Schema::hasColumn('registros_horarios', 'novedad')) {
                $table->text('novedad')->nullable()->after('estado');
            }
            
        });

        // Handle the time to datetime conversion in a separate step with raw SQL
        if (Schema::hasColumn('registros_horarios', 'entrada') && 
            Schema::getColumnType('registros_horarios', 'entrada') === 'time') {
            // First add a temporary datetime column
            DB::statement('ALTER TABLE registros_horarios ADD COLUMN temp_entrada TIMESTAMP');
            
            // Convert time to timestamp using current date
            DB::statement("UPDATE registros_horarios SET temp_entrada = (CURRENT_DATE + entrada::time)::timestamp");
            
            // Drop the old column and rename the new one
            DB::statement('ALTER TABLE registros_horarios DROP COLUMN entrada');
            DB::statement('ALTER TABLE registros_horarios RENAME COLUMN temp_entrada TO entrada');
            
            // Add constraints back
            DB::statement('ALTER TABLE registros_horarios ALTER COLUMN entrada SET NOT NULL');
        }
        
        if (Schema::hasColumn('registros_horarios', 'salida') && 
            Schema::getColumnType('registros_horarios', 'salida') === 'time') {
            // First add a temporary datetime column
            DB::statement('ALTER TABLE registros_horarios ADD COLUMN temp_salida TIMESTAMP NULL');
            
            // Convert time to timestamp using current date (only for non-null values)
            DB::statement("UPDATE registros_horarios SET temp_salida = (CURRENT_DATE + salida::time)::timestamp WHERE salida IS NOT NULL");
            
            // Drop the old column and rename the new one
            DB::statement('ALTER TABLE registros_horarios DROP COLUMN salida');
            DB::statement('ALTER TABLE registros_horarios RENAME COLUMN temp_salida TO salida');
        }
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
