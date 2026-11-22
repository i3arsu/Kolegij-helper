-- migrate:up

-- Total de puntos que se pueden conseguir en el curso.
-- NULL significa que no se ha configurado el total planificado.
alter table public.pravila_prolaza
    add column planirano_bodova numeric(6,2)
    check (planirano_bodova > 0);


-- Una fila por estudiante y sesión contabilizada.
-- Reutiliza exactamente la selección de sesiones de v_dolaznost.
create view public.v_dolazak_studenta
with (security_invoker = true)
as
with relevantni as (
    select
        u.kolegij_id,
        u.student_id,
        cg.tip,
        cg.grupa_id,
        t.id as termin_id,
        t.pocetak,
        coalesce(d.status::text, 'odsutan') as status
    from public.upis u
    join public.clanstvo_grupe cg
      on cg.upis_id = u.id
    join public.termin t
      on t.grupa_id = cg.grupa_id
     and cg.vrijedi @> t.pocetak
     and not t.otkazan
     and t.evidencija_spremljena_at is not null
    left join public.dolazak d
      on d.termin_id = t.id
     and d.student_id = u.student_id
    where u.status = 'aktivan'
)
select
    kolegij_id,
    student_id,
    tip,
    grupa_id,
    termin_id,
    pocetak,
    status
from relevantni;


-- Una fila por matrícula activa dentro del ámbito visible
-- para el usuario que consulta.
-- Los asistentes solo incluyen estudiantes de sus grupos.
create view public.v_bodovi
with (security_invoker = true)
as
with upisi_u_opsegu as (
    select
        u.id,
        u.kolegij_id,
        u.student_id
    from public.upis u
    where u.status = 'aktivan'
      and (
          -- El estudiante siempre puede consultar su propia matrícula.
          u.student_id = private.moj_student_id()

          -- El profesor puede consultar todas las matrículas del curso.
          or private.je_nastavnik(u.kolegij_id)

          -- El asistente solo incluye estudiantes de sus grupos asignados.
          or exists (
              select 1
              from public.asistent_grupa ag
              join public.grupa g
                on g.id = ag.grupa_id
              join public.clanstvo_grupe cg
                on cg.grupa_id = ag.grupa_id
               and cg.upis_id = u.id
              where ag.osoblje_id = private.moj_osoblje_id()
                and g.kolegij_id = u.kolegij_id
          )
      )
),
bodovi_po_studentu as (
    select
        vp.kolegij_id,
        vp.student_id,

        sum(
            case
                when vp.status = 'prihvaceno'
                    then coalesce(vp.bodovi, 0)
                else 0
            end
        ) as prihvaceno,

        sum(
            case
                when vp.status <> 'prihvaceno'
                    then coalesce(vp.bodovi, 0)
                else 0
            end
        ) as privremeno,

        sum(z.max_bodova) as max_objavljeno,

        sum(
            case
                -- Una entrega aceptada pierde los puntos
                -- que no ha conseguido.
                when vp.status = 'prihvaceno'
                    then z.max_bodova - coalesce(vp.bodovi, 0)

                -- Una tarea pendiente pierde todos sus puntos
                -- cuando el plazo efectivo ha pasado y no
                -- se permiten entregas tardías.
                when vp.status = 'nije_predano'
                 and vp.rok_prosao
                 and not z.dopusti_kasnu_predaju
                    then z.max_bodova

                else 0
            end
        ) as izgubljeno

    from public.v_predaja vp
    join public.zadatak z
      on z.id = vp.zadatak_id
    join upisi_u_opsegu u
      on u.kolegij_id = vp.kolegij_id
     and u.student_id = vp.student_id
    where z.objavljen_at is not null
    group by vp.kolegij_id, vp.student_id
)
select
    u.kolegij_id,
    u.student_id,

    coalesce(b.prihvaceno, 0) as prihvaceno,
    coalesce(b.privremeno, 0) as privremeno,
    coalesce(b.max_objavljeno, 0) as max_objavljeno,
    coalesce(b.izgubljeno, 0) as izgubljeno,

    p.min_bodova,
    p.planirano_bodova,

    coalesce(b.prihvaceno, 0) >= p.min_bodova
        as zadovoljava,

    (
        p.planirano_bodova is not null
        and p.planirano_bodova
            - coalesce(b.izgubljeno, 0) < p.min_bodova
    ) as rizik

from upisi_u_opsegu u
join public.pravila_prolaza p
  on p.kolegij_id = u.kolegij_id
left join bodovi_po_studentu b
  on b.kolegij_id = u.kolegij_id
 and b.student_id = u.student_id;


-- Una fila por matrícula visible para el usuario.
-- Combina las condiciones de asistencia y puntos.
create view public.v_prolaz
with (security_invoker = true)
as
with dolaznost as (
    select
        kolegij_id,
        student_id,

        max(postotak) filter (
            where tip = 'predavanje'
        ) as dolaznost_p,

        max(postotak) filter (
            where tip = 'vjezbe'
        ) as dolaznost_v,

        bool_or(postotak >= prag) filter (
            where tip = 'predavanje'
        ) as dolaznost_p_ok,

        bool_or(postotak >= prag) filter (
            where tip = 'vjezbe'
        ) as dolaznost_v_ok

    from public.v_dolaznost
    group by kolegij_id, student_id
)
select
    b.kolegij_id,
    b.student_id,

    d.dolaznost_p,
    d.dolaznost_v,

    d.dolaznost_p_ok,
    d.dolaznost_v_ok,

    b.zadovoljava as bodovi_ok,

    case
        when d.dolaznost_p_ok is false
          or d.dolaznost_v_ok is false
          or b.zadovoljava is false
            then false

        when d.dolaznost_p_ok is null
          or d.dolaznost_v_ok is null
          or b.zadovoljava is null
            then null

        else true
    end as zadovoljava

from public.v_bodovi b
left join dolaznost d
  on d.kolegij_id = b.kolegij_id
 and d.student_id = b.student_id;


-- migrate:down

drop view public.v_prolaz;
drop view public.v_bodovi;
drop view public.v_dolazak_studenta;

alter table public.pravila_prolaza
    drop column planirano_bodova;