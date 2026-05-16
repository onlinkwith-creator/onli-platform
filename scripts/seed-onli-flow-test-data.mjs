import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

async function readEnvFile(path) {
  try {
    const text = await fs.readFile(path, "utf8");
    return Object.fromEntries(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [
            line.slice(0, index),
            line.slice(index + 1).replace(/^['"]|['"]$/g, ""),
          ];
        })
    );
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

const env = await readEnvFile(".env.local");

if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  throw new Error("Supabase env is missing. Check .env.local.");
}

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY
);

const interpreters = [
  {
    key: "kimMinjun",
    name: "김민준",
    gender: "남성",
    region: "도쿄",
    email: "onli-flow-kim-minjun@example.invalid",
    phone: "080-3100-0001",
    level: "Lv3",
    specialties: ["뷰티", "전시회"],
    available_regions: ["도쿄"],
    available_tasks: "뷰티/전시회",
    jlpt: "N1",
    approved: true,
    status: "active",
  },
  {
    key: "parkSeoyeon",
    name: "박서연",
    gender: "여성",
    region: "치바",
    email: "onli-flow-park-seoyeon@example.invalid",
    phone: "080-3100-0002",
    level: "Lv2",
    specialties: ["식품", "바이어 미팅"],
    available_regions: ["치바"],
    available_tasks: "식품/바이어 미팅",
    jlpt: "N1",
    approved: true,
    status: "active",
  },
  {
    key: "leeJihoon",
    name: "이지훈",
    gender: "남성",
    region: "요코하마",
    email: "onli-flow-lee-jihoon@example.invalid",
    phone: "080-3100-0003",
    level: "Lv4",
    specialties: ["IT", "스타트업"],
    available_regions: ["요코하마"],
    available_tasks: "IT/스타트업",
    jlpt: "비즈니스 상급",
    approved: true,
    status: "active",
  },
  {
    key: "choiYuna",
    name: "최유나",
    gender: "여성",
    region: "도쿄",
    email: "onli-flow-choi-yuna@example.invalid",
    phone: "080-3100-0004",
    level: "Lv2",
    specialties: ["패션", "팝업"],
    available_regions: ["도쿄"],
    available_tasks: "패션/팝업",
    jlpt: "N1",
    approved: true,
    status: "active",
  },
  {
    key: "jungHarin",
    name: "정하린",
    gender: "여성",
    region: "사이타마",
    email: "onli-flow-jung-harin@example.invalid",
    phone: "080-3100-0005",
    level: "Lv3",
    specialties: ["의료기기", "상담회"],
    available_regions: ["사이타마"],
    available_tasks: "의료기기/상담회",
    jlpt: "N1",
    approved: false,
    status: "pending",
  },
  {
    key: "ohTaemin",
    name: "오태민",
    gender: "남성",
    region: "신주쿠",
    email: "onli-flow-oh-taemin@example.invalid",
    phone: "080-3100-0006",
    level: "Lv1",
    specialties: ["일반 비즈니스"],
    available_regions: ["신주쿠"],
    available_tasks: "일반 비즈니스",
    jlpt: "N2",
    approved: true,
    status: "active",
  },
  {
    key: "hanJisu",
    name: "한지수",
    gender: "여성",
    region: "하라주쿠",
    email: "onli-flow-han-jisu@example.invalid",
    phone: "080-3100-0007",
    level: "Lv2",
    specialties: ["코스메", "뷰티"],
    available_regions: ["하라주쿠"],
    available_tasks: "코스메/뷰티",
    jlpt: "N1",
    approved: true,
    status: "active",
  },
  {
    key: "yoonDohyun",
    name: "윤도현",
    gender: "남성",
    region: "롯폰기",
    email: "onli-flow-yoon-dohyun@example.invalid",
    phone: "080-3100-0008",
    level: "Lv4",
    specialties: ["스타트업", "IR"],
    available_regions: ["롯폰기"],
    available_tasks: "스타트업/IR",
    jlpt: "비즈니스 상급",
    approved: true,
    status: "active",
  },
  {
    key: "songYerin",
    name: "송예린",
    gender: "여성",
    region: "요코하마",
    email: "onli-flow-song-yerin@example.invalid",
    phone: "080-3100-0009",
    level: "Lv2",
    specialties: ["식품", "전시회"],
    available_regions: ["요코하마"],
    available_tasks: "식품/전시회",
    jlpt: "N1",
    approved: false,
    status: "pending",
  },
  {
    key: "kangDoyun",
    name: "강도윤",
    gender: "남성",
    region: "도쿄",
    email: "onli-flow-kang-doyun@example.invalid",
    phone: "080-3100-0010",
    level: "Lv1",
    specialties: ["일반 행사"],
    available_regions: ["도쿄"],
    available_tasks: "일반 행사",
    jlpt: "N2",
    approved: false,
    status: "rejected",
  },
];

