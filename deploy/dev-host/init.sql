-- The application's role owns its database but has no cluster administration privileges.
-- Keep a failing generated password statement out of client/server error context.
DO $$ BEGIN
  BEGIN
    EXECUTE format('CREATE ROLE metallic LOGIN PASSWORD %L', trim(pg_read_file('/run/secrets/db_password')));
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Application role initialization failed';
  END;
END $$;
CREATE DATABASE metallic OWNER metallic;
