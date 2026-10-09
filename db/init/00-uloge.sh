#!/bin/sh
# Pokreće se jednom, pri prvom startu praznog Postgres volumena.
# Kreira uloge i bazu; sve ostalo rade dbmate migracije (kao app_owner).
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<EOSQL
create role app_owner login password '${APP_OWNER_PASS}';
create role app_user  login password '${APP_USER_PASS}' nobypassrls;
create role app_auth  login password '${APP_AUTH_PASS}' nobypassrls;
create database ${APP_DB:-pracenje} owner app_owner;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${APP_DB:-pracenje}" <<EOSQL
create extension if not exists citext;
create extension if not exists btree_gist;
revoke all on schema public from public;
grant usage on schema public to app_user, app_auth;
EOSQL
