-- ==========================================================
-- ESQUEMA DE LA BASE DE DATOS: Copiloto contable
--
-- Varios estudios contables comparten la misma base de datos
-- ("multiempresa" o "multitenant"). Cada fila lleva el estudio al que
-- pertenece (estudio_id) y PostgreSQL impide que un estudio vea o
-- modifique los datos de otro mediante ROW-LEVEL SECURITY (RLS).
--
-- Cómo funciona:
--   1. La API abre una transacción y cambia al rol "copiloto_app".
--   2. Guarda el estudio del usuario en la variable app.estudio_id.
--   3. Las políticas de RLS filtran TODAS las consultas por esa variable.
-- Así, aunque el código olvide un "WHERE estudio_id = ...", la base de
-- datos no devuelve datos de otro estudio.
-- ==========================================================

-- Rol sin contraseña que usa la API para las consultas de cada estudio
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'copiloto_app') THEN
    CREATE ROLE copiloto_app NOLOGIN;
  END IF;
END
$$;
-- El usuario dueño de la base de datos debe poder "convertirse" en copiloto_app
GRANT copiloto_app TO CURRENT_USER;

-- Devuelve el estudio de la petición actual (o NULL si no hay ninguno: no ve nada)
CREATE OR REPLACE FUNCTION estudio_actual() RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.estudio_id', true), '')::INTEGER
$$;

CREATE TABLE IF NOT EXISTS estudios (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre     TEXT NOT NULL CHECK (length(nombre) BETWEEN 2 AND 120),
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  estudio_id     INTEGER NOT NULL REFERENCES estudios(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL CHECK (length(nombre) BETWEEN 2 AND 100),
  email          TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash  TEXT NOT NULL,
  -- titular: administra el estudio y sus usuarios · asistente: trabaja con las empresas
  rol            TEXT NOT NULL CHECK (rol IN ('titular', 'asistente')),
  activo         BOOLEAN NOT NULL DEFAULT true,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Las empresas cliente del estudio
CREATE TABLE IF NOT EXISTS empresas (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  estudio_id    INTEGER NOT NULL REFERENCES estudios(id) ON DELETE CASCADE,
  ruc           CHAR(11) NOT NULL CHECK (ruc ~ '^[0-9]{11}$'),
  razon_social  TEXT NOT NULL CHECK (length(razon_social) BETWEEN 2 AND 200),
  activa        BOOLEAN NOT NULL DEFAULT true,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (estudio_id, ruc),
  UNIQUE (id, estudio_id) -- permite que otras tablas exijan "misma empresa Y mismo estudio"
);

CREATE TABLE IF NOT EXISTS conciliaciones (
  id                     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  estudio_id             INTEGER NOT NULL,
  empresa_id             INTEGER NOT NULL,
  periodo                CHAR(6) NOT NULL CHECK (periodo ~ '^20[0-9]{2}(0[1-9]|1[0-2])$'),
  creado_por             INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en              TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_propuesta        INTEGER NOT NULL,
  total_xml              INTEGER NOT NULL,
  igv_fuera_propuesta    BIGINT NOT NULL, -- céntimos
  igv_sin_respaldo       BIGINT NOT NULL, -- céntimos
  archivos_con_error     JSONB NOT NULL DEFAULT '[]',
  -- Doble llave: la empresa debe ser DEL MISMO estudio (defensa adicional)
  FOREIGN KEY (empresa_id, estudio_id) REFERENCES empresas(id, estudio_id) ON DELETE CASCADE,
  UNIQUE (id, estudio_id)
);

CREATE TABLE IF NOT EXISTS hallazgos (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  estudio_id       INTEGER NOT NULL,
  conciliacion_id  INTEGER NOT NULL,
  estado           TEXT NOT NULL,
  clave            TEXT NOT NULL,
  ruc_emisor       TEXT NOT NULL,
  nombre_emisor    TEXT NOT NULL,
  tipo             TEXT NOT NULL,
  serie            TEXT NOT NULL,
  numero           TEXT NOT NULL,
  fecha_emision    DATE NOT NULL,
  moneda           TEXT NOT NULL,
  base_imponible   BIGINT NOT NULL, -- céntimos
  igv              BIGINT NOT NULL,
  total            BIGINT NOT NULL,
  explicacion      TEXT NOT NULL,
  accion           TEXT NOT NULL,
  revisado         BOOLEAN NOT NULL DEFAULT false,
  revisado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (conciliacion_id, estudio_id) REFERENCES conciliaciones(id, estudio_id) ON DELETE CASCADE
);

-- Registro de auditoría: quién hizo qué y cuándo
CREATE TABLE IF NOT EXISTS auditoria (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  estudio_id  INTEGER NOT NULL REFERENCES estudios(id) ON DELETE CASCADE,
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  accion      TEXT NOT NULL,
  detalle     JSONB NOT NULL DEFAULT '{}',
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conciliaciones_por_empresa ON conciliaciones (estudio_id, empresa_id, periodo);
CREATE INDEX IF NOT EXISTS hallazgos_por_conciliacion ON hallazgos (conciliacion_id);
CREATE INDEX IF NOT EXISTS auditoria_por_estudio ON auditoria (estudio_id, creado_en DESC);

-- ----------------------------------------------------------
-- Permisos y políticas de aislamiento
-- ----------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON estudios, usuarios, empresas, conciliaciones, hallazgos, auditoria TO copiloto_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO copiloto_app;

ALTER TABLE estudios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE conciliaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE hallazgos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento ON estudios;
CREATE POLICY aislamiento ON estudios TO copiloto_app
  USING (id = estudio_actual()) WITH CHECK (id = estudio_actual());

DROP POLICY IF EXISTS aislamiento ON usuarios;
CREATE POLICY aislamiento ON usuarios TO copiloto_app
  USING (estudio_id = estudio_actual()) WITH CHECK (estudio_id = estudio_actual());

DROP POLICY IF EXISTS aislamiento ON empresas;
CREATE POLICY aislamiento ON empresas TO copiloto_app
  USING (estudio_id = estudio_actual()) WITH CHECK (estudio_id = estudio_actual());

DROP POLICY IF EXISTS aislamiento ON conciliaciones;
CREATE POLICY aislamiento ON conciliaciones TO copiloto_app
  USING (estudio_id = estudio_actual()) WITH CHECK (estudio_id = estudio_actual());

DROP POLICY IF EXISTS aislamiento ON hallazgos;
CREATE POLICY aislamiento ON hallazgos TO copiloto_app
  USING (estudio_id = estudio_actual()) WITH CHECK (estudio_id = estudio_actual());

DROP POLICY IF EXISTS aislamiento ON auditoria;
CREATE POLICY aislamiento ON auditoria TO copiloto_app
  USING (estudio_id = estudio_actual()) WITH CHECK (estudio_id = estudio_actual());
