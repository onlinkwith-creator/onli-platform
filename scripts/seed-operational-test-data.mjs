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

const APPLY = process.argv.includes("--apply");
const env = await readEnvFile(".env.local");

if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  throw new Error("Supabase env is missing. Check .env.local.");
}

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY
);

const seedEmails = {
  interpreters: [
    "onli-seed-kim-minjun@example.invalid",
    "onli-seed-park-seoyeon@example.invalid",
    "onli-seed-lee-jihoon@example.invalid",
    "onli-seed-choi-yuna@example.invalid",
    "onli-seed-jung-harin@example.invalid",
  ],
  applicants: [
    "onli-apply-kim-minjun@example.invalid",
    "onli-apply-park-seoyeon@example.invalid",
    "onli-apply-lee-jihoon@example.invalid",
    "onli-apply-choi-yuna@example.invalid",
    "onli-apply-jung-harin@example.invalid",
    "onli-apply-hold@example.invalid",
    "onli-apply-rejected@example.invalid",
  ],
};

const seedCompanies = [
  "Seoul Beauty Lab",
  "Hansik Foods",
  "NextCore Korea",
  "Mode Seoul",
  "MediCore Korea",
];

const seedEvents = [
  "K-뷰티 전시회 통역",
  "한국 식품 바이어 미팅",
  "IT 스타트업 피칭 데이",
  "K-패션 팝업 행사",
  "의료기기 상담회",
];

const oldSeedEvents = [
  ...seedEvents,
  "Beautyworld Japan 상담회",
  "K-패션 팝업 행사",
  "K-콘텐츠 비즈니스 미팅",
  "의료기기 전시회 상담",
  "헬스케어 제품 상담회",
  "화장품 바이어 상담",
  "제조기계 상담회",
  "한국 관광 홍보 행사",
  "집치워주기",
  "1",
];

const obviousTempNames = ["테스트", "홍길동", "김테스트", "강상인", "오세훈"];
const obviousTempEmails = [
  "test@example.com",
  "junhoo@example.com",
  "junho@example.com",
  "1@1",
  "2@2",
];

function text(value) {
  return String(value || "").trim();
}

function isExampleEmail(value) {
  const normalized = text(value).toLowerCase();
  return (
    obviousTempEmails.includes(normalized) ||
    normalized.endsWith("@example.invalid") ||
    normalized.endsWith("@example.com")
  );
}

function hasObviousTempName(value) {
  const normalized = text(value);
  return obviousTempNames.some((name) => normalized.includes(name));
}

function rowLabel(row) {
  return (
    row.name ||
    row.applicant_name ||
    row.company_name ||
    row.event_name ||
    row.title ||
    row.email ||
    row.id
  );
}

async function listRows(table) {
  const { data, error } = await supabase.from(table).select("*").limit(500);
  if (error) {
    if (/Could not find the table/i.test(error.message)) return [];
    throw error;
  }
  return data || [];
}

function isInterpreterCandidate(row) {
  return (
    seedEmails.interpreters.includes(text(row.email).toLowerCase()) ||
    isExampleEmail(row.email) ||
    hasObviousTempName(row.name)
  );
}

function isJobCandidate(row) {
  return (
    seedCompanies.includes(row.company_name) ||
    oldSeedEvents.includes(row.event_name) ||
    oldSeedEvents.some((event) => text(row.title).includes(event)) ||
    text(row.title) === "1 통역 모집" ||
    text(row.title) === "집치워주기 통역 모집" ||
    text(row.location) === "집" ||
    text(row.event_location) === "집"
  );
}

function isRequestCandidate(row) {
  return (
    seedCompanies.includes(row.company_name) ||
    oldSeedEvents.includes(row.event_name) ||
    isExampleEmail(row.email) ||
    isExampleEmail(row.contact_email_or_phone) ||
    hasObviousTempName(row.manager_name) ||
    text(row.event_location) === "집"
  );
}

