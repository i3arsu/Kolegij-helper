-- migrate:up
-- Studenti, upisi i članstva mijenjaju se isključivo kroz ove funkcije (nema INSERT politika).
-- Svaka funkcija sama provjerava ovlasti pozivatelja.

create function private.zahtijevaj_nastavnika(p_kolegij uuid) returns void
  language plpgsql stable security definer set search_path = ''
  as $$
begin
  if not private.je_nastavnik(p_kolegij) then
    raise exception 'Nemate ovlasti za ovaj kolegij' using errcode = '42501';
  end if;
end $$;

-- Za pregled uvoza: koji JMBAG-ovi i e-mailovi već postoje (i izvan ovog kolegija).
create function private.uvoz_pripremi(p_kolegij uuid, p_jmbagovi text[], p_emailovi text[]) returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
begin
  perform private.zahtijevaj_nastavnika(p_kolegij);
  return jsonb_build_object(
    'studenti', coalesce((
      select jsonb_agg(jsonb_build_object(
               'jmbag', s.jmbag, 'ime', s.ime, 'prezime', s.prezime, 'email', k.email::text,
               'upis_status', u.status,
               'grupa_p', (select g.naziv from public.clanstvo_grupe cg join public.grupa g on g.id = cg.grupa_id
                           where cg.upis_id = u.id and cg.tip = 'predavanje' and upper_inf(cg.vrijedi)),
               'grupa_v', (select g.naziv from public.clanstvo_grupe cg join public.grupa g on g.id = cg.grupa_id
                           where cg.upis_id = u.id and cg.tip = 'vjezbe' and upper_inf(cg.vrijedi))))
      from public.student s
      join public.korisnik k on k.id = s.korisnik_id
      left join public.upis u on u.student_id = s.id and u.kolegij_id = p_kolegij
      where s.jmbag = any (p_jmbagovi)), '[]'::jsonb),
    'emailovi', coalesce((
      select jsonb_agg(jsonb_build_object('email', k.email::text, 'jmbag', s.jmbag))
      from public.korisnik k
      left join public.student s on s.korisnik_id = k.id
      where k.email = any (p_emailovi::public.citext[])), '[]'::jsonb)
  );
end $$;

-- Postavlja grupu zadanog tipa: zatvara trenutno članstvo i otvara novo od p_od.
-- Prvo članstvo upisa nema donju granicu (vrijedi za sve termine grupe).
-- Vraća true ako je došlo do promjene.
create function private.postavi_grupu(p_upis uuid, p_grupa uuid, p_od timestamptz) returns boolean
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_tip       text;
  v_trenutno  public.clanstvo_grupe;
  v_ikad      boolean;
begin
  select g.tip::text into v_tip from public.grupa g where g.id = p_grupa;
  select * into v_trenutno from public.clanstvo_grupe cg
   where cg.upis_id = p_upis and cg.tip = v_tip and upper_inf(cg.vrijedi);
  if v_trenutno.grupa_id = p_grupa then
    return false;
  end if;
  if v_trenutno.id is not null then
    if lower(v_trenutno.vrijedi) >= p_od then
      raise exception 'Datum promjene mora biti nakon početka trenutnog članstva' using errcode = 'P0001';
    end if;
    update public.clanstvo_grupe set vrijedi = tstzrange(lower(vrijedi), p_od) where id = v_trenutno.id;
  end if;
  select exists (select 1 from public.clanstvo_grupe cg where cg.upis_id = p_upis and cg.tip = v_tip) into v_ikad;
  insert into public.clanstvo_grupe (upis_id, grupa_id, tip, vrijedi)
  values (p_upis, p_grupa, v_tip, case when v_ikad then tstzrange(p_od, null) else tstzrange(null, null) end);
  return true;
end $$;

revoke execute on function private.postavi_grupu(uuid, uuid, timestamptz) from public;

-- Ručna promjena grupe iz sučelja.
create function private.promijeni_grupu(p_upis uuid, p_grupa uuid, p_od timestamptz) returns boolean
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_kolegij uuid;
begin
  select u.kolegij_id into v_kolegij from public.upis u where u.id = p_upis;
  perform private.zahtijevaj_nastavnika(v_kolegij);
  if not exists (select 1 from public.grupa g where g.id = p_grupa and g.kolegij_id = v_kolegij) then
    raise exception 'Grupa ne pripada kolegiju' using errcode = 'P0001';
  end if;
  return private.postavi_grupu(p_upis, p_grupa, p_od);
