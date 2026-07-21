import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";

const PRODUCTION_ORIGIN = "https://onli-platform.vercel.app";
const ALLOWED_ORIGINS = new Set([
  PRODUCTION_ORIGIN,
  "http://localhost:5173",
  "http://localhost:4173",
]);
const isAllowedOrigin = (origin: string) =>
  ALLOWED_ORIGINS.has(origin) || /^https:\/\/onli-platform-[a-z0-9-]+\.vercel\.app$/.test(origin);
const corsHeaders = (request: Request) => {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : PRODUCTION_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
};
const FONT_URL="https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Regular.ttf";
const BOLD_FONT_URL="https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Bold.ttf";
const JAPANESE_FONT_URL="https://raw.githubusercontent.com/google/fonts/main/ofl/mplus1p/MPLUS1p-Regular.ttf";
const json=(body:unknown,status=200,headers:Record<string,string>)=>new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json"}});
const safe=(v:unknown)=>v===null||v===undefined||v===""?"-":String(v);
const date=(v:unknown)=>safe(v)==="-"?"-":String(v).slice(0,10).replaceAll("-",".");
const won=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?`${Math.round(n).toLocaleString("ko-KR")}원`:"-"};
const isPositiveInteger=(value:unknown)=>typeof value==="number"&&Number.isSafeInteger(value)&&value>0;
const errorMessage=(error:unknown)=>error instanceof Error?error.message:
  typeof error==="object"&&error!==null&&"message" in error?String(error.message):"문서 생성에 실패했습니다.";