function isApplicationCandidate(row, jobIds) {
  return (
    jobIds.has(String(row.job_id)) ||
    seedEmails.applicants.includes(text(row.email).toLowerCase()) ||
    isExampleEmail(row.email) ||
    isExampleEmail(row.applicant_contact) ||
    hasObviousTempName(row.applicant_name || row.name)
  );
}

function summarize(rows) {
  return rows.map((row) => ({
    id: row.id,
    label: rowLabel(row),
    email: row.email || row.contact_email_or_phone || null,
    status: row.status || null,
    linked_job_id: row.job_id || null,
    linked_request_id: row.request_id || null,
  }));
}

async function collectCandidates() {
  const interpreters = await listRows("interpreters");
  const jobs = await listRows("jobs");
  const requests = await listRows("requests");
  const jobApplications = await listRows("job_applications");
  const legacyApplications = await listRows("applications");
  const requestApplications = await listRows("request_applications");
  const requestInterpreters = await listRows("request_interpreters");

  const interpreterCandidates = interpreters.filter(isInterpreterCandidate);
  let jobCandidates = jobs.filter(isJobCandidate);
  let requestCandidates = requests.filter(isRequestCandidate);

  const jobIds = new Set(jobCandidates.map((row) => String(row.id)));
  const requestIds = new Set(requestCandidates.map((row) => String(row.id)));
  const interpreterIds = new Set(interpreterCandidates.map((row) => String(row.id)));

  requests.forEach((request) => {
    if (jobIds.has(String(request.job_id))) {
      requestCandidates.push(request);
      requestIds.add(String(request.id));
    }
  });

  jobs.forEach((job) => {
    if (requestCandidates.some((request) => String(request.job_id) === String(job.id))) {
      jobCandidates.push(job);
      jobIds.add(String(job.id));
    }
  });

  jobCandidates = uniqueById(jobCandidates);
  requestCandidates = uniqueById(requestCandidates);

  const jobApplicationCandidates = jobApplications.filter((row) =>
    isApplicationCandidate(row, jobIds)
  );
  const legacyApplicationCandidates = legacyApplications.filter((row) =>
    isApplicationCandidate(row, jobIds)
  );
  const requestApplicationCandidates = requestApplications.filter(
    (row) => requestIds.has(String(row.request_id)) || isApplicationCandidate(row, jobIds)
  );
  const requestInterpreterCandidates = requestInterpreters.filter(
    (row) =>
      requestIds.has(String(row.request_id)) ||
      interpreterIds.has(String(row.interpreter_id))
  );

  return {
    interpreters: interpreterCandidates,
    jobs: jobCandidates,
    requests: requestCandidates,
    job_applications: jobApplicationCandidates,
    applications: legacyApplicationCandidates,
    request_applications: requestApplicationCandidates,
    request_interpreters: requestInterpreterCandidates,
  };
}

function uniqueById(rows) {
  return [...new Map(rows.map((row) => [String(row.id), row])).values()];
}

async function deleteByIds(table, ids) {
  if (!ids.length) return;
  const { error } = await supabase.from(table).delete().in("id", ids);
  if (error) throw new Error(`${table} delete failed: ${error.message}`);
}

async function deleteCandidates(candidates) {
  await deleteByIds("job_applications", candidates.job_applications.map((row) => row.id));
  await deleteByIds("applications", candidates.applications.map((row) => row.id));
  await deleteByIds("request_applications", candidates.request_applications.map((row) => row.id));
  await deleteByIds("request_interpreters", candidates.request_interpreters.map((row) => row.id));
  await deleteByIds("requests", candidates.requests.map((row) => row.id));
  await deleteByIds("jobs", candidates.jobs.map((row) => row.id));
  await deleteByIds("interpreters", candidates.interpreters.map((row) => row.id));
}

