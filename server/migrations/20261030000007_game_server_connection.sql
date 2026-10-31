-- Additive connection facts: legacy P1 registrations retain all-null metadata.
ALTER TABLE matchmaker.servers
    ADD COLUMN host text,
    ADD COLUMN port integer,
    ADD COLUMN cert_sha256 text,
    ADD COLUMN protocol_major integer,
    ADD COLUMN engine_version text,
    ADD COLUMN build_id text,
    ADD CONSTRAINT server_connection_complete CHECK (
        (host IS NULL AND port IS NULL AND cert_sha256 IS NULL AND protocol_major IS NULL
            AND engine_version IS NULL AND build_id IS NULL)
        OR (host IS NOT NULL AND port IS NOT NULL AND cert_sha256 IS NOT NULL AND protocol_major IS NOT NULL
            AND engine_version IS NOT NULL AND build_id IS NOT NULL)
    ),
    ADD CONSTRAINT server_host_shape CHECK (host ~ '^[A-Za-z0-9.:-]{1,253}$'),
    ADD CONSTRAINT server_port_range CHECK (port BETWEEN 1 AND 65535),
    ADD CONSTRAINT server_certificate_shape CHECK (cert_sha256 ~ '^[a-f0-9]{64}$'),
    ADD CONSTRAINT server_protocol_positive CHECK (protocol_major > 0),
    ADD CONSTRAINT server_engine_version_shape CHECK (engine_version ~ '^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$'),
    ADD CONSTRAINT server_build_id_shape CHECK (build_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$');
