-- migrate:up
-- Pomoćne funkcije za RLS. security definer (vlasnik app_owner) zaobilazi RLS unutar funkcije,
-- što sprječava rekurziju politika. Sve imaju prazan search_path.

create function private.moj_student_id() returns uuid
  language sql stable security definer set search_path = ''
  as $$ select s.id from public.student s where s.korisnik_id = private.trenutni_korisnik() $$;

create function private.moj_osoblje_id() returns uuid
  language sql stable security definer set search_path = ''
  as $$ select o.id from public.osoblje o where o.korisnik_id = private.trenutni_korisnik() $$;

create function private.je_admin() returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select coalesce((select k.je_admin from public.korisnik k
                     where k.id = private.trenutni_korisnik() and k.aktivan), false)
  $$;

create function private.je_nastavnik(p_kolegij uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select exists (select 1 from public.osoblje_kolegija ok
                   join public.osoblje o on o.id = ok.osoblje_id
                   where ok.kolegij_id = p_kolegij
                     and ok.uloga = 'nastavnik'
                     and o.korisnik_id = private.trenutni_korisnik())
  $$;

create function private.je_osoblje(p_kolegij uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select exists (select 1 from public.osoblje_kolegija ok
                   join public.osoblje o on o.id = ok.osoblje_id
                   where ok.kolegij_id = p_kolegij
                     and o.korisnik_id = private.trenutni_korisnik())
  $$;

-- Nastavnik kolegija grupe ili asistent dodijeljen grupi (i još uvijek na kolegiju).
create function private.vidi_grupu(p_grupa uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select exists (select 1 from public.grupa g
                   where g.id = p_grupa and private.je_nastavnik(g.kolegij_id))
        or exists (select 1 from public.asistent_grupa ag
                   join public.osoblje o on o.id = ag.osoblje_id
                   join public.grupa g on g.id = ag.grupa_id
                   join public.osoblje_kolegija ok on ok.osoblje_id = o.id and ok.kolegij_id = g.kolegij_id
                   where ag.grupa_id = p_grupa
                     and o.korisnik_id = private.trenutni_korisnik())
  $$;

-- Nastavnik na kolegiju, ili asistent kojem je student (ikad) bio u nekoj od njegovih grupa.
create function private.vidi_studenta(p_kolegij uuid, p_student uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select private.je_nastavnik(p_kolegij)
        or exists (select 1 from public.clanstvo_grupe cg
                   join public.upis u on u.id = cg.upis_id
                   where u.kolegij_id = p_kolegij
                     and u.student_id = p_student
                     and private.vidi_grupu(cg.grupa_id))
  $$;

-- Je li trenutni student (ikad) bio član grupe.
create function private.moja_grupa(p_grupa uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select exists (select 1 from public.clanstvo_grupe cg
                   join public.upis u on u.id = cg.upis_id
                   where cg.grupa_id = p_grupa
                     and u.student_id = private.moj_student_id())
  $$;

create function private.moj_kolegij(p_kolegij uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select exists (select 1 from public.upis u
                   where u.kolegij_id = p_kolegij
                     and u.student_id = private.moj_student_id()
                     and u.status = 'aktivan')
  $$;

create function private.vidi_korisnika(p_korisnik uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select p_korisnik = private.trenutni_korisnik()
        or private.je_admin()
        or exists (select 1 from public.student s
                   join public.upis u on u.student_id = s.id
                   where s.korisnik_id = p_korisnik
                     and private.vidi_studenta(u.kolegij_id, s.id))
        or exists (select 1 from public.osoblje o
                   join public.osoblje_kolegija ok on ok.osoblje_id = o.id
                   where o.korisnik_id = p_korisnik
                     and private.je_osoblje(ok.kolegij_id))
  $$;

-- migrate:down
drop function private.vidi_korisnika(uuid);
drop function private.moj_kolegij(uuid);
drop function private.moja_grupa(uuid);
drop function private.vidi_studenta(uuid, uuid);
drop function private.vidi_grupu(uuid);
drop function private.je_osoblje(uuid);
drop function private.je_nastavnik(uuid);
drop function private.je_admin();
drop function private.moj_osoblje_id();
drop function private.moj_student_id();