end $$;

-- CSV uvoz u jednoj transakciji. Redovi: {jmbag, ime, prezime, email, grupa_p, grupa_v, lozinka_hash}.
-- lozinka_hash je obavezan samo za studente koji još nemaju račun.
-- Ne briše ništa; studente kojih nema u datoteci ne dira.
create function private.uvezi_studente(p_kolegij uuid, p_redovi jsonb, p_od timestamptz, p_naziv_datoteke text)
  returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  r             jsonb;
  v_student     public.student;
  v_email       public.citext;
  v_stari_email public.citext;
  v_korisnik    uuid;
  v_upis        public.upis;
  v_grupa       uuid;
  v_tip         text;
  v_naziv       text;
  v_promjena    boolean;
  v_nov_student boolean;
  v_nov_upis    boolean;
  v_novi        int := 0;
  v_upisani     int := 0;
  v_izmijenjeni int := 0;
  v_grupe       int := 0;
  v_ponovno     int := 0;
  v_isti        int := 0;
  v_novi_racuni jsonb := '[]'::jsonb;
  v_sazetak     jsonb;
begin
  perform private.zahtijevaj_nastavnika(p_kolegij);

  for r in select * from jsonb_array_elements(p_redovi) loop
    v_promjena := false;
    v_nov_student := false;
    v_nov_upis := false;
    v_email := lower(trim(r ->> 'email'));
    if (r ->> 'jmbag') !~ '^\d{10}$' then
      raise exception 'Neispravan JMBAG: %', r ->> 'jmbag' using errcode = 'P0001';
    end if;

    select * into v_student from public.student s where s.jmbag = r ->> 'jmbag';

    if v_student.id is null then
      if r ->> 'lozinka_hash' is null then
        raise exception 'NEDOSTAJE_LOZINKA:%', r ->> 'jmbag' using errcode = 'P0001';
      end if;
      if exists (select 1 from public.korisnik k where k.email = v_email) then
        raise exception 'E-mail % već koristi drugi korisnik', v_email using errcode = 'P0001';
      end if;
      insert into public.korisnik (email, lozinka_hash, mora_promijeniti_lozinku)
      values (v_email, r ->> 'lozinka_hash', true)
      returning id into v_korisnik;
      insert into public.student (korisnik_id, jmbag, ime, prezime)
      values (v_korisnik, r ->> 'jmbag', trim(r ->> 'ime'), trim(r ->> 'prezime'))
      returning * into v_student;
      v_nov_student := true;
      v_novi_racuni := v_novi_racuni || jsonb_build_object('jmbag', v_student.jmbag, 'korisnik_id', v_korisnik);
    else
      if v_student.ime <> trim(r ->> 'ime') or v_student.prezime <> trim(r ->> 'prezime') then
        update public.student set ime = trim(r ->> 'ime'), prezime = trim(r ->> 'prezime') where id = v_student.id;
        v_promjena := true;
      end if;
      select k.email into v_stari_email from public.korisnik k where k.id = v_student.korisnik_id;
      if v_stari_email <> v_email then
        if exists (select 1 from public.korisnik k where k.email = v_email and k.id <> v_student.korisnik_id) then
          raise exception 'E-mail % već koristi drugi korisnik', v_email using errcode = 'P0001';
        end if;
        update public.korisnik set email = v_email where id = v_student.korisnik_id;
        insert into public.revizija (tablica, radnja, kljuc, staro, novo)
        values ('korisnik', 'promjena_emaila', jsonb_build_object('id', v_student.korisnik_id),
                jsonb_build_object('email', v_stari_email), jsonb_build_object('email', v_email));
        v_promjena := true;
      end if;
    end if;

    select * into v_upis from public.upis u where u.kolegij_id = p_kolegij and u.student_id = v_student.id;
    if v_upis.id is null then
      insert into public.upis (kolegij_id, student_id) values (p_kolegij, v_student.id) returning * into v_upis;
      v_nov_upis := true;
    elsif v_upis.status = 'ispisan' then
      update public.upis set status = 'aktivan' where id = v_upis.id;
      v_ponovno := v_ponovno + 1;
      v_promjena := true;
    end if;

    foreach v_tip in array array['predavanje', 'vjezbe'] loop
      v_naziv := nullif(trim(r ->> case v_tip when 'predavanje' then 'grupa_p' else 'grupa_v' end), '');
      continue when v_naziv is null;
      select g.id into v_grupa from public.grupa g
       where g.kolegij_id = p_kolegij and g.naziv = v_naziv and g.tip::text = v_tip;
      if v_grupa is null then
        raise exception 'Nepoznata grupa: %', v_naziv using errcode = 'P0001';
      end if;
      if exists (select 1 from public.clanstvo_grupe cg where cg.upis_id = v_upis.id and cg.tip = v_tip
                 and upper_inf(cg.vrijedi) and cg.grupa_id <> v_grupa) then
        v_grupe := v_grupe + 1;
        v_promjena := true;
      end if;
      perform private.postavi_grupu(v_upis.id, v_grupa, p_od);
    end loop;

    if v_nov_student then
      v_novi := v_novi + 1;
    elsif v_nov_upis then
      v_upisani := v_upisani + 1;          -- postojeći račun (npr. s drugog kolegija), novi upis
    elsif v_promjena then
      v_izmijenjeni := v_izmijenjeni + 1;
    else
      v_isti := v_isti + 1;
    end if;
  end loop;

  v_sazetak := jsonb_build_object(
    'novi', v_novi, 'upisani_postojeci', v_upisani, 'izmijenjeni', v_izmijenjeni, 'promjene_grupe', v_grupe,
    'ponovno_upisani', v_ponovno, 'nepromijenjeni', v_isti);
  insert into public.uvoz (kolegij_id, autor_id, naziv_datoteke, sazetak)
  values (p_kolegij, private.trenutni_korisnik(), p_naziv_datoteke, v_sazetak);

  return v_sazetak || jsonb_build_object('novi_racuni', v_novi_racuni);
