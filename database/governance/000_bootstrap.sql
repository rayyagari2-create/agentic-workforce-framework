-- =================================================================
-- 000_bootstrap.sql
-- Bootstrap: schema and extensions required before all migrations
--
-- Run this file FIRST before any other migration.
-- Safe to run multiple times (idempotent).
-- =================================================================

-- Create the governance schema.
-- All framework tables live in awf_governance.
-- This keeps framework tables isolated from application tables.
CREATE SCHEMA IF NOT EXISTS awf_governance;

-- pgcrypto provides gen_random_uuid() used throughout the schema.
-- Required before any table with DEFAULT gen_random_uuid() is created.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pgcrypto is a standard Postgres extension available in all
-- standard Postgres distributions including RDS, Cloud SQL,
-- Supabase, Neon, and self-hosted Postgres 12+.
-- If your environment does not support pgcrypto, replace
-- gen_random_uuid() with uuid_generate_v4() and enable the
-- uuid-ossp extension instead:
--
--   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--
-- Then replace all gen_random_uuid() calls in subsequent
-- migrations with uuid_generate_v4().
