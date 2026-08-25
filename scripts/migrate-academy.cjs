require("dotenv").config();
const postgres = require("postgres");

const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before running the Academy migration.");
const sql = postgres(url, { prepare: false, max: 1 });

async function run() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
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
      create index if not exists academy_learners_email_idx on academy_learners(email);
      create index if not exists academy_learners_status_idx on academy_learners(status);

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
      create index if not exists academy_courses_status_idx on academy_courses(status);

      create table if not exists academy_modules (
        id serial primary key,
        course_id integer not null references academy_courses(id) on delete cascade,
        title text not null,
        description text,
        position integer not null default 0
      );
      create index if not exists academy_modules_course_idx on academy_modules(course_id);
      create unique index if not exists academy_modules_course_position_uidx on academy_modules(course_id, position);

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
      create index if not exists academy_lessons_module_idx on academy_lessons(module_id);
      create unique index if not exists academy_lessons_module_slug_uidx on academy_lessons(module_id, slug);

      create table if not exists academy_enrollments (
        id serial primary key,
        learner_id integer not null references academy_learners(id) on delete cascade,
        course_id integer not null references academy_courses(id) on delete cascade,
        status text not null default 'active',
        enrolled_at timestamptz not null default now(),
        completed_at timestamptz
      );
      create index if not exists academy_enrollments_learner_idx on academy_enrollments(learner_id);
      create index if not exists academy_enrollments_course_idx on academy_enrollments(course_id);
      create unique index if not exists academy_enrollments_learner_course_uidx on academy_enrollments(learner_id, course_id);

      create table if not exists academy_lesson_progress (
        id serial primary key,
        learner_id integer not null references academy_learners(id) on delete cascade,
        lesson_id integer not null references academy_lessons(id) on delete cascade,
        completed boolean not null default false,
        last_position_seconds integer not null default 0,
        completed_at timestamptz,
        updated_at timestamptz not null default now()
      );
      create index if not exists academy_progress_learner_idx on academy_lesson_progress(learner_id);
      create index if not exists academy_progress_lesson_idx on academy_lesson_progress(lesson_id);
      create unique index if not exists academy_progress_learner_lesson_uidx on academy_lesson_progress(learner_id, lesson_id);

      create table if not exists academy_quiz_attempts (
        id serial primary key,
        learner_id integer not null references academy_learners(id) on delete cascade,
        lesson_id integer not null references academy_lessons(id) on delete cascade,
        answers jsonb,
        score_percent integer not null,
        passed boolean not null default false,
        submitted_at timestamptz not null default now()
      );
      create index if not exists academy_attempts_learner_idx on academy_quiz_attempts(learner_id);

      create table if not exists academy_quiz_questions (
        id serial primary key,
        lesson_id integer not null references academy_lessons(id) on delete cascade,
        prompt text not null,
        explanation text,
        position integer not null default 0
      );
      create index if not exists academy_questions_lesson_idx on academy_quiz_questions(lesson_id);

      create table if not exists academy_quiz_options (
        id serial primary key,
        question_id integer not null references academy_quiz_questions(id) on delete cascade,
        label text not null,
        correct boolean not null default false,
        position integer not null default 0
      );
      create index if not exists academy_options_question_idx on academy_quiz_options(question_id);

      create table if not exists academy_certificates (
        id serial primary key,
        learner_id integer not null references academy_learners(id) on delete cascade,
        course_id integer not null references academy_courses(id) on delete cascade,
        certificate_number text not null unique,
        issued_at timestamptz not null default now(),
        revoked_at timestamptz
      );
      create index if not exists academy_certificates_learner_idx on academy_certificates(learner_id);
      create unique index if not exists academy_certificates_learner_course_uidx on academy_certificates(learner_id, course_id);
    `);
  });
  console.log("Academy migration complete: LMS tables and supporting indexes are ready.");
  await sql.end();
}

run().catch(async (error) => {
  console.error("Academy migration failed:", error.message || error);
  await sql.end();
  process.exit(1);
});
