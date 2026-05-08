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
const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY
);

const testInterpreters = [
  {
    name: "테스트 뷰티 통역사 A",
    gender: "여자",
    age: "26",
    region: "도쿄",
    email: "onli-test-beauty-a@example.invalid",
    phone: "000-0000-0001",
    school: "ON-LI 테스트 전공",
    kakao_or_line: "dummy_onli_beauty_a",
    jlpt: "N1",
    stay_period: "5년",
    experience_count: "18",
    specialties: ["뷰티", "전시회"],
    available_regions: ["도쿄", "가나가와", "치바"],
    available_tasks: "뷰티 전시회 상담 통역, 부스 응대, 제품 설명",
    approved: true,
    level: "Lv4",
    status: "active",
  },
  {
    name: "테스트 게임 통역사 B",
    gender: "남자",
    age: "28",
    region: "오사카",
    email: "onli-test-game-b@example.invalid",
    phone: "000-0000-0002",
    school: "ON-LI 테스트 전공",
    kakao_or_line: "dummy_onli_game_b",
    jlpt: "N1",
    stay_period: "6년",
    experience_count: "14",
    specialties: ["게임/콘텐츠", "전시회"],
    available_regions: ["오사카", "교토", "효고"],
    available_tasks: "게임 전시회 부스 통역, 콘텐츠 상담, 바이어 미팅",
    approved: true,
    level: "Lv3",
    status: "active",
  },
  {
    name: "테스트 F&B 통역사 C",
    gender: "여자",
    age: "25",
    region: "후쿠오카",
    email: "onli-test-fnb-c@example.invalid",
    phone: "000-0000-0003",
    school: "ON-LI 테스트 전공",
    kakao_or_line: "dummy_onli_fnb_c",
    jlpt: "N1",
    stay_period: "4년",
    experience_count: "10",
    specialties: ["F&B", "일반 비즈니스"],
    available_regions: ["후쿠오카", "기타"],
    available_tasks: "식품 상담회 통역, 제품 설명, 현장 응대",
    approved: true,
    level: "Lv3",
    status: "active",
  },
  {
    name: "테스트 패션 통역사 D",
    gender: "여자",
    age: "27",
    region: "도쿄",
    email: "onli-test-fashion-d@example.invalid",
    phone: "000-0000-0004",
    school: "ON-LI 테스트 전공",
    kakao_or_line: "dummy_onli_fashion_d",
    jlpt: "N2",
    stay_period: "3년",
    experience_count: "8",
    specialties: ["패션", "전시회"],
    available_regions: ["도쿄", "사이타마"],
    available_tasks: "패션 전시회 응대, 브랜드 소개, 상담 통역",
    approved: true,
    level: "Lv2",
    status: "active",
  },
  {
    name: "테스트 스타트업 통역사 E",
    gender: "남자",
    age: "30",
    region: "나고야",
    email: "onli-test-startup-e@example.invalid",
    phone: "000-0000-0005",
    school: "ON-LI 테스트 전공",
    kakao_or_line: "dummy_onli_startup_e",
    jlpt: "N1",
    stay_period: "7년",
    experience_count: "22",
    specialties: ["스타트업", "일반 비즈니스"],
    available_regions: ["나고야", "도쿄", "오사카"],
    available_tasks: "비즈니스 미팅, IR 피칭, 파트너 상담",
    approved: true,
    level: "Lv4",
    status: "active",
  },
  {
    name: "테스트 관광 통역사 F",
    gender: "여자",
    age: "24",
    region: "교토",
    email: "onli-test-tour-f@example.invalid",
    phone: "000-0000-0006",
    school: "ON-LI 테스트 전공",
    kakao_or_line: "dummy_onli_tour_f",
    jlpt: "N2",
    stay_period: "2년",
    experience_count: "6",
    specialties: ["관광", "일반 비즈니스"],
    available_regions: ["교토", "오사카", "효고"],
    available_tasks: "관광 동행 통역, 현장 안내, 일정 커뮤니케이션",
    approved: true,
    level: "Lv2",
    status: "active",
  },
  {
    name: "테스트 전시회 통역사 G",
    gender: "남자",
    age: "29",
    region: "가나가와",
    email: "onli-test-expo-g@example.invalid",
    phone: "000-0000-0007",
    school: "ON-LI 테스트 전공",
    kakao_or_line: "dummy_onli_expo_g",
    jlpt: "N1",
    stay_period: "5년",
    experience_count: "16",
    specialties: ["전시회", "일반 비즈니스"],
    available_regions: ["도쿄", "가나가와", "치바"],
    available_tasks: "전시회 운영, 부스 응대, 바이어 상담",
    approved: true,
    level: "Lv3",
    status: "active",
  },
  {
    name: "테스트 콘텐츠 통역사 H",
    gender: "여자",
    age: "26",
    region: "치바",
    email: "onli-test-content-h@example.invalid",
    phone: "000-0000-0008",
    school: "ON-LI 테스트 전공",
    kakao_or_line: "dummy_onli_content_h",
    jlpt: "N2",
    stay_period: "3년",
    experience_count: "7",
    specialties: ["게임/콘텐츠", "스타트업"],
    available_regions: ["도쿄", "치바", "사이타마"],
    available_tasks: "콘텐츠 상담, 스타트업 미팅, 제품 설명",
    approved: true,
    level: "Lv2",
    status: "active",
  },
  {
    name: "테스트 비즈니스 통역사 I",
    gender: "남자",
    age: "31",
    region: "사이타마",
    email: "onli-test-business-i@example.invalid",
    phone: "000-0000-0009",
    school: "ON-LI 테스트 전공",
    kakao_or_line: "dummy_onli_business_i",
    jlpt: "N1",
    stay_period: "8년",
    experience_count: "25",
    specialties: ["일반 비즈니스", "스타트업"],
    available_regions: ["도쿄", "사이타마", "가나가와"],
    available_tasks: "임원 미팅, 계약 상담, 사업 제휴 논의",
    approved: true,
    level: "Lv4",
    status: "active",
  },
  {
    name: "테스트 입문 통역사 J",
    gender: "여자",
    age: "23",
    region: "효고",
    email: "onli-test-junior-j@example.invalid",
    phone: "000-0000-0010",
    school: "ON-LI 테스트 전공",
    kakao_or_line: "dummy_onli_junior_j",
    jlpt: "N2",
    stay_period: "2년",
    experience_count: "3",
    specialties: ["전시회", "관광"],
    available_regions: ["오사카", "교토", "효고"],
    available_tasks: "현장 안내, 부스 응대, 기본 상담 통역",
    approved: true,
    level: "Lv1",
    status: "active",
  },
];

const emails = testInterpreters.map((item) => item.email);
const { data: existingRows, error: selectError } = await supabase
  .from("interpreters")
  .select("id,email")
  .in("email", emails);

if (selectError) {
  throw selectError;
}

const existingByEmail = new Map(
  (existingRows || []).map((row) => [row.email, row.id])
);

let inserted = 0;
let updated = 0;

for (const interpreter of testInterpreters) {
  const existingId = existingByEmail.get(interpreter.email);

  if (existingId) {
    const { error } = await supabase
      .from("interpreters")
      .update(interpreter)
      .eq("id", existingId);

    if (error) throw error;
    updated += 1;
  } else {
    const { error } = await supabase.from("interpreters").insert([interpreter]);

    if (error) throw error;
    inserted += 1;
  }
}

console.log(
  JSON.stringify(
    {
      total: testInterpreters.length,
      inserted,
      updated,
      emails,
    },
    null,
    2
  )
);
