-- MIGRATE_CONTRACT_SESSION_TYPES.sql
--
-- Updates historic training_sessions created via contract scheduling.
-- Any session tied to a contract will be labelled "1 on 1" when exactly
-- one participant was assigned, otherwise "Small Group".
--
-- This script is idempotent; re-running preserves the same values.

update training_sessions ts
set session_type = case
  when coalesce(array_length(ts.participant_ids, 1), 0) > 1 then 'small_group'
  else '1_on_1'
end
where ts.contract_id is not null
  and ts.session_type in ('contract', '1_on_1', 'small_group');

-- Optionally review the impact:
-- select session_type, count(*) from training_sessions
-- where contract_id is not null
-- group by session_type
-- order by session_type;
