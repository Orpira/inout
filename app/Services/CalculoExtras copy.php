<?php

/**
 * Calcula las horas extras de un empleado.
 *
 * @param string $fechaInicio La fecha de inicio en formato 'Y-m-d H:i:s'.
 * @param string $fechaFin La fecha de fin en formato 'Y-m-d H:i:s'.
 * @param string $turno El código del turno del empleado.
 * @return float La cantidad de horas extras.
 */


namespace App\Services;

use App\Models\Empleado;
use App\Models\Turnos;
use App\Models\HorasExtras;

use Carbon\Carbon;

class CalculoExtras
{
    public function calculateExtraHours($empleado_id, $turno_id)
    {
        $empleado = Empleado::findOrFail($empleado_id);
        $turno = Turnos::where('id', $turno_id)->first();

        //$valorHora = ($empleado->salario / 30) * 30 / 240; // Cálculo base
        $valorHora = $empleado->salario / 240; // Cálculo base, 240 horas mensuales (30 días * 8 horas)

        //foreach ($turnos as $turno) {
        $fechaTurno = Carbon::parse($turno->fecha);
        $inicio = Carbon::parse($turno->hora_inicio);
        $final = Carbon::parse($turno->hora_final);
        $total_hours_worked = $final->diffInMinutes($inicio) / 60;

        $extra_hours = [];

        // Verificar si es un día festivo o domingo
        $is_holiday_or_sunday = $turno->festivo || $fechaTurno->isSunday();

        // Franja nocturna ordinaria (21:00 - 06:00)
        if ($inicio->hour >= 21 || $inicio->hour < 6) {
            $nocturnal_end = $inicio->hour >= 21 ? $inicio->copy()->endOfDay() : $inicio->copy()->setTime(6, 0);
            $nocturnal_hours = min($final->diffInMinutes($nocturnal_end, false) / 60, $total_hours_worked);
            $total_hours_worked -= $nocturnal_hours;
            if ($nocturnal_hours > 0) {
                $rate_multiplier = $is_holiday_or_sunday ? 1.75 + 0.35 : 1.35;
                $extra_hours[] = [
                    'tipo' => $is_holiday_or_sunday ? 'nocturna_festiva' : 'nocturna',
                    'horas' => $nocturnal_hours,
                    'rate_multiplier' => $rate_multiplier,
                    'valor_calculado' => $nocturnal_hours * $valorHora * $rate_multiplier,
                ];
            }
        }

        // Franja diurna ordinaria (06:00 - 18:00)
        if ($inicio->hour >= 6 && $inicio->hour < 18 || $final->hour > 6 && $final->hour <= 18) {
            $diurnal_end = $inicio->copy()->setTime(18, 0);
            if ($inicio->hour >= 6 && $inicio->hour < 18) {
                $diurnal_end = $inicio->copy()->setTime(18, 0);
                if ($final > $diurnal_end) {
                    $diurnal_hours = $diurnal_end->diffInMinutes($inicio) / 60;
                } else {
                    $diurnal_hours = $final->diffInMinutes($inicio) / 60;
                }
                dump($diurnal_hours, $total_hours_worked);
                $diurnal_hours = max(0, min($diurnal_hours, $total_hours_worked)); // Evita valores negativos
                $total_hours_worked -= $diurnal_hours;
            }
            if ($diurnal_hours > 0) {
                $rate_multiplier = $is_holiday_or_sunday ? 1.75 : 1;
                $extra_hours[] = [
                    'tipo' => $is_holiday_or_sunday ? 'diurna_festiva' : 'diurna',
                    'horas' => $diurnal_hours,
                    'rate_multiplier' => $rate_multiplier,
                    'valor_calculado' => $diurnal_hours * $valorHora * $rate_multiplier,
                ];
            }
        }
        //dump($diurnal_hours, $total_hours_worked);
        // Horas extras diurnas o nocturnas
        if ($total_hours_worked > 0) {
            $extra_rate = ($inicio->hour >= 21 || $inicio->hour < 6) ? 1.75 : 1.25;
            $extra_rate += $is_holiday_or_sunday ? 0.75 : 0; // Incremento por festivo o domingo
        } else {
            // Si total_hours_worked es negativo, lo corregimos a 0
            $total_hours_worked = 0;
            $extra_rate = 0;
        }

        // Verificamos si aún hay horas que calcular
        if ($total_hours_worked >= 0) {
            $extra_hours[] = [
                'tipo' => ($final->hour >= 21 || $inicio->hour < 6) ? 'nocturna_festiva' : 'diurna_festiva',
                'horas' => $total_hours_worked,
                'rate_multiplier' => $extra_rate,
                'valor_calculado' => $total_hours_worked * $valorHora * $extra_rate,
            ];
        }

        dump($extra_hours);

        foreach ($extra_hours as $hour) {
            HorasExtras::create([
                'turno_id' => $turno->id,
                'tipo' => $hour['tipo'],
                'horas' => $hour['horas'],
                'rate_multiplier' => $hour['rate_multiplier'],
                'valor_calculado' => $hour['valor_calculado'],
            ]);
        }
        //}
    }
}
