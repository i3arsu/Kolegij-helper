-- migrate:up

-- Jedan red po verziji predaje, s rokom za tu verziju.
create view public.v_predaja_verzija
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


-- Jedan red po studentu i zadatku koji mu je dodijeljen.
create view public.v_predaja
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


-- Views are read-only for application users.
revoke all on public.v_predaja_verzija, public.v_predaja
    from public;

revoke insert, update, delete
    on public.v_predaja_verzija, public.v_predaja
    from app_user;

grant select
    on public.v_predaja_verzija, public.v_predaja
    to app_user;


-- migrate:down

drop view public.v_predaja;
drop view public.v_predaja_verzija;