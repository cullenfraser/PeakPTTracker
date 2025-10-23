-- Coaching cues reference table
begin;

create extension if not exists pgcrypto;

create table if not exists coaching_cues (
  id uuid primary key default gen_random_uuid(),
  pattern text not null,
  kpi_key text not null,
  variation text,
  status text not null check (status in ('ok', 'warn', 'fail')),
  cue text not null,
  tags text[] not null default '{}',
  priority int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists coaching_cues_pattern_kpi_idx
  on coaching_cues (pattern, kpi_key, status, priority);

create index if not exists coaching_cues_active_idx
  on coaching_cues (active)
  where active;

insert into coaching_cues (pattern, kpi_key, status, cue, tags, priority) values
  -- Squat pattern
  ('squat', 'depth', 'ok', 'Keep sinking to full depth while staying braced.', ARRAY['depth','squat'], 0),
  ('squat', 'depth', 'warn', 'Own the bottom by pausing for a heartbeat, then drive tall.', ARRAY['depth','squat'], 0),
  ('squat', 'depth', 'fail', 'Work box squats at target depth to groove consistent positions.', ARRAY['depth','squat'], 0),
  ('squat', 'knee_valgus', 'warn', 'Screw feet into the floor and spread the ground apart.', ARRAY['valgus','stance'], 0),
  ('squat', 'knee_valgus', 'fail', 'Run tempo squats with bands pulling knees inward to train tracking.', ARRAY['valgus','stance'], 0),
  ('squat', 'trunk_flex', 'warn', 'Lock ribs down before the descent and stay tall through the drive.', ARRAY['torso','brace'], 0),
  ('squat', 'trunk_flex', 'fail', 'Set a hard brace, then slow the first half to keep torso stacked.', ARRAY['torso','brace'], 0),
  ('squat', 'tempo', 'warn', 'Set a cadence: three count down, one count up every rep.', ARRAY['tempo','control'], 0),
  ('squat', 'tempo', 'fail', 'Run metronome tempo squats to smooth out rhythm and control.', ARRAY['tempo','control'], 0),

  -- Hinge pattern
  ('hinge', 'hip_hinge_ratio', 'warn', 'Sit hips further back and keep shins vertical to own the hinge.', ARRAY['hinge','hip'], 0),
  ('hinge', 'hip_hinge_ratio', 'fail', 'Drill hip wall taps to reinforce loading the posterior chain.', ARRAY['hinge','hip'], 0),
  ('hinge', 'lumbar_control', 'warn', 'Brace ribs down and lock lats before hinging back.', ARRAY['hinge','brace'], 0),
  ('hinge', 'lumbar_control', 'fail', 'Reset with RDL isometrics against pins to keep lumbar tight.', ARRAY['hinge','brace'], 0),
  ('hinge', 'bar_path_drift', 'warn', 'Drag the bar up the legs—think zipper path the whole time.', ARRAY['hinge','bar_path'], 0),
  ('hinge', 'bar_path_drift', 'fail', 'Use paused RDLs hugging the shins to retrain bar proximity.', ARRAY['hinge','bar_path'], 0),

  -- Push pattern
  ('push', 'lockout_depth', 'warn', 'Finish every rep with elbows locked and knuckles to the ceiling.', ARRAY['push','lockout'], 0),
  ('push', 'lockout_depth', 'fail', 'Add tempo holds at lockout to build full elbow extension.', ARRAY['push','lockout'], 0),
  ('push', 'elbow_path', 'warn', 'Track elbows 45° from torso; think arrow, not T-shape.', ARRAY['push','elbow'], 0),
  ('push', 'elbow_path', 'fail', 'Use board presses with tucked elbows to groove the path.', ARRAY['push','elbow'], 0),
  ('push', 'trunk_line', 'warn', 'Crush the bench with upper back and keep ribs stacked under bar.', ARRAY['push','brace'], 0),
  ('push', 'trunk_line', 'fail', 'Run tempo push-ups focusing on ribs-down plank alignment.', ARRAY['push','brace'], 0),

  -- Pull pattern
  ('pull', 'scap_timing', 'warn', 'Lead each pull by setting the scaps before driving elbows.', ARRAY['pull','scap'], 0),
  ('pull', 'scap_timing', 'fail', 'Perform scap pull-aparts and holds to teach clean sequencing.', ARRAY['pull','scap'], 0),
  ('pull', 'elbow_path', 'warn', 'Aim elbows to the back pockets instead of flaring out.', ARRAY['pull','elbow'], 0),
  ('pull', 'elbow_path', 'fail', 'Add chest-supported rows focusing on elbows tracing the ribs.', ARRAY['pull','elbow'], 0),
  ('pull', 'torso_sway', 'warn', 'Brace abs and pin hips; move only through the shoulders.', ARRAY['pull','torso'], 0),
  ('pull', 'torso_sway', 'fail', 'Use 2-count eccentrics with chest support to eliminate sway.', ARRAY['pull','torso'], 0),

  -- Lunge pattern
  ('lunge', 'front_knee_track', 'warn', 'Keep knee stacked over mid-foot; think “knee over second toe”.', ARRAY['lunge','valgus'], 0),
  ('lunge', 'front_knee_track', 'fail', 'Add split squat ISO holds driving knee over middle toes.', ARRAY['lunge','valgus'], 0),
  ('lunge', 'trail_hip_control', 'warn', 'Squeeze glute of the trail leg to steady pelvis.', ARRAY['lunge','hip'], 0),
  ('lunge', 'trail_hip_control', 'fail', 'Perform split squats with dowel feedback on hip alignment.', ARRAY['lunge','hip'], 0),
  ('lunge', 'pelvic_stability', 'warn', 'Keep belt buckle level; think “zipper to sternum”.', ARRAY['lunge','pelvis'], 0),
  ('lunge', 'pelvic_stability', 'fail', 'Use tempo lunges with mirror feedback to keep hips level.', ARRAY['lunge','pelvis'], 0),

  -- Carry pattern
  ('carry', 'torso_stack', 'warn', 'Stack ribs over hips and grip the floor with each step.', ARRAY['carry','torso'], 0),
  ('carry', 'torso_stack', 'fail', 'Hit suitcase carries with offset load to train full stack.', ARRAY['carry','torso'], 0),
  ('carry', 'grip_integrity', 'warn', 'Crush the handle and keep wrist neutral each stride.', ARRAY['carry','grip'], 0),
  ('carry', 'grip_integrity', 'fail', 'Add heavy static holds to build grip and wrist control.', ARRAY['carry','grip'], 0),
  ('carry', 'path_sway', 'warn', 'Walk a straight line; think “railroad tracks” with your feet.', ARRAY['carry','path'], 0),
  ('carry', 'path_sway', 'fail', 'Load suitcase carries in a hallway to limit sway.', ARRAY['carry','path'], 0),

  -- Core pattern
  ('core', 'plank_alignment', 'warn', 'Press the floor away and lengthen from heel to crown.', ARRAY['core','plank'], 0),
  ('core', 'plank_alignment', 'fail', 'Run RKC planks focusing on full-body tension.', ARRAY['core','plank'], 0),
  ('core', 'hip_drift', 'warn', 'Pin hips over shoulders; squeeze glutes while breathing low.', ARRAY['core','hip'], 0),
  ('core', 'hip_drift', 'fail', 'Add dead bug variations to keep hips centered.', ARRAY['core','hip'], 0),
  ('core', 'breathing_cadence', 'warn', 'Match slow exhales with braced ribs before resetting.', ARRAY['core','breathing'], 0),
  ('core', 'breathing_cadence', 'fail', 'Use crocodile breathing drills to rebuild cadence under load.', ARRAY['core','breathing'], 0);

commit;
