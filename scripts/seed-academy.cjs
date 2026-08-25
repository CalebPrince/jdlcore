require("dotenv").config();
const postgres = require("postgres");

const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before seeding the Academy.");
const sql = postgres(url, { prepare: false });

const modules = [
  { title: "The measurement environment", description: "Establish safe, repeatable conditions before measurement.", lessons: [
    { slug: "trustworthy-zero", title: "Every measurement needs a trustworthy zero", kind: "reading", minutes: 18, content: "Before a gauge tape enters the tank, the inspector must know exactly which fixed points define the measurement.\n\nThe reference gauge height is the vertical distance from the tank datum plate to the reference gauge point at the hatch. Verify it against the approved tank calibration table before beginning work." },
    { slug: "field-safety", title: "Field safety and equipment checks", kind: "reading", minutes: 22, content: "Confirm the permit, personal protective equipment, access conditions, and instrument condition before opening a gauge hatch.\n\nA reliable result begins with a controlled working environment and verified equipment." },
  ]},
  { title: "Manual gauging practice", description: "Take and validate manual measurements.", lessons: [
    { slug: "taking-a-dip", title: "Taking a manual dip", kind: "reading", minutes: 28, content: "Lower the tape steadily from the designated reference point. Avoid contact that can disturb the liquid surface or introduce an angled reading.\n\nRepeat the measurement until consecutive readings fall within the required tolerance." },
    { slug: "temperature-water", title: "Temperature and free-water checks", kind: "reading", minutes: 32, content: "Representative temperature and free-water measurements are essential inputs to corrected quantity calculations.\n\nDocument the sampling depth, instrument identity, reading, and time for every observation." },
  ]},
  { title: "Competency check", description: "Demonstrate the complete field workflow.", lessons: [
    { slug: "field-assessment", title: "Tank gauging field assessment", kind: "assessment", minutes: 30, content: "Apply the complete pre-check, gauging, validation, and reporting sequence to the scenario provided by your facilitator." },
  ]},
];

async function run() {
  const [course] = await sql`
    insert into academy_courses (slug, code, title, summary, level, status, accent, pass_percent, estimated_minutes, published_at)
    values ('tank-gauging', 'JDL-TG01', 'Tank Gauging & Measurement', 'Build reliable manual gauging habits, from reference points to temperature correction.', 'Foundation', 'published', '#eeb02b', 80, 130, now())
    on conflict (slug) do update set title = excluded.title, summary = excluded.summary, status = 'published', updated_at = now()
    returning id
  `;
  for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex++) {
    const module = modules[moduleIndex];
    const existing = await sql`select id from academy_modules where course_id = ${course.id} and position = ${moduleIndex}`;
    const moduleId = existing[0]?.id ?? (await sql`insert into academy_modules (course_id, title, description, position) values (${course.id}, ${module.title}, ${module.description}, ${moduleIndex}) returning id`)[0].id;
    await sql`update academy_modules set title = ${module.title}, description = ${module.description} where id = ${moduleId}`;
    for (let lessonIndex = 0; lessonIndex < module.lessons.length; lessonIndex++) {
      const lesson = module.lessons[lessonIndex];
      const found = await sql`select id from academy_lessons where module_id = ${moduleId} and slug = ${lesson.slug}`;
      if (found.length) await sql`update academy_lessons set title=${lesson.title}, kind=${lesson.kind}, content=${lesson.content}, duration_minutes=${lesson.minutes}, position=${lessonIndex}, published=true where id=${found[0].id}`;
      else await sql`insert into academy_lessons (module_id, slug, title, kind, content, duration_minutes, position, published) values (${moduleId}, ${lesson.slug}, ${lesson.title}, ${lesson.kind}, ${lesson.content}, ${lesson.minutes}, ${lessonIndex}, true)`;
    }
  }
  const assessment = await sql`
    select l.id from academy_lessons l
    join academy_modules m on m.id = l.module_id
    where m.course_id = ${course.id} and l.slug = 'field-assessment'
    limit 1
  `;
  if (assessment[0]) {
    const existingQuestions = await sql`select count(*)::int as count from academy_quiz_questions where lesson_id = ${assessment[0].id}`;
    if (existingQuestions[0].count === 0) {
      const seededQuestions = [
        { prompt: "What should an inspector do when the measured reference height is outside the facility tolerance?", explanation: "A reference-height discrepancy can invalidate every downstream quantity calculation.", options: ["Adjust the dip silently", "Continue and mention it later", "Stop, investigate, and document the discrepancy", "Use yesterday's reference height"], correct: 2 },
        { prompt: "Why are repeat manual dips required?", explanation: "Repeatability demonstrates that the measurement is stable and was taken consistently.", options: ["To warm the tape", "To confirm readings fall within the required tolerance", "To change the tank temperature", "To estimate density"], correct: 1 },
        { prompt: "Which record is essential for a representative temperature reading?", explanation: "Depth, instrument identity, reading, and time make the observation traceable.", options: ["Only the final average", "The inspector's job title", "Depth, instrument, reading, and time", "The weather forecast"], correct: 2 },
      ];
      for (let index = 0; index < seededQuestions.length; index++) {
        const question = seededQuestions[index];
        const [created] = await sql`insert into academy_quiz_questions (lesson_id, prompt, explanation, position) values (${assessment[0].id}, ${question.prompt}, ${question.explanation}, ${index}) returning id`;
        for (let optionIndex = 0; optionIndex < question.options.length; optionIndex++) {
          await sql`insert into academy_quiz_options (question_id, label, correct, position) values (${created.id}, ${question.options[optionIndex]}, ${optionIndex === question.correct}, ${optionIndex})`;
        }
      }
    }
  }
  console.log("Academy seed complete: Tank Gauging & Measurement");
  await sql.end();
}

run().catch(async (error) => { console.error(error); await sql.end(); process.exit(1); });
