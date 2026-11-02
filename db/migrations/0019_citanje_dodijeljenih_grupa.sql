
-- migrate:up

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

          -- Studentovu dodjelu provjerava SECURITY DEFINER funkcija.
          or private.zadatak_dodijeljen(z.id, u.student_id)

          -- Osoblje vidi dodjele prema trenutnim grupama.
          or (
              private.je_osoblje(z.kolegij_id)
              and exists (
                  select 1
                  from public.zadatak_grupa zg
                  join public.clanstvo_grupe cg
                    on cg.grupa_id = zg.grupa_id
                   and cg.upis_id = u.id
                  where zg.zadatak_id = z.id
                    and upper_inf(cg.vrijedi)
              )
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


-- migrate:down

-- Vraća prethodnu implementaciju pogleda.
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