const fs = require("node:fs");
const path = require("node:path");
const { sessions } = require("./academy-level1-curriculum.cjs");

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

const lessonHtml = sessions.map((session, index) => {
  const blocks = session.content.split(/\n\n+/).map((block) => {
    const heading = block.length < 85 && !/[.!?]/.test(block);
    return heading ? `<h3>${escapeHtml(block)}</h3>` : `<p>${escapeHtml(block)}</p>`;
  }).join("\n");
  const questions = session.questions.map(([prompt, correct, incorrect], questionIndex) =>
    `<li><strong>${questionIndex + 1}. ${escapeHtml(prompt)}</strong><span>A. ${escapeHtml(correct)}</span><span>B. ${escapeHtml(incorrect)}</span><small>Review key: A</small></li>`
  ).join("\n");
  return `<section id="session-${index + 1}"><div class="eyebrow">Session ${index + 1} · ${session.minutes} min · Client review draft</div><h2>${escapeHtml(session.title)}</h2>${blocks}<h3>Assessment questions</h3><ol class="questions">${questions}</ol></section>`;
}).join("\n");

const navigation = sessions.map((session, index) => `<a href="#session-${index + 1}"><b>${String(index + 1).padStart(2, "0")}</b> ${escapeHtml(session.title)}</a>`).join("\n");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JDL Core Academy · OGC Level 1 client review</title><style>
:root{font-family:Arial,Helvetica,sans-serif;color:#16233b;background:#f5f6f4}*{box-sizing:border-box}body{margin:0;display:grid;grid-template-columns:280px minmax(0,1fr)}aside{position:sticky;top:0;height:100vh;overflow:auto;background:#13233e;color:#fff;padding:28px 18px}aside h1{font-size:20px;margin:0 10px 8px}aside p{font-size:12px;color:#ccd5e3;line-height:1.5;margin:0 10px 22px}aside a{display:block;padding:10px;border-radius:8px;color:#e5ebf4;text-decoration:none;font-size:13px;line-height:1.4}aside a:hover{background:#243855}aside b{color:#eeb02b;margin-right:7px}main{max-width:940px;width:100%;margin:auto;padding:40px 36px 90px}.notice{background:#fff6df;border-left:4px solid #eeb02b;padding:18px 22px;line-height:1.6;border-radius:8px;margin-bottom:30px}section{background:white;padding:38px 48px;margin:24px 0;border-radius:14px;box-shadow:0 3px 22px #17233b0d;scroll-margin-top:18px}.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8b680b;font-weight:bold}h2{font-size:32px;line-height:1.2;margin:14px 0 30px}h3{font-size:20px;margin:34px 0 10px;color:#1f416e}p{line-height:1.75;color:#344359;margin:0 0 16px}.questions{padding-left:25px}.questions li{padding:15px 0;border-bottom:1px solid #e9edf1;line-height:1.5}.questions strong,.questions span,.questions small{display:block}.questions span{color:#46556b;margin:5px 0 0 12px}.questions small{color:#72520a;margin:8px 0 0 12px}@media(max-width:800px){body{display:block}aside{position:relative;height:auto}main{padding:20px}section{padding:25px}}
</style></head><body><aside><h1>JDL Core Academy</h1><p>Oil, Gas &amp; Chemicals Inspection · Level 1<br>Client review draft</p>${navigation}</aside><main><div class="notice"><strong>For client review in testing.</strong> This is original JDL training content. People, vessels, tanks, correction factors and tables in exercises are fictional. They must not be used as operating instructions. The client should review technical accuracy and local suitability before public release.</div>${lessonHtml}</main></body></html>`;

const output = path.join(__dirname, "..", "output", "academy-level1-client-review.html");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html, "utf8");
console.log(output);