const interpreterSeeds = [
  {
    key: "kimMinjun",
    name: "김민준",
    gender: "남성",
    region: "도쿄",
    email: "onli-seed-kim-minjun@example.invalid",
    phone: "080-1000-0001",
    jlpt: "N1",
    level: "Lv3",
    specialties: ["뷰티", "전시회"],
    available_regions: ["도쿄"],
    available_tasks: "K-뷰티 전시회 부스 통역, 제품 설명, 바이어 응대",
    experience_count: "8",
    has_experience: true,
    approved: true,
    status: "active",
  },
  {
    key: "parkSeoyeon",
    name: "박서연",
    gender: "여성",
    region: "치바",
    email: "onli-seed-park-seoyeon@example.invalid",
    phone: "080-1000-0002",
    jlpt: "N1",
    level: "Lv2",
    specialties: ["식품", "바이어 미팅"],
    available_regions: ["치바", "도쿄"],
    available_tasks: "식품 바이어 상담, 시식 행사, 구매 상담 통역",
    experience_count: "6",
    has_experience: true,
    approved: true,
    status: "active",
  },
  {
    key: "leeJihoon",
    name: "이지훈",
    gender: "남성",
    region: "요코하마",
    email: "onli-seed-lee-jihoon@example.invalid",
    phone: "080-1000-0003",
    jlpt: "비즈니스 상급",
    level: "Lv4",
    specialties: ["IT", "스타트업"],
    available_regions: ["요코하마", "도쿄"],
    available_tasks: "IT 스타트업 피칭, 투자 상담, SaaS 제품 설명",
    experience_count: "12",
    has_experience: true,
    approved: true,
    status: "active",
  },
  {
    key: "choiYuna",
    name: "최유나",
    gender: "여성",
    region: "도쿄",
    email: "onli-seed-choi-yuna@example.invalid",
    phone: "080-1000-0004",
    jlpt: "N1",
    level: "Lv2",
    specialties: ["패션", "팝업"],
    available_regions: ["도쿄", "사이타마"],
    available_tasks: "패션 팝업 행사, 브랜드 소개, 현장 고객 응대",
    experience_count: "7",
    has_experience: true,
    approved: true,
    status: "active",
  },
  {
    key: "jungHarin",
    name: "정하린",
    gender: "여성",
    region: "사이타마",
    email: "onli-seed-jung-harin@example.invalid",
    phone: "080-1000-0005",
    jlpt: "N1",
    level: "Lv3",
    specialties: ["의료기기", "상담회"],
    available_regions: ["사이타마", "요코하마"],
    available_tasks: "의료기기 상담회, 제품 데모 보조, B2B 상담 통역",
    experience_count: "4",
    has_experience: true,
    approved: false,
    status: "pending",
  },
];

