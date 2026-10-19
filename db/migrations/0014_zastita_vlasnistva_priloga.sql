-- migrate:up

-- O nastavnik smije povezati samo datoteku kojoj je vlasnik.
drop policy zadatak_prilog_pise on public.zadatak_prilog;

create policy zadatak_prilog_pise
    on public.zadatak_prilog
    for all
    to app_user
    using (
        exists (
            select 1
            from public.zadatak z
            where z.id = zadatak_prilog.zadatak_id
              and private.je_nastavnik(z.kolegij_id)
        )
    )
    with check (
        exists (
            select 1
            from public.zadatak z
            where z.id = zadatak_prilog.zadatak_id
              and private.je_nastavnik(z.kolegij_id)
        )
        and exists (
            select 1
            from public.datoteka d
            where d.id = zadatak_prilog.datoteka_id
              and d.vlasnik = private.trenutni_korisnik()
        )
    );


-- migrate:down

-- Vrati prethodnu definiciju politike.
drop policy zadatak_prilog_pise on public.zadatak_prilog;

create policy zadatak_prilog_pise
    on public.zadatak_prilog
    for all
    to app_user
    using (
        exists (
            select 1
            from public.zadatak z
            where z.id = zadatak_prilog.zadatak_id
              and private.je_nastavnik(z.kolegij_id)
        )
    )
    with check (
        exists (
            select 1
            from public.zadatak z
            where z.id = zadatak_prilog.zadatak_id
              and private.je_nastavnik(z.kolegij_id)
        )
    );