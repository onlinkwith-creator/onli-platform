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

const getPolicyItemType = (item) => {
  if (typeof item !== "string") {
    return "paragraph";
  }

  if (/^\d+\.\s/.test(item)) {
    return "numbered";
  }

  if (/^-\s/.test(item)) {
    return "checked";
  }

  return "paragraph";
};

const getPolicyItemText = (item) => {
  if (typeof item !== "string") {
    return item;
  }

  return item.replace(/^\d+\.\s/, "").replace(/^-\s/, "");
};

const isContactText = (item) => {
  return typeof item === "string" && (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item) || /^https?:\/\//.test(item));
};

const renderPolicyItems = (items) => {
  const blocks = [];
  let listItems = [];
  let listType = null;

  const flushList = () => {
    if (!listItems.length) {
      return;
    }

    const ListTag = listType === "numbered" ? "ol" : "ul";
    blocks.push(
      <ListTag key={`list-${blocks.length}`} className={`policy-list policy-list-${listType}`}>
        {listItems.map((item, idx) => (
          <li key={idx}>{getPolicyItemText(item)}</li>
        ))}
      </ListTag>
    );

    listItems = [];
    listType = null;
  };

  items.forEach((item, idx) => {
    const itemType = getPolicyItemType(item);

    if (itemType === "numbered" || itemType === "checked") {
      if (listType && listType !== itemType) {
        flushList();
      }

      listType = itemType;
      listItems.push(item);
      return;
    }

    flushList();
    blocks.push(
      <p key={`paragraph-${idx}`} className={isContactText(item) ? "policy-contact-text" : undefined}>
        {item}
      </p>
    );
  });

  flushList();
  return blocks;
};

export const POLICY_PAGES = {
  commonTerms: {
    path: "/terms",
    title: "이용약관",
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
    title: "기업 이용약관",
    lead: "",
    sections: [
      {
        iconName: "checkCircle",
        title: "제1조 (통역사 선택 책임)",
        items: [
          "기업은 ON-LI에 등록된 통역사의 프로필, 언어 능력, 경력, 가능 일정, 제공 가능 업무, 조건 등을 확인한 후 스스로의 판단에 따라 통역사를 선택합니다.",
          "ON-LI는 통역사의 등록 정보 및 검증 가능한 정보를 제공하지만, 최종적인 선택 및 업무 요청 판단은 기업의 책임으로 이루어집니다."
        ],
      },
      {
        iconName: "info",
        title: "제2조 (업무 정보 제공 의무)",
        items: [
          "기업은 통역사가 원활히 업무를 수행할 수 있도록 필요한 정보를 사전에 제공해야 합니다.",
          "제공 정보 예시:",
          "- 행사명",
          "- 행사 목적",
          "- 업무 내용",
          "- 근무 시간",
          "- 장소",
          "- 복장 기준",
          "- 제품 및 서비스 자료",
          "- 상담 내용",
          "- 현장 담당자 연락처",
          "기업이 충분한 정보를 제공하지 않아 통역 품질 저하 또는 업무 진행 문제가 발생한 경우, ON-LI 또는 통역사에게 모든 책임을 전가할 수 없습니다."
        ],
      },
      {
        iconName: "briefcase",
        title: "제3조 (업무 범위 및 추가 업무 요청)",
        items: [
          "ON-LI는 단순 언어 통역뿐만 아니라, 전시회·상담회·비즈니스 현장에서 필요한 운영 지원이 가능한 통역 인력을 매칭합니다.",
          "따라서 사전에 합의된 경우 아래 업무가 포함될 수 있습니다.",
          "- 부스 운영 지원",
          "- 방문 고객 응대",
          "- 제품 설명 보조",
          "- 상담 지원",
          "- 리드 관리 지원",
          "- 현장 커뮤니케이션 지원",
          "다만 기업은 사전에 합의되지 않은 업무를 일방적으로 요구할 수 없습니다.",
          "다음 업무는 제한될 수 있습니다.",
          "- 통역 및 현장 운영과 관계없는 개인 업무",
          "- 과도한 중량 물품 운반",
          "- 안전상 문제가 있는 업무",
          "- 계약 범위를 크게 초과하는 업무"
        ],
      },
      {
        iconName: "clock",
        title: "제4조 (현장 관리 및 휴게 시간)",
        items: [
          "기업은 현장에서 통역사가 안정적으로 업무를 수행할 수 있도록 합리적인 근무 환경을 제공해야 합니다.",
          "기업은 다음 사항을 관리해야 합니다.",
          "- 업무 범위",
          "- 현장 안내",
          "- 안전한 업무 환경",
          "- 적절한 휴게 시간 제공",
          "8시간 기준 근무의 경우 원칙적으로 최소 1시간의 휴게 시간이 제공되어야 합니다.",
          "기업의 현장 운영 방식, 추가 지시 또는 사전 협의되지 않은 변경으로 인해 발생한 문제는 기업 측 책임으로 볼 수 있습니다."
        ],
      },
      {
        iconName: "scale",
        title: "제5조 (통역 품질 및 결과 기준)",
        items: [
          "ON-LI는 통역사의 경력, 언어 능력, 활동 정보를 확인 가능한 범위 내에서 제공합니다.",
          "다만 ON-LI는 다음 결과를 보증하지 않습니다.",
          "- 계약 체결",
          "- 매출 발생",
          "- 상담 성공",
          "- 특정 비즈니스 성과",
          "통역 결과는 다음 요소에 따라 달라질 수 있습니다.",
          "- 현장 상황",
          "- 기업 제공 자료 수준",
          "- 상담 내용",
          "- 제품 이해도",
          "- 통역사의 역량"
        ],
      },
      {
        iconName: "shieldAlert",
        title: "제6조 (직접 거래 및 우회 계약 금지)",
        items: [
          "기업은 ON-LI를 통해 알게 된 통역사와 ON-LI의 사전 승인 없이 직접 연락하여 별도 계약 또는 업무 의뢰를 진행해서는 안 됩니다.",
          "ON-LI 외부에서 진행된 거래로 발생하는 문제:",
          "- 보수 미지급",
          "- 업무 분쟁",
          "- 사고",
          "- 손해",
          "등에 대해서 ON-LI는 책임을 부담하지 않습니다."
        ],
      },
      {
        iconName: "alertTriangle",
        title: "제7조 (취소 및 일정 변경)",
        items: [
          "기업이 확정된 통역 일정을 취소하거나 변경하는 경우, ON-LI가 정한 취소 기준 및 정산 정책이 적용될 수 있습니다.",
          "특히 다음 경우에는 비용이 발생할 수 있습니다.",
          "- 행사 직전 취소",
          "- 당일 취소",
          "- 통역사 이동 후 취소",
          "- 현장 도착 후 취소",
          "이 경우 통역사의 일정 확보, 준비 시간, 이동 비용 등에 따른 보상 비용이 청구될 수 있습니다."
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
  const policy = POLICY_PAGES[policyKey] || POLICY_PAGES.commonTerms;
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
          onClick={(e) => handlePolicyChange(e, "/terms", "commonTerms")}
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
                    {renderPolicyItems(section.items)}
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
            <p>한일 비즈니스 매칭의 신뢰로운 파트너 | 운영팀 ONLINK CP</p>
            <p>
              운영 문의 이메일:{" "}
              <a href="mailto:onlinkcp@gmail.com">onlinkcp@gmail.com</a>
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