const projectSeeds = [
  {
    key: "beauty",
    eventName: "K-뷰티 전시회 통역",
    companyName: "Seoul Beauty Lab",
    location: "도쿄 빅사이트",
    startDate: "2026-06-10",
    endDate: "2026-06-12",
    peopleCount: 2,
    level: "Lv3",
    jobStatus: "open",
    requestStatus: "매칭완료",
    matchingStatus: "matched",
    field: "뷰티/전시회",
    assignments: ["kimMinjun"],
    settlement: null,
  },
  {
    key: "food",
    eventName: "한국 식품 바이어 미팅",
    companyName: "Hansik Foods",
    location: "신주쿠",
    startDate: "2026-06-18",
    endDate: "2026-06-18",
    peopleCount: 2,
    level: "Lv2",
    jobStatus: "open",
    requestStatus: "pending",
    matchingStatus: "pending",
    field: "식품/바이어 미팅",
    assignments: [],
    settlement: null,
  },
  {
    key: "it",
    eventName: "IT 스타트업 피칭 데이",
    companyName: "NextCore Korea",
    location: "롯폰기",
    startDate: "2026-06-22",
    endDate: "2026-06-22",
    peopleCount: 1,
    level: "Lv4",
    jobStatus: "assigned",
    requestStatus: "배정완료",
    matchingStatus: "assigned",
    field: "IT/스타트업",
    assignments: ["leeJihoon"],
    settlement: {
      company_amount: 80000,
      interpreter_payment: 65000,
      platform_profit: 15000,
      payment_status: "paid",
      settlement_status: "unsettled",
    },
  },
  {
    key: "fashion",
    eventName: "K-패션 팝업 행사",
    companyName: "Mode Seoul",
    location: "하라주쿠",
    startDate: "2026-07-02",
    endDate: "2026-07-04",
    peopleCount: 3,
    level: "Lv2",
    jobStatus: "open",
    requestStatus: "매칭완료",
    matchingStatus: "matched",
    field: "패션/팝업",
    assignments: ["choiYuna", "parkSeoyeon"],
    settlement: {
      company_amount: 150000,
      interpreter_payment: 120000,
      platform_profit: 30000,
      payment_status: "unpaid",
      settlement_status: "unsettled",
    },
  },
  {
    key: "medical",
    eventName: "의료기기 상담회",
    companyName: "MediCore Korea",
    location: "요코하마",
    startDate: "2026-07-15",
    endDate: "2026-07-15",
    peopleCount: 1,
    level: "Lv3",
    jobStatus: "open",
    requestStatus: "pending",
    matchingStatus: "pending",
    field: "의료기기/상담회",
    assignments: [],
    settlement: null,
  },
];

const applicationSeeds = [
  { project: "beauty", interpreter: "kimMinjun", status: "매칭완료" },
  { project: "beauty", interpreter: "choiYuna", status: "지원완료" },
  { project: "food", interpreter: "parkSeoyeon", status: "지원완료" },
  { project: "food", interpreter: "jungHarin", status: "불합격" },
  { project: "it", interpreter: "leeJihoon", status: "매칭완료" },
  { project: "fashion", interpreter: "choiYuna", status: "매칭완료" },
  { project: "fashion", interpreter: "parkSeoyeon", status: "매칭완료" },
  { project: "fashion", interpreter: "leeJihoon", status: "보류" },
  { project: "medical", interpreter: "jungHarin", status: "지원완료" },
];

