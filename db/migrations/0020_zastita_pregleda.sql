-- migrate:up

-- Samo osoba koja je preuzela pregled može ga otpustiti.
create or replace function private.otpusti_pregled(p_predaja uuid)
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

    -- Ne dopuštamo da drugi član osoblja otpusti tuđi pregled.
    if v_predaja.pregledava is distinct from private.trenutni_korisnik() then
        raise exception 'Nemate ovlasti za ovu predaju'
            using errcode = '42501';
    end if;

    update public.predaja
       set status = 'predano',
           pregledava = null
     where id = p_predaja;
end;
$$;


-- migrate:down

-- Vraća prethodnu implementaciju funkcije.
create or replace function private.otpusti_pregled(p_predaja uuid)
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