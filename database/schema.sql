-- Crear la tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    email_verified_at DATETIME,
    password TEXT NOT NULL,
    remember_token TEXT,
    created_at DATETIME,
    updated_at DATETIME
);

-- Crear la tabla de tokens para restablecer contraseñas
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    email TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    created_at DATETIME
);

-- Crear la tabla de sesiones
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    ip_address TEXT,
    user_agent TEXT,
    payload TEXT NOT NULL,
    last_activity INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Crear la tabla de registros
CREATE TABLE IF NOT EXISTS registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empleado_id INTEGER NOT NULL,
    fecha DATE NOT NULL,
    entrada TIME NOT NULL,
    salida TIME NOT NULL,
    extrasordinarias DECIMAL(10,2) NOT NULL,
    nocturnasordinarias DECIMAL(10,2) NOT NULL,
    extrasnocturnas DECIMAL(10,2) NOT NULL,
    created_at DATETIME,
    updated_at DATETIME
);

-- Crear la tabla de turnos
CREATE TABLE IF NOT EXISTS turnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME,
    updated_at DATETIME
);

-- Crear la tabla de empleados
CREATE TABLE IF NOT EXISTS empleados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    salario DECIMAL(10,2) NOT NULL,
    horasxsemana INTEGER DEFAULT 44,
    turno_id INTEGER,
    created_at DATETIME,
    updated_at DATETIME,
    FOREIGN KEY (turno_id) REFERENCES turnos(id)
);

-- Crear la tabla de horas extras
CREATE TABLE IF NOT EXISTS horas_extras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    turno_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('diurna', 'nocturna', 'diurna_festiva', 'nocturna_festiva')),
    horas INTEGER NOT NULL,
    rate_multiplier DECIMAL(4,2) NOT NULL,
    valor_calculado DECIMAL(10,2) NOT NULL,
    created_at DATETIME,
    updated_at DATETIME,
    FOREIGN KEY (turno_id) REFERENCES turnos(id) ON DELETE CASCADE
);

-- Crear la tabla de entradas de Telescope (si se usa)
CREATE TABLE IF NOT EXISTS telescope_entries (
    uuid TEXT PRIMARY KEY,
    batch_id TEXT,
    family_hash TEXT,
    should_display_on_index BOOLEAN DEFAULT 1,
    type TEXT,
    content TEXT,
    created_at DATETIME
);

-- Crear índices para la tabla telescope_entries
CREATE INDEX IF NOT EXISTS telescope_entries_batch_id_index ON telescope_entries (batch_id);
CREATE INDEX IF NOT EXISTS telescope_entries_family_hash_index ON telescope_entries (family_hash);
CREATE INDEX IF NOT EXISTS telescope_entries_created_at_index ON telescope_entries (created_at);
CREATE INDEX IF NOT EXISTS telescope_entries_type_should_display_on_index_index ON telescope_entries (type, should_display_on_index);

-- Crear tabla para las etiquetas de las entradas de Telescope
CREATE TABLE IF NOT EXISTS telescope_entries_tags (
    entry_uuid TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (entry_uuid, tag),
    FOREIGN KEY (entry_uuid) REFERENCES telescope_entries (uuid) ON DELETE CASCADE
);

-- Crear índice para la columna tag en telescope_entries_tags
CREATE INDEX IF NOT EXISTS telescope_entries_tags_tag_index ON telescope_entries_tags (tag);

-- Crear tabla para el monitoreo de Telescope
CREATE TABLE IF NOT EXISTS telescope_monitoring (
    tag TEXT PRIMARY KEY
);