async function insertSeedData() {
  const interpreterByKey = {};

  for (const seed of interpreterSeeds) {
    const payload = { ...seed };
    delete payload.key;
    const { data, error } = await supabase
      .from("interpreters")
      .insert([payload])
      .select("*")
      .single();
    if (error) throw new Error(`interpreter insert failed: ${error.message}`);
    interpreterByKey[seed.key] = data;
  }

  const projectByKey = {};

  for (const project of projectSeeds) {
    const jobPayload = {
      title: `${project.eventName} 통역 모집`,
      event_name: project.eventName,
      company_name: project.companyName,
      location: project.location,
      event_location: project.location,
      date: formatDateRange(project.startDate, project.endDate),
      event_date: project.startDate,
      start_date: project.startDate,
      end_date: project.endDate,
      pay: "협의",
      language: "한국어 ↔ 일본어",
      level: project.level,
      requested_level: project.level,
      people: `${project.peopleCount}명`,
      people_count: project.peopleCount,
      field: project.field,
      preference: project.field,
      status: project.jobStatus,
      visibility: "public",
      is_urgent: false,
    };
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert([jobPayload])
      .select("*")
      .single();
    if (jobError) throw new Error(`job insert failed: ${jobError.message}`);

    const primaryInterpreter = project.assignments.length
      ? interpreterByKey[project.assignments[project.assignments.length - 1]]
      : null;
    const settlement = project.settlement || {
      company_amount: 0,
      interpreter_payment: 0,
      platform_profit: 0,
      payment_status: "unpaid",
      settlement_status: "unsettled",
    };
    const requestPayload = {
      job_id: job.id,
      is_public: true,
      is_job_public: true,
      company_name: project.companyName,
      manager_name: "ON-LI 테스트 담당자",
      contact_name: "ON-LI 테스트 담당자",
      email: `onli-request-${project.key}@example.invalid`,
      contact_email_or_phone: `onli-request-${project.key}@example.invalid`,
      phone: "080-2000-0000",
      event_name: project.eventName,
      event_date: project.startDate,
      start_date: project.startDate,
      end_date: project.endDate,
      event_location: project.location,
      requested_level: project.level,
      required_level: project.level,
      requested_people_count: project.peopleCount,
      required_count: project.peopleCount,
      interpretation_field: project.field,
      job_field: project.field,
      request_detail: `${project.eventName} 운영 확인용 테스트 의뢰입니다.`,
      request_details: `${project.eventName} 운영 확인용 테스트 의뢰입니다.`,
      job_description: `${project.eventName} 운영 확인용 테스트 의뢰입니다.`,
      dress_code: "비즈니스 캐주얼",
      status: project.requestStatus,
      matching_status: project.matchingStatus,
      contact_status: "not_contacted",
      payment_status: settlement.payment_status,
      settlement_status: settlement.settlement_status,
      company_amount: settlement.company_amount,
      interpreter_payment: settlement.interpreter_payment,
      platform_profit: settlement.platform_profit,
      client_price: settlement.company_amount,
      interpreter_price: settlement.interpreter_payment,
      profit: settlement.platform_profit,
      assigned_interpreter_id: primaryInterpreter?.id || null,
      assigned_interpreter_name: primaryInterpreter?.name || null,
      matched_interpreter_id: primaryInterpreter?.id || null,
      matched_interpreter_name: primaryInterpreter?.name || null,
    };
    const { data: request, error: requestError } = await supabase
      .from("requests")
      .insert([requestPayload])
      .select("*")
      .single();
    if (requestError) throw new Error(`request insert failed: ${requestError.message}`);

    projectByKey[project.key] = { ...project, job, request };
  }

  for (const seed of applicationSeeds) {
    const project = projectByKey[seed.project];
    const interpreter = interpreterByKey[seed.interpreter];
    const { error } = await supabase.from("job_applications").insert([
      {
        job_id: project.job.id,
        applicant_name: interpreter.name,
        phone: interpreter.phone,
        email: interpreter.email,
        message: `${project.eventName} 지원 테스트 데이터입니다.`,
        status: seed.status,
      },
    ]);
    if (error) throw new Error(`job_application insert failed: ${error.message}`);
  }

  for (const project of projectSeeds) {
    const seededProject = projectByKey[project.key];
    for (const interpreterKey of project.assignments) {
      const interpreter = interpreterByKey[interpreterKey];
      const { error } = await supabase.from("request_interpreters").insert([
        {
          request_id: seededProject.request.id,
          interpreter_id: interpreter.id,
        },
      ]);
      if (error) throw new Error(`request_interpreter insert failed: ${error.message}`);
    }
  }

  return {
    interpreters: Object.values(interpreterByKey).map((row) => ({ id: row.id, name: row.name })),
    jobs: Object.values(projectByKey).map(({ job }) => ({ id: job.id, event_name: job.event_name })),
    requests: Object.values(projectByKey).map(({ request }) => ({ id: request.id, event_name: request.event_name })),
  };
}

function formatDateRange(startDate, endDate) {
  return startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
}

const candidates = await collectCandidates();
const report = Object.fromEntries(
  Object.entries(candidates).map(([table, rows]) => [
    table,
    { count: rows.length, rows: summarize(rows) },
  ])
);

console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", delete_candidates: report }, null, 2));

if (!APPLY) {
  console.log("Dry-run only. Re-run with --apply to delete and insert seed data.");
  process.exit(0);
}

await deleteCandidates(candidates);
const inserted = await insertSeedData();
console.log(JSON.stringify({ inserted }, null, 2));
