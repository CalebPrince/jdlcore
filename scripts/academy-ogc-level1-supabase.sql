begin;

create table if not exists academy_learners (
  id serial primary key,
  name text not null,
  email text not null unique,
  company text,
  role text not null default 'Learner',
  password_hash text not null,
  status text not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists academy_courses (
  id serial primary key,
  slug text not null unique,
  code text not null unique,
  title text not null,
  summary text not null,
  level text not null default 'Foundation',
  status text not null default 'draft',
  accent text not null default '#eeb02b',
  pass_percent integer not null default 80,
  estimated_minutes integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table academy_learners add column if not exists subscription_plan text;
alter table academy_learners add column if not exists subscription_status text not null default 'none';
alter table academy_learners add column if not exists current_period_end timestamptz;
alter table academy_learners add column if not exists paystack_customer_code text;
alter table academy_learners add column if not exists paystack_subscription_code text;
alter table academy_learners add column if not exists paystack_plan_code text;

create table if not exists academy_modules (
  id serial primary key,
  course_id integer not null references academy_courses(id) on delete cascade,
  title text not null,
  description text,
  position integer not null default 0
);

create table if not exists academy_lessons (
  id serial primary key,
  module_id integer not null references academy_modules(id) on delete cascade,
  slug text not null,
  title text not null,
  kind text not null default 'reading',
  content text,
  video_url text,
  resource_url text,
  duration_minutes integer not null default 0,
  position integer not null default 0,
  published boolean not null default false
);

create table if not exists academy_lesson_progress (
  id serial primary key,
  learner_id integer not null references academy_learners(id) on delete cascade,
  lesson_id integer not null references academy_lessons(id) on delete cascade,
  completed boolean not null default false,
  last_position_seconds integer not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists academy_quiz_questions (
  id serial primary key,
  lesson_id integer not null references academy_lessons(id) on delete cascade,
  prompt text not null,
  explanation text,
  position integer not null default 0
);

create table if not exists academy_quiz_options (
  id serial primary key,
  question_id integer not null references academy_quiz_questions(id) on delete cascade,
  label text not null,
  correct boolean not null default false,
  position integer not null default 0
);

create table if not exists academy_quiz_attempts (
  id serial primary key,
  learner_id integer not null references academy_learners(id) on delete cascade,
  lesson_id integer not null references academy_lessons(id) on delete cascade,
  answers jsonb,
  score_percent integer not null,
  passed boolean not null default false,
  submitted_at timestamptz not null default now()
);

create table if not exists academy_enrollments (
  id serial primary key,
  learner_id integer not null references academy_learners(id) on delete cascade,
  course_id integer not null references academy_courses(id) on delete cascade,
  status text not null default 'active',
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists academy_certificates (
  id serial primary key,
  learner_id integer not null references academy_learners(id) on delete cascade,
  course_id integer not null references academy_courses(id) on delete cascade,
  certificate_number text not null unique,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists academy_modules_course_position_uidx on academy_modules(course_id, position);
create unique index if not exists academy_lessons_module_slug_uidx on academy_lessons(module_id, slug);
create unique index if not exists academy_progress_learner_lesson_uidx on academy_lesson_progress(learner_id, lesson_id);
create unique index if not exists academy_enrollments_learner_course_uidx on academy_enrollments(learner_id, course_id);
create unique index if not exists academy_certificates_learner_course_uidx on academy_certificates(learner_id, course_id);

insert into academy_courses (slug, code, title, summary, level, status, accent, pass_percent, estimated_minutes, published_at)
values (
  'ogc-level-1',
  'JDL-OGC01',
  'Oil, Gas & Chemicals Inspection — Level 1',
  'Twelve sequential tutorial and assessment sessions covering safe, traceable petroleum and chemical inspection practice.',
  'Foundation',
  'published',
  '#eeb02b',
  80,
  272,
  now()
)
on conflict (slug) do update set
  code = excluded.code,
  title = excluded.title,
  summary = excluded.summary,
  level = excluded.level,
  status = excluded.status,
  accent = excluded.accent,
  pass_percent = 80,
  estimated_minutes = excluded.estimated_minutes,
  published_at = coalesce(academy_courses.published_at, now()),
  updated_at = now();

create temporary table academy_session_seed (
  position integer,
  slug text,
  title text,
  content text,
  answers boolean[]
) on commit drop;

insert into academy_session_seed values
  (0, 'inspection-foundations', 'Inspection foundations', 'Understand independent inspection, custody transfer, impartiality, and the inspector''s reporting duty.', array[true,true,false,true,false]),
  (1, 'safety-and-sds', 'Safety and Safety Data Sheets', 'Review job hazards and the current Safety Data Sheet before exposure. Stop and reassess whenever actual conditions differ from the agreed plan.', array[true,false,true,true,false]),
  (2, 'ppe-and-respiratory-protection', 'PPE and respiratory protection', 'Select, inspect, fit, and use protection for the identified product, concentration, exposure route, and task.', array[true,false,true,false,true]),
  (3, 'representative-sampling', 'Representative sampling', 'Choose the correct all-levels, running, spot, composite, tap, pipeline, or vapour-pressure sampling method for the requested test.', array[true,true,false,true,false]),
  (4, 'sample-custody', 'Sample handling and custody', 'Prevent contamination and evaporation, label and seal promptly, and maintain traceable custody through transport and handover.', array[true,false,true,true,false]),
  (5, 'shore-tank-gauging', 'Shore-tank gauging', 'Verify the datum, reference gauge point, reference height, equipment condition, and approved calibration table before measuring innage or outage.', array[true,true,false,false,true]),
  (6, 'marine-tank-gauging', 'Marine-tank gauging', 'Measure vessel tanks consistently and apply approved trim, list, free-water, OBQ, and ROB procedures where required.', array[true,false,true,false,true]),
  (7, 'temperature-determination', 'Temperature determination', 'Verify the instrument, observe immersion time, use representative depths, and record each reading with its time and location.', array[true,true,false,true,false]),
  (8, 'pipeline-fullness', 'Pipeline fullness', 'Agree and document a suitable verification method so changes in line condition do not appear as false cargo gains or losses.', array[true,false,true,false,true]),
  (9, 'quantity-calculations', 'Quantity calculations', 'Trace the sequence from observed gauge and total observed volume through free water, corrections, standard volume, and apparent mass.', array[true,true,false,true,false]),
  (10, 'chemical-and-wall-wash', 'Chemical cargo and wall-wash inspection', 'Apply cargo-specific cleanliness, compatibility, sampling, safety, and test controls without exceeding your authorisation or competence.', array[true,false,true,true,false]),
  (11, 'level-one-assessment', 'Level 1 final assessment', 'Apply the complete safety, sampling, measurement, calculation, and reporting workflow to integrated inspection scenarios.', array[true,true,false,true,false]);

insert into academy_modules (course_id, title, description, position)
select c.id, 'Session ' || (s.position + 1), s.title, s.position
from academy_session_seed s
cross join academy_courses c
where c.slug = 'ogc-level-1'
on conflict (course_id, position) do update set
  title = excluded.title,
  description = excluded.description;

insert into academy_lessons (module_id, slug, title, kind, content, duration_minutes, position, published)
select m.id, s.slug, s.title,
  case when s.position = 11 then 'assessment' else 'quiz' end,
  s.content,
  case when s.position = 11 then 30 else 22 end,
  0,
  true
from academy_session_seed s
join academy_courses c on c.slug = 'ogc-level-1'
join academy_modules m on m.course_id = c.id and m.position = s.position
on conflict (module_id, slug) do update set
  title = excluded.title,
  kind = excluded.kind,
  content = excluded.content,
  duration_minutes = excluded.duration_minutes,
  position = excluded.position,
  published = excluded.published;

with question_templates(position, prompt) as (
  values
    (0, 'The session procedure should be followed and documented.'),
    (1, 'A plausible result removes the need for traceable records.'),
    (2, 'Unsafe or unexplained conditions must be reported before continuing.'),
    (3, 'Approved methods and verified equipment protect result quality.'),
    (4, 'An inspector may silently change an observation to match expectations.')
)
insert into academy_quiz_questions (lesson_id, prompt, explanation, position)
select l.id, q.prompt,
  case when s.answers[q.position + 1]
    then 'Correct. This supports safe, traceable inspection practice.'
    else 'Incorrect. This conflicts with safe, traceable inspection practice.'
  end,
  q.position
from academy_session_seed s
join academy_courses c on c.slug = 'ogc-level-1'
join academy_modules m on m.course_id = c.id and m.position = s.position
join academy_lessons l on l.module_id = m.id and l.slug = s.slug
cross join question_templates q
where not exists (
  select 1 from academy_quiz_questions existing
  where existing.lesson_id = l.id and existing.position = q.position
);

insert into academy_quiz_options (question_id, label, correct, position)
select q.id, option_row.label,
  case when option_row.label = 'True' then s.answers[q.position + 1] else not s.answers[q.position + 1] end,
  option_row.position
from academy_session_seed s
join academy_courses c on c.slug = 'ogc-level-1'
join academy_modules m on m.course_id = c.id and m.position = s.position
join academy_lessons l on l.module_id = m.id and l.slug = s.slug
join academy_quiz_questions q on q.lesson_id = l.id
cross join (values ('True', 0), ('False', 1)) as option_row(label, position)
where not exists (
  select 1 from academy_quiz_options existing
  where existing.question_id = q.id and existing.position = option_row.position
);

commit;
