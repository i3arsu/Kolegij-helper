-- migrate:up
-- Osoblje grupe vidi i studente koji su na njihovim terminima bili gosti (inače se gost ne bi prikazao).
create or replace function private.vidi_studenta(p_kolegij uuid, p_student uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select private.je_nastavnik(p_kolegij)
        or exists (select 1 from public.clanstvo_grupe cg
                   join public.upis u on u.id = cg.upis_id
                   where u.kolegij_id = p_kolegij
                     and u.student_id = p_student
                     and private.vidi_grupu(cg.grupa_id))
        or exists (select 1 from public.dolazak d
                   join public.termin t on t.id = d.termin_id
                   where d.student_id = p_student
                     and d.gost
                     and t.kolegij_id = p_kolegij
                     and private.vidi_grupu(t.grupa_id))
  $$;

-- Asistent ne vidi studente izvan svojih grupa pa gosta traži po JMBAG-u kroz ovu funkciju.
create function private.nadji_studenta_za_termin(p_termin uuid, p_jmbag text) returns uuid
  language plpgsql stable security definer set search_path = ''
  as $$
declare
  v_termin public.termin;
begin
  select * into v_termin from public.termin t where t.id = p_termin;
  if v_termin.id is null or not private.vidi_grupu(v_termin.grupa_id) then
    raise exception 'Nemate ovlasti za ovaj termin' using errcode = '42501';
  end if;
  return (select s.id from public.student s
          join public.upis u on u.student_id = s.id
          where s.jmbag = p_jmbag and u.kolegij_id = v_termin.kolegij_id and u.status = 'aktivan');
end $$;

-- migrate:down
drop function private.nadji_studenta_za_termin(uuid, text);
