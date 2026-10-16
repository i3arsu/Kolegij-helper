
-- migrate:up

-- Provjerava smije li trenutni korisnik pregledavati ovu predaju.
create function private.smije_ocjenjivati(p_predaja uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.predaja p
        join public.zadatak z on z.id = p.zadatak_id
        where p.id = p_predaja
          and private.je_osoblje(z.kolegij_id)
          and private.vidi_studenta(z.kolegij_id, p.student_id)
    );
$$;

revoke all on function private.smije_ocjenjivati(uuid)
    from public, app_user;


-- Provjerava smije li trenutni korisnik vidjeti datoteku.
create function private.vidi_datoteku(p_datoteka uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select
        -- Vlasnik datoteke.
        exists (
            select 1
            from public.datoteka d
            where d.id = p_datoteka
              and d.vlasnik = private.trenutni_korisnik()
        )
        or
        -- Prilog zadatka koji korisnik smije vidjeti.
        exists (
            select 1
            from public.zadatak_prilog zp
            join public.zadatak z on z.id = zp.zadatak_id
            join public.datoteka d on d.id = zp.datoteka_id
            where d.id = p_datoteka
              and (
                  private.je_osoblje(z.kolegij_id)
                  or private.zadatak_dodijeljen(
                      z.id,
                      private.moj_student_id()
                  )
              )
        )
        or
        -- Datoteka predaje koju korisnik smije vidjeti.
        exists (
            select 1
            from public.predaja_datoteka pd
            join public.predaja_verzija v
              on v.id = pd.verzija_id
            join public.predaja p
              on p.id = v.predaja_id
            join public.zadatak z
              on z.id = p.zadatak_id
            where pd.datoteka_id = p_datoteka
              and (
                  p.student_id = private.moj_student_id()
                  or private.vidi_studenta(
                      z.kolegij_id,
                      p.student_id
                  )
              )
        );
$$;

revoke all on function private.vidi_datoteku(uuid) from public;
grant execute on function private.vidi_datoteku(uuid) to app_user;

create policy datoteka_cita
    on public.datoteka
    for select to app_user
    using (private.vidi_datoteku(id));

create policy datoteka_dodaje
    on public.datoteka
    for insert to app_user
    with check (
        vlasnik = private.trenutni_korisnik()
        and private.moj_osoblje_id() is not null
    );

create policy datoteka_brise
    on public.datoteka
    for delete to app_user
    using (vlasnik = private.trenutni_korisnik());


-- Student predaje novi rad ili mijenja postojeću verziju.
create function private.predaj_zadatak(
    p_zadatak uuid,
    p_tekst text,
    p_link text,
    p_datoteke jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_student       uuid;
    v_zadatak       public.zadatak%rowtype;
    v_predaja       public.predaja%rowtype;
    v_datoteke      jsonb := coalesce(p_datoteke, '[]'::jsonb);
    v_datoteka      jsonb;
    v_tekst          text := nullif(trim(p_tekst), '');
    v_link           text := nullif(trim(p_link), '');
    v_broj           integer;
    v_nova_verzija   boolean;
    v_verzija_id     uuid;
    v_rok            timestamptz;
    v_stare_datoteke uuid[] := array[]::uuid[];
    v_uklonjene      jsonb := '[]'::jsonb;
begin
    -- Prvo provjeravamo identitet i dodjelu zadatka.
    v_student := private.moj_student_id();

    if v_student is null
       or not coalesce(
           private.zadatak_dodijeljen(p_zadatak, v_student),
           false
       )
    then
        raise exception 'Nemate ovlasti za ovaj zadatak'
            using errcode = '42501';
    end if;

    select z.*
      into v_zadatak
      from public.zadatak z
     where z.id = p_zadatak;

    if not found then
        raise exception 'Nemate ovlasti za ovaj zadatak'
            using errcode = '42501';
    end if;

    -- Provjera načina predaje i sadržaja.
    if jsonb_typeof(v_datoteke) <> 'array' then
        raise exception 'Neispravan sadržaj predaje.'
            using errcode = 'P0001';
    end if;

    if jsonb_array_length(v_datoteke) > 5 then
        raise exception 'Neispravan sadržaj predaje.'
            using errcode = 'P0001';
    end if;

    if v_tekst is null and v_link is null
       and jsonb_array_length(v_datoteke) = 0
    then
        raise exception 'Neispravan sadržaj predaje.'
            using errcode = 'P0001';
    end if;

    if v_tekst is not null
       and (
           not ('tekst' = any(v_zadatak.nacini_predaje))
           or length(v_tekst) > 20000
       )
    then
        raise exception 'Neispravan sadržaj predaje.'
            using errcode = 'P0001';
    end if;

    if v_link is not null
       and (
           not ('link' = any(v_zadatak.nacini_predaje))
           or length(v_link) > 2000
           or v_link !~* '^https?://'
       )
    then
        raise exception 'Neispravan sadržaj predaje.'
            using errcode = 'P0001';
    end if;

    if jsonb_array_length(v_datoteke) > 0
       and not ('datoteka' = any(v_zadatak.nacini_predaje))
    then
        raise exception 'Neispravan sadržaj predaje.'
            using errcode = 'P0001';
    end if;

    -- Provjera metapodataka prije pretvaranja JSON-a u retke.
    for v_datoteka in
        select e.value
        from jsonb_array_elements(v_datoteke) as e(value)
    loop
        if coalesce(jsonb_typeof(v_datoteka), '') <> 'object'
           or coalesce(v_datoteka ->> 'putanja', '') = ''
           or coalesce(v_datoteka ->> 'naziv', '') = ''
           or coalesce(v_datoteka ->> 'mime', '') = ''
           or coalesce(v_datoteka ->> 'velicina', '') !~ '^[0-9]+$'
           or coalesce(v_datoteka ->> 'sha256', '') !~* '^[0-9a-f]{64}$'
        then
            raise exception 'Neispravni metapodaci datoteke.'
                using errcode = 'P0001';
        end if;

        if (v_datoteka ->> 'velicina')::bigint
              not between 1 and 20971520
        then
            raise exception 'Neispravni metapodaci datoteke.'
                using errcode = 'P0001';
        end if;
    end loop;

    -- Stvori red predaje ako je ovo prva predaja.
    insert into public.predaja (zadatak_id, student_id)
    values (p_zadatak, v_student)
    on conflict (zadatak_id, student_id) do nothing;

    -- Serijalizira istodobne promjene iste predaje.
    select p.*
      into v_predaja
      from public.predaja p
     where p.zadatak_id = p_zadatak
       and p.student_id = v_student
     for update;

    case v_predaja.status
        when 'nije_predano' then
            v_broj := 1;
            v_nova_verzija := true;

        when 'vraceno_na_doradu' then
            v_broj := v_predaja.trenutna_verzija + 1;
            v_nova_verzija := true;

        when 'predano' then
            if v_predaja.trenutna_verzija < 1 then
                raise exception 'Predaja nije u stanju koje omogućuje ovu radnju.'
                    using errcode = 'P0001';
            end if;

            v_broj := v_predaja.trenutna_verzija;
            v_nova_verzija := false;

        else
            raise exception
                'Predaja je u pregledu ili prihvaćena i ne može se mijenjati.'
                using errcode = 'P0001';
    end case;

    -- Rok prve verzije uključuje pojedinačno produljenje.
    -- Rok kasnijih verzija dolazi iz povratne informacije prethodne verzije.
    if v_broj = 1 then
        select coalesce(
            (
                select pr.novi_rok
                from public.produzenje_roka pr
                where pr.zadatak_id = p_zadatak
                  and pr.student_id = v_student
            ),
            v_zadatak.rok
        )
        into v_rok;
    else
        select pi.rok_dorade
          into v_rok
          from public.povratna_informacija pi
         where pi.predaja_id = v_predaja.id
           and pi.verzija_broj = v_broj - 1;
    end if;

    if not v_zadatak.dopusti_kasnu_predaju
       and v_rok is not null
       and now() > v_rok
    then
        raise exception 'Rok za predaju je istekao.'
            using errcode = 'P0001';
    end if;

    if v_nova_verzija then
        insert into public.predaja_verzija (
            predaja_id, broj, tekst, link, predano_at
        )
        values (
            v_predaja.id, v_broj, v_tekst, v_link, now()
        )
        returning id into v_verzija_id;

        update public.predaja
           set trenutna_verzija = v_broj,
               status = 'predano',
               pregledava = null
         where id = v_predaja.id;
    else
        -- Zamjena sadržaja iste verzije prije početka pregleda.
        select coalesce(
            array_agg(pd.datoteka_id),
            array[]::uuid[]
        )
        into v_stare_datoteke
        from public.predaja_datoteka pd
        join public.predaja_verzija pv
          on pv.id = pd.verzija_id
        where pv.predaja_id = v_predaja.id
          and pv.broj = v_broj;

        delete from public.predaja_datoteka pd
        using public.predaja_verzija pv
        where pv.id = pd.verzija_id
          and pv.predaja_id = v_predaja.id
          and pv.broj = v_broj;

        -- Briši metapodatke i vraćaj putanje samo za nekorištene datoteke.
        select coalesce(jsonb_agg(d.putanja), '[]'::jsonb)
          into v_uklonjene
          from public.datoteka d
         where d.id = any(v_stare_datoteke)
           and not exists (
               select 1
               from public.zadatak_prilog zp
               where zp.datoteka_id = d.id
           )
           and not exists (
               select 1
               from public.predaja_datoteka pd
               where pd.datoteka_id = d.id
           );

        delete from public.datoteka d
         where d.id = any(v_stare_datoteke)
           and not exists (
               select 1
               from public.zadatak_prilog zp
               where zp.datoteka_id = d.id
           )
           and not exists (
               select 1
               from public.predaja_datoteka pd
               where pd.datoteka_id = d.id
           );

        update public.predaja_verzija
           set tekst = v_tekst,
               link = v_link,
               predano_at = now()
         where predaja_id = v_predaja.id
           and broj = v_broj
        returning id into v_verzija_id;

        if v_verzija_id is null then
            raise exception 'Predaja nije u stanju koje omogućuje ovu radnju.'
                using errcode = 'P0001';
        end if;
    end if;

    -- Dodavanje metapodataka i veza za nove datoteke.
    with ulaz as (
        select x.putanja, x.naziv, x.velicina, x.mime, x.sha256
        from jsonb_to_recordset(v_datoteke) as x(
            putanja text,
            naziv text,
            velicina bigint,
            mime text,
            sha256 text
        )
    ),
    dodane as (
        insert into public.datoteka (
            putanja, naziv, velicina, mime, sha256
        )
        select putanja, naziv, velicina, mime, sha256
        from ulaz
        returning id
    )
    insert into public.predaja_datoteka (verzija_id, datoteka_id)
    select v_verzija_id, dodane.id
    from dodane;

    return jsonb_build_object(
        'predaja_id', v_predaja.id,
        'verzija', v_broj,
        'uklonjene_putanje', v_uklonjene
    );
end;
$$;


-- Preuzima predaju za pregled.
create function private.preuzmi_pregled(p_predaja uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_predaja public.predaja%rowtype;
begin
    if not coalesce(private.smije_ocjenjivati(p_predaja), false) then
        raise exception 'Nemate ovlasti za ovu predaju'
            using errcode = '42501';
    end if;

    select p.*
      into v_predaja
      from public.predaja p
     where p.id = p_predaja
     for update;

    if v_predaja.status <> 'predano' then
        raise exception 'Predaja nije u stanju koje omogućuje ovu radnju.'
            using errcode = 'P0001';
    end if;

    update public.predaja
       set status = 'u_pregledu',
           pregledava = private.trenutni_korisnik()
     where id = p_predaja;
end;
$$;


-- Oslobađa predaju iz pregleda.
create function private.otpusti_pregled(p_predaja uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_predaja public.predaja%rowtype;
begin
    if not coalesce(private.smije_ocjenjivati(p_predaja), false) then
        raise exception 'Nemate ovlasti za ovu predaju'
            using errcode = '42501';
    end if;

    select p.*
      into v_predaja
      from public.predaja p
     where p.id = p_predaja
     for update;

    if v_predaja.status <> 'u_pregledu' then
        raise exception 'Predaja nije u stanju koje omogućuje ovu radnju.'
            using errcode = 'P0001';
    end if;

    update public.predaja
       set status = 'predano',
           pregledava = null
     where id = p_predaja;
end;
$$;


-- Sprema povratnu informaciju i odluku nastavnika ili asistenta.
create function private.ocijeni(
    p_predaja uuid,
    p_odluka text,
    p_komentar text,
    p_bodovi numeric,
    p_rok_dorade timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_predaja public.predaja%rowtype;
begin
    if not coalesce(private.smije_ocjenjivati(p_predaja), false) then
        raise exception 'Nemate ovlasti za ovu predaju'
            using errcode = '42501';
    end if;

    if p_odluka is null
       or p_odluka not in ('vraceno_na_doradu', 'prihvaceno')
    then
        raise exception 'Odluka o predaji nije valjana.'
            using errcode = 'P0001';
    end if;

    if p_komentar is null or length(trim(p_komentar)) = 0 then
        raise exception 'Komentar je obavezan.'
            using errcode = 'P0001';
    end if;

    if p_odluka = 'prihvaceno' and p_bodovi is null then
        raise exception 'Za prihvaćanje su obavezni bodovi.'
            using errcode = 'P0001';
    end if;

    if p_bodovi < 0 then
        raise exception 'Neispravna vrijednost bodova.'
            using errcode = 'P0001';
    end if;

    select p.*
      into v_predaja
      from public.predaja p
     where p.id = p_predaja
     for update;

    if v_predaja.status not in ('predano', 'u_pregledu') then
        raise exception 'Predaja nije u stanju koje omogućuje ovu radnju.'
            using errcode = 'P0001';
    end if;

    -- Nakon ponovnog otvaranja ažurira se povratna informacija iste verzije.
    insert into public.povratna_informacija (
        predaja_id,
        verzija_broj,
        autor_id,
        komentar,
        bodovi,
        odluka,
        rok_dorade
    )
    values (
        v_predaja.id,
        v_predaja.trenutna_verzija,
        private.trenutni_korisnik(),
        trim(p_komentar),
        p_bodovi,
        p_odluka,
        p_rok_dorade
    )
    on conflict (predaja_id, verzija_broj)
    do update set
        autor_id = excluded.autor_id,
        komentar = excluded.komentar,
        bodovi = excluded.bodovi,
        odluka = excluded.odluka,
        rok_dorade = excluded.rok_dorade;

    update public.predaja
       set status = p_odluka::public.status_predaje,
           bodovi = coalesce(p_bodovi, bodovi),
           pregledava = null
     where id = v_predaja.id;
end;
$$;


-- Ponovno otvaranje prihvaćene predaje dopušteno je samo nastavniku.
create function private.ponovno_otvori(p_predaja uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_kolegij uuid;
    v_predaja public.predaja%rowtype;
begin
    select z.kolegij_id
      into v_kolegij
      from public.predaja p
      join public.zadatak z on z.id = p.zadatak_id
     where p.id = p_predaja;

    if v_kolegij is null or not private.je_nastavnik(v_kolegij) then
        raise exception 'Nemate ovlasti za ovu predaju'
            using errcode = '42501';
    end if;

    select p.*
      into v_predaja
      from public.predaja p
     where p.id = p_predaja
     for update;

    if v_predaja.status <> 'prihvaceno' then
        raise exception 'Predaja nije u stanju koje omogućuje ovu radnju.'
            using errcode = 'P0001';
    end if;

    update public.predaja
       set status = 'u_pregledu',
           pregledava = private.trenutni_korisnik()
     where id = p_predaja;
end;
$$;


-- Funkcije su dostupne aplikaciji samo ondje gdje je to potrebno.
revoke all on function private.predaj_zadatak(uuid, text, text, jsonb)
    from public;
revoke all on function private.preuzmi_pregled(uuid)
    from public;
revoke all on function private.otpusti_pregled(uuid)
    from public;
revoke all on function private.ocijeni(uuid, text, text, numeric, timestamptz)
    from public;
revoke all on function private.ponovno_otvori(uuid)
    from public;

grant execute on function private.predaj_zadatak(uuid, text, text, jsonb)
    to app_user;
grant execute on function private.preuzmi_pregled(uuid)
    to app_user;
grant execute on function private.otpusti_pregled(uuid)
    to app_user;
grant execute on function private.ocijeni(uuid, text, text, numeric, timestamptz)
    to app_user;
grant execute on function private.ponovno_otvori(uuid)
    to app_user;


-- migrate:down

drop policy datoteka_brise on public.datoteka;
drop policy datoteka_dodaje on public.datoteka;
drop policy datoteka_cita on public.datoteka;

drop function private.ponovno_otvori(uuid);
drop function private.ocijeni(uuid, text, text, numeric, timestamptz);
drop function private.otpusti_pregled(uuid);
drop function private.preuzmi_pregled(uuid);
drop function private.predaj_zadatak(uuid, text, text, jsonb);
drop function private.vidi_datoteku(uuid);
drop function private.smije_ocjenjivati(uuid);