const fontCharacterSets=new WeakMap<object,Set<number>>();
const fontHas=(font:any,character:string)=>{
  let characters=fontCharacterSets.get(font);
  if(!characters){characters=new Set(font.getCharacterSet());fontCharacterSets.set(font,characters);}
  return characters.has(character.codePointAt(0)!);
};
const textWidth=(text:string,font:any,size:number,fallback:any=null)=>Array.from(text).reduce((width,character)=>{
  const selected=fallback&&!fontHas(font,character)&&fontHas(fallback,character)?fallback:font;
  return width+selected.widthOfTextAtSize(character,size);
},0);
const wrapText=(value:unknown,font:any,size:number,maxWidth:number,fallback:any=null)=>{
  const characters=Array.from(safe(value)); const lines:string[]=[]; let line="";
  for(const character of characters){
    const candidate=line+character;
    if(line&&textWidth(candidate,font,size,fallback)>maxWidth){lines.push(line);line=character;}
    else line=candidate;
  }
  if(line) lines.push(line);
  return lines.length?lines:["-"];
};
const drawTextWithFallback=(page:any,text:string,x:number,y:number,size:number,font:any,color:any,fallback:any=null)=>{
  let cursor=x,run="",runFont=font;
  const flush=()=>{if(!run)return;page.drawText(run,{x:cursor,y,size,font:runFont,color});cursor+=runFont.widthOfTextAtSize(run,size);run="";};
  for(const character of Array.from(text)){
    const selected=fallback&&!fontHas(font,character)&&fontHas(fallback,character)?fallback:font;
    if(run&&selected!==runFont) flush();
    runFont=selected;run+=character;
  }
  flush();
};
const optionalWon=(value:unknown)=>value===null||value===undefined||value===""?"-":won(value);
const displayName=(value:unknown)=>/^\d+$/.test(String(value??"").trim())?"-":safe(value);
const paymentStatusLabel=(value:unknown)=>({unpaid:"미입금",invoice_sent:"청구 완료",paid:"입금 완료",overdue:"연체",refunded:"환불"}[String(value??"").trim()]??safe(value));
const settlementStatusLabel=(value:unknown)=>{
  const status=String(value??"").trim().toLowerCase().replaceAll(" ","_");
  if(["settlement_confirmed","confirmed","정산_확정","정산확정"].includes(status)) return "정산 확정";
  if(["settlement_paying","payment_started","payment_in_progress","payout_started","paying","통역사_지급","통역사지급","지급중"].includes(status)) return "통역사 지급";
  if(["settlement_completed","settlement_done","payment_completed","payout_completed","completed","paid","done","정산_완료","정산완료","지급완료"].includes(status)) return "정산 완료";
  return "정산 대기";
};
const positiveNumber=(value:unknown)=>{
  const number=Number(value);
  return Number.isFinite(number)&&number>0?number:null;
};
const buildCompanySettlementAmounts=async(adminDb:any,request:any)=>{
  const estimateResult=await adminDb.from("documents")
    .select("metadata")
    .eq("request_id",request.id)
    .eq("document_type","estimate")
    .eq("status","issued")
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(estimateResult.error) throw estimateResult.error;

  const estimate=estimateResult.data?.metadata??{};
  const companyUnitPrice=positiveNumber(estimate.unitPrice);
  const interpreterCount=positiveNumber(request.requested_people_count??request.required_count??estimate.peopleCount);
  const workDays=positiveNumber(request.settlement_work_days??estimate.workDays);
  if(!companyUnitPrice) throw new Error("기업 견적서의 1명·1일 기준 단가를 확인해주세요.");
  if(!interpreterCount) throw new Error("기업용 정산서의 통역사 수를 확인해주세요.");
  if(!workDays) throw new Error("기업용 정산서의 근무일수를 확인해주세요.");

  return {
    companyUnitPrice,
    interpreterCount,
    workDays,
    baseSupplyAmount:companyUnitPrice*workDays*interpreterCount,
  };
};
const drawOfficialTable=(page:any,regular:any,bold:any,rows:unknown[][],startY:number,japanese:any=null)=>{
  const x=44,width=507,labelWidth=148,fontSize=8.5,lineHeight=10.5;
  let top=startY;
  rows.forEach(([label,value],index)=>{
    const labelLines=wrapText(label,bold,fontSize,labelWidth-20);
    const valueLines=wrapText(value,regular,fontSize,width-labelWidth-22,japanese);
    const lineCount=Math.max(labelLines.length,valueLines.length);
    const height=Math.max(22,8+lineCount*lineHeight); const bottom=top-height;
    page.drawRectangle({x,y:bottom,width,height,color:index%2===0?rgb(.973,.98,.988):rgb(1,1,1)});
    labelLines.forEach((text:string,i:number)=>page.drawText(text,{x:x+11,y:top-15-i*lineHeight,size:fontSize,font:bold,color:rgb(.18,.22,.28)}));
    valueLines.forEach((text:string,i:number)=>drawTextWithFallback(page,text,x+labelWidth+11,top-15-i*lineHeight,fontSize,regular,rgb(.07,.09,.13),japanese));
    top=bottom;
  });
  return top;
};
const drawCompanySettlementPdf=(pdf:any,regular:any,bold:any,row:any,r:any,biz:any,payment:any,amounts:any,japanese:any=null)=>{
  const page=pdf.addPage([595.28,841.89]); const x=44,width=507;
  page.drawText("ON-LI",{x,y:786,size:22,font:bold,color:rgb(.07,.09,.13)});
  page.drawText("정산서",{x,y:744,size:19,font:bold,color:rgb(.07,.09,.13)});
  page.drawText(`문서번호: ${safe(row.document_no)}`,{x,y:714,size:9.5,font:regular,color:rgb(.28,.34,.41)});
  page.drawText(`버전: v${safe(row.version)}`,{x,y:698,size:9.5,font:regular,color:rgb(.28,.34,.41)});
  page.drawText(`생성일: ${String(row.issued_at??row.created_at??"").slice(0,10)||"-"}`,{x,y:682,size:9.5,font:regular,color:rgb(.28,.34,.41)});
  page.drawLine({start:{x,y:664},end:{x:x+width,y:664},thickness:1.5,color:rgb(.12,.16,.22)});

  page.drawText("기본 정보",{x,y:642,size:11,font:bold,color:rgb(.07,.09,.13)});
  let y=drawOfficialTable(page,regular,bold,[
    ["기업명",displayName(biz?.company_name??r.company_name)],["담당자명",displayName(biz?.contact_name??r.contact_name??r.manager_name)],
    ["의뢰번호",safe(r.request_no)],["의뢰명",displayName(r.event_name??r.title)],
    ["행사 또는 업무 기간",`${date(r.start_date??r.event_date)} ~ ${date(r.end_date??r.event_date)}`],
    ["업무 장소",safe(r.event_location??r.location)],["통역 언어",safe(r.language??r.interpretation_language)],
    ["통역사 수",`${amounts.interpreterCount}명`]
  ],630,japanese);

  y-=20; page.drawText("정산 내역",{x,y,size:11,font:bold,color:rgb(.07,.09,.13)}); y-=12;
  y=drawOfficialTable(page,regular,bold,[
    ["기업 측 단가",won(amounts.companyUnitPrice)],["통역사 수",`${amounts.interpreterCount}명`],
    ["근무일수",`${amounts.workDays}일`],["기본 공급금액",`${won(amounts.companyUnitPrice)} × ${amounts.workDays}일 × ${amounts.interpreterCount}명 = ${won(amounts.baseSupplyAmount)}`],
    ["할인금액",optionalWon(r.company_discount_amount)],["추가 비용",optionalWon(r.company_extra_amount??r.settlement_extra_amount)],
    ["세금 또는 세금 포함 추가 금액",optionalWon(r.company_tax_amount)],["최종 청구금액",optionalWon(r.company_amount)]
  ],y,japanese);

  y-=14; page.drawLine({start:{x,y},end:{x:x+width,y},thickness:1,color:rgb(.12,.16,.22)});
  y-=28; page.drawText("최종 청구금액",{x,y,size:11,font:bold,color:rgb(.07,.09,.13)});
  const finalAmount=optionalWon(r.company_amount),amountSize=17;
  page.drawText(finalAmount,{x:x+width-bold.widthOfTextAtSize(finalAmount,amountSize),y:y-3,size:amountSize,font:bold,color:rgb(.07,.09,.13)});

  y-=38; page.drawText("입금 정보",{x,y,size:11,font:bold,color:rgb(.07,.09,.13)}); y-=12;
  drawOfficialTable(page,regular,bold,[
    ["결제 상태",paymentStatusLabel(payment?.payment_status)],["입금 기한",date(payment?.due_date)],
    ["입금 완료일",date(payment?.paid_at)],["정산 상태",settlementStatusLabel(r.settlement_status)]
  ],y,japanese);
  page.drawText("본 문서는 ON-LI 운영 시스템에 저장된 의뢰 및 정산 데이터를 기준으로 발행되었습니다.",{x,y:34,size:7.5,font:regular,color:rgb(.39,.45,.53),maxWidth:width});
  return page;
};

