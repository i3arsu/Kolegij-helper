-- migrate:up

-- Vlasnik može čitati vlastitu datoteku i odmah dobiti ID
-- novog retka putem INSERT ... RETURNING.
drop policy datoteka_cita on public.datoteka;

create policy datoteka_cita
    on public.datoteka
    for select
    to app_user
    using (
        vlasnik = private.trenutni_korisnik()
        or private.vidi_datoteku(id)
    );

-- migrate:down

-- Vrati prethodnu politiku čitanja datoteka.
drop policy datoteka_cita on public.datoteka;

create policy datoteka_cita
    on public.datoteka
    for select
    to app_user
    using (private.vidi_datoteku(id));