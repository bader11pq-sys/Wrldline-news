begin;

alter table public.ai_provider_cooldowns
  drop constraint if exists ai_provider_cooldowns_provider_check;

alter table public.ai_provider_cooldowns
  add constraint ai_provider_cooldowns_provider_check
  check (provider = any (array[
    'gemini'::text,
    'groq'::text,
    'nvidia'::text,
    'gonka'::text,
    'openrouter'::text,
    'bazaarlink'::text
  ]));

commit;
