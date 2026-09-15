require("dotenv").config();
const postgres = require("postgres");
const { sessions } = require("./academy-level1-curriculum.cjs");

const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before seeding the Academy.");
const sql = postgres(url, { prepare: false, connect_timeout: 8 });

const modules = sessions.map(({ slug, title, content, minutes, questions }, index) => ({
  title: `Session ${index + 1}`,
  description: title,
  lessons: [{ slug, title, kind: index === sessions.length - 1 ? "assessment" : "quiz", minutes, content, questions }],
}));

async function run() {
  await sql.begin(async (tx) => {
  const [course] = await tx`
    insert into academy_courses (slug, code, title, summary, level, status, accent, pass_percent, estimated_minutes, published_at)
    values ('ogc-level-1', 'JDL-OGC01', 'Oil, Gas & Chemicals Inspection — Level 1', 'Twelve JDL-authored sessions covering safety, sampling, tank and pipeline measurement, chemical inspection, and quantity reporting.', 'Foundation', 'published', '#eeb02b', 80, ${sessions.reduce((sum, session) => sum + session.minutes, 0)}, now())
    on conflict (slug) do update set code = excluded.code, title = excluded.title, summary = excluded.summary, estimated_minutes = excluded.estimated_minutes, pass_percent = 80, status = 'published', updated_at = now()
    returning id
  `;
  // Update in place so lesson IDs, attempts, progress and certificates survive.
  for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex++) {
    const module = modules[moduleIndex];
    const moduleId = (await tx`insert into academy_modules (course_id, title, description, position) values (${course.id}, ${module.title}, ${module.description}, ${moduleIndex}) on conflict (course_id, position) do update set title = excluded.title, description = excluded.description returning id`)[0].id;
    for (let lessonIndex = 0; lessonIndex < module.lessons.length; lessonIndex++) {
      const lesson = module.lessons[lessonIndex];
      const lessonId = (await tx`insert into academy_lessons (module_id, slug, title, kind, content, duration_minutes, position, published) values (${moduleId}, ${lesson.slug}, ${lesson.title}, ${lesson.kind}, ${lesson.content}, ${lesson.minutes}, ${lessonIndex}, true) on conflict (module_id, slug) do update set title = excluded.title, kind = excluded.kind, content = excluded.content, duration_minutes = excluded.duration_minutes, published = true returning id`)[0].id;
      const existingQuestions = await tx`select id, position from academy_quiz_questions where lesson_id = ${lessonId} order by position`;
      const questions = lesson.questions;
      for (let questionIndex = 0; questionIndex < questions.length; questionIndex++) {
        const [prompt, correct, incorrect] = questions[questionIndex];
        const previous = existingQuestions.find((item) => item.position === questionIndex);
        const [created] = previous
          ? await tx`update academy_quiz_questions set prompt = ${prompt}, explanation = ${correct} where id = ${previous.id} returning id`
          : await tx`insert into academy_quiz_questions (lesson_id, prompt, explanation, position) values (${lessonId}, ${prompt}, ${correct}, ${questionIndex}) returning id`;
        const existingOptions = await tx`select id, position from academy_quiz_options where question_id = ${created.id}`;
        const first = existingOptions.find((item) => item.position === 0);
        const second = existingOptions.find((item) => item.position === 1);
        if (first) await tx`update academy_quiz_options set label = ${correct}, correct = true where id = ${first.id}`;
        else await tx`insert into academy_quiz_options (question_id, label, correct, position) values (${created.id}, ${correct}, true, 0)`;
        if (second) await tx`update academy_quiz_options set label = ${incorrect}, correct = false where id = ${second.id}`;
        else await tx`insert into academy_quiz_options (question_id, label, correct, position) values (${created.id}, ${incorrect}, false, 1)`;
      }
    }
  }
  });
  console.log("Academy seed complete: 12 sequential Level 1 sessions");
  await sql.end();
}

run().catch(async (error) => { console.error(error); await sql.end(); process.exit(1); });
