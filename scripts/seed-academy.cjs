require("dotenv").config();
const postgres = require("postgres");

const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before seeding the Academy.");
const sql = postgres(url, { prepare: false });

const sessions = [
  ["inspection-foundations", "Inspection foundations", "Understand independent inspection, custody transfer, impartiality, and the inspector's reporting duty.", [true, true, false, true, false]],
  ["safety-and-sds", "Safety and Safety Data Sheets", "Review job hazards and the current Safety Data Sheet before exposure. Stop and reassess whenever actual conditions differ from the agreed plan.", [true, false, true, true, false]],
  ["ppe-and-respiratory-protection", "PPE and respiratory protection", "Select, inspect, fit, and use protection for the identified product, concentration, exposure route, and task.", [true, false, true, false, true]],
  ["representative-sampling", "Representative sampling", "Choose the correct all-levels, running, spot, composite, tap, pipeline, or vapour-pressure sampling method for the requested test.", [true, true, false, true, false]],
  ["sample-custody", "Sample handling and custody", "Prevent contamination and evaporation, label and seal promptly, and maintain traceable custody through transport and handover.", [true, false, true, true, false]],
  ["shore-tank-gauging", "Shore-tank gauging", "Verify the datum, reference gauge point, reference height, equipment condition, and approved calibration table before measuring innage or outage.", [true, true, false, false, true]],
  ["marine-tank-gauging", "Marine-tank gauging", "Measure vessel tanks consistently and apply approved trim, list, free-water, OBQ, and ROB procedures where required.", [true, false, true, false, true]],
  ["temperature-determination", "Temperature determination", "Verify the instrument, observe immersion time, use representative depths, and record each reading with its time and location.", [true, true, false, true, false]],
  ["pipeline-fullness", "Pipeline fullness", "Agree and document a suitable verification method so changes in line condition do not appear as false cargo gains or losses.", [true, false, true, false, true]],
  ["quantity-calculations", "Quantity calculations", "Trace the sequence from observed gauge and total observed volume through free water, corrections, standard volume, and apparent mass.", [true, true, false, true, false]],
  ["chemical-and-wall-wash", "Chemical cargo and wall-wash inspection", "Apply cargo-specific cleanliness, compatibility, sampling, safety, and test controls without exceeding your authorisation or competence.", [true, false, true, true, false]],
  ["level-one-assessment", "Level 1 final assessment", "Apply the complete safety, sampling, measurement, calculation, and reporting workflow to integrated inspection scenarios.", [true, true, false, true, false]],
];

const statementSets = [
  "The session procedure should be followed and documented.",
  "A plausible result removes the need for traceable records.",
  "Unsafe or unexplained conditions must be reported before continuing.",
  "Approved methods and verified equipment protect result quality.",
  "An inspector may silently change an observation to match expectations.",
];

const modules = sessions.map(([slug, title, content, answers], index) => ({
  title: `Session ${index + 1}`,
  description: title,
  lessons: [{ slug, title, kind: index === sessions.length - 1 ? "assessment" : "quiz", minutes: index === sessions.length - 1 ? 30 : 22, content, questions: statementSets.map((prompt, questionIndex) => ({ prompt, correct: answers[questionIndex] })) }],
}));

async function run() {
  const [course] = await sql`
    insert into academy_courses (slug, code, title, summary, level, status, accent, pass_percent, estimated_minutes, published_at)
    values ('ogc-level-1', 'JDL-OGC01', 'Oil, Gas & Chemicals Inspection — Level 1', 'Twelve sequential tutorial and assessment sessions covering safe, traceable petroleum and chemical inspection practice.', 'Foundation', 'published', '#eeb02b', 80, 272, now())
    on conflict (slug) do update set code = excluded.code, title = excluded.title, summary = excluded.summary, estimated_minutes = excluded.estimated_minutes, pass_percent = 80, status = 'published', updated_at = now()
    returning id
  `;
  // Refresh only this programme. Existing Academy courses and their lessons are
  // intentionally left untouched until their owners approve any removal.
  await sql`delete from academy_modules where course_id = ${course.id}`;
  for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex++) {
    const module = modules[moduleIndex];
    const moduleId = (await sql`insert into academy_modules (course_id, title, description, position) values (${course.id}, ${module.title}, ${module.description}, ${moduleIndex}) returning id`)[0].id;
    for (let lessonIndex = 0; lessonIndex < module.lessons.length; lessonIndex++) {
      const lesson = module.lessons[lessonIndex];
      const lessonId = (await sql`insert into academy_lessons (module_id, slug, title, kind, content, duration_minutes, position, published) values (${moduleId}, ${lesson.slug}, ${lesson.title}, ${lesson.kind}, ${lesson.content}, ${lesson.minutes}, ${lessonIndex}, true) returning id`)[0].id;
      for (let questionIndex = 0; questionIndex < lesson.questions.length; questionIndex++) {
        const question = lesson.questions[questionIndex];
        const [created] = await sql`insert into academy_quiz_questions (lesson_id, prompt, explanation, position) values (${lessonId}, ${question.prompt}, ${question.correct ? "Correct. This supports safe, traceable inspection practice." : "Incorrect. This conflicts with safe, traceable inspection practice."}, ${questionIndex}) returning id`;
        await sql`insert into academy_quiz_options (question_id, label, correct, position) values (${created.id}, 'True', ${question.correct}, 0), (${created.id}, 'False', ${!question.correct}, 1)`;
      }
    }
  }
  console.log("Academy seed complete: 12 sequential Level 1 sessions");
  await sql.end();
}

run().catch(async (error) => { console.error(error); await sql.end(); process.exit(1); });
