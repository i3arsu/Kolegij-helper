-- migrate:up

-- Metapodaci o datotekama. Sadržaj se sprema na disk, ne u bazu.
create table public.datoteka (
    id         uuid primary key default gen_random_uuid(),
    putanja    text not null unique,
    naziv      text not null,
    velicina   bigint not null
        check (velicina > 0 and velicina <= 20 * 1024 * 1024),
    mime       text not null,
    sha256     text not null,
    vlasnik    uuid not null
        default private.trenutni_korisnik()
        references public.korisnik(id),
    created_at timestamptz not null default now()
);

-- Zadatak. objavljen_at IS NULL znači da je zadatak skica.
create table public.zadatak (
    id                    uuid primary key default gen_random_uuid(),
    kolegij_id            uuid not null
        references public.kolegij(id) on delete cascade,
    naslov                text not null
        check (length(trim(naslov)) between 1 and 200),
    opis                  text not null default '',
    rok                   timestamptz not null,
    max_bodova            numeric(6,2) not null
        check (max_bodova > 0),
    nacini_predaje        text[] not null default ARRAY['datoteka']::text[]
        check (
            nacini_predaje <@ ARRAY['datoteka', 'link', 'tekst']::text[]
            and cardinality(nacini_predaje) > 0
        ),
    dopusti_kasnu_predaju boolean not null default true,
    za_cijeli_kolegij     boolean not null default true,
    objavljen_at          timestamptz,
    created_by            uuid not null
        default private.trenutni_korisnik()
        references public.korisnik(id),
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

create index zadatak_kolegij_rok_idx
    on public.zadatak (kolegij_id, rok);

create trigger zadatak_postavi_updated_at
    before update on public.zadatak
    for each row
    execute function private.postavi_updated_at();


-- Grupe kojima je zadatak dodijeljen.
-- Ako je za_cijeli_kolegij TRUE, ovaj spoj nije potreban.
create table public.zadatak_grupa (
    zadatak_id uuid not null
        references public.zadatak(id) on delete cascade,
    grupa_id   uuid not null
        references public.grupa(id) on delete cascade,
    primary key (zadatak_id, grupa_id)
);

create index zadatak_grupa_grupa_idx
    on public.zadatak_grupa (grupa_id);


-- Prilozi zadatka. Sadržaj datoteke ostaje na disku.
create table public.zadatak_prilog (
    zadatak_id  uuid not null
        references public.zadatak(id) on delete cascade,
    datoteka_id uuid not null
        references public.datoteka(id) on delete cascade,
    primary key (zadatak_id, datoteka_id)
);

create index zadatak_prilog_datoteka_idx
    on public.zadatak_prilog (datoteka_id);


-- Pojedinačno produljenje roka za studenta.
create table public.produzenje_roka (
    zadatak_id uuid not null
        references public.zadatak(id) on delete cascade,
    student_id uuid not null
        references public.student(id) on delete cascade,
    novi_rok   timestamptz not null,
    razlog     text,
    odobrio    uuid not null
        default private.trenutni_korisnik()
        references public.korisnik(id),
    created_at timestamptz not null default now(),
    primary key (zadatak_id, student_id)
);

create index produzenje_roka_student_idx
    on public.produzenje_roka (student_id);


-- Predlošci komentara dostupni osoblju kolegija.
create table public.predlozak_komentara (
    id         uuid primary key default gen_random_uuid(),
    kolegij_id uuid not null
        references public.kolegij(id) on delete cascade,
    naslov     text not null,
    tekst      text not null
);

create index predlozak_komentara_kolegij_idx
    on public.predlozak_komentara (kolegij_id);


-- Funkcija za provjeru dodjele zadatka studentu.
-- U M1 provjerava objavu, aktivan upis i članstvo u grupi.
-- U M2 će se proširiti za studente koji su već predali zadatak.
--
-- Odbija provjeru za drugi studentski ID: pozivatelj može provjeravati
-- samo vlastitu dodjelu. Osoblje pristup zadacima dobiva drugim pravilom.
create function private.zadatak_dodijeljen(
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

-- Funkciju aplikacija poziva preko RLS politike.
-- Parametar p_student ne može poslužiti za provjeru tuđih dodjela.
revoke all on function private.zadatak_dodijeljen(uuid, uuid) from public;
grant execute on function private.zadatak_dodijeljen(uuid, uuid) to app_user;


-- Uključujemo RLS na SVIM novim tablicama.
-- Za datoteka se SELECT i upload politike dodaju kasnije,
-- kada budu uvedene provjere vidljivosti i rute za datoteke.
alter table public.datoteka enable row level security;
alter table public.zadatak enable row level security;
alter table public.zadatak_grupa enable row level security;
alter table public.zadatak_prilog enable row level security;
alter table public.produzenje_roka enable row level security;
alter table public.predlozak_komentara enable row level security;


-- ZADATAK: osoblje kolegija vidi zadatke, student samo svoje dodijeljene objave.
create policy zadatak_cita
    on public.zadatak
    for select
    to app_user
    using (
        private.je_osoblje(kolegij_id)
        or private.zadatak_dodijeljen(
            id,
            private.moj_student_id()
        )
    );

create policy zadatak_dodaje
    on public.zadatak
    for insert
    to app_user
    with check (
        private.je_nastavnik(kolegij_id)
        and created_by = private.trenutni_korisnik()
    );

create policy zadatak_mijenja
    on public.zadatak
    for update
    to app_user
    using (private.je_nastavnik(kolegij_id))
    with check (private.je_nastavnik(kolegij_id));

-- Samo skice mogu se obrisati.
create policy zadatak_brise
    on public.zadatak
    for delete
    to app_user
    using (
        private.je_nastavnik(kolegij_id)
        and objavljen_at is null
    );


-- ZADATAK_GRUPA: vidljivo osoblju; mijenja samo nastavnik.
create policy zadatak_grupa_cita
    on public.zadatak_grupa
    for select
    to app_user
    using (
        exists (
            select 1
            from public.zadatak z
            where z.id = zadatak_id
              and private.je_osoblje(z.kolegij_id)
        )
    );

create policy zadatak_grupa_pise
    on public.zadatak_grupa
    for all
    to app_user
    using (
        exists (
            select 1
            from public.zadatak z
            join public.grupa g
              on g.id = grupa_id
            where z.id = zadatak_id
              and z.kolegij_id = g.kolegij_id
              and private.je_nastavnik(z.kolegij_id)
        )
    )
    with check (
        exists (
            select 1
            from public.zadatak z
            join public.grupa g
              on g.id = grupa_id
            where z.id = zadatak_id
              and z.kolegij_id = g.kolegij_id
              and private.je_nastavnik(z.kolegij_id)
        )
    );


-- ZADATAK_PRILOG: vidljivost prati vidljivost samog zadatka.
-- Dodavanje i uklanjanje priloga dopušteno je samo nastavniku.
create policy zadatak_prilog_cita
    on public.zadatak_prilog
    for select
    to app_user
    using (
        exists (
            select 1
            from public.zadatak z
            where z.id = zadatak_id
        )
    );

create policy zadatak_prilog_pise
    on public.zadatak_prilog
    for all
    to app_user
    using (
        exists (
            select 1
            from public.zadatak z
            where z.id = zadatak_id
              and private.je_nastavnik(z.kolegij_id)
        )
    )
    with check (
        exists (
            select 1
            from public.zadatak z
            where z.id = zadatak_id
              and private.je_nastavnik(z.kolegij_id)
        )
    );


-- PRODUZENJE_ROKA: student vidi svoje produljenje, osoblje podatke kolegija.
create policy produzenje_roka_cita
    on public.produzenje_roka
    for select
    to app_user
    using (
        student_id = private.moj_student_id()
        or exists (
            select 1
            from public.zadatak z
            where z.id = zadatak_id
              and private.je_osoblje(z.kolegij_id)
        )
    );

-- Pisanje je dopušteno nastavniku, uz provjeru da je student upisan
-- na isti kolegij kao zadatak.
create policy produzenje_roka_pise
    on public.produzenje_roka
    for all
    to app_user
    using (
        exists (
            select 1
            from public.zadatak z
            where z.id = zadatak_id
              and private.je_nastavnik(z.kolegij_id)
        )
    )
    with check (
        odobrio = private.trenutni_korisnik()
        and exists (
            select 1
            from public.zadatak z
            join public.upis u
              on u.kolegij_id = z.kolegij_id
             and u.student_id = produzenje_roka.student_id
             and u.status = 'aktivan'
            where z.id = produzenje_roka.zadatak_id
              and private.je_nastavnik(z.kolegij_id)
        )
    );


-- PREDLOZAK_KOMENTARA: osoblje može čitati; samo nastavnik mijenja.
create policy predlozak_komentara_cita
    on public.predlozak_komentara
    for select
    to app_user
    using (private.je_osoblje(kolegij_id));

create policy predlozak_komentara_pise
    on public.predlozak_komentara
    for all
    to app_user
    using (private.je_nastavnik(kolegij_id))
    with check (private.je_nastavnik(kolegij_id));


-- migrate:down

drop policy predlozak_komentara_pise on public.predlozak_komentara;
drop policy predlozak_komentara_cita on public.predlozak_komentara;

drop policy produzenje_roka_pise on public.produzenje_roka;
drop policy produzenje_roka_cita on public.produzenje_roka;

drop policy zadatak_prilog_pise on public.zadatak_prilog;
drop policy zadatak_prilog_cita on public.zadatak_prilog;

drop policy zadatak_grupa_pise on public.zadatak_grupa;
drop policy zadatak_grupa_cita on public.zadatak_grupa;

drop policy zadatak_brise on public.zadatak;
drop policy zadatak_mijenja on public.zadatak;
drop policy zadatak_dodaje on public.zadatak;
drop policy zadatak_cita on public.zadatak;

drop trigger zadatak_postavi_updated_at on public.zadatak;

drop function private.zadatak_dodijeljen(uuid, uuid);

drop table public.predlozak_komentara;
drop table public.produzenje_roka;
drop table public.zadatak_prilog;
drop table public.zadatak_grupa;
drop table public.datoteka;
drop table public.zadatak;