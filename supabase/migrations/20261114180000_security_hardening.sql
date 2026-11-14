-- WRLDLINE NEWS security hardening: bounded public form inputs.
-- Keep these checks in the database so alternate clients cannot bypass them.
alter table public.contact_messages drop constraint if exists contact_messages_name_length_check;
alter table public.contact_messages add constraint contact_messages_name_length_check check (char_length(name) between 1 and 120);
alter table public.contact_messages drop constraint if exists contact_messages_email_length_check;
alter table public.contact_messages add constraint contact_messages_email_length_check check (char_length(email) between 3 and 254);
alter table public.contact_messages drop constraint if exists contact_messages_message_length_check;
alter table public.contact_messages add constraint contact_messages_message_length_check check (char_length(message) between 10 and 5000);
alter table public.newsletter_subscribers drop constraint if exists newsletter_subscribers_email_length_check;
alter table public.newsletter_subscribers add constraint newsletter_subscribers_email_length_check check (char_length(email) between 3 and 254);
alter table public.newsletter_subscribers drop constraint if exists newsletter_subscribers_source_length_check;
alter table public.newsletter_subscribers add constraint newsletter_subscribers_source_length_check check (char_length(source) between 1 and 80);
