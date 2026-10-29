-- migrate:up

-- Produljenje ne smije skratiti rok ako se izvorni rok
-- zadatka naknadno pomakne na kasniji datum.
create or replace view public.v_predaja_verzija
with (security_invoker = true)
as
select
    v.id as verzija_id,
    v.predaja_id,
    p.zadatak_id,
    p.student_id,
    v.broj,
    v.tekst,
    v.link,
    v.predano_at,
    r.rok_verzije,
    coalesce(v.predano_at > r.rok_verzije, false) as kasni
from public.predaja_verzija v
join public.predaja p
  on p.id = v.predaja_id
join public.zadatak z
  on z.id = p.zadatak_id
left join public.produzenje_roka pr
  on pr.zadatak_id = p.zadatak_id
 and pr.student_id = p.student_id
cross join lateral (
    select
        case
            when v.broj = 1 then greatest(pr.novi_rok, z.rok)
            else (
                select pi.rok_dorade
                from public.povratna_informacija pi
                where pi.predaja_id = p.id
                  and pi.verzija_broj = v.broj - 1
            )
        end as rok_verzije
) r;


-- Jedan red po studentu i zadatku koji mu je dodijeljen.
create or replace view public.v_predaja
with (security_invoker = true)
as
with dodijeljeni as (
    select
        z.kolegij_id,
        z.id as zadatak_id,
        u.student_id
    from public.zadatak z
    join public.upis u
      on u.kolegij_id = z.kolegij_id
     and u.status = 'aktivan'
    where z.objavljen_at is not null
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

    union

    -- Postojeće predaje ostaju vidljive nakon promjene grupe.
    select
        z.kolegij_id,
        p.zadatak_id,
        p.student_id
    from public.predaja p
    join public.zadatak z
      on z.id = p.zadatak_id
    where z.objavljen_at is not null
)
select
    d.kolegij_id,
    d.zadatak_id,
    d.student_id,
    p.id as predaja_id,
    coalesce(
        p.status,
        'nije_predano'::public.status_predaje
    ) as status,
    coalesce(p.trenutna_verzija, 0) as trenutna_verzija,
    p.bodovi,
    p.pregledava,
    zv.predano_at,
    coalesce(zv.kasni, false) as kasni,
    greatest(pr.novi_rok, z.rok) as rok,
    now() > greatest(pr.novi_rok, z.rok) as rok_prosao
from dodijeljeni d
join public.zadatak z
  on z.id = d.zadatak_id
left join public.predaja p
  on p.zadatak_id = d.zadatak_id
 and p.student_id = d.student_id
left join public.produzenje_roka pr
  on pr.zadatak_id = d.zadatak_id
 and pr.student_id = d.student_id
left join public.v_predaja_verzija zv
  on zv.predaja_id = p.id
 and zv.broj = p.trenutna_verzija;



-- Actualizar el cálculo del plazo en la función de entrega.
create or replace function private.predaj_zadatak(
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
        select greatest(
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

-- migrate:down

-- Vraćamo prethodno ponašanje radi mogućnosti migracije unatrag.
create or replace view public.v_predaja_verzija
with (security_invoker = true)
as
select
    v.id as verzija_id,
    v.predaja_id,
    p.zadatak_id,
    p.student_id,
    v.broj,
    v.tekst,
    v.link,
    v.predano_at,
    r.rok_verzije,
    coalesce(v.predano_at > r.rok_verzije, false) as kasni
from public.predaja_verzija v
join public.predaja p
  on p.id = v.predaja_id
join public.zadatak z
  on z.id = p.zadatak_id
left join public.produzenje_roka pr
  on pr.zadatak_id = p.zadatak_id
 and pr.student_id = p.student_id
cross join lateral (
    select
        case
            when v.broj = 1 then coalesce(pr.novi_rok, z.rok)
            else (
                select pi.rok_dorade
                from public.povratna_informacija pi
                where pi.predaja_id = p.id
                  and pi.verzija_broj = v.broj - 1
            )
        end as rok_verzije
) r;

create or replace view public.v_predaja
with (security_invoker = true)
as
with dodijeljeni as (
    select
        z.kolegij_id,
        z.id as zadatak_id,
        u.student_id
    from public.zadatak z
    join public.upis u
      on u.kolegij_id = z.kolegij_id
     and u.status = 'aktivan'
    where z.objavljen_at is not null
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

    union

    select
        z.kolegij_id,
        p.zadatak_id,
        p.student_id
    from public.predaja p
    join public.zadatak z
      on z.id = p.zadatak_id
    where z.objavljen_at is not null
)
select
    d.kolegij_id,
    d.zadatak_id,
    d.student_id,
    p.id as predaja_id,
    coalesce(
        p.status,
        'nije_predano'::public.status_predaje
    ) as status,
    coalesce(p.trenutna_verzija, 0) as trenutna_verzija,
    p.bodovi,
    p.pregledava,
    zv.predano_at,
    coalesce(zv.kasni, false) as kasni,
    coalesce(pr.novi_rok, z.rok) as rok,
    now() > coalesce(pr.novi_rok, z.rok) as rok_prosao
from dodijeljeni d
join public.zadatak z
  on z.id = d.zadatak_id
left join public.predaja p
  on p.zadatak_id = d.zadatak_id
 and p.student_id = d.student_id
left join public.produzenje_roka pr
  on pr.zadatak_id = d.zadatak_id
 and pr.student_id = d.student_id
left join public.v_predaja_verzija zv
  on zv.predaja_id = p.id
 and zv.broj = p.trenutna_verzija;

-- Restaurar la función anterior al revertir la migración.
create or replace function private.predaj_zadatak(
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
