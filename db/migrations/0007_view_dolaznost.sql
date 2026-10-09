-- migrate:up
-- Dolaznost po studentu i tipu nastave. security_invoker: RLS tablica ispod vrijedi za pozivatelja,
-- pa student vidi samo svoj red, asistent samo svoje grupe.
create view v_dolaznost with (security_invoker = true) as
with relevantni as (
  select u.kolegij_id, u.student_id, cg.tip, t.id as termin_id,
         coalesce(d.status::text, 'odsutan') as status
  from upis u
  join clanstvo_grupe cg on cg.upis_id = u.id
  join termin t on t.grupa_id = cg.grupa_id
               and cg.vrijedi @> t.pocetak
               and not t.otkazan
               and t.evidencija_spremljena_at is not null
  left join dolazak d on d.termin_id = t.id and d.student_id = u.student_id
  where u.status = 'aktivan'
),
zbroj as (
  select kolegij_id, student_id, tip,
         count(*)::int                                     as odrzano,
         count(*) filter (where status = 'prisutan')::int  as prisutan,
         count(*) filter (where status = 'opravdano')::int as opravdano,
         count(*) filter (where status = 'odsutan')::int   as odsutan
  from relevantni
  group by kolegij_id, student_id, tip
)
select z.kolegij_id, z.student_id, z.tip, z.odrzano, z.prisutan, z.opravdano, z.odsutan,
       round(case coalesce(p.opravdano_se_racuna, 'izuzeto')
               when 'kao_prisutan' then 100.0 * (z.prisutan + z.opravdano) / nullif(z.odrzano, 0)
               when 'kao_odsutan'  then 100.0 * z.prisutan / nullif(z.odrzano, 0)
               else                     100.0 * z.prisutan / nullif(z.odrzano - z.opravdano, 0)
             end, 1) as postotak,
       case z.tip when 'predavanje' then p.min_dolaznost_predavanja else p.min_dolaznost_vjezbi end as prag
from zbroj z
left join pravila_prolaza p on p.kolegij_id = z.kolegij_id;

-- migrate:down
drop view v_dolaznost;