const projects = [
  {
    key: "beautyExpo",
    eventName: "K-뷰티 전시회 통역",
    companyName: "Seoul Beauty Lab",
    location: "도쿄 빅사이트",
    startDate: "2026-06-10",
    endDate: "2026-06-12",
    peopleCount: 2,
    level: "Lv3",
    field: "뷰티/전시회",
    jobStatus: "open",
    requestStatus: "matching",
    matchingStatus: "matched",
    assignments: ["kimMinjun"],
    applications: [
      ["kimMinjun", "매칭완료"],
      ["hanJisu", "지원완료"],
      ["kangDoyun", "불합격"],
    ],
  },
  {
    key: "foodMeeting",
    eventName: "한국 식품 바이어 미팅",
    companyName: "Hansik Foods",
    location: "신주쿠",
    startDate: "2026-06-18",
    endDate: "2026-06-18",
    peopleCount: 2,
    level: "Lv2",
    field: "식품/바이어 미팅",
    jobStatus: "open",
    requestStatus: "pending",
    matchingStatus: "pending",
    assignments: [],
    applications: [
      ["parkSeoyeon", "지원완료"],
      ["songYerin", "지원완료"],
    ],
  },
  {
    key: "startupPitch",
    eventName: "IT 스타트업 피칭 데이",
    companyName: "NextCore Korea",
    location: "롯폰기",
    startDate: "2026-06-22",
    endDate: "2026-06-22",
    peopleCount: 1,
    level: "Lv4",
    field: "IT/스타트업",
    jobStatus: "assigned",
    requestStatus: "배정완료",
    matchingStatus: "assigned",
    assignments: ["leeJihoon"],
    applications: [["leeJihoon", "매칭완료"]],
    settlement: [80000, 65000, "paid", "unsettled"],
  },
  {
    key: "fashionPopup",
    eventName: "K-패션 팝업 행사",
    companyName: "Mode Seoul",
    location: "하라주쿠",
    startDate: "2026-07-02",
    endDate: "2026-07-04",
    peopleCount: 3,
    level: "Lv2",
    field: "패션/팝업",
    jobStatus: "open",
    requestStatus: "matching",
    matchingStatus: "matched",
    assignments: ["choiYuna", "parkSeoyeon"],
    applications: [
      ["choiYuna", "매칭완료"],
      ["parkSeoyeon", "매칭완료"],
      ["hanJisu", "보류"],
    ],
    settlement: [150000, 120000, "unpaid", "unsettled"],
  },
  {
    key: "medicalConsulting",
    eventName: "의료기기 상담회",
    companyName: "MediCore Korea",
    location: "요코하마",
    startDate: "2026-07-15",
    endDate: "2026-07-15",
    peopleCount: 1,
    level: "Lv3",
    field: "의료기기/상담회",
    jobStatus: "open",
    requestStatus: "pending",
    matchingStatus: "pending",
    assignments: [],
    applications: [["jungHarin", "지원완료"]],
  },
  {
    key: "cosmeLaunch",
    eventName: "코스메 신제품 론칭 상담회",
    companyName: "Glow Seoul",
    location: "시부야",
    startDate: "2026-07-20",
    endDate: "2026-07-20",
    peopleCount: 2,
    level: "Lv2",
    field: "화장품/뷰티",
    jobStatus: "open",
    requestStatus: "matching",
    matchingStatus: "matched",
    assignments: ["hanJisu"],
    applications: [
      ["hanJisu", "매칭완료"],
      ["kimMinjun", "지원완료"],
    ],
  },
  {
    key: "premiumFoodExpo",
    eventName: "프리미엄 식품 전시회",
    companyName: "K-Food Bridge",
    location: "마쿠하리 멧세",
    startDate: "2026-08-05",
    endDate: "2026-08-07",
    peopleCount: 2,
    level: "Lv2",
    field: "식품/전시회",
    jobStatus: "open",
    requestStatus: "pending",
    matchingStatus: "pending",
    assignments: [],
    applications: [["songYerin", "지원완료"]],
  },
  {
    key: "irRoadshow",
    eventName: "스타트업 IR 로드쇼",
    companyName: "Venture Link Korea",
    location: "마루노우치",
    startDate: "2026-08-12",
    endDate: "2026-08-12",
    peopleCount: 1,
    level: "Lv4",
    field: "스타트업/IR",
    jobStatus: "assigned",
    requestStatus: "배정완료",
    matchingStatus: "assigned",
    assignments: ["yoonDohyun"],
    applications: [["yoonDohyun", "매칭완료"]],
    settlement: [90000, 72000, "paid", "settled"],
  },
  {
    key: "tourForum",
    eventName: "한일 관광 교류 포럼",
    companyName: "Travel Mate Korea",
    location: "우에노",
    startDate: "2026-08-25",
    endDate: "2026-08-25",
    peopleCount: 2,
    level: "Lv1",
    field: "관광/일반 행사",
    jobStatus: "open",
    requestStatus: "pending",
    matchingStatus: "pending",
    assignments: [],
    applications: [["ohTaemin", "지원완료"]],
  },
  {
    key: "medDeviceDemo",
    eventName: "디지털 헬스케어 제품 데모",
    companyName: "HealthON Korea",
    location: "요코하마",
    startDate: "2026-09-03",
    endDate: "2026-09-04",
    peopleCount: 2,
    level: "Lv3",
    field: "의료/제품 데모",
    jobStatus: "open",
    requestStatus: "matching",
    matchingStatus: "matched",
    assignments: ["kimMinjun"],
    applications: [
      ["kimMinjun", "매칭완료"],
      ["jungHarin", "지원완료"],
    ],
    settlement: [120000, 98000, "unpaid", "unsettled"],
  },
];

