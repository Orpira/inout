# Scripts de Creación de la Base de Datos

## MySQL

```sql
-- Script para MySQL 8.0+
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- Tabla: users
CREATE TABLE `users` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `remember_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: empleados
CREATE TABLE `empleados` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `apellido` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `identificacion` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cargo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `salario` decimal(10,2) NOT NULL,
  `horasxsemana` int NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `empleados_identificacion_unique` (`identificacion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: turnos
CREATE TABLE `turnos` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `empleado_id` bigint UNSIGNED NOT NULL,
  `fecha` date NOT NULL,
  `hora_inicial` time NOT NULL,
  `hora_final` time NOT NULL,
  `festivo` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `turnos_empleado_id_foreign` (`empleado_id`),
  CONSTRAINT `turnos_empleado_id_foreign` FOREIGN KEY (`empleado_id`) 
    REFERENCES `empleados` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: horas_extras
CREATE TABLE `horas_extras` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `turno_id` bigint UNSIGNED NOT NULL,
  `tipo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `horas` decimal(8,2) NOT NULL,
  `rate_multiplier` decimal(8,2) NOT NULL,
  `valor_calculado` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `horas_extras_turno_id_foreign` (`turno_id`),
  CONSTRAINT `horas_extras_turno_id_foreign` FOREIGN KEY (`turno_id`) 
    REFERENCES `turnos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: registros_horarios
CREATE TABLE `registros_horarios` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `empleado_id` bigint UNSIGNED NOT NULL,
  `entrada` datetime NOT NULL,
  `salida` datetime DEFAULT NULL,
  `tiempo_total` int DEFAULT NULL,
  `extrasordinarias` decimal(8,2) DEFAULT '0.00',
  `nocturnasordinarias` decimal(8,2) DEFAULT '0.00',
  `extrasnocturnas` decimal(8,2) DEFAULT '0.00',
  `estado` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `novedad` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `registros_horarios_empleado_id_foreign` (`empleado_id`),
  CONSTRAINT `registros_horarios_empleado_id_foreign` FOREIGN KEY (`empleado_id`) 
    REFERENCES `empleados` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices adicionales para mejorar el rendimiento
CREATE INDEX `idx_registros_horarios_entrada` ON `registros_horarios` (`entrada`);
CREATE INDEX `idx_registros_horarios_salida` ON `registros_horarios` (`salida`);

COMMIT;
```

## PostgreSQL

```sql
-- Script para PostgreSQL 13+
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla: users
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    email_verified_at TIMESTAMP(0) WITHOUT TIME ZONE NULL,
    password VARCHAR(255) NOT NULL,
    remember_token VARCHAR(100) NULL,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NULL,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NULL
);

-- Tabla: empleados
CREATE TABLE empleados (
    id BIGSERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    apellido VARCHAR(255) NOT NULL,
    identificacion VARCHAR(255) NOT NULL UNIQUE,
    cargo VARCHAR(255) NOT NULL,
    salario DECIMAL(10,2) NOT NULL,
    horasxsemana INTEGER NOT NULL,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NULL,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NULL
);

-- Tabla: turnos
CREATE TABLE turnos (
    id BIGSERIAL PRIMARY KEY,
    empleado_id BIGINT NOT NULL,
    fecha DATE NOT NULL,
    hora_inicial TIME WITHOUT TIME ZONE NOT NULL,
    hora_final TIME WITHOUT TIME ZONE NOT NULL,
    festivo BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NULL,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NULL,
    CONSTRAINT fk_turnos_empleado_id
        FOREIGN KEY (empleado_id) 
        REFERENCES empleados(id)
        ON DELETE CASCADE
);

-- Tabla: horas_extras
CREATE TABLE horas_extras (
    id BIGSERIAL PRIMARY KEY,
    turno_id BIGINT NOT NULL,
    tipo VARCHAR(255) NOT NULL,
    horas DECIMAL(8,2) NOT NULL,
    rate_multiplier DECIMAL(8,2) NOT NULL,
    valor_calculado DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NULL,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NULL,
    CONSTRAINT fk_horas_extras_turno_id
        FOREIGN KEY (turno_id) 
        REFERENCES turnos(id)
        ON DELETE CASCADE
);

-- Tabla: registros_horarios
CREATE TABLE registros_horarios (
    id BIGSERIAL PRIMARY KEY,
    empleado_id BIGINT NOT NULL,
    entrada TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    salida TIMESTAMP WITHOUT TIME ZONE NULL,
    tiempo_total INTEGER NULL,
    extrasordinarias DECIMAL(8,2) DEFAULT 0.00,
    nocturnasordinarias DECIMAL(8,2) DEFAULT 0.00,
    extrasnocturnas DECIMAL(8,2) DEFAULT 0.00,
    estado VARCHAR(255) NULL,
    novedad TEXT NULL,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NULL,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NULL,
    CONSTRAINT fk_registros_horarios_empleado_id
        FOREIGN KEY (empleado_id) 
        REFERENCES empleados(id)
        ON DELETE CASCADE
);

-- Índices adicionales para mejorar el rendimiento
CREATE INDEX idx_turnos_empleado_id ON turnos(empleado_id);
CREATE INDEX idx_horas_extras_turno_id ON horas_extras(turno_id);
CREATE INDEX idx_registros_horarios_empleado_id ON registros_horarios(empleado_id);
CREATE INDEX idx_registros_horarios_entrada ON registros_horarios(entrada);
CREATE INDEX idx_registros_horarios_salida ON registros_horarios(salida);
```

## Instrucciones de Uso

### Para MySQL:
1. Crea una base de datos vacía en tu servidor MySQL
2. Ejecuta el script SQL de MySQL proporcionado
3. Asegúrate de que el usuario de la aplicación tenga los permisos necesarios

### Para PostgreSQL:
1. Crea una base de datos vacía en tu servidor PostgreSQL
2. Ejecuta el script SQL de PostgreSQL proporcionado
3. Asegúrate de que el usuario de la aplicación tenga los permisos necesarios

## Notas de Migración

Si estás migrando de una versión anterior, asegúrate de hacer una copia de seguridad antes de ejecutar los scripts. Los scripts están diseñados para crear las tablas desde cero y pueden no ser adecuados para actualizaciones en producción.
