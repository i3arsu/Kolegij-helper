
-- migrate:up

create type public.status_predaje as enum (
    'nije_predano',
    'predano',
    'u_pregledu',
    'vraceno_na_doradu',
    'prihvaceno'
);

-- Jedna predaja po zadatku i studentu.
create table public.predaja (
    id               uuid primary key default gen_random_uuid(),
    zadatak_id       uuid not null
        references public.zadatak(id) on delete restrict,
    student_id       uuid not null
        references public.student(id) on delete cascade,
    status           public.status_predaje not null default 'nije_predano',
    trenutna_verzija int not null default 0
        check (trenutna_verzija >= 0),
    bodovi           numeric(6,2)
        check (bodovi >= 0),
    pregledava       uuid references public.korisnik(id),
    updated_at       timestamptz not null default now(),
    unique (zadatak_id, student_id)
);

create index predaja_student_idx
    on public.predaja (student_id);

create index predaja_zadatak_status_idx
    on public.predaja (zadatak_id, status);

create trigger predaja_postavi_updated_at
    before update on public.predaja
    for each row
    execute function private.postavi_updated_at();

-- Povijest predanih verzija.
create table public.predaja_verzija (
    id         uuid primary key default gen_random_uuid(),
    predaja_id uuid not null
        references public.predaja(id) on delete cascade,
    broj       int not null check (broj >= 1),
    tekst      text
        check (length(tekst) <= 20000),
    link       text
        check (link ~* '^https?://' and length(link) <= 2000),
    predano_at timestamptz not null default now(),
    unique (predaja_id, broj)
);

-- Datoteke povezane s određenom verzijom.
create table public.predaja_datoteka (
    verzija_id  uuid not null
        references public.predaja_verzija(id) on delete cascade,
    datoteka_id uuid not null
        references public.datoteka(id) on delete restrict,
    primary key (verzija_id, datoteka_id)
);

-- Jedna povratna informacija po verziji.
create table public.povratna_informacija (
    id           uuid primary key default gen_random_uuid(),
    predaja_id   uuid not null
        references public.predaja(id) on delete cascade,
    verzija_broj int not null,
    autor_id     uuid not null
        default private.trenutni_korisnik()
        references public.korisnik(id),
    komentar     text not null
        check (length(trim(komentar)) > 0),
    bodovi       numeric(6,2)
        check (bodovi >= 0),
    odluka       text not null
        check (odluka in ('vraceno_na_doradu', 'prihvaceno')),
    rok_dorade   timestamptz,
    created_at   timestamptz not null default now(),

    unique (predaja_id, verzija_broj),

    foreign key (predaja_id, verzija_broj)
        references public.predaja_verzija(predaja_id, broj)
        on delete cascade
);

-- Proširi provjeru dodjele: student zadržava pristup
-- zadatku ako već ima predaju, i nakon promjene grupe.
create or replace function private.zadatak_dodijeljen(
    p_zadatak uuid,
    p_student uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        p_student = private.moj_student_id(),
        false
    )
    and exists (
        select 1
        from public.zadatak z
        join public.upis u
          on u.kolegij_id = z.kolegij_id
         and u.student_id = p_student
         and u.status = 'aktivan'
        where z.id = p_zadatak
          and z.objavljen_at is not null
          and (
              z.za_cijeli_kolegij
              or exists (
                  select 1
                  from public.zadatak_grupa zg
                  join public.clanstvo_grupe cg
                    on cg.grupa_id = zg.grupa_id
                   and cg.upis_id = u.id
                  where zg.zadatak_id = z.id
                    and upper_inf(cg.vrijedi)
              )
              or exists (
                  select 1
                  from public.predaja p
                  where p.zadatak_id = z.id
                    and p.student_id = p_student
              )
          )
    );
$$;

revoke all on function private.zadatak_dodijeljen(uuid, uuid)
    from public;
grant execute on function private.zadatak_dodijeljen(uuid, uuid)
    to app_user;

-- Dozvoljeni prijelazi statusa.
create function private.predaja_prijelaz()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if
        (old.status = 'nije_predano' and new.status = 'predano')
        or (old.status = 'predano' and new.status = 'predano')
        or (old.status = 'predano' and new.status = 'u_pregledu')
        or (old.status = 'u_pregledu' and new.status = 'predano')
        or (
            old.status in ('predano', 'u_pregledu')
            and new.status in (
                'vraceno_na_doradu',
                'prihvaceno'
            )
        )
        or (
            old.status = 'vraceno_na_doradu'
            and new.status = 'predano'
        )
        or (
            old.status = 'prihvaceno'
            and new.status = 'u_pregledu'
        )
    then
        return new;
    end if;

    raise exception
        'Nedopušten prijelaz statusa: % → %',
        old.status,
        new.status
        using errcode = 'P0001';
end;
$$;

create trigger predaja_provjeri_prijelaz
    before update of status on public.predaja
    for each row
    execute function private.predaja_prijelaz();

-- Bodovi ne smiju prelaziti maksimum zadatka.
create function private.provjeri_bodove_povratne()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_max_bodova numeric(6,2);
begin
    select z.max_bodova
      into v_max_bodova
      from public.predaja p
      join public.zadatak z on z.id = p.zadatak_id
     where p.id = new.predaja_id;

    if new.bodovi is not null
       and v_max_bodova is not null
       and new.bodovi > v_max_bodova
    then
        raise exception
            'Bodovi ne mogu biti veći od maksimuma zadatka'
            using errcode = 'P0001';
    end if;

    return new;
