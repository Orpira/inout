# Documentación: Problema de Autenticación en PostgreSQL

## Tabla de Contenidos
1. [Resumen del Problema](#resumen-del-problema)
2. [Análisis Técnico](#análisis-técnico)
3. [Solución Implementada](#solución-implementada)
4. [Configuración del Sistema](#configuración-del-sistema)
5. [Solución de Problemas](#solución-de-problemas)
6. [Seguridad](#seguridad)
7. [Referencias](#referencias)

## Resumen del Problema

### Error Encontrado
```
psql: error: falló la conexión al servidor en el socket «/var/run/postgresql/.s.PGSQL.5432»: FATAL:  Error de autenticación para el usuario "postgres"
```

### Contexto
- **Sistema Operativo**: Linux
- **Base de Datos**: PostgreSQL
- **Aplicación**: Laravel
- **Ubicación del Error**: Al intentar conectarse a PostgreSQL desde la terminal

## Análisis Técnico

### Causa Raíz
El error ocurría debido a la configuración de autenticación en PostgreSQL, específicamente:
- Método de autenticación configurado como `peer`
- Falta de credenciales adecuadas para la autenticación
- Permisos de usuario inadecuados

### Archivos de Configuración Clave
1. `/etc/postgresql/[versión]/main/pg_hba.conf` - Configuración de autenticación
2. `/etc/postgresql/[versión]/main/postgresql.conf` - Configuración general de PostgreSQL
3. `config/database.php` - Configuración de Laravel para la base de datos
4. `.env` - Variables de entorno de la aplicación

## Solución Implementada

### 1. Modificación de la Autenticación
Se modificó el archivo `pg_hba.conf` para cambiar el método de autenticación:

```diff
- local   all             postgres                                peer
+ local   all             postgres                                md5
```

### 2. Establecimiento de Contraseña
Se estableció una contraseña segura para el usuario postgres:

```sql
ALTER USER postgres WITH PASSWORD 'tu_contraseña_segura';
```

### 3. Configuración de Laravel
Se actualizó el archivo `.env` con las credenciales correctas:

```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=inout
DB_USERNAME=postgres
DB_PASSWORD=tu_contraseña_segura
```

## Configuración del Sistema

### Requisitos Previos
- PostgreSQL instalado y en ejecución
- Permisos de superusuario (sudo) para modificar la configuración
- Acceso al servidor donde se ejecuta PostgreSQL

### Pasos de Configuración

1. **Verificar el estado del servicio**:
   ```bash
   sudo systemctl status postgresql
   ```

2. **Editar la configuración de autenticación**:
   ```bash
   sudo nano /etc/postgresql/[versión]/main/pg_hba.conf
   ```

3. **Reiniciar el servicio**:
   ```bash
   sudo systemctl restart postgresql
   ```

4. **Verificar la conexión**:
   ```bash
   psql -U postgres -h 127.0.0.1 -d postgres
   ```

## Solución de Problemas

### Error: "Peer authentication failed"
**Síntomas**:
- No se puede conectar a PostgreSQL sin contraseña
- El error menciona "peer authentication failed"

**Solución**:
1. Verificar que el método de autenticación en `pg_hba.conf` sea `md5`
2. Asegurarse de que el usuario postgres tenga una contraseña establecida
3. Verificar que el servicio esté en ejecución

### Error: "Role does not exist"
**Síntomas**:
- El mensaje de error indica que el rol no existe

**Solución**:
1. Crear el usuario si no existe:
   ```sql
   CREATE USER nombre_usuario WITH PASSWORD 'contraseña';
   ```

## Seguridad

### Recomendaciones de Seguridad
1. **No usar el usuario postgres en producción**
   - Crear usuarios específicos para cada aplicación
   - Limitar los privilegios al mínimo necesario

2. **Manejo de Contraseñas**
   - Usar contraseñas seguras
   - No almacenar contraseñas en archivos de configuración
   - Utilizar variables de entorno para credenciales sensibles

3. **Configuración de Red**
   - Limitar el acceso por IP cuando sea posible
   - Considerar el uso de SSL para conexiones remotas

## Referencias
- [Documentación Oficial de PostgreSQL](https://www.postgresql.org/docs/current/auth-pg-hba-conf.html)
- [Documentación de Laravel - Base de Datos](https://laravel.com/docs/database)
- [Guía de Seguridad de PostgreSQL](https://www.postgresql.org/docs/current/static/auth-pg-hba-conf.html)

---
**Fecha de Documentación**: 03/09/2025  
**Responsable**: [Nombre del Responsable]  
**Versión del Documento**: 1.0
