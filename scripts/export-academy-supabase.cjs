const fs = require("node:fs");
const path = require("node:path");
const { sessions } = require("./academy-level1-curriculum.cjs");

const legacy = fs.readFileSync(path.join(__dirname, "academy-ogc-level1-supabase.sql"), "utf8");
const boundary = legacy.indexOf("insert into academy_courses (slug, code, title, summary");
if (boundary < 0) throw new Error("Cannot find Academy schema boundary");
const schema = legacy.slice(legacy.indexOf("begin;"), boundary);
const payload = sessions.map((session, position) => ({
  position, slug: session.slug, title: session.title, minutes: session.minutes,
  kind: position === sessions.length - 1 ? "assessment" : "quiz",
  content: session.content,
  questions: session.questions.map(([prompt, correct, incorrect], questionPosition) => ({
    position: questionPosition, prompt, correct, incorrect
  }))
}));
const payloadJson = JSON.stringify(payload);
if (payloadJson.includes("$jdl_payload$")) throw new Error("Unexpected SQL delimiter in curriculum");
const minutes = sessions.reduce((sum, session) => sum + session.minutes, 0);

const sql = `-- JDL Core Academy Level 1: full client-review curriculum.
-- Paste this entire file into the Supabase SQL Editor for the TEST project.
-- It creates missing Academy tables, updates this course in place, and leaves
-- learner progress, quiz attempts, enrolments and certificates intact.
-- Exercise tanks, vessels, table outputs and correction factors are fictional.
${schema}
do $jdl_course$
declare
  v_course_id integer;
  v_module_id integer;
  v_lesson_id integer;
  v_question_id integer;
  v_option_id integer;
  v_session jsonb;
  v_question jsonb;
  v_position integer;
  v_question_position integer;
begin
  insert into academy_courses
    (slug, code, title, summary, level, status, accent, pass_percent, estimated_minutes, published_at)
  values
    ('ogc-level-1', 'JDL-OGC01', 'Oil, Gas & Chemicals Inspection — Level 1',
     'Twelve JDL-authored client-review sessions covering safety, sampling, measurement, chemical inspection and quantity reporting.',
     'Foundation', 'published', '#eeb02b', 80, ${minutes}, now())
  on conflict (slug) do update set
    code = excluded.code, title = excluded.title, summary = excluded.summary,
    level = excluded.level, status = excluded.status, accent = excluded.accent,
    pass_percent = excluded.pass_percent, estimated_minutes = excluded.estimated_minutes,
    updated_at = now()
  returning id into v_course_id;

  for v_session in
    select value from jsonb_array_elements($jdl_payload$${payloadJson}$jdl_payload$::jsonb)
  loop
    v_position := (v_session->>'position')::integer;
    insert into academy_modules (course_id, title, description, position)
    values (v_course_id, 'Session ' || (v_position + 1), v_session->>'title', v_position)
    on conflict (course_id, position) do update set
      title = excluded.title, description = excluded.description
    returning id into v_module_id;

    insert into academy_lessons
      (module_id, slug, title, kind, content, duration_minutes, position, published)
    values
      (v_module_id, v_session->>'slug', v_session->>'title', v_session->>'kind',
       v_session->>'content', (v_session->>'minutes')::integer, 0, true)
    on conflict (module_id, slug) do update set
      title = excluded.title, kind = excluded.kind, content = excluded.content,
      duration_minutes = excluded.duration_minutes, position = 0, published = true
    returning id into v_lesson_id;

    for v_question in
      select value from jsonb_array_elements(v_session->'questions')
    loop
      v_question_position := (v_question->>'position')::integer;
      select id into v_question_id from academy_quiz_questions
      where lesson_id = v_lesson_id and position = v_question_position
      order by id limit 1;
      if v_question_id is null then
        insert into academy_quiz_questions (lesson_id, prompt, explanation, position)
        values (v_lesson_id, v_question->>'prompt', v_question->>'correct', v_question_position)
        returning id into v_question_id;
      else
        update academy_quiz_questions set
          prompt = v_question->>'prompt', explanation = v_question->>'correct'
        where id = v_question_id;
      end if;

      select id into v_option_id from academy_quiz_options
      where question_id = v_question_id and position = 0 order by id limit 1;
      if v_option_id is null then
        insert into academy_quiz_options (question_id, label, correct, position)
        values (v_question_id, v_question->>'correct', true, 0);
      else
        update academy_quiz_options set label = v_question->>'correct', correct = true
        where id = v_option_id;
      end if;

      select id into v_option_id from academy_quiz_options
      where question_id = v_question_id and position = 1 order by id limit 1;
      if v_option_id is null then
        insert into academy_quiz_options (question_id, label, correct, position)
        values (v_question_id, v_question->>'incorrect', false, 1);
      else
        update academy_quiz_options set label = v_question->>'incorrect', correct = false
        where id = v_option_id;
      end if;
      v_question_id := null;
      v_option_id := null;
    end loop;
  end loop;
end;
$jdl_course$;

commit;

-- Verification: expect 12 sessions and 60 questions for this course.
select count(distinct m.id) as sessions, count(distinct l.id) as lessons,
       count(distinct q.id) as questions
from academy_courses c
join academy_modules m on m.course_id = c.id
join academy_lessons l on l.module_id = m.id
left join academy_quiz_questions q on q.lesson_id = l.id
where c.slug = 'ogc-level-1';
`;
const output = path.join(__dirname, "academy-ogc-level1-client-review-supabase.sql");
fs.writeFileSync(output, sql, "utf8");
console.log(output);
