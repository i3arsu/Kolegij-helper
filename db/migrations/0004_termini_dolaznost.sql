-- migrate:up
create table termin (
  id                       uuid primary key default gen_random_uuid(),
  kolegij_id               uuid not null,
  grupa_id                 uuid not null,
  pocetak                  timestamptz not null,
  kraj                     timestamptz not null,
  tema                     text,
  otkazan                  boolean not null default false,
  evidencija_spremljena_at timestamptz,   -- null = dolaznost nije unesena, termin ne ulazi u postotak
  qr_otvoren_do            timestamptz,   -- faza 4
  created_at               timestamptz not null default now(),
  constraint termin_kraj_nakon_pocetka check (kraj > pocetak),
  foreign key (grupa_id, kolegij_id) references grupa (id, kolegij_id) on delete cascade
);
create index on termin (grupa_id, pocetak);
create index on termin (kolegij_id, pocetak);

create table dolazak (
  termin_id       uuid references termin on delete cascade,
  student_id      uuid references student on delete cascade,
  status          status_dolaska not null,
  nacin           nacin_evidencije not null default 'rucno',
  gost            boolean not null default false,  -- student nije član grupe termina; ne ulazi u postotak
  napomena        text,
  evidentirao     uuid references korisnik default private.trenutni_korisnik(),
  evidentirano_at timestamptz not null default now(),
  primary key (termin_id, student_id)
);
create index on dolazak (student_id);

-- Dolazak bez oznake gost zahtijeva članstvo u grupi termina u trenutku termina;
-- gost mora biti barem upisan na kolegij.
create function private.dolazak_provjera() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_termin public.termin;
begin
  select * into v_termin from public.termin t where t.id = new.termin_id;
  if new.gost then
    if not exists (select 1 from public.upis u
                   where u.kolegij_id = v_termin.kolegij_id and u.student_id = new.student_id) then
      raise exception 'Student nije upisan na kolegij' using errcode = 'P0001';
    end if;
  elsif not exists (select 1 from public.clanstvo_grupe cg
                    join public.upis u on u.id = cg.upis_id
                    where cg.grupa_id = v_termin.grupa_id
                      and u.student_id = new.student_id
                      and cg.vrijedi @> v_termin.pocetak) then
    raise exception 'Student nije član grupe u vrijeme termina' using errcode = 'P0001';
  end if;
  new.evidentirano_at := now();
  new.evidentirao := coalesce(private.trenutni_korisnik(), new.evidentirao);
  return new;
end $$;
create trigger dolazak_provjera before insert or update on dolazak
  for each row execute function private.dolazak_provjera();

-- Revizijski trag: tko je i kada mijenjao osjetljive podatke.
create table revizija (
  id         bigint generated always as identity primary key,
  tablica    text not null,
  radnja     text not null,
  kljuc      jsonb not null,
  staro      jsonb,
  novo       jsonb,
  autor      uuid default private.trenutni_korisnik(),
  created_at timestamptz not null default now()
);
create index on revizija (tablica, created_at);
revoke all on revizija from app_user;

create function private.zapisi_reviziju() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_kljuc jsonb;
  v_red   jsonb := to_jsonb(coalesce(new, old));
begin
  select jsonb_object_agg(k, v_red -> k) into v_kljuc from unnest(tg_argv) as k;
  insert into public.revizija (tablica, radnja, kljuc, staro, novo)
  values (tg_table_name, lower(tg_op), v_kljuc,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;
create trigger dolazak_revizija after insert or update or delete on dolazak
  for each row execute function private.zapisi_reviziju('termin_id', 'student_id');

-- migrate:down
drop table revizija;
drop function private.zapisi_reviziju();
drop table dolazak;
drop function private.dolazak_provjera();
drop table termin;
