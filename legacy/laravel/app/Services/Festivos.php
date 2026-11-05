<?php

/**
 * Verifica si una fecha es festiva en un país específico.
 *
 * @param string $fecha La fecha a verificar en formato 'Y-m-d'.
 * @param string $pais El código del país (por defecto 'CO' para Colombia).
 * @return bool True si la fecha es festiva, False en caso contrario.
 */

namespace App\Services;

class Festivos
{
    private $festivosCache = [];

    public function esFestivo($fecha, $pais = 'CO')
    {
        try {
            if (!strtotime($fecha)) {
                throw new \InvalidArgumentException("Fecha inválida");
            }
            $anio = date('Y', strtotime($fecha));
            $festivos = $this->obtenerFestivos($anio, $pais);
            return in_array($fecha, $festivos);
        } catch (\Exception $e) {
            // Log del error o manejo adecuado
            error_log($e->getMessage());
            return false;
        }
    }

    public function obtenerFestivos($anio, $pais)
    {
        if ($pais !== 'CO') {
            throw new \Exception("País no soportado");
        }

        $festivos = [];

        // Festivos fijos
        $festivosFijos = [
            '01-01', // Año Nuevo
            '05-01', // Día del Trabajo
            '07-20', // Independencia (Colombia)
            '08-07', // Batalla de Boyacá (Colombia)
            '12-25', // Navidad
        ];

        foreach ($festivosFijos as $festivo) {
            $festivos[] = "$anio-$festivo";
        }

        // Cálculo de la Semana Santa
        $pascuaTimestamp = easter_date($anio);
        $pascua = date('Y-m-d', $pascuaTimestamp);

        $juevesSanto = date('Y-m-d', strtotime('-3 days', $pascuaTimestamp));
        $viernesSanto = date('Y-m-d', strtotime('-2 days', $pascuaTimestamp));

        $festivos[] = $juevesSanto;
        $festivos[] = $viernesSanto;

        // Festivos con Ley de Puente (Colombia)
        $festivosMovibles = [
            '01-06', // Reyes Magos
            '03-19', // San José
            '06-29', // San Pedro y San Pablo
            '08-15', // Asunción de la Virgen
            '10-12', // Día de la Raza
            '11-01', // Todos los Santos
            '11-11', // Independencia de Cartagena
        ];

        foreach ($festivosMovibles as $festivo) {
            $festivos[] = $this->trasladarFestivo("$anio-$festivo");
        }

        // Agregar todos los domingos del año
        $fechaInicio = strtotime("$anio-01-01");
        $fechaFin = strtotime("$anio-12-31");

        while ($fechaInicio <= $fechaFin) {
            if (date('N', $fechaInicio) == 7) { // 7 es Domingo
                $festivos[] = date('Y-m-d', $fechaInicio);
            }
            $fechaInicio = strtotime('+1 day', $fechaInicio);
        }

        return $festivos;
    }

    public function trasladarFestivo($fecha)
    {
        $timestamp = strtotime($fecha);
        if ($timestamp === false) {
            return false; // o lanzar una excepción
        }
        $diaSemana = date('N', $timestamp); // 1 (Lunes) - 7 (Domingo)

        // Si el festivo no cae en lunes, se traslada al siguiente lunes
        if ($diaSemana != 1) { // 1 es Lunes
            $timestamp = strtotime('next Monday', $timestamp);
        }
        return date('Y-m-d', $timestamp);
    }
}
