-- migrate:up
-- Ekstenzije kreira init skripta (superuser); ovdje samo osiguravamo da postoje.
create extension if not exists citext;
create extension if not exists btree_gist;

create schema private;
revoke all on schema private from public;
grant usage on schema private to app_user;

-- app_user dobiva DML na sve buduće tablice; RLS određuje koje redove vidi.
alter default privileges in schema public grant select, insert, update, delete on tables to app_user;
alter default privileges in schema public grant usage, select on sequences to app_user;

create type tip_grupe        as enum ('predavanje', 'vjezbe');
create type uloga_osoblja    as enum ('nastavnik', 'asistent');
create type status_dolaska   as enum ('prisutan', 'odsutan', 'opravdano');
create type nacin_evidencije as enum ('rucno', 'qr');

-- Trenutni korisnik postavlja aplikacija po transakciji: set_config('app.korisnik_id', ..., true).
-- Bez konteksta vraća null pa sve politike vraćaju 0 redova.
create function private.trenutni_korisnik() returns uuid
  language sql stable set search_path = ''
  as $$ select nullif(current_setting('app.korisnik_id', true), '')::uuid $$;

create function private.postavi_updated_at() returns trigger
  language plpgsql set search_path = ''
  as $$ begin new.updated_at := now(); return new; end $$;

-- migrate:down
drop function private.postavi_updated_at();
drop function private.trenutni_korisnik();
drop type nacin_evidencije, status_dolaska, uloga_osoblja, tip_grupe;
drop schema private;