end $$;

-- Reset lozinke studenta (nastavnik kolegija na koji je student upisan).
create function private.resetiraj_lozinku(p_student uuid, p_lozinka_hash text) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_korisnik uuid;
begin
  if not exists (select 1 from public.upis u where u.student_id = p_student and private.je_nastavnik(u.kolegij_id)) then
    raise exception 'Nemate ovlasti za ovog studenta' using errcode = '42501';
  end if;
  select s.korisnik_id into v_korisnik from public.student s where s.id = p_student;
  update public.korisnik
     set lozinka_hash = p_lozinka_hash, mora_promijeniti_lozinku = true, lozinka_promijenjena_at = now()
   where id = v_korisnik;
  delete from public.sesija where korisnik_id = v_korisnik;
  -- otključava račun zaključan zbog neuspjelih prijava
  delete from public.prijava_pokusaj p using public.korisnik k
   where k.id = v_korisnik and p.email = k.email and not p.uspjeh;
  insert into public.revizija (tablica, radnja, kljuc) values ('korisnik', 'reset_lozinke', jsonb_build_object('id', v_korisnik));
end $$;

-- Pronalazak člana osoblja po e-mailu (za dodavanje na kolegij).
create function private.nadji_osoblje(p_email text) returns uuid
  language plpgsql stable security definer set search_path = ''
  as $$
begin
  if not (private.je_admin() or exists (select 1 from public.osoblje_kolegija ok
                                         where ok.osoblje_id = private.moj_osoblje_id() and ok.uloga = 'nastavnik')) then
    raise exception 'Nemate ovlasti' using errcode = '42501';
  end if;
  return (select o.id from public.osoblje o join public.korisnik k on k.id = o.korisnik_id
          where k.email = p_email::public.citext);
end $$;

-- migrate:down
drop function private.nadji_osoblje(text);
drop function private.resetiraj_lozinku(uuid, text);
drop function private.uvezi_studente(uuid, jsonb, timestamptz, text);
drop function private.promijeni_grupu(uuid, uuid, timestamptz);
drop function private.postavi_grupu(uuid, uuid, timestamptz);
drop function private.uvoz_pripremi(uuid, text[], text[]);
drop function private.zahtijevaj_nastavnika(uuid);
