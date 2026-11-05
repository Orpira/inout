<?php

namespace App\Helpers;

if (! function_exists('checkIfHoliday')) {
    function checkIfHoliday($date)
    {
        $holidays = [
            '2024-01-01',
            '2024-05-01',
            // ... otras fechas festivas
        ];
        return in_array($date, $holidays);
    }
}