Deno.serve(async(req)=>{
  const startedAt=Date.now();
  const cors = corsHeaders(req);
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST") return json({error:"지원하지 않는 요청 방식입니다."},405,cors);
  let reserved:any=null; let uploaded="";
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth) return json({error:"로그인이 필요합니다."},401,cors);
    const url=Deno.env.get("SUPABASE_URL"); const anon=Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!anon||!serviceKey) return json({error:"문서 생성 서버 설정을 확인해주세요."},500,cors);
    const userDb=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const adminDb=createClient(url,serviceKey,{auth:{persistSession:false}});
    const body=await req.json(); const type=body.document_type; const requestId=Number(body.request_id);
    const interpreterId=body.interpreter_id==null?null:Number(body.interpreter_id);
    console.log("settlement generation started",{type,requestId,interpreterId,regenerate:Boolean(body.regenerate)});
    if(!["settlement_statement","payout_statement"].includes(type)||!isPositiveInteger(requestId)||
      (type==="payout_statement"&&!isPositiveInteger(interpreterId))) return json({error:"잘못된 문서 생성 요청입니다."},400,cors);
    const {data:row,error:reserveError}=await userDb.rpc("reserve_settlement_statement",{p_document_type:type,p_request_id:requestId,p_interpreter_id:interpreterId,p_regenerate:Boolean(body.regenerate)});
    if(reserveError) throw reserveError;
    if(row.status==="issued") return json({document:row,reused:true},200,cors);
    reserved=row;
    const {data:r,error:rError}=await adminDb.from("requests").select("*").eq("id",requestId).single(); if(rError) throw rError;
    let biz:any=null;
    if(r.company_id||r.company_auth_user_id){
      let businessQuery=adminDb.from("businesses").select("*");
      businessQuery=r.company_id
        ? businessQuery.eq("id",r.company_id)
        : businessQuery.eq("auth_user_id",r.company_auth_user_id);
      const businessResult=await businessQuery.maybeSingle();
      if(businessResult.error) throw businessResult.error;
      biz=businessResult.data;
    }
    const {data:payment}=await adminDb.from("payments").select("*").eq("request_id",requestId).maybeSingle();
    let settlement:any=null,interpreter:any=null;
    if(type==="payout_statement"){
      const {data:assigned}=await adminDb.from("request_interpreters").select("id").eq("request_id",requestId).eq("interpreter_id",interpreterId).eq("status","assigned").maybeSingle();
      if(!assigned) throw new Error("실제 배정된 통역사만 지급명세서를 생성할 수 있습니다.");
      const sr=await adminDb.from("settlements").select("*").eq("request_id",requestId).eq("interpreter_id",interpreterId).single(); if(sr.error) throw sr.error; settlement=sr.data;
      const ir=await adminDb.from("interpreters").select("*").eq("id",interpreterId).single(); if(ir.error) throw ir.error; interpreter=ir.data;
    }
    if(type==="settlement_statement"&&!biz) throw new Error("연결된 기업 정보를 확인해주세요.");
    const days=Number(settlement?.work_days??r.settlement_work_days??1);
    const base=Number(settlement?.daily_rate??0)*days||Number(r.settlement_base_amount??0);
    const companySettlementAmounts=type==="settlement_statement"
      ?await buildCompanySettlementAmounts(adminDb,r)
      :null;
    const rows=type==="settlement_statement"?[
      ["문서번호",row.document_no],["발행일",date(row.issued_at)],["의뢰번호",safe(r.request_no)],["의뢰명",safe(r.event_name??r.title)],
      ["기업명",safe(biz?.company_name??r.company_name)],["기업 담당자명",safe(biz?.contact_name??r.contact_name??r.manager_name)],
      ["행사 또는 업무 기간",`${date(r.start_date??r.event_date)} ~ ${date(r.end_date??r.event_date)}`],["업무 장소",safe(r.event_location??r.location)],
      ["통역 언어",safe(r.language??r.interpretation_language)],["통역사 수",`${companySettlementAmounts!.interpreterCount}명`],
      ["기업 측 단가",won(companySettlementAmounts!.companyUnitPrice)],["근무일수",`${companySettlementAmounts!.workDays}일`],
      ["공급금액",won(companySettlementAmounts!.baseSupplyAmount)],["세금 또는 추가 금액",won(r.company_tax_amount??r.settlement_extra_amount)],
      ["최종 청구금액",won(r.company_amount)],["입금기한",date(payment?.due_date)],["입금완료일",date(payment?.paid_at)],
      ["입금 상태",safe(payment?.payment_status)]]:[
      ["문서번호",row.document_no],["발행일",date(row.issued_at)],["의뢰번호",safe(r.request_no)],["의뢰명",safe(r.event_name??r.title)],
      ["통역사명",safe(interpreter?.name)],["행사 또는 업무 기간",`${date(r.start_date??r.event_date)} ~ ${date(r.end_date??r.event_date)}`],
      ["실제 근무일수",safe(days)],["통역사 일당",won(settlement?.daily_rate)],["기본 지급액",won(base)],
      ["공제금액",Number(settlement?.deduction_amount)>0?won(settlement.deduction_amount):"-"],["최종 지급금액",won(settlement?.amount??base)],
      ["지급예정일",date(settlement?.payout_due_date)],["지급완료일",date(settlement?.paid_at??settlement?.settlement_completed_at)],["지급 상태",safe(settlement?.payout_status??settlement?.settlement_status)]];
    const pdf=await PDFDocument.create(); pdf.registerFontkit(fontkit); const fontBytes=await fetch(FONT_URL).then(x=>{if(!x.ok)throw new Error("PDF 폰트를 불러오지 못했습니다.");return x.arrayBuffer()});
    // fontkit's Korean TrueType subsetting can emit inconsistent glyph IDs and
    // advance widths. The compact 2 MB font is embedded whole for viewer-safe output.
    const font=await pdf.embedFont(fontBytes,{subset:false});
    if(type==="settlement_statement"){
      const boldBytes=await fetch(BOLD_FONT_URL).then(x=>{if(!x.ok)throw new Error("PDF 굵은 폰트를 불러오지 못했습니다.");return x.arrayBuffer()});
      const bold=await pdf.embedFont(boldBytes,{subset:false});
      const displayedText=[biz?.company_name,biz?.contact_name,r.company_name,r.contact_name,r.manager_name,r.request_no,r.event_name,r.title,r.event_location,r.location,r.language,r.interpretation_language].filter(Boolean).join("");
      let japanese:any=null;
      if(Array.from(displayedText).some(character=>!fontHas(font,character))){
        const japaneseBytes=await fetch(JAPANESE_FONT_URL).then(x=>{if(!x.ok)throw new Error("일본어 PDF 폰트를 불러오지 못했습니다.");return x.arrayBuffer()});
        japanese=await pdf.embedFont(japaneseBytes,{subset:false});
      }
      drawCompanySettlementPdf(pdf,font,bold,row,r,biz,payment,companySettlementAmounts,japanese);
    }else{
      const page=pdf.addPage([595.28,841.89]);
      const pageWidth=595.28,margin=48,contentWidth=pageWidth-margin*2,labelWidth=145,valueX=205;
      page.drawText("지급명세서",{x:margin,y:785,size:25,font,color:rgb(.08,.12,.2)});
      const logo="ON-LI",logoSize=14;
      page.drawText(logo,{x:pageWidth-margin-font.widthOfTextAtSize(logo,logoSize),y:792,size:logoSize,font,color:rgb(.3,.2,.55)});
      let top=754;
      for(const [label,value] of rows){
        const labelLines=wrapText(label,font,9,labelWidth-18);
        const valueLines=wrapText(value,font,9,contentWidth-labelWidth-24);
        const lineCount=Math.max(labelLines.length,valueLines.length);
        const rowHeight=Math.max(32,14+lineCount*12); const bottom=top-rowHeight;
        page.drawRectangle({x:margin,y:bottom+2,width:labelWidth,height:rowHeight-2,color:rgb(.96,.96,.98)});
        labelLines.forEach((text,i)=>page.drawText(text,{x:margin+9,y:top-20-i*12,size:9,font,color:rgb(.16,.18,.23)}));
        valueLines.forEach((text,i)=>page.drawText(text,{x:valueX,y:top-20-i*12,size:9,font,color:rgb(.08,.1,.14)}));
        top=bottom;
      }
      const footer="발행자: ON-LI  |  본 문서는 저장된 정산정보를 기준으로 발행되었습니다.";
      page.drawText(footer,{x:margin,y:36,size:8,font,color:rgb(.35,.38,.45),maxWidth:contentWidth});
    }
    const bytes=await pdf.save(); uploaded=`statements/${type}/${requestId}/${interpreterId??"company"}/${row.document_no}-v${row.version}.pdf`;
    const up=await adminDb.storage.from("onli-documents").upload(uploaded,bytes,{contentType:"application/pdf",upsert:false}); if(up.error) throw up.error;
    const amount=type==="settlement_statement"?Number(r.company_amount??0):Number(settlement?.amount??base??0);
    const metadata={request_no:r.request_no,event_name:r.event_name??r.title,notice:"본 문서는 저장된 정산정보를 기준으로 발행되었습니다.",source_updated_at:r.updated_at};
    const updated=await adminDb.from("documents").update({status:"issued",file_path:uploaded,amount,company_id:biz?.id??null,company_auth_user_id:r.company_auth_user_id??null,
      interpreter_auth_user_id:interpreter?.auth_user_id??null,metadata}).eq("id",row.id).select("*").single(); if(updated.error) throw updated.error;
    console.log("settlement generation completed",{type,requestId,interpreterId,version:row.version,durationMs:Date.now()-startedAt});
    return json({document:updated.data},200,cors);
  }catch(error){
    if(uploaded){const url=Deno.env.get("SUPABASE_URL")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;await createClient(url,key).storage.from("onli-documents").remove([uploaded]);}
    if(reserved?.id){const url=Deno.env.get("SUPABASE_URL")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;await createClient(url,key).from("documents").delete().eq("id",reserved.id).eq("status","draft");}
    console.error("settlement document generation failed",{error:errorMessage(error),stack:error instanceof Error?error.stack:null,durationMs:Date.now()-startedAt}); return json({error:errorMessage(error)},400,cors);
  }
});
