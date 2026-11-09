
-- migrate:up

create or replace function private.ocijeni(
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

    -- Rok dorade mora biti u budućnosti.
    if p_odluka = 'vraceno_na_doradu'
       and p_rok_dorade is not null
       and p_rok_dorade <= now() then
        raise exception 'Rok dorade mora biti u budućnosti.'
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

    -- Ocjenjivanje je dopušteno samo za aktivni pregled.
    if v_predaja.status <> 'u_pregledu' then
        raise exception 'Predaja nije u stanju koje omogućuje ovu radnju.'
            using errcode = 'P0001';
    end if;

    -- Samo osoba koja je preuzela pregled može ga ocijeniti.
    if v_predaja.pregledava is distinct from private.trenutni_korisnik() then
        raise exception 'Nemate ovlasti za ovu predaju'
            using errcode = '42501';
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
     where id = p_predaja;
end;
$$;


-- migrate:down

-- Vraća prethodnu implementaciju ocjenjivanja.
create or replace function private.ocijeni(
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
     where id = p_predaja;
end;
$$;