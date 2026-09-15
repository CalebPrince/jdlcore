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
