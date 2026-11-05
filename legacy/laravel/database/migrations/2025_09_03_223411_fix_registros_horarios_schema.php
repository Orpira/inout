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
        // First, create a backup of the current data
        DB::statement('CREATE TABLE registros_horarios_backup AS SELECT * FROM registros_horarios');
        
        // Drop the existing table
        Schema::dropIfExists('registros_horarios');
        
        // Recreate the table with the correct structure
        Schema::create('registros_horarios', function (Blueprint $table) {
            $table->id();
            $table->foreignId('empleado_id')->constrained('empleados');
            $table->dateTime('entrada');
            $table->dateTime('salida')->nullable();
            $table->time('tiempo_total')->nullable();
            $table->string('estado', 20)->default('PENDIENTE');
            $table->text('novedad')->nullable();
            $table->timestamps();
            
            // Add indexes
            $table->index('empleado_id');
            $table->index('entrada');
            $table->index('salida');
        });
        
        // Migrate data from backup if needed
        DB::statement("
            INSERT INTO registros_horarios (id, empleado_id, entrada, salida, tiempo_total, estado, novedad, created_at, updated_at)
            SELECT 
                id,
                empleado_id,
                CASE 
                    WHEN fecha IS NOT NULL AND entrada IS NOT NULL 
                    THEN (fecha::text || ' ' || entrada::text)::timestamp 
                    ELSE now() 
                END as entrada,
                CASE 
                    WHEN fecha IS NOT NULL AND salida IS NOT NULL 
                    THEN (fecha::text || ' ' || salida::text)::timestamp 
                    ELSE NULL 
                END as salida,
                tiempo_total,
                COALESCE(estado, 'PENDIENTE') as estado,
                novedad,
                created_at,
                updated_at
            FROM registros_horarios_backup
        ");
        
        // Drop the backup table after successful migration
        DB::statement('DROP TABLE IF EXISTS registros_horarios_backup');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // This is a one-way migration due to potential data loss
        // In a production environment, you would need to implement a proper rollback strategy
    }
};