function dateRange(startDate, endDate) {
  return startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
}

function settlementPayload(project) {
  const [companyAmount = 0, interpreterPayment = 0, payment = "unpaid", settlement = "unsettled"] =
    project.settlement || [];
  return {
    company_amount: companyAmount,
    interpreter_payment: interpreterPayment,
    platform_profit: companyAmount - interpreterPayment,
    payment_status: payment,
    settlement_status: settlement,
    client_price: companyAmount,
    interpreter_price: interpreterPayment,
    profit: companyAmount - interpreterPayment,
  };
}

async function maybeSingle(query) {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureInterpreter(seed) {
  const existing =
    (await maybeSingle(
      supabase.from("interpreters").select("*").eq("email", seed.email).limit(1)
    )) ||
    (await maybeSingle(
      supabase.from("interpreters").select("*").eq("name", seed.name).limit(1)
    ));

  if (existing) return { row: existing, inserted: false };

  const payload = {
    ...seed,
    age: "28",
    school: "ON-LI 플로우 테스트",
    kakao_or_line: `onli_${seed.key}`,
    stay_period: "3년 이상",
    has_experience: seed.approved,
    experience_count: seed.level === "Lv4" ? "20" : seed.level === "Lv3" ? "12" : "5",
  };
  delete payload.key;

  const { data, error } = await supabase
    .from("interpreters")
    .insert([payload])
    .select("*")
    .single();
  if (error) throw error;
  return { row: data, inserted: true };
}

async function ensureJob(project) {
  const existing = await maybeSingle(
    supabase.from("jobs").select("*").eq("event_name", project.eventName).limit(1)
  );
  if (existing) return { row: existing, inserted: false };

  const payload = {
    title: `${project.eventName} 통역 모집`,
    event_name: project.eventName,
    company_name: project.companyName,
    location: project.location,
    event_location: project.location,
    date: dateRange(project.startDate, project.endDate),
    event_date: project.startDate,
    start_date: project.startDate,
    end_date: project.endDate,
    pay: "협의",
    language: "한국어 ↔ 일본어",
    level: project.level,
    requested_level: project.level,
    preference: project.field,
    people: `${project.peopleCount}명`,
    people_count: project.peopleCount,
    field: project.field,
    status: project.jobStatus,
    visibility: "public",
    is_urgent: false,
  };

  const { data, error } = await supabase
    .from("jobs")
    .insert([payload])
    .select("*")
    .single();
  if (error) throw error;
  return { row: data, inserted: true };
}

async function ensureRequest(project, job, interpreterByKey) {
  const existing = await maybeSingle(
    supabase.from("requests").select("*").eq("event_name", project.eventName).limit(1)
  );
  if (existing) return { row: existing, inserted: false };

  const primaryInterpreter = project.assignments.length
    ? interpreterByKey.get(project.assignments[project.assignments.length - 1])
    : null;
  const settlement = settlementPayload(project);
  const payload = {
    job_id: job.id,
    is_public: true,
    is_job_public: true,
    company_name: project.companyName,
    manager_name: "ON-LI 플로우 테스트 담당자",
    contact_name: "ON-LI 플로우 테스트 담당자",
    email: `onli-flow-request-${project.key}@example.invalid`,
    contact_email_or_phone: `onli-flow-request-${project.key}@example.invalid`,
    phone: "080-3200-0000",
    event_name: project.eventName,
    event_date: project.startDate,
    start_date: project.startDate,
    end_date: project.endDate,
    event_location: project.location,
    requested_level: project.level,
    required_level: project.level,
    requested_people_count: project.peopleCount,
    required_count: project.peopleCount,
    preferred_gender: "성별 무관",
    interpretation_field: project.field,
    job_field: project.field,
    request_detail: `${project.eventName} 운영 플로우 확인용 테스트 의뢰입니다.`,
    request_details: `${project.eventName} 운영 플로우 확인용 테스트 의뢰입니다.`,
    job_description: `${project.eventName} 운영 플로우 확인용 테스트 의뢰입니다.`,
    dress_code: "비즈니스 캐주얼",
    status: project.requestStatus,
    matching_status: project.matchingStatus,
    contact_status: "not_contacted",
    ...settlement,
    assigned_interpreter_id: primaryInterpreter?.id || null,
    assigned_interpreter_name: primaryInterpreter?.name || null,
    matched_interpreter_id: primaryInterpreter?.id || null,
    matched_interpreter_name: primaryInterpreter?.name || null,
  };

  const { data, error } = await supabase
    .from("requests")
    .insert([payload])
    .select("*")
    .single();
  if (error) throw error;
  return { row: data, inserted: true };
}

async function ensureApplication(project, job, interpreter, status) {
  const existing = await maybeSingle(
    supabase
      .from("job_applications")
      .select("*")
      .eq("job_id", job.id)
      .eq("email", interpreter.email)
      .limit(1)
  );
  if (existing) return { row: existing, inserted: false };

  const { data, error } = await supabase
    .from("job_applications")
    .insert([
      {
        job_id: job.id,
        applicant_name: interpreter.name,
        phone: interpreter.phone,
        email: interpreter.email,
        message: `${project.eventName} 지원 플로우 테스트 데이터입니다.`,
        status,
      },
    ])
    .select("*")
    .single();
  if (error) throw error;
  return { row: data, inserted: true };
}

async function ensureAssignment(request, interpreter) {
  const existing = await maybeSingle(
    supabase
      .from("request_interpreters")
      .select("*")
      .eq("request_id", request.id)
      .eq("interpreter_id", interpreter.id)
      .limit(1)
  );
  if (existing) return { row: existing, inserted: false };

  const { data, error } = await supabase
    .from("request_interpreters")
    .insert([{ request_id: request.id, interpreter_id: interpreter.id }])
    .select("*")
    .single();
  if (error) throw error;
  return { row: data, inserted: true };
}

const summary = {
  interpreters: { inserted: 0, skipped: 0 },
  jobs: { inserted: 0, skipped: 0 },
  requests: { inserted: 0, skipped: 0 },
  applications: { inserted: 0, skipped: 0 },
  assignments: { inserted: 0, skipped: 0 },
};

const interpreterByKey = new Map();
for (const seed of interpreters) {
  const result = await ensureInterpreter(seed);
  interpreterByKey.set(seed.key, result.row);
  summary.interpreters[result.inserted ? "inserted" : "skipped"] += 1;
}

for (const project of projects) {
  const jobResult = await ensureJob(project);
  summary.jobs[jobResult.inserted ? "inserted" : "skipped"] += 1;

  const requestResult = await ensureRequest(project, jobResult.row, interpreterByKey);
  summary.requests[requestResult.inserted ? "inserted" : "skipped"] += 1;

  for (const [interpreterKey, status] of project.applications) {
    const applicationResult = await ensureApplication(
      project,
      jobResult.row,
      interpreterByKey.get(interpreterKey),
      status
    );
    summary.applications[applicationResult.inserted ? "inserted" : "skipped"] += 1;
  }

  for (const interpreterKey of project.assignments) {
    const assignmentResult = await ensureAssignment(
      requestResult.row,
      interpreterByKey.get(interpreterKey)
    );
    summary.assignments[assignmentResult.inserted ? "inserted" : "skipped"] += 1;
  }
}

console.log(
  JSON.stringify(
    {
      tables: {
        interpreters: interpreters.length,
        jobs: projects.length,
        requests: projects.length,
        job_applications: projects.reduce(
          (count, project) => count + project.applications.length,
          0
        ),
        request_interpreters: projects.reduce(
          (count, project) => count + project.assignments.length,
          0
        ),
      },
      summary,
      events: projects.map((project) => project.eventName),
      note: "No delete or schema change was executed.",
    },
    null,
    2
  )
);
