-- migrate:up

-- Uklanja vezu između zadatka i priloga.
-- Fizička datoteka briše se samo ako više nije korištena.
create function private.ukloni_prilog_zadatka(
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
    -- Zaključavamo vezu i datoteku tijekom provjere.
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

    -- Dodatna provjera ovlasti na razini baze.
    if not private.je_nastavnik(v_kolegij_id) then
        raise exception 'Nedovoljno ovlasti za uklanjanje priloga.'
            using errcode = '42501';
    end if;

    -- Prilog smije ukloniti samo vlasnik datoteke.
    if v_vlasnik is distinct from private.trenutni_korisnik() then
        raise exception 'Korisnik nije vlasnik datoteke.'
            using errcode = '42501';
    end if;

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

drop function private.ukloni_prilog_zadatka(uuid, uuid);
