import { useEffect, useState } from "react";
import {
  Info,
  UserPlus,
  Award,
  Briefcase,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  CreditCard,
  Scale,
  UserX,
  Lock,
  HelpCircle,
  FileText,
  Target,
  Clock,
  Share2,
  Settings,
  Trash2,
  Cookie,
  Bell,
  Mail,
  User,
  Shield,
  Activity,
  ArrowLeft
} from "lucide-react";
import "./PolicyPage.css";

const LAST_UPDATED = "2026.05.15";

const ICON_MAP = {
  info: Info,
  userPlus: UserPlus,
  award: Award,
  briefcase: Briefcase,
  checkCircle: CheckCircle,
  alertTriangle: AlertTriangle,
  shieldAlert: ShieldAlert,
  creditCard: CreditCard,
  scale: Scale,
  userX: UserX,
  lock: Lock,
  helpCircle: HelpCircle,
  fileText: FileText,
  target: Target,
  clock: Clock,
  share2: Share2,
  settings: Settings,
  trash2: Trash2,
  cookie: Cookie,
  bell: Bell,
  mail: Mail,
  user: User,
  shield: Shield,
  activity: Activity,
  arrowLeft: ArrowLeft
};

export const POLICY_PAGES = {
  commonTerms: {
    path: "/terms/common",
    title: "공통 이용약관",
    lead: "ON-LI 서비스 이용 시 기업과 통역사 모두에게 공통으로 적용되는 기본 약관입니다.",
    sections: [
      {
        iconName: "info",
        title: "제1조 (서비스의 목적)",
        items: [
          "ON-LI는 한국 기업과 일본 현장에서 활동하는 통역 인력을 연결하는 한일 비즈니스 통역 매칭 플랫폼입니다.",
          "ON-LI는 이용자가 통역 의뢰, 통역 지원, 조건 확인 및 매칭을 원활하게 진행할 수 있도록 온라인 시스템, 정보 제공, 연락 지원, 일정 관리 및 정산 지원 서비스를 제공합니다."
        ],
      },
      {
        iconName: "briefcase",
        title: "제2조 (ON-LI의 지위)",
        items: [
          "ON-LI는 통역 매칭 및 운영 지원 서비스를 제공하는 플랫폼 운영자이며, 통역 업무의 직접 수행자, 이용자의 고용주 또는 근로자 파견 사업자가 아닙니다.",
          "통역 업무는 의뢰 기업과 통역사 간 확인된 조건 및 현장 상황에 따라 수행되며, ON-LI는 매칭 과정과 원활한 운영 지원을 담당합니다.",
          "단, ON-LI가 별도 계약을 통해 직접 관리 업무를 수행하는 경우 해당 계약 범위 내에서 책임을 부담합니다."
        ],
      },
      {
        iconName: "user",
        title: "제3조 (회원의 기본 의무)",
        items: [
          "회원은 ON-LI 이용 시 정확하고 사실에 기반한 정보를 제공해야 합니다.",
          "회원은 다음 행위를 해서는 안 됩니다.",
          "1. 허위 정보 등록",
          "2. 타인의 정보 무단 사용",
          "3. 서비스 운영 방해 행위",
          "4. 매칭 완료 후 ON-LI를 거치지 않은 무단 직접 거래",
          "5. 법령 또는 사회질서에 위반되는 행위"
        ],
      },
      {
        iconName: "scale",
        title: "제4조 (책임 범위 및 제한)",
        items: [
          "ON-LI는 다음 범위에서 서비스 운영 책임을 부담합니다.",
          "1. 플랫폼 시스템 제공",
          "2. 등록 정보 관리",
          "3. 매칭 절차 지원",
          "4. 사전 전달받은 조건 및 일정 정보 안내",
          "5. 정산 절차 지원",
          "다만 다음 사유로 발생한 손해 또는 분쟁에 대해서는 ON-LI가 책임을 부담하지 않습니다.",
          "1. 회원이 제공한 허위 또는 부정확한 정보",
          "2. 기업과 통역사 간 사전 협의 없이 변경된 현장 조건",
          "3. 통역사의 고의 또는 과실에 따른 업무 문제",
          "4. 기업의 부당한 현장 요구 또는 지시",
          "5. ON-LI를 통하지 않은 직접 연락 및 거래",
          "6. 노쇼, 지각, 계약 외 업무 요구 등 당사자 귀책 사유",
          "7. 천재지변 등 불가항력적인 사유"
        ],
      },
      {
        iconName: "helpCircle",
        title: "제5조 (분쟁 발생 시 ON-LI의 역할)",
        items: [
          "서비스 이용 과정에서 기업과 통역사 간 문제가 발생한 경우 ON-LI는 원활한 해결을 위해 사실 확인 및 조율을 지원할 수 있습니다.",
          "다만 ON-LI의 조율 지원은 법적 책임 인정 또는 손해 배상 보증을 의미하지 않습니다.",
          "분쟁에 대한 최종 책임은 원칙적으로 귀책 사유가 있는 당사자가 부담합니다."
        ],
      },
      {
        iconName: "creditCard",
        title: "제6조 (플랫폼 이용 수수료 및 정산)",
        items: [
          "ON-LI는 기업과 통역사 간의 원활한 매칭, 업무 조율, 플랫폼 운영, 정산 관리 등을 위해 플랫폼 이용 수수료를 수취할 수 있습니다.",
          "기업이 ON-LI에 지급한 통역 서비스 이용 대금 중 ON-LI의 플랫폼 이용 수수료 및 정산 관리 비용을 제외한 금액은 통역사에게 정산됩니다.",
          "ON-LI의 수수료율, 정산 방식, 지급 시기 등은 서비스 화면, 개별 안내 또는 별도 합의에 따라 정할 수 있습니다."
        ],
      },
    ],
  },
  privacy: {
    path: "/privacy",
    title: "개인정보처리방침",
    lead: "ON-LI는 회원 가입, 통역사 등록, 기업 문의, 매칭 진행, 정산 처리를 위해 필요한 개인정보를 수집할 수 있습니다.",
    sections: [
      {
        iconName: "user",
        title: "제1조 (수집하는 개인정보)",
        items: [
          "ON-LI는 회원 가입, 통역사 등록, 기업 문의, 매칭 진행, 정산 처리를 위해 필요한 개인정보를 수집할 수 있습니다.",
          "수집 항목 예시:",
          "- 이름",
          "- 연락처",
          "- 이메일",
          "- 소속 또는 회사명",
          "- 언어 능력",
          "- 통역 경력",
          "- 계좌 정보",
          "- 업무 가능 일정",
          "- 이력서"
        ],
      },
      {
        iconName: "target",
        title: "제2조 (개인정보 이용 목적)",
        items: [
          "수집한 개인정보는 다음 목적을 위해 이용됩니다.",
          "- 회원 식별 및 계정 관리",
          "- 기업과 통역사 간 매칭",
          "- 업무 연락 및 일정 조율",
          "- 통역사 경력 확인",
          "- 정산 및 세무 처리",
          "- 분쟁 발생 시 사실관계 확인",
          "- 서비스 개선 및 공지 전달"
        ],
      },
      {
        iconName: "share2",
        title: "제3조 (개인정보 제3자 제공)",
        items: [
          "ON-LI는 매칭 진행을 위해 필요한 범위 내에서 기업에게 통역사의 프로필, 경력, 언어 능력, 연락 정보 등을 제공할 수 있습니다.",
          "단, 서비스 제공에 필요한 범위를 초과하여 개인정보를 외부에 제공하지 않습니다."
        ],
      },
      {
        iconName: "clock",
        title: "제4조 (개인정보 보관 및 이용 기간)",
        items: [
          "ON-LI는 서비스 제공 및 분쟁 대응, 정산, 법령상 보관 의무를 위해 필요한 기간 동안 개인정보를 보관할 수 있습니다.",
          "회원 탈퇴 또는 삭제 요청이 있는 경우, 관련 법령상 보관이 필요한 정보를 제외하고 지체 없이 삭제합니다."
        ],
      },
      {
        iconName: "shield",
        title: "제5조 (개인정보의 안전 관리)",
        items: [
          "ON-LI는 개인정보가 분실, 도난, 유출, 변조 또는 훼손되지 않도록 합리적인 보호 조치를 취합니다.",
          "관리자 접근 제한, 데이터 접근 권한 관리, 서비스 보안 설정 등을 통해 개인정보 보호를 위해 노력합니다."
        ],
      },
      {
        iconName: "settings",
        title: "제6조 (개인정보 처리 위탁)",
        items: [
          "ON-LI는 서비스 운영을 위해 필요한 경우 클라우드 서버, 데이터베이스, 이메일 발송, 결제 및 정산 관련 외부 서비스를 이용할 수 있습니다.",
          "이 경우 필요한 범위 내에서만 개인정보가 처리되도록 관리합니다."
        ],
      },
      {
        iconName: "userPlus",
        title: "제7조 (이용자의 권리)",
        items: [
          "이용자는 본인의 개인정보에 대해 열람, 수정, 삭제, 처리 정지를 요청할 수 있습니다.",
          "요청은 ON-LI 운영자 이메일 또는 문의 채널을 통해 접수할 수 있습니다."
        ],
      },
      {
        iconName: "mail",
        title: "제8조 (문의)",
        items: [
          "개인정보 처리와 관련한 문의는 ON-LI 운영자에게 연락할 수 있습니다.",
          "이메일:",
          "onlinkwith@gmail.com"
        ],
      },
    ],
  },
  terms: {
    path: "/terms",
    title: "이용약관",
    lead: "본 약관은 ON-LI가 제공하는 한일 B2B 비즈니스 통역 매칭 서비스 이용과 관련한 기본 기준 및 준수 의무를 정합니다.",
    sections: [
      {
        iconName: "info",
        title: "1. 서비스 소개",
        items: [
          "ON-LI는 한국 기업과 일본 현장 통역사를 효율적으로 매칭하는 <strong>한일 B2B 비즈니스 통역 매칭 플랫폼</strong>입니다.",
          "서비스는 단순 텍스트 번역을 넘어, 전시회·비즈니스 미팅·현장 기술 통역 등 실무 역량이 입증된 전문 통역 파트너 연결을 목표로 합니다.",
          "제공 서비스에는 기업 전용 의뢰 등록, 통역사 프로필 분석, 매칭 알림 서비스, 정산 대행 및 사후 업무 관리 툴이 포함됩니다."
        ],
      },
      {
        iconName: "userPlus",
        title: "2. 회원 가입 및 계정",
        items: [
          "이용자는 회사가 정한 양식에 맞춰 성실히 정보를 기재하고 약관에 동의함으로써 정식 서비스 회원으로 등록됩니다.",
          "회원은 항상 실명으로 정확한 계정 정보를 기재해야 하며, 변경 사항이 있을 시 즉각적인 정보 갱신 의무를 집니다.",
          "계정 보안에 대한 일차적인 책임은 회원 본인에게 있으며, <strong>아이디 및 비밀번호 분실/도용</strong> 등 사고 발생 시 즉각 고객지원 센터로 자발적 통보를 진행해야 합니다."
        ],
      },
      {
        iconName: "award",
        title: "3. 통역사 등록 기준",
        items: [
          "통역사 회원으로 활동하려는 자는 본인의 외국어 유창성, 학력, 현장 통역 이력 등을 입증하는 객관적 자료를 제출해야 합니다.",
          "ON-LI는 내부 서류 심사 및 비대면 인터뷰를 수행하여 통역사 등급(Lv1 ~ Lv4)을 엄격히 평정하고 활동을 승인합니다.",
          "<strong>경력 위조, 허위 프로필 작성 등 부정한 등록 시 통역사 자격이 즉각 영구 박탈</strong>되며, 이에 따른 법적 민형사상 책임을 부담할 수 있습니다."
        ],
      },
      {
        iconName: "briefcase",
        title: "4. 기업 의뢰 정책",
        items: [
          "기업 회원은 통역이 필요한 행사의 세부 가이드라인 (날짜, 상세 장소, 비즈니스 전문 도메인 지식 등)을 신뢰할 수 있게 명시해야 합니다.",
          "등록된 통역 공고는 통역사들의 적합성 매칭 용도로만 활용되어야 하며, 허위 의뢰 글이나 음란/불법/광고성 등록은 차단 조치됩니다.",
          "사전에 명시되지 않은 업무 조건 급변 시 매칭 가능성 및 금액 산정이 재협의될 수 있습니다."
        ],
      },
      {
        iconName: "checkCircle",
        title: "5. 매칭 및 배정",
        items: [
          "ON-LI 플랫폼 및 에이전트는 알고리즘을 기반으로 의뢰에 최고 효율을 낼 수 있는 엄선된 통역사를 선제 제안합니다.",
          "상호 의사 수락을 통해 매칭 및 배정이 최종 확정되며, <strong>확정된 일시는 양 당사자 모두에게 계약상의 성실 의무</strong>를 부여합니다.",
          "성공적인 통역을 위해 기업은 필요 최소한의 카탈로그, 비즈니스 매뉴얼 등 사전 가이드 자료를 약정된 기한 내 전달해야 합니다."
        ],
      },
      {
        iconName: "alertTriangle",
        title: "6. 취소 및 노쇼 정책",
        items: [
          "<strong>배정이 완료된 통역사는 정당한 사유나 상호 협의 없이 무단으로 취소하거나 불참(노쇼)할 수 없습니다.</strong>",
          "<strong>일방적인 당일 취소 또는 불가피하지 않은 일방 취소 1회 발생 시 즉시 계정이 정지</strong>되며, 누적 경고에 따라 서비스에서 영구 퇴출될 수 있습니다.",
          "기업 회원 역시 최종 배정 완료 후 취소 시점에 따라 소정의 매칭 취소 수수료가 청구되며, 세부 사항은 [취소/환불 규정]에 부합하여 엄정 대처합니다."
        ],
      },
      {
        iconName: "shieldAlert",
        title: "7. 직접 거래 금지",
        items: [
          "<strong>기업과 통역사는 ON-LI 플랫폼을 우회하여 직접 개별 계약, 스카우트 또는 무단 사적 계약을 성립시켜서는 안 됩니다.</strong>",
          "<strong>직접 우회 거래가 적발될 시 양측 모두 즉각 이용 약관에 따라 회원 자격이 영구 박탈</strong>되며, 위약벌 성격의 민형사상 상당한 위약 수수료 배상 책임이 연대 부과됩니다.",
          "ON-LI 플랫폼의 안정적 거래 질서와 건전한 매칭 환경 유지를 위해 직거래 제안 시 적극적으로 신고해야 합니다."
        ],
      },
      {
        iconName: "creditCard",
        title: "8. 정산 및 비용",
        items: [
          "매칭 서비스 이용에 따른 최종 거래 요금 및 플랫폼 매칭 수수료는 사전 서면 승인된 기준 및 합의 내용을 준수합니다.",
          "통역사 회원의 급여 및 비용 정산은 <strong>업무 마감 및 최종 평가 완료 이후 약정된 정산 영업일 내에 지급함을 원칙</strong>으로 삼습니다.",
          "각종 세금의 공제 의무(원천징수 등) 및 법인 카드/세금계산서 발급 업무는 정산 모듈을 통해 합법적이고 투명하게 수행됩니다."
        ],
      },
      {
        iconName: "scale",
        title: "9. 책임 제한",
        items: [
          "<strong>ON-LI는 통역사와 기업 간의 거래를 연계하는 매칭 플랫폼으로서, 불가항력적 상황(천재지변, 지진, 태풍, 항공편 결항, 질병 등)으로 발생한 피해에 대해 법률이 허용하는 한도 내에서 책임을 제한합니다.</strong>",
          "단, 회사 운영팀은 예기치 못한 비상 상황 시 상호 중재, 원활한 대체 인력 수급 대응 등 플랫폼으로서의 신의성실에 입각한 운영적 대처 노력을 최우선 지원합니다."
        ],
      },
      {
        iconName: "userX",
        title: "10. 계정 제한 및 해지",
        items: [
          "회원이 본 약관의 핵심 조항 위반, 우회 계약 의혹, 상호 평판 훼손, 불성실한 현장 근무 등을 반복할 경우 운영팀은 자발적인 계정 비활성화 처리를 단행할 수 있습니다.",
          "탈퇴 신청은 현재 수행 중인 통역 업무 일정 및 미지급 대금 정산 등이 완전히 마무리된 종결 시점에서만 승인됩니다."
        ],
      },
      {
        iconName: "lock",
        title: "11. 개인정보 보호",
        items: [
          "회사는 회원의 프라이버시를 절대적 가치로 존중하며, 수집된 모든 데이터의 보관, 위탁, 활용 방법은 별도로 공시된 [개인정보처리방침]을 따릅니다.",
          "매칭을 위해 공유되는 통역사와 기업의 비즈니스 목적 범위 내 최소한의 필수 데이터를 제외하고, 제3자에 대한 무단 데이터 유출을 방지하기 위한 암호화 기반 보안 솔루션을 가동합니다."
        ],
      },
      {
        iconName: "helpCircle",
        title: "12. 문의 및 운영 정책",
        items: [
          "본 약관의 준거법은 대한민국 법률에 따르며, 서비스 이용과 관련된 일체의 소송은 관할 법령상 합의된 관할 법원을 통해 해결합니다.",
          "약관에 명시되지 않은 기타 세부 규칙들은 별도 공지사항으로 게시하거나 표준 관례를 따릅니다.",
          "• 운영 공식 문의 채널: <strong>contact@on-li.jp</strong>"
        ],
      },
    ],
  },
  interpreterPolicy: {
    path: "/interpreter-policy",
    title: "통역사 활동 약관",
    lead: "",
    sections: [
      {
        iconName: "info",
        title: "제1조 (통역사의 독립적 지위)",
        items: [
          "통역사는 ON-LI의 직원이 아니라, ON-LI 플랫폼을 통해 기업과 매칭되는 독립적인 업무 수행자입니다.",
          "통역사는 본인의 경력, 언어 능력, 업무 수행 가능 여부를 사실에 근거하여 등록하여야 하며, 실제 현장에서의 업무 수행과 태도에 대해 스스로 책임을 부담합니다."
        ],
      },
      {
        iconName: "alertTriangle",
        title: "제2조 (노쇼 및 무단 결근 금지)",
        items: [
          "통역사는 확정 배정된 일정에 대해 사전 합의된 시간과 장소에 출근하여야 합니다.",
          "사전 연락 없이 현장에 출근하지 않거나, 근무 시작 전까지 정당한 사유를 통보하지 않은 경우, 이를 노쇼 또는 무단 결근으로 간주합니다.",
          "노쇼가 발생한 경우 해당 업무 보수는 지급되지 않으며, 대체 인력 섭외 비용, 기업 또는 ON-LI에 발생한 손해에 대해 책임을 부담할 수 있습니다.",
          "ON-LI는 노쇼 발생 통역사에 대해 매칭 제한, 계정 이용 제한 또는 영구 정지 조치를 취할 수 있습니다."
        ],
      },
      {
        iconName: "clock",
        title: "제3조 (지각 및 조기 이탈)",
        items: [
          "통역사는 근무 시작 시간을 준수하여야 하며, 지각이 예상되는 경우 즉시 ON-LI 또는 기업 측에 연락하여야 합니다.",
          "정당한 사유 없이 지각하거나 사전 승인 없이 현장을 이탈하는 경우, 실제 근무 시간에 따라 보수가 조정될 수 있으며, 향후 매칭 제한의 대상이 될 수 있습니다."
        ],
      },
      {
        iconName: "shieldAlert",
        title: "제4조 (질병·사고·천재지변)",
        items: [
          "질병, 사고, 천재지변, 교통 장애 등 불가피한 사유로 업무 수행이 어려운 경우, 통역사는 즉시 ON-LI와 기업 측에 통보하여야 합니다.",
          "필요 시 진단서, 진료 확인서, 교통 지연 증명서 등 관련 증빙 자료를 제출하여야 합니다."
        ],
      },
      {
        iconName: "shieldAlert",
        title: "제5조 (허위 경력 및 허위 정보 금지)",
        items: [
          "통역사는 언어 능력, 통역 경력, 업무 경험, 체류 자격, 연락처 등과 관련하여 허위 정보를 제공해서는 안 됩니다.",
          "허위 정보가 확인된 경우 매칭 취소, 보수 지급 제한, 계정 이용 제한 또는 영구 정지 조치가 이루어질 수 있습니다."
        ],
      },
      {
        iconName: "user",
        title: "제6조 (현장 전문 태도)",
        items: [
          "통역사는 기업의 비즈니스 파트너로서 적절한 태도와 기본적인 비즈니스 매너를 유지하여야 합니다.",
          "무단 자리 이탈, 불성실한 태도, 무례한 언행, 과도한 휴대전화 사용, 음주 상태 출근, 기업 이미지 훼손 행위는 금지됩니다."
        ],
      },
      {
        iconName: "lock",
        title: "제7조 (기밀 유지)",
        items: [
          "통역사는 업무 중 알게 된 기업의 영업 정보, 제품 정보, 상담 내용, 거래 조건, 고객 정보 등을 제3자에게 누설해서는 안 됩니다.",
          "업무 종료 후에도 비밀 유지 의무는 계속 적용됩니다."
        ],
      },
      {
        iconName: "shieldAlert",
        title: "제8조 (직접 거래 및 우회 계약 금지)",
        items: [
          "통역사는 ON-LI를 통해 알게 된 기업과 ON-LI의 사전 승인 없이 직접 계약하거나 별도 업무를 수주해서는 안 됩니다.",
          "우회거래로 발생한 문제에 대해 ON-LI는 책임을 지지 않으며, 해당 통역사는 매칭 제한 또는 계정 정지 조치를 받을 수 있습니다."
        ],
      },
      {
        iconName: "creditCard",
        title: "제9조 (정산 기준)",
        items: [
          "통역사의 보수는 사전에 합의된 근무 시간, 업무 내용, 통역사 레벨, 계약 조건에 따라 정산됩니다.",
          "노쇼, 무단 결근, 조기 이탈, 허위 정보 제공, 통역사의 귀책 사유로 인한 손해 발생 시 보수가 조정되거나 지급이 제한될 수 있습니다.",
          "통역사는 ON-LI 플랫폼을 통해 매칭된 업무에 대해 사전에 안내된 기준에 따라 정산을 받을 수 있습니다.",
          "통역사에게 지급되는 정산 금액은 기업이 ON-LI에 지급한 이용 대금에서 플랫폼 이용 수수료 및 정산 관리 비용을 제외한 금액으로 합니다.",
          "ON-LI가 통역사에게 정산금을 지급하는 행위는 플랫폼 이용에 따른 정산 대행이며, 이를 이유로 ON-LI와 통역사 사이에 근로계약, 고용관계 또는 파견관계가 성립하는 것은 아닙니다."
        ],
      },
    ],
  },
  clientPolicy: {
    path: "/client-policy",
    title: "기업 의뢰 약관",
    lead: "기업 의뢰는 정확한 비즈니스 요건의 정립과 최상의 비즈니스 환경 조성을 통해 고도화된 매칭 시너지를 냅니다.",
    sections: [
      {
        iconName: "checkCircle",
        title: "1. 의뢰 확정 기준",
        items: [
          "행사의 정확한 성격(일정, 요구 언어, 비즈니스 미팅 성향 등)이 완비되고 플랫폼의 심사 매뉴얼을 통과해야 배정이 시작됩니다."
        ],
      },
      {
        iconName: "alertTriangle",
        title: "2. 취소 위약금 기준",
        items: [
          "배정 이후 기업 사정에 의한 즉시 매칭 캔슬 시, 확보된 통역사의 기회비용 전보를 위하여 기간별(D-7 이하 등) 위약금 분담 의무가 부과됩니다."
        ],
      },
      {
        iconName: "clock",
        title: "3. 연장 근무 조항",
        items: [
          "사전에 기재된 계약 시간 이외의 현장 연장 요구는 반드시 현장 통역사 수락과 소정의 추가 수수료 수락이 수반되어야 합니다."
        ],
      },
      {
        iconName: "info",
        title: "4. 안전한 근무 환경",
        items: [
          "의뢰 기업은 비즈니스 파트너로서 적합한 기본 작업 여건(휴게 시간 확보, 기본 식수 지급 등)을 성실히 협력해야 합니다."
        ],
      },
      {
        iconName: "creditCard",
        title: "5. 지급 보장 및 결제",
        items: [
          "비용 결제는 사전 조율된 입금 시기(선납 등)를 준용하며, 위반 시 매칭 중단이나 업무 취소 조치가 단행될 수 있습니다."
        ],
      },
      {
        iconName: "creditCard",
        title: "6. 이용 대금 및 정산 구조",
        items: [
          "기업은 ON-LI 플랫폼을 통해 확정된 통역 업무에 대해 사전에 안내된 이용 대금을 ON-LI에 지급합니다.",
          "해당 이용 대금에는 통역사 정산 금액, 플랫폼 이용 수수료, 매칭 관리 비용, 정산 관리 비용 등이 포함될 수 있습니다.",
          "기업은 ON-LI가 통역사에게 정산을 대행하는 구조임을 이해하며, ON-LI가 통역 업무의 직접 수행자 또는 고용주가 아님에 동의합니다."
        ],
      },
    ],
  },
  refundPolicy: {
    path: "/refund-policy",
    title: "취소/환불 규정",
    lead: "취소와 환불은 기업과 통역사 파트너 모두에게 공평하고 예측 가능한 상호 분쟁 예방 기준을 제시합니다.",
    sections: [
      {
        iconName: "info",
        title: "1. 기본 환불 원칙",
        items: [
          "매칭 매니저의 확인 및 확정 상태 이전에 기업에 의한 단순 캔슬 시 취소 수수료 없이 원금 100% 반환 처리됩니다."
        ],
      },
      {
        iconName: "alertTriangle",
        title: "2. 확정 후 D-7 이내 캔슬",
        items: [
          "행사 일시 7일 이내 시점에 취소 통보 시, 이미 일정을 전용 확보한 통역사 보상을 위해 비용의 일부가 취소 수수료로 격리 지불됩니다."
        ],
      },
      {
        iconName: "shieldAlert",
        title: "3. 당일 취소 및 불참",
        items: [
          "행사 당일 및 개시 임박 취소 시, 원금 환불이 사실상 불가하며 기 확보된 리소스는 전액 소멸 처리됨을 원칙으로 규정합니다."
        ],
      },
      {
        iconName: "checkCircle",
        title: "4. 면책성 사유 반환",
        items: [
          "기상 당국의 태풍 경보, 전면적인 항공 봉쇄 등 객관적이고 명확한 천재지변 성격의 불가항력 취소 시 입증 서류 제출을 통해 수수료 예외 반환을 중재합니다."
        ],
      },
    ],
  },
  disclaimer: {
    path: "/disclaimer",
    title: "면책 조항",
    lead: "ON-LI는 안정적이고 원활한 서비스를 약속드리나, 통제 범위를 벗어난 영역에 대해 책임을 명확히 안내합니다.",
    sections: [
      {
        iconName: "alertTriangle",
        title: "1. 외부 통신 인프라 장애",
        items: [
          "서버 호스팅 업체의 물리적 광랜 침하, 해외 유무선 기간망 마비 등으로 빚어진 플랫폼 접근 불능 지연 피해에 대하여 회사는 면책됩니다."
        ],
      },
      {
        iconName: "info",
        title: "2. 천재지변 및 공권력",
        items: [
          "정부의 방역 셧다운 지침, 국경 봉쇄 명령, 전쟁 등 긴급 비상사태 하에 성사되지 못한 의뢰 손실은 면책 범위에 해당합니다."
        ],
      },
      {
        iconName: "settings",
        title: "3. 타사 모듈의 일시 마비",
        items: [
          "PG사(결제대행), 제3자 카카오 알림톡 전송망 등 전문 제휴사 단독 서버의 고장으로 빚어진 정산 및 정보 전송 장애는 타사 면책권에 상응 준용합니다."
        ],
      },
      {
        iconName: "briefcase",
        title: "4. 계약 미기재 현장 리스크",
        items: [
          "상호 계약 문서에 고지하지 않았던 위법 현장 위험, 현지의 유독 물질 도포, 통역 과정에서의 돌발적인 신체 위협 등 사전 비공개 변수에 따라 발생한 결과는 회사 연대 책임에서 제외됩니다."
        ],
      },
    ],
  },
  antiPoaching: {
    path: "/anti-poaching",
    title: "통역사 스카우트 금지 조항",
    lead: "매칭 신뢰성 보존과 공정 거래 규범을 위해 우회 직거래 및 비윤리적인 인재 스카우트를 차단합니다.",
    sections: [
      {
        iconName: "shieldAlert",
        title: "1. 우회 통로 이용 금지",
        items: [
          "의뢰 계약과 무관하게 플랫폼 안에서 취득한 개인 메신저 연락처를 활용해 당사자끼리 비밀 결제하고 의무 수수료를 탈루하는 행위를 엄격히 금지합니다."
        ],
      },
      {
        iconName: "userX",
        title: "2. 직접 영입의 요건",
        items: [
          "플랫폼 매칭으로 파견된 통역사를 기업의 정규/파트타임 임직원으로 직접 영입 및 독점 채용하는 경우, 사전에 회사 채널과 서면으로 수수료 합의를 득해야 합니다."
        ],
      },
      {
        iconName: "alertTriangle",
        title: "3. 위반자 조치 사항",
        items: [
          "우회 및 임의 스카우트 사실 도출 시, 양 회원의 프로필은 사전 경고 없이 즉각 제재 및 비활성 처리되며 위반 정도에 의거 수수료 배상 소송이 제기될 수 있습니다."
        ],
      },
    ],
  },
};

