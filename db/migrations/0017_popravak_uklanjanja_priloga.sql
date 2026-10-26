
-- migrate:up

-- Provjera ovlasti mora prethoditi provjeri postojanja priloga.
-- Nastavnik može ukloniti vezu priloga sa zadatkom kolegija
-- kojim upravlja, ali može fizički obrisati samo vlastitu datoteku.

create or replace function private.ukloni_prilog_zadatka(
    p_zadatak uuid,
    p_datoteka uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_kolegij_id uuid;
    v_vlasnik uuid;
    v_putanja_za_brisanje text := null;
begin
    -- Najprije provjeravamo zadatak i ovlasti nastavnika.
    select z.kolegij_id
      into v_kolegij_id
      from public.zadatak z
     where z.id = p_zadatak;

    if not found then
        raise exception 'Nedovoljno ovlasti za uklanjanje priloga.'
            using errcode = '42501';
    end if;

    if not coalesce(
        private.je_nastavnik(v_kolegij_id),
        false
    ) then
        raise exception 'Nedovoljno ovlasti za uklanjanje priloga.'
            using errcode = '42501';
    end if;

    -- Tek nakon provjere ovlasti tražimo vezu i zaključavamo
    -- vezu i datoteku tijekom provjere.
    select d.vlasnik
      into v_vlasnik
      from public.zadatak_prilog zp
      join public.datoteka d
        on d.id = zp.datoteka_id
     where zp.zadatak_id = p_zadatak
       and zp.datoteka_id = p_datoteka
     for update of zp, d;

    if not found then
        return jsonb_build_object(
            'pronadjen', false,
            'putanja', null
        );
    end if;

    -- Ovlašteni nastavnik uklanja vezu, neovisno o vlasniku
    -- datoteke. Sama datoteka ostaje zaštićena pravilima vlasništva.
    delete from public.zadatak_prilog
     where zadatak_id = p_zadatak
       and datoteka_id = p_datoteka;

    -- Funkcija je SECURITY DEFINER kako bi provjera obuhvatila
    -- sve reference, ne samo one vidljive kroz RLS trenutnog korisnika.
    if not exists (
        select 1
          from public.zadatak_prilog zp
         where zp.datoteka_id = p_datoteka
    )
    and not exists (
        select 1
          from public.predaja_datoteka pd
         where pd.datoteka_id = p_datoteka
    ) then
        -- Fizičko brisanje metapodataka dopušteno je samo vlasniku.
        delete from public.datoteka d
         where d.id = p_datoteka
           and d.vlasnik = private.trenutni_korisnik()
        returning d.putanja into v_putanja_za_brisanje;
    end if;

    return jsonb_build_object(
        'pronadjen', true,
        'putanja', v_putanja_za_brisanje
    );
end;
$$;

revoke all on function
    private.ukloni_prilog_zadatka(uuid, uuid)
    from public;

grant execute on function
    private.ukloni_prilog_zadatka(uuid, uuid)
    to app_user;


-- migrate:down

-- Vraćamo prethodnu implementaciju ako se migracija poništi.
create or replace function private.ukloni_prilog_zadatka(
    p_zadatak uuid,
    p_datoteka uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_kolegij_id uuid;
    v_vlasnik uuid;
    v_putanja_za_brisanje text := null;
begin
    -- Prethodna implementacija prvo je provjeravala vezu.
    select z.kolegij_id, d.vlasnik
      into v_kolegij_id, v_vlasnik
      from public.zadatak_prilog zp
      join public.zadatak z
        on z.id = zp.zadatak_id
      join public.datoteka d
        on d.id = zp.datoteka_id
     where zp.zadatak_id = p_zadatak
       and zp.datoteka_id = p_datoteka
     for update of zp, d;

    if not found then
        return jsonb_build_object(
            'pronadjen', false,
            'putanja', null
        );
    end if;

    if not private.je_nastavnik(v_kolegij_id) then
        raise exception 'Nedovoljno ovlasti za uklanjanje priloga.'
            using errcode = '42501';
    end if;

    -- Prethodna implementacija dopuštala je uklanjanje samo vlasniku.
    if v_vlasnik is distinct from private.trenutni_korisnik() then
        raise exception 'Korisnik nije vlasnik datoteke.'
            using errcode = '42501';
    end if;

    delete from public.zadatak_prilog
     where zadatak_id = p_zadatak
       and datoteka_id = p_datoteka;

    if not exists (
        select 1
          from public.zadatak_prilog zp
         where zp.datoteka_id = p_datoteka
    )
    and not exists (
        select 1
          from public.predaja_datoteka pd
         where pd.datoteka_id = p_datoteka
    ) then
        delete from public.datoteka d
         where d.id = p_datoteka
           and d.vlasnik = private.trenutni_korisnik()
        returning d.putanja into v_putanja_za_brisanje;
    end if;

    return jsonb_build_object(
        'pronadjen', true,
        'putanja', v_putanja_za_brisanje
    );
end;
$$;

revoke all on function
    private.ukloni_prilog_zadatka(uuid, uuid)
    from public;

grant execute on function
    private.ukloni_prilog_zadatka(uuid, uuid)
    to app_user;
