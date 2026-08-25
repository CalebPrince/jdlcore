"use client";

import { useActionState } from "react";
import { submitAcademyQuiz } from "@/app/actions/academy";
import type { FormState } from "@/app/actions/submissions";

type Question = { id:number; prompt:string; options:{id:number;label:string;position:number}[] };
const initial:FormState={ok:false,message:""};

export function AcademyQuizForm({lessonId,returnTo,questions}:{lessonId:number;returnTo:string;questions:Question[]}){
  const[state,action,pending]=useActionState(submitAcademyQuiz,initial);
  return <form action={action} className="mt-10"><input type="hidden" name="lessonId" value={lessonId}/><input type="hidden" name="returnTo" value={returnTo}/><div className="space-y-6">{questions.map((question,index)=><fieldset key={question.id} className="rounded-2xl border p-5"><legend className="px-2 font-display font-semibold text-navy-950">{index+1}. {question.prompt}</legend><div className="mt-3 space-y-2">{question.options.map(option=><label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/10 p-3 text-sm transition has-[:checked]:border-gold-500 has-[:checked]:bg-gold-500/10"><input type="radio" name={`question_${question.id}`} value={option.id}/><span>{option.label}</span></label>)}</div></fieldset>)}</div>{state.message?<p className={`mt-5 rounded-xl p-4 text-sm font-medium ${state.ok?"bg-green-50 text-green-700":"bg-red-50 text-red-700"}`}>{state.message}</p>:null}<button disabled={pending||!questions.length} className="mt-6 rounded-full bg-navy-950 px-7 py-3 text-sm font-bold text-white disabled:opacity-50">{pending?"Scoring…":"Submit assessment"}</button></form>;
}