function PolicyPage({ policyKey, onNavigate }) {
  const policy = POLICY_PAGES[policyKey] || POLICY_PAGES.terms;
  const [activeSectionId, setActiveSectionId] = useState("");

  useEffect(() => {
    const handleScroll = () => {
      const sections = document.querySelectorAll(".policy-section");
      let currentActiveId = "";
      const scrollPosition = window.scrollY + 160;

      sections.forEach((section) => {
        const top = section.offsetTop;
        const height = section.offsetHeight;
        if (scrollPosition >= top && scrollPosition < top + height) {
          currentActiveId = section.id;
        }
      });

      if (!currentActiveId && sections.length > 0) {
        if (window.scrollY < sections[0].offsetTop) {
          currentActiveId = sections[0].id;
        } else if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 80) {
          currentActiveId = sections[sections.length - 1].id;
        }
      }

      if (currentActiveId) {
        setActiveSectionId(currentActiveId);
      }
    };

    window.addEventListener("scroll", handleScroll);
    setTimeout(handleScroll, 100);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [policyKey]);

  const handlePolicyChange = (e, path, targetKey) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate("policy", targetKey);
    } else {
      window.history.pushState({ page: "policy", policyKey: targetKey }, "", path);
      window.location.reload();
    }
  };

  const scrollToSection = (e, id) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
  };

  const renderHeroLinks = () => {
    const links = [];
    if (policyKey !== "commonTerms") {
      links.push(
        <button
          key="commonTerms"
          className="policy-hero-nav-btn"
          onClick={(e) => handlePolicyChange(e, "/terms/common", "commonTerms")}
        >
          공통 이용약관
        </button>
      );
    }
    if (policyKey !== "terms") {
      links.push(
        <button
          key="terms"
          className="policy-hero-nav-btn"
          onClick={(e) => handlePolicyChange(e, "/terms", "terms")}
        >
          이용약관
        </button>
      );
    }
    if (policyKey !== "privacy") {
      links.push(
        <button
          key="privacy"
          className="policy-hero-nav-btn"
          onClick={(e) => handlePolicyChange(e, "/privacy", "privacy")}
        >
          개인정보처리방침
        </button>
      );
    }
    if (policyKey !== "interpreterPolicy") {
      links.push(
        <button
          key="interpreter"
          className="policy-hero-nav-btn"
          onClick={(e) => handlePolicyChange(e, "/interpreter-policy", "interpreterPolicy")}
        >
          통역사 약관
        </button>
      );
    }
    if (policyKey !== "clientPolicy") {
      links.push(
        <button
          key="client"
          className="policy-hero-nav-btn"
          onClick={(e) => handlePolicyChange(e, "/client-policy", "clientPolicy")}
        >
          기업 약관
        </button>
      );
    }

    const contactSectionId = policy.sections[policy.sections.length - 1]?.title;
    if (contactSectionId) {
      links.push(
        <button
          key="contact"
          className="policy-hero-nav-btn highlight"
          onClick={(e) => scrollToSection(e, contactSectionId)}
        >
          문의하기
        </button>
      );
    }

    return <div className="policy-hero-links">{links}</div>;
  };

  return (
    <main className="policy-page">
      <div className="policy-bg-glow" />

      <div className="policy-container">
        <header className="policy-header">
          <a className="policy-home-link" href="/">
            <ArrowLeft size={16} style={{ marginRight: "6px" }} />
            ON-LI 홈으로 가기
          </a>
          <p className="policy-kicker">ON-LI LEGAL POLICY</p>
          <h1>{policy.title}</h1>
          <p className="policy-lead">{policy.lead}</p>
          <div className="policy-meta">
            <span className="policy-meta-updated">마지막 업데이트: {LAST_UPDATED}</span>
          </div>
          {renderHeroLinks()}
        </header>

        {/* 모바일 가로 스크롤 메뉴바 */}
        <nav className="policy-mobile-pills" aria-label="섹션 메뉴 수평 스크롤">
          {policy.sections.map((section) => (
            <button
              key={`pill-${section.title}`}
              className={`policy-pill-btn ${activeSectionId === section.title ? "active" : ""}`}
              onClick={(e) => scrollToSection(e, section.title)}
            >
              {section.title.split(". ")[1] || section.title}
            </button>
          ))}
        </nav>

        <div className="policy-layout">
          {/* 데스크톱 왼쪽 고정 사이드바 */}
          <aside className="policy-sidebar">
            <nav className="policy-sidebar-nav" aria-label="약관 색인 네비게이션">
              <p className="policy-sidebar-title">목차 색인</p>
              <ul>
                {policy.sections.map((section) => (
                  <li key={`nav-${section.title}`}>
                    <a
                      href={`#${section.title}`}
                      className={activeSectionId === section.title ? "active" : ""}
                      onClick={(e) => scrollToSection(e, section.title)}
                    >
                      <span className="nav-bullet" />
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* 오른쪽 본문 영역 */}
          <section className="policy-content" aria-label={policy.title}>
            {policy.sections.map((section) => {
              const IconComponent = ICON_MAP[section.iconName] || FileText;
              return (
                <article key={section.title} id={section.title} className="policy-section">
                  <div className="policy-section-header">
                    <div className="policy-section-icon-box">
                      <IconComponent size={20} className="policy-section-icon" />
                    </div>
                    <h2>{section.title}</h2>
                  </div>
                  <div className="policy-section-body">
                    <ul>
                      {section.items.map((item, idx) => (
                        <li key={idx}>
                          {typeof item === "string" ? item : item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              );
            })}
          </section>
        </div>
      </div>

      {/* 격식 넘치는 B2B 전문 푸터 */}
      <footer className="policy-footer">
        <div className="policy-footer-container">
          <div className="policy-footer-brand">
            <strong>ON-LI</strong>
            <span>Korea-Japan B2B Interpretation Platform</span>
          </div>
          <div className="policy-footer-info">
            <p>한일 비즈니스 매칭의 신뢰로운 파트너 | 운영 사무국</p>
            <p>
              운영 문의 및 법무 대응 이메일:{" "}
              <a href="mailto:contact@on-li.jp">contact@on-li.jp</a>
            </p>
          </div>
          <div className="policy-footer-copy">
            © 2026 ON-LI. All Rights Reserved. Legal Documents Framework v2.1.
          </div>
        </div>
      </footer>
    </main>
  );
}

export default PolicyPage;
