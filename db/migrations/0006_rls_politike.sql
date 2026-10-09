-- migrate:up
alter table korisnik         enable row level security;
alter table sesija           enable row level security;
alter table prijava_pokusaj  enable row level security;
alter table osoblje          enable row level security;
alter table kolegij          enable row level security;
alter table osoblje_kolegija enable row level security;
alter table grupa            enable row level security;
alter table asistent_grupa   enable row level security;
alter table student          enable row level security;
alter table upis             enable row level security;
alter table clanstvo_grupe   enable row level security;
alter table pravila_prolaza  enable row level security;
alter table uvoz             enable row level security;
alter table termin           enable row level security;
alter table dolazak          enable row level security;
alter table revizija         enable row level security;

-- app_auth: prijava i sesije
create policy korisnik_auth        on korisnik        for all to app_auth using (true) with check (true);
create policy sesija_auth          on sesija          for all to app_auth using (true) with check (true);
create policy prijava_pokusaj_auth on prijava_pokusaj for all to app_auth using (true) with check (true);

-- korisnik (app_user ima samo column grant bez lozinka_hash)
create policy korisnik_cita on korisnik for select to app_user
  using ((select private.vidi_korisnika(id)));

-- osoblje
create policy osoblje_cita on osoblje for select to app_user
  using (korisnik_id = (select private.trenutni_korisnik())
         or (select private.je_admin())
         or exists (select 1 from osoblje_kolegija ok
                    where ok.osoblje_id = osoblje.id
                      and (private.je_osoblje(ok.kolegij_id) or private.moj_kolegij(ok.kolegij_id))));
create policy osoblje_admin on osoblje for all to app_user
  using ((select private.je_admin())) with check ((select private.je_admin()));

-- kolegij
create policy kolegij_cita on kolegij for select to app_user
  using (private.je_osoblje(id) or private.moj_kolegij(id) or (select private.je_admin()));
create policy kolegij_dodaje on kolegij for insert to app_user
  with check ((select private.je_admin()));
create policy kolegij_mijenja on kolegij for update to app_user
  using (private.je_nastavnik(id) or (select private.je_admin()))
  with check (private.je_nastavnik(id) or (select private.je_admin()));
create policy kolegij_brise on kolegij for delete to app_user
  using ((select private.je_admin()));

-- osoblje_kolegija
create policy osoblje_kolegija_cita on osoblje_kolegija for select to app_user
  using (private.je_osoblje(kolegij_id) or private.moj_kolegij(kolegij_id) or (select private.je_admin()));
create policy osoblje_kolegija_pise on osoblje_kolegija for all to app_user
  using (private.je_nastavnik(kolegij_id) or (select private.je_admin()))
  with check (private.je_nastavnik(kolegij_id) or (select private.je_admin()));

-- grupa
create policy grupa_cita on grupa for select to app_user
  using (private.je_osoblje(kolegij_id) or private.moja_grupa(id));
create policy grupa_pise on grupa for all to app_user
  using (private.je_nastavnik(kolegij_id)) with check (private.je_nastavnik(kolegij_id));

-- asistent_grupa
create policy asistent_grupa_cita on asistent_grupa for select to app_user
  using (exists (select 1 from grupa g where g.id = grupa_id and private.je_osoblje(g.kolegij_id)));
create policy asistent_grupa_pise on asistent_grupa for all to app_user
  using (exists (select 1 from grupa g where g.id = grupa_id and private.je_nastavnik(g.kolegij_id)))
  with check (exists (select 1 from grupa g where g.id = grupa_id and private.je_nastavnik(g.kolegij_id)));

-- student: pisanje isključivo kroz security definer funkcije uvoza
create policy student_cita on student for select to app_user
  using (id = (select private.moj_student_id())
         or exists (select 1 from upis u where u.student_id = student.id
                    and private.vidi_studenta(u.kolegij_id, student.id)));

-- upis
create policy upis_cita on upis for select to app_user
  using (student_id = (select private.moj_student_id()) or private.vidi_studenta(kolegij_id, student_id));
create policy upis_mijenja on upis for update to app_user
  using (private.je_nastavnik(kolegij_id)) with check (private.je_nastavnik(kolegij_id));

-- clanstvo_grupe: pisanje kroz funkcije uvoza / promjene grupe
create policy clanstvo_grupe_cita on clanstvo_grupe for select to app_user
  using (exists (select 1 from upis u where u.id = upis_id
                 and (u.student_id = (select private.moj_student_id())
                      or private.vidi_studenta(u.kolegij_id, u.student_id))));

-- pravila_prolaza
create policy pravila_prolaza_cita on pravila_prolaza for select to app_user
  using (private.je_osoblje(kolegij_id) or private.moj_kolegij(kolegij_id));
create policy pravila_prolaza_mijenja on pravila_prolaza for update to app_user
  using (private.je_nastavnik(kolegij_id)) with check (private.je_nastavnik(kolegij_id));

-- uvoz
create policy uvoz_nastavnik on uvoz for all to app_user
  using (private.je_nastavnik(kolegij_id)) with check (private.je_nastavnik(kolegij_id));

-- termin
create policy termin_cita on termin for select to app_user
  using (private.vidi_grupu(grupa_id) or private.moja_grupa(grupa_id));
create policy termin_pise on termin for all to app_user
  using (private.vidi_grupu(grupa_id)) with check (private.vidi_grupu(grupa_id));

-- dolazak: student samo čita svoje; piše osoblje grupe termina
create policy dolazak_student_cita on dolazak for select to app_user
  using (student_id = (select private.moj_student_id()));
create policy dolazak_osoblje on dolazak for all to app_user
  using (exists (select 1 from termin t where t.id = termin_id and private.vidi_grupu(t.grupa_id)))
  with check (exists (select 1 from termin t where t.id = termin_id and private.vidi_grupu(t.grupa_id)));

-- revizija: bez politika za app_user (pristup samo kroz funkcije)

-- migrate:down
drop policy dolazak_osoblje on dolazak;
drop policy dolazak_student_cita on dolazak;
drop policy termin_pise on termin;
drop policy termin_cita on termin;
drop policy uvoz_nastavnik on uvoz;
drop policy pravila_prolaza_mijenja on pravila_prolaza;
drop policy pravila_prolaza_cita on pravila_prolaza;
drop policy clanstvo_grupe_cita on clanstvo_grupe;
drop policy upis_mijenja on upis;
drop policy upis_cita on upis;
drop policy student_cita on student;
drop policy asistent_grupa_pise on asistent_grupa;
drop policy asistent_grupa_cita on asistent_grupa;
drop policy grupa_pise on grupa;
drop policy grupa_cita on grupa;
drop policy osoblje_kolegija_pise on osoblje_kolegija;
drop policy osoblje_kolegija_cita on osoblje_kolegija;
drop policy kolegij_brise on kolegij;
drop policy kolegij_mijenja on kolegij;
drop policy kolegij_dodaje on kolegij;
drop policy kolegij_cita on kolegij;
drop policy osoblje_admin on osoblje;
drop policy osoblje_cita on osoblje;
drop policy korisnik_cita on korisnik;
drop policy prijava_pokusaj_auth on prijava_pokusaj;
drop policy sesija_auth on sesija;
drop policy korisnik_auth on korisnik;
