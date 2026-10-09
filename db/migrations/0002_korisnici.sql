-- migrate:up
create table korisnik (
  id                       uuid primary key default gen_random_uuid(),
  email                    citext not null unique,
  lozinka_hash             text not null,
  mora_promijeniti_lozinku boolean not null default true,
  aktivan                  boolean not null default true,
  je_admin                 boolean not null default false,
  zadnja_prijava           timestamptz,
  lozinka_promijenjena_at  timestamptz,
  created_at               timestamptz not null default now()
);

create table sesija (
  id          text primary key,            -- sha256(token) u hex; sam token je samo u cookieju
  korisnik_id uuid not null references korisnik on delete cascade,
  istjece     timestamptz not null,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index on sesija (korisnik_id);
create index on sesija (istjece);

create table prijava_pokusaj (
  id         bigint generated always as identity primary key,
  email      citext,
  ip         inet,
  uspjeh     boolean not null,
  created_at timestamptz not null default now()
);
create index on prijava_pokusaj (email, created_at);
create index on prijava_pokusaj (ip, created_at);

-- app_user: nikad ne vidi lozinka_hash, ne vidi sesije ni pokušaje prijave.
revoke all on korisnik, sesija, prijava_pokusaj from app_user;
grant select (id, email, mora_promijeniti_lozinku, aktivan, je_admin, zadnja_prijava) on korisnik to app_user;

-- app_auth: samo ove tri tablice.
grant select, insert, update, delete on korisnik, sesija, prijava_pokusaj to app_auth;
grant usage, select on sequence prijava_pokusaj_id_seq to app_auth;

-- migrate:down
drop table prijava_pokusaj, sesija, korisnik;
