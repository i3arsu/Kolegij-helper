-- migrate:up
create table osoblje (
  id          uuid primary key default gen_random_uuid(),
  korisnik_id uuid not null unique references korisnik on delete cascade,
  ime         text not null,
  prezime     text not null,
  titula      text
);

create table kolegij (
  id               uuid primary key default gen_random_uuid(),
  naziv            text not null,
  sifra            text not null,
  akademska_godina text not null check (akademska_godina ~ '^\d{4}/\d{4}$'),
  semestar         text not null check (semestar in ('zimski', 'ljetni')),
  arhiviran        boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (sifra, akademska_godina)
);

create table osoblje_kolegija (
  kolegij_id uuid references kolegij on delete cascade,
  osoblje_id uuid references osoblje on delete cascade,
  uloga      uloga_osoblja not null,
  primary key (kolegij_id, osoblje_id)
);
create index on osoblje_kolegija (osoblje_id);

create table grupa (
  id         uuid primary key default gen_random_uuid(),
  kolegij_id uuid not null references kolegij on delete cascade,
  naziv      text not null,
  tip        tip_grupe not null,
  unique (kolegij_id, naziv),
  unique (id, kolegij_id)
);

create table asistent_grupa (
  grupa_id   uuid references grupa on delete cascade,
  osoblje_id uuid references osoblje on delete cascade,
  primary key (grupa_id, osoblje_id)
);
create index on asistent_grupa (osoblje_id);

create table student (
  id          uuid primary key default gen_random_uuid(),
  korisnik_id uuid not null unique references korisnik on delete cascade,
  jmbag       text not null unique check (jmbag ~ '^\d{10}$'),
  ime         text not null,
  prezime     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger student_updated_at before update on student
  for each row execute function private.postavi_updated_at();

create table upis (
  id         uuid primary key default gen_random_uuid(),
  kolegij_id uuid not null references kolegij on delete cascade,
  student_id uuid not null references student on delete cascade,
  status     text not null default 'aktivan' check (status in ('aktivan', 'ispisan')),
  created_at timestamptz not null default now(),
  unique (kolegij_id, student_id)
);
create index on upis (student_id);

create table clanstvo_grupe (
  id       uuid primary key default gen_random_uuid(),
  upis_id  uuid not null references upis on delete cascade,
  grupa_id uuid not null references grupa on delete restrict,
  tip      text not null check (tip in ('predavanje', 'vjezbe')),
  vrijedi  tstzrange not null default tstzrange(now(), null),
  constraint clanstvo_bez_preklapanja exclude using gist (upis_id with =, tip with =, vrijedi with &&)
);
create index on clanstvo_grupe (grupa_id);
create index on clanstvo_grupe (upis_id);

-- Članstvo: grupa mora biti iz istog kolegija kao upis; tip se kopira iz grupe.
create function private.clanstvo_grupe_provjera() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_grupa_kolegij uuid;
  v_grupa_tip     public.tip_grupe;
  v_upis_kolegij  uuid;
begin
  select g.kolegij_id, g.tip into v_grupa_kolegij, v_grupa_tip from public.grupa g where g.id = new.grupa_id;
  select u.kolegij_id into v_upis_kolegij from public.upis u where u.id = new.upis_id;
  if v_grupa_kolegij is distinct from v_upis_kolegij then
    raise exception 'Grupa ne pripada kolegiju upisa' using errcode = 'P0001';
  end if;
  new.tip := v_grupa_tip::text;
  return new;
end $$;
create trigger clanstvo_grupe_provjera before insert or update on clanstvo_grupe
  for each row execute function private.clanstvo_grupe_provjera();

create table pravila_prolaza (
  kolegij_id               uuid primary key references kolegij on delete cascade,
  min_dolaznost_predavanja numeric(5,2) not null default 50 check (min_dolaznost_predavanja between 0 and 100),
  min_dolaznost_vjezbi     numeric(5,2) not null default 75 check (min_dolaznost_vjezbi between 0 and 100),
  min_bodova               numeric(6,2) not null default 0 check (min_bodova >= 0),
  opravdano_se_racuna      text not null default 'izuzeto'
                           check (opravdano_se_racuna in ('kao_prisutan', 'izuzeto', 'kao_odsutan')),
  updated_at               timestamptz not null default now()
);
create trigger pravila_prolaza_updated_at before update on pravila_prolaza
  for each row execute function private.postavi_updated_at();

-- Svaki kolegij odmah dobiva zadana pravila prolaza.
create function private.kolegij_zadana_pravila() returns trigger
  language plpgsql security definer set search_path = ''
  as $$ begin insert into public.pravila_prolaza (kolegij_id) values (new.id); return new; end $$;
create trigger kolegij_zadana_pravila after insert on kolegij
  for each row execute function private.kolegij_zadana_pravila();

create table uvoz (
  id             uuid primary key default gen_random_uuid(),
  kolegij_id     uuid not null references kolegij on delete cascade,
  autor_id       uuid not null references korisnik,
  naziv_datoteke text,
  sazetak        jsonb not null,
  created_at     timestamptz not null default now()
);
create index on uvoz (kolegij_id, created_at);

-- migrate:down
drop table uvoz;
drop function private.kolegij_zadana_pravila() cascade;
drop table pravila_prolaza;
drop table clanstvo_grupe;
drop function private.clanstvo_grupe_provjera();
drop table upis, student, asistent_grupa, grupa, osoblje_kolegija, kolegij, osoblje;
