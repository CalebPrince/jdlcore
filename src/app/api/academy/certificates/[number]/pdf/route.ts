import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { getAcademyCertificate } from "@/lib/academy";

const NAVY=rgb(0.031,0.094,0.149);
const GOLD=rgb(0.933,0.69,0.169);
const INK=rgb(0.063,0.11,0.169);
const MUTED=rgb(0.35,0.4,0.46);

export async function GET(request:Request,{params}:{params:Promise<{number:string}>}){
  const number=decodeURIComponent((await params).number);
  const certificate=await getAcademyCertificate(number);
  if(!certificate)return new NextResponse("Certificate not found",{status:404});
  const verificationUrl=`${new URL(request.url).origin}/academy/certificates/${encodeURIComponent(number)}`;
  const pdf=await buildCertificatePdf(certificate,verificationUrl);
  return new NextResponse(Buffer.from(pdf),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${number}.pdf"`,"cache-control":"public, max-age=3600"}});
}

async function buildCertificatePdf(certificate:NonNullable<Awaited<ReturnType<typeof getAcademyCertificate>>>,verificationUrl:string){
  const pdf=await PDFDocument.create();
  const page=pdf.addPage([842,595]);
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({x:0,y:0,width:842,height:595,color:rgb(0.973,0.969,0.945)});
  page.drawRectangle({x:22,y:22,width:798,height:551,borderColor:NAVY,borderWidth:2});
  page.drawRectangle({x:31,y:31,width:780,height:533,borderColor:GOLD,borderWidth:0.8});
  page.drawRectangle({x:0,y:515,width:842,height:80,color:NAVY});
  page.drawText("JDL CORE ACADEMY",{x:56,y:551,size:19,font:bold,color:rgb(1,1,1)});
  page.drawText("FIELD COMPETENCE, DOCUMENTED",{x:56,y:533,size:7.5,font:regular,color:GOLD});
  page.drawText("CERTIFICATE",{x:650,y:542,size:18,font:bold,color:GOLD});
  centered(page,"CERTIFICATE OF COMPLETION",450,15,bold,NAVY);
  centered(page,"This certifies that",415,11,regular,MUTED);
  centered(page,certificate.learnerName,365,30,bold,NAVY);
  page.drawLine({start:{x:190,y:350},end:{x:652,y:350},thickness:1,color:GOLD});
  centered(page,"has successfully completed",320,11,regular,MUTED);
  centered(page,certificate.courseTitle,278,22,bold,INK);
  centered(page,`${certificate.level} programme - ${certificate.courseCode}`,250,10,regular,MUTED);
  const issued=certificate.issuedAt.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});
  page.drawText("ISSUED",{x:72,y:165,size:7,font:bold,color:MUTED});
  page.drawText(issued,{x:72,y:146,size:11,font:bold,color:INK});
  page.drawText("CERTIFICATE NUMBER",{x:322,y:165,size:7,font:bold,color:MUTED});
  page.drawText(certificate.certificateNumber,{x:322,y:146,size:11,font:bold,color:INK});
  page.drawText(certificate.revokedAt?"REVOKED":"VERIFIED",{x:680,y:149,size:11,font:bold,color:certificate.revokedAt?rgb(0.7,0.1,0.1):rgb(0.12,0.48,0.3)});
  page.drawLine({start:{x:72,y:112},end:{x:770,y:112},thickness:0.6,color:rgb(0.75,0.75,0.72)});
  page.drawText(`Verify: ${verificationUrl}`,{x:72,y:87,size:7.5,font:regular,color:MUTED});
  page.drawText("JDL Core Academy - Practical petroleum operations education",{x:72,y:66,size:8,font:bold,color:NAVY});
  pdf.setTitle(`${certificate.courseTitle} - ${certificate.learnerName}`);
  pdf.setAuthor("JDL Core Academy");
  return pdf.save();
}

function centered(page:PDFPage,text:string,y:number,size:number,font:PDFFont,color:RGB){
  const width=font.widthOfTextAtSize(text,size);
  page.drawText(text,{x:(842-width)/2,y,size,font,color});
}
