# Documentación del Sistema de Control Horario

## Índice de Documentación

1. [Estructura de la Base de Datos](01_ESTRUCTURA_BD.md)
   - Diagrama de entidad-relación
   - Descripción de tablas
   - Relaciones entre tablas

2. [Scripts de Creación](02_SCRIPTS_CREACION.md)
   - Script para MySQL
   - Script para PostgreSQL

3. [Manual de Uso](03_MANUAL_USO.md)
   - Instalación
   - Configuración
   - Guía de usuario

4. [API Reference](04_API_REFERENCE.md)
   - Endpoints disponibles
   - Ejemplos de solicitudes/respuestas
   - Códigos de estado

5. [Mantenimiento](05_MANTENIMIENTO.md)
   - Copias de seguridad
   - Actualizaciones
   - Solución de problemas

## Descripción General

Este sistema está diseñado para el control de asistencia y gestión de horarios de empleados, con funcionalidades para:

- Registro de entrada/salida
- Control de horas extras
- Gestión de turnos
- Generación de reportes
- Administración de usuarios y permisos

## Requisitos del Sistema

- PHP 8.1 o superior
- MySQL 8.0+ o PostgreSQL 13+
- Composer
- Node.js y NPM (para assets frontend)

## Instalación Rápida

1. Clonar el repositorio
2. Instalar dependencias: `composer install`
3. Configurar `.env`
4. Ejecutar migraciones: `php artisan migrate`
5. Iniciar servidor: `php artisan serve`

## Soporte

Para soporte técnico, contactar a:
- Equipo de Desarrollo: desarrollo@empresa.com
- Soporte: soporte@empresa.com
