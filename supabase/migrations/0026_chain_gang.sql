-- Chain Gang Dynasty: a 4-player co-op on the Great Wall, played over a
-- room code. Its finished runs save like the other arcade games', and the
-- room is a private Realtime channel "chaingang:<CODE>" (presence for the
-- lobby, broadcast for inputs and snapshots) — only signed-in travellers
-- may join or send on it, like the chat's typing channels.

alter table public.game_scores drop constraint if exists game_scores_game_check;
alter table public.game_scores add constraint game_scores_game_check
  check (game in ('godzilla_rampage', 'shinkansen_dash', 'chain_gang'));

-- (one policy per action, extended — a second permissive policy would be checked on every message)
alter policy "chat_typing_read" on realtime.messages
  using ((select private.can_use_chat_topic((select realtime.topic()))) or (select realtime.topic()) like 'chaingang:%');
alter policy "chat_typing_write" on realtime.messages
  with check ((select private.can_use_chat_topic((select realtime.topic()))) or (select realtime.topic()) like 'chaingang:%');
