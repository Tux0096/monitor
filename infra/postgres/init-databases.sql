-- monitor_auth is created via POSTGRES_DB in docker-compose
SELECT 'CREATE DATABASE monitor_core'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'monitor_core')\gexec