end;
$$;

create trigger povratna_provjeri_bodove
    before insert or update of predaja_id, bodovi
    on public.povratna_informacija
    for each row
    execute function private.provjeri_bodove_povratne();

-- Maksimum se ne može smanjiti ispod već dodijeljenih bodova.
create function private.provjeri_max_bodova_zadatka()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if exists (
        select 1
        from public.predaja p
        where p.zadatak_id = new.id
          and p.bodovi > new.max_bodova
    ) then
        raise exception
            'Maksimalan broj bodova ne može biti manji od već dodijeljenih bodova'
            using errcode = 'P0001';
    end if;

    return new;
end;
$$;

create trigger zadatak_provjeri_max_bodova
    before update of max_bodova on public.zadatak
    for each row
    execute function private.provjeri_max_bodova_zadatka();

-- Objavljeni zadatak s predajama ne može se povući.
create function private.zadatak_ne_povlaci_objavu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if old.objavljen_at is not null
       and new.objavljen_at is null
       and exists (
           select 1
           from public.predaja p
           where p.zadatak_id = old.id
       )
    then
        raise exception
            'Zadatak s predajama ne može se povući iz objave'
            using errcode = 'P0001';
    end if;

    return new;
end;
$$;

create trigger zadatak_provjeri_povlacenje_objave
    before update of objavljen_at on public.zadatak
    for each row
    execute function private.zadatak_ne_povlaci_objavu();

-- Revizijski trag.
create trigger predaja_revizija
    after update of status on public.predaja
    for each row
    execute function private.zapisi_reviziju('id');

create trigger povratna_informacija_revizija
    after insert or update or delete on public.povratna_informacija
    for each row
    execute function private.zapisi_reviziju('id');

-- RLS: sve četiri tablice imaju samo SELECT politiku.
-- Promjene idu kroz zaštićene funkcije u migraciji 0012.
alter table public.predaja enable row level security;
alter table public.predaja_verzija enable row level security;
alter table public.predaja_datoteka enable row level security;
alter table public.povratna_informacija enable row level security;

create policy predaja_cita
    on public.predaja
    for select to app_user
    using (
        student_id = (select private.moj_student_id())
        or exists (
            select 1
            from public.zadatak z
            where z.id = predaja.zadatak_id
              and private.vidi_studenta(
                  z.kolegij_id,
                  predaja.student_id
              )
        )
    );

create policy predaja_verzija_cita
    on public.predaja_verzija
    for select to app_user
    using (
        exists (
            select 1
            from public.predaja p
            where p.id = predaja_verzija.predaja_id
        )
    );

create policy predaja_datoteka_cita
    on public.predaja_datoteka
    for select to app_user
    using (
        exists (
            select 1
            from public.predaja_verzija v
            join public.predaja p on p.id = v.predaja_id
            where v.id = predaja_datoteka.verzija_id
        )
    );

create policy povratna_informacija_cita
    on public.povratna_informacija
    for select to app_user
    using (
        exists (
            select 1
            from public.predaja p
            where p.id = povratna_informacija.predaja_id
        )
    );

-- migrate:down

drop policy povratna_informacija_cita on public.povratna_informacija;
drop policy predaja_datoteka_cita on public.predaja_datoteka;
drop policy predaja_verzija_cita on public.predaja_verzija;
drop policy predaja_cita on public.predaja;

drop trigger povratna_informacija_revizija
    on public.povratna_informacija;
drop trigger predaja_revizija on public.predaja;
drop trigger zadatak_provjeri_povlacenje_objave on public.zadatak;
drop trigger zadatak_provjeri_max_bodova on public.zadatak;
drop trigger povratna_provjeri_bodove on public.povratna_informacija;
drop trigger predaja_provjeri_prijelaz on public.predaja;
drop trigger predaja_postavi_updated_at on public.predaja;

drop function private.zadatak_ne_povlaci_objavu();
drop function private.provjeri_max_bodova_zadatka();
drop function private.provjeri_bodove_povratne();
drop function private.predaja_prijelaz();

-- Vrati provjeru dodjele iz migracije 0010.
create or replace function private.zadatak_dodijeljen(
    p_zadatak uuid,
    p_student uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        p_student = private.moj_student_id(),
        false
    )
    and exists (
        select 1
        from public.zadatak z
        join public.upis u
          on u.kolegij_id = z.kolegij_id
         and u.student_id = p_student
         and u.status = 'aktivan'
        where z.id = p_zadatak
          and z.objavljen_at is not null
          and (
              z.za_cijeli_kolegij
              or exists (
                  select 1
                  from public.zadatak_grupa zg
                  join public.clanstvo_grupe cg
                    on cg.grupa_id = zg.grupa_id
                   and cg.upis_id = u.id
                  where zg.zadatak_id = z.id
                    and upper_inf(cg.vrijedi)
              )
          )
    );
$$;

drop table public.povratna_informacija;
drop table public.predaja_datoteka;
drop table public.predaja_verzija;
drop table public.predaja;
drop type public.status_predaje;