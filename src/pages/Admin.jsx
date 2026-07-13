import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  Building2,
  CheckCircle2,
  Eye,
  FileText,
  Languages,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Search,
  ShieldAlert,
  Star,
  Trash2,
  WalletCards,
  User,
  X,
} from "lucide-react";
import { publicSupabase, supabase, supabaseConfigError } from "../supabase";
import DateRangeInput from "../components/DateRangeInput";
import { DayPicker } from "react-day-picker";
import { ko } from "react-day-picker/locale";
import MonthFilterInput from "../components/MonthFilterInput";
import AdminJobs from "./AdminJobs";
import { normalizeJobVisibility } from "../utils/jobStatus";
import {
  APPLICATION_STATUS,
  APPLICATION_STATUS_OPTIONS,
  INTERPRETER_ACTIVITY_STATUS,
  INTERPRETER_ACTIVITY_STATUS_OPTIONS,
  JOB_STATUS,
  MATCHING_STATUS,
  getApplicationStatusLabel,
  getInterpreterActivityStatusBadgeClass,
  getInterpreterActivityStatusLabel,
  getMatchingStatusLabel,
  getStatusBadgeClass as getStandardStatusBadgeClass,
  normalizeApplicationStatus,
  normalizeJobStatus,
  normalizeMatchingStatus,
} from "../utils/status";
import { formatDateRange, getDateRangeEnd, getDateRangeStart } from "../utils/dateRange";
import { isDateRangeOverlappingMonth, normalizeDateToISO, formatDisplayDate } from "../utils/date";
import {
  checkInterpreterScheduleConflict,
  findLocalScheduleConflicts,
  getScheduleRange,
  normalizeScheduleDate,
} from "../utils/scheduleConflict";
import { fetchJobApplications as fetchBaseJobApplications } from "../utils/jobsApi";
import { getPositiveInteger } from "../utils/jobRecruitment";
import {
  fetchRequestBusinessProfile,
  fetchRequestRows,
  normalizeRequestDetail,
} from "../services/requestDetailService";
import { updateRequestStatus } from "../services/requestStatusService";
import { getLevelBadgeClass, normalizeLevel } from "../utils/levelBadge";
import {
  getDuplicateApplicationIdSet,
  getDuplicateInterpreterIdSet,
} from "../utils/duplicateCheck";
import {
  ASSIGNMENT_STATUS,
  ASSIGNMENT_STATUS_OPTIONS,
  OPERATION_STATUS,
  OPERATION_STATUS_OPTIONS,
  SETTLEMENT_FLOW_STATUS,
  SETTLEMENT_FLOW_STATUS_OPTIONS,
  getAssignmentStatusLabel,
  getAssignmentStatusBadgeClass,
  getOperationStatusLabel,
  getOperationStatusBadgeClass,
  getSettlementFlowStatusLabel,
  normalizeAssignmentStatus,
  normalizeOperationStatus,
  normalizeSettlementFlowStatus,
} from "../utils/operationsStatus";
import { getEmailRecipient, sendAdminAutoEmail, sendAutoEmail } from "../lib/email";
import {
  getDesignatedInterpreterName,
  getRequestTypeLabel,
  normalizeRequestType,
  isDesignatedRequest,
} from "../utils/designatedRequest";
import {
  MANAGEMENT_NUMBER_CONFIG,
  addManagementNumber,
  isManagementNumberConflict,
} from "../utils/managementNumber";
import {
  ADMIN_SETTLEMENT_STATUS,
  SETTLEMENT_STATUS_OPTIONS,
  getSettlementStatusBadgeClass,
  getSettlementStatusLabel,
  normalizeAdminSettlementStatus,
} from "../utils/settlementStatus";
import {
  buildCompletionDraft,
  buildEstimateDraft,
  buildPaymentDraft,
  createOnliDocument,
  downloadBlob,
  formatDocumentAmount,
  getDocumentTypeLabel,
  openDocumentSignedUrl,
  recalculateEstimateDraft,
  recalculatePaymentDraft,
} from "../utils/documents";
import { useAuth } from "../hooks/useAuth";
import { WITHDRAWN_STATUS, isWithdrawnInterpreter } from "../utils/accountStatus";
import "./Admin.css";

// TODO: 실서비스 전에는 Supabase Auth 관리자 권한 필요.

const MAIN_TABS = [
  { id: "new", label: "신규 관리", defaultSubTab: "new_requests" },
  { id: "requests", label: "의뢰 관리", defaultSubTab: "all_requests" },
  { id: "interpreters", label: "통역사 관리", defaultSubTab: "registered_interpreters" },
  { id: "businesses", label: "기업 관리", defaultSubTab: "all_businesses" },
  { id: "settlements", label: "정산 관리", defaultSubTab: "settlement_waiting" },
  { id: "documents", label: "문서 관리", defaultSubTab: "all_documents" },
  { id: "internal", label: "내부 관리", defaultSubTab: "admin_memos" },
];
const SUB_TABS = {
  new: [
    { id: "new_requests", label: "신규 의뢰" },
    { id: "new_interpreters", label: "신규 통역사" },
  ],
  requests: [
    { id: "all_requests", label: "전체 의뢰" },
    { id: "jobs", label: "공고 관리" },
    { id: "applications", label: "지원자 관리" },
    { id: "assignments", label: "배정 관리" },
  ],
  interpreters: [
    { id: "registered_interpreters", label: "등록 통역사" },
    { id: "verification_pending", label: "검증 대기" },
    { id: "interpreter_activity", label: "활동 상태 관리" },
  ],
  businesses: [
    { id: "all_businesses", label: "전체 기업" },
  ],
  payments: [
    { id: "company_payments", label: "결제 관리" },
  ],
  settlements: [
    { id: "settlement_waiting", label: "정산 대기" },
    { id: "settlement_confirmed", label: "정산 확정" },
    { id: "settlement_paying", label: "통역사 지급" },
    { id: "settlement_completed", label: "정산 완료" },
  ],
  documents: [
    { id: "all_documents", label: "전체 문서" },
    { id: "estimate_documents", label: "견적서" },
    { id: "completion_documents", label: "업무확인서" },
    { id: "payout_documents", label: "정산서" },
  ],
  internal: [
    { id: "admin_memos", label: "관리자 메모" },
    { id: "notification_history", label: "알림 이력" },
    { id: "admin_accounts", label: "관리자 계정 관리" },
  ],
};
const SUB_TAB_TO_MAIN_TAB = Object.fromEntries(
  Object.entries(SUB_TABS).flatMap(([mainTabId, subTabs]) =>
    subTabs.map((subTab) => [subTab.id, mainTabId])
  )
);
const INTERPRETER_STATUSES = ["pending", "active", "rejected", "warning", "suspended", "withdrawn"];
const LEVELS = ["Lv1", "Lv2", "Lv3", "Lv4"];
const INTERPRETER_DOCUMENT_BUCKET = "resume-files";
const REQUEST_REFERENCE_BUCKET = "request-files";
const ADMIN_NOTES_SELECT =
  "id, target_type, target_id, note, created_by, created_at, updated_at";
const ADMIN_ACTIVITY_LOGS_SELECT =
  "id, target_type, target_id, action_type, before_value, after_value, actor_user_id, created_at";
const SETTLEMENTS_SELECT =
  "id, request_id, interpreter_id, interpreter_auth_user_id, assignment_id, payout_document_id, amount, settlement_status, payout_status, work_days, daily_rate, extra_amount, deduction_amount, settlement_confirmed_at, interpreter_payment_started_at, settlement_completed_at, paid_at, confirmed_by, paid_by, payment_method, admin_memo, created_at, updated_at";
const INTERPRETER_ASSIGNMENT_HISTORY_SELECT = `
  id,
  request_id,
  interpreter_id,
  requests:request_id (
    id,
    request_no
  )
`;
const INTERPRETER_UPDATE_COLUMNS = new Set([
  "name",
  "email",
  "phone",
  "kakao_or_line",
  "gender",
  "age",
  "region",
  "level",
  "approved",
  "status",
  "activity_status",
  "warning_count",
  "jlpt",
  "stay_period",
  "school",
  "has_experience",
  "experience_count",
  "available_tasks",
  "specialties",
  "available_regions",
  "admin_memo",
  "is_public",
  "withdrawn_at",
  "resume_verified_email_sent_at",
  "updated_at",
]);
const INTERPRETER_STATUS_VALUES = new Set(INTERPRETER_STATUSES);
const REQUEST_MANAGEMENT_FILTERS = [
  { value: "all", label: "전체" },
  { value: "new_request", label: "신규 의뢰" },
  { value: OPERATION_STATUS.BEFORE_OPERATION, label: "운영전" },
  { value: OPERATION_STATUS.PREPARING, label: "운영 준비중" },
  { value: OPERATION_STATUS.SCHEDULED, label: "운영 예정" },
  { value: OPERATION_STATUS.IN_PROGRESS, label: "운영중" },
  { value: OPERATION_STATUS.COMPLETED, label: "업무완료" },
];
const ESTIMATE_STATUS_OPTIONS = [
  { value: "estimate_preparing", label: "견적 준비중" },
  { value: "estimate_required", label: "견적 확인 필요" },
  { value: "estimate_approved", label: "견적 승인 완료" },
];
const PENDING_INTERPRETER_STATUSES = [
  "pending",
  "approval_pending",
  "승인대기",
  "승인 대기",
  "미승인",
  "",
];
const NEW_REQUEST_STATUSES = [
  "new",
  "pending",
  "접수대기",
  "미확인",
  MATCHING_STATUS.DRAFT,
];
const ADMIN_TAB_ALIASES = {
  requests: "all_requests",
  interpreters: "registered_interpreters",
  businesses: "all_businesses",
  payments: "settlement_waiting",
  settlement: "settlement_waiting",
  interpreter_applications: "applications",
  new_applications: "new_interpreters",
  completed_requests: "all_requests",
};
const EMPTY_REQUEST_EDIT_DRAFT = {
  id: "",
  title: "",
  event_name: "",
  company_name: "",
  request_no: "",
  request_type: "general",
  start_date: "",
  end_date: "",
  event_location: "",
  location: "",
  language: "",
  requested_level: "Lv1",
  people_count: "",
  price: "",
  assigned_interpreter: "",
  preferred_gender: "",
  is_public: "true",
  assignment_status: ASSIGNMENT_STATUS.WAITING,
  operation_status: OPERATION_STATUS.BEFORE_OPERATION,
  settlement_status: SETTLEMENT_FLOW_STATUS.NOT_REQUIRED,
  contact_status: "not_contacted",
  payment_status: "unpaid",
  estimate_status: "estimate_preparing",
  company_internal_memo: "",
};
const JOB_APPLICATION_STATUSES = APPLICATION_STATUS_OPTIONS;
const APPLICANT_MANAGEMENT_STATUSES = new Set([
  APPLICATION_STATUS.PENDING,
  APPLICATION_STATUS.REVIEWING,
  APPLICATION_STATUS.REJECTED,
]);
const POST_ACCEPTANCE_STATUS_VALUES = new Set([
  "accepted",
  "approved",
  "합격",
  "승인",
  "matched",
  "matching",
  "매칭됨",
  "매칭완료",
  "waiting",
  "배정대기",
  "assigning",
  "배정중",
  "assigned",
  "배정",
  "배정완료",
  "confirmed",
  "확정",
]);
const SETTLEMENT_MANAGEMENT_FILTERS = [
  { value: "all", label: "전체" },
  ...SETTLEMENT_STATUS_OPTIONS,
];
const COMPANY_PAYMENT_STATUS_OPTIONS = [
  { value: "unpaid", label: "미입금" },
  { value: "invoice_sent", label: "청구 완료" },
  { value: "paid", label: "입금 완료" },
  { value: "overdue", label: "연체" },
  { value: "refunded", label: "환불" },
];
const COMPANY_PAYMENT_METHOD_OPTIONS = [
  { value: "", label: "미입력" },
  { value: "bank_transfer", label: "계좌이체" },
  { value: "cash", label: "현금" },
  { value: "other", label: "기타" },
];
const SETTLEMENT_PAYOUT_STATUS_OPTIONS = SETTLEMENT_STATUS_OPTIONS;

function logSupabaseError(label, error) {
  if (!error) return;
  console.error(`${label} failed`, {
    code: error.code || null,
    message: error.message || String(error),
    details: error.details || null,
    hint: error.hint || null,
    error,
  });
}
function logRequestUpdateFailure(label, { payload, requestId, error } = {}) {
  console.error(label, {
    payload,
    requestId,
    error,
    code: error?.code || null,
    message: error?.message || null,
    details: error?.details || null,
    hint: error?.hint || null,
  });
}
const SETTLEMENT_PAYOUT_METHOD_OPTIONS = [
  { value: "", label: "미입력" },
  { value: "bank_transfer", label: "계좌이체" },
  { value: "cash", label: "현금" },
  { value: "other", label: "기타" },
];
const STATUS_LABELS = {
  pending: "대기",
  active: "활동중",
  warning: "경고",
  suspended: "정지",
  matching: "매칭중",
  draft: "임시배정",
  assigned: "배정완료",
  matched: "배정완료",
  confirmed: "확정",
  in_progress: "운영중",
  settlement_waiting: "정산대기",
  completed: "업무완료",
  cancelled: "취소",
  not_contacted: "미연락",
  contacted: "연락완료",
  group_created: "단톡방 생성",
  meeting_done: "미팅완료",
  unpaid: "미결제",
  paid: "결제완료",
  "미결제": "미결제",
  "결제완료": "결제완료",
  unsettled: "미정산",
  settled: "정산완료",
  "미정산": "미정산",
  "정산완료": "정산완료",
  accepted: "수락",
  rejected: "거절",
};
const REQUEST_UPDATE_COLUMN_ALLOWLIST = new Set([
  "event_name",
  "company_name",
  "request_no",
  "request_type",
  "start_date",
  "end_date",
  "event_date",
  "event_location",
  "requested_people_count",
  "required_count",
  "requested_level",
  "required_level",
  "preferred_gender",
  "status",
  "assignment_status",
  "operation_status",
  "settlement_status",
  "contact_status",
  "payment_status",
  "estimate_status",
  "company_internal_memo",
  "is_public",
  "is_job_public",
  "client_price",
  "interpreter_price",
  "profit",
  "company_amount",
  "interpreter_payment",
  "platform_profit",
  "assigned_interpreter_id",
  "assigned_interpreter_name",
  "matched_interpreter_id",
  "matched_interpreter_name",
  "admin_checked",
  "checked_at",
  "settlement_work_days",
  "settlement_level",
  "settlement_base_amount",
  "settlement_extra_amount",
  "settlement_deduction_amount",
  "settlement_final_amount",
  "company_fee",
  "interpreter_fee",
  "settlement_memo",
  "settlement_confirmed_at",
  "settlement_completed_at",
  "event_start_time",
  "event_end_time",
  "language_direction",
  "materials_available",
]);
const REQUEST_MONEY_FIELDS = new Set([
  "price",
  "client_price",
  "company_amount",
  "company_fee",
  "interpreter_price",
  "interpreter_payment",
  "interpreter_fee",
  "settlement_final_amount",
  "settlement_base_amount",
  "settlement_extra_amount",
  "settlement_deduction_amount",
]);
const REQUEST_DATE_FIELDS = new Set(["start_date", "end_date", "event_date"]);

function filterRequestUpdatePayload(payload = {}, request = null) {
  const requestKeys = request ? new Set(Object.keys(request)) : null;
  return Object.entries(payload).reduce((nextPayload, [key, value]) => {
    if (value === undefined) return nextPayload;
    const isAllowedRequestColumn =
      REQUEST_UPDATE_COLUMN_ALLOWLIST.has(key) || requestKeys?.has(key);
    if (isAllowedRequestColumn) {
      nextPayload[key] = REQUEST_DATE_FIELDS.has(key) ? toDbDate(value) : value;
    }
    return nextPayload;
  }, {});
}

function toDbDate(value) {
  if (value === null || value === "") return null;
  const normalized = normalizeDateToISO(value);
  return normalized || null;
}

function hasRequestMoneyChange(changes = {}) {
  return Object.keys(changes).some((key) => REQUEST_MONEY_FIELDS.has(key));
}

async function fetchJobApplicationsWithJobs(jobs = []) {
  const joinedResult = await publicSupabase
    .from("job_applications")
    .select(
      `
        id,
        application_no,
        job_id,
        applicant_name,
        phone,
        applicant_phone:phone,
        email,
        applicant_email:email,
        interpreter_id,
        message,
        status,
        created_at,
        jobs (
          id,
          job_no,
          title,
          company_name,
          event_name,
          event_location,
          location,
          date,
          event_date,
          start_date,
          end_date,
          language
        )
      `
    )
    .order("created_at", { ascending: false });

  if (!joinedResult.error) return joinedResult;

  console.error("job_applications joined fetch error:", joinedResult.error);

  const fallbackData = await fetchBaseJobApplications(publicSupabase);

  const jobsById = new Map(compactAdminRows(jobs).map((job) => [job.id, job]));
  return {
    data: compactAdminRows(fallbackData).map((application) => ({
      ...application,
      jobs: jobsById.get(application.job_id) || null,
    })),
    error: null,
  };
}

function normalizeAdminSubTabId(subTabId) {
  return ADMIN_TAB_ALIASES[subTabId] || subTabId;
}

function getInitialAdminSubTab() {
  if (typeof window === "undefined") return "new_requests";

  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get("tab") || params.get("subTab");
  const sectionParam = params.get("section");

  if (tabParam) return normalizeAdminSubTabId(tabParam);
  if (path === "/admin/jobs") return "jobs";
  if (path === "/admin/applications") return "applications";
  if (path === "/admin/interpreters") return "registered_interpreters";
  if (path === "/admin/businesses") return "all_businesses";
  if (path === "/admin/payments" || sectionParam === "payments") return "settlement_waiting";
  if (path === "/admin/settings") return "admin_accounts";
  if (path === "/admin/new" || sectionParam === "new") return "new_requests";
  if (path === "/admin/requests" || sectionParam === "requests") return "all_requests";
  if (path === "/admin/settlements" || sectionParam === "settlements") {
    return "settlement_waiting";
  }
  if (path === "/admin/internal" || sectionParam === "internal") return "admin_memos";
  if (sectionParam === "interpreters") return "registered_interpreters";

  return "new_requests";
}

function getAdminPathForSubTab(subTabId) {
  const mainTabId = SUB_TAB_TO_MAIN_TAB[subTabId] || "new";
  const sectionPathMap = {
    new: "/admin/new",
    requests: "/admin/requests",
    interpreters: "/admin/interpreters",
    businesses: "/admin/businesses",
    settlements: "/admin/settlements",
    internal: "/admin/internal",
  };
  const path = sectionPathMap[mainTabId] || "/admin";
  return `${path}?tab=${encodeURIComponent(subTabId)}`;
}


function Admin({ onBackClick }) {
  const { user, signOut, adminProfile, loading: authLoading, isAdmin } = useAuth();
  const initialSubTab = getInitialAdminSubTab();
  const [activeMainTab, setActiveMainTab] = useState(
    SUB_TAB_TO_MAIN_TAB[initialSubTab] || "new"
  );
  const [activeSubTab, setActiveSubTab] = useState(initialSubTab);
  const [requests, setRequests] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [interpreters, setInterpreters] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [matchings, setMatchings] = useState([]);
  const [jobApplications, setJobApplications] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paymentLogs, setPaymentLogs] = useState([]);
  const [settlementLogs, setSettlementLogs] = useState([]);
  const [adminDataErrors, setAdminDataErrors] = useState({
    notifications: null,
    settlements: null,
  });
  const [adminNotes, setAdminNotes] = useState([]);
  const [adminActivityLogs, setAdminActivityLogs] = useState([]);
  const [notificationEvents, setNotificationEvents] = useState([]);
  const [adminNoteDrafts, setAdminNoteDrafts] = useState({});
  const [notificationProcessing, setNotificationProcessing] = useState(false);
  const [notificationFilters, setNotificationFilters] = useState({
    recipient: "all",
    status: "all",
    channel: "all",
    startDate: "",
    endDate: "",
  });
  const [notificationHistoryType, setNotificationHistoryType] = useState(() => {
    if (typeof window === "undefined") return "email";
    return new URLSearchParams(window.location.search).get("notification_type") === "internal"
      ? "internal"
      : "email";
  });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [optionalDataError, setOptionalDataError] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [expandedRequestId, setExpandedRequestId] = useState(null);
  const [applicationsRequestId, setApplicationsRequestId] = useState(null);
  const [, setSelectedRequest] = useState(null);
  const [activeRequestModal, setActiveRequestModal] = useState(null);
  const [requestEditDraft, setRequestEditDraft] = useState(null);
  const [documentDraft, setDocumentDraft] = useState(null);
  const [generatedDocuments, setGeneratedDocuments] = useState([]);
  const [isAdminAccountModalOpen, setIsAdminAccountModalOpen] = useState(false);
  const [isSettlementPendingModalOpen, setIsSettlementPendingModalOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminAccountDraft, setAdminAccountDraft] = useState({
    email: "",
    auth_user_id: "",
    role: "staff",
  });
  const [isAdminAccountSaving, setIsAdminAccountSaving] = useState(false);
  const [selectedInterpreter, setSelectedInterpreter] = useState(null);
  const [interpreterModalType, setInterpreterModalType] = useState(null);
  const [interpreterEditDraft, setInterpreterEditDraft] = useState(null);
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [settlementTouchedByRequest, setSettlementTouchedByRequest] = useState({});
  const [interpreterFilters, setInterpreterFilters] = useState({
    search: "",
    level: "all",
    status: "all",
    activity: "all",
    approved: "all",
    resumeReview: "all",
    duplicate: "all",
  });
  const [requestFilters, setRequestFilters] = useState({
    search: "",
    month: "",
    status: "all",
    public: "all",
    sort: "latest",
    view: "card",
  });
  const [applicationFilters, setApplicationFilters] = useState({
    status: "all",
    duplicate: "all",
  });
  const [paymentFilters, setPaymentFilters] = useState({
    search: "",
    status: "all",
    startDate: "",
    endDate: "",
  });
  const [settlementFilters, setSettlementFilters] = useState({
    search: "",
    status: "all",
    startDate: "",
    endDate: "",
  });

const INVALID_RECIPIENT_EMAIL_PLACEHOLDERS = new Set([
  "관리자 정보 없음",
  "관리자",
  "정보 없음",
  "-",
  "없음",
  "이메일 없음",
  "수신자 없음",
]);

function sanitizeRecipientEmail(email) {
  const trimmed = String(email || "").trim();
  if (!trimmed || !trimmed.includes("@") || INVALID_RECIPIENT_EMAIL_PLACEHOLDERS.has(trimmed)) {
    return "";
  }
  return trimmed;
}

  const fetchAdminData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    if (!supabase) {
      setErrorMessage(supabaseConfigError.message);
      setLoading(false);
      return;
    }

    try {
      const [requestResult, jobResult, interpreterResult, assignmentResult, matchingResult, businessResult] =
        (
          await Promise.allSettled([
            fetchRequestRows(supabase).then((data) => ({ data, error: null })).catch((error) => ({ data: [], error })),
            supabase.from("jobs").select("*").order("created_at", {
              ascending: false,
              nullsFirst: false,
            }),
            supabase.from("interpreters").select("*").order("id", {
              ascending: false,
            }),
            (async () => {
              const result = await supabase
                .from("request_interpreters")
                .select("id, request_id, interpreter_id, contact_visible")
                .order("id", { ascending: false });

              if (!result.error) {
                return {
                  ...result,
                  data: normalizeRequestInterpreterRows(result.data),
                };
              }

              console.error("request_interpreters contact_visible select failed", result.error);
              const fallbackResult = await supabase
                .from("request_interpreters")
                .select("id, request_id, interpreter_id")
                .order("id", { ascending: false });

              if (fallbackResult.error) return fallbackResult;
              return {
                ...fallbackResult,
                data: normalizeRequestInterpreterRows(fallbackResult.data),
              };
            })(),
            supabase
              .from("matchings")
              .select("id, matching_no, job_id, request_id, interpreter_id, start_date, end_date, status")
              .order("created_at", { ascending: false }),
            supabase.from("businesses").select("*").order("created_at", {
              ascending: false,
            }),
          ])
        ).map((result) =>
          result.status === "fulfilled"
            ? result.value
            : { data: [], error: result.reason }
        );

      const getAdminData = (label, result) => {
        if (result.error) {
          console.error(`${label} fetch failed:`, result.error);
          return [];
        }
        return compactAdminRows(result.data);
      };

      const requestData = getAdminData("requests", requestResult);
      const jobData = getAdminData("jobs", jobResult);
      const interpreterData = getAdminData("interpreters", interpreterResult);
      const assignmentData = uniqueRequestInterpreterAssignments(
        normalizeRequestInterpreterRows(getAdminData("request_interpreters", assignmentResult))
      );
      const matchingData = getAdminData("matchings", matchingResult);
      const businessData = getAdminData("businesses", businessResult);

      if (!requestResult.error) setRequests(requestData);
      if (!jobResult.error) setJobs(jobData);
      if (!interpreterResult.error) setInterpreters(interpreterData);
      if (!assignmentResult.error) setAssignments(assignmentData);
      if (!matchingResult.error) setMatchings(matchingData);
      if (!businessResult.error) setBusinesses(businessData);

      const jobApplicationResult = await fetchJobApplicationsWithJobs(jobData);
      const jobApplicationData = jobApplicationResult.error
        ? []
        : compactAdminRows(jobApplicationResult.data);
      if (jobApplicationResult.error) {
        console.error("job_applications fetch failed:", jobApplicationResult.error);
      }
      if (!jobApplicationResult.error) setJobApplications(jobApplicationData);

      console.log("loaded jobs:", jobData);
      console.log("loaded interpreters:", interpreterData);
      console.log("loaded applications:", jobApplicationData);
    } catch (error) {
      console.error("admin data fetch failed:", error);
      setErrorMessage("관리자 데이터를 불러오는데 실패했습니다. 새로고침 후 다시 시도해 주세요.");
    }
    if (supabase) {
      try {
        const [notesResult, logsResult, notificationsResult, documentsResult, settlementsResult] = (
          await Promise.allSettled([
            supabase
              .from("admin_notes")
              .select(ADMIN_NOTES_SELECT)
              .order("created_at", { ascending: false })
              .limit(300),
            supabase
              .from("admin_activity_logs")
              .select(ADMIN_ACTIVITY_LOGS_SELECT)
              .order("created_at", { ascending: false })
              .limit(300),
            supabase
              .from("notifications")
              .select("*")
              .is("deleted_at", null)
              .order("created_at", { ascending: false })
              .limit(300),
            supabase
              .from("documents")
              .select("id, document_type, document_no, status, version, request_id, interpreter_id, settlement_id, title, amount, storage_bucket, file_path, metadata, created_at")
              .order("created_at", { ascending: false })
              .limit(300),
            supabase
              .from("settlements")
              .select(SETTLEMENTS_SELECT)
              .order("created_at", { ascending: false })
              .limit(500),
          ])
        ).map((result) =>
          result.status === "fulfilled"
            ? result.value
            : { data: [], error: result.reason }
        );

        if (notesResult.error) {
          logSupabaseFetchError("admin_notes", notesResult.error);
          setOptionalDataError("일부 내부관리 데이터를 불러오지 못했습니다. 콘솔 오류를 확인해주세요.");
        } else {
          setAdminNotes(uniqueById(notesResult.data || []));
        }

        if (logsResult.error) {
          logSupabaseFetchError("admin_activity_logs", logsResult.error);
          setOptionalDataError("일부 내부관리 데이터를 불러오지 못했습니다. 콘솔 오류를 확인해주세요.");
        } else {
          setAdminActivityLogs(compactAdminRows(logsResult.data));
        }

        if (notificationsResult.error) {
          console.error("notifications fetch failed:", notificationsResult.error);
        }
        setNotificationEvents(
          uniqueById(
            mapNotificationsToEvents(
              notificationsResult.error
                ? []
                : compactAdminRows(notificationsResult.data || []).filter((event) => !event.deleted_at)
            )
          )
        );
        setAdminDataErrors((current) => ({
          ...current,
          notifications: notificationsResult.error || null,
        }));

        if (documentsResult.error) {
          logSupabaseFetchError("documents", documentsResult.error);
          setOptionalDataError("일부 문서 데이터를 불러오지 못했습니다. 콘솔 오류를 확인해주세요.");
        } else {
          setGeneratedDocuments(uniqueById(documentsResult.data || []));
        }

        if (settlementsResult.error) {
          logSupabaseFetchError("settlements", settlementsResult.error);
          setAdminDataErrors((current) => ({
            ...current,
            settlements: settlementsResult.error,
          }));
          setSettlements([]);
        } else {
          setSettlements(uniqueById(settlementsResult.data || []));
          setAdminDataErrors((current) => ({
            ...current,
            settlements: null,
          }));
        }
      } catch (error) {
        logSupabaseError("admin optional data fetch", error);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLoading(false);
      setErrorMessage("관리자 권한 확인 후 이용할 수 있습니다.");
      return;
    }
    queueMicrotask(fetchAdminData);
  }, [authLoading, fetchAdminData, isAdmin]);

  const updateBusiness = async (bizId, payload) => {
    if (!publicSupabase) return;
    try {
      const { error } = await publicSupabase
        .from("businesses")
        .update(payload)
        .eq("id", bizId);

      if (error) {
        alert(`기업 정보 수정 실패: ${error.message}`);
        return;
      }

      alert("수정되었습니다.");
      setBusinesses((current) =>
        current.map((biz) => (biz.id === bizId ? { ...biz, ...payload } : biz))
      );
    } catch (err) {
      console.error(err);
      alert("네트워크 오류가 발생했습니다.");
    }
  };

  const closeInterpreterModal = useCallback(() => {
    setSelectedInterpreter(null);
    setInterpreterModalType(null);
    setInterpreterEditDraft(null);
  }, []);

  const closeRequestModal = useCallback(() => {
    setActiveRequestModal(null);
    setRequestEditDraft(null);
    setSelectedRequest(null);
  }, []);

  const closeAdminAccountModal = useCallback(() => {
    setIsAdminAccountModalOpen(false);
    setAdminAccountDraft({
      email: "",
      auth_user_id: "",
      role: "staff",
    });
  }, []);

  // admin_users 테이블 조회
  const fetchAdminUsers = useCallback(async () => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    const { data, error } = await supabase
      .from("admin_users")
      .select("id, email, auth_user_id, role, status, created_at, updated_at")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("admin_users 목록 조회 실패:", error);
      alert(`관리자 목록 조회 실패: ${error.message}`);
      setAdminUsers([]);
      return;
    }

    setAdminUsers(data || []);
  }, []);

  const openAdminAccountModal = async () => {
    setIsAdminAccountModalOpen(true);
    await fetchAdminUsers();
  };

  useEffect(() => {
    if (activeSubTab !== "admin_accounts") return;
    queueMicrotask(fetchAdminUsers);
  }, [activeSubTab, fetchAdminUsers]);

  useEffect(() => {
    if (activeSubTab === "assignments") {
      queueMicrotask(fetchAdminData);
    }
  }, [activeSubTab, fetchAdminData]);

  useEffect(() => {
    if (!interpreterModalType) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeInterpreterModal();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeInterpreterModal, interpreterModalType]);

  useEffect(() => {
    if (!activeRequestModal) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeRequestModal();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeRequestModal, closeRequestModal]);

  const assignmentsByRequest = useMemo(
    () => groupBy(uniqueRequestInterpreterAssignments(assignments), "request_id"),
    [assignments]
  );
  const safePayments = useMemo(() => (Array.isArray(payments) ? payments : []), [payments]);
  const safeSettlements = useMemo(() => (Array.isArray(settlements) ? settlements : []), [settlements]);
  const settlementManagementRows = useMemo(
    () => loadAdminRequestRows({ requests, assignments, interpreters, settlements: safeSettlements }),
    [assignments, interpreters, requests, safeSettlements]
  );
  const jobApplicationsByJob = useMemo(
    () => groupByStringKey(jobApplications, "job_id"),
    [jobApplications]
  );
  const jobsById = useMemo(
    () =>
      jobs.reduce((map, job) => {
        map.set(job.id, job);
        map.set(String(job.id), job);
        return map;
      }, new Map()),
    [jobs]
  );
  const requestsByJobId = useMemo(
    () =>
      requests.reduce((map, request) => {
        if (request.job_id) map.set(String(request.job_id), request);
        return map;
      }, new Map()),
    [requests]
  );
  const duplicateApplicationResult = useMemo(
    () => getDuplicateApplicationIdSet(jobApplications),
    [jobApplications]
  );
  const duplicateInterpreterResult = useMemo(
    () => getDuplicateInterpreterIdSet(interpreters),
    [interpreters]
  );
  const activeRequest = useMemo(() => {
    if (!activeRequestModal?.requestId) return null;
    return (
      requests.find((request) => request.id === activeRequestModal.requestId) ||
      activeRequestModal.request ||
      null
    );
  }, [activeRequestModal, requests]);
  const activeRequestJob = activeRequest?.job_id
    ? jobsById.get(String(activeRequest.job_id)) || jobsById.get(activeRequest.job_id)
    : null;

  const completedRequests = useMemo(
    () => requests.filter((request) => isCompletedRequest(request)),
    [requests]
  );
  const settlementPendingRequests = useMemo(
    () => settlementManagementRows.pending,
    [settlementManagementRows]
  );
  const newRequests = useMemo(
    () => requests.filter((request) => isNewRequest(request)),
    [requests]
  );
  const recruitingJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          normalizeJobStatus(job.status) === JOB_STATUS.RECRUITING &&
          normalizeJobVisibility(job) === "public"
      ),
    [jobs]
  );
  const pendingInterpreters = useMemo(
    () => interpreters.filter((interpreter) => isPendingInterpreter(interpreter)),
    [interpreters]
  );
  const pendingResumeReviewInterpreters = useMemo(
    () => interpreters.filter((interpreter) => isResumeReviewPending(interpreter)),
    [interpreters]
  );
  const assignmentRows = useMemo(
    () => buildAssignmentManagementRows({ assignments, jobApplications, matchings, requests, interpreters }),
    [assignments, jobApplications, matchings, requests, interpreters]
  );
  const pendingAssignmentRequests = useMemo(
    () =>
      requests.filter((request) => {
        const requestAssignments = assignmentsByRequest.get(request.id) || [];
        return (
          !isCompletedRequest(request) &&
          (normalizeAssignmentStatus(request) !== ASSIGNMENT_STATUS.ASSIGNED ||
            requestAssignments.length === 0)
        );
      }),
    [assignmentsByRequest, requests]
  );
  const adminMemoItems = useMemo(
    () => buildAdminMemoItems({ requests, interpreters, assignmentRows, jobApplications }),
    [assignmentRows, interpreters, jobApplications, requests]
  );
  const adminMemoDisplayItems = useMemo(
    () =>
      buildAdminMemoDisplayItems({
        items: adminMemoItems,
        notes: adminNotes,
        requests,
        interpreters,
        assignmentRows,
        jobApplications,
      }),
    [adminMemoItems, adminNotes, assignmentRows, interpreters, jobApplications, requests]
  );

  const filteredRequests = useMemo(() => {
    const search = requestFilters.search.trim().toLowerCase();

    const result = requests.filter((request) => {
      const searchableText = [
        request.company_name,
        request.event_name,
        request.event_location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !search || searchableText.includes(search);
      const matchesDate =
        !requestFilters.month ||
        isDateRangeOverlappingMonth(
          getDateRangeStart(request.start_date || request.event_date, request.date),
          getDateRangeEnd(request.end_date || request.event_date, request.date),
          requestFilters.month
        );
      const matchesStatus = doesRequestMatchManagementStatusFilter(
        request,
        requestFilters.status
      );
      const matchesPublic =
        requestFilters.public === "all" ||
        String(isRequestJobPublic(request, jobsById)) === requestFilters.public;

      return matchesSearch && matchesDate && matchesStatus && matchesPublic;
    });

    return result.sort((a, b) => {
      if (requestFilters.sort === "date") {
        return String(getRequestPrimaryDate(a) || "9999-12-31").localeCompare(
          String(getRequestPrimaryDate(b) || "9999-12-31")
        );
      }

      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  }, [jobsById, requestFilters, requests]);

  const filteredCompletedRequests = useMemo(() => {
    const search = requestFilters.search.trim().toLowerCase();

    const result = completedRequests.filter((request) => {
      const searchableText = [
        request.company_name,
        request.event_name,
        request.event_location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !search || searchableText.includes(search);
      const matchesDate =
        !requestFilters.month ||
        isDateRangeOverlappingMonth(
          getDateRangeStart(request.start_date || request.event_date, request.date),
          getDateRangeEnd(request.end_date || request.event_date, request.date),
          requestFilters.month
        );
      const matchesStatus = doesRequestMatchManagementStatusFilter(
        request,
        requestFilters.status
      );
      const matchesPublic =
        requestFilters.public === "all" ||
        String(isRequestJobPublic(request, jobsById)) === requestFilters.public;

      return matchesSearch && matchesDate && matchesStatus && matchesPublic;
    });

    return result.sort((a, b) => {
      if (requestFilters.sort === "date") {
        return String(getRequestPrimaryDate(a) || "9999-12-31").localeCompare(
          String(getRequestPrimaryDate(b) || "9999-12-31")
        );
      }

      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  }, [completedRequests, jobsById, requestFilters]);

  const filteredInterpreters = useMemo(() => {
    const search = interpreterFilters.search.trim().toLowerCase();

    return interpreters.filter((interpreter) => {
      const searchableText = [
        interpreter.name,
        interpreter.email,
        interpreter.phone,
        interpreter.region,
        interpreter.school,
        interpreter.jlpt,
        formatList(interpreter.available_regions),
        formatList(interpreter.specialties),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !search || searchableText.includes(search);
      const matchesLevel =
        interpreterFilters.level === "all" ||
        interpreter.level === interpreterFilters.level;
      const matchesStatus =
        interpreterFilters.status === "all" ||
        (interpreterFilters.status === WITHDRAWN_STATUS
          ? String(interpreter.status || "").trim().toLowerCase() === WITHDRAWN_STATUS
          : !isWithdrawnInterpreter(interpreter) &&
        (interpreterFilters.status === "inactive"
          ? getInterpreterActivityStatus(interpreter) === INTERPRETER_ACTIVITY_STATUS.INACTIVE
          : getInterpreterFilterStatus(interpreter) === interpreterFilters.status));
      const matchesActivity =
        interpreterFilters.activity === "all" ||
        getInterpreterActivityStatus(interpreter) === interpreterFilters.activity;
      const matchesApproved =
        interpreterFilters.approved === "all" ||
        String(Boolean(interpreter.approved)) === interpreterFilters.approved;
      const matchesResumeReview =
        interpreterFilters.resumeReview === "all" ||
        (interpreterFilters.resumeReview === "resume_review_pending" &&
          isResumeReviewPending(interpreter));
      const matchesDuplicate =
        interpreterFilters.duplicate === "all" ||
        duplicateInterpreterResult.duplicateIds.has(interpreter.id);

      return (
        matchesSearch &&
        matchesLevel &&
        matchesStatus &&
        matchesActivity &&
        matchesApproved &&
        matchesResumeReview &&
        matchesDuplicate
      );
    }).sort(sortInterpretersForAdmin);
  }, [duplicateInterpreterResult, interpreterFilters, interpreters]);

  const dashboard = useMemo(
    () => {
      const failedNotifications = notificationEvents.filter((event) => event.status === "failed").length;
      const pendingNotifications = notificationEvents.filter((event) => event.status === "pending").length;
      const unconfirmedBusinesses = businesses.filter((business) => isBusinessApprovalPending(business)).length;
      return {
        totalRequests: requests.length,
        totalInterpreters: interpreters.length,
        pendingInterpreters: pendingInterpreters.length,
        newRequests: newRequests.length,
        recruitingJobs: recruitingJobs.length,
        uncheckedApplications: jobApplications.filter((application) =>
          [APPLICATION_STATUS.PENDING, APPLICATION_STATUS.REVIEWING].includes(
            normalizeApplicationStatus(application.status)
          )
        ).length,
        pendingAssignments: pendingAssignmentRequests.length,
        settlementPending: settlementManagementRows.pending.length,
        unconfirmedBusinesses,
        processingNotifications: failedNotifications + pendingNotifications,
      };
    },
    [
      businesses,
      jobApplications,
      newRequests.length,
      notificationEvents,
      pendingInterpreters.length,
      pendingAssignmentRequests.length,
      recruitingJobs.length,
      requests.length,
      interpreters.length,
      settlementManagementRows.pending.length,
    ]
  );

  const operationDashboard = useMemo(
    () => buildOperationDashboard(requests, assignmentsByRequest, interpreters),
    [assignmentsByRequest, interpreters, requests]
  );
  const processingQueueItems = useMemo(
    () =>
      buildProcessingQueueItems({
        newRequests,
        pendingResumeReviewInterpreters,
        uncheckedApplications: jobApplications.filter((application) =>
          [APPLICATION_STATUS.PENDING, APPLICATION_STATUS.REVIEWING].includes(
            normalizeApplicationStatus(application.status)
          )
        ),
        pendingAssignmentRequests,
      }),
    [
      jobApplications,
      newRequests,
      pendingAssignmentRequests,
      pendingResumeReviewInterpreters,
    ]
  );
  const processingTaskItems = useMemo(
    () =>
      buildProcessingTaskItems({
        businesses,
        generatedDocuments,
        newRequests,
        pendingAssignmentRequests,
        requests,
        settlements,
      }),
    [businesses, generatedDocuments, newRequests, pendingAssignmentRequests, requests, settlements]
  );
  const revenueSummary = useMemo(
    () => buildRevenueSummary({ settlementRowsByScope: settlementManagementRows }),
    [settlementManagementRows]
  );
  const recentActivityItems = useMemo(
    () =>
      buildRecentActivityItems({
        adminActivityLogs,
        generatedDocuments,
        notificationEvents,
        payments,
        settlements,
      }),
    [adminActivityLogs, generatedDocuments, notificationEvents, payments, settlements]
  );
  const getInterpreterScheduleConflicts = useCallback(
    (interpreterId, range, excludeMatchingId) =>
      findLocalScheduleConflicts({
        interpreterId,
        matchings,
        newStartDate: range?.startDate,
        newEndDate: range?.endDate,
        excludeMatchingId,
      }),
    [matchings]
  );

  const currentSubTabs = SUB_TABS[activeMainTab] || [];

  const switchMainTab = (mainTabId) => {
    const mainTab = MAIN_TABS.find((tab) => tab.id === mainTabId);
    if (!mainTab) return;
    setActiveMainTab(mainTab.id);
    switchSubTab(mainTab.defaultSubTab);
  };

  const switchSubTab = (subTabId) => {
    const normalizedSubTabId = normalizeAdminSubTabId(subTabId);
    setActiveMainTab(SUB_TAB_TO_MAIN_TAB[normalizedSubTabId] || "new");
    setActiveSubTab(normalizedSubTabId);
    if (typeof window !== "undefined") {
      const adminPath = getAdminPathForSubTab(normalizedSubTabId);
      const pathWithNotificationType = normalizedSubTabId === "notification_history"
        ? `${adminPath}&notification_type=${encodeURIComponent(notificationHistoryType)}`
        : adminPath;
      window.history.replaceState(
        { page: "admin", subTab: normalizedSubTabId },
        "",
        pathWithNotificationType
      );
    }
  };

  const getSubTabCount = (subTabId) => {
    if (subTabId === "new_requests") return newRequests.length;
    if (subTabId === "new_interpreters") return pendingInterpreters.length;
    if (subTabId === "all_requests") return requests.length;
    if (subTabId === "jobs") return jobs.length;
    if (subTabId === "applications") {
      return jobApplications.filter(isApplicantManagementApplication).length;
    }
    if (subTabId === "assignments") {
      return assignmentRows.length + pendingAssignmentRequests.length;
    }
    if (subTabId === "registered_interpreters") return interpreters.length;
    if (subTabId === "verification_pending") return pendingResumeReviewInterpreters.length;
    if (subTabId === "interpreter_activity") return interpreters.length;
    if (subTabId === "all_businesses") return businesses.length;
    if (subTabId === "company_payments") return safePayments.length;
    if (subTabId === "settlement_waiting") return settlementManagementRows.pending.length;
    if (subTabId === "settlement_confirmed") return settlementManagementRows.confirmed.length;
    if (subTabId === "settlement_paying") return settlementManagementRows.paying.length;
    if (subTabId === "settlement_completed") return settlementManagementRows.completed.length;
    if (subTabId === "all_documents") return generatedDocuments.length;
    if (subTabId === "estimate_documents") {
      return generatedDocuments.filter((doc) => doc.document_type === "estimate").length;
    }
    if (subTabId === "completion_documents") {
      return generatedDocuments.filter((doc) => doc.document_type === "completion").length;
    }
    if (subTabId === "payout_documents") {
      return generatedDocuments.filter((doc) => doc.document_type === "payout").length;
    }
    if (subTabId === "admin_memos") return adminMemoDisplayItems.length;
    if (subTabId === "notification_history") return notificationEvents.length;
    if (subTabId === "admin_accounts") return adminUsers.length;
    return null;
  };

  const formatTabBadgeCount = (count) => {
    if (count >= 1000) return "999+";
    if (count >= 100) return "99+";
    return count;
  };

  const metricCards = [
    {
      label: "신규 의뢰",
      value: `${dashboard.newRequests}건`,
      description: "새 의뢰 확인 필요",
      tone: "purple",
      icon: Briefcase,
      targetTab: "new_requests",
    },
    {
      label: "배정 필요",
      value: `${dashboard.pendingAssignments}건`,
      description: "배정 확인 필요",
      tone: "red",
      icon: Eye,
      targetTab: "assignments",
    },
    {
      label: "진행 예정 업무",
      value: `${operationDashboard.weekItems.length}건`,
      description: "이번 주 운영 일정",
      tone: "blue",
      icon: Star,
      targetTab: "all_requests",
      requestStatus: OPERATION_STATUS.BEFORE_OPERATION,
    },
    {
      label: "정산 대기",
      value: `${dashboard.settlementPending}건`,
      description: "지급 확인 필요",
      tone: "green",
      icon: WalletCards,
      targetTab: "settlement_waiting",
    },
    {
      label: "미확인 기업",
      value: `${dashboard.unconfirmedBusinesses}건`,
      description: "기업 승인 확인",
      tone: "orange",
      icon: Building2,
      targetTab: "all_businesses",
    },
    {
      label: "처리 필요 알림",
      value: `${dashboard.processingNotifications}건`,
      description: "실패/대기 알림 확인",
      tone: "indigo",
      icon: Mail,
      targetTab: "notification_history",
    },
  ];

  const switchToJobsTab = () => {
    switchSubTab("jobs");
  };

  const handleMetricCardClick = (card) => {
    if (card.targetTab === "all_requests") {
      setRequestFilters((prev) => ({
        ...prev,
        search: "",
        month: "",
        status: card.requestStatus || "all",
        public: "all",
      }));
      switchSubTab("all_requests");
    } else if (
      ["registered_interpreters", "new_interpreters", "verification_pending"].includes(
        card.targetTab
      )
    ) {
      setInterpreterFilters({
        search: "",
        level: "all",
        status: "all",
        activity: "all",
        approved: "all",
        resumeReview: "all",
        duplicate: "all",
      });
      switchSubTab(card.targetTab);
    } else if (card.targetTab === "applications") {
      setApplicationFilters({
        status: "unchecked",
        duplicate: "all",
      });
      switchSubTab("applications");
    } else if (card.targetTab === "settlement_waiting") {
      setSettlementFilters((prev) => ({
        ...prev,
        status: "pending",
      }));
      switchSubTab("settlement_waiting");
    } else if (card.targetTab === "notification_history") {
      setNotificationFilters((prev) => ({
        ...prev,
        status: "failed",
      }));
      switchSubTab("notification_history");
    } else {
      switchSubTab(card.targetTab);
    }
  };

  const handleDashboardShortcut = (targetTab) => {
    if (targetTab === "new_requests") {
      setRequestFilters((prev) => ({ ...prev, status: "new_request", search: "", month: "" }));
    }
    switchSubTab(targetTab);
  };

  const updateAdminAccountDraft = (name, value) => {
    setAdminAccountDraft((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const createAdminUser = async () => {
    const email = adminAccountDraft.email.trim().toLowerCase();
    const authUserId = adminAccountDraft.auth_user_id.trim();
    const currentEmail = user?.email?.trim().toLowerCase() || "";
    const currentAdminRole =
      currentEmail === "onlinkwith@gmail.com" ? "owner" : adminProfile?.role || "staff";

    if (currentAdminRole !== "owner") {
      alert("owner 권한이 있는 관리자만 추가할 수 있습니다.");
      return;
    }

    if (!email || !email.includes("@")) {
      alert("관리자 이메일을 입력해주세요.");
      return;
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authUserId)) {
      alert("Supabase Auth user id(UUID)를 입력해주세요.");
      return;
    }

    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    setIsAdminAccountSaving(true);

    // admin_users 테이블에 직접 저장합니다. Auth 유저 생성은 하지 않습니다.
    const { error } = await supabase
      .from("admin_users")
      .upsert(
        {
          email,
          auth_user_id: authUserId,
          role: adminAccountDraft.role,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      );

    setIsAdminAccountSaving(false);

    if (error) {
      alert(`관리자 저장 실패: ${error.message}`);
      return;
    }

    setAdminAccountDraft({ email: "", auth_user_id: "", role: "staff" });
    await fetchAdminUsers();
    alert(`${email} 을(를) 관리자로 저장했습니다.\n해당 이메일로 직접 회원가입 후 로그인하면 관리자 권한이 적용됩니다.`);
  };

  const handleAdminRoleChange = async (adminUser, newRole) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    const ok = window.confirm(`${adminUser.email} 권한을 ${newRole}(으)로 변경하시겠습니까?`);
    if (!ok) return;

    setIsAdminAccountSaving(true);
    const { error } = await supabase
      .from("admin_users")
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq("email", adminUser.email);
    setIsAdminAccountSaving(false);

    if (error) {
      console.error("관리자 권한 저장 실패:", error);
      alert(`관리자 권한 저장 실패: ${error.message}`);
      return;
    }

    await fetchAdminUsers();
  };

  const handleAdminStatusChange = async (adminUser, newStatus) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    const ok = window.confirm(`${adminUser.email} 상태를 ${newStatus}(으)로 변경하시겠습니까?`);
    if (!ok) return;

    setIsAdminAccountSaving(true);
    const { error } = await supabase
      .from("admin_users")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("email", adminUser.email);
    setIsAdminAccountSaving(false);

    if (error) {
      console.error("관리자 상태 저장 실패:", error);
      alert(`관리자 상태 저장 실패: ${error.message}`);
      return;
    }

    await fetchAdminUsers();
  };

  const signOutAdmin = async () => {
    setIsAdminAccountSaving(true);
    const { error } = await signOut();
    setIsAdminAccountSaving(false);

    if (error) {
      alert(`로그아웃 실패: ${error.message}`);
      return;
    }

    window.location.href = "/login";
  };

  const getAdminNoteDraftKey = (targetType, targetId) =>
    `${targetType}:${String(targetId || "")}`;

  const updateAdminNoteDraft = (targetType, targetId, value) => {
    const key = getAdminNoteDraftKey(targetType, targetId);
    setAdminNoteDrafts((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const createAdminNote = async (targetType, targetId) => {
    const key = getAdminNoteDraftKey(targetType, targetId);
    const note = String(adminNoteDrafts[key] || "").trim();

    if (!note) {
      alert("내부 메모를 입력해주세요.");
      return false;
    }

    if (!supabase) {
      alert(supabaseConfigError.message);
      return false;
    }

    setSavingKey(`admin-note-${key}`);
    const { data, error } = await supabase
      .from("admin_notes")
      .insert([
        {
          target_type: targetType,
          target_id: String(targetId),
          note,
          created_by: user?.id || null,
        },
      ])
      .select("id, target_type, target_id, note, created_by, created_at, updated_at")
      .single();

    if (error) {
      setSavingKey("");
      console.error("admin note create failed:", error);
      alert(`내부 메모 저장 실패: ${error.message}`);
      return false;
    }

    const activityPayload = {
      target_type: targetType,
      target_id: String(targetId),
      action_type: "memo_created",
      before_value: null,
      after_value: { note },
      actor_user_id: user?.id || null,
    };
    const notificationPayload = {
      notification_type: "memo_created",
      title: "내부 메모 알림",
      message: note,
      channel: "internal",
      recipient_type: "admin",
      recipient_email: null,
      status: "pending",
      related_request_id: targetType === "request" ? targetId : null,
    };

    const [activityResult, notificationResult] = await Promise.all([
      supabase.from("admin_activity_logs").insert([activityPayload]).select("*").single(),
      supabase.from("notifications").insert([notificationPayload]).select("*").single(),
    ]);

    if (activityResult.error) {
      console.warn("admin note activity log skipped:", activityResult.error);
    } else if (activityResult.data) {
      setAdminActivityLogs((current) => [activityResult.data, ...current]);
    }

    if (notificationResult.error) {
      console.warn("admin note notification skipped:", notificationResult.error);
    } else if (notificationResult.data) {
      setNotificationEvents((current) =>
        uniqueById([...mapNotificationsToEvents([notificationResult.data]), ...current])
      );
    }

    setAdminNotes((current) => (data ? uniqueById([data, ...current]) : current));
    setAdminNoteDrafts((current) => ({ ...current, [key]: "" }));
    setSavingKey("");
    return true;
  };

  const refreshAdminOperationsData = async () => {
    if (!supabase) return;

    try {
      const results = await Promise.allSettled([
        supabase
          .from("admin_notes")
          .select(ADMIN_NOTES_SELECT)
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("admin_activity_logs")
          .select(ADMIN_ACTIVITY_LOGS_SELECT)
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("notifications")
          .select("*")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("payments")
          .select("id, request_id, company_id, estimate_document_id, amount, payment_status, payment_method, paid_at, due_date, admin_memo, created_at, updated_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("payment_logs")
          .select("id, payment_id, previous_status, new_status, changed_by, memo, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("settlements")
          .select(SETTLEMENTS_SELECT)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("settlement_logs")
          .select("id, settlement_id, previous_status, new_status, changed_by, memo, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      const getResultVal = (res, label) => {
        if (res.status === "fulfilled") {
          return res.value;
        }
        console.error(`${label} query failed or rejected:`, res.reason);
        return { data: [], error: res.reason };
      };

      const notesResult = getResultVal(results[0], "admin_notes");
      const logsResult = getResultVal(results[1], "admin_activity_logs");
      const notificationsResult = getResultVal(results[2], "notifications");
      const paymentsResult = getResultVal(results[3], "payments");
      const paymentLogsResult = getResultVal(results[4], "payment_logs");
      const settlementsResult = getResultVal(results[5], "settlements");
      const settlementLogsResult = getResultVal(results[6], "settlement_logs");

      if (notesResult.error) {
        console.error("admin notes refresh failed:", notesResult.error);
        setAdminNotes([]);
      } else {
        setAdminNotes(uniqueById(notesResult.data || []));
      }
      if (logsResult.error) {
        console.error("admin activity logs refresh failed:", logsResult.error);
        setAdminActivityLogs([]);
      } else {
        setAdminActivityLogs(logsResult.data || []);
      }
      if (notificationsResult.error) {
        console.error("notifications refresh failed:", notificationsResult.error);
      }
      setNotificationEvents(
        uniqueById(
          mapNotificationsToEvents(
            notificationsResult.error
              ? []
              : compactAdminRows(notificationsResult.data || []).filter((event) => !event.deleted_at)
          )
        )
      );
      setAdminDataErrors((current) => ({
        ...current,
        notifications: notificationsResult.error || null,
      }));
      if (paymentsResult.error) {
        console.error("payments refresh failed:", paymentsResult.error);
        setPayments([]);
      } else {
        setPayments(uniqueById(paymentsResult.data || []));
      }
      if (paymentLogsResult.error) {
        console.error("payment logs refresh failed:", paymentLogsResult.error);
        setPaymentLogs([]);
      } else {
        setPaymentLogs(uniqueById(paymentLogsResult.data || []));
      }
      if (settlementsResult.error) {
        logSupabaseError("settlements refresh", settlementsResult.error);
        setSettlements([]);
      } else {
        setSettlements(uniqueById(settlementsResult.data || []));
      }
      if (settlementLogsResult.error) {
        console.error("settlement logs refresh failed:", settlementLogsResult.error);
        setSettlementLogs([]);
      } else {
        setSettlementLogs(uniqueById(settlementLogsResult.data || []));
      }
    } catch (err) {
      console.error("refreshAdminOperationsData fatal error:", err);
    }
  };

  const deleteNotificationHistory = async (sourceIds) => {
    const ids = [...new Set((sourceIds || []).filter(Boolean))];
    if (!supabase || ids.length === 0) return false;
    setNotificationProcessing(true);
    try {
      const { error } = await supabase.from("notifications").delete().in("id", ids);
      if (error) throw error;
      setNotificationEvents((current) => current.filter((item) => !ids.includes(item.source_id)));
      return true;
    } catch (error) {
      console.error("notification history deletion failed:", error);
      alert(`알림 이력 삭제 실패: ${error.message || "권한을 확인해주세요."}`);
      return false;
    } finally {
      setNotificationProcessing(false);
    }
  };

  const sendNotificationEmail = async (event) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return false;
    }
    if (!event?.recipient_email) {
      alert("수신 이메일이 없어 발송할 수 없습니다.");
      return false;
    }
    if (getNotificationChannel(event) !== "email") {
      alert("이메일 채널 알림만 발송할 수 있습니다.");
      return false;
    }
    const isResend = event.status === "sent" || Boolean(event.sent_at);
    if (isResend && !window.confirm("이미 발송 완료된 이메일입니다. 동일 수신자에게 다시 발송하시겠습니까?")) {
      return false;
    }

    setNotificationProcessing(true);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const baseUrl = SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
      const functionUrl = `${baseUrl}/functions/v1/send-email`;
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) {
        throw new Error("관리자 로그인 세션을 확인할 수 없습니다.");
      }

      const res = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionData.session.access_token}`,
          "apikey": SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          notification_id: event.source_id || event.id,
          force_resend: isResend,
        })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("send-email non-2xx:", {
          status: res.status,
          body: data,
          notification_id: event.source_id || event.id,
        });
        alert(`이메일 발송 실패: ${data?.message || data?.error || `HTTP ${res.status}`}`);
        return false;
      }

      await refreshAdminOperationsData();

      if (data?.already_processing) {
        alert("이미 발송 처리 중입니다.");
        return true;
      }
      if (data?.already_sent) {
        alert("이미 발송 완료된 알림입니다.");
        return true;
      }

      const smtp = data?.smtp ?? {};

      if (!(data?.ok ?? data?.success)) {
        alert(
          `이메일 발송 실패: ${data?.message || data?.error || "알 수 없는 오류"}\n\n` +
          `accepted:\n${JSON.stringify(smtp.accepted ?? [])}\n\n` +
          `rejected:\n${JSON.stringify(smtp.rejected ?? [])}\n\n` +
          `response:\n${smtp.response ?? "-"}`
        );
        return false;
      }

      if (!Array.isArray(smtp.accepted) || smtp.accepted.length === 0) {
        alert(
          `이메일 발송 실패: SMTP 서버가 수신자를 정상 처리하지 않았습니다.\n\n` +
          `accepted:\n${JSON.stringify(smtp.accepted ?? [])}\n\n` +
          `rejected:\n${JSON.stringify(smtp.rejected ?? [])}\n\n` +
          `response:\n${smtp.response ?? "-"}`
        );
        return false;
      }

      alert(`이메일 발송 완료\n수신 처리: ${smtp.accepted.join(", ")}\nmessageId: ${smtp.messageId ?? "-"}`);
      return true;
    } catch (error) {
      console.error("notification email send failed:", error);
      alert(`이메일 발송 실패: ${error.message || "알 수 없는 오류"}`);
      return false;
    } finally {
      setNotificationProcessing(false);
    }
  };

  const updateCompanyPayment = async (paymentId, changes) => {
    if (!supabase || !paymentId) {
      alert(supabaseConfigError.message);
      return false;
    }

    setSavingKey(`company-payment-${paymentId}`);
    try {
      const payload = {
        payment_status: changes.payment_status,
        payment_method: changes.payment_method || null,
        paid_at: changes.paid_at || null,
        due_date: changes.due_date || null,
        admin_memo: changes.admin_memo || null,
      };

      const { data, error } = await supabase
        .from("payments")
        .update(payload)
        .eq("id", paymentId)
        .select("id, request_id, company_id, estimate_document_id, amount, payment_status, payment_method, paid_at, due_date, admin_memo, created_at, updated_at")
        .single();

      if (error) throw error;

      setPayments((current) =>
        current.map((payment) => (payment.id === paymentId ? { ...payment, ...data } : payment))
      );
      await refreshAdminOperationsData();
      alert("결제 상태가 저장되었습니다.");
      return true;
    } catch (error) {
      console.error("company payment update failed:", error);
      alert(`결제 상태 저장 실패: ${error.message || "원인을 확인해주세요."}`);
      return false;
    } finally {
      setSavingKey("");
    }
  };

  const recordInterpreterSettlementAmountChange = async (previousSettlement, nextSettlement) => {
    if (!supabase || !nextSettlement?.id) return;

    const previousAmount = normalizeMoneyInput(previousSettlement?.amount);
    const nextAmount = normalizeMoneyInput(nextSettlement.amount);
    if (previousAmount === nextAmount) return;

    try {
      const { data: activityData, error: activityError } = await supabase
        .from("admin_activity_logs")
        .insert({
          target_type: "settlement",
          target_id: String(nextSettlement.id),
          action_type: "interpreter_payment_amount_updated",
          before_value: { amount: previousAmount },
          after_value: { amount: nextAmount },
          actor_user_id: user?.id || null,
        })
        .select(ADMIN_ACTIVITY_LOGS_SELECT)
        .single();

      if (activityError) {
        console.warn("interpreter payment amount activity log skipped:", activityError);
      } else if (activityData) {
        setAdminActivityLogs((current) => [activityData, ...current]);
      }
    } catch (error) {
      console.warn("interpreter payment amount activity log skipped:", error);
    }

    try {
      const notificationPayload = {
        recipient_type: "interpreter",
        recipient_id: nextSettlement.interpreter_auth_user_id || null,
        notification_type: "interpreter_payment_amount_updated",
        title: "통역사 지급액 변경 안내",
        message: `통역사 지급액이 ${formatJPY(previousAmount)}에서 ${formatJPY(nextAmount)}로 변경되었습니다.`,
        related_request_id: nextSettlement.request_id || null,
        channel: "internal",
        status: "pending",
      };
      const { error: notificationError } = await supabase
        .from("notifications")
        .insert(notificationPayload);

      if (notificationError) {
        console.warn("interpreter payment amount notification skipped:", notificationError);
      }
    } catch (error) {
      console.warn("interpreter payment amount notification skipped:", error);
    }
  };

  const updateInterpreterSettlement = async (settlementId, changes) => {
    if (!supabase || !settlementId) {
      alert(supabaseConfigError.message);
      return false;
    }

    setSavingKey(`settlement-${settlementId}`);
    try {
      const previousSettlement = safeSettlements.find((settlement) => settlement.id === settlementId) || null;
      const hasAmountChange = Object.prototype.hasOwnProperty.call(changes, "amount");
      const nextSettlementStatus =
        changes.settlement_status !== undefined
          ? normalizeAdminSettlementStatus(changes.settlement_status)
          : null;
      const payload = {
        amount: hasAmountChange ? normalizeMoneyInput(changes.amount) : undefined,
        payout_status: changes.payout_status
          ? mapAdminSettlementStatusToPayoutStatus(changes.payout_status)
          : undefined,
        work_days: changes.work_days ? Number(changes.work_days) : null,
        daily_rate: changes.daily_rate ? normalizeMoneyInput(changes.daily_rate) : null,
        extra_amount: normalizeMoneyInput(changes.extra_amount),
        deduction_amount: normalizeMoneyInput(changes.deduction_amount),
        paid_at: changes.paid_at || null,
        payment_method: changes.payment_method || null,
        admin_memo: changes.admin_memo || null,
      };

      const cleanPayload = Object.fromEntries(
        Object.entries(payload).filter(([, value]) => value !== undefined)
      );

      let data = null;
      if (Object.keys(cleanPayload).length > 0) {
        const updateResult = await supabase
          .from("settlements")
          .update(cleanPayload)
          .eq("id", settlementId)
          .select(SETTLEMENTS_SELECT)
          .single();

        if (updateResult.error) throw updateResult.error;
        data = updateResult.data;
      }

      if (nextSettlementStatus) {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          "admin_update_settlement_status",
          {
            p_settlement_id: settlementId,
            p_next_status: nextSettlementStatus,
          }
        );
        if (rpcError) throw rpcError;
        data = rpcData;
      }

      if (!data) {
        throw new Error("수정된 정산 지급액을 DB에서 반환받지 못했습니다.");
      }

      setSettlements((current) =>
        current.map((settlement) =>
          settlement.id === settlementId ? { ...settlement, ...data } : settlement
        )
      );
      if (
        hasAmountChange &&
        Number(previousSettlement?.amount ?? 0) !== Number(data.amount ?? 0)
      ) {
        queueMicrotask(() => {
          recordInterpreterSettlementAmountChange(previousSettlement, data);
        });
      }
      await refreshAdminOperationsData();
      alert("지급 상태가 저장되었습니다.");
      return true;
    } catch (error) {
      console.error("interpreter settlement update failed:", error);
      alert(`지급 상태 저장 실패: ${error.message || "원인을 확인해주세요."}`);
      return false;
    } finally {
      setSavingKey("");
    }
  };

  const updateInterpreter = async (id, changes, options = {}) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return false;
    }

    if (!id) {
      alert("통역사 ID가 없어 수정할 수 없습니다.");
      return false;
    }

    const { payload, errorMessage: payloadErrorMessage } =
      prepareInterpreterUpdatePayload(changes);

    if (payloadErrorMessage) {
      alert(payloadErrorMessage);
      return false;
    }

    if (Object.keys(payload).length === 0) {
      alert("저장할 수 있는 변경 항목이 없습니다.");
      return false;
    }

    const payloadWithTimestamp = {
      ...payload,
      updated_at: new Date().toISOString(),
    };

    setSavingKey(`interpreter-${id}`);
    let updatePayload = payloadWithTimestamp;
    let { data, error } = await supabase
      .from("interpreters")
      .update(updatePayload)
      .eq("id", id)
      .select("*");

    if (error && updatePayload.updated_at && isMissingColumnError(error)) {
      updatePayload = { ...payload };
      ({ data, error } = await supabase
        .from("interpreters")
        .update(updatePayload)
        .eq("id", id)
        .select("*"));
    }

    setSavingKey("");

    if (error) {
      console.error("통역사 수정 실패:", error);
      console.error("통역사 수정 실패 상세:", {
        id,
        payload: updatePayload,
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      alert(`수정 실패: ${error.message}`);
      return false;
    }

    if (!data || data.length === 0) {
      alert("수정 실패: 변경된 row가 없습니다. id/RLS/컬럼명을 확인하세요.");
      return false;
    }

    const interpreter = interpreters.find((item) => item.id === id);
    const isNewApproval =
      updatePayload.status === "active" &&
      interpreter &&
      interpreter.status !== "active";
    const nextInterpreter = data[0] || { ...interpreter, ...updatePayload };
    const shouldSendResumeVerifiedEmail =
      interpreter &&
      isInterpreterResumeVerificationComplete(nextInterpreter) &&
      !isInterpreterResumeVerificationComplete(interpreter) &&
      !getResumeVerifiedEmailSentAt(interpreter) &&
      !getResumeVerifiedEmailSentAt(nextInterpreter);

    setInterpreters((current) =>
      current.map((item) => (item.id === id ? { ...item, ...nextInterpreter } : item))
    );
    setSelectedInterpreter((current) =>
      current?.id === id ? { ...current, ...nextInterpreter } : current
    );

    if (isNewApproval) {
      void sendAutoEmail("interpreter_approved", interpreter.email, {
        requestId: interpreter.id,
        interpreterId: interpreter.id,
        name: interpreter.name,
        email: interpreter.email,
        availableRegions: formatListOrMissing(interpreter.available_regions),
        specialties: formatListOrMissing(interpreter.specialties),
      });
    }

    let resumeVerifiedFeedback = "";
    if (shouldSendResumeVerifiedEmail) {
      const recipientEmail = getInterpreterVerificationEmail(nextInterpreter);

      if (!recipientEmail) {
        resumeVerifiedFeedback =
          "검증 완료 처리됨. 등록 이메일이 없어 안내 메일은 발송되지 않았습니다.";
      } else {
        const emailResult = await sendAutoEmail("resume_verified", recipientEmail, {
          requestId: nextInterpreter.id,
          interpreterId: nextInterpreter.id,
          name: nextInterpreter.name,
          email: recipientEmail,
          dedupeKey: `resume_verified:${nextInterpreter.id}`,
        });

        if (emailResult.ok) {
          const sentAt = new Date().toISOString();
          const timestampResult = await updateInterpreterResumeVerifiedEmailSentAt(
            nextInterpreter.id,
            sentAt
          );

          if (!timestampResult.error) {
            nextInterpreter.resume_verified_email_sent_at = sentAt;
            setInterpreters((current) =>
              current.map((item) =>
                item.id === id
                  ? { ...item, resume_verified_email_sent_at: sentAt }
                  : item
              )
            );
            setSelectedInterpreter((current) =>
              current?.id === id
                ? { ...current, resume_verified_email_sent_at: sentAt }
                : current
            );
          } else {
            console.error("검증 완료 이메일 발송 시각 저장 실패:", timestampResult.error);
          }

          resumeVerifiedFeedback =
            "이력서 검증 완료 처리 및 안내 이메일 발송이 완료되었습니다.";
        } else {
          console.error("이력서 검증 완료 안내 이메일 발송 실패:", emailResult.error || emailResult);
          resumeVerifiedFeedback =
            "검증 완료 처리는 완료되었지만 안내 이메일 발송에 실패했습니다.";
        }
      }
    }

    await fetchAdminData();
    await refreshAdminOperationsData();

    if (options.showSuccess) {
      alert(resumeVerifiedFeedback || "수정 완료");
    }

    return true;
  };

  const deleteInterpreter = async (id) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    if (!window.confirm("이 통역사 정보를 삭제할까요?")) return;

    setSavingKey(`interpreter-${id}`);
    const { error } = await supabase.from("interpreters").delete().eq("id", id);
    setSavingKey("");

    if (error) {
      console.error(error);
      alert("통역사 삭제에 실패했습니다.");
      return;
    }

    setInterpreters((current) => current.filter((item) => item.id !== id));
    if (selectedInterpreter?.id === id) closeInterpreterModal();
  };

  const openInterpreterModal = (interpreter, modalType) => {
    setSelectedInterpreter(interpreter);
    setInterpreterModalType(modalType);
    setInterpreterEditDraft(createInterpreterEditDraft(interpreter));
  };

  const updateInterpreterEditDraft = (name, value) => {
    setInterpreterEditDraft((current) => ({
      ...current,
      ...(name === "has_experience"
        ? {
            has_experience: value,
            experience_count: value === "true" ? current?.experience_count || "" : 0,
          }
        : { [name]: value }),
    }));
  };

  const openRequestModal = (type, request) => {
    const touched = settlementTouchedByRequest[request.id] || {};
    const requestWithDefaults =
      type === "detail" ? applySettlementDefaults(request, touched) : request;
    if (type === "detail" && requestWithDefaults !== request) {
      setRequests((current) =>
        current.map((item) =>
          item.id === request.id ? { ...item, ...requestWithDefaults } : item
        )
      );
    }
    setActiveRequestModal({ type, requestId: request.id, request: requestWithDefaults });
    setSelectedRequest(type === "detail" ? requestWithDefaults : null);
    const requestJob = request.job_id
      ? jobsById.get(String(request.job_id)) || jobsById.get(request.job_id) || null
      : null;
    setRequestEditDraft(
      type === "edit"
        ? { ...EMPTY_REQUEST_EDIT_DRAFT, ...createRequestEditDraft(request, requestJob) }
        : null
    );
  };

  const openDocumentPreview = (documentType, request) => {
    const requestAssignments = assignmentsByRequest.get(request.id) || [];
    if (documentType === "estimate") {
      setDocumentDraft(buildEstimateDraft(request));
      return;
    }
    if (documentType === "completion") {
      setDocumentDraft(buildCompletionDraft(request, requestAssignments));
      return;
    }
    setDocumentDraft(buildPaymentDraft(request, requestAssignments));
  };

  const updateDocumentDraft = (field, value) => {
    setDocumentDraft((current) => {
      if (!current) return current;
      const next = { ...current, [field]: value };
      if (current.documentType === "estimate") return recalculateEstimateDraft(next);
      if (current.documentType === "payout") return recalculatePaymentDraft(next);
      return next;
    });
  };

  const confirmDocumentGeneration = async () => {
    if (!documentDraft || !supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    const documentType = documentDraft.documentType;
    const request = documentDraft.request || {};
    setSavingKey(`document-${documentType}-${request.id || "new"}`);

    try {
      const { document, blob, fileName } = await createOnliDocument({
        supabase,
        draft: documentDraft,
        userId: user?.id,
      });

      setGeneratedDocuments((current) => uniqueById([document, ...current]));
      await downloadBlob(blob, fileName);

      if (documentType === "estimate" && request.id) {
        await updateRequest(request.id, { estimate_status: "estimate_required" });
      }

      setDocumentDraft(null);
      alert(`${getDocumentTypeLabel(documentType)}가 생성되었습니다.`);
    } catch (error) {
      console.error("document generation failed:", error);
      alert(`문서 생성 실패: ${error.message || "원인을 확인해주세요."}`);
    } finally {
      setSavingKey("");
    }
  };

  const createDocumentVersionFromExisting = async (document, draft) => {
    if (!supabase || !document?.id) {
      alert(supabaseConfigError.message);
      return;
    }

    const versions = generatedDocuments
      .filter((item) => item.document_no === document.document_no)
      .map((item) => Number(item.version || 1));
    const nextVersion = Math.max(Number(document.version || 1), ...versions) + 1;
    const amount = normalizeMoneyInput(draft.amount);
    const metadata = {
      ...(document.metadata || {}),
      revision_note: draft.revisionNote || "",
      admin_note: draft.adminNote || "",
    };
    const storagePath = [
      document.document_type || "document",
      document.request_id || document.interpreter_id || "no-reference",
      `${document.document_no}-v${nextVersion}.pdf`,
    ].join("/");

    setSavingKey(`document-version-${document.id}`);
    try {
      const pdfBlob = await createAdminDocumentPdfBlob({
        title: getDocumentTypeLabel(document.document_type),
        rows: [
          ["문서번호", document.document_no],
          ["버전", `v${nextVersion}`],
          ["관련 의뢰", metadata.eventName || metadata.event_name || document.title || "-"],
          ["기업명", metadata.companyName || metadata.company_name || "-"],
          ["통역사명", metadata.interpreterName || metadata.interpreter_name || "-"],
          ["금액", formatDocumentAmount(amount)],
          ["수정 메모", metadata.revision_note || "-"],
          ["관리자 메모", metadata.admin_note || "-"],
        ],
      });

      const { error: uploadError } = await supabase.storage
        .from(document.storage_bucket || "onli-documents")
        .upload(storagePath, pdfBlob, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const payload = {
        document_type: document.document_type,
        document_no: document.document_no,
        status: "issued",
        version: nextVersion,
        request_id: document.request_id || null,
        company_id: document.company_id || null,
        company_auth_user_id: document.company_auth_user_id || null,
        interpreter_id: document.interpreter_id || null,
        interpreter_auth_user_id: document.interpreter_auth_user_id || null,
        settlement_id: document.settlement_id || null,
        title: document.title || getDocumentTypeLabel(document.document_type),
        amount,
        storage_bucket: document.storage_bucket || "onli-documents",
        file_path: storagePath,
        metadata,
        created_by: user?.id || null,
      };

      const { data, error } = await supabase
        .from("documents")
        .insert([payload])
        .select("*")
        .single();
      if (error) throw error;

      setGeneratedDocuments((current) => uniqueById([data, ...current]));
      alert("새 버전이 생성되었습니다.");
    } catch (error) {
      console.error("document version create failed:", error);
      alert(`새 버전 생성 실패: ${error.message || "원인을 확인해주세요."}`);
    } finally {
      setSavingKey("");
    }
  };

  const voidGeneratedDocument = async (document) => {
    if (!supabase || !document?.id) return;
    if (!window.confirm("이 문서를 폐기 처리하시겠습니까? 파일과 버전 기록은 유지됩니다.")) {
      return;
    }

    setSavingKey(`document-void-${document.id}`);
    try {
      const { data, error } = await supabase
        .from("documents")
        .update({
          status: "voided",
          voided_at: new Date().toISOString(),
          voided_by: user?.id || null,
        })
        .eq("id", document.id)
        .select("*")
        .single();
      if (error) throw error;

      setGeneratedDocuments((current) =>
        current.map((item) => (item.id === data.id ? { ...item, ...data } : item))
      );
      alert("폐기 처리되었습니다.");
    } catch (error) {
      console.error("document void failed:", error);
      alert(`폐기 처리 실패: ${error.message || "원인을 확인해주세요."}`);
    } finally {
      setSavingKey("");
    }
  };

  const updateRequestEditDraft = (name, value) => {
    setRequestEditDraft((current) => ({
      ...EMPTY_REQUEST_EDIT_DRAFT,
      ...current,
      [name]: value,
    }));
  };

  const saveInterpreterEditDraft = async () => {
    if (!selectedInterpreter || !interpreterEditDraft) return;

    const isSaved = await updateInterpreter(
      selectedInterpreter.id,
      getInterpreterChangesFromDraft(interpreterEditDraft),
      { showSuccess: true }
    );
    if (isSaved && interpreterModalType === "edit") closeInterpreterModal();
  };

  const updateRequest = async (id, changes) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    const request = requests.find((item) => item.id === id);
    const shouldUpdateMoney = hasRequestMoneyChange(changes);
    const nextClientPrice = shouldUpdateMoney ? getCompanyAmount({ ...request, ...changes }) : null;
    const nextInterpreterPrice = shouldUpdateMoney ? getInterpreterPayment({ ...request, ...changes }) : null;
    const rawPayload = {
      ...changes,
      ...(Object.prototype.hasOwnProperty.call(changes, "request_type")
        ? { request_type: normalizeRequestType(changes.request_type) }
        : {}),
      ...(shouldUpdateMoney
        ? {
            company_amount: nextClientPrice,
            interpreter_payment: nextInterpreterPrice,
            platform_profit: nextClientPrice - nextInterpreterPrice,
            client_price: nextClientPrice,
            interpreter_price: nextInterpreterPrice,
            profit: nextClientPrice - nextInterpreterPrice,
          }
        : {}),
    };
    const payload = filterRequestUpdatePayload(rawPayload, request);

    if (Object.keys(payload).length === 0) {
      console.warn("Request update skipped: empty payload after filtering", {
        requestId: id,
        changes,
        rawPayload,
      });
      return;
    }

    setSavingKey(`request-${id}`);
    let { data, error } = await supabase
      .from("requests")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (error && isMissingColumnError(error)) {
      logRequestUpdateFailure("Request update column fallback", {
        payload,
        requestId: id,
        error,
      });
      const legacyPayload = {
        ...changes,
        ...(shouldUpdateMoney
          ? {
              client_price: nextClientPrice,
              interpreter_price: nextInterpreterPrice,
              profit: nextClientPrice - nextInterpreterPrice,
            }
          : {}),
      };
      delete legacyPayload.company_amount;
      delete legacyPayload.interpreter_payment;
      delete legacyPayload.platform_profit;
      delete legacyPayload.assignment_status;
      delete legacyPayload.operation_status;
      delete legacyPayload.settlement_status;
      delete legacyPayload.request_type;
      delete legacyPayload.estimate_status;
      delete legacyPayload.company_internal_memo;
      delete legacyPayload.event_start_time;
      delete legacyPayload.event_end_time;
      delete legacyPayload.language_direction;
      delete legacyPayload.materials_available;
      REQUEST_DATE_FIELDS.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(legacyPayload, field)) {
          legacyPayload[field] = toDbDate(legacyPayload[field]);
        }
      });

      const fallbackResult = await supabase
        .from("requests")
        .update(legacyPayload)
        .eq("id", id)
        .select("*")
        .single();
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    setSavingKey("");

    if (error) {
      console.error("request update failed:", error);
      logRequestUpdateFailure("Request update failed", {
        payload,
        requestId: id,
        error,
      });
      alert("의뢰 정보 변경에 실패했습니다. 콘솔 에러를 확인하세요.");
      return;
    }

    setRequests((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ...payload, ...(data || {}) } : item
      )
    );
    setSelectedRequest((current) =>
      current?.id === id ? { ...current, ...payload, ...(data || {}) } : current
    );

    const shouldSendUnderReviewEmail =
      changes.contact_status === "contacted" &&
      request?.contact_status !== "contacted";
    const companyEmail = getEmailRecipient(
      request?.company_email,
      request?.contact_email,
      request?.email,
      request?.contact_email_or_phone
    );

    if (shouldSendUnderReviewEmail) {
      void sendAutoEmail("company_request_under_review", companyEmail, {
        requestId: id,
        request_id: id,
        companyName: request?.company_name || "",
        contactName: request?.contact_name || request?.manager_name || "",
        eventName: request?.event_name || "",
        date: formatDateRange(
          request?.start_date,
          request?.end_date,
          request?.event_date
        ),
        location: request?.event_location || "",
      });
    }

    await fetchAdminData();
    await refreshAdminOperationsData();
  };

  const confirmNewRequest = async (request) => {
    if (!request?.id) {
      alert("의뢰 정보를 확인할 수 없습니다.");
      return false;
    }

    if (!supabase) {
      alert(supabaseConfigError.message);
      return false;
    }

    const checkedAt = new Date().toISOString();
    const checkedPayload = {
      admin_checked: true,
      checked_at: checkedAt,
    };
    const fallbackPayload = {
      status: MATCHING_STATUS.ASSIGNED,
      assignment_status: ASSIGNMENT_STATUS.WAITING,
    };

    setSavingKey(`new-request-${request.id}`);
    let { data, error } = await supabase
      .from("requests")
      .update(checkedPayload)
      .eq("id", request.id)
      .select("*")
      .single();

    if (error && isMissingColumnError(error)) {
      const fallbackResult = await supabase
        .from("requests")
        .update(fallbackPayload)
        .eq("id", request.id)
        .select("*")
        .single();
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    setSavingKey("");

    if (error) {
      console.error("신규 의뢰 확인 처리 실패:", error);
      alert(`확인 처리 실패: ${error.message}`);
      return false;
    }

    setRequests((current) =>
      current.map((item) =>
        item.id === request.id
          ? { ...item, ...checkedPayload, ...(data || {}) }
          : item
      )
    );
    alert("확인 처리되었습니다. 의뢰 관리에서 확인할 수 있습니다.");
    await fetchAdminData();
    await refreshAdminOperationsData();
    return true;
  };

  const confirmNewJobApplication = async (application) => {
    return updateJobApplicationStatus(application, APPLICATION_STATUS.REVIEWING, {
      confirmMessage: "이 지원을 확인 처리하시겠습니까?",
    });
  };

  const updateRequestFlowStatus = async (request, changes) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    const linkedJob = request?.job_id
      ? jobsById.get(String(request.job_id)) || jobsById.get(request.job_id) || null
      : null;
    const currentFlow = getRequestFlowSource(request, linkedJob);
    const nextFlow = { ...currentFlow, ...changes };
    const requestChanges = getRequestStatusPayloadFromFlow(nextFlow);
    const shouldPrepareSettlement =
      normalizeOperationStatus(requestChanges) === OPERATION_STATUS.COMPLETED &&
      normalizeSettlementFlowStatus(requestChanges) === SETTLEMENT_FLOW_STATUS.PENDING;
    if (shouldPrepareSettlement) {
      Object.assign(
        requestChanges,
        getSettlementSavePayload({ ...request, ...requestChanges })
      );
    }
    const jobChanges = getJobStatusPayloadFromFlow(nextFlow);

    setSavingKey(`request-${request.id}`);
    try {
      let updatedJob = null;
      if (request.job_id) {
        const { data, error } = await updateJobWithFallback(
          request.job_id,
          jobChanges
        );

        if (error) throw error;
        updatedJob = data;
      }

      const { data: updatedRequest, error: requestError } =
        await updateRequestWithFallback(request.id, requestChanges);

      if (requestError) throw requestError;

      setJobs((current) =>
        updatedJob
          ? current.map((job) =>
              String(job.id) === String(request.job_id)
                ? { ...job, ...jobChanges, ...updatedJob }
                : job
            )
          : current
      );
      setRequests((current) =>
        current.map((item) =>
          item.id === request.id
            ? { ...item, ...requestChanges, ...(updatedRequest || {}) }
            : item
        )
      );
      setSelectedRequest((current) =>
        current?.id === request.id
          ? { ...current, ...requestChanges, ...(updatedRequest || {}) }
          : current
      );
      await refreshAdminOperationsData();
    } catch (error) {
      console.error("operation flow status update error:", error);
      alert(`운영 단계 상태 변경 실패: ${error.message || "알 수 없는 오류"}`);
    } finally {
      setSavingKey("");
    }
  };

  const toggleRequestJobPublic = async (request, shouldBePublic) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    setSavingKey(`request-job-${request.id}`);

    try {
      if (shouldBePublic) {
        let jobId = request.job_id;
        let nextJob = jobId ? jobsById.get(jobId) : null;

        if (jobId) {
          const { data, error } = await updateJobVisibility(jobId, "public");
          if (error) throw error;
          nextJob = { ...nextJob, ...(data || {}), id: jobId, visibility: "public" };
        } else {
          const { data, error } = await createJobFromRequest(request);
          if (error) throw error;
          nextJob = data;
          jobId = data?.id;
        }

        const requestChanges = {
          is_public: true,
          is_job_public: true,
          ...(jobId ? { job_id: jobId } : {}),
        };
        const { data: updatedRequest, error: requestError } =
          await updateRequestWithFallback(request.id, requestChanges);

        if (requestError) throw requestError;

        if (nextJob?.id) {
          setJobs((current) => upsertById(current, nextJob));
        }
        setRequests((current) =>
          current.map((item) =>
            item.id === request.id ? { ...item, ...requestChanges, ...updatedRequest } : item
          )
        );
        return true;
      }

      if (request.job_id) {
        const { data, error } = await updateJobVisibility(request.job_id, "private");
        if (error) throw error;
        setJobs((current) =>
          current.map((job) =>
            job.id === request.job_id ? { ...job, ...(data || {}), visibility: "private" } : job
          )
        );
      }

      const requestChanges = { is_public: false, is_job_public: false };
      const { data: updatedRequest, error: requestError } =
        await updateRequestWithFallback(request.id, requestChanges);

      if (requestError) throw requestError;

      setRequests((current) =>
        current.map((item) =>
          item.id === request.id ? { ...item, ...requestChanges, ...updatedRequest } : item
        )
      );
      return true;
    } catch (error) {
      console.error("request job visibility error:", error);
      alert("공고 공개 처리에 실패했습니다.");
      return false;
    } finally {
      setSavingKey("");
    }
  };

  const saveRequestEditDraft = async () => {
    const draft = { ...EMPTY_REQUEST_EDIT_DRAFT, ...(requestEditDraft || {}) };

    if (!draft.id) {
      alert("수정 실패: 의뢰 ID가 없습니다.");
      return;
    }

    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    if (
      draft.start_date &&
      draft.end_date &&
      draft.end_date < draft.start_date
    ) {
      alert("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    const request = activeRequest || requests.find((item) => item.id === draft.id) || {};
    const peopleCount = Number(draft.people_count || 1);
    const clientPrice = normalizeMoneyInput(draft.price);
    const requestPayload = filterRequestUpdatePayload({
      event_name: draft.event_name,
      company_name: draft.company_name,
      request_no: draft.request_no,
      request_type: normalizeRequestType(draft.request_type),
      start_date: draft.start_date,
      end_date: draft.end_date,
      event_date: draft.start_date,
      event_location: draft.event_location,
      requested_people_count: peopleCount,
      required_count: peopleCount,
      requested_level: draft.requested_level,
      required_level: draft.requested_level,
      preferred_gender: draft.preferred_gender,
      status: getLegacyRequestStatusFromFlow(draft),
      assignment_status: normalizeAssignmentStatus(draft),
      operation_status: normalizeOperationStatus(draft),
      settlement_status: normalizeSettlementFlowStatus(draft),
      contact_status: draft.contact_status,
      payment_status: draft.payment_status,
      estimate_status: draft.estimate_status,
      company_internal_memo: draft.company_internal_memo,
      is_public: draft.is_public === "true",
      is_job_public: draft.is_public === "true",
      client_price: clientPrice,
      assigned_interpreter_name: draft.assigned_interpreter,
    }, request);
    const jobPayload = {
      event_name: draft.event_name,
      title: draft.event_name
        ? `${draft.event_name} 통역 모집`
        : "통역 모집",
      company_name: draft.company_name,
      start_date: draft.start_date,
      end_date: draft.end_date,
      event_date: draft.start_date,
      date: formatDateRange(
        draft.start_date,
        draft.end_date,
        draft.start_date
      ),
      location: draft.event_location,
      event_location: draft.event_location,
      people_count: peopleCount,
      people: `${peopleCount}명`,
      requested_level: draft.requested_level,
      level: draft.requested_level,
      preferred_gender: draft.preferred_gender,
      pay: draft.price,
      language: draft.language,
      visibility: draft.is_public === "true" ? "public" : "private",
      ...getJobStatusPayloadFromFlow(draft),
    };

    setSavingKey(`request-edit-${draft.id}`);
    try {
      if (Object.keys(requestPayload).length === 0) {
        console.warn("Request edit skipped: empty payload after filtering", {
          requestId: draft.id,
          draft,
        });
        alert("수정할 수 있는 의뢰 항목이 없습니다.");
        return;
      }

      const updatedRequest = await updateRequestStatus({
        supabase,
        requestId: draft.id,
        changes: requestPayload,
      });

      let updatedJob = null;
      if (request.job_id) {
        const { data, error } = await updateJobWithFallback(
          request.job_id,
          jobPayload
        );
        if (error) throw error;
        updatedJob = data;
      }

      setRequests((current) =>
        current.map((request) =>
          request.id === draft.id
            ? { ...request, ...requestPayload, ...updatedRequest }
            : request
        )
      );
      setJobs((current) =>
        updatedJob
          ? current.map((job) =>
              job.id === request.job_id ? { ...job, ...updatedJob } : job
            )
          : current
      );
      await fetchAdminData();
      await refreshAdminOperationsData();
      closeRequestModal();
      alert("공고 정보가 저장되었습니다.");
    } catch (error) {
      logRequestUpdateFailure("Request update failed", {
        payload: requestPayload,
        requestId: draft.id,
        error,
      });
      console.error("공고 수정 실패:", {
        requestId: draft.id,
        jobId: request.job_id,
        requestPayload,
        jobPayload,
        error,
      });
      alert("공고 수정에 실패했습니다.");
    } finally {
      setSavingKey("");
    }
  };

  const createJobFromRequest = async (request) => {
    const config = MANAGEMENT_NUMBER_CONFIG.jobs;
    const basePayload = buildJobPayloadFromRequest(request);
    let fullPayload = await addManagementNumber({
      supabase,
      table: "jobs",
      payload: basePayload,
      ...config,
    });
    let { data, error } = await supabase
      .from("jobs")
      .insert([fullPayload])
      .select("*")
      .single();

    if (isManagementNumberConflict(error, config.column)) {
      fullPayload = await addManagementNumber({
        supabase,
        table: "jobs",
        payload: basePayload,
        ...config,
      });
      const retryResult = await supabase
        .from("jobs")
        .insert([fullPayload])
        .select("*")
        .single();
      data = retryResult.data;
      error = retryResult.error;
    }

    if (!error) return { data, error: null };

    console.error("insert failed", {
      table: "jobs",
      payload: fullPayload,
      error,
    });
    console.error("jobs insert error:", error);
    if (!isMissingColumnError(error)) return { data: null, error };

    const legacyPayload = buildLegacyJobPayloadFromRequest(request);
    delete legacyPayload.job_no;
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("jobs")
      .insert([legacyPayload])
      .select("*")
      .single();

    if (fallbackError) console.error("jobs insert fallback error:", fallbackError);
    return { data: fallbackData, error: fallbackError };
  };

  const updateJobVisibility = async (jobId, visibility) => {
    const { data, error } = await supabase
      .from("jobs")
      .update({ visibility })
      .eq("id", jobId)
      .select("*")
      .single();

    if (!error) return { data, error: null };

    console.error("jobs visibility update error:", error);
    if (!isMissingColumnError(error)) return { data: null, error };

    const fallbackStatus = visibility === "private" ? "hidden" : "open";
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("jobs")
      .update({ status: fallbackStatus })
      .eq("id", jobId)
      .select("*")
      .single();

    if (fallbackError) console.error("jobs visibility fallback update error:", fallbackError);
    return { data: fallbackData, error: fallbackError };
  };

  const updateRequestWithFallback = async (requestId, changes) => {
    let previousRequest = null;
    const statusFields = ["status", "assignment_status", "operation_status", "settlement_status", "estimate_status", "payment_status"];
    const request = requests.find((item) => String(item.id) === String(requestId));
    const payload = filterRequestUpdatePayload(changes, request);
    const hasStatusChange = statusFields.some(field => field in payload);

    if (Object.keys(payload).length === 0) {
      console.warn("Request update skipped: empty payload after filtering", {
        requestId,
        changes,
      });
      return { data: null, error: null };
    }

    if (hasStatusChange) {
      const { data } = await supabase
        .from("requests")
        .select(statusFields.join(", "))
        .eq("id", requestId)
        .single();
      previousRequest = data;
    }

    let data = null;
    let error = null;
    try {
      data = await updateRequestStatus({ supabase, requestId, changes: payload });
    } catch (updateError) {
      error = updateError;
    }

    const handleNotification = async (updatedRequest) => {
      if (!previousRequest) return;

      for (const field of statusFields) {
        if (field in payload && previousRequest[field] !== updatedRequest[field]) {
          try {
            const previousStatus = previousRequest[field];
            const nextStatus = updatedRequest[field];
            const requestNo =
              updatedRequest.request_no ||
              updatedRequest.request_number ||
              updatedRequest.management_no ||
              updatedRequest.id;
            const businessProfile = businesses.find((business) => {
              if (updatedRequest.company_auth_user_id && business.auth_user_id) {
                return String(business.auth_user_id) === String(updatedRequest.company_auth_user_id);
              }
              if (updatedRequest.company_id && business.id) {
                return String(business.id) === String(updatedRequest.company_id);
              }
              return false;
            });
            const companyName =
              updatedRequest.company_name ||
              businessProfile?.company_name ||
              updatedRequest.contact_name ||
              updatedRequest.manager_name ||
              "기업";
            const companyEmail = getEmailRecipient(
              updatedRequest.company_email,
              businessProfile?.contact_email,
              updatedRequest.contact_email,
              updatedRequest.email,
              updatedRequest.contact_email_or_phone
            );
            const commonMessage = `${requestNo} 상태가 ${previousStatus || "-"}에서 ${nextStatus}로 변경되었습니다.`;
            const statusMetadata = {
              target_role: "admin",
              request_id: updatedRequest.id,
              request_no: requestNo,
              status_field: field,
              previous_status: previousStatus,
              next_status: nextStatus,
              event_name: updatedRequest.event_name || updatedRequest.title || "",
            };
            const notificationPayloads = [
              {
                notification_type: "status_changed",
                title: "상태 변경 알림",
                message: commonMessage,
                channel: "internal",
                target_role: "admin",
                recipient_type: "admin",
                recipient_name: "관리자",
                recipient_email: null,
                status: "pending",
                related_request_id: updatedRequest.id,
                metadata: statusMetadata,
              },
              {
                notification_type: "status_changed",
                title: "기업 상태 변경 안내",
                message: `${requestNo} 의뢰 상태가 변경되었습니다.`,
                channel: "email",
                target_role: "company",
                recipient_type: "company",
                recipient_name: companyName,
                recipient_email: companyEmail || null,
                status: "pending",
                related_request_id: updatedRequest.id,
                metadata: { ...statusMetadata, target_role: "company", company_name: companyName },
              },
            ];

            console.log("notifications insert payloads before status_changed insert:", {
              admin: notificationPayloads[0],
              company: notificationPayloads[1],
            });

            let { error: notificationInsertError } = await supabase
              .from("notifications")
              .insert(notificationPayloads);
            if (notificationInsertError && isMissingColumnError(notificationInsertError)) {
              console.warn(
                "notifications insert optional columns skipped:",
                notificationInsertError
              );
              const legacyNotificationPayloads = notificationPayloads.map(
                ({ target_role, recipient_name, metadata, ...payload }) => payload
              );
              ({ error: notificationInsertError } = await supabase
                .from("notifications")
                .insert(legacyNotificationPayloads));
            }
            if (notificationInsertError) throw notificationInsertError;
          } catch (err) {
            console.error("operational status notification insert failed:", err);
          }
        }
      }
    };

    if (!error) {
      return { data, error: null };
    }

    logRequestUpdateFailure("Request update failed", {
      payload,
      requestId,
      error,
    });
    if (!isMissingColumnError(error)) return { data: null, error };

    const legacyChanges = {};
    if (payload.is_public !== undefined) legacyChanges.is_public = Boolean(payload.is_public);
    if (payload.event_date !== undefined) legacyChanges.event_date = payload.event_date;
    if (Object.keys(legacyChanges).length === 0) return { data: null, error: null };

    const { data: fallbackData, error: fallbackError } = await supabase
      .from("requests")
      .update(legacyChanges)
      .eq("id", requestId)
      .select("*")
      .single();

    if (fallbackError) {
      logRequestUpdateFailure("Request update fallback failed", {
        payload: legacyChanges,
        requestId,
        error: fallbackError,
      });
    } else if (fallbackData) {
      await handleNotification(fallbackData);
    }
    return { data: fallbackData, error: fallbackError };
  };

  const handlePriceDraft = (requestId, field, value, options = {}) => {
    if (!options.auto) {
      setSettlementTouchedByRequest((current) => ({
        ...current,
        [requestId]: {
          ...(current[requestId] || {}),
          [field]: true,
        },
      }));
    }

    const updatePrice = (request) => {
      const numericValue = normalizeMoneyInput(value);
      const mirrorField =
        field === "company_amount" ? "client_price" : "interpreter_price";
      const nextRequest = {
        ...request,
        [field]: numericValue,
        [mirrorField]: numericValue,
      };
      if (field === "interpreter_payment") {
        nextRequest.settlement_final_amount = numericValue;
      }
      nextRequest.platform_profit =
        getCompanyAmount(nextRequest) - getInterpreterPayment(nextRequest);
      nextRequest.profit = nextRequest.platform_profit;
      return nextRequest;
    };

    setRequests((current) =>
      current.map((request) => (request.id === requestId ? updatePrice(request) : request))
    );
    setSelectedRequest((current) =>
      current?.id === requestId ? updatePrice(current) : current
    );
  };

  const saveSettlementRecordForRequest = async (request, payload, options = {}) => {
    const requestAssignments = assignmentsByRequest.get(request.id) || [];
    const assignment = requestAssignments.find((item) => item.interpreter_id) || requestAssignments[0] || null;
    const interpreterId =
      request.assigned_interpreter_id ||
      request.matched_interpreter_id ||
      request._settlement?.interpreter_id ||
      assignment?.interpreter_id;

    if (!interpreterId) {
      return { data: null, error: null, status: "not_required" };
    }

    const existingSettlement =
      safeSettlements.find(
        (item) =>
          String(item.request_id) === String(request.id) &&
          String(item.interpreter_id) === String(interpreterId)
      ) ||
      safeSettlements.find((item) => String(item.request_id) === String(request.id)) ||
      null;

    let settlementRow = existingSettlement;
    if (!settlementRow?.id) {
      const { data, error } = await supabase
        .from("settlements")
        .select(SETTLEMENTS_SELECT)
        .eq("request_id", request.id)
        .eq("interpreter_id", interpreterId)
        .maybeSingle();

      if (error) {
        console.error("settlement row lookup failed:", {
          requestId: request.id,
          interpreterId,
          payload,
          error,
        });
        return { data: null, error };
      }
      settlementRow = data;
    }

    const workDays = Math.max(1, Number(payload.settlement_work_days || 1));
    const amount =
      payload.settlement_final_amount === null
        ? null
        : normalizeMoneyInput(payload.settlement_final_amount);
    const settlementPayload = Object.entries({
      request_id: Number(request.id),
      interpreter_id: Number(interpreterId),
      assignment_id: assignment?.id || request._settlement?.assignment_id,
      amount,
      settlement_status: normalizeAdminSettlementStatus(payload.settlement_status),
      payout_status: mapSettlementFlowStatusToPayoutStatus(payload.settlement_status),
      work_days: workDays,
      daily_rate: amount === null ? 0 : workDays > 0 ? amount / workDays : amount,
      extra_amount: normalizeMoneyInput(payload.settlement_extra_amount),
      deduction_amount: normalizeMoneyInput(payload.settlement_deduction_amount),
      admin_memo: payload.settlement_memo || "",
    }).reduce((nextPayload, [key, value]) => {
      if (value !== undefined) nextPayload[key] = value;
      return nextPayload;
    }, {});

    const upsertPayload = settlementRow?.id && options.amountOnly
      ? {
          ...settlementRow,
          amount,
          daily_rate: amount === null ? 0 : workDays > 0 ? amount / workDays : amount,
        }
      : { ...(settlementRow || {}), ...settlementPayload };
    delete upsertPayload._request;
    delete upsertPayload._settlement;

    return supabase
      .from("settlements")
      .upsert(upsertPayload, { onConflict: "request_id,interpreter_id" })
      .select(SETTLEMENTS_SELECT)
      .single();
  };

  const saveSettlement = async (request, options = {}) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    const hasInterpreterPaymentInput = Object.prototype.hasOwnProperty.call(
      options,
      "interpreterPaymentInput"
    );
    const hasCompanyAmountInput = Object.prototype.hasOwnProperty.call(
      options,
      "companyAmountInput"
    );
    const rawCompanyAmountInput = String(options.companyAmountInput ?? "").trim();
    const nextCompanyAmount = rawCompanyAmountInput === ""
      ? null
      : Number(rawCompanyAmountInput.replaceAll(",", ""));
    const rawInterpreterPaymentInput = String(options.interpreterPaymentInput ?? "").trim();
    const nextInterpreterPaymentAmount = rawInterpreterPaymentInput === ""
      ? null
      : Number(rawInterpreterPaymentInput.replaceAll(",", ""));

    if (
      hasInterpreterPaymentInput &&
      nextInterpreterPaymentAmount !== null &&
      (Number.isNaN(nextInterpreterPaymentAmount) || nextInterpreterPaymentAmount < 0)
    ) {
      alert("통역사 지급액을 올바르게 입력해 주세요.");
      return;
    }
    if (
      hasCompanyAmountInput &&
      nextCompanyAmount !== null &&
      (Number.isNaN(nextCompanyAmount) || nextCompanyAmount < 0)
    ) {
      alert("기업 금액을 올바르게 입력해 주세요.");
      return;
    }

    const payload = {
      ...getSettlementSavePayload(request),
      ...(hasCompanyAmountInput
        ? {
            company_amount: nextCompanyAmount,
            client_price: nextCompanyAmount,
          }
        : {}),
      ...(hasInterpreterPaymentInput
        ? {
            settlement_final_amount: nextInterpreterPaymentAmount,
            interpreter_payment: nextInterpreterPaymentAmount,
            interpreter_price: nextInterpreterPaymentAmount,
          }
        : {}),
    };
    const companyAmount = hasCompanyAmountInput
      ? nextCompanyAmount
      : normalizeMoneyInput(payload.company_amount ?? payload.client_price);
    const interpreterAmountForProfit = payload.settlement_final_amount === null
      ? null
      : normalizeMoneyInput(payload.settlement_final_amount);
    const platformProfit =
      companyAmount !== null && interpreterAmountForProfit !== null
        ? companyAmount - interpreterAmountForProfit
        : null;
    payload.platform_profit = platformProfit;
    payload.profit = platformProfit;

    const requestPayload = {
      company_amount: companyAmount,
      client_price: companyAmount,
      platform_profit: platformProfit,
      profit: platformProfit,
      updated_at: new Date().toISOString(),
    };
    if (payload.settlement_final_amount === null || payload.settlement_final_amount === undefined) {
      requestPayload.settlement_final_amount = null;
    } else {
      requestPayload.interpreter_payment = interpreterAmountForProfit;
      requestPayload.interpreter_price = interpreterAmountForProfit;
      requestPayload.interpreter_fee = interpreterAmountForProfit;
      requestPayload.settlement_final_amount = interpreterAmountForProfit;
    }
    setSavingKey(`request-${request.id}`);
    try {
      const { data: result, error } = await supabase.rpc("save_request_financials", {
        p_request_id: Number(request.id),
        p_company_amount: companyAmount,
        p_interpreter_amount: interpreterAmountForProfit,
      });
      if (error) {
        console.error("금액 및 정산 저장 실패", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }

      const savedRequest = result?.request || requestPayload;
      setRequests((current) => current.map((item) =>
        item.id === request.id ? { ...item, ...savedRequest } : item
      ));
      setSelectedRequest((current) =>
        current?.id === request.id ? { ...current, ...savedRequest } : current
      );
      await fetchAdminData();
      await refreshAdminOperationsData();
      alert(result?.settlement_synced
        ? "의뢰 금액과 통역사 정산 내역이 저장되었습니다."
        : "의뢰 금액이 저장되었습니다. 통역사 배정 후 정산 내역이 생성됩니다.");
      return true;
    } catch (error) {
      alert(`금액 저장에 실패했습니다: ${error.message || "원인을 확인해주세요."}`);
      return false;
    } finally {
      setSavingKey("");
    }
  };

  const completeSettlementFromPendingModal = async (request) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    if (!window.confirm("정산완료로 변경하시겠습니까?")) return;

    setSavingKey(`settlement-pending-${request.id}`);
    await updateSettlementManagementStatus(request, {
      settlement_status: ADMIN_SETTLEMENT_STATUS.COMPLETED,
    });
    setSavingKey("");
  };

  const openRequestDetailFromSettlementPending = (request) => {
    setIsSettlementPendingModalOpen(false);
    openRequestModal("detail", request);
  };

  const assignInterpreter = async (requestId) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    const interpreterId = Number(assignmentDrafts[requestId]);

    if (!interpreterId) {
      alert("통역사를 선택해주세요.");
      return;
    }

    await assignInterpreterToRequest(requestId, interpreterId);
  };

  const assignInterpreterToRequest = async (
    requestId,
    interpreterId,
    { successAlert = true } = {}
  ) => {
    const request = requests.find((item) => item.id === requestId);
    const selectedJob = request?.job_id
      ? jobsById.get(String(request.job_id)) || jobsById.get(request.job_id) || null
      : null;
    const currentAssignments = assignmentsByRequest.get(requestId) || [];
    const requiredCount = getRequestRequiredCount(request);
    const scheduleRange = getAssignmentScheduleRange(request, selectedJob);

    if (
      currentAssignments.some(
        (assignment) => Number(assignment.interpreter_id) === interpreterId
      )
    ) {
      alert("이미 배정된 통역사입니다.");
      return false;
    }

    if (currentAssignments.length >= requiredCount) {
      alert("필요 인원이 모두 배정되었습니다.");
      return false;
    }

    const interpreter = interpreters.find(
      (item) => Number(item.id) === interpreterId
    );

    setSavingKey(`assign-${requestId}`);
    let existingAssignmentResult = await supabase
      .from("request_interpreters")
      .select("id, request_id, interpreter_id, contact_visible")
      .eq("request_id", requestId)
      .eq("interpreter_id", interpreterId)
      .limit(1);

    if (existingAssignmentResult.error) {
      console.error(
        "request_interpreters contact_visible select failed",
        existingAssignmentResult.error
      );
      existingAssignmentResult = await supabase
        .from("request_interpreters")
        .select("id, request_id, interpreter_id")
        .eq("request_id", requestId)
        .eq("interpreter_id", interpreterId)
        .limit(1);
    }

    const existingAssignments = normalizeRequestInterpreterRows(existingAssignmentResult.data);
    const existingAssignmentError = existingAssignmentResult.error;

    if (existingAssignmentError) {
      setSavingKey("");
      console.error("기존 통역사 배정 확인 실패:", existingAssignmentError);
      alert(`통역사 배정 확인에 실패했습니다: ${existingAssignmentError.message}`);
      return false;
    }

    const existingAssignment = Array.isArray(existingAssignments)
      ? existingAssignments[0]
      : null;
    if (existingAssignment) {
      const nextAssignment = {
        ...existingAssignment,
        interpreter: existingAssignment.interpreter || interpreter,
      };
      const nextAssignments = uniqueRequestInterpreterAssignments([
        ...currentAssignments,
        nextAssignment,
      ]);
      const requestChanges = buildAssignmentRequestChanges(nextAssignments, requiredCount);
      const { data: requestData, error: requestError } = await updateRequestAssignmentRow(requestId, requestChanges, {
        status: requestChanges.status,
      });
      if (!requestError) {
        await updateLinkedJobAssignmentStatus(
          request,
          nextAssignments.length,
          requiredCount,
          nextAssignments
        );
        const nextRequest = { ...requestChanges, ...(requestData || {}) };
        setRequests((current) =>
          current.map((item) =>
            item.id === requestId ? { ...item, ...nextRequest } : item
          )
        );
        setSelectedRequest((current) =>
          current?.id === requestId ? { ...current, ...nextRequest } : current
        );
      } else {
        console.error("기존 배정 상태 동기화 실패:", requestError);
      }
      setAssignments((current) => upsertAssignment(current, nextAssignment));
      setAssignmentDrafts((current) => ({ ...current, [requestId]: "" }));
      setSavingKey("");
      alert("이미 배정된 통역사입니다.");
      return false;
    }

    const conflictCheck = await confirmScheduleConflictOverride({
      interpreterId,
      scheduleRange,
      selectedJob,
      request,
      interpreter,
    });

    if (!conflictCheck.shouldProceed) {
      setSavingKey("");
      return false;
    }

    const payload = {
      request_id: requestId,
      interpreter_id: interpreterId,
    };
    let { data: assignmentData, error } = await supabase
      .from("request_interpreters")
      .upsert([payload], { onConflict: "request_id,interpreter_id" })
      .select("id, request_id, interpreter_id, contact_visible")
      .single();

    if (error && isMissingColumnError(error)) {
      console.error("request_interpreters contact_visible select failed", error);
      const insertFallbackResult = await supabase
        .from("request_interpreters")
        .select("id, request_id, interpreter_id")
        .eq("request_id", requestId)
        .eq("interpreter_id", interpreterId)
        .limit(1)
        .maybeSingle();

      if (!insertFallbackResult.error && insertFallbackResult.data) {
        assignmentData = { ...insertFallbackResult.data, contact_visible: false };
        error = null;
      }
    }

    if (error) {
      setSavingKey("");
      console.error("매칭 저장 디버그:", {
        selectedJob,
        requestId,
        selectedInterpreterId: interpreterId,
        selectedInterpreter: interpreter,
        table: "request_interpreters",
        payload,
        error,
      });
      console.error("통역사 매칭 실패:", error);
      alert(
        error.code === "23505"
          ? "이미 배정된 통역사입니다."
          : `통역사 매칭에 실패했습니다: ${error.message}`
      );
      return false;
    }

    const nextAssignment = {
      ...(assignmentData || {
        id: `${requestId}-${interpreterId}`,
        request_id: requestId,
        interpreter_id: interpreterId,
        assigned_at: new Date().toISOString(),
        interpreter,
      }),
      contact_visible: Boolean(assignmentData?.contact_visible),
      interpreter: assignmentData?.interpreter || interpreter,
    };
    console.log("assignment created debug", {
      request_id: nextAssignment.request_id,
      assignment_id: nextAssignment.id,
      interpreter_id: nextAssignment.interpreter_id,
    });
    const matchingData = await createMatchingScheduleSnapshot({
      request,
      selectedJob,
      interpreterId,
      scheduleRange,
    });
    if (conflictCheck.isOverride && matchingData?.id) {
      await logScheduleConflictOverride(matchingData.id, conflictCheck.conflicts);
    }

    const nextAssignments = uniqueRequestInterpreterAssignments([
      ...currentAssignments,
      nextAssignment,
    ]);
    const requestChanges = buildAssignmentRequestChanges(nextAssignments, requiredCount);
    const { data: requestData, error: requestError } =
      await updateRequestAssignmentRow(requestId, requestChanges, {
        status: requestChanges.status,
      });

    if (!requestError) {
      await updateLinkedJobAssignmentStatus(
        request,
        nextAssignments.length,
        requiredCount,
        nextAssignments
      );
    }

    setSavingKey("");

    if (requestError) {
      console.error("매칭 저장 디버그:", {
        selectedJob,
        requestId,
        selectedInterpreterId: interpreterId,
        selectedInterpreter: interpreter,
        table: "requests",
        payload: requestChanges,
        error: requestError,
      });
      console.error("통역사 매칭 실패:", requestError);
      alert(`통역사 매칭에 실패했습니다: ${requestError.message}`);
      return false;
    }

    const nextRequest = { ...requestChanges, ...(requestData || {}) };
    setRequests((current) =>
      current.map((request) =>
        request.id === requestId ? { ...request, ...nextRequest } : request
      )
    );
    setSelectedRequest((current) =>
      current?.id === requestId ? { ...current, ...nextRequest } : current
    );
    setAssignments((current) =>
      upsertAssignment(current, nextAssignment)
    );
    setAssignmentDrafts((current) => ({ ...current, [requestId]: "" }));
    await updateMatchingApplicationStatus(request, interpreter, APPLICATION_STATUS.ACCEPTED);

    const matchingEmailPayload = {
      requestId,
      request_id: requestId,
      interpreterId: interpreter?.id || "",
      name: interpreter?.name || "",
      interpreterName: interpreter?.name || "",
      jobTitle:
        selectedJob?.title ||
        request?.event_name ||
        request?.company_name ||
        "ON-LI 통역 의뢰",
      eventName: request?.event_name || selectedJob?.event_name || selectedJob?.title || "",
      companyName: selectedJob?.company_name || request?.company_name || "",
      contactName: request?.contact_name || request?.manager_name || "",
      date: formatDateRange(
        request?.start_date || selectedJob?.start_date,
        request?.end_date || selectedJob?.end_date,
        request?.event_date || selectedJob?.event_date || selectedJob?.date
      ),
      location:
        request?.event_location ||
        selectedJob?.event_location ||
        selectedJob?.location ||
        "",
    };
    const companyEmail = getEmailRecipient(
      request?.company_email,
      request?.contact_email,
      request?.email,
      request?.contact_email_or_phone
    );

    void Promise.all([
      sendAutoEmail(
        "interpreter_matching_confirmed",
        interpreter?.email,
        matchingEmailPayload
      ),
      sendAutoEmail(
        "company_matching_confirmed",
        companyEmail,
        matchingEmailPayload
      ),
      sendAdminAutoEmail("company_matching_confirmed", matchingEmailPayload),
    ]);

    await fetchAdminData();
    const { data: latestRequest } = await supabase
      .from("requests")
      .select("*")
      .eq("id", requestId)
      .single();
    if (latestRequest) {
      setSelectedRequest((current) =>
        current?.id === requestId ? { ...current, ...latestRequest } : current
      );
    }

    if (successAlert) alert("통역사 매칭이 완료되었습니다.");
    return true;
  };

  const confirmScheduleConflictOverride = async ({
    interpreterId,
    scheduleRange,
    selectedJob,
    request,
    interpreter,
  }) => {
    if (!scheduleRange.startDate || !scheduleRange.endDate) {
      console.warn("schedule conflict check skipped: missing assignment date", {
        request,
        selectedJob,
        interpreterId,
      });
      return { shouldProceed: true, isOverride: false, conflicts: [] };
    }

    const { conflicts, error } = await checkInterpreterScheduleConflict({
      interpreterId,
      newStartDate: scheduleRange.startDate,
      newEndDate: scheduleRange.endDate,
      supabase,
    });

    if (error) {
      console.error("schedule conflict check failed:", error);
      alert("일정 충돌 확인에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return { shouldProceed: false, isOverride: false, conflicts: [] };
    }

    if (conflicts.length === 0) {
      return { shouldProceed: true, isOverride: false, conflicts: [] };
    }

    const shouldOverride = window.confirm(
      buildScheduleConflictMessage(conflicts, selectedJob || request, interpreter)
    );

    return {
      shouldProceed: shouldOverride,
      isOverride: shouldOverride,
      conflicts,
    };
  };

  const logScheduleConflictOverride = async (matchingId, conflicts = []) => {
    const memo = `일정 충돌 경고 후 관리자가 강제 배정함. 기존 일정: ${conflicts
      .map((conflict) => getConflictEventTitle(conflict))
      .filter(Boolean)
      .join(", ") || "확인 필요"}`;

    const { error } = await supabase.from("admin_logs").insert([
      {
        action: "schedule_conflict_override",
        target_type: "matching",
        target_id: matchingId,
        memo,
      },
    ]);

    if (error) console.warn("schedule conflict override log skipped:", error);
  };

  const createMatchingScheduleSnapshot = async ({
    request,
    selectedJob,
    interpreterId,
    scheduleRange,
  }) => {
    const basePayload = {
      job_id: selectedJob?.id || null,
      request_id: request?.id || null,
      interpreter_id: interpreterId,
      start_date: scheduleRange.startDate,
      end_date: scheduleRange.endDate,
      status: "assigned",
    };
    const config = MANAGEMENT_NUMBER_CONFIG.matchings;
    let payload = await addManagementNumber({
      supabase,
      table: "matchings",
      payload: basePayload,
      ...config,
    });

    let { data, error } = await supabase
      .from("matchings")
      .insert([payload])
      .select("id, matching_no, job_id, request_id, interpreter_id, start_date, end_date, status")
      .single();

    if (isManagementNumberConflict(error, config.column)) {
      payload = await addManagementNumber({
        supabase,
        table: "matchings",
        payload: basePayload,
        ...config,
      });
      const retryResult = await supabase
        .from("matchings")
        .insert([payload])
        .select("id, matching_no, job_id, request_id, interpreter_id, start_date, end_date, status")
        .single();
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error) {
      console.error("insert failed", {
        table: "matchings",
        payload,
        error,
      });
      console.warn("matching schedule snapshot skipped:", error);
      return null;
    }

    setMatchings((current) => [data, ...current]);
    return data;
  };

  const removeAssignment = async (assignment) => {
    if (!window.confirm("이 통역사의 매칭을 취소하시겠습니까?")) return;

    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    const assignmentId =
      typeof assignment === "object" ? assignment?.id : assignment;

    setSavingKey(`assignment-${assignmentId}`);
    const { error } = await supabase
      .from("request_interpreters")
      .delete()
      .eq("id", assignmentId);
    setSavingKey("");

    if (error) {
      console.error("매칭 취소 실패:", error);
      alert(`매칭 취소에 실패했습니다: ${error.message}`);
      return;
    }

    // The request_interpreters lifecycle trigger atomically restores the
    // application and recalculates request/job assignment state.
    await fetchAdminData();
    alert("매칭이 취소되었습니다.");
  };

  const handleContactVisibleChange = async (requestInterpreterId, checked) => {
    if (!requestInterpreterId) return;
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    console.log("contact visible update payload", {
      requestInterpreterId,
      checked,
    });

    const { error } = await supabase
      .from("request_interpreters")
      .update({ contact_visible: checked })
      .eq("id", requestInterpreterId);

    if (error) {
      console.error("contact visibility update failed", error);
      alert("연락처 공개 설정 저장에 실패했습니다. Supabase migration 적용 여부를 확인하세요.");
      return;
    }

    setAssignments((current) =>
      current.map((item) =>
        String(item.id) === String(requestInterpreterId)
          ? { ...item, contact_visible: checked }
          : item
      )
    );
  };

  const updateMatchingApplicationStatus = async (request, interpreter, status) => {
    if (!request?.job_id || !interpreter) return;

    const application = findApplicationForInterpreter(
      jobApplicationsByJob.get(String(request.job_id)) || [],
      interpreter
    );

    if (!application?.id) return;

    const { error } = await supabase
      .from("job_applications")
      .update({ status })
      .eq("id", application.id);

    if (error) {
      console.error("지원자 배정 상태 동기화 실패:", {
        table: "job_applications",
        id: application.id,
        payload: { status },
        error,
      });
      return;
    }

    setJobApplications((current) =>
      current.map((item) =>
        item.id === application.id ? { ...item, status } : item
      )
    );
  };

  const updateLinkedJobAssignmentStatus = async (
    request,
    assignedCount,
    requiredCount,
    nextAssignments = []
  ) => {
    if (!request?.job_id) return;

    const isAssigned = assignedCount >= requiredCount;
    const status = isAssigned ? JOB_STATUS.ASSIGNED : JOB_STATUS.RECRUITING;
    const assignmentStatus = isAssigned
      ? ASSIGNMENT_STATUS.ASSIGNED
      : assignedCount > 0
        ? ASSIGNMENT_STATUS.ASSIGNING
        : ASSIGNMENT_STATUS.WAITING;
    const { data, error } = await updateJobWithFallback(request.job_id, {
      status,
      assignment_status: assignmentStatus,
    });

    if (error) {
      console.error("linked job assignment status update error:", error);
      return;
    }

    setJobs((current) =>
      current.map((job) =>
        job.id === request.job_id
          ? {
              ...job,
              ...(data || {}),
              status,
              assignment_status: assignmentStatus,
              assigned_count: assignedCount,
              matched_count: assignedCount,
              assigned_interpreters: nextAssignments.map((assignment) =>
                getAssignmentInterpreter(assignment, interpreters)
              ),
            }
          : job
      )
    );
  };

  const updateRequestAssignmentRow = async (
    requestId,
    changes,
    fallbackChanges
  ) => {
    const request = requests.find((item) => String(item.id) === String(requestId));
    const payload = filterRequestUpdatePayload(changes, request);
    const { data, error } = await supabase
      .from("requests")
      .update(payload)
      .eq("id", requestId)
      .select("*")
      .single();

    if (!error) return { data, error: null };
    if (!isMissingColumnError(error)) return { data: null, error };

    logRequestUpdateFailure("Request assignment update column fallback", {
      payload,
      requestId,
      error,
    });
    const safeFallbackChanges = filterRequestUpdatePayload(fallbackChanges, request);
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("requests")
      .update(safeFallbackChanges)
      .eq("id", requestId)
      .select("*")
      .single();

    if (fallbackError) {
      logRequestUpdateFailure("Request assignment update fallback failed", {
        payload: safeFallbackChanges,
        requestId,
        error: fallbackError,
      });
    }

    return { data: fallbackData, error: fallbackError };
  };

  const updateJobApplicationStatus = async (
    application,
    status,
    { confirmMessage, askAssignJob = false } = {}
  ) => {
    const applicationId =
      typeof application === "object" ? application?.id : application;
    const jobId = typeof application === "object" ? application?.job_id : null;

    if (!applicationId) {
      alert("지원자 정보를 확인할 수 없습니다.");
      return false;
    }

    if (!supabase) {
      alert(supabaseConfigError.message);
      return false;
    }

    if (confirmMessage && !window.confirm(confirmMessage)) return false;

    setSavingKey(`job-application-${applicationId}`);

    try {
      const { error } = await supabase
        .from("job_applications")
        .update({ status })
        .eq("id", applicationId);

      if (error) {
        console.error("지원자 상태 변경 실패:", error);
        alert(error.message);
        return false;
      }

      if (status === APPLICATION_STATUS.ACCEPTED && jobId) {
        const request = requestsByJobId.get(String(jobId));
        const interpreter = findInterpreterForApplication(application, interpreters);

        if (request && interpreter) {
          await assignInterpreterToRequest(request.id, interpreter.id, {
            successAlert: false,
          });
        } else {
          console.warn("지원자와 연결할 통역사 정보를 찾지 못했습니다.", {
            application,
            jobId,
            requestId: request?.id,
          });
        }
      }

      if (askAssignJob && status === APPLICATION_STATUS.ACCEPTED && jobId) {
        const shouldAssignJob = window.confirm(
          "이 공고를 배정완료로 변경할까요?"
        );

        if (shouldAssignJob) {
          const { error: jobError } = await updateJobWithFallback(jobId, {
            status: JOB_STATUS.ASSIGNED,
            assignment_status: ASSIGNMENT_STATUS.ASSIGNED,
            is_urgent: false,
          });

          if (jobError) {
            console.error("Failed to update job status", jobError);
            alert("상태 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
          }
        }
      }

      await fetchAdminData();
      await refreshAdminOperationsData();
      return true;
    } finally {
      setSavingKey("");
    }
  };

  const updateSettlementManagementStatus = async (request, changes) => {
    if (!request?.id) {
      alert("의뢰 정보를 확인할 수 없습니다.");
      return false;
    }

    if (!supabase) {
      alert(supabaseConfigError.message);
      return false;
    }

    setSavingKey(`settlement-request-${getSettlementRequestRowKey(request)}`);
    const requestedStatus = normalizeAdminSettlementStatus(
      changes.settlement_status || request.settlement_status || request._settlement?.settlement_status
    );
    const allowedSettlementStatuses = new Set([
      ADMIN_SETTLEMENT_STATUS.WAITING,
      ADMIN_SETTLEMENT_STATUS.CONFIRMED,
      ADMIN_SETTLEMENT_STATUS.PAYING,
      ADMIN_SETTLEMENT_STATUS.COMPLETED,
    ]);

    try {
      if (!allowedSettlementStatuses.has(requestedStatus)) {
        throw new Error(`지원하지 않는 정산 상태입니다: ${requestedStatus}`);
      }

      const requestId = Number(request.request_id || request.id);
      let settlementId = request.settlement_id || request._settlement_id || request._settlement?.id;

      if (!settlementId && requestId) {
        const { data: existingSettlement, error: findError } = await supabase
          .from("settlements")
          .select("id, request_id, settlement_status, updated_at, created_at")
          .eq("request_id", requestId)
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();

        if (findError) throw findError;
        settlementId = existingSettlement?.id;
      }

      if (!settlementId) {
        const settlementPayload = getSettlementSavePayload({
          ...request,
          settlement_status: ADMIN_SETTLEMENT_STATUS.WAITING,
        });
        const createResult = await saveSettlementRecordForRequest(
          { ...request, settlement_status: ADMIN_SETTLEMENT_STATUS.WAITING },
          settlementPayload
        );
        if (createResult.error) throw createResult.error;
        settlementId = createResult.data?.id;
      }

      if (!settlementId) {
        throw new Error("정산 row를 생성할 수 없습니다. 연결된 통역사 정보를 확인해주세요.");
      }

      const { data, error } = await supabase
        .from("settlements")
        .update({
          settlement_status: mapAdminSettlementStatusToDbStatus(requestedStatus),
          updated_at: new Date().toISOString(),
        })
        .eq("id", settlementId)
        .select("id, request_id, settlement_status")
        .single();
      if (error) throw error;
      if (!data) throw new Error("정산 상태 변경 후 반환 데이터가 없습니다.");

      await fetchAdminData();
      await refreshAdminOperationsData();
      if (requestedStatus === "settlement_waiting") {
        switchSubTab("settlement_waiting");
      } else if (requestedStatus === "settlement_confirmed") {
        switchSubTab("settlement_confirmed");
      } else if (requestedStatus === "settlement_paying") {
        switchSubTab("settlement_paying");
      } else {
        switchSubTab("settlement_completed");
      }
      return true;
    } catch (error) {
      console.error("admin_update_settlement_status payload", {
        requestId: request.id,
        settlementId: request._settlement_id || request._settlement?.id || null,
        requestedStatus,
        changes,
        message: error?.message || String(error),
      });
      logSupabaseFetchError("admin_update_settlement_status", error);
      alert(`정산 상태 변경 실패: ${requestedStatus} / ${error?.message || String(error)}`);
      return false;
    } finally {
      setSavingKey("");
    }
  };

  const deleteJobApplication = async (application) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    if (!window.confirm("이 지원자를 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.")) {
      return;
    }

    setSavingKey(`job-application-delete-${application.id}`);
    const { data: deletedApplication, error } = await supabase
      .from("job_applications")
      .delete()
      .eq("id", application.id)
      .select("id")
      .maybeSingle();
    setSavingKey("");

    if (error) {
      console.error("지원자 삭제 실패:", error);
      alert(error.message);
      return;
    }

    if (!deletedApplication?.id) {
      console.error("지원자 삭제 실패: 삭제된 행이 없습니다.", {
        table: "job_applications",
        id: application.id,
      });
      alert("지원 내역이 실제로 삭제되지 않았습니다. 관리자 권한을 확인해주세요.");
      return;
    }

    await fetchAdminData();
  };

  const deleteRequest = async (request) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    setSavingKey(`request-delete-${request.id}`);

    try {
      console.info("의뢰/공고 삭제 대상:", {
        requestId: request.id,
        jobId: request.job_id || null,
      });

      if (request.job_id) {
        const { error: applicationError } = await supabase
          .from("job_applications")
          .delete()
          .eq("job_id", request.job_id);

        if (applicationError) throw applicationError;

        const { error: jobError } = await supabase
          .from("jobs")
          .delete()
          .eq("id", request.job_id);

        if (jobError) throw jobError;
      }

      await deleteRequestRelatedRows(request.id);

      const { error: requestError } = await supabase
        .from("requests")
        .delete()
        .eq("id", request.id)
        .select("id")
        .single();

      if (requestError) throw requestError;

      setRequests((current) => current.filter((item) => item.id !== request.id));
      setJobs((current) =>
        request.job_id
          ? current.filter((job) => String(job.id) !== String(request.job_id))
          : current
      );
      setJobApplications((current) =>
        request.job_id
          ? current.filter(
              (application) => String(application.job_id) !== String(request.job_id)
            )
          : current
      );
      setAssignments((current) =>
        current.filter((assignment) => assignment.request_id !== request.id)
      );
      setExpandedRequestId((current) => (current === request.id ? null : current));
      setApplicationsRequestId((current) => (current === request.id ? null : current));
      closeRequestModal();
      alert("삭제되었습니다.");
    } catch (error) {
      console.error("의뢰 삭제 실패:", error);
      alert("삭제에 실패했습니다.");
    } finally {
      setSavingKey("");
    }
  };

  const deleteRequestRelatedRows = async (requestId) => {
    const [assignmentResult, applicationResult] = await Promise.all([
      supabase.from("request_interpreters").delete().eq("request_id", requestId),
      supabase.from("request_applications").delete().eq("request_id", requestId),
    ]);

    if (assignmentResult.error) throw assignmentResult.error;
    if (applicationResult.error) throw applicationResult.error;
  };

  return (
    <div className="admin-page">
      <div className="admin-shell">
        <header className="admin-header">
          <div>
            <p className="admin-kicker">ON-LI ADMIN</p>
            <h1>운영 대시보드</h1>
            <p>필요한 항목만 빠르게 확인하고 상태를 변경합니다.</p>
          </div>

          <div className="admin-header-actions">
            <button
              type="button"
              onClick={() => {
                if (onBackClick) {
                  onBackClick();
                } else {
                  window.location.href = "/";
                }
              }}
              className="admin-home-button"
            >
              <span className="full-text">← 홈페이지</span>
              <span className="mobile-text">← 홈</span>
            </button>
            <button type="button" onClick={fetchAdminData} className="admin-refresh">
              새로고침
            </button>
            <button
              type="button"
              onClick={openAdminAccountModal}
              className="admin-account-button"
            >
              관리자 계정 관리
            </button>
          </div>
        </header>

        {loading && <MessageBox text="관리자 데이터를 불러오는 중입니다..." />}
        {errorMessage && <MessageBox text={errorMessage} />}
        {!loading && (
          <>
            <section className="admin-metrics">
              {metricCards.map((card) => (
                <MetricCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  description={card.description}
                  icon={card.icon}
                  tone={card.tone}
                  onClick={() => handleMetricCardClick(card)}
                />
              ))}
            </section>

            <OperationOverview
              todayItems={operationDashboard.todayItems}
              urgentItems={operationDashboard.urgentItems}
              weekItems={operationDashboard.weekItems}
              onOpenRequest={(request) => {
                switchSubTab("requests");
                openRequestModal("detail", request);
              }}
            />

            <ProcessingTaskList
              items={processingTaskItems}
              onOpenItem={(item) => handleDashboardShortcut(item.targetSubTab)}
            />

            <ProcessingQueue
              items={processingQueueItems}
              onOpenItem={(item) => switchSubTab(item.targetSubTab)}
            />

            <nav className="admin-tabs admin-main-tabs" aria-label="관리자 상위 메뉴">
              {MAIN_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={activeMainTab === tab.id ? "is-active" : ""}
                  onClick={() => switchMainTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            <nav className="admin-tabs admin-sub-tabs" aria-label="관리자 하위 메뉴">
              {currentSubTabs.map((tab) => {
                const count = getSubTabCount(tab.id);

                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={activeSubTab === tab.id ? "is-active" : ""}
                    onClick={() => switchSubTab(tab.id)}
                  >
                    {tab.label}
                    {count !== null && tab.id !== "notification_history" && (
                      <span>{formatTabBadgeCount(count)}</span>
                    )}
                  </button>
                );
              })}
            </nav>

            {activeMainTab === "settlements" && (
              <RevenueSummaryPanel summary={revenueSummary} />
            )}

            {activeSubTab === "all_businesses" && (
              <BusinessManagement
                businesses={businesses}
                onOpenRequestDetail={(request) => openRequestModal("detail", request)}
                requests={requests}
                onUpdateStatus={(bizId, newStatus) => updateBusiness(bizId, { status: newStatus })}
                onUpdateNotes={(bizId, newNotes) => updateBusiness(bizId, { notes: newNotes })}
              />
            )}

            {activeSubTab === "company_payments" && (
              <CompanyPaymentManagement
                documents={generatedDocuments}
                filters={paymentFilters}
                logs={paymentLogs}
                payments={safePayments}
                requests={requests}
                savingKey={savingKey}
                setFilters={setPaymentFilters}
                updatePayment={updateCompanyPayment}
              />
            )}

            {activeSubTab === "all_requests" && (
              <RequestManagement
                applicationsRequestId={applicationsRequestId}
                assignmentDrafts={assignmentDrafts}
                assignmentsByRequest={assignmentsByRequest}
                expandedRequestId={expandedRequestId}
                filters={requestFilters}
                getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
                interpreters={interpreters}
                requests={filteredRequests}
                settlements={safeSettlements}
                sectionCount={requests.length}
                sectionTitle="전체 의뢰"
                savingKey={savingKey}
                jobsById={jobsById}
                requestsByJobId={requestsByJobId}
                jobApplicationsByJob={jobApplicationsByJob}
                onJobsAdminClick={switchToJobsTab}
                setAssignmentDrafts={setAssignmentDrafts}
                setApplicationsRequestId={setApplicationsRequestId}
                setExpandedRequestId={setExpandedRequestId}
                openRequestModal={openRequestModal}
                setFilters={setRequestFilters}
                assignInterpreter={assignInterpreter}
                handlePriceDraft={handlePriceDraft}
                saveSettlement={saveSettlement}
                removeAssignment={removeAssignment}
                updateRequest={updateRequest}
                updateApplicationStatus={updateJobApplicationStatus}
                deleteRequest={deleteRequest}
                toggleRequestJobPublic={toggleRequestJobPublic}
                updateSettlementManagementStatus={updateSettlementManagementStatus}
                updateRequestFlowStatus={updateRequestFlowStatus}
                onOpenDocumentPreview={openDocumentPreview}
              />
            )}

            {activeSubTab === "new_requests" && (
              <NewRequestManagement
                requests={newRequests}
                savingKey={savingKey}
                onConfirmRequest={confirmNewRequest}
                onOpenDetail={(request) => openRequestModal("detail", request)}
                onOpenRequestsTab={() => {
                  setRequestFilters((prev) => ({
                    ...prev,
                    search: "",
                    month: "",
                    status: "all",
                    public: "all",
                  }));
                  switchSubTab("requests");
                }}
              />
            )}

            {activeSubTab === "new_interpreters" && (
              <NewApplicationManagement
                applications={[]}
                duplicateResult={duplicateApplicationResult}
                getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
                hideJobApplications
                interpreters={pendingInterpreters}
                jobsById={jobsById}
                pendingResumeReviewCount={pendingResumeReviewInterpreters.length}
                savingKey={savingKey}
                onConfirmApplication={confirmNewJobApplication}
                onOpenApplicationsTab={() => {
                  setApplicationFilters({
                    status: "all",
                    duplicate: "all",
                  });
                  switchSubTab("applications");
                }}
                onOpenInterpreterModal={openInterpreterModal}
                onOpenResumeReview={() => {
                  setInterpreterFilters({
                    search: "",
                    level: "all",
                    status: "all",
                    activity: "all",
                    approved: "all",
                    resumeReview: "resume_review_pending",
                    duplicate: "all",
                  });
                  switchSubTab("verification_pending");
                }}
                updateInterpreter={updateInterpreter}
                deleteInterpreter={deleteInterpreter}
              />
            )}

            {activeSubTab === "completed_requests" && (
              <RequestManagement
                applicationsRequestId={applicationsRequestId}
                assignmentDrafts={assignmentDrafts}
                assignmentsByRequest={assignmentsByRequest}
                expandedRequestId={expandedRequestId}
                filters={requestFilters}
                getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
                interpreters={interpreters}
                requests={filteredCompletedRequests}
                settlements={safeSettlements}
                sectionCount={completedRequests.length}
                sectionTitle="완료 의뢰"
                savingKey={savingKey}
                jobsById={jobsById}
                requestsByJobId={requestsByJobId}
                jobApplicationsByJob={jobApplicationsByJob}
                onJobsAdminClick={switchToJobsTab}
                setAssignmentDrafts={setAssignmentDrafts}
                setApplicationsRequestId={setApplicationsRequestId}
                setExpandedRequestId={setExpandedRequestId}
                openRequestModal={openRequestModal}
                setFilters={setRequestFilters}
                assignInterpreter={assignInterpreter}
                handlePriceDraft={handlePriceDraft}
                saveSettlement={saveSettlement}
                removeAssignment={removeAssignment}
                updateRequest={updateRequest}
                updateApplicationStatus={updateJobApplicationStatus}
                deleteRequest={deleteRequest}
                toggleRequestJobPublic={toggleRequestJobPublic}
                updateSettlementManagementStatus={updateSettlementManagementStatus}
                updateRequestFlowStatus={updateRequestFlowStatus}
                onOpenDocumentPreview={openDocumentPreview}
              />
            )}

            {activeSubTab === "registered_interpreters" && (
              <InterpreterManagement
                filters={interpreterFilters}
                interpreters={filteredInterpreters}
                duplicateResult={duplicateInterpreterResult}
                emptyText={
                  interpreterFilters.resumeReview === "resume_review_pending"
                    ? "현재 이력서 심사 대기 중인 통역사가 없습니다."
                    : undefined
                }
                savingKey={savingKey}
                setFilters={setInterpreterFilters}
                onOpenModal={openInterpreterModal}
                updateInterpreter={updateInterpreter}
                deleteInterpreter={deleteInterpreter}
              />
            )}

            {activeSubTab === "jobs" && (
              <AdminJobs
                embedded
                jobs={jobs}
                requests={requests}
                interpreters={interpreters}
                assignments={assignments}
                settlements={safeSettlements}
                applications={jobApplications}
                onDataChanged={fetchAdminData}
                getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
                matchings={matchings}
                updateApplicationStatus={updateJobApplicationStatus}
              />
            )}

            {activeSubTab === "applications" && (
              <ApplicationManagement
                applications={jobApplications}
                duplicateResult={duplicateApplicationResult}
                getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
                jobsById={jobsById}
                savingKey={savingKey}
                updateApplicationStatus={updateJobApplicationStatus}
                deleteApplication={deleteJobApplication}
                filters={applicationFilters}
                setFilters={setApplicationFilters}
                adminNotes={adminNotes}
                adminActivityLogs={adminActivityLogs}
                noteDrafts={adminNoteDrafts}
                onChangeNoteDraft={updateAdminNoteDraft}
                onCreateNote={createAdminNote}
                onOpenDocumentPreview={openDocumentPreview}
              />
            )}

            {activeSubTab === "assignments" && (
              <AssignmentManagement
                rows={assignmentRows}
                pendingRequests={pendingAssignmentRequests}
                onOpenRequest={(request) => openRequestModal("detail", request)}
                adminNotes={adminNotes}
                adminActivityLogs={adminActivityLogs}
                noteDrafts={adminNoteDrafts}
                onChangeNoteDraft={updateAdminNoteDraft}
                onCreateNote={createAdminNote}
                onOpenDocumentPreview={openDocumentPreview}
              />
            )}

            {activeSubTab === "verification_pending" && (
              <InterpreterManagement
                filters={interpreterFilters}
                interpreters={pendingResumeReviewInterpreters}
                duplicateResult={duplicateInterpreterResult}
                emptyText="현재 검증 대기 중인 통역사가 없습니다."
                savingKey={savingKey}
                setFilters={setInterpreterFilters}
                onOpenModal={openInterpreterModal}
                updateInterpreter={updateInterpreter}
                deleteInterpreter={deleteInterpreter}
              />
            )}

            {activeSubTab === "interpreter_activity" && (
              <InterpreterManagement
                filters={interpreterFilters}
                interpreters={filteredInterpreters}
                duplicateResult={duplicateInterpreterResult}
                savingKey={savingKey}
                setFilters={setInterpreterFilters}
                onOpenModal={openInterpreterModal}
                updateInterpreter={updateInterpreter}
                deleteInterpreter={deleteInterpreter}
              />
            )}

            {activeSubTab === "settlement_waiting" && (
              <InterpreterSettlementManagement
                documents={generatedDocuments}
                filters={settlementFilters}
                interpreters={interpreters}
                logs={settlementLogs}
                requests={requests}
                settlementRequests={settlementManagementRows.pending}
                savingKey={savingKey}
                settlements={safeSettlements}
                setFilters={setSettlementFilters}
                statusScope="pending"
                title="정산 대기"
                onUpdateRequestSettlement={updateSettlementManagementStatus}
                updateSettlement={updateInterpreterSettlement}
              />
            )}

            {activeSubTab === "settlement_confirmed" && (
              <InterpreterSettlementManagement
                documents={generatedDocuments}
                filters={settlementFilters}
                interpreters={interpreters}
                logs={settlementLogs}
                requests={requests}
                settlementRequests={settlementManagementRows.confirmed}
                savingKey={savingKey}
                settlements={safeSettlements}
                setFilters={setSettlementFilters}
                statusScope="confirmed"
                title="정산 확정"
                onUpdateRequestSettlement={updateSettlementManagementStatus}
                updateSettlement={updateInterpreterSettlement}
              />
            )}

            {activeSubTab === "settlement_paying" && (
              <InterpreterSettlementManagement
                documents={generatedDocuments}
                filters={settlementFilters}
                interpreters={interpreters}
                logs={settlementLogs}
                requests={requests}
                settlementRequests={settlementManagementRows.paying}
                savingKey={savingKey}
                settlements={safeSettlements}
                setFilters={setSettlementFilters}
                statusScope="paying"
                title="통역사 지급"
                onUpdateRequestSettlement={updateSettlementManagementStatus}
                updateSettlement={updateInterpreterSettlement}
              />
            )}

            {activeSubTab === "settlement_completed" && (
              <InterpreterSettlementManagement
                documents={generatedDocuments}
                filters={settlementFilters}
                interpreters={interpreters}
                logs={settlementLogs}
                requests={requests}
                settlementRequests={settlementManagementRows.completed}
                savingKey={savingKey}
                settlements={safeSettlements}
                setFilters={setSettlementFilters}
                statusScope="completed"
                title="정산 완료"
                onUpdateRequestSettlement={updateSettlementManagementStatus}
                updateSettlement={updateInterpreterSettlement}
              />
            )}

            {[
              "all_documents",
              "estimate_documents",
              "completion_documents",
              "payout_documents",
            ].includes(activeSubTab) && (
              <DocumentManagement
                documents={generatedDocuments}
                interpreters={interpreters}
                initialType={
                  activeSubTab === "estimate_documents"
                    ? "estimate"
                    : activeSubTab === "completion_documents"
                      ? "completion"
                      : activeSubTab === "payout_documents"
                        ? "payout"
                        : "all"
                }
                requests={requests}
                savingKey={savingKey}
                onCreateVersion={async (document, draft) => {
                  await createDocumentVersionFromExisting(document, draft);
                }}
                onOpenPdf={(document, options) => openDocumentSignedUrl(supabase, document, options)}
                onVoidDocument={voidGeneratedDocument}
              />
            )}

            {activeSubTab === "admin_memos" && (
              <>
                <RecentActivityPanel
                  activities={recentActivityItems}
                  onOpenActivity={(activity) => {
                    if (activity.targetSubTab) handleDashboardShortcut(activity.targetSubTab);
                  }}
                />
                <AdminMemoManagement items={adminMemoDisplayItems} />
              </>
            )}

            {activeSubTab === "notification_history" && (
              <NotificationHistoryManagement
                events={notificationEvents}
                requests={requests}
                interpreters={interpreters}
                assignmentRows={assignmentRows}
                jobApplications={jobApplications}
                filters={notificationFilters}
                onFiltersChange={setNotificationFilters}
                historyType={notificationHistoryType}
                onHistoryTypeChange={setNotificationHistoryType}
                processing={notificationProcessing}
                onSendEmail={sendNotificationEmail}
                onDelete={deleteNotificationHistory}
                loadError={adminDataErrors.notifications}
              />
            )}

            {activeSubTab === "admin_accounts" && (
              <AdminAccountsManagement
                adminProfile={adminProfile}
                adminUsers={adminUsers}
                currentUser={user}
                onOpenAdminAccountModal={openAdminAccountModal}
              />
            )}

            <InterpreterModal
              applications={jobApplications}
              draft={interpreterEditDraft}
              interpreter={selectedInterpreter}
              jobs={jobs}
              matchings={matchings}
              requestAssignments={assignmentRows}
              requests={requests}
              settlements={safeSettlements}
              duplicateReasons={
                selectedInterpreter
                  ? duplicateInterpreterResult.reasonMap.get(selectedInterpreter.id) || []
                  : []
              }
              duplicateSuspected={
                selectedInterpreter
                  ? duplicateInterpreterResult.duplicateIds.has(selectedInterpreter.id)
                  : false
              }
              modalType={interpreterModalType}
              saving={
                selectedInterpreter
                  ? savingKey === `interpreter-${selectedInterpreter.id}`
                  : false
              }
              onChangeDraft={updateInterpreterEditDraft}
              onClose={closeInterpreterModal}
              onSave={saveInterpreterEditDraft}
              updateInterpreter={updateInterpreter}
              deleteInterpreter={deleteInterpreter}
              onOpenModal={openInterpreterModal}
              adminNotes={adminNotes}
              adminActivityLogs={adminActivityLogs}
              noteDrafts={adminNoteDrafts}
              onChangeNoteDraft={updateAdminNoteDraft}
              onCreateNote={createAdminNote}
            />
            {isAdminAccountModalOpen && (
              <AdminAccountModal
                adminProfile={adminProfile}
                currentUser={user}
                draft={adminAccountDraft}
                adminUsers={adminUsers}
                saving={isAdminAccountSaving}
                onChangeDraft={updateAdminAccountDraft}
                onClose={closeAdminAccountModal}
                onCreateAdmin={createAdminUser}
                onRoleChange={handleAdminRoleChange}
                onSignOut={signOutAdmin}
                onStatusChange={handleAdminStatusChange}
              />
            )}
            {isSettlementPendingModalOpen && (
              <SettlementPendingModal
                assignmentsByRequest={assignmentsByRequest}
                interpreters={interpreters}
                requests={settlementPendingRequests}
                savingKey={savingKey}
                onClose={() => setIsSettlementPendingModalOpen(false)}
                onCompleteSettlement={completeSettlementFromPendingModal}
                onOpenDetail={openRequestDetailFromSettlementPending}
              />
            )}
            {documentDraft && (
              <DocumentPreviewModal
                draft={documentDraft}
                saving={savingKey === `document-${documentDraft.documentType}-${documentDraft.request?.id || "new"}`}
                onChange={updateDocumentDraft}
                onClose={() => setDocumentDraft(null)}
                onConfirm={confirmDocumentGeneration}
              />
            )}
            {activeRequest && (
              <RequestActionModal
                activeModal={activeRequestModal}
                applications={
                  activeRequest.job_id
                    ? jobApplicationsByJob.get(String(activeRequest.job_id)) || []
                    : []
                }
                assignments={assignmentsByRequest.get(activeRequest.id) || []}
                assignmentDrafts={assignmentDrafts}
                draft={requestEditDraft}
                getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
                interpreters={interpreters}
                job={activeRequestJob}
                request={activeRequest}
                requests={requests}
                settlements={safeSettlements}
                savingKey={savingKey}
                setAssignmentDrafts={setAssignmentDrafts}
                assignInterpreter={assignInterpreter}
                deleteRequest={deleteRequest}
                handlePriceDraft={handlePriceDraft}
                settlementTouched={settlementTouchedByRequest[activeRequest.id] || {}}
                onChangeDraft={updateRequestEditDraft}
                onClose={closeRequestModal}
                onRemoveAssignment={removeAssignment}
                handleContactVisibleChange={handleContactVisibleChange}
                onSaveEdit={saveRequestEditDraft}
                saveSettlement={saveSettlement}
                toggleRequestJobPublic={toggleRequestJobPublic}
                updateApplicationStatus={updateJobApplicationStatus}
                updateRequest={updateRequest}
                updateSettlementManagementStatus={updateSettlementManagementStatus}
                updateRequestFlowStatus={updateRequestFlowStatus}
                adminNotes={adminNotes}
                adminActivityLogs={adminActivityLogs}
                noteDrafts={adminNoteDrafts}
                onChangeNoteDraft={updateAdminNoteDraft}
                onCreateNote={createAdminNote}
                onOpenDocumentPreview={openDocumentPreview}
                generatedDocuments={generatedDocuments}
              />
            )}
          
          </>
        )}
      </div>
    </div>
  );
}

function RequestActionModal({
  activeModal,
  adminActivityLogs = [],
  adminNotes = [],
  applications,
  assignments,
  assignmentDrafts,
  draft,
  getInterpreterScheduleConflicts,
  interpreters,
  job,
  request,
  requests = [],
  settlements = [],
  savingKey,
  setAssignmentDrafts,
  assignInterpreter,
  deleteRequest,
  handlePriceDraft,
  settlementTouched,
  onChangeDraft,
  onClose,
  onRemoveAssignment,
  handleContactVisibleChange,
  onSaveEdit,
  saveSettlement,
  toggleRequestJobPublic,
  updateApplicationStatus,
  updateRequest,
  updateSettlementManagementStatus,
  updateRequestFlowStatus,
  noteDrafts = {},
  onChangeNoteDraft,
  onCreateNote,
  onOpenDocumentPreview,
  generatedDocuments = [],
}) {
  if (!activeModal || !request) return null;

  const titleMap = {
    applicants: "지원자 확인",
    detail: "의뢰 상세 정보",
    edit: "공고 수정",
    visibility: "공개 상태 변경",
    delete: "의뢰/공고 삭제",
  };
  const modalTitle = titleMap[activeModal.type] || "의뢰 관리";
  const modalId = `request-${activeModal.type}-modal-title`;
  const jobPublicState = getRequestJobPublicState(request, job);
  const shouldBePublic = jobPublicState.type !== "public";
  const detailHeadlineStatus =
    activeModal.type === "detail"
      ? getRequestHeadlineStatus(getRequestFlowSource(request, job))
      : null;

  return (
    <AdminModal
      title={activeModal.type === "detail" ? request.event_name || modalTitle : modalTitle}
      titleId={modalId}
      onClose={onClose}
      className={activeModal.type === "detail" ? "admin-request-detail-modal" : ""}
      meta={activeModal.type === "detail" ? "REQUEST DETAIL" : undefined}
      subtitle={
        activeModal.type === "detail"
          ? formatManagementNumber(request.request_no)
          : undefined
      }
      badge={
        detailHeadlineStatus
          ? {
              label: detailHeadlineStatus.label,
              className: `admin-flow-status-badge ${getOperationFlowBadgeClass(
                detailHeadlineStatus.type,
                detailHeadlineStatus.value
              )}`,
            }
          : null
      }
    >
      {activeModal.type === "detail" && (
        <RequestDetailPanel
          request={request}
          requests={requests}
          settlements={settlements}
          job={job}
          applications={applications}
          assignmentDrafts={assignmentDrafts}
          assignments={assignments}
          getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
          interpreters={interpreters}
          savingKey={savingKey}
          setAssignmentDrafts={setAssignmentDrafts}
          assignInterpreter={assignInterpreter}
          handlePriceDraft={handlePriceDraft}
          settlementTouched={settlementTouched}
          saveSettlement={saveSettlement}
          removeAssignment={onRemoveAssignment}
          handleContactVisibleChange={handleContactVisibleChange}
          updateRequest={updateRequest}
          updateSettlementManagementStatus={updateSettlementManagementStatus}
          updateRequestFlowStatus={updateRequestFlowStatus}
          updateApplicationStatus={updateApplicationStatus}
          adminNotes={adminNotes}
          adminActivityLogs={adminActivityLogs}
          noteDrafts={noteDrafts}
          onChangeNoteDraft={onChangeNoteDraft}
          onCreateNote={onCreateNote}
          onOpenDocumentPreview={onOpenDocumentPreview}
          generatedDocuments={generatedDocuments}
        />
      )}

      {activeModal.type === "applicants" && (
        <div className="admin-modal-form">
          <JobApplicationsPanel
            applications={applications}
            assignments={assignments}
            getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
            interpreters={interpreters}
            request={request}
            onRemoveAssignment={onRemoveAssignment}
            onStatusChange={updateApplicationStatus}
          />
        </div>
      )}

      {activeModal.type === "visibility" && (
        <ConfirmPanel
          tone="primary"
          message={`이 공고를 ${shouldBePublic ? "공개" : "비공개"}로 전환하시겠습니까?`}
          confirmText={shouldBePublic ? "공개 전환" : "비공개 전환"}
          saving={savingKey === `request-job-${request.id}`}
          onCancel={onClose}
          onConfirm={async () => {
            const ok = await toggleRequestJobPublic(request, shouldBePublic);
            if (ok) onClose();
          }}
        />
      )}

      {activeModal.type === "delete" && (
        <ConfirmPanel
          tone="danger"
          message="정말 이 의뢰/공고를 삭제하시겠습니까? 삭제 후 복구할 수 없습니다."
          confirmText="삭제"
          saving={savingKey === `request-delete-${request.id}`}
          onCancel={onClose}
          onConfirm={() => deleteRequest(request)}
        />
      )}

      {activeModal.type === "edit" && (
        <RequestEditForm
          draft={draft}
          saving={savingKey === `request-edit-${request.id}`}
          onCancel={onClose}
          onChange={onChangeDraft}
          onSave={onSaveEdit}
        />
      )}
    </AdminModal>
  );
}

function NewRequestManagement({
  requests,
  savingKey,
  onConfirmRequest,
  onOpenDetail,
  onOpenRequestsTab,
}) {
  return (
    <section className="admin-section">
      <SectionTitle count={`${requests.length}건`} title="신규 의뢰 관리" />
      {requests.length === 0 ? (
        <MessageBox text="새로 들어온 의뢰가 없습니다." />
      ) : (
        <div className="admin-management-card-grid">
          {requests.map((request) => (
            <article className="admin-list-card" key={request.id}>
              <div className="admin-list-card-head">
                <div>
                  <span className="admin-card-meta">신규 의뢰</span>
                  <ManagementNumberBadge value={request.request_no} />
                  <h3 title={request.event_name || request.title || ""}>
                    {request.event_name || request.title || "-"}
                  </h3>
                </div>
                <StatusBadge status={getRequestHeadlineStatus(request).label} />
              </div>

              <dl className="admin-card-summary">
                <Info label="의뢰번호" value={formatManagementNumber(request.request_no)} />
                <Info label="기업명" value={request.company_name || "-"} />
                <Info label="행사명" value={request.event_name || request.title || "-"} />
                <Info
                  label="날짜"
                  value={formatDateRange(
                    request.start_date,
                    request.end_date,
                    request.event_date || request.date
                  )}
                />
                <Info label="장소" value={request.event_location || request.location || "-"} />
                <Info
                  label="요청 언어"
                  value={request.language || request.requested_language || "-"}
                />
                <Info
                  label="필요 인원"
                  value={
                    request.requested_people_count || request.required_count
                      ? `${request.requested_people_count || request.required_count}명`
                      : "-"
                  }
                />
                <Info label="현재 상태" value={getRequestHeadlineStatus(request).label} />
                <Info label="등록일" value={formatDateTime(request.created_at)} />
              </dl>

              <div className="admin-card-actions">
                <button
                  type="button"
                  className="admin-link-button primary"
                  onClick={() => onOpenDetail(request)}
                >
                  상세보기
                </button>
                <button
                  type="button"
                  className="admin-save"
                  disabled={savingKey === `new-request-${request.id}`}
                  onClick={() => onConfirmRequest(request)}
                >
                  확인 처리
                </button>
                <button
                  type="button"
                  className="admin-link-button"
                  onClick={onOpenRequestsTab}
                >
                  의뢰 관리로 이동
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function NewApplicationManagement({
  applications,
  duplicateResult,
  getInterpreterScheduleConflicts,
  hideJobApplications = false,
  interpreters,
  jobsById,
  pendingResumeReviewCount,
  savingKey,
  onConfirmApplication,
  onOpenApplicationsTab,
  onOpenInterpreterModal,
  onOpenResumeReview,
  updateInterpreter,
  deleteInterpreter,
}) {
  return (
    <section className="admin-section">
      <SectionTitle
        count={`${interpreters.length + applications.length}건`}
        title={hideJobApplications ? "신규 통역사 관리" : "신규 지원 관리"}
      />

      <div className="admin-subsection">
        <SectionTitle count={`${pendingResumeReviewCount}건`} title="이력서 심사 대기" />
        <article
          className="admin-list-card admin-resume-review-card"
          role="button"
          tabIndex={0}
          onClick={onOpenResumeReview}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpenResumeReview();
            }
          }}
        >
          <div className="admin-list-card-head">
            <div>
              <span className="admin-card-meta">이력서 심사 대기</span>
              <h3>{pendingResumeReviewCount}건</h3>
            </div>
            <span className="status-badge pending">심사 대기</span>
          </div>
          <p className="admin-card-description">
            제출된 이력서를 확인하고 검증 여부를 처리하세요.
          </p>
          <div className="admin-card-actions">
            <span className="admin-link-button warning">
              심사 대기 확인
            </span>
          </div>
        </article>
      </div>

      <div className="admin-subsection">
        <SectionTitle count={`${interpreters.length}명`} title="통역사 신규 등록" />
        {interpreters.length === 0 ? (
          <MessageBox text="새로 들어온 통역사 등록 지원이 없습니다." />
        ) : (
          <div className="admin-management-card-grid">
            {interpreters.map((interpreter) => (
              <InterpreterCard
                key={interpreter.id}
                duplicateReasons={[]}
                duplicateSuspected={false}
                interpreter={interpreter}
                savingKey={savingKey}
                onOpenModal={onOpenInterpreterModal}
                updateInterpreter={updateInterpreter}
                deleteInterpreter={deleteInterpreter}
              />
            ))}
          </div>
        )}
      </div>

      {!hideJobApplications && (
      <div className="admin-subsection">
        <SectionTitle count={`${applications.length}건`} title="공고 신규 지원" />
        {applications.length === 0 ? (
          <MessageBox text="새로 들어온 공고 지원이 없습니다." />
        ) : (
          <div className="admin-management-card-grid">
            {applications.map((application) => {
              const job = application.jobs || jobsById.get(application.job_id);
              const duplicateReasons = duplicateResult.reasonMap.get(application.id) || [];

              return (
                <NewJobApplicationCard
                  key={application.id}
                  application={application}
                  duplicateReasons={duplicateReasons}
                  duplicateSuspected={duplicateResult.duplicateIds.has(application.id)}
                  job={job}
                  savingKey={savingKey}
                  scheduleConflict={hasApplicationScheduleConflict(
                    application,
                    job,
                    getInterpreterScheduleConflicts
                  )}
                  onConfirmApplication={onConfirmApplication}
                  onOpenApplicationsTab={onOpenApplicationsTab}
                />
              );
            })}
          </div>
        )}
      </div>
      )}
    </section>
  );
}

function NewJobApplicationCard({
  application,
  duplicateReasons,
  duplicateSuspected,
  job,
  savingKey,
  scheduleConflict,
  onConfirmApplication,
  onOpenApplicationsTab,
}) {
  const duplicateTitle = duplicateReasons.join(", ");

  return (
    <article className="admin-list-card">
      <div className="admin-list-card-head">
        <div>
          <span className="admin-card-meta">공고 신규 지원</span>
          <ManagementNumberBadge value={application.application_no} />
          <h3 title={application.applicant_name || ""}>
            {application.applicant_name || "이름 미입력"}
          </h3>
        </div>
        <div className="admin-card-chip-row">
          {duplicateSuspected && <DuplicateBadge title={duplicateTitle} />}
          {scheduleConflict && <ScheduleConflictBadge />}
          <StatusBadge status={application.status || APPLICATION_STATUS.PENDING} />
        </div>
      </div>

      <dl className="admin-card-summary">
        <Info label="지원자 이름" value={application.applicant_name || "이름 미입력"} />
        <Info label="이메일" value={application.email || application.applicant_email || "-"} />
        <Info label="지원 공고명" value={getJobDisplayTitle(job, application.job_id)} />
        <Info label="지원 일자" value={formatDateTime(application.created_at)} />
        <Info label="상태" value={getApplicationStatusLabel(application.status)} />
      </dl>

      <div className="admin-card-actions">
        <button
          type="button"
          className="admin-link-button primary"
          onClick={onOpenApplicationsTab}
        >
          상세보기
        </button>
        <button
          type="button"
          className="admin-save"
          disabled={savingKey === `job-application-${application.id}`}
          onClick={() => onConfirmApplication(application)}
        >
          확인 처리
        </button>
        <button
          type="button"
          className="admin-link-button"
          onClick={onOpenApplicationsTab}
        >
          지원자 관리로 이동
        </button>
      </div>
    </article>
  );
}

function SettlementPendingModal({
  assignmentsByRequest,
  interpreters,
  onClose,
  onCompleteSettlement,
  onOpenDetail,
  requests,
  savingKey,
}) {
  return (
    <AdminModal
      className="settlement-pending-modal"
      title="정산 대기 의뢰"
      titleId="settlement-pending-modal-title"
      onClose={onClose}
    >
      <div className="settlement-pending-list">
        {requests.length === 0 ? (
          <MessageBox text="현재 정산 대기 중인 의뢰가 없습니다." />
        ) : (
          requests.map((request) => {
            const assignments = assignmentsByRequest.get(request.id) || [];
            const assignedInterpreter = getAssignedInterpreterName(
              request,
              assignments,
              interpreters
            );
            const requestDate = formatDateRange(
              request.start_date,
              request.end_date,
              request.event_date
            );
            const requestNumber = formatRequestListNumber(request);

            return (
              <article className="settlement-pending-item" key={request.id}>
                <div className="settlement-pending-main">
                  <strong className="settlement-pending-number">{requestNumber}</strong>
                  <span className="settlement-pending-company">
                    {request.company_name || "-"}
                  </span>
                  <h3>{request.event_name || request.title || "-"}</h3>
                  <p>{requestDate}</p>
                  <p>통역사 : {assignedInterpreter || "-"}</p>
                  <span className="settlement-pending-status">
                    {getSettlementFlowStatusLabel(getSettlementStatusValue(request))}
                  </span>
                </div>
                <div className="settlement-pending-actions">
                  <button
                    type="button"
                    className="admin-link-button"
                    onClick={() => onOpenDetail(request)}
                  >
                    상세보기
                  </button>
                  <button
                    type="button"
                    className="admin-save"
                    disabled={savingKey === `settlement-pending-${request.id}`}
                    onClick={() => onCompleteSettlement(request)}
                  >
                    정산완료
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </AdminModal>
  );
}

function AdminAccountModal({
  adminProfile,
  adminUsers,
  currentUser,
  draft,
  onChangeDraft,
  onClose,
  onCreateAdmin,
  onRoleChange,
  onSignOut,
  onStatusChange,
  saving,
}) {
  // 현재 로그인 계정의 권한
  const currentEmail = currentUser?.email?.trim().toLowerCase() || "";
  const currentAdminUser = adminUsers.find(
    (adminUser) => adminUser.email?.trim().toLowerCase() === currentEmail && !adminUser.isFallback
  );
  const currentRole =
    currentEmail === "onlinkwith@gmail.com"
      ? "owner"
      : currentAdminUser?.role || adminProfile?.role || "확인 필요";
  const currentAdminRole = currentRole || "staff";
  const canManageAdmins = currentAdminRole === "owner";

  return (
    <AdminModal
      className="admin-account-modal"
      title="관리자 계정 관리"
      titleId="admin-account-modal-title"
      onClose={onClose}
    >
      <div className="admin-modal-form admin-account-modal-form">
        {/* 현재 로그인 계정 */}
        <div className="admin-account-current">
          <Info label="현재 관리자 이메일" value={currentUser?.email || "로그인 정보 없음"} />
          <Info label="현재 권한" value={currentRole} />
        </div>

        {/* 관리자 추가 폼 */}
        <form
          className="admin-account-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateAdmin();
          }}
        >
          <h3 style={{ margin: "16px 0 8px", fontSize: "14px", fontWeight: 700, color: "#374151" }}>
            관리자 추가
          </h3>
          <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#6b7280" }}>
            Supabase Auth user id와 이메일을 함께 등록해야 DB 관리자 권한이 적용됩니다.
            MFA/2FA는 Supabase Auth 설정에서 활성화해 주세요.
          </p>
          <FieldControl label="관리자 이메일">
            <input
              type="email"
              value={draft.email}
              autoComplete="off"
              disabled={!canManageAdmins || saving}
              onChange={(event) => onChangeDraft("email", event.target.value)}
              placeholder="admin@example.com"
            />
          </FieldControl>
          <FieldControl label="Auth user id">
            <input
              value={draft.auth_user_id}
              autoComplete="off"
              disabled={!canManageAdmins || saving}
              onChange={(event) => onChangeDraft("auth_user_id", event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </FieldControl>
          <FieldControl label="권한">
            <select
              value={draft.role}
              disabled={!canManageAdmins || saving}
              onChange={(event) => onChangeDraft("role", event.target.value)}
            >
              <option value="owner">owner</option>
              <option value="admin">admin</option>
              <option value="staff">staff</option>
            </select>
          </FieldControl>
          <div className="admin-account-create-actions">
            <button type="submit" className="admin-save" disabled={saving || !canManageAdmins}>
              {saving ? "처리 중..." : "관리자 추가"}
            </button>
          </div>
        </form>

        {/* 관리자 목록 */}
        <div className="admin-account-list">
          <h3 style={{ margin: "16px 0 8px", fontSize: "14px", fontWeight: 700, color: "#374151" }}>
            등록된 관리자
          </h3>
          {adminUsers.length === 0 ? (
            <MessageBox text="등록된 관리자 계정이 없습니다." />
          ) : (
            adminUsers.map((adminUser) => {
              const isSelf = adminUser.email?.trim().toLowerCase() === currentEmail;
              const isDbRegistered = !adminUser.isFallback;
              const loginStatus = adminUser.auth_user_id
                ? (isSelf ? "현재 로그인 중" : "권한 연동됨")
                : "권한 미연동";
              const targetRole = adminUser.role || "staff";
              const canEditAdmin = canManageAdmins;
              const editTitle = canEditAdmin ? undefined : "현재 권한으로는 수정할 수 없습니다";

              return (
                <article className="admin-account-row" key={adminUser.id}>
                  <div className="admin-account-row-head">
                    <strong className="admin-account-email">
                      {adminUser.email}
                      {isSelf && (
                        <span className="admin-account-badge current">
                          현재 계정
                        </span>
                      )}
                      {isDbRegistered && (
                        <span className="admin-account-badge">
                          관리자 DB 등록됨
                        </span>
                      )}
                    </strong>
                  </div>
                  <div className="admin-account-row-main">
                    <span>권한: {adminUser.role || "staff"}</span>
                    <span>상태: {adminUser.status || "active"}</span>
                    <span>Auth ID: {adminUser.auth_user_id || "권한 미연동"}</span>
                    <span>로그인 상태: {loginStatus}</span>
                    <span>등록일: {adminUser.created_at ? formatDate(adminUser.created_at) : "-"}</span>
                  </div>
                  <div className="admin-account-row-controls">
                    <select
                      aria-label={`${adminUser.email} 권한 변경`}
                      title={editTitle}
                      value={targetRole}
                      disabled={!canEditAdmin}
                      onChange={(event) => onRoleChange(adminUser, event.target.value)}
                    >
                      <option value="owner">owner</option>
                      <option value="admin">admin</option>
                      <option value="staff">staff</option>
                    </select>
                    <select
                      aria-label={`${adminUser.email} 상태 변경`}
                      title={editTitle}
                      value={adminUser.status || "active"}
                      disabled={!canEditAdmin}
                      onChange={(event) => onStatusChange(adminUser, event.target.value)}
                    >
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* 로그아웃 */}
        <div className="admin-account-signout">
          <button
            type="button"
            className="admin-save danger"
            disabled={saving}
            onClick={onSignOut}
          >
            로그아웃
          </button>
          <button
            type="button"
            className="admin-link-button"
            disabled={saving}
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </AdminModal>
  );
}

function AdminModal({
  badge = null,
  children,
  className = "",
  meta = "REQUEST",
  onClose,
  subtitle = "",
  title,
  titleId,
}) {
  return (
    <div className="admin-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className={`admin-modal-card${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <div>
            <span className="admin-card-meta">{meta}</span>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p className="admin-modal-subtitle">{subtitle}</p>}
          </div>
          <div className="admin-modal-head-actions">
            {badge && <span className={badge.className}>{badge.label}</span>}
            <button type="button" className="admin-modal-close" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
        <div className="admin-modal-body">{children}</div>
      </section>
    </div>
  );
}

function DocumentPreviewModal({ draft, saving, onChange, onClose, onConfirm }) {
  const documentType = draft.documentType;
  const [isEditing, setIsEditing] = useState(false);
  const title = `${getDocumentTypeLabel(documentType)} ${
    documentType === "completion" ? (isEditing ? "정보 수정" : "미리보기") : "미리보기"
  }`;

  return (
    <AdminModal title={title} titleId="document-preview-modal-title" onClose={onClose}>
      <div className="admin-modal-form">
        {documentType === "completion" && !isEditing ? (
          <div style={{ display: "grid", gap: "16px" }}>
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "24px",
                background: "#ffffff",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderBottom: "2px solid #334155",
                  paddingBottom: "12px",
                }}
              >
                <span style={{ fontSize: "20px", fontWeight: "900", color: "#1e293b" }}>
                  업무확인서
                </span>
                <span style={{ fontSize: "14px", color: "#64748b", fontWeight: "700" }}>
                  문서번호: 자동 발급 예정
                </span>
              </div>
              <dl
                className="admin-detail-list compact"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "10px",
                  margin: 0,
                }}
              >
                <Info label="기업명" value={draft.companyName} />
                <Info label="행사명" value={draft.eventName} />
                <Info label="진행 날짜" value={draft.eventDate} />
                <Info label="진행 장소" value={draft.location} />
                <Info label="담당 통역사" value={draft.interpreters} />
                <Info label="업무 시간" value={draft.workTime} />
                <Info label="완료 확인일" value={draft.confirmedAt} />
              </dl>
              <div
                style={{
                  marginTop: "10px",
                  borderTop: "1px dashed #e2e8f0",
                  paddingTop: "12px",
                }}
              >
                <dt
                  style={{
                    fontSize: "12px",
                    fontWeight: "850",
                    color: "#64748b",
                    marginBottom: "4px",
                  }}
                >
                  메모
                </dt>
                <dd
                  style={{
                    fontSize: "14px",
                    color: "#1e293b",
                    margin: 0,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {draft.memo || "-"}
                </dd>
              </div>
            </div>

            <div
              className="admin-modal-actions"
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}
            >
              <button
                type="button"
                className="admin-link-button"
                onClick={() => setIsEditing(true)}
              >
                수정하기
              </button>
              <button
                type="button"
                className="admin-save"
                disabled={saving}
                onClick={onConfirm}
              >
                확정 생성
              </button>
            </div>
          </div>
        ) : (
          <>
            <dl className="admin-detail-list compact">
              <Info label="문서 종류" value={getDocumentTypeLabel(documentType)} />
              <Info label="의뢰번호" value={formatManagementNumber(draft.request?.request_no)} />
              <Info label="행사명" value={draft.eventName || "-"} />
              <Info label="최종 금액" value={formatDocumentAmount(draft.totalAmount)} />
            </dl>

            {documentType === "estimate" && (
              <div className="admin-modal-edit-grid">
                <TextField
                  label="기업명"
                  value={draft.companyName}
                  onChange={(value) => onChange("companyName", value)}
                />
                <TextField
                  label="담당자명"
                  value={draft.contactName}
                  onChange={(value) => onChange("contactName", value)}
                />
                <TextField
                  label="행사명"
                  value={draft.eventName}
                  onChange={(value) => onChange("eventName", value)}
                />
                <TextField
                  label="일정"
                  value={draft.eventDate}
                  onChange={(value) => onChange("eventDate", value)}
                />
                <TextField
                  label="장소"
                  value={draft.location}
                  onChange={(value) => onChange("location", value)}
                />
                <TextField
                  label="통역 레벨"
                  value={draft.level}
                  onChange={(value) => onChange("level", value)}
                />
                <NumberControl
                  label="단가"
                  value={draft.unitPrice}
                  onChange={(value) => onChange("unitPrice", value)}
                />
                <NumberControl
                  label="인원"
                  value={draft.peopleCount}
                  onChange={(value) => onChange("peopleCount", value)}
                />
                <NumberControl
                  label="업무 일수"
                  value={draft.workDays}
                  onChange={(value) => onChange("workDays", value)}
                />
                <NumberControl
                  label="할인"
                  value={draft.discountAmount}
                  onChange={(value) => onChange("discountAmount", value)}
                />
                <NumberControl
                  label="추가 비용"
                  value={draft.extraAmount}
                  onChange={(value) => onChange("extraAmount", value)}
                />
              </div>
            )}

            {documentType === "completion" && (
              <div className="admin-modal-edit-grid">
                <FieldControl label="기업명">
                  <input
                    value={draft.companyName || ""}
                    disabled
                    readOnly
                    style={{ background: "#f3f4f6", color: "#6b7280", cursor: "not-allowed" }}
                  />
                </FieldControl>
                <FieldControl label="행사명">
                  <input
                    value={draft.eventName || ""}
                    disabled
                    readOnly
                    style={{ background: "#f3f4f6", color: "#6b7280", cursor: "not-allowed" }}
                  />
                </FieldControl>
                <FieldControl label="진행 날짜">
                  <input
                    value={draft.eventDate || ""}
                    disabled
                    readOnly
                    style={{ background: "#f3f4f6", color: "#6b7280", cursor: "not-allowed" }}
                  />
                </FieldControl>
                <FieldControl label="진행 장소">
                  <input
                    value={draft.location || ""}
                    disabled
                    readOnly
                    style={{ background: "#f3f4f6", color: "#6b7280", cursor: "not-allowed" }}
                  />
                </FieldControl>
                <TextField
                  label="담당 통역사"
                  value={draft.interpreters}
                  onChange={(value) => onChange("interpreters", value)}
                />
                <TextField
                  label="업무 시간"
                  value={draft.workTime}
                  onChange={(value) => onChange("workTime", value)}
                />
                <TextField
                  label="완료 확인일"
                  value={draft.confirmedAt}
                  onChange={(value) => onChange("confirmedAt", value)}
                />
              </div>
            )}

            {documentType === "payout" && (
              <div className="admin-modal-edit-grid">
                <TextField
                  label="통역사명"
                  value={draft.interpreterName}
                  onChange={(value) => onChange("interpreterName", value)}
                />
                <TextField
                  label="업무명"
                  value={draft.eventName}
                  onChange={(value) => onChange("eventName", value)}
                />
                <TextField
                  label="업무 날짜"
                  value={draft.eventDate}
                  onChange={(value) => onChange("eventDate", value)}
                />
                <TextField
                  label="적용 레벨"
                  value={draft.level}
                  onChange={(value) => onChange("level", value)}
                />
                <NumberControl
                  label="일당"
                  value={draft.dailyPay}
                  onChange={(value) => onChange("dailyPay", value)}
                />
                <NumberControl
                  label="근무 일수"
                  value={draft.workDays}
                  onChange={(value) => onChange("workDays", value)}
                />
                <NumberControl
                  label="최종 지급 금액"
                  value={draft.totalAmount}
                  onChange={(value) => onChange("totalAmount", value)}
                />
              </div>
            )}

            <FieldControl label="메모">
              <textarea
                className="admin-textarea"
                rows={3}
                value={draft.memo || ""}
                onChange={(event) => onChange("memo", event.target.value)}
                placeholder="문서에 표시할 메모"
              />
            </FieldControl>

            <div className="admin-modal-actions">
              {documentType === "completion" ? (
                <>
                  <button
                    type="button"
                    className="admin-link-button"
                    onClick={() => setIsEditing(false)}
                  >
                    미리보기
                  </button>
                  <button type="button" className="admin-save danger" onClick={onClose}>
                    취소
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="admin-link-button" onClick={onClose}>
                    취소
                  </button>
                  <button
                    type="button"
                    className="admin-save"
                    disabled={saving}
                    onClick={onConfirm}
                  >
                    확정 생성
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </AdminModal>
  );
}

function TextField({ label, value, onChange }) {
  return (
    <FieldControl label={label}>
      <input value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </FieldControl>
  );
}

function ConfirmPanel({
  confirmText,
  message,
  onCancel,
  onConfirm,
  saving,
  tone = "primary",
}) {
  return (
    <div className="admin-modal-form">
      <p className="admin-confirm-text">{message}</p>
      <div className="admin-modal-actions">
        <button type="button" className="admin-link-button" onClick={onCancel}>
          취소
        </button>
        <button
          type="button"
          className={`admin-save${tone === "danger" ? " danger" : ""}`}
          disabled={saving}
          onClick={onConfirm}
        >
          {confirmText}
        </button>
      </div>
    </div>
  );
}

function RequestEditForm({ draft, onCancel, onChange, onSave, saving }) {
  const form = { ...EMPTY_REQUEST_EDIT_DRAFT, ...(draft || {}) };

  return (
    <form
      className="admin-modal-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="admin-modal-edit-grid">
        <FieldControl label="행사명">
          <input
            value={form.event_name || ""}
            onChange={(event) => onChange("event_name", event.target.value)}
          />
        </FieldControl>
        <FieldControl label="기업명">
          <input
            value={form.company_name || ""}
            onChange={(event) => onChange("company_name", event.target.value)}
          />
        </FieldControl>
        <FieldControl label="의뢰번호">
          <input
            value={form.request_no || ""}
            onChange={(event) => onChange("request_no", event.target.value)}
          />
        </FieldControl>
        <FieldControl label="의뢰 유형">
          <InlineSelect
            options={[
              { label: "일반의뢰", value: "general" },
              { label: "지정의뢰", value: "designated" },
              { label: "긴급의뢰", value: "urgent" },
              { label: "비공개의뢰", value: "private" },
            ]}
            value={normalizeRequestType(form.request_type)}
            onChange={(value) => onChange("request_type", value)}
          />
        </FieldControl>
        <div className="admin-modal-date-range">
          <DateRangeInput
            required
            label="행사 기간"
            startDate={form.start_date || ""}
            endDate={form.end_date || ""}
            onChange={({ startDate, endDate }) => {
              onChange("start_date", startDate);
              onChange("end_date", endDate);
            }}
          />
        </div>
        <FieldControl label="장소">
          <input
            value={form.event_location || ""}
            onChange={(event) => onChange("event_location", event.target.value)}
          />
        </FieldControl>
        <FieldControl label="언어">
          <input
            value={form.language || ""}
            onChange={(event) => onChange("language", event.target.value)}
          />
        </FieldControl>
        <NumberControl
          label="필요 인원 수"
          value={form.people_count || 1}
          onChange={(value) => onChange("people_count", value)}
        />
        <FieldControl label="희망 통역 레벨">
          <InlineSelect
            options={LEVELS}
            value={form.requested_level || "Lv1"}
            onChange={(value) => onChange("requested_level", value)}
          />
        </FieldControl>
        <FieldControl label="희망 성별">
          <input
            value={form.preferred_gender || ""}
            onChange={(event) => onChange("preferred_gender", event.target.value)}
          />
        </FieldControl>
        <FieldControl label="금액">
          <input
            value={form.price || ""}
            onChange={(event) => onChange("price", event.target.value)}
          />
        </FieldControl>
        <FieldControl label="배정 통역사">
          <input
            value={form.assigned_interpreter || ""}
            onChange={(event) => onChange("assigned_interpreter", event.target.value)}
          />
        </FieldControl>
        <FieldControl label="공개 여부">
          <InlineSelect
            options={[
              { label: "공개", value: "true" },
              { label: "비공개", value: "false" },
            ]}
            value={form.is_public || "false"}
            onChange={(value) => onChange("is_public", value)}
          />
        </FieldControl>
        <FieldControl label="배정 상태">
          <InlineSelect
            options={ASSIGNMENT_STATUS_OPTIONS}
            value={normalizeAssignmentStatus(form)}
            onChange={(value) => onChange("assignment_status", value)}
          />
        </FieldControl>
        <FieldControl label="운영 상태">
          <InlineSelect
            options={OPERATION_STATUS_OPTIONS}
            value={normalizeOperationStatus(form)}
            onChange={(value) => onChange("operation_status", value)}
          />
        </FieldControl>
        <FieldControl label="정산 상태">
          <InlineSelect
            options={SETTLEMENT_FLOW_STATUS_OPTIONS}
            value={normalizeSettlementFlowStatus(form)}
            onChange={(value) => onChange("settlement_status", value)}
          />
        </FieldControl>
        <FieldControl label="견적 상태">
          <InlineSelect
            options={ESTIMATE_STATUS_OPTIONS}
            value={form.estimate_status || "estimate_preparing"}
            onChange={(value) => onChange("estimate_status", value)}
          />
        </FieldControl>
      </div>
      <FieldControl label="기업 내부 메모">
        <textarea
          rows={4}
          value={form.company_internal_memo || ""}
          onChange={(event) => onChange("company_internal_memo", event.target.value)}
          placeholder="담당자 특징, 요청사항, 주의사항, 결제 관련 기록"
        />
      </FieldControl>
      <div className="admin-modal-actions">
        <button type="button" className="admin-link-button" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="admin-save" disabled={saving}>
          저장
        </button>
      </div>
    </form>
  );
}

function CompanyPaymentManagement({
  documents = [],
  filters,
  logs = [],
  payments = [],
  requests = [],
  savingKey,
  setFilters,
  updatePayment,
}) {
  const [selectedPaymentId, setSelectedPaymentId] = useState(null);
  const [draft, setDraft] = useState(null);
  const requestMap = useMemo(
    () => new Map(requests.map((request) => [String(request.id), request])),
    [requests]
  );
  const documentMap = useMemo(
    () => new Map(documents.map((document) => [String(document.id), document])),
    [documents]
  );
  const rows = useMemo(
    () =>
      payments
        .map((payment) => {
          const request = requestMap.get(String(payment.request_id)) || {};
          const estimateDocument = payment.estimate_document_id
            ? documentMap.get(String(payment.estimate_document_id))
            : null;
          return {
            payment,
            request,
            estimateDocument,
            requestNo: request.request_no || `REQ-${payment.request_id}`,
            companyName: request.company_name || "-",
            eventName: request.event_name || request.title || "-",
          };
        })
        .filter((row) => doesCompanyPaymentMatchFilters(row, filters)),
    [documentMap, filters, payments, requestMap]
  );
  const selectedPayment =
    payments.find((payment) => payment.id === selectedPaymentId) || null;
  const selectedRequest = selectedPayment
    ? requestMap.get(String(selectedPayment.request_id)) || null
    : null;
  const selectedDocument = selectedPayment?.estimate_document_id
    ? documentMap.get(String(selectedPayment.estimate_document_id)) || null
    : null;
  const selectedLogs = selectedPayment
    ? logs.filter((log) => log.payment_id === selectedPayment.id)
    : [];

  const openDetail = (payment) => {
    setSelectedPaymentId(payment.id);
    setDraft({
      payment_status: payment.payment_status || "unpaid",
      payment_method: payment.payment_method || "",
      paid_at: payment.paid_at ? String(payment.paid_at).slice(0, 16) : "",
      due_date: payment.due_date || "",
      admin_memo: payment.admin_memo || "",
    });
  };

  const updateDraft = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const saveDraft = async () => {
    if (!selectedPayment || !draft) return;
    const ok = await updatePayment(selectedPayment.id, {
      ...draft,
      paid_at: draft.paid_at ? new Date(draft.paid_at).toISOString() : null,
    });
    if (ok) {
      setSelectedPaymentId(null);
      setDraft(null);
    }
  };

  return (
    <section className="admin-section">
      <SectionTitle count={`${rows.length}건`} title="결제 관리" />
      <div className="admin-filter-bar admin-filters">
        <label className="admin-filter-search admin-search-control">
          <Search size={16} aria-hidden="true" />
          <input
            value={filters.search}
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="기업명, 의뢰번호, 행사명 검색"
          />
        </label>
        <select
          className="admin-filter-select"
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value }))
          }
        >
          <option value="all">결제 상태: 전체</option>
          {COMPANY_PAYMENT_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          className="admin-filter-select"
          type="date"
          value={filters.startDate}
          onChange={(event) =>
            setFilters((current) => ({ ...current, startDate: event.target.value }))
          }
          aria-label="입금 기한 시작"
        />
        <input
          className="admin-filter-select"
          type="date"
          value={filters.endDate}
          onChange={(event) =>
            setFilters((current) => ({ ...current, endDate: event.target.value }))
          }
          aria-label="입금 기한 종료"
        />
      </div>

      {rows.length === 0 ? (
        <MessageBox text="조건에 맞는 결제 항목이 없습니다." />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-payment-table">
            <thead>
              <tr>
                <th>의뢰번호</th>
                <th>기업명</th>
                <th>행사명</th>
                <th>견적 금액</th>
                <th>결제 상태</th>
                <th>입금 기한</th>
                <th>입금일</th>
                <th>메모</th>
                <th>상세보기</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ payment, requestNo, companyName, eventName }) => (
                <tr key={payment.id}>
                  <td>{formatManagementNumber(requestNo)}</td>
                  <td>{companyName}</td>
                  <td>{eventName}</td>
                  <td>{formatDocumentAmount(payment.amount)}</td>
                  <td>
                    <span className={`status-badge ${getCompanyPaymentBadgeClass(payment.payment_status)}`}>
                      {getCompanyPaymentStatusLabel(payment.payment_status)}
                    </span>
                  </td>
                  <td>{formatDate(payment.due_date)}</td>
                  <td>{formatDateTime(payment.paid_at)}</td>
                  <td className="admin-table-text">{payment.admin_memo || "-"}</td>
                  <td>
                    <button
                      type="button"
                      className="admin-secondary"
                      onClick={() => openDetail(payment)}
                    >
                      상세
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedPayment && draft && (
        <AdminModal
          className="admin-payment-detail-modal"
          title="결제 상세"
          titleId="admin-payment-detail-title"
          onClose={() => {
            setSelectedPaymentId(null);
            setDraft(null);
          }}
        >
          <div className="admin-payment-detail-grid">
            <section>
              <h3>기업/의뢰 정보</h3>
              <dl className="admin-detail-list compact">
                <Info label="기업명" value={selectedRequest?.company_name || "-"} />
                <Info label="의뢰번호" value={formatManagementNumber(selectedRequest?.request_no)} />
                <Info label="행사명" value={selectedRequest?.event_name || selectedRequest?.title || "-"} />
                <Info label="일정" value={formatDateRange(selectedRequest?.start_date, selectedRequest?.end_date, selectedRequest?.event_date)} />
              </dl>
            </section>
            <section>
              <h3>견적서 정보</h3>
              <dl className="admin-detail-list compact">
                <Info label="문서번호" value={selectedDocument?.document_no || "-"} />
                <Info label="견적 금액" value={formatDocumentAmount(selectedPayment.amount)} />
                <Info label="입금 방식" value={getCompanyPaymentMethodLabel(selectedPayment.payment_method)} />
                <Info label="생성일" value={formatDateTime(selectedDocument?.created_at)} />
              </dl>
            </section>
            <section>
              <h3>상태 변경</h3>
              <div className="admin-card-controls-grid">
                <FieldControl label="결제 상태">
                  <select
                    className="admin-filter-select"
                    value={draft.payment_status}
                    onChange={(event) => updateDraft("payment_status", event.target.value)}
                  >
                    {COMPANY_PAYMENT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FieldControl>
                <FieldControl label="입금 방식">
                  <select
                    className="admin-filter-select"
                    value={draft.payment_method}
                    onChange={(event) => updateDraft("payment_method", event.target.value)}
                  >
                    {COMPANY_PAYMENT_METHOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FieldControl>
                <FieldControl label="입금 기한">
                  <input
                    type="date"
                    value={draft.due_date}
                    onChange={(event) => updateDraft("due_date", event.target.value)}
                  />
                </FieldControl>
                <FieldControl label="입금일">
                  <input
                    type="datetime-local"
                    value={draft.paid_at}
                    onChange={(event) => updateDraft("paid_at", event.target.value)}
                  />
                </FieldControl>
              </div>
              <label className="admin-field-control">
                <span>관리자 메모</span>
                <textarea
                  rows={4}
                  value={draft.admin_memo}
                  onChange={(event) => updateDraft("admin_memo", event.target.value)}
                  placeholder="입금 확인 메모를 입력하세요."
                />
              </label>
              <div className="admin-card-actions">
                <button
                  type="button"
                  className="admin-save"
                  disabled={savingKey === `company-payment-${selectedPayment.id}`}
                  onClick={saveDraft}
                >
                  {savingKey === `company-payment-${selectedPayment.id}` ? "저장 중..." : "저장"}
                </button>
              </div>
            </section>
            <section>
              <h3>상태 변경 이력</h3>
              {selectedLogs.length === 0 ? (
                <p className="admin-empty-text">아직 상태 변경 이력이 없습니다.</p>
              ) : (
                <div className="admin-operations-list">
                  {selectedLogs.map((log) => (
                    <article className="admin-operation-log-item" key={log.id}>
                      <strong>
                        {getCompanyPaymentStatusLabel(log.previous_status)} → {getCompanyPaymentStatusLabel(log.new_status)}
                      </strong>
                      <p>{log.memo || "-"}</p>
                      <span>{formatDateTime(log.created_at)}</span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </AdminModal>
      )}
    </section>
  );
}

function InterpreterSettlementManagement({
  documents = [],
  filters,
  interpreters = [],
  logs = [],
  requests = [],
  settlementRequests = [],
  savingKey,
  settlements = [],
  setFilters,
  statusScope = "all",
  title = "정산 관리",
  onUpdateRequestSettlement,
  updateSettlement,
  loadError = null,
}) {
  const [selectedSettlementId, setSelectedSettlementId] = useState(null);
  const [draft, setDraft] = useState(null);
  const requestMap = useMemo(
    () => new Map(requests.map((request) => [String(request.id), request])),
    [requests]
  );
  const interpreterMap = useMemo(
    () => new Map(interpreters.map((interpreter) => [String(interpreter.id), interpreter])),
    [interpreters]
  );
  const rows = useMemo(
    () => {
      return settlementRequests
        .map((request) => {
          const settlement = buildSettlementPreviewFromRequest(request, settlements);
          const interpreterId = settlement.interpreter_id;
          const interpreter = interpreterMap.get(String(interpreterId)) || {};
          const document = findPayoutDocumentForSettlement(documents, settlement);
          return { settlement, request, interpreter, document };
        })
        .filter((row) => doesInterpreterSettlementMatchFilters(row, filters))
        .sort((a, b) => getSettlementRowSortTime(b.request) - getSettlementRowSortTime(a.request));
    },
    [documents, filters, interpreterMap, settlementRequests, settlements]
  );
  const selectedSettlement =
    settlements.find((settlement) => settlement.id === selectedSettlementId) || null;
  const selectedRequest = selectedSettlement
    ? requestMap.get(String(selectedSettlement.request_id)) || null
    : null;
  const selectedInterpreter = selectedSettlement
    ? interpreterMap.get(String(selectedSettlement.interpreter_id)) || null
    : null;
  const selectedDocument = selectedSettlement
    ? findPayoutDocumentForSettlement(documents, selectedSettlement)
    : null;
  const selectedLogs = selectedSettlement
    ? logs.filter((log) => log.settlement_id === selectedSettlement.id)
    : [];

  const openDetail = (settlement) => {
    setSelectedSettlementId(settlement.id);
    setDraft({
      amount: settlement.amount ?? 0,
      payout_status: normalizeAdminSettlementStatus(
        settlement.settlement_status || settlement.status || settlement.payout_status
      ),
      work_days: settlement.work_days || "",
      daily_rate: settlement.daily_rate || "",
      extra_amount: settlement.extra_amount || 0,
      deduction_amount: settlement.deduction_amount || 0,
      paid_at: settlement.paid_at ? String(settlement.paid_at).slice(0, 16) : "",
      payment_method: settlement.payment_method || "",
      admin_memo: settlement.admin_memo || "",
    });
  };

  const updateDraft = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const openPayoutDocument = async (document) => {
    if (!document?.file_path) return;
    try {
      const { data, error } = await supabase.storage
        .from(document.storage_bucket || "onli-documents")
        .createSignedUrl(document.file_path, 600, {
          download: `${document.document_no || "ONLI-PAYOUT"}.pdf`,
        });
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("payout document open failed:", error);
      alert("정산서를 열 수 없습니다. 권한 또는 파일 상태를 확인해주세요.");
    }
  };

  const saveDraft = async () => {
    if (!selectedSettlement || !draft) return;
    if (
      selectedDocument &&
      Number(selectedSettlement.amount || 0) !== Number(draft.amount || 0) &&
      !window.confirm("이미 발급된 정산서가 있습니다. 금액 변경 후에는 문서 관리에서 새 정산서 버전을 생성해주세요. 계속 저장하시겠습니까?")
    ) {
      return;
    }

    const ok = await updateSettlement(selectedSettlement.id, {
      ...draft,
      settlement_status: normalizeAdminSettlementStatus(draft.payout_status),
      payout_status: mapAdminSettlementStatusToPayoutStatus(draft.payout_status),
      paid_at: draft.paid_at ? new Date(draft.paid_at).toISOString() : null,
    });
    if (ok) {
      setSelectedSettlementId(null);
      setDraft(null);
    }
  };

  return (
    <section className="admin-section">
      <SectionTitle count={`${rows.length}건`} title={title} />
      <p className="admin-card-meta">실제 배정 관계가 확인된 의뢰만 정산 대상으로 표시됩니다.</p>
      <div className="admin-filter-bar admin-filters">
        <label className="admin-filter-search admin-search-control">
          <Search size={16} aria-hidden="true" />
          <input
            value={filters.search}
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="통역사명, 의뢰명 검색"
          />
        </label>
        <select
          className="admin-filter-select"
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value }))
          }
        >
          <option value="all">정산 상태: 전체</option>
          {SETTLEMENT_PAYOUT_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="admin-date-filter">
          <span>시작일</span>
          <input
            className="admin-filter-select"
            type="date"
            value={filters.startDate}
            onChange={(event) =>
              setFilters((current) => ({ ...current, startDate: event.target.value }))
            }
          />
        </label>
        <label className="admin-date-filter">
          <span>종료일</span>
          <input
            className="admin-filter-select"
            type="date"
            value={filters.endDate}
            onChange={(event) =>
              setFilters((current) => ({ ...current, endDate: event.target.value }))
            }
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <MessageBox
          text={
            loadError
              ? "정산 항목을 불러오지 못했습니다. 관리자 권한 또는 RLS 정책을 확인해주세요."
              : "조건에 맞는 정산 항목이 없습니다."
          }
        />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-settlement-table">
            <thead>
              <tr>
                <th>의뢰명</th>
                <th>의뢰번호</th>
                <th>기업명</th>
                <th>통역사명</th>
                <th>업무일</th>
                <th>일당</th>
                <th>근무 일수</th>
                <th>최종 지급 금액</th>
                <th>정산 상태</th>
                <th>정산 확정일</th>
                <th>통역사 지급 시작일</th>
                <th>정산 완료일</th>
                <th>정산서 보기</th>
                <th>상태 변경/상세보기</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ settlement, request, interpreter, document }) => (
                <tr key={`${statusScope}-${getSettlementRequestRowKey(request)}-${settlement.id}`}>
                  <td>{request.request_title || request.event_name || request.title || "정보 없음"}</td>
                  <td>{formatManagementNumber(request.request_code || request.request_no || request.management_no || request.id)}</td>
                  <td>{request.company_name || request.business_name || "정보 없음"}</td>
                  <td>{interpreter.name || request.interpreter_name || request.assigned_interpreter_name || request.matched_interpreter_name || "정보 없음"}</td>
                  <td>
                    {request.id
                      ? formatDateRange(
                          request.event_start_date || request.start_date,
                          request.event_end_date || request.end_date,
                          request.event_date
                        )
                      : "정보 없음"}
                  </td>
                  <td>{formatJPY(settlement.daily_rate ?? request.daily_rate)}</td>
                  <td>{settlement.work_days ?? request.work_days ?? request.settlement_work_days ?? "-"}</td>
                  <td>{formatJPY(settlement.amount ?? request.interpreter_total_amount)}</td>
                  <td>
                    <span className={`status-badge ${getSettlementPayoutBadgeClass(settlement.settlement_status)}`}>
                      {getSettlementPayoutStatusLabel(settlement.settlement_status)}
                    </span>
                  </td>
                  <td>{formatDateTime(settlement.settlement_confirmed_at || request.settlement_confirmed_at)}</td>
                  <td>{formatDateTime(settlement.interpreter_payment_started_at)}</td>
                  <td>{formatDateTime(settlement.settlement_completed_at || settlement.paid_at)}</td>
                  <td>
                    {document ? (
                      <button
                        type="button"
                        className="admin-secondary"
                        onClick={() => openPayoutDocument(document)}
                      >
                        보기
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <SettlementRowActions
                      request={request}
                      settlement={settlement}
                      savingKey={savingKey}
                      statusScope={statusScope}
                      onOpenDetail={openDetail}
                      onUpdateRequestSettlement={onUpdateRequestSettlement}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="admin-settlement-card-list">
            {rows.map(({ settlement, request, interpreter, document }) => (
              <article
                className="admin-settlement-card"
                key={`card-${statusScope}-${getSettlementRequestRowKey(request)}-${settlement.id}`}
              >
                <div className="admin-settlement-card-head">
                  <div>
                    <strong>{request.request_title || request.event_name || request.title || "정보 없음"}</strong>
                    <span>{formatManagementNumber(request.request_code || request.request_no || request.management_no || request.id)}</span>
                  </div>
                  <span className={`status-badge ${getSettlementPayoutBadgeClass(settlement.settlement_status)}`}>
                    {getSettlementPayoutStatusLabel(settlement.settlement_status)}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>통역사명</dt>
                    <dd>{interpreter.name || request.interpreter_name || request.assigned_interpreter_name || request.matched_interpreter_name || "정보 없음"}</dd>
                  </div>
                  <div>
                    <dt>업무일</dt>
                    <dd>
                      {formatDateRange(
                        request.event_start_date || request.start_date,
                        request.event_end_date || request.end_date,
                        request.event_date
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>기업명</dt>
                    <dd>{request.company_name || request.business_name || "정보 없음"}</dd>
                  </div>
                  <div>
                    <dt>일당</dt>
                    <dd>{formatJPY(settlement.daily_rate ?? request.daily_rate)}</dd>
                  </div>
                  <div>
                    <dt>근무 일수</dt>
                    <dd>{settlement.work_days ?? request.work_days ?? request.settlement_work_days ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>최종 지급 금액</dt>
                    <dd>{formatJPY(settlement.amount ?? request.interpreter_total_amount)}</dd>
                  </div>
                  <div>
                    <dt>정산 확정일</dt>
                    <dd>{formatDateTime(settlement.settlement_confirmed_at || request.settlement_confirmed_at)}</dd>
                  </div>
                  <div>
                    <dt>통역사 지급 시작일</dt>
                    <dd>{formatDateTime(settlement.interpreter_payment_started_at)}</dd>
                  </div>
                  <div>
                    <dt>정산 완료일</dt>
                    <dd>{formatDateTime(settlement.settlement_completed_at || settlement.paid_at)}</dd>
                  </div>
                </dl>
                <div className="admin-settlement-card-actions">
                  {document ? (
                    <button
                      type="button"
                      className="admin-secondary"
                      onClick={() => openPayoutDocument(document)}
                    >
                      정산서 보기
                    </button>
                  ) : null}
                  <SettlementRowActions
                    request={request}
                    settlement={settlement}
                    savingKey={savingKey}
                    statusScope={statusScope}
                    onOpenDetail={openDetail}
                    onUpdateRequestSettlement={onUpdateRequestSettlement}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {selectedSettlement && draft && (
        <AdminModal
          className="admin-payment-detail-modal"
          title="정산 상세"
          titleId="admin-settlement-detail-title"
          onClose={() => {
            setSelectedSettlementId(null);
            setDraft(null);
          }}
        >
          <div className="admin-payment-detail-grid">
            <section>
              <h3>의뢰/통역사 정보</h3>
              <dl className="admin-detail-list compact">
                <Info label="의뢰명" value={selectedRequest?.event_name || selectedRequest?.title || "정보 없음"} />
                <Info
                  label="의뢰번호"
                  value={formatManagementNumber(
                    selectedRequest?.request_code ||
                      selectedRequest?.request_no ||
                      selectedRequest?.management_no ||
                      selectedRequest?.id
                  )}
                />
                <Info
                  label="업무일"
                  value={
                    selectedRequest
                      ? formatDateRange(
                          selectedRequest.event_start_date || selectedRequest.start_date,
                          selectedRequest.event_end_date || selectedRequest.end_date,
                          selectedRequest.event_date
                        )
                      : "정보 없음"
                  }
                />
                <Info label="통역사명" value={selectedInterpreter?.name || "정보 없음"} />
              </dl>
            </section>
            <section>
              <h3>지급 정보</h3>
              <div className="admin-card-controls-grid">
                <FieldControl label="지급 상태">
                  <select
                    className="admin-filter-select"
                    value={normalizeAdminSettlementStatus(draft.payout_status)}
                    onChange={(event) => updateDraft("payout_status", event.target.value)}
                  >
                    {SETTLEMENT_PAYOUT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FieldControl>
                <NumberControl
                  label="최종 지급 금액"
                  value={draft.amount}
                  onChange={(value) => updateDraft("amount", value)}
                />
                <FieldControl label="근무 일수">
                  <input
                    type="number"
                    min="0"
                    value={draft.work_days}
                    onChange={(event) => updateDraft("work_days", event.target.value)}
                  />
                </FieldControl>
                <NumberControl
                  label="일당"
                  value={draft.daily_rate}
                  onChange={(value) => updateDraft("daily_rate", value)}
                />
                <NumberControl
                  label="추가 지급"
                  value={draft.extra_amount}
                  onChange={(value) => updateDraft("extra_amount", value)}
                />
                <NumberControl
                  label="차감 금액"
                  value={draft.deduction_amount}
                  onChange={(value) => updateDraft("deduction_amount", value)}
                />
                <FieldControl label="정산 완료일">
                  <input
                    type="datetime-local"
                    value={draft.paid_at}
                    onChange={(event) => updateDraft("paid_at", event.target.value)}
                  />
                </FieldControl>
                <FieldControl label="지급 방식">
                  <select
                    className="admin-filter-select"
                    value={draft.payment_method}
                    onChange={(event) => updateDraft("payment_method", event.target.value)}
                  >
                    {SETTLEMENT_PAYOUT_METHOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FieldControl>
              </div>
              <label className="admin-field-control">
                <span>관리자 메모</span>
                <textarea
                  rows={4}
                  value={draft.admin_memo}
                  onChange={(event) => updateDraft("admin_memo", event.target.value)}
                  placeholder="지급 확인 메모를 입력하세요."
                />
              </label>
              <div className="admin-card-actions">
                <button
                  type="button"
                  className="admin-save"
                  disabled={savingKey === `settlement-${selectedSettlement.id}`}
                  onClick={saveDraft}
                >
                  {savingKey === `settlement-${selectedSettlement.id}` ? "저장 중..." : "저장"}
                </button>
              </div>
            </section>
            <section>
              <h3>지급 이력 로그</h3>
              {selectedLogs.length === 0 ? (
                <p className="admin-empty-text">아직 지급 이력이 없습니다.</p>
              ) : (
                <div className="admin-operations-list">
                  {selectedLogs.map((log) => (
                    <article className="admin-operation-log-item" key={log.id}>
                      <strong>
                        {getSettlementPayoutStatusLabel(log.previous_status)} → {getSettlementPayoutStatusLabel(log.new_status)}
                      </strong>
                      <p>{log.memo || "-"}</p>
                      <span>{formatDateTime(log.created_at)}</span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </AdminModal>
      )}
    </section>
  );
}

function BusinessManagement({
  businesses,
  onOpenRequestDetail,
  requests,
  onUpdateStatus,
  onUpdateNotes,
}) {
  const [editingNotesId, setEditingNotesId] = useState(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [detailModal, setDetailModal] = useState({
    business: null,
    error: "",
    loading: false,
    requests: [],
    settlements: [],
  });
  const [activeDetailTab, setActiveDetailTab] = useState("basic");

  const getBusinessRequests = (biz, sourceRequests = requests) => {
    if (!biz) return [];
    const authUserId = String(biz.auth_user_id || "");
    const companyName = String(biz.company_name || "").trim();
    return sourceRequests.filter((request) => {
      if (authUserId && String(request.company_auth_user_id || "") === authUserId) return true;
      return companyName && String(request.company_name || "").trim() === companyName;
    });
  };

  const getRequestCount = (biz) => {
    return getBusinessRequests(biz).length;
  };

  const handleStartEditNotes = (biz) => {
    setEditingNotesId(biz.id);
    setNotesDraft(biz.notes || "");
  };

  const handleSaveNotes = (bizId) => {
    onUpdateNotes(bizId, notesDraft);
    setEditingNotesId(null);
  };

  const openBusinessDetail = async (biz) => {
    setActiveDetailTab("basic");
    setDetailModal({
      business: biz,
      error: "",
      loading: true,
      requests: [],
      settlements: [],
    });

    try {
      const { data: businessData, error: businessError } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", biz.id)
        .maybeSingle();
      if (businessError) throw businessError;

      const business = businessData || biz;
      const requestResults = [];
      if (business.auth_user_id) {
        const result = await supabase
          .from("requests")
          .select("*")
          .eq("company_auth_user_id", business.auth_user_id)
          .order("created_at", { ascending: false })
          .limit(100);
        if (result.error) throw result.error;
        requestResults.push(...(result.data || []));
      }
      if (business.company_name) {
        const result = await supabase
          .from("requests")
          .select("*")
          .eq("company_name", business.company_name)
          .order("created_at", { ascending: false })
          .limit(100);
        if (result.error) throw result.error;
        requestResults.push(...(result.data || []));
      }
      const requestRows = Array.from(
        new Map(requestResults.map((request) => [String(request.id), request])).values()
      ).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      let settlementRows = [];
      const requestIds = requestRows.map((request) => request.id).filter(Boolean);
      if (requestIds.length > 0) {
        const { data, error } = await supabase
          .from("settlements")
          .select(SETTLEMENTS_SELECT)
          .in("request_id", requestIds);
        if (error) throw error;
        settlementRows = data || [];
      }

      setDetailModal({
        business,
        error: "",
        loading: false,
        requests: requestRows,
        settlements: settlementRows,
      });
    } catch (error) {
      setDetailModal((current) => ({
        ...current,
        error: error?.message || "기업 상세 정보를 불러올 수 없습니다.",
        loading: false,
      }));
    }
  };

  const closeBusinessDetail = () => {
    setDetailModal({
      business: null,
      error: "",
      loading: false,
      requests: [],
      settlements: [],
    });
  };

  const modalBusiness = detailModal.business;
  const modalRequests = detailModal.requests;
  const modalSettlements = detailModal.settlements;
  const modalSettlementByRequest = new Map(
    modalSettlements.map((settlement) => [String(settlement.request_id), settlement])
  );
  const completedRequests = modalRequests.filter(
    (request) => normalizeOperationStatus(request) === OPERATION_STATUS.COMPLETED
  );
  const activeRequests = modalRequests.filter(
    (request) => normalizeOperationStatus(request) !== OPERATION_STATUS.COMPLETED
  );
  const recentRequests = modalRequests.slice(0, 10);
  const detailTabs = [
    { id: "basic", label: "기본 정보" },
    { id: "contact", label: "연락처" },
    { id: "requests", label: "의뢰 내역" },
    { id: "memo", label: "관리자 메모" },
  ];

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>전체 기업 관리</h2>
        <p className="admin-section-desc">등록된 기업 계정의 승인 상태와 관리자 메모를 관리합니다.</p>
      </div>

      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>회사명</th>
              <th>대표자/담당자</th>
              <th>연락처 / 이메일</th>
              <th>국가</th>
              <th>주요 의뢰 분야</th>
              <th>의뢰 건수</th>
              <th>가입일</th>
              <th>상태</th>
              <th>관리자 메모</th>
              <th>상세보기</th>
            </tr>
          </thead>
          <tbody>
            {businesses.length === 0 ? (
              <tr>
                <td colSpan="10" style={{ textAlign: "center", padding: "40px 0", color: "#6b7280" }}>
                  등록된 기업이 없습니다.
                </td>
              </tr>
            ) : (
              businesses.map((biz) => {
                const reqCount = getRequestCount(biz);
                return (
                  <tr key={biz.id}>
                    <td>
                      <button
                        type="button"
                        className="admin-business-name-button"
                        onClick={() => openBusinessDetail(biz)}
                      >
                        {biz.company_name || "회사명 없음"}
                      </button>
                      <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                        사업자: {biz.business_number}
                      </div>
                    </td>
                    <td>{biz.contact_name}</td>
                    <td>
                      <div>{biz.contact_phone}</div>
                      <div style={{ fontSize: "12px", color: "#6b7280" }}>{biz.contact_email}</div>
                    </td>
                    <td>{biz.country}</td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {biz.primary_fields && biz.primary_fields.length > 0 ? (
                          biz.primary_fields.map((f) => (
                            <span key={f} className="admin-badge info-badge" style={{ fontSize: "11px" }}>
                              {f}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: "#9ca3af" }}>없음</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <strong style={{ color: "#4f46e5" }}>{reqCount} 건</strong>
                    </td>
                    <td>{new Date(biz.created_at).toLocaleDateString()}</td>
                    <td>
                      <select
                        className="admin-inline-select"
                        value={biz.status}
                        onChange={(e) => onUpdateStatus(biz.id, e.target.value)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "12px",
                          fontWeight: "800",
                        }}
                      >
                        <option value="검토중">검토중</option>
                        <option value="승인 완료">승인 완료</option>
                        <option value="이용 제한">이용 제한</option>
                      </select>
                    </td>
                    <td>
                      {editingNotesId === biz.id ? (
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <textarea
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                            style={{
                              width: "180px",
                              minHeight: "48px",
                              padding: "6px",
                              fontSize: "12px",
                              border: "1px solid #d1d5db",
                              borderRadius: "6px",
                            }}
                          />
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <button
                              type="button"
                              className="admin-save-btn"
                              onClick={() => handleSaveNotes(biz.id)}
                              style={{ padding: "4px 8px", fontSize: "11px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingNotesId(null)}
                              style={{ padding: "4px 8px", fontSize: "11px", background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: "4px", cursor: "pointer" }}
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => handleStartEditNotes(biz)}
                          style={{
                            cursor: "pointer",
                            minWidth: "120px",
                            minHeight: "24px",
                            fontSize: "12px",
                            color: biz.notes ? "#374151" : "#9ca3af",
                            borderBottom: "1px dashed #d1d5db",
                            paddingBottom: "2px",
                          }}
                        >
                          {biz.notes || "메모 추가..."}
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-link-button"
                        onClick={() => openBusinessDetail(biz)}
                      >
                        상세보기
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {modalBusiness && (
        <AdminModal
          title={modalBusiness.company_name || "기업 상세"}
          titleId="admin-business-detail-modal-title"
          meta="기업 상세보기"
          badge={{
            className: "status-badge badge-blue",
            label: modalBusiness.status || "상태 없음",
          }}
          className="admin-business-detail-modal"
          onClose={closeBusinessDetail}
        >
          <div className="admin-business-detail">
            <div className="admin-detail-tabs" role="tablist">
              {detailTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeDetailTab === tab.id}
                  className={`admin-detail-tab-btn${activeDetailTab === tab.id ? " is-active" : ""}`}
                  onClick={() => setActiveDetailTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {detailModal.loading && <p className="admin-empty-text">기업 상세 정보를 불러오는 중입니다.</p>}
            <div className="admin-business-detail-content">
              {detailModal.error && <p className="admin-empty-text is-error">{detailModal.error}</p>}
              {!detailModal.loading && !detailModal.error && !modalBusiness && (
                <p className="admin-empty-text">표시할 기업 정보가 없습니다.</p>
              )}

              {!detailModal.loading && !detailModal.error && modalBusiness && (
                <>
                  {activeDetailTab === "basic" && (
                    <div className="admin-detail-panel admin-business-basic-panel">
                      <div className="admin-business-basic-info-card">
                      <h3>기본 정보</h3>
                      <dl className="admin-detail-list compact">
                        <Info label="회사명" value={modalBusiness.company_name || "-"} />
                        <Info label="사업자번호" value={modalBusiness.business_number || "-"} />
                        <Info label="대표자/담당자" value={modalBusiness.contact_name || "-"} />
                        <Info label="국가" value={modalBusiness.country || "-"} />
                      </dl>
                    </div>
                    <div className="admin-business-basic-side-card">
                      <h3>운영 요약</h3>
                      <dl className="admin-detail-list compact">
                        <Info label="승인 상태" value={modalBusiness.status || "-"} />
                        <Info label="가입일" value={formatDateTime(modalBusiness.created_at)} />
                        <Info label="관리자 메모" value={modalBusiness.notes || "-"} />
                        <Info label="총 의뢰 건수" value={`${modalRequests.length}건`} />
                        <Info label="진행 중 의뢰" value={`${activeRequests.length}건`} />
                        <Info label="완료 의뢰" value={`${completedRequests.length}건`} />
                      </dl>
                    </div>
                  </div>
                  )}

                  {activeDetailTab === "contact" && (
                    <div className="admin-detail-panel admin-business-basic-panel">
                    <div>
                      <h3>연락처</h3>
                      <dl className="admin-detail-list compact">
                        <Info label="전화번호" value={modalBusiness.contact_phone || "-"} />
                        <Info label="이메일" value={modalBusiness.contact_email || "-"} />
                        <Info label="카카오톡 ID" value="-" />
                      </dl>
                    </div>
                  </div>
                  )}

                  {activeDetailTab === "requests" && (
                    <div className="admin-business-request-panel">
                      <div className="admin-business-request-summary">
                        <div className="admin-business-request-summary-card">
                          <span>총 의뢰 건수</span>
                          <strong>{modalRequests.length}건</strong>
                        </div>
                        <div className="admin-business-request-summary-card">
                          <span>진행 중 의뢰</span>
                          <strong>{activeRequests.length}건</strong>
                        </div>
                        <div className="admin-business-request-summary-card">
                          <span>완료 의뢰</span>
                          <strong>{completedRequests.length}건</strong>
                        </div>
                      </div>

                      <div className="admin-business-request-table-card">
                        <div className="admin-business-request-table-head">
                          <h3>최근 의뢰 목록</h3>
                        </div>
                      {recentRequests.length === 0 ? (
                        <p className="admin-empty-text">표시할 의뢰 내역이 없습니다.</p>
                      ) : (
                        <div className="admin-table-wrap admin-business-request-table-wrap">
                          <table className="admin-table admin-business-request-table">
                            <thead>
                              <tr>
                                <th>의뢰번호</th>
                                <th>의뢰명</th>
                                <th>행사기간</th>
                                <th>견적 상태</th>
                                <th>배정 상태</th>
                                <th>운영 상태</th>
                                <th>상세보기</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recentRequests.map((request) => {
                                const assignmentStatus = normalizeAssignmentStatus(request);
                                const operationStatus = normalizeOperationStatus(request);
                                return (
                                  <tr key={request.id}>
                                    <td>{formatManagementNumber(request.request_no || request.id)}</td>
                                    <td className="admin-business-request-title-cell">{request.event_name || request.title || "-"}</td>
                                    <td className="admin-business-request-date-cell">{formatDateRange(request.start_date, request.end_date, request.event_date)}</td>
                                    <td>{getEstimateStatusLabel(request.estimate_status)}</td>
                                    <td>{getAssignmentStatusLabel(assignmentStatus)}</td>
                                    <td>{getOperationStatusOptionLabel(OPERATION_STATUS_OPTIONS, operationStatus)}</td>
                                    <td>
                                      <button
                                        type="button"
                                        className="admin-link-button"
                                        onClick={() => {
                                          closeBusinessDetail();
                                          onOpenRequestDetail?.(request);
                                        }}
                                      >
                                        상세보기
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                  )}

                  {activeDetailTab === "memo" && (
                    <div className="admin-detail-panel admin-business-basic-panel">
                    <div>
                      <h3>관리자 메모</h3>
                      <p>{modalBusiness.notes || "등록된 관리자 메모가 없습니다."}</p>
                    </div>
                  </div>
                  )}
                </>
              )}
            </div>
          </div>
        </AdminModal>
      )}
    </section>
  );
}

function RequestManagement({
  applicationsRequestId,
  assignmentDrafts,
  assignmentsByRequest,
  filters,
  getInterpreterScheduleConflicts,
  interpreters,
  jobsById,
  requestsByJobId,
  jobApplicationsByJob,
  onJobsAdminClick,
  requests,
  settlements = [],
  sectionCount,
  sectionTitle = "의뢰 관리",
  savingKey,
  setAssignmentDrafts,
  setApplicationsRequestId,
  openRequestModal,
  setFilters,
  assignInterpreter,
  handlePriceDraft,
  saveSettlement,
  removeAssignment,
  updateRequest,
  updateApplicationStatus,
  deleteRequest,
  toggleRequestJobPublic,
  updateSettlementManagementStatus,
  updateRequestFlowStatus,
  onOpenDocumentPreview,
}) {
  const isListView = filters.view === "list";
  const [localExpandedRequestId, setLocalExpandedRequestId] = useState(null);

  return (
    <section className="admin-section">
      <SectionTitle count={`${sectionCount ?? requests.length}건`} title={sectionTitle} />
      <div className="admin-filter-bar admin-filters admin-request-filters">
        <label className="admin-filter-search admin-search-control">
          <Search size={16} aria-hidden="true" />
          <input
            value={filters.search}
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="기업명/행사명 검색"
          />
        </label>
        <MonthFilterInput
          value={filters.month}
          onChange={(month) => setFilters((current) => ({ ...current, month }))}
        />
        <select
          className="admin-filter-select"
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value }))
          }
        >
          {REQUEST_MANAGEMENT_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="admin-filter-select"
          value={filters.public}
          onChange={(event) =>
            setFilters((current) => ({ ...current, public: event.target.value }))
          }
        >
          <option value="all">공개 전체</option>
          <option value="true">공개</option>
          <option value="false">비공개</option>
        </select>
        <select
          className="admin-filter-select"
          value={filters.sort}
          onChange={(event) =>
            setFilters((current) => ({ ...current, sort: event.target.value }))
          }
          aria-label="정렬"
        >
          <option value="latest">최신순</option>
          <option value="date">날짜순</option>
        </select>
        <div className="admin-view-toggle" aria-label="보기 방식">
          <button
            type="button"
            className={filters.view !== "list" ? "is-active" : ""}
            onClick={() => setFilters((current) => ({ ...current, view: "card" }))}
          >
            <LayoutGrid size={15} aria-hidden="true" />
            카드
          </button>
          <button
            type="button"
            className={filters.view === "list" ? "is-active" : ""}
            onClick={() => setFilters((current) => ({ ...current, view: "list" }))}
          >
            <List size={15} aria-hidden="true" />
            리스트
          </button>
        </div>
      </div>

      {requests.length === 0 ? (
        <MessageBox text="조건에 맞는 의뢰가 없습니다." />
      ) : (
        <div className={isListView ? "admin-request-card-grid is-list-view" : "admin-request-card-grid"}>
          {requests.map((request) => (
            <AdminRequestCard
              key={request.id}
              applicationsExpanded={applicationsRequestId === request.id}
              assignmentDrafts={assignmentDrafts}
              assignments={assignmentsByRequest.get(request.id) || []}
              expanded={localExpandedRequestId === request.id}
              getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
              interpreters={interpreters}
              jobApplications={
                request.job_id
                  ? jobApplicationsByJob.get(String(request.job_id)) || []
                  : []
              }
              jobsById={jobsById}
              requestsByJobId={requestsByJobId}
              onJobsAdminClick={onJobsAdminClick}
              request={request}
              settlements={settlements}
              savingKey={savingKey}
              setAssignmentDrafts={setAssignmentDrafts}
              setApplicationsRequestId={setApplicationsRequestId}
              setExpandedRequestId={setLocalExpandedRequestId}
              assignInterpreter={assignInterpreter}
              handlePriceDraft={handlePriceDraft}
              saveSettlement={saveSettlement}
              removeAssignment={removeAssignment}
              updateRequest={updateRequest}
              updateSettlementManagementStatus={updateSettlementManagementStatus}
              updateRequestFlowStatus={updateRequestFlowStatus}
              updateApplicationStatus={updateApplicationStatus}
              deleteRequest={deleteRequest}
              toggleRequestJobPublic={toggleRequestJobPublic}
              openRequestModal={openRequestModal}
              onOpenDocumentPreview={onOpenDocumentPreview}
            
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AdminRequestCard({
  assignments,
  interpreters,
  jobApplications,
  jobsById,
  requestsByJobId,
  request,
  settlements = [],
  savingKey,
  updateRequest,
  updateSettlementManagementStatus,
  updateRequestFlowStatus,
  openRequestModal,
  onOpenDocumentPreview,
  expanded,
  setExpandedRequestId,
}) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const job = request.job_id ? jobsById.get(request.job_id) : null;
  const linkedRequest = request.job_id ? requestsByJobId.get(String(request.job_id)) : null;
  const settlement = findSettlementForRequest(request, settlements);
  const settlementAwareRequest = settlement
    ? {
        ...request,
        _settlement: settlement,
        _settlement_id: settlement.id,
        settlement_status: normalizeAdminSettlementStatus(
          settlement.settlement_status || settlement.status || settlement.payout_status
        ),
      }
    : request;
  const flowSource = getRequestFlowSource(settlementAwareRequest, job);
  const jobPublicState = getRequestJobPublicState(request, job);
  const designatedInterpreterName = getDesignatedInterpreterName(
    [request, job, linkedRequest],
    interpreters
  );
  const assignedInterpreterName = getAssignedInterpreterName(
    settlementAwareRequest,
    assignments,
    interpreters
  );
  const statuses = getOperationFlowStatuses(flowSource);
  const settlementStatus = getRequestSettlementControlStatus(settlementAwareRequest);
  const headlineStatus = getRequestHeadlineStatus(flowSource);
  const isStatusSaving =
    savingKey === `request-${request.id}` ||
    savingKey === `settlement-request-${getSettlementRequestRowKey(settlementAwareRequest)}`;
  const requestDate = formatDateRange(
    request.start_date,
    request.end_date,
    request.event_date
  );

  useEffect(() => {
    if (!isMoreOpen) return undefined;

    const handleClickOutside = (event) => {
      if (!moreMenuRef.current?.contains(event.target)) {
        setIsMoreOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMoreOpen]);

  const closeMoreMenu = () => setIsMoreOpen(false);

  return (
    <article
      className={`admin-request-card request-card accordion-card ${expanded ? "is-expanded" : ""}`}
      onClick={(e) => {
        // Only expand/collapse if clicking general areas, not controls or buttons
        if (
          e.target.closest("button") ||
          e.target.closest("select") ||
          e.target.closest("a") ||
          e.target.closest("input") ||
          e.target.closest("textarea") ||
          e.target.closest(".admin-more-menu") ||
          e.target.closest(".admin-flow-status-panel") ||
          e.target.closest(".operation-flow-controls")
        ) {
          return;
        }
        setExpandedRequestId(expanded ? null : request.id);
      }}
      style={{
        cursor: "pointer",
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
        borderColor: expanded ? "#c084fc" : "#e5e7eb",
        boxShadow: expanded ? "0 4px 20px rgba(192, 132, 252, 0.15)" : "",
      }}
    >
      <div className="request-card-body" style={{ gap: "8px" }}>
        <div className="admin-request-card-head">
          <div>
            <ManagementNumberBadge value={request.request_no} />
            <h3 title={request.event_name || ""}>{request.event_name || "-"}</h3>
            <button
              type="button"
              className="admin-company-history-link"
              onClick={(e) => {
                e.stopPropagation();
                openRequestModal("detail", request);
              }}
            >
              {request.company_name || "-"}
            </button>
          </div>
          <span className={`admin-flow-status-badge ${getOperationFlowBadgeClass(headlineStatus.type, headlineStatus.value)}`}>
            {headlineStatus.label}
          </span>
        </div>

        <div className="admin-status-badge-row" style={{ marginBottom: expanded ? "6px" : "0" }}>
          <FlowStatusBadge
            type="operation"
            value={request.estimate_status || "estimate_preparing"}
            label={getEstimateStatusLabel(request.estimate_status)}
          />
          <FlowStatusBadge
            type="assignment"
            value={statuses.assignment_status}
            label={getOperationStatusOptionLabel(ASSIGNMENT_STATUS_OPTIONS, statuses.assignment_status)}
          />
          <FlowStatusBadge
            type="operation"
            value={statuses.operation_status}
            label={getOperationStatusOptionLabel(OPERATION_STATUS_OPTIONS, statuses.operation_status)}
          />
          <FlowStatusBadge
            type="settlement"
            value={settlementStatus}
            label={getSettlementPayoutStatusLabel(settlementStatus)}
          />
        </div>

        {/* Expandable Details Container */}
        <div className={`admin-card-expandable-content ${expanded ? "is-expanded" : ""}`}>
          <div className="admin-card-expandable-content-inner">
            <div className="admin-flow-status-panel" onClick={(e) => e.stopPropagation()}>
              <h3>견적 상태</h3>
              <InlineSelect
                options={ESTIMATE_STATUS_OPTIONS}
                value={request.estimate_status || "estimate_preparing"}
                onChange={(value) => updateRequest(request.id, { estimate_status: value })}
              />
            </div>

            <dl className="admin-request-summary admin-request-summary-clean">
              <Info label="의뢰번호" value={formatManagementNumber(request.request_no)} />
              <Info label="날짜" value={requestDate} />
              <Info label="장소" value={request.event_location || "-"} />
              <Info label="지정 요청" value={designatedInterpreterName} />
              <Info label="배정 통역사" value={assignedInterpreterName || "-"} />
            </dl>

            <OperationFlowStatusControls
              item={flowSource}
              disabled={isStatusSaving}
              onChange={(changes) => updateRequestFlowStatus(request, changes)}
              settlementValue={settlementStatus}
              onSettlementChange={(value) =>
                updateSettlementManagementStatus(settlementAwareRequest, { settlement_status: value })
              }
            />

            {/* Row 1: Primary Actions (지원자 확인, 상세보기) */}
            <div className="admin-card-primary-actions">
              <button
                type="button"
                className="admin-link-button primary"
                onClick={(e) => {
                  e.stopPropagation();
                  openRequestModal("applicants", request);
                }}
              >
                지원자 확인 ({jobApplications.length}명)
              </button>
              <button
                type="button"
                className="admin-link-button primary subtle"
                onClick={(e) => {
                  e.stopPropagation();
                  openRequestModal("detail", request);
                }}
              >
                상세보기
              </button>
            </div>

            {/* Row 2: Secondary Actions (견적서 생성, 업무 확인서 생성, 더보기) */}
            <div className="admin-card-secondary-area">
              <div className="admin-card-secondary-title">문서 생성</div>
              <div className="admin-card-secondary-actions">
                <button
                  type="button"
                  className="admin-link-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDocumentPreview("estimate", request);
                  }}
                >
                  견적서 생성
                </button>
                {(() => {
                  const isCompleted = normalizeOperationStatus(request) === OPERATION_STATUS.COMPLETED;
                  return (
                    <button
                      type="button"
                      className="admin-link-button"
                      disabled={!isCompleted}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDocumentPreview("completion", request);
                      }}
                      style={{
                        background: isCompleted ? "" : "#f3f4f6",
                        color: isCompleted ? "" : "#9ca3af",
                        border: isCompleted ? "" : "1px solid #e5e7eb",
                        cursor: isCompleted ? "pointer" : "not-allowed",
                      }}
                    >
                      {isCompleted ? "업무 확인서 생성" : "업무 완료 후 생성"}
                    </button>
                  );
                })()}
                <div className="admin-more-menu request-more-wrapper" ref={moreMenuRef} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="request-more-trigger"
                    aria-label="더보기"
                    aria-expanded={isMoreOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMoreOpen((current) => !current);
                    }}
                  >
                    <MoreHorizontal size={18} aria-hidden="true" />
                  </button>
                  {isMoreOpen && (
                    <div className="request-more-menu">
                      <button
                        type="button"
                        className="request-more-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRequestModal("edit", request);
                          closeMoreMenu();
                        }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="request-more-item"
                        disabled={savingKey === `request-job-${request.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openRequestModal("visibility", request);
                          closeMoreMenu();
                        }}
                      >
                        {jobPublicState.type === "public" ? "비공개 전환" : "공고 공개"}
                      </button>
                      <button
                        type="button"
                        className="request-more-item danger"
                        disabled={savingKey === `request-delete-${request.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openRequestModal("delete", request);
                          closeMoreMenu();
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Expand / Collapse Indicator Button */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedRequestId(expanded ? null : request.id);
            }}
            style={{
              fontSize: "11px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              background: "none",
              border: "none",
              color: "#6b7280",
              cursor: "pointer",
              fontWeight: "800",
              transition: "color 0.2s ease"
            }}
            onMouseEnter={(e) => e.target.style.color = "#4f46e5"}
            onMouseLeave={(e) => e.target.style.color = "#6b7280"}
          >
            {expanded ? "▲ 접기" : "▼ 펼치기"}
          </button>
        </div>
      </div>
    </article>
  );
}

const DEFAULT_CHECKLIST_ITEMS = [
  "기업 자료 수령 확인",
  "통역사 배정 통보 완료",
  "연락처 공개 처리",
  "행사 장소/일정 재확인",
  "통역 장비 필요 여부 확인",
  "업무 시작 전 최종 확인",
];

function PreparationChecklistPanel({ requestId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("request_preparation_checklist")
          .select("*")
          .eq("request_id", requestId)
          .order("created_at", { ascending: true });

        if (!error && data && data.length > 0) {
          setItems(data);
        } else {
          // If no items yet, show default items as unchecked
          setItems(
            DEFAULT_CHECKLIST_ITEMS.map((label, idx) => ({
              id: `draft-${idx}`,
              request_id: requestId,
              item_label: label,
              is_done: false,
              done_by: null,
              done_at: null,
              isDraft: true,
            }))
          );
        }
      } catch (err) {
        console.error("Error loading preparation checklist:", err);
      } finally {
        setLoading(false);
      }
    });
  }, [requestId]);

  const handleToggle = async (item) => {
    setSaving(true);
    try {
      if (item.isDraft) {
        // Insert all draft items first, then toggle this one
        const allDraftItems = items.filter((i) => i.isDraft);
        const insertPayload = allDraftItems.map((i) => ({
          request_id: requestId,
          item_label: i.item_label,
          is_done: i.item_label === item.item_label ? !item.is_done : i.is_done,
        }));
        const { data, error } = await supabase
          .from("request_preparation_checklist")
          .insert(insertPayload)
          .select("*")
          .order("created_at", { ascending: true });
        if (error) throw error;
        setItems(data || []);
      } else {
        const newDone = !item.is_done;
        const { error } = await supabase
          .from("request_preparation_checklist")
          .update({
            is_done: newDone,
            done_at: newDone ? new Date().toISOString() : null,
          })
          .eq("id", item.id);
        if (error) throw error;
        setItems((current) =>
          current.map((i) =>
            i.id === item.id ? { ...i, is_done: newDone, done_at: newDone ? new Date().toISOString() : null } : i
          )
        );
      }
    } catch (err) {
      console.error("Error toggling checklist item:", err);
      alert("체크리스트 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="prep-checklist-panel"><p className="prep-loading">불러오는 중...</p></div>;
  }

  const doneCount = items.filter((i) => i.is_done).length;

  return (
    <div className="prep-checklist-panel">
      <div className="prep-checklist-header">
        <h4>🗒️ 업무 준비 체크리스트</h4>
        <span className="prep-count">{doneCount} / {items.length} 완료</span>
      </div>
      <ul className="prep-checklist-list">
        {items.map((item) => (
          <li key={item.id} className={`prep-checklist-item ${item.is_done ? "is-done" : ""}`}>
            <label>
              <input
                type="checkbox"
                checked={item.is_done}
                disabled={saving}
                onChange={() => handleToggle(item)}
              />
              <span>{item.item_label}</span>
              {item.is_done && item.done_at && (
                <span className="prep-done-time">
                  {new Date(item.done_at).toLocaleDateString("ko-KR", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestDetailPanel({
  adminActivityLogs = [],
  adminNotes = [],
  applications,
  assignmentDrafts,
  assignments,
  getInterpreterScheduleConflicts,
  interpreters,
  job,
  request,
  requests = [],
  settlements = [],
  savingKey,
  setAssignmentDrafts,
  assignInterpreter,
  handlePriceDraft,
  settlementTouched = {},
  saveSettlement,
  removeAssignment,
  handleContactVisibleChange,
  updateRequest,
  updateSettlementManagementStatus,
  updateApplicationStatus,
  updateRequestFlowStatus,
  noteDrafts = {},
  onChangeNoteDraft,
  onCreateNote,
  onOpenDocumentPreview,
  generatedDocuments = [],
}) {
  const safeRequest = request || {};
  const settlement = findSettlementForRequest(safeRequest, settlements);
  const settlementAwareRequest = settlement
    ? {
        ...safeRequest,
        _settlement: settlement,
        _settlement_id: settlement.id,
        settlement_status: normalizeAdminSettlementStatus(
          settlement.settlement_status || settlement.status || settlement.payout_status
        ),
      }
    : safeRequest;
  const requestInterpreters = Array.isArray(assignments) ? assignments : [];
  const flowSource = getRequestFlowSource(settlementAwareRequest, job);
  const requestType = getDesignatedRequestType(safeRequest);
  const designatedInterpreterName = getDesignatedInterpreterName([safeRequest], interpreters);
  const designatedRequestCheckStatus = getDesignatedRequestCheckStatus(safeRequest, requestInterpreters);
  const assignedInterpreterName = getAssignedInterpreterName(
    safeRequest,
    requestInterpreters,
    interpreters
  );
  const assignedInterpreterIds = new Set(
    requestInterpreters.map((assignment) => String(assignment?.interpreter_id || ""))
  );
  const assignableInterpreters = interpreters.filter(
    (interpreter) =>
      interpreter.approved &&
      interpreter.status !== "suspended" &&
      !assignedInterpreterIds.has(String(interpreter.id))
  );
  const scheduleRange = getAssignmentScheduleRange(safeRequest, job);
  const requestDescription = getRequestDescription(safeRequest);
  const referenceFile = getRequestReferenceFile(safeRequest, requestDescription);
  const visibleRequestDescription = removeRequestReferenceFileMeta(requestDescription);
  const companyHistory = getCompanyHistory(safeRequest, requests, requestInterpreters, interpreters);

  const [activeTab, setActiveTab] = useState("basic");
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState(() => new Set());
  const [businessProfile, setBusinessProfile] = useState(null);
  const normalizedRequestDetail = normalizeRequestDetail(safeRequest, businessProfile);
  const businessContact = {
    companyName: normalizedRequestDetail?.company.name || "",
    contactName: normalizedRequestDetail?.contact.name || "",
    phone: normalizedRequestDetail?.contact.phone || "",
    email: normalizedRequestDetail?.contact.email || "",
  };
  const [uploadedMaterials, setUploadedMaterials] = useState([]);
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [openEventDatePicker, setOpenEventDatePicker] = useState(null);
  const [companyAmountInputs, setCompanyAmountInputs] = useState({});
  const [interpreterPaymentInputs, setInterpreterPaymentInputs] = useState({});
  const eventDatePickerRef = useRef(null);
  const interpreterPaymentInputKey = String(safeRequest?.id || "");
  const companyAmountInputKey = interpreterPaymentInputKey;
  const savedCompanyAmountInput =
    safeRequest.company_amount ?? safeRequest.client_price ?? "";
  const hasCompanyAmountDraft =
    companyAmountInputKey &&
    Object.prototype.hasOwnProperty.call(companyAmountInputs, companyAmountInputKey);
  const companyAmountInput = hasCompanyAmountDraft
    ? companyAmountInputs[companyAmountInputKey]
    : String(savedCompanyAmountInput);
  const savedInterpreterPaymentInput =
    settlement?.amount === null || settlement?.amount === undefined ? "" : String(settlement.amount);
  const hasInterpreterPaymentDraft =
    interpreterPaymentInputKey &&
    Object.prototype.hasOwnProperty.call(interpreterPaymentInputs, interpreterPaymentInputKey);
  const interpreterPaymentInput = hasInterpreterPaymentDraft
    ? interpreterPaymentInputs[interpreterPaymentInputKey]
    : savedInterpreterPaymentInput;
  const companyAmountForProfit = companyAmountInput.trim() === ""
    ? null
    : Number(companyAmountInput.replaceAll(",", ""));
  const interpreterAmountForProfit = interpreterPaymentInput.trim() === ""
    ? null
    : Number(interpreterPaymentInput.replaceAll(",", ""));
  const platformProfitPreview = useMemo(
    () => companyAmountForProfit !== null && interpreterAmountForProfit !== null
      ? companyAmountForProfit - interpreterAmountForProfit
      : null,
    [companyAmountForProfit, interpreterAmountForProfit]
  );

  const handleCompanyAmountInputChange = (event) => {
    if (!companyAmountInputKey) return;
    setCompanyAmountInputs((current) => ({
      ...current,
      [companyAmountInputKey]: event.target.value.replace(/[^\d]/g, ""),
    }));
  };

  const handleInterpreterPaymentInputChange = (event) => {
    const value = event.target.value;
    if (!interpreterPaymentInputKey) return;
    if (value === "") {
      setInterpreterPaymentInputs((current) => ({
        ...current,
        [interpreterPaymentInputKey]: "",
      }));
      return;
    }
    setInterpreterPaymentInputs((current) => ({
      ...current,
      [interpreterPaymentInputKey]: value.replace(/[^\d,]/g, ""),
    }));
  };

  const handleSaveSettlement = async () => {
    const saved = await saveSettlement(safeRequest, {
      companyAmountInput,
      interpreterPaymentInput,
    });
    if (!saved || !interpreterPaymentInputKey) return;

    setCompanyAmountInputs((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, companyAmountInputKey)) return current;
      const next = { ...current };
      delete next[companyAmountInputKey];
      return next;
    });
    setInterpreterPaymentInputs((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, interpreterPaymentInputKey)) {
        return current;
      }
      const next = { ...current };
      delete next[interpreterPaymentInputKey];
      return next;
    });
  };

  useEffect(() => {
    if (!request) return;

    const startDate = normalizeDateToISO(request.start_date || request.event_date);
    setEventStartDate(startDate);
    setEventEndDate(normalizeDateToISO(request.end_date || startDate));
  }, [request?.id, request?.start_date, request?.end_date, request?.event_date]);

  useEffect(() => {
    if (!openEventDatePicker) return undefined;

    const handlePointerDown = (event) => {
      if (eventDatePickerRef.current?.contains(event.target)) return;
      setOpenEventDatePicker(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openEventDatePicker]);

  useEffect(() => {
    Promise.resolve().then(() => {
      if (!safeRequest?.company_auth_user_id) {
        setBusinessProfile(null);
        return;
      }
      const fetchBiz = async () => {
        try {
          const data = await fetchRequestBusinessProfile(supabase, safeRequest);
          setBusinessProfile(data);
        } catch (err) {
          console.error("Error fetching biz profile in admin request panel:", err);
          setBusinessProfile(null);
        }
      };
      fetchBiz();
    });
  }, [safeRequest.company_auth_user_id]);

  useEffect(() => {
    Promise.resolve().then(() => {
      if (!safeRequest?.id) {
        setUploadedMaterials([]);
        return;
      }
      const fetchMaterials = async () => {
        try {
          const { data, error } = await supabase
            .from("request_materials")
            .select("*")
            .eq("request_id", safeRequest.id)
            .order("created_at", { ascending: false });
          if (!error) {
            setUploadedMaterials(data || []);
          }
        } catch (err) {
          console.error("Error fetching request materials in admin request panel:", err);
        }
      };
      fetchMaterials();
    });
  }, [safeRequest.id]);

  const companyPreviousRequests = requests.filter(r => 
    r.id !== request.id && 
    ((request.company_auth_user_id && r.company_auth_user_id === request.company_auth_user_id) || 
     (r.company_name && r.company_name === request.company_name))
  );

  const handleDownloadMaterial = async (path, name) => {
    try {
      const { data, error } = await supabase.storage
        .from("request-files")
        .createSignedUrl(path, 600, { download: name || true });
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Error generating signed URL for admin:", err);
      alert("자료 파일을 다운로드할 수 없습니다.");
    }
  };
  const getMaterialDisplayName = (material = {}) =>
    material.original_file_name || material.file_name || "자료 파일";

  useEffect(() => {
    const requestWithDefaults = applySettlementDefaults(request, settlementTouched);
    if (requestWithDefaults === request) return;

    if (getCompanyAmount(requestWithDefaults) !== getCompanyAmount(request)) {
      handlePriceDraft(request.id, "company_amount", getCompanyAmount(requestWithDefaults), {
        auto: true,
      });
    }
    if (getInterpreterPayment(requestWithDefaults) !== getInterpreterPayment(request)) {
      handlePriceDraft(
        request.id,
        "interpreter_payment",
        getInterpreterPayment(requestWithDefaults),
        { auto: true }
      );
    }
  }, [
    handlePriceDraft,
    request,
    request.id,
    request.requested_level,
    request.required_level,
    settlementTouched,
  ]);

  const createReferenceFileUrl = async ({ download = false } = {}) => {
    if (!referenceFile?.path) return;

    if (referenceFile.path.startsWith("http://") || referenceFile.path.startsWith("https://")) {
      return referenceFile.path;
    }

    const { data, error } = await supabase.storage
      .from(REQUEST_REFERENCE_BUCKET)
      .createSignedUrl(
        referenceFile.path,
        60 * 10,
        download ? { download: referenceFile.name || true } : undefined
      );

    if (error) throw error;
    return data.signedUrl;
  };

  const handleOpenReferenceFile = async () => {
    try {
      const fileUrl = await createReferenceFileUrl();
      if (!fileUrl) return;
      window.open(fileUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("SIGNED_URL_FAILED", {
        error,
        message: error?.message,
        details: error?.details,
        statusCode: error?.statusCode,
        status: error?.status,
        bucket: REQUEST_REFERENCE_BUCKET,
        filePath: referenceFile?.path,
      });
      alert("참고 자료 파일을 열 수 없습니다. 권한 또는 파일 경로를 확인해주세요.");
    }
  };

  const handleDownloadReferenceFile = async () => {
    try {
      const fileUrl = await createReferenceFileUrl({ download: true });
      if (!fileUrl) return;
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = referenceFile.name || "reference-file";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("SIGNED_URL_FAILED", {
        error,
        message: error?.message,
        details: error?.details,
        statusCode: error?.statusCode,
        status: error?.status,
        bucket: REQUEST_REFERENCE_BUCKET,
        filePath: referenceFile?.path,
      });
      alert("참고 자료 파일을 다운로드할 수 없습니다. 권한 또는 파일 경로를 확인해주세요.");
    }
  };

  // Activity logs & notes for this request
  const targetType = "request";
  const targetId = request.id;
  const targetKey = `${targetType}:${String(targetId)}`;
  const allTargetNotes = adminNotes.filter(
    (note) => note.target_type === targetType && String(note.target_id) === String(targetId)
  );
  const allTargetLogs = adminActivityLogs.filter(
    (log) => log.target_type === targetType && String(log.target_id) === String(targetId)
  );
  const LOGS_DEFAULT_LIMIT = 5;
  const sortedTargetLogs = useMemo(
    () =>
      [...allTargetLogs].sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      ),
    [allTargetLogs]
  );
  const visibleLogs = showAllLogs ? sortedTargetLogs : sortedTargetLogs.slice(0, LOGS_DEFAULT_LIMIT);
  const toggleLogExpanded = (logId) => {
    setExpandedLogIds((current) => {
      const next = new Set(current);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  const tabs = [
    { id: "basic", label: "기본 정보" },
    { id: "operation", label: "운영 정보" },
    { id: "documents", label: "문서" },
    { id: "memo", label: `메모 · 이력${allTargetLogs.length > 0 ? ` (${allTargetLogs.length})` : ""}` },
  ];

  return (
    <div className="admin-detail-tab-panel">
      {/* Tab navigation */}
      <div className="admin-detail-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`admin-detail-tab-btn${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: 기본 정보 ── */}
      {activeTab === "basic" && (
        <div className="admin-detail-tab-content admin-detail-panel">
          <ManagementNumberBlock label="관리번호" value={request.request_no} />

          <div>
            <h3>기본정보</h3>
            <dl className="admin-detail-list compact">
              <Info label="의뢰번호" value={formatManagementNumber(request.request_no)} />
              <Info label="담당자" value={businessContact.contactName || "미등록"} />
              <Info label="의뢰 유형" value={requestType.label} />
              <Info label="지정 요청 통역사" value={designatedInterpreterName} />
              <Info label="지정 요청 상태" value={designatedRequestCheckStatus} />
              <Info label="배정 통역사" value={assignedInterpreterName || "-"} />
              <Info label="약관 동의" value={getAgreementStatusLabel(request)} />
              <Info label="동의 시간" value={formatDateTime(request.agreed_at)} />
              <Info label="이메일" value={businessContact.email || "미등록"} />
              <Info label="연락처" value={businessContact.phone || "미등록"} />
              <Info
                label="행사 기간"
                value={formatDateRange(
                  request.start_date,
                  request.end_date,
                  request.event_date
                )}
              />
              <Info label="근무시간" value={request.work_hours} />
              <Info
                label="희망 레벨"
                value={request.requested_level || request.required_level}
              />
              <Info
                label="필요 인원"
                value={
                  request.requested_people_count || request.required_count
                    ? `${request.requested_people_count || request.required_count}명`
                    : "-"
                }
              />
              <Info label="희망 성별" value={request.preferred_gender} />
              <Info label="언어 방향" value={request.language_direction} />
              <Info label="진행 시간" value={formatTimeRange(request.event_start_time, request.event_end_time)} />
              <Info label="견적 상태" value={getEstimateStatusLabel(request.estimate_status)} />
              <Info label="자료 업로드" value={request.materials_available ? "가능" : "없음/미정"} />
            </dl>
          </div>

          {businessProfile && (
            <div>
            <h3>기업</h3>
              <dl className="admin-detail-list compact">
                <Info label="회사명" value={businessContact.companyName || "미등록"} />
                <Info label="사업자번호" value={businessProfile.business_number} />
                <Info label="담당자명" value={businessContact.contactName || "미등록"} />
                <Info label="담당자 연락처" value={businessContact.phone || "미등록"} />
                <Info label="담당자 이메일" value={businessContact.email || "미등록"} />
                <Info label="국가" value={businessProfile.country} />
                <Info label="주요 분야" value={businessProfile.primary_fields?.join(", ") || "-"} />
                <Info label="세금계산서" value={businessProfile.tax_invoice_required ? "필요" : "불필요"} />
                <Info label="기타 메모" value={businessProfile.notes || "-"} />
              </dl>
            </div>
          )}

          <div>
            <h3>이용 이력</h3>
            <dl className="admin-detail-list compact">
              <Info label="과거 의뢰" value={`${companyHistory.requestCount}건`} />
              <Info label="진행한 행사" value={companyHistory.events || "-"} />
              <Info label="이용 통역사" value={companyHistory.interpreters || "-"} />
              <Info label="총 이용 금액" value={formatJPY(companyHistory.totalAmount)} />
              <Info label="관리자 메모" value={companyHistory.memo || "-"} />
            </dl>
          </div>

          {companyPreviousRequests.length > 0 && (
            <div>
              <h3>이전 의뢰 기록</h3>
              <div className="admin-previous-requests-list">
                {companyPreviousRequests.map(prev => (
                  <div key={prev.id} className="admin-previous-request-row">
                    <span>{prev.event_name || prev.title || `REQ-${prev.id}`} ({prev.start_date})</span>
                    <span className="badge-gray">
                      {prev.status || prev.matching_status || "접수"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3>메모</h3>
            <textarea
              className="admin-textarea"
              rows={4}
              defaultValue={request.company_internal_memo || ""}
              onBlur={(event) => {
                if (event.target.value !== (request.company_internal_memo || "")) {
                  updateRequest(request.id, { company_internal_memo: event.target.value });
                }
              }}
              placeholder="담당자 특징, 요청사항, 주의사항, 결제 관련 기록"
            />
          </div>

          <div>
            <h3>업무 내용</h3>
            <p>{visibleRequestDescription || "-"}</p>
            <RequestReferenceFileBlock
              file={referenceFile}
              onOpen={handleOpenReferenceFile}
              onDownload={handleDownloadReferenceFile}
            />
            <div className="admin-uploaded-materials">
              <h4>업로드 행사 자료</h4>
              {uploadedMaterials.length === 0 ? (
                <p>업로드된 행사 자료가 없습니다.</p>
              ) : (
                <div className="admin-document-list">
                  {uploadedMaterials.map(mat => (
                    <div key={mat.id} className="admin-document-list-row">
                      <div>
                        <span className="badge-green">{mat.file_type}</span>
                        <strong>{getMaterialDisplayName(mat)}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadMaterial(mat.file_path, getMaterialDisplayName(mat))}
                        className="admin-link-button"
                      >
                        다운로드
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <h3 style={{ marginTop: "16px" }}>복장/주의사항</h3>
            <p>{request.dress_code || "추후 안내"}</p>
          </div>
        </div>
      )}

      {/* ── TAB: 운영 정보 ── */}
      {activeTab === "operation" && (
        <div className="admin-detail-tab-content admin-detail-panel">
          <div className="admin-flow-status-panel">
            <h3>운영 단계</h3>
            <OperationFlowStatusControls
              item={flowSource}
              disabled={
                savingKey === `request-${request.id}` ||
                savingKey === `settlement-request-${getSettlementRequestRowKey(settlementAwareRequest)}`
              }
              onChange={(changes) => updateRequestFlowStatus(settlementAwareRequest, changes)}
              settlementValue={getRequestSettlementControlStatus(settlementAwareRequest)}
              onSettlementChange={(value) =>
                updateSettlementManagementStatus(settlementAwareRequest, { settlement_status: value })
              }
            />
          </div>

          <div>
            <h3>행사 기간 수정</h3>
            <div className="admin-date-range-panel">
              <div className="date-range-picker-shell" ref={eventDatePickerRef}>
                <div className="date-range-fields">
                  <EventDatePickerButton
                    label="시작일"
                    value={eventStartDate}
                    active={openEventDatePicker === "start"}
                    placeholder="시작일 선택"
                    onClick={() =>
                      setOpenEventDatePicker((current) =>
                        current === "start" ? null : "start"
                      )
                    }
                  />
                  <EventDatePickerButton
                    label="종료일"
                    value={eventEndDate}
                    active={openEventDatePicker === "end"}
                    placeholder="종료일 선택"
                    onClick={() =>
                      setOpenEventDatePicker((current) =>
                        current === "end" ? null : "end"
                      )
                    }
                  />
                </div>

                {openEventDatePicker && (
                  <div className="date-range-calendar-panel">
                    <DayPicker
                      mode="single"
                      locale={ko}
                      selected={adminDateFromISO(
                        openEventDatePicker === "start" ? eventStartDate : eventEndDate
                      )}
                      defaultMonth={
                        adminDateFromISO(
                          openEventDatePicker === "start" ? eventStartDate : eventEndDate
                        ) ||
                        adminDateFromISO(eventStartDate) ||
                        new Date()
                      }
                      disabled={
                        openEventDatePicker === "end" && eventStartDate
                          ? (date) => date < adminDateFromISO(eventStartDate)
                          : undefined
                      }
                      onSelect={(date) => {
                        const value = adminISOFromDate(date);
                        if (!value) return;

                        if (openEventDatePicker === "start") {
                          setEventStartDate(value);
                          if (!eventEndDate || eventEndDate < value) {
                            setEventEndDate(value);
                          }
                        } else {
                          setEventEndDate(value);
                        }

                        setOpenEventDatePicker(null);
                      }}
                      numberOfMonths={1}
                      weekStartsOn={1}
                      fixedWeeks
                      showOutsideDays
                    />
                  </div>
                )}
              </div>
              <div className="admin-detail-action-row">
                <button
                  type="button"
                  className="admin-save"
                  disabled={savingKey === `request-${safeRequest?.id}`}
                  onClick={async () => {
                    const startDate = normalizeDateToISO(eventStartDate);
                    const endDate = normalizeDateToISO(eventEndDate) || startDate;

                    if (startDate && endDate && endDate < startDate) {
                      alert("종료일은 시작일보다 빠를 수 없습니다.");
                      return;
                    }

                    const payload = {
                      start_date: startDate || "",
                      end_date: endDate || startDate || "",
                      event_date: startDate || "",
                    };

                    if (safeRequest?.id) await updateRequest(safeRequest.id, payload);
                  }}
                >
                  행사 기간 저장
                </button>
              </div>
            </div>
          </div>

          <div>
            <h3>정산 관리</h3>
            <div className="admin-settlement">
              <p className="admin-settlement-note">
                희망 통역 레벨 기준 금액이 자동 입력됩니다. 필요 시 직접 수정할 수 있습니다.
              </p>
              <FieldControl label="기업 금액">
                <input
                  type="text"
                  inputMode="numeric"
                  value={companyAmountInput}
                  onChange={handleCompanyAmountInputChange}
                  placeholder="기업 금액 입력"
                />
              </FieldControl>
              <FieldControl label="통역사 지급액">
                <input
                  type="text"
                  inputMode="numeric"
                  value={interpreterPaymentInput}
                  onChange={handleInterpreterPaymentInputChange}
                />
              </FieldControl>
              <div className="admin-profit">
                <span>플랫폼 수익</span>
                <strong className={platformProfitPreview !== null && platformProfitPreview < 0 ? "is-negative" : ""}>
                  {platformProfitPreview === null ? "-" : formatJPY(platformProfitPreview)}
                </strong>
              </div>
              {platformProfitPreview !== null && platformProfitPreview < 0 && (
                <p className="admin-settlement-note is-negative">
                  통역사 지급액이 기업 금액보다 큽니다. 플랫폼 수익이 음수입니다.
                </p>
              )}
              <button
                type="button"
                className="admin-save"
                disabled={savingKey === `request-${safeRequest?.id}`}
                onClick={handleSaveSettlement}
              >
                정산 저장
              </button>
            </div>
          </div>

          <div>
            <h3>매칭 통역사</h3>
            <AssignmentList
              emptyText="미배정"
              items={assignments.map((assignment) => ({
                id: assignment.id,
                assignment,
                label: getAssignedInterpreterLabel(
                  getAssignmentInterpreter(assignment, interpreters)
                ),
              }))}
              onRemove={removeAssignment}
              handleContactVisibleChange={handleContactVisibleChange}
            />
            <div className="admin-assign-row">
              <select
                value={assignmentDrafts[safeRequest?.id] || ""}
                onChange={(event) =>
                  setAssignmentDrafts((current) => ({
                    ...current,
                    [safeRequest?.id]: event.target.value,
                  }))
                }
              >
                <option value="">통역사 선택</option>
                {assignableInterpreters.map((interpreter) => (
                  <option key={interpreter.id} value={interpreter.id}>
                    {getInterpreterSelectLabel(interpreter)}
                    {hasInterpreterScheduleConflict(
                      getInterpreterScheduleConflicts,
                      interpreter.id,
                      scheduleRange
                    )
                      ? " (일정 충돌)"
                      : ""}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => safeRequest?.id && assignInterpreter(safeRequest.id)}>
                배정
              </button>
            </div>
          </div>

          <div>
            <h3>지원자 목록</h3>
            <JobApplicationsPanel
              applications={applications}
              assignments={assignments}
              getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
              interpreters={interpreters}
              request={request}
              onRemoveAssignment={removeAssignment}
              onStatusChange={updateApplicationStatus}
            />
          </div>

          {["assignment_completed", "assigned", "preparing", "ready"].includes(request.assignment_status) && (
            <PreparationChecklistPanel requestId={request.id} />
          )}
        </div>
      )}

      {/* ── TAB: 문서 ── */}
      {activeTab === "documents" && (
        <div className="admin-detail-tab-content admin-detail-panel">
          <div>
            <h3>견적서 관리</h3>
            <div className="admin-document-action-block">
              <p className="admin-settlement-note">
                의뢰인용 견적서를 발급하거나 수정할 수 있습니다.
              </p>
              <div className="admin-detail-action-row">
                <button
                  type="button"
                  className="admin-link-button"
                  onClick={() => onOpenDocumentPreview("estimate", request)}
                >
                  견적서 생성
                </button>
              </div>
            </div>
          </div>

          <div>
            <h3>업무확인서 관리</h3>
            <div className="admin-document-action-block">
              <p className="admin-settlement-note">
                의뢰 상태가 '완료'일 때만 업무확인서 발급이 가능합니다.
              </p>
              <div className="admin-detail-action-row">
                <button
                  type="button"
                  className="admin-link-button"
                  disabled={normalizeOperationStatus(request) !== OPERATION_STATUS.COMPLETED}
                  onClick={() => onOpenDocumentPreview("completion", request)}
                >
                  업무확인서 생성
                </button>
                {normalizeOperationStatus(request) !== OPERATION_STATUS.COMPLETED && (
                  <span className="admin-inline-warning">업무 완료 후 생성 가능</span>
                )}
              </div>
            </div>
          </div>

          <div>
            <h3>발급 문서 관리</h3>
            <div className="admin-document-list">
              {(() => {
                const requestDocs = generatedDocuments.filter((doc) => doc.request_id === request.id);
                const latestEstimate = requestDocs
                  .filter((d) => d.document_type === "estimate")
                  .sort((a, b) => b.version - a.version)[0];
                const latestCompletion = requestDocs
                  .filter((d) => d.document_type === "completion")
                  .sort((a, b) => b.version - a.version)[0];

                if (requestDocs.length === 0) {
                  return <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>발급된 문서가 없습니다.</p>;
                }

                return (
                  <>
                    <div className="admin-document-list-row">
                      <div>
                        <strong>최신 견적서</strong>
                        {latestEstimate ? (
                          <span>
                            {latestEstimate.document_no} (v{latestEstimate.version})
                          </span>
                        ) : (
                          <span>미발급</span>
                        )}
                      </div>
                      {latestEstimate && (
                        <button
                          type="button"
                          className="admin-link-button"
                          onClick={() => openDocumentSignedUrl(supabase, latestEstimate)}
                        >
                          보기
                        </button>
                      )}
                    </div>

                    <div className="admin-document-list-row">
                      <div>
                        <strong>최신 업무확인서</strong>
                        {latestCompletion ? (
                          <span>
                            {latestCompletion.document_no} (v{latestCompletion.version})
                          </span>
                        ) : (
                          <span>미발급</span>
                        )}
                      </div>
                      {latestCompletion && (
                        <button
                          type="button"
                          className="admin-link-button"
                          onClick={() => openDocumentSignedUrl(supabase, latestCompletion)}
                        >
                          보기
                        </button>
                      )}
                    </div>

                    {requestDocs.length > 0 && (
                      <div className="admin-document-history">
                        <h4>
                          전체 문서 발급 이력 ({requestDocs.length}건)
                        </h4>
                        <div className="admin-document-list is-scrollable">
                          {requestDocs.map((doc) => (
                            <div
                              key={doc.id}
                              className="admin-document-list-row"
                            >
                              <span>
                                <strong>
                                  [{getDocumentTypeLabel(doc.document_type)}]
                                </strong>
                                {doc.document_no} <span>(v{doc.version})</span>
                              </span>
                              <button
                                type="button"
                                className="admin-link-button"
                                onClick={() => openDocumentSignedUrl(supabase, doc)}
                              >
                                보기
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: 메모 · 처리이력 ── */}
      {activeTab === "memo" && (
        <div className="admin-detail-tab-content admin-detail-memo-tab">
          {/* 내부 메모 작성 */}
          <div className="admin-memo-section">
            <h3>내부 메모</h3>
            {allTargetNotes.length === 0 ? (
              <p className="admin-empty-text">등록된 내부 메모가 없습니다.</p>
            ) : (
              <div className="admin-note-list">
                {allTargetNotes.map((note) => (
                  <article className="admin-operation-log-item" key={note.id}>
                    <p>{note.note}</p>
                    <span>{formatDateTime(note.created_at)}</span>
                  </article>
                ))}
              </div>
            )}
            <label className="admin-field-control admin-note-input" style={{ marginTop: "12px" }}>
              <span>새 메모</span>
              <textarea
                rows={4}
                value={noteDrafts[targetKey] || ""}
                onChange={(event) =>
                  onChangeNoteDraft?.(targetType, targetId, event.target.value)
                }
                placeholder="운영팀 내부 확인 내용을 남겨주세요."
                style={{ resize: "vertical" }}
              />
            </label>
            <div className="admin-memo-actions">
              <button
                type="button"
                className="admin-save"
                disabled={savingKey === `admin-note-request:${request.id}`}
                onClick={() => onCreateNote?.(targetType, targetId)}
              >
                {savingKey === `admin-note-request:${request.id}` ? "저장 중..." : "메모 저장"}
              </button>
            </div>
          </div>

          {/* 처리 이력 */}
          <div className="admin-memo-section">
            <div className="admin-memo-section-header">
              <h3>처리 이력</h3>
              {sortedTargetLogs.length > 0 && (
                <span className="admin-log-count-badge">{sortedTargetLogs.length}건</span>
              )}
            </div>
            {sortedTargetLogs.length === 0 ? (
              <p className="admin-empty-text">아직 처리 이력이 없습니다.</p>
            ) : (
              <div className="admin-activity-timeline">
                {visibleLogs.map((log) => (
                  <AdminActivityLogCard
                    key={log.id}
                    expanded={expandedLogIds.has(log.id)}
                    log={log}
                    onToggle={() => toggleLogExpanded(log.id)}
                  />
                ))}
                {sortedTargetLogs.length > LOGS_DEFAULT_LIMIT && (
                  <button
                    type="button"
                    className="admin-log-toggle-btn"
                    onClick={() => setShowAllLogs((v) => !v)}
                  >
                    {showAllLogs
                      ? "접기"
                      : `전체 보기 (${sortedTargetLogs.length - LOGS_DEFAULT_LIMIT}건 더)`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminActivityLogCard({ expanded, log, onToggle }) {
  const changedFields = getAdminLogChangedFields(log);
  const actorLabel = getAdminLogActorLabel(log);
  const summaryLabel = getAdminActivitySummaryLabel(log);
  const statusChanges = parseRequestStatusChange(formatAdminActivityLog(log));
  const content = getAdminLogContent(log, changedFields, summaryLabel);

  return (
    <article className="admin-activity-log-card">
      <div className="admin-activity-log-summary">
        <span className="admin-activity-log-dot" aria-hidden="true" />
        <div>
          <strong className={`admin-activity-log-type-badge admin-activity-type-${(log.action_type || "default").replace(/_/g, "-")}`}>
            {formatHistoryTitle(summaryLabel)}
          </strong>
          <time className="admin-activity-log-time">{formatDateTime(log.created_at)}</time>
        </div>
        {changedFields.length > 0 && (
          <button type="button" className="admin-log-detail-toggle" onClick={onToggle}>
            {expanded ? "자세히 닫기" : "자세히 보기"}
          </button>
        )}
      </div>
      <dl className="admin-activity-log-meta">
        <div>
          <dt>담당자</dt>
          <dd>{actorLabel || "관리자"}</dd>
        </div>
        <div>
          <dt>내용</dt>
          <dd>
            {statusChanges.length > 0 ? (
              <RequestStatusChangeList changes={statusChanges} />
            ) : (
              content
            )}
          </dd>
        </div>
      </dl>
      {expanded && changedFields.length > 0 && (
        <div className="admin-activity-log-detail">
          {changedFields.map((field) => (
            <div className="admin-activity-log-detail-row" key={field.key}>
              <span>{field.label}</span>
              <div>
                <code>{formatRequestStatusValue(formatAdminLogDetailValue(field.beforeValue))}</code>
                <em>↓</em>
                <code>{formatRequestStatusValue(formatAdminLogDetailValue(field.afterValue))}</code>
              </div>
            </div>
          ))}
        </div>
      )}
      {expanded && changedFields.length === 0 && (
        <p className="admin-activity-log-desc">표시할 변경 항목이 없습니다.</p>
      )}
    </article>
  );
}

function RequestStatusChangeList({ changes = [] }) {
  return (
    <div className="admin-request-status-change-list">
      {changes.map((change, index) => (
        <div className="admin-request-status-change-row" key={`${change.label}-${index}`}>
          <span className="admin-request-change-label">{change.label}</span>
          <div className="admin-request-change-value-wrap">
            <span className="admin-request-before-value">
              {formatRequestStatusValue(change.before)}
            </span>
            <span className="admin-request-change-arrow">→</span>
            <span className="admin-request-after-value">
              {formatRequestStatusValue(change.after)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function JobApplicationsPanel({
  applications,
  assignments = [],
  getInterpreterScheduleConflicts,
  interpreters = [],
  request,
  onRemoveAssignment,
  onStatusChange,
}) {
  const [openApplicantId, setOpenApplicantId] = useState(null);
  const duplicateData = useMemo(
    () => getDuplicateApplicationIdSet(applications),
    [applications]
  );
  const rows = buildApplicationAssignmentRows(applications, assignments, interpreters).filter(
    isApplicantManagementApplication
  );
  const toggleRow = (rowId) => {
    setOpenApplicantId((current) => (current === rowId ? null : rowId));
  };

  if (rows.length === 0) {
    return <span className="admin-empty-chip">이 공고에는 아직 지원자가 없습니다.</span>;
  }

  return (
    <div className="admin-applicant-accordion-list">
      {rows.map((application) => {
        const isAssigned = Boolean(application.assigned);
        const isDirectAssignment = application.source === "direct-assignment";
        const status = isAssigned
          ? MATCHING_STATUS.ASSIGNED
          : normalizeApplicationStatus(application.status);
        const expanded = openApplicantId === application.rowId;
        const sourceLabel = isDirectAssignment ? "관리자 직접 배정" : "지원자";
        const duplicateSuspected =
          !isDirectAssignment && duplicateData.duplicateIds.has(application.id);
        const duplicateTitle = (duplicateData.reasonMap.get(application.id) || []).join(", ");
        const scheduleConflict = hasApplicationScheduleConflict(
          application,
          request,
          getInterpreterScheduleConflicts
        );

        return (
          <article key={application.rowId} className="admin-applicant-accordion-item">
            <button
              type="button"
              className="admin-applicant-summary"
              aria-expanded={expanded}
              onClick={() => toggleRow(application.rowId)}
            >
              <StatusBadge status={status} />
              {duplicateSuspected && <DuplicateBadge title={duplicateTitle} />}
              {scheduleConflict && <ScheduleConflictBadge />}
              <span className="admin-applicant-summary-text">
                <strong>{application.applicant_name || "이름 미입력"}</strong>
                <span>{getApplicationLanguage(application)}</span>
                <span>{sourceLabel}</span>
              </span>
              <span className="admin-applicant-summary-toggle">
                {expanded ? "▲" : "▼"}
              </span>
            </button>

            {expanded && (
              <div className="admin-applicant-detail">
                <div className="admin-applicant-detail-head">
                  <div>
                    <ManagementNumberBadge value={application.application_no} />
                    <strong>{application.applicant_name || "이름 미입력"}</strong>
                  </div>
                  <div className="admin-card-chip-row">
                    {duplicateSuspected && <DuplicateBadge title={duplicateTitle} />}
                    {scheduleConflict && <ScheduleConflictBadge />}
                    <StatusBadge status={status} />
                  </div>
                  <span>{sourceLabel}</span>
                </div>

                <div className="admin-applicant-detail-grid">
                  <ApplicantDetailItem
                    label="지원번호"
                    value={formatManagementNumber(application.application_no)}
                  />
                  <ApplicantDetailItem label="성별" value={application.gender || "-"} />
                  <ApplicantDetailItem
                    label="언어/레벨"
                    value={getApplicationLanguage(application)}
                  />
                  <ApplicantDetailItem
                    label="경력"
                    value={application.experience || application.career || "-"}
                  />
                  <ApplicantDetailItem label="구분" value={sourceLabel} />
                  <ApplicantDetailItem
                    full
                    label="연락처"
                    value={application.phone || "연락처 미입력"}
                  />
                  <ApplicantDetailItem
                    full
                    label="이메일"
                    value={application.email || "-"}
                  />
                  <ApplicantDetailItem
                    full
                    multiline
                    label="메모"
                    value={application.message || "지원 메모 없음"}
                  />
                  <ApplicantDetailItem
                    label="약관 동의"
                    value={getAgreementStatusLabel(application)}
                  />
                  <ApplicantDetailItem
                    label="동의 시간"
                    value={formatDateTime(application.agreed_at)}
                  />
                </div>

                {onStatusChange ? (
                  <div className="admin-card-actions">
                    {isAssigned ? (
                      <>
                        <StatusBadge status={MATCHING_STATUS.ASSIGNED} />
                        {application.assignment && onRemoveAssignment ? (
                          <button
                            type="button"
                            className="admin-link-button danger"
                            onClick={() => onRemoveAssignment(application.assignment)}
                          >
                            매칭 취소
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <button
                        type="button"
                        className="admin-link-button primary"
                        onClick={() =>
                          onStatusChange(application, APPLICATION_STATUS.ACCEPTED, {
                            confirmMessage: "이 지원자를 합격 처리하시겠습니까?",
                            askAssignJob: true,
                          })
                        }
                      >
                        매칭하기
                      </button>
                    )}
                    <button
                      type="button"
                      className="admin-link-button warning"
                      disabled={
                        isAssigned ||
                        normalizeApplicationStatus(application.status) === APPLICATION_STATUS.REVIEWING ||
                        isDirectAssignment
                      }
                      onClick={() =>
                        onStatusChange(application, APPLICATION_STATUS.REVIEWING, {
                          confirmMessage: "이 지원자를 검토중 상태로 변경하시겠습니까?",
                        })
                      }
                    >
                      검토중
                    </button>
                    <button
                      type="button"
                      className="admin-link-button danger"
                      disabled={
                        isAssigned ||
                        normalizeApplicationStatus(application.status) === APPLICATION_STATUS.REJECTED ||
                        isDirectAssignment
                      }
                      onClick={() =>
                        onStatusChange(application, APPLICATION_STATUS.REJECTED, {
                          confirmMessage: "이 지원자를 불합격 상태로 변경하시겠습니까?",
                        })
                      }
                    >
                      불합격
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ApplicantDetailItem({ full = false, label, multiline = false, value }) {
  return (
    <div
      className={`admin-applicant-detail-item${full ? " is-full" : ""}${multiline ? " is-multiline" : ""}`}
    >
      <span>{label}</span>
      <p>{value || "-"}</p>
    </div>
  );
}

function InterpreterManagement({
  duplicateResult,
  emptyText,
  filters,
  interpreters,
  savingKey,
  setFilters,
  onOpenModal,
  updateInterpreter,
  deleteInterpreter,
}) {
  return (
    <section className="admin-section">
      <SectionTitle count={`${interpreters.length}명`} title="통역사 관리" />
      <div className="admin-filters">
        <input
          value={filters.search}
          onChange={(event) =>
            setFilters((current) => ({ ...current, search: event.target.value }))
          }
          placeholder="이름, 지역, 학교, JLPT 검색"
        />
        <select
          value={filters.level}
          onChange={(event) =>
            setFilters((current) => ({ ...current, level: event.target.value }))
          }
        >
          <option value="all">전체 레벨</option>
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value }))
          }
        >
          <option value="all">전체</option>
          <option value="active">활동중</option>
          <option value="pending">승인대기</option>
          <option value="withdrawn">탈퇴회원</option>
        </select>
        <select
          value={filters.activity}
          onChange={(event) =>
            setFilters((current) => ({ ...current, activity: event.target.value }))
          }
        >
          <option value="all">전체 활동</option>
          {INTERPRETER_ACTIVITY_STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
        <select
          value={filters.approved}
          onChange={(event) =>
            setFilters((current) => ({ ...current, approved: event.target.value }))
          }
        >
          <option value="all">전체 인증</option>
          <option value="false">일반 등록</option>
          <option value="true">ON-LI 인증 완료</option>
        </select>
        <select
          value={filters.resumeReview}
          onChange={(event) =>
            setFilters((current) => ({ ...current, resumeReview: event.target.value }))
          }
        >
          <option value="all">전체 이력서</option>
          <option value="resume_review_pending">이력서 심사 대기</option>
        </select>
        <select
          value={filters.duplicate}
          onChange={(event) =>
            setFilters((current) => ({ ...current, duplicate: event.target.value }))
          }
        >
          <option value="all">전체</option>
          <option value="suspected">중복 의심</option>
        </select>
      </div>

      {interpreters.length === 0 ? (
        <MessageBox text={emptyText || "조건에 맞는 통역사가 없습니다."} />
      ) : (
        <div className="admin-management-card-grid admin-interpreter-grid">
          {interpreters.map((interpreter) => (
            <InterpreterCard
              key={interpreter.id}
              interpreter={interpreter}
              duplicateReasons={duplicateResult.reasonMap.get(interpreter.id) || []}
              duplicateSuspected={duplicateResult.duplicateIds.has(interpreter.id)}
              savingKey={savingKey}
              onOpenModal={onOpenModal}
              updateInterpreter={updateInterpreter}
              deleteInterpreter={deleteInterpreter}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function InterpreterCard({
  duplicateReasons,
  duplicateSuspected,
  interpreter,
  onOpenModal,
}) {
  const approvalLabel = getInterpreterStatusLabel(interpreter);
  const activityStatus = getInterpreterActivityStatus(interpreter);
  const activityLabel = getInterpreterActivityStatusLabel(activityStatus);
  const duplicateTitle = duplicateReasons.join(", ");

  return (
    <article
      className="admin-list-card admin-interpreter-card"
      style={{
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
        padding: "16px",
        gap: "12px",
        minHeight: "170px"
      }}
      onClick={() => onOpenModal(interpreter, "detail")}
    >
      <div>
        <div className="admin-list-card-head" style={{ marginBottom: "8px" }}>
          <div>
            <span className="admin-card-meta">통역사</span>
            <h3 style={{ fontSize: "16px", margin: 0 }}>{interpreter.name || "이름 미입력"}</h3>
          </div>
        </div>

        {/* 배지 표시 영역 */}
        <div className="admin-card-chip-row" style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" }}>
          {interpreter.approved && (
            <span className="status-badge verified" style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", fontSize: "11px", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>
              ⭐ ON-LI 인증
            </span>
          )}
          <span className="status-badge" style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px" }}>
            {approvalLabel}
          </span>
          <span className={`status-badge ${getInterpreterActivityStatusBadgeClass(activityStatus)}`} style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px" }}>
            {activityLabel}
          </span>
          {(interpreter.resume_url || interpreter.resume_file_url) ? (
            <span className="status-badge" style={{ background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd", fontSize: "11px", padding: "2px 6px", borderRadius: "4px" }}>
              📄 이력서 제출
            </span>
          ) : (
            <span className="status-badge" style={{ background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", fontSize: "11px", padding: "2px 6px", borderRadius: "4px" }}>
              미제출
            </span>
          )}
          <span className="status-badge" style={{ background: (interpreter.warning_count || 0) > 0 ? "#fee2e2" : "#f3f4f6", color: (interpreter.warning_count || 0) > 0 ? "#991b1b" : "#6b7280", border: (interpreter.warning_count || 0) > 0 ? "1px solid #fca5a5" : "1px solid #e5e7eb", fontSize: "11px", padding: "2px 6px", borderRadius: "4px" }}>
            경고 {interpreter.warning_count || 0}회
          </span>
          {duplicateSuspected && (
            <DuplicateBadge title={duplicateTitle} />
          )}
        </div>

        <dl className="admin-card-summary" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "4px", margin: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "none", padding: "2px 0" }}>
            <span style={{ color: "#6b7280", fontSize: "12px", fontWeight: "900" }}>통역사번호</span>
            <span style={{ color: "#111827", fontSize: "13px", fontWeight: "800" }}>{formatManagementNumber(interpreter.interpreter_no)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "none", padding: "2px 0" }}>
            <span style={{ color: "#6b7280", fontSize: "12px", fontWeight: "900" }}>레벨</span>
            <span style={{ color: "#111827", fontSize: "13px", fontWeight: "800" }}>{normalizeLevel(interpreter.level)}</span>
          </div>
        </dl>
      </div>

      <div className="admin-card-actions admin-interpreter-actions" style={{ display: "block", paddingTop: 0 }}>
        <button
          type="button"
          className="admin-link-button admin-detail-action"
          style={{ width: "100%", justifyContent: "center", minHeight: "36px", fontSize: "12px" }}
          onClick={(e) => {
            e.stopPropagation();
            onOpenModal(interpreter, "detail");
          }}
        >
          상세보기
        </button>
      </div>
    </article>
  );
}

function InterpreterModal({
  adminActivityLogs = [],
  adminNotes = [],
  applications = [],
  draft,
  duplicateReasons = [],
  duplicateSuspected = false,
  interpreter,
  jobs = [],
  matchings = [],
  modalType,
  requestAssignments = [],
  requests = [],
  settlements = [],
  saving,
  noteDrafts = {},
  onChangeDraft,
  onChangeNoteDraft,
  onClose,
  onCreateNote,
  onSave,
  updateInterpreter,
  deleteInterpreter,
  onOpenModal,
}) {
  const [activeInterpreterDetailTab, setActiveInterpreterDetailTab] = useState("basic");
  const [assignmentHistory, setAssignmentHistory] = useState([]);
  const [assignmentHistoryLoading, setAssignmentHistoryLoading] = useState(false);
  const [assignmentHistoryError, setAssignmentHistoryError] = useState("");

  useEffect(() => {
    setActiveInterpreterDetailTab("basic");
    setAssignmentHistory([]);
    setAssignmentHistoryError("");
  }, [interpreter?.id, modalType]);

  useEffect(() => {
    if (
      modalType !== "detail" ||
      activeInterpreterDetailTab !== "history" ||
      !interpreter?.id
    ) {
      return undefined;
    }

    let isActive = true;
    const fetchAssignmentHistory = async () => {
      if (!supabase) {
        setAssignmentHistoryError(supabaseConfigError.message);
        return;
      }

      setAssignmentHistoryLoading(true);
      setAssignmentHistoryError("");

      const { data, error } = await supabase
        .from("request_interpreters")
        .select(INTERPRETER_ASSIGNMENT_HISTORY_SELECT)
        .eq("interpreter_id", interpreter.id)
        .order("id", { ascending: false });

      if (!isActive) return;

      if (error) {
        console.error("Failed to load interpreter history:", error);
        setAssignmentHistory([]);
        setAssignmentHistoryError(error.message || "이력 조회 중 오류가 발생했습니다.");
      } else {
        setAssignmentHistory(dedupeInterpreterAssignmentHistory(data || []));
      }

      setAssignmentHistoryLoading(false);
    };

    fetchAssignmentHistory();

    return () => {
      isActive = false;
    };
  }, [activeInterpreterDetailTab, interpreter?.id, modalType]);

  if (!interpreter || !modalType) return null;

  const handleDownloadFile = async (filePath) => {
    if (!supabase || !filePath) return;
    try {
      let resolvedPath = filePath;
      if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
        const parts = filePath.split("/resume-files/");
        if (parts.length > 1) {
          resolvedPath = parts[1].split("?")[0];
        }
      }

      const { data, error } = await supabase.storage
        .from("resume-files")
        .createSignedUrl(resolvedPath, 60);

      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (err) {
      console.error("Failed to generate signed URL", err);
      alert("이력서 파일을 다운로드할 수 없습니다. 권한이 없거나 링크가 만료되었습니다.");
    }
  };

  const handleOpenInterpreterDocument = async (filePath) => {
    if (!supabase || !filePath) return;
    try {
      const resolvedPath = getStoragePathFromUrl(filePath, INTERPRETER_DOCUMENT_BUCKET);
      if (!resolvedPath) throw new Error("Interpreter document storage path is empty");

      const { data, error } = await supabase.storage
        .from(INTERPRETER_DOCUMENT_BUCKET)
        .createSignedUrl(resolvedPath, 60);

      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (err) {
      console.error("Failed to generate interpreter document signed URL", err);
      alert("정산 서류 파일을 열 수 없습니다. 권한이 없거나 링크가 만료되었습니다.");
    }
  };

  const approvalLabel = getInterpreterStatusLabel(interpreter);
  const levelLabel = normalizeLevel(interpreter.level);
  const approvalStatus = approvalLabel;
  const activityStatus = getInterpreterActivityStatus(interpreter);
  const activityLabel = getInterpreterActivityStatusLabel(activityStatus);
  const duplicateTitle = duplicateReasons.join(", ");
  const adminMemo =
    draft?.admin_memo ??
    interpreter?.admin_memo ??
    interpreter?.management_memo ??
    interpreter?.memo ??
    interpreter?.note ??
    "";
  const managementMemo =
    interpreter?.admin_memo ||
    interpreter?.management_memo ||
    interpreter?.memo ||
    interpreter?.note ||
    "";
  const relatedApplications = applications.filter((application) => {
    return (
      String(application.interpreter_id || "") === String(interpreter.id) ||
      (application.email &&
        interpreter.email &&
        String(application.email).toLowerCase().trim() ===
          String(interpreter.email).toLowerCase().trim())
    );
  });
  const relatedSettlements = matchings.filter(
    (matching) => String(matching.interpreter_id || "") === String(interpreter.id)
  );
  const onliPerformanceCount = getOnliPerformanceCount({
    interpreter,
    matchings,
    requestAssignments,
    requests,
  });
  const certificationRequirementMet = onliPerformanceCount >= 5;
  const certificationRequirementLabel = certificationRequirementMet ? "충족" : "미충족";
  const certificationStateLabel = interpreter.approved ? "ON-LI 인증 통역사" : "등록 통역사";

  return (
    <div className="admin-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className={`admin-modal-card${modalType === "detail" ? " admin-interpreter-detail-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="interpreter-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {modalType === "detail" ? (
          <>
            <div className="admin-interpreter-modal-head">
              <div>
                <span className="admin-card-meta">INTERPRETER PROFILE</span>
                <h2 id="interpreter-modal-title">
                  {interpreter.name || "이름 미입력"}
                </h2>
                <div className="admin-interpreter-modal-badges">
                  <span className={`status-badge admin-level-badge ${getLevelBadgeClass(interpreter.level)}`}>
                    {levelLabel}
                  </span>
                  <StatusBadge status={approvalStatus} />
                  <StatusBadge status={approvalLabel} />
                  <span className={`status-badge ${getInterpreterActivityStatusBadgeClass(activityStatus)}`}>
                    {activityLabel}
                  </span>
                  {duplicateSuspected && <DuplicateBadge title={duplicateTitle} />}
                </div>
              </div>
              <button
                type="button"
                className="admin-modal-icon-close"
                onClick={onClose}
                aria-label="닫기"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="admin-modal-body admin-interpreter-detail-body">
            <div className="admin-interpreter-detail-tabs" role="tablist" aria-label="통역사 상세 정보 탭">
              {[
                { id: "basic", label: "기본 정보" },
                { id: "activity", label: "활동 정보" },
                { id: "history", label: "이력" },
                { id: "adminHistory", label: "관리 기록" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={activeInterpreterDetailTab === tab.id ? "active" : ""}
                  role="tab"
                  aria-selected={activeInterpreterDetailTab === tab.id}
                  onClick={() => setActiveInterpreterDetailTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeInterpreterDetailTab === "basic" && (
            <div className="admin-interpreter-summary-card">
              <div className="admin-interpreter-profile-pane">
                <div className="admin-interpreter-avatar" aria-hidden="true">
                  {getInitial(interpreter.name)}
                </div>
                <div>
                  <h3>{interpreter.name || "이름 미입력"}</h3>
                  <p>
                    {[interpreter.gender, interpreter.age ? `${interpreter.age}세` : "", levelLabel]
                      .filter(Boolean)
                      .join(" · ") || "기본 정보 미입력"}
                  </p>
                </div>
              </div>
              <div className="admin-interpreter-contact-grid">
                <InterpreterQuickInfo icon={Mail} label="이메일" value={interpreter.email} />
                <InterpreterQuickInfo icon={Phone} label="카카오톡 ID" value={interpreter.kakao_or_line} />
                {interpreter.phone && (
                  <InterpreterQuickInfo icon={Phone} label="기존 전화번호" value={interpreter.phone} />
                )}
                <InterpreterQuickInfo
                  icon={MapPin}
                  label="활동 지역"
                  value={formatListOrMissing(interpreter.available_regions)}
                />
                <InterpreterQuickInfo
                  icon={Briefcase}
                  label="전문 분야"
                  value={formatListOrMissing(interpreter.specialties)}
                />
              </div>
            </div>
            )}

            {activeInterpreterDetailTab === "history" ? (
              <InterpreterAssignmentHistoryTab
                error={assignmentHistoryError}
                histories={assignmentHistory}
                loading={assignmentHistoryLoading}
                settlements={settlements}
              />
            ) : activeInterpreterDetailTab === "adminHistory" ? (
              <InterpreterAdminHistoryTab
                activityLogs={adminActivityLogs}
                applications={applications}
                jobs={jobs}
                notes={adminNotes}
                noteDrafts={noteDrafts}
                requestAssignments={requestAssignments}
                saving={saving}
                targetId={interpreter.id}
                targetType="interpreter"
                onChangeNoteDraft={onChangeNoteDraft}
                onCreateNote={onCreateNote}
              />
            ) : (
              <>
            <div className="admin-interpreter-detail-grid">
              {activeInterpreterDetailTab === "basic" && (
              <InterpreterDetailSection icon={User} title="기본 정보">
                <InterpreterDetailItem label="이름" value={interpreter.name} />
                <InterpreterDetailItem label="성별" value={interpreter.gender} />
                <InterpreterDetailItem label="나이" value={interpreter.age} />
                <InterpreterDetailItem label="레벨" value={levelLabel} />
                <InterpreterDetailItem label="승인 상태" value={approvalLabel} />
                <InterpreterDetailItem label="이메일" value={interpreter.email} />
                {interpreter.phone && (
                  <InterpreterDetailItem label="전화번호" value={interpreter.phone} />
                )}
                <InterpreterDetailItem label="카카오톡 ID" value={interpreter.kakao_or_line} />
                <InterpreterDetailItem
                  label="활동 지역"
                  value={formatListOrMissing(interpreter.available_regions)}
                />
                <InterpreterDetailItem
                  label="전문 분야"
                  value={formatListOrMissing(interpreter.specialties)}
                />
                {isWithdrawnInterpreter(interpreter) && (
                  <InterpreterDetailItem
                    label="탈퇴일"
                    value={formatDateTime(interpreter.withdrawn_at)}
                  />
                )}
                <InterpreterDetailItem
                  label="제출된 이력서"
                  value={
                    (interpreter.resume_url || interpreter.resume_file_url) ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {interpreter.resume_url && (
                          <a
                            href={interpreter.resume_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "#aa3bff",
                              textDecoration: "underline",
                              fontWeight: "600",
                              wordBreak: "break-all",
                            }}
                          >
                            포트폴리오 링크 ↗
                          </a>
                        )}
                        {interpreter.resume_file_url && (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "13px", color: "#4b5563", fontWeight: "700" }}>
                              📎 {interpreter.resume_file_name}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDownloadFile(interpreter.resume_file_url, interpreter.resume_file_name)}
                              style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", background: "#5b5cf0", color: "#ffffff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}
                            >
                              📥 다운로드
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      "미제출"
                    )
                  }
                />
                <InterpreterDetailItem label="가입일" value={formatDateTime(interpreter.created_at)} />
                {interpreter.resume_submitted_at && (
                  <InterpreterDetailItem
                    label="이력서 제출일"
                    value={formatDateTime(interpreter.resume_submitted_at)}
                  />
                )}
                <InterpreterDetailItem
                  label="통장 사본"
                  value={
                    interpreter.bankbook_file_url ? (
                      <InterpreterDocumentLink
                        fileName={interpreter.bankbook_file_name}
                        fallbackLabel="통장 사본"
                        onClick={() => handleOpenInterpreterDocument(interpreter.bankbook_file_url)}
                      />
                    ) : (
                      "미등록"
                    )
                  }
                />
                <InterpreterDetailItem
                  label="사업자등록증"
                  value={
                    interpreter.business_license_file_url ? (
                      <InterpreterDocumentLink
                        fileName={interpreter.business_license_file_name}
                        fallbackLabel="사업자등록증"
                        onClick={() => handleOpenInterpreterDocument(interpreter.business_license_file_url)}
                      />
                    ) : (
                      "미등록"
                    )
                  }
                />
                <InterpreterDetailItem label="ON-LI 인증 상태" value={interpreter.approved ? "ON-LI 인증 완료" : "일반 등록"} />
              </InterpreterDetailSection>
              )}

              {activeInterpreterDetailTab === "activity" && (
              <InterpreterDetailSection icon={Languages} title="활동 정보">
                <InterpreterDetailItem label="공개 활동 상태" value={activityLabel} />
                <InterpreterDetailItem label="JLPT 여부" value={interpreter.jlpt} />
                <InterpreterDetailItem label="통역 경험 여부" value={getExperienceLabel(interpreter)} />
                <InterpreterDetailItem label="ON-LI 수행 횟수" value={`${onliPerformanceCount}회`} />
                <InterpreterDetailItem label="인증 조건" value={certificationRequirementLabel} />
                <InterpreterDetailItem
                  label="배정 가능 여부"
                  value={activityStatus === INTERPRETER_ACTIVITY_STATUS.ACTIVE ? "배정 가능" : "확인 필요"}
                />
                <InterpreterDetailItem
                  label="최근 활동일"
                  value={formatDateTime(interpreter.updated_at || interpreter.created_at)}
                />
                <InterpreterDetailItem label="관리자 평가/메모" value={managementMemo || adminMemo || "-"} />
                <InterpreterDetailItem
                  label="통역 횟수"
                  value={
                    interpreter.experience_count || interpreter.experience_count === 0
                      ? `${interpreter.experience_count}회`
                      : ""
                  }
                />
                <InterpreterDetailItem
                  label="활동 가능 지역"
                  value={formatListOrMissing(interpreter.available_regions)}
                />
                <InterpreterDetailItem label="가능 업무" value={interpreter.available_tasks} />
              </InterpreterDetailSection>
              )}

              {activeInterpreterDetailTab === "basic" && (
              <InterpreterDetailSection icon={Star} title="프로필 정보">
                <InterpreterDetailItem
                  label="전문 분야"
                  value={formatListOrMissing(interpreter.specialties)}
                />
                <InterpreterDetailItem label="일본 체류 기간" value={interpreter.stay_period} />
                <InterpreterDetailItem label="학교/전공" value={interpreter.school} />
                <InterpreterDetailItem label="카카오톡 ID" value={interpreter.kakao_or_line} />
                {interpreter.phone && (
                  <InterpreterDetailItem label="기존 전화번호" value={interpreter.phone} />
                )}
                <InterpreterDetailItem label="약관 동의" value={getAgreementStatusLabel(interpreter)} />
                <InterpreterDetailItem label="동의 시간" value={formatDateTime(interpreter.agreed_at)} />
              </InterpreterDetailSection>
              )}

              {activeInterpreterDetailTab === "activity" && (
              <InterpreterDetailSection icon={ShieldAlert} title="경고/운영 상태">
                <InterpreterDetailItem label="경고 횟수" value={`${interpreter.warning_count || 0}회`} />
                <InterpreterDetailItem
                  label="중복 의심"
                  value={duplicateSuspected ? "중복 의심" : "해당 없음"}
                />
                {duplicateSuspected && (
                  <InterpreterDetailItem
                    label="중복 사유"
                    value={duplicateReasons.join(", ")}
                  />
                )}
                <InterpreterDetailItem label="운영 메모" value={managementMemo} />
                <InterpreterDetailItem label="공개 노출" value="관리자 전용 정보" />
              </InterpreterDetailSection>
              )}
            </div>

            {activeInterpreterDetailTab === "activity" && isWithdrawnInterpreter(interpreter) && (
              <div className="admin-interpreter-detail-grid admin-interpreter-history-grid">
                <InterpreterDetailSection icon={FileText} title="지원 내역">
                  {relatedApplications.length === 0 ? (
                    <InterpreterDetailItem label="지원 내역" value="지원 내역 없음" />
                  ) : (
                    relatedApplications.slice(0, 5).map((application) => (
                      <InterpreterDetailItem
                        key={application.id}
                        label={formatManagementNumber(application.application_no) || `지원 ${application.id}`}
                        value={`${getApplicationStatusLabel(application.status)} · ${formatDate(application.created_at)}`}
                      />
                    ))
                  )}
                </InterpreterDetailSection>

                <InterpreterDetailSection icon={Briefcase} title="정산 내역">
                  {relatedSettlements.length === 0 ? (
                    <InterpreterDetailItem label="정산 내역" value="정산 내역 없음" />
                  ) : (
                    relatedSettlements.slice(0, 5).map((matching) => (
                      <InterpreterDetailItem
                        key={matching.id}
                        label={formatManagementNumber(matching.matching_no) || `매칭 ${matching.id}`}
                        value={`${getMatchingStatusLabel(matching.status)} · ${formatDateRange(matching.start_date, matching.end_date)}`}
                      />
                    ))
                  )}
                </InterpreterDetailSection>
              </div>
            )}

            {activeInterpreterDetailTab === "activity" && (
            <section className="admin-interpreter-verification-card" style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
              padding: "24px",
              marginBottom: "24px",
              textAlign: "left",
              boxShadow: "var(--shadow)"
            }}>
              <div className="admin-interpreter-section-title" style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "16px",
                borderBottom: "1px solid var(--border)",
                paddingBottom: "12px"
              }}>
                <CheckCircle2 size={20} color="#aa3bff" aria-hidden="true" />
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: "600", color: "var(--text-h)" }}>ON-LI 인증 통역사 관리</h3>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: "0 0 6px 0", fontSize: "0.95rem", color: "var(--text-h)" }}>제출된 이력서 / 포트폴리오</h4>
                    {(interpreter.resume_url || interpreter.resume_file_url) ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {interpreter.resume_url && (
                          <a
                            href={interpreter.resume_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "#aa3bff",
                              textDecoration: "underline",
                              fontWeight: "600",
                              fontSize: "0.95rem",
                              wordBreak: "break-all"
                            }}
                          >
                            포트폴리오 링크 ↗
                          </a>
                        )}
                        {interpreter.resume_file_url && (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "13px", color: "var(--text-h)", fontWeight: "700" }}>
                              📎 {interpreter.resume_file_name}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDownloadFile(interpreter.resume_file_url, interpreter.resume_file_name)}
                              style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", background: "#5b5cf0", color: "#ffffff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}
                            >
                              📥 다운로드
                            </button>
                          </div>
                        )}
                        {interpreter.resume_submitted_at && (
                          <span style={{ fontSize: "0.8rem", color: "var(--text)" }}>
                            제출 일시: {formatDateTime(interpreter.resume_submitted_at)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: "var(--text)", fontSize: "0.95rem", fontStyle: "italic" }}>제출된 이력서가 없습니다.</span>
                    )}
                  </div>
                  
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--text)", display: "block", marginBottom: "4px" }}>현재 상태</span>
                      {interpreter.approved ? (
                        <span className="status-badge verified" style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: "6px 12px", borderRadius: "20px", fontWeight: "bold", display: "inline-block" }}>
                          ⭐ ON-LI 인증 완료
                        </span>
                      ) : (
                        <span className="status-badge unsubmitted" style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb', padding: "6px 12px", borderRadius: "20px", display: "inline-block" }}>
                          ○ 일반 등록
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{
                  background: "var(--code-bg)",
                  padding: "16px",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "8px"
                }}>
                  <div style={{ flex: 1, paddingRight: "16px" }}>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-h)", fontWeight: "600" }}>ON-LI 인증 권한 제어</p>
                    <p style={{ margin: "4px 0 0 0", fontSize: "0.8rem", color: "var(--text)" }}>
                      ON-LI에서 5회 이상 통역 업무를 수행하고 운영자가 신뢰도를 확인한 통역사에게 인증 뱃지를 부여합니다.
                    </p>
                    <div style={{ marginTop: "10px", fontSize: "0.8rem", color: "var(--text)", lineHeight: 1.7 }}>
                      <strong style={{ color: "var(--text-h)" }}>현재 판단:</strong>
                      <div>ON-LI 수행 횟수: {onliPerformanceCount}회</div>
                      <div>인증 조건: {certificationRequirementLabel}</div>
                      <div>ON-LI 인증 상태: {certificationStateLabel}</div>
                    </div>
                    <div style={{ marginTop: "10px", fontSize: "0.8rem", color: "var(--text)", lineHeight: 1.7 }}>
                      <strong style={{ color: "var(--text-h)" }}>인증 기준:</strong>
                      <div>✓ ON-LI 업무 수행 5회 이상</div>
                      <div>✓ 관리자 활동 이력 확인 완료</div>
                      <div>✓ 관리자 내부 품질 메모 확인 완료</div>
                      <div>※ 조건 충족 시에도 자동 인증되지 않으며, 관리자가 수동으로 부여합니다.</div>
                    </div>
                  </div>
                  <div>
                    {interpreter.approved ? (
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm("이 통역사의 ON-LI 인증을 해제하시겠습니까?")) {
                            await updateInterpreter(interpreter.id, { approved: false }, { showSuccess: true });
                          }
                        }}
                        style={{
                          background: "#fee2e2",
                          color: "#991b1b",
                          border: "1px solid #fca5a5",
                          padding: "8px 16px",
                          borderRadius: "8px",
                          fontSize: "0.85rem",
                          fontWeight: "600",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                      >
                        ON-LI 인증 해제하기
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm("이 통역사에게 ON-LI 인증을 부여하시겠습니까?")) {
                            await updateInterpreter(interpreter.id, { approved: true }, { showSuccess: true });
                          }
                        }}
                        style={{
                          background: "#aa3bff",
                          color: "#fff",
                          border: "none",
                          padding: "8px 16px",
                          borderRadius: "8px",
                          fontSize: "0.85rem",
                          fontWeight: "600",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                      >
                        ON-LI 인증 부여하기
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
            )}

            </>
            )}

            <div
              className="admin-modal-actions admin-interpreter-detail-actions"
              style={{
                marginTop: "24px",
                paddingTop: "16px",
                borderTop: "1px solid var(--border, #e5e7eb)",
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
                flexWrap: "wrap",
                alignItems: "center"
              }}
            >
              <div style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: "900", color: "var(--text-h, #111827)" }}>공개 활동 상태</span>
                <select
                  className="admin-inline-select"
                  value={activityStatus}
                  disabled={saving}
                  style={{ minHeight: "36px", fontSize: "13px", padding: "6px 12px", border: "1px solid #d1d5db", borderRadius: "8px" }}
                  onChange={(event) =>
                    updateInterpreter(interpreter.id, {
                      activity_status: event.target.value,
                    }, { showSuccess: true })
                  }
                >
                  {INTERPRETER_ACTIVITY_STATUS_OPTIONS.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="admin-link-button admin-edit-action"
                style={{ minHeight: "36px", fontSize: "13px", padding: "8px 16px" }}
                onClick={() => onOpenModal(interpreter, "edit")}
              >
                수정
              </button>
              <button
                type="button"
                className="admin-save admin-approve-action"
                disabled={saving}
                style={{ minHeight: "36px", fontSize: "13px", padding: "8px 16px" }}
                onClick={async () => {
                  await updateInterpreter(interpreter.id, {
                    status: "active",
                    activity_status: INTERPRETER_ACTIVITY_STATUS.ACTIVE,
                    is_public: true,
                    withdrawn_at: null,
                  }, { showSuccess: true });
                  onClose();
                }}
              >
                {isWithdrawnInterpreter(interpreter) ? "계정 복구" : "승인"}
              </button>
              <button
                type="button"
                className="admin-save orange admin-reject-action"
                disabled={saving}
                style={{ minHeight: "36px", fontSize: "13px", padding: "8px 16px" }}
                onClick={async () => {
                  await updateInterpreter(interpreter.id, {
                    status: "rejected",
                  }, { showSuccess: true });
                  onClose();
                }}
              >
                반려
              </button>
              <button
                type="button"
                className="admin-save danger admin-delete-action"
                disabled={saving}
                style={{ minHeight: "36px", fontSize: "13px", padding: "8px 16px" }}
                onClick={async () => {
                  if (window.confirm("이 통역사를 정말 삭제하시겠습니까?")) {
                    await deleteInterpreter(interpreter.id);
                    onClose();
                  }
                }}
              >
                삭제
              </button>
            </div>
            </div>
          </>
        ) : (
          <>
            <div className="admin-modal-head">
              <div>
                <span className="admin-card-meta">INTERPRETER</span>
                <h2 id="interpreter-modal-title">통역사 정보 수정</h2>
              </div>
              <button type="button" className="admin-modal-close" onClick={onClose}>
                닫기
              </button>
            </div>
            <form
              className="admin-modal-form"
              onSubmit={(event) => {
                event.preventDefault();
                onSave();
              }}
            >
            <div className="admin-modal-edit-grid">
              {/* 1. 기본 정보 */}
              <div className="admin-form-section-title" style={{ gridColumn: "1 / -1", margin: "10px 0 6px", fontWeight: "900", color: "#aa3bff", borderBottom: "1px solid #e5e7eb", paddingBottom: "4px", fontSize: "14px" }}>
                1. 기본 정보
              </div>
              <FieldControl label="이름">
                <input
                  value={draft?.name || ""}
                  onChange={(event) => onChangeDraft("name", event.target.value)}
                />
              </FieldControl>
              <FieldControl label="성별">
                <input
                  value={draft?.gender || ""}
                  onChange={(event) => onChangeDraft("gender", event.target.value)}
                />
              </FieldControl>
              <FieldControl label="나이">
                <input
                  value={draft?.age || ""}
                  onChange={(event) => onChangeDraft("age", event.target.value)}
                />
              </FieldControl>
              <FieldControl label="거주 지역">
                <input
                  value={draft?.region || ""}
                  onChange={(event) => onChangeDraft("region", event.target.value)}
                />
              </FieldControl>
              <FieldControl label="일본 체류 기간">
                <input
                  value={draft?.stay_period || ""}
                  onChange={(event) => onChangeDraft("stay_period", event.target.value)}
                />
              </FieldControl>
              <FieldControl label="학교/전공">
                <input
                  value={draft?.school || ""}
                  onChange={(event) => onChangeDraft("school", event.target.value)}
                />
              </FieldControl>

              {/* 2. 연락처 정보 */}
              <div className="admin-form-section-title" style={{ gridColumn: "1 / -1", margin: "18px 0 6px", fontWeight: "900", color: "#aa3bff", borderBottom: "1px solid #e5e7eb", paddingBottom: "4px", fontSize: "14px" }}>
                2. 연락처 정보
              </div>
              <FieldControl label="이메일">
                {/* 위험성 주석: 이메일은 로그인 계정/Auth와 연동되어 있어 직접 수정 시 계정 불일치 위험이 있으므로 읽기 전용(disabled) 처리합니다. */}
                <input
                  type="email"
                  value={draft?.email || ""}
                  disabled
                  title="이메일은 로그인 계정 정보이므로 직접 수정할 수 없습니다."
                  placeholder="이메일을 입력해주세요"
                />
              </FieldControl>
              <FieldControl label="전화번호">
                <input
                  value={draft?.phone || ""}
                  onChange={(event) => onChangeDraft("phone", event.target.value)}
                  placeholder="전화번호를 입력해주세요"
                />
              </FieldControl>
              <FieldControl label="카카오톡 ID">
                <input
                  value={draft?.kakao_or_line || ""}
                  onChange={(event) => onChangeDraft("kakao_or_line", event.target.value)}
                  placeholder="카카오톡 ID를 입력해주세요"
                />
              </FieldControl>

              {/* 3. 언어 / 레벨 정보 */}
              <div className="admin-form-section-title" style={{ gridColumn: "1 / -1", margin: "18px 0 6px", fontWeight: "900", color: "#aa3bff", borderBottom: "1px solid #e5e7eb", paddingBottom: "4px", fontSize: "14px" }}>
                3. 언어 / 레벨 정보
              </div>
              <FieldControl label="레벨">
                <InlineSelect
                  options={LEVELS}
                  value={draft?.level || "Lv1"}
                  onChange={(value) => onChangeDraft("level", value)}
                />
              </FieldControl>
              <FieldControl label="JLPT 여부">
                <input
                  value={draft?.jlpt || ""}
                  onChange={(event) => onChangeDraft("jlpt", event.target.value)}
                />
              </FieldControl>

              {/* 4. 경력 정보 */}
              <div className="admin-form-section-title" style={{ gridColumn: "1 / -1", margin: "18px 0 6px", fontWeight: "900", color: "#aa3bff", borderBottom: "1px solid #e5e7eb", paddingBottom: "4px", fontSize: "14px" }}>
                4. 경력 정보
              </div>
              <FieldControl label="통역 경험 여부">
                <InlineSelect
                  options={[
                    { label: "통역 경험 있음", value: "true" },
                    { label: "통역 경험 없음", value: "false" },
                  ]}
                  value={draft?.has_experience || "false"}
                  onChange={(value) => onChangeDraft("has_experience", value)}
                />
              </FieldControl>
              <FieldControl label="통역 경험 횟수">
                <input
                  type="number"
                  min="0"
                  value={draft?.experience_count || 0}
                  disabled={draft?.has_experience !== "true"}
                  onChange={(event) => onChangeDraft("experience_count", event.target.value)}
                />
              </FieldControl>
              <FieldControl label="가능 업무">
                <textarea
                  rows={3}
                  value={draft?.available_tasks || ""}
                  onChange={(event) => onChangeDraft("available_tasks", event.target.value)}
                />
              </FieldControl>
              <FieldControl label="전문 분야">
                <textarea
                  rows={3}
                  value={draft?.specialties || ""}
                  onChange={(event) => onChangeDraft("specialties", event.target.value)}
                  placeholder="쉼표로 구분"
                />
              </FieldControl>
              <FieldControl label="활동 가능 지역">
                <textarea
                  rows={3}
                  value={draft?.available_regions || ""}
                  onChange={(event) => onChangeDraft("available_regions", event.target.value)}
                  placeholder="쉼표로 구분"
                />
              </FieldControl>

              {/* 5. 상태 관리 */}
              <div className="admin-form-section-title" style={{ gridColumn: "1 / -1", margin: "18px 0 6px", fontWeight: "900", color: "#aa3bff", borderBottom: "1px solid #e5e7eb", paddingBottom: "4px", fontSize: "14px" }}>
                5. 상태 관리
              </div>
              <FieldControl label="승인 상태">
                <InlineSelect
                  options={[
                    { value: "pending", label: "승인 대기" },
                    { value: "active", label: "승인 완료" },
                    { value: "rejected", label: "반려" },
                    { value: "warning", label: "경고" },
                    { value: "suspended", label: "정지" },
                  ]}
                  value={draft?.status || "pending"}
                  onChange={(value) => onChangeDraft("status", value)}
                />
              </FieldControl>
              <FieldControl label="ON-LI 인증 통역사">
                <InlineSelect
                  options={[
                    { label: "일반 등록", value: "false" },
                    { label: "ON-LI 인증 완료", value: "true" },
                  ]}
                  value={draft?.approved || "false"}
                  onChange={(value) => onChangeDraft("approved", value)}
                />
              </FieldControl>
              <FieldControl label="공개 활동 상태">
                <InlineSelect
                  options={INTERPRETER_ACTIVITY_STATUS_OPTIONS}
                  value={draft?.activity_status || INTERPRETER_ACTIVITY_STATUS.ACTIVE}
                  onChange={(value) => onChangeDraft("activity_status", value)}
                />
              </FieldControl>
              <FieldControl label="경고 횟수">
                <input
                  type="number"
                  min="0"
                  value={draft?.warning_count || 0}
                  onChange={(event) => onChangeDraft("warning_count", event.target.value)}
                />
              </FieldControl>
              <FieldControl label="관리자 메모">
                <textarea
                  rows={3}
                  value={draft?.admin_memo || ""}
                  onChange={(event) => onChangeDraft("admin_memo", event.target.value)}
                />
              </FieldControl>
            </div>
            <div className="admin-modal-actions">
              <button type="button" className="admin-link-button" onClick={onClose}>
                취소
              </button>
              <button type="submit" className="admin-save" disabled={saving}>
                저장
              </button>
            </div>
          </form>
          </>
        )}
      </section>
    </div>
  );
}

function InterpreterAssignmentHistoryTab({ error, histories = [], loading, settlements = [] }) {
  if (loading) {
    return <p className="admin-interpreter-history-empty">이력을 불러오는 중입니다.</p>;
  }

  if (error) {
    return (
      <div className="admin-interpreter-history-empty error">
        이력 정보를 불러오지 못했습니다.
        <small>{error}</small>
      </div>
    );
  }

  if (histories.length === 0) {
    return <p className="admin-interpreter-history-empty">배정 이력이 없습니다.</p>;
  }

  return (
    <div className="admin-interpreter-history-list">
      {histories.map((history) => {
        const request = Array.isArray(history.requests)
          ? history.requests[0] || {}
          : history.requests || {};
        const settlement = getHistorySettlement(history, settlements);
        const requestName =
          request.event_name ||
          request.request_title ||
          request.project_name ||
          request.request_no ||
          "의뢰명 미등록";

        return (
          <article className="admin-interpreter-history-card" key={`${history.request_id}-${history.interpreter_id}`}>
            <div className="admin-interpreter-history-card-head">
              <div>
                <span className="admin-interpreter-history-number">
                  {formatManagementNumber(request.request_no) || `의뢰 ${history.request_id}`}
                </span>
                <h3>{requestName}</h3>
              </div>
              <span className="status-badge badge-blue">배정 완료</span>
            </div>
            <dl className="admin-interpreter-history-details">
              <div>
                <dt>기업명</dt>
                <dd>-</dd>
              </div>
              <div>
                <dt>행사 기간</dt>
                <dd>-</dd>
              </div>
              <div>
                <dt>통역 언어</dt>
                <dd>-</dd>
              </div>
              <div>
                <dt>통역 레벨</dt>
                <dd>-</dd>
              </div>
              <div>
                <dt>배정 상태</dt>
                <dd>배정 완료</dd>
              </div>
              <div>
                <dt>운영 상태</dt>
                <dd>-</dd>
              </div>
              <div>
                <dt>정산 상태</dt>
                <dd>{settlement ? getSettlementStatusLabel(settlement.settlement_status) : "-"}</dd>
              </div>
              <div>
                <dt>통역사 지급액</dt>
                <dd>{settlement?.amount === null || settlement?.amount === undefined ? "-" : formatJPY(settlement.amount)}</dd>
              </div>
              <div>
                <dt>업무 완료 여부</dt>
                <dd>-</dd>
              </div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}

function dedupeInterpreterAssignmentHistory(rows = []) {
  const rowMap = new Map();
  rows.forEach((row) => {
    const key = `${row.request_id || ""}:${row.interpreter_id || ""}`;
    if (key === ":") return;
    const previous = rowMap.get(key);
    if (!previous || getHistorySortValue(row) > getHistorySortValue(previous)) {
      rowMap.set(key, row);
    }
  });
  return Array.from(rowMap.values()).sort((a, b) => getHistorySortValue(b) - getHistorySortValue(a));
}

function getHistorySortValue(row = {}) {
  const value = Number(row.id || 0);
  return Number.isNaN(value) ? 0 : value;
}

function getHistorySettlement(history = {}, settlements = []) {
  return (
    settlements.find(
      (settlement) =>
        String(settlement.request_id || "") === String(history.request_id || "") &&
        String(settlement.interpreter_id || "") === String(history.interpreter_id || "")
    ) ||
    settlements.find(
      (settlement) => String(settlement.request_id || "") === String(history.request_id || "")
    ) ||
    null
  );
}

function InterpreterAdminHistoryTab({
  activityLogs = [],
  applications = [],
  jobs = [],
  notes = [],
  noteDrafts = {},
  onChangeNoteDraft,
  onCreateNote,
  requestAssignments = [],
  saving = false,
  targetId,
  targetType,
}) {
  const targetKey = `${targetType}:${String(targetId)}`;
  const targetNotes = notes.filter(
    (note) =>
      note.target_type === targetType &&
      String(note.target_id) === String(targetId)
  );
  const targetLogs = activityLogs.filter(
    (log) =>
      log.target_type === targetType &&
      String(log.target_id) === String(targetId)
  );
  const jobsById = new Map(jobs.map((job) => [String(job.id), job]));
  const statusLogs = targetLogs.map((log) => ({
    id: `status-${log.id}`,
    type: "status",
    title: getAdminActionTypeLabel(log.action_type) || "상태 변경",
    message: formatAdminActivityLog(log),
    createdAt: log.created_at || log.createdAt,
  }));
  const applicationLogs = applications
    .filter((application) => String(application.interpreter_id || "") === String(targetId))
    .map((application) => {
      const job = jobsById.get(String(application.job_id || "")) || application.jobs || null;
      return {
        id: `application-${application.id}`,
        type: "application",
        title: "통역 의뢰 지원",
        requestNo: job?.job_no || job?.request_no || application.application_no || "-",
        requestName: getJobName(job),
        status: getApplicationStatusLabel(application.status || application.application_status),
        createdAt: application.created_at || application.applied_at || application.id,
      };
    });
  const assignmentLogs = requestAssignments
    .filter((row) => {
      const assignment = row.assignment || row;
      return String(assignment?.interpreter_id || "") === String(targetId);
    })
    .map((row) => {
      const assignment = row.assignment || row;
      const request = row.request || null;
      return {
        id: `assignment-${assignment.id || row.rowId || row.request_id}`,
        type: "assignment",
        title: "통역 의뢰 배정",
        requestNo: request?.request_no || row.requestNo || assignment.request_id || "-",
        requestName: getRequestName(request) || row.eventName || "의뢰명 미등록",
        status: row.assignmentStatusLabel || "배정 완료",
        createdAt: assignment.created_at || assignment.assigned_at || assignment.id || row.rowId,
      };
    });
  const mergedLogs = [...statusLogs, ...applicationLogs, ...assignmentLogs].sort(
    (a, b) => getProcessLogSortTime(b.createdAt) - getProcessLogSortTime(a.createdAt)
  );

  return (
    <div className="admin-interpreter-admin-history-grid">
      <section className="admin-interpreter-admin-card">
        <h3>내부 메모</h3>
        {targetNotes.length === 0 ? (
          <p className="admin-empty-text">아직 등록된 내부 메모가 없습니다.</p>
        ) : (
          <div className="admin-interpreter-process-list">
            {targetNotes.map((note) => (
              <article className="admin-interpreter-process-item" key={note.id}>
                <p>{note.note}</p>
                <time>{formatDateTime(note.created_at)}</time>
              </article>
            ))}
          </div>
        )}
        <label className="admin-field-control admin-note-input">
          <span>새 메모</span>
          <textarea
            rows={5}
            value={noteDrafts[targetKey] || ""}
            onChange={(event) =>
              onChangeNoteDraft?.(targetType, targetId, event.target.value)
            }
            placeholder="운영팀 내부 확인 내용을 남겨주세요."
          />
        </label>
        <button
          type="button"
          className="admin-save"
          disabled={saving}
          onClick={() => onCreateNote?.(targetType, targetId)}
        >
          {saving ? "저장 중..." : "메모 저장"}
        </button>
      </section>
      <section className="admin-interpreter-admin-card">
        <h3>처리 이력</h3>
        {mergedLogs.length === 0 ? (
          <p className="admin-empty-text">처리 이력이 없습니다.</p>
        ) : (
          <div className="admin-interpreter-process-list">
            {mergedLogs.map((log) => {
              const changes = log.type === "status" ? parseInterpreterChangeLog(log.message) : [];
              return (
                <article className="admin-interpreter-process-item" key={log.id}>
                  <strong>{log.title}</strong>
                  {log.type === "status" ? (
                    <div className="admin-process-log-changes">
                      {changes.map((change, index) => (
                        <div className="admin-process-log-change-row" key={`${change.label}-${index}`}>
                          <span className="admin-change-label">{change.label}</span>
                          <div className="admin-change-values">
                            {change.before && (
                              <>
                                <span className="admin-before-value">
                                  {formatChangeValue(change.before)}
                                </span>
                                <span className="admin-change-arrow">→</span>
                              </>
                            )}
                            <span className="admin-after-value">
                              {formatChangeValue(change.after)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <dl className="admin-process-log-details">
                      <div>
                        <dt>{log.type === "application" ? "공고명" : "의뢰명"}</dt>
                        <dd>{log.requestName}</dd>
                      </div>
                      <div>
                        <dt>{log.type === "application" ? "공고번호" : "의뢰번호"}</dt>
                        <dd>{log.requestNo}</dd>
                      </div>
                      <div>
                        <dt>{log.type === "application" ? "지원 상태" : "배정 상태"}</dt>
                        <dd>{log.status}</dd>
                      </div>
                    </dl>
                  )}
                  <time>{formatProcessLogDate(log.createdAt)}</time>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function InterpreterQuickInfo({ icon: Icon, label, value }) {
  return (
    <div className="admin-interpreter-quick-info">
      <Icon size={18} aria-hidden="true" />
      <div>
        <span>{label}</span>
        <strong>{value || "미입력"}</strong>
      </div>
    </div>
  );
}

function InterpreterDetailSection({ children, icon: Icon, title }) {
  return (
    <section className="admin-interpreter-detail-section">
      <div className="admin-interpreter-section-title">
        <Icon size={18} aria-hidden="true" />
        <h3>{title}</h3>
      </div>
      <dl>{children}</dl>
    </section>
  );
}

function InterpreterDetailItem({ label, value }) {
  return (
    <div className="admin-interpreter-detail-item">
      <dt>{label}</dt>
      <dd>{value || "미입력"}</dd>
    </div>
  );
}

function InterpreterDocumentLink({ fallbackLabel, fileName, onClick }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      <span style={{ fontSize: "13px", color: "#4b5563", fontWeight: "700", wordBreak: "break-all" }}>
        📎 {fileName || fallbackLabel}
      </span>
      <button
        type="button"
        onClick={onClick}
        style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", background: "#5b5cf0", color: "#ffffff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}
      >
        보기
      </button>
    </div>
  );
}

function AdminOperationsPanel({
  activityLogs = [],
  compactModal = false,
  notes = [],
  noteDrafts = {},
  onChangeNoteDraft,
  onCreateNote,
  saving = false,
  targetId,
  targetType,
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!targetId || !targetType) return null;

  const targetKey = `${targetType}:${String(targetId)}`;
  const allTargetNotes = notes.filter(
    (note) =>
      note.target_type === targetType &&
      String(note.target_id) === String(targetId)
  );
  const allTargetLogs = activityLogs.filter(
    (log) =>
      log.target_type === targetType &&
      String(log.target_id) === String(targetId)
  );
  const targetNotes = compactModal ? allTargetNotes : allTargetNotes.slice(0, 3);
  const targetLogs = compactModal ? allTargetLogs : allTargetLogs.slice(0, 5);
  const content = (
    <>
      <div className="admin-operations-column">
        <h3>내부 메모</h3>
        {targetNotes.length === 0 ? (
          <p className="admin-empty-text">아직 등록된 내부 메모가 없습니다.</p>
        ) : (
          <div className="admin-operations-list">
            {targetNotes.map((note) => (
              <article className="admin-operation-log-item" key={note.id}>
                <p>{note.note}</p>
                <span>{formatDateTime(note.created_at)}</span>
              </article>
            ))}
          </div>
        )}
        <label className="admin-field-control admin-note-input">
          <span>새 메모</span>
          <textarea
            rows={3}
            value={noteDrafts[targetKey] || ""}
            onChange={(event) =>
              onChangeNoteDraft?.(targetType, targetId, event.target.value)
            }
            placeholder="운영팀 내부 확인 내용을 남겨주세요."
          />
        </label>
        <button
          type="button"
          className="admin-save"
          disabled={saving}
          onClick={() => onCreateNote?.(targetType, targetId)}
        >
          {saving ? "저장 중..." : "메모 저장"}
        </button>
      </div>

      <div className="admin-operations-column">
        <h3>처리 이력</h3>
        {targetLogs.length === 0 ? (
          <p className="admin-empty-text">아직 처리 이력이 없습니다.</p>
        ) : (
          <div className="admin-operations-list">
            {targetLogs.map((log) => (
              <article className="admin-operation-log-item" key={log.id}>
                <strong>{getAdminActionTypeLabel(log.action_type)}</strong>
                <p>{formatAdminActivityLog(log)}</p>
                <span>{formatDateTime(log.created_at)}</span>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );

  if (compactModal) {
    return (
      <>
        <div className="admin-operations-card-actions">
          <button
            type="button"
            className="admin-link-button"
            onClick={() => setIsModalOpen(true)}
          >
            메모/이력 보기
            <span>
              메모 {allTargetNotes.length} · 이력 {allTargetLogs.length}
            </span>
          </button>
        </div>

        {isModalOpen && (
          <div
            className="admin-modal-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsModalOpen(false);
            }}
          >
            <section
              className="admin-modal-card admin-operations-modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`admin-operations-modal-${targetType}-${targetId}`}
            >
              <div className="admin-modal-head">
                <div>
                  <p className="admin-card-meta">운영 관리</p>
                  <h2 id={`admin-operations-modal-${targetType}-${targetId}`}>
                    내부 메모 및 처리 이력
                  </h2>
                </div>
                <button
                  type="button"
                  className="admin-modal-close"
                  onClick={() => setIsModalOpen(false)}
                >
                  닫기
                </button>
              </div>
              <div className="admin-operations-modal-grid">
                {content}
              </div>
            </section>
          </div>
        )}
      </>
    );
  }

  return (
    <section className="admin-operations-panel">
      {content}
    </section>
  );
}

function ApplicationManagement({
  adminActivityLogs = [],
  adminNotes = [],
  applications,
  duplicateResult,
  getInterpreterScheduleConflicts,
  jobsById,
  savingKey,
  updateApplicationStatus,
  deleteApplication,
  filters,
  setFilters,
  noteDrafts = {},
  onChangeNoteDraft,
  onCreateNote,
}) {
  const [expandedAppId, setExpandedAppId] = useState(null);
  const duplicateData = useMemo(
    () => duplicateResult || getDuplicateApplicationIdSet(applications),
    [applications, duplicateResult]
  );
  const managementApplications = useMemo(
    () => applications.filter(isApplicantManagementApplication),
    [applications]
  );
  const visibleApplications = useMemo(
    () =>
      managementApplications.filter((application) => {
        const matchesDuplicate =
          filters.duplicate === "all" ||
          (filters.duplicate === "suspected" && duplicateData.duplicateIds.has(application.id));

        const normalizedStatus = normalizeApplicationStatus(application.status);
        const matchesStatus =
          filters.status === "all" ||
          (filters.status === "unchecked" &&
            [APPLICATION_STATUS.PENDING, APPLICATION_STATUS.REVIEWING].includes(normalizedStatus));

        return matchesDuplicate && matchesStatus;
      }),
    [duplicateData, filters.duplicate, filters.status, managementApplications]
  );

  return (
    <section className="admin-section">
      <SectionTitle count={`${visibleApplications.length}명`} title="지원자 관리" />
      <div className="admin-filter-bar admin-filters">
        <select
          className="admin-filter-select"
          value={filters.status}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, status: event.target.value }))
          }
        >
          <option value="all">지원 상태: 전체</option>
          <option value="unchecked">지원 상태: 검토 필요</option>
        </select>
        <select
          className="admin-filter-select"
          value={filters.duplicate}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, duplicate: event.target.value }))
          }
        >
          <option value="all">중복 여부: 전체</option>
          <option value="suspected">중복 의심</option>
        </select>
      </div>
      {visibleApplications.length === 0 ? (
        <MessageBox
          text={
            applications.length === 0
              ? "아직 접수된 지원자가 없습니다."
              : "조건에 맞는 지원자가 없습니다."
          }
        />
      ) : (
        <div className="admin-management-card-grid">
          {visibleApplications.map((application) => {
            const job = application.jobs || jobsById.get(application.job_id);
            const duplicateReasons = duplicateData.reasonMap.get(application.id) || [];

            return (
              <ApplicationCard
                key={application.id}
                application={application}
                scheduleConflict={hasApplicationScheduleConflict(
                  application,
                  job,
                  getInterpreterScheduleConflicts
                )}
                job={job}
                savingKey={savingKey}
                updateApplicationStatus={updateApplicationStatus}
                deleteApplication={deleteApplication}
                duplicateReasons={duplicateReasons}
                duplicateSuspected={duplicateData.duplicateIds.has(application.id)}
                adminNotes={adminNotes}
                adminActivityLogs={adminActivityLogs}
                noteDrafts={noteDrafts}
                onChangeNoteDraft={onChangeNoteDraft}
                onCreateNote={onCreateNote}
                expanded={expandedAppId === application.id}
                setExpanded={(val) => setExpandedAppId(val ? application.id : null)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function ApplicationCard({
  adminActivityLogs = [],
  adminNotes = [],
  application,
  job,
  scheduleConflict,
  savingKey,
  updateApplicationStatus,
  deleteApplication,
  duplicateReasons,
  duplicateSuspected,
  noteDrafts = {},
  onChangeNoteDraft,
  onCreateNote,
  expanded,
  setExpanded,
}) {
  const duplicateTitle = duplicateReasons.join(", ");

  return (
    <article
      className={`admin-list-card accordion-card ${expanded ? "is-expanded" : ""}`}
      onClick={(e) => {
        if (
          e.target.closest("button") ||
          e.target.closest("select") ||
          e.target.closest("a") ||
          e.target.closest("input") ||
          e.target.closest("textarea") ||
          e.target.closest(".admin-more-menu") ||
          e.target.closest(".admin-flow-status-panel")
        ) {
          return;
        }
        setExpanded(!expanded);
      }}
      style={{ cursor: "pointer" }}
    >
      <div className="admin-list-card-head" style={{ marginBottom: expanded ? "6px" : "0" }}>
        <div>
          <span className="admin-card-meta">지원자</span>
          <ManagementNumberBadge value={application.application_no} />
          <h3 title={application.applicant_name || ""}>
            {application.applicant_name || "이름 미입력"}
          </h3>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px", fontWeight: "700" }}>
            {getJobDisplayTitle(job, application.job_id)}
          </div>
        </div>
        <div className="admin-card-chip-row">
          {duplicateSuspected && (
            <DuplicateBadge title={duplicateTitle} />
          )}
          {scheduleConflict && <ScheduleConflictBadge />}
          <StatusBadge status={application.status || APPLICATION_STATUS.PENDING} />
        </div>
      </div>

      <div className={`admin-card-expandable-content ${expanded ? "is-expanded" : ""}`}>
        <div className="admin-card-expandable-content-inner">
          <dl className="admin-card-summary">
            <Info label="지원번호" value={formatManagementNumber(application.application_no)} />
            <Info label="지원 공고" value={getJobDisplayTitle(job, application.job_id)} />
            <Info label="기업/행사" value={getJobOrganizationLabel(job)} />
            <Info label="언어" value={getApplicationLanguage(application, job)} />
            <Info label="지원일" value={formatDate(application.created_at)} />
            <Info label="이메일" value={application.email || application.applicant_email || "-"} />
            <Info label="전화번호" value={application.phone || application.applicant_phone || "-"} />
            <Info label="약관 동의" value={getAgreementStatusLabel(application)} />
            <Info label="동의 시간" value={formatDateTime(application.agreed_at)} />
            <Info label="메모" value={application.message || "지원 메모 없음"} />
          </dl>

          <div className="admin-card-controls-grid single">
            <FieldControl label="상태">
              <InlineSelect
                options={JOB_APPLICATION_STATUSES}
                value={normalizeApplicationStatus(application.status)}
                disabled={savingKey === `job-application-${application.id}`}
                onChange={(value) => updateApplicationStatus(application, value)}
              />
            </FieldControl>
          </div>

          <div className="admin-card-actions">
            {normalizeApplicationStatus(application.status) === APPLICATION_STATUS.ACCEPTED ? (
              <StatusBadge status={APPLICATION_STATUS.ACCEPTED} />
            ) : (
              <button
                type="button"
                className="admin-link-button primary"
                disabled={savingKey === `job-application-${application.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  updateApplicationStatus(application, APPLICATION_STATUS.ACCEPTED, {
                    confirmMessage: "이 지원자를 합격 처리하시겠습니까?",
                    askAssignJob: true,
                  });
                }}
              >
                매칭하기
              </button>
            )}
            <button
              type="button"
              className="admin-link-button danger"
              disabled={savingKey === `job-application-delete-${application.id}`}
              onClick={(e) => {
                e.stopPropagation();
                deleteApplication(application);
              }}
            >
              삭제
            </button>
          </div>

          <AdminOperationsPanel
            activityLogs={adminActivityLogs}
            compactModal
            notes={adminNotes}
            noteDrafts={noteDrafts}
            saving={savingKey === `admin-note-application:${application.id}`}
            targetId={application.id}
            targetType="application"
            onChangeNoteDraft={onChangeNoteDraft}
            onCreateNote={onCreateNote}
          />
        </div>
      </div>

      {/* Expand / Collapse Indicator Button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          style={{
            fontSize: "11px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "4px 8px",
            background: "none",
            border: "none",
            color: "#6b7280",
            cursor: "pointer",
            fontWeight: "800",
            transition: "color 0.2s ease"
          }}
          onMouseEnter={(e) => e.target.style.color = "#4f46e5"}
          onMouseLeave={(e) => e.target.style.color = "#6b7280"}
        >
          {expanded ? "▲ 접기" : "▼ 펼치기"}
        </button>
      </div>
    </article>
  );
}

function AssignmentManagement({
  adminActivityLogs = [],
  adminNotes = [],
  noteDrafts = {},
  onChangeNoteDraft,
  onCreateNote,
  rows = [],
  pendingRequests = [],
  onOpenRequest,
}) {
  const [filters, setFilters] = useState({
    search: "",
    status: "all",
  });
  const [expandedId, setExpandedId] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState({
    allAssignments: false,
    pendingRequests: false,
  });
  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        doesAssignmentManagementItemMatchFilters(row, filters)
      ),
    [filters, rows]
  );
  const filteredPendingRequests = useMemo(
    () =>
      pendingRequests.filter((request) =>
        doesAssignmentManagementItemMatchFilters(request, filters)
      ),
    [filters, pendingRequests]
  );
  const updateFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }));
  };
  const toggleSection = (sectionId) => {
    setCollapsedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  };
  const totalCount = rows.length + pendingRequests.length;

  return (
    <section className="admin-section">
      <SectionTitle count={`${totalCount}건`} title="배정 관리" />
      <div className="admin-filters admin-assignment-filters">
        <label className="admin-search-control">
          <Search size={16} aria-hidden="true" />
          <input
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="관리번호, 기업명, 행사명으로 검색"
          />
        </label>
        <select
          value={filters.status}
          onChange={(event) => updateFilter("status", event.target.value)}
        >
          <option value="all">전체</option>
          <option value="assignment_pending">배정 대기</option>
          <option value="assignment_in_progress">배정중</option>
          <option value="assignment_completed">배정 완료</option>
          <option value="completed">완료</option>
          <option value="cancelled">취소</option>
        </select>
      </div>

      <div className="admin-subsection">
        <SectionTitle
          collapsible
          collapsed={collapsedSections.allAssignments}
          count={`${filteredRows.length}건`}
          title="전체 배정"
          onToggle={() => toggleSection("allAssignments")}
        />
        {!collapsedSections.allAssignments &&
          (filteredRows.length === 0 ? (
            <MessageBox text="검색 조건에 맞는 배정 의뢰가 없습니다." />
          ) : (
            <div className="admin-management-card-grid">
              {filteredRows.map((row) => {
                const request = row.request || {};
                const flowSource = getRequestFlowSource(request, null);
                const headlineStatus = getRequestHeadlineStatus(flowSource);
                const statuses = getOperationFlowStatuses(flowSource);
                const estimateStatus = request.estimate_status || "estimate_preparing";
                const isExpanded = expandedId === `assignment-${row.rowId}`;

                return (
                  <article
                    className={`admin-list-card accordion-card ${isExpanded ? "is-expanded" : ""}`}
                    key={row.rowId}
                    onClick={(e) => {
                      if (
                        e.target.closest("button") ||
                        e.target.closest("select") ||
                        e.target.closest("a") ||
                        e.target.closest("input") ||
                        e.target.closest("textarea") ||
                        e.target.closest(".admin-more-menu") ||
                        e.target.closest(".admin-flow-status-panel")
                      ) {
                        return;
                      }
                      setExpandedId(isExpanded ? null : `assignment-${row.rowId}`);
                    }}
                    style={{
                      cursor: "pointer",
                      transition: "box-shadow 0.2s ease, border-color 0.2s ease",
                      borderColor: isExpanded ? "#c084fc" : "#e5e7eb",
                      boxShadow: isExpanded ? "0 4px 20px rgba(192, 132, 252, 0.15)" : "",
                    }}
                  >
                    <div className="request-card-body" style={{ gap: "8px" }}>
                      <div className="admin-list-card-head" style={{ marginBottom: isExpanded ? "6px" : "0" }}>
                        <div>
                          <span className="admin-card-meta">배정</span>
                          <ManagementNumberBadge value={row.assignmentNo} />
                          <h3 title={row.eventName || ""}>{row.eventName || "-"}</h3>
                          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px", fontWeight: "700" }}>
                            통역사: {row.interpreterName || "-"}
                          </div>
                        </div>
                        <span className={`admin-flow-status-badge ${getOperationFlowBadgeClass(headlineStatus.type, headlineStatus.value)}`}>
                          {headlineStatus.label}
                        </span>
                      </div>

                      <div className="admin-status-badge-row" style={{ marginBottom: isExpanded ? "6px" : "0" }}>
                        <FlowStatusBadge
                          type="operation"
                          value={estimateStatus}
                          label={getEstimateStatusLabel(estimateStatus)}
                        />
                        <FlowStatusBadge
                          type="assignment"
                          value={statuses.assignment_status}
                          label={getOperationStatusOptionLabel(ASSIGNMENT_STATUS_OPTIONS, statuses.assignment_status)}
                        />
                        <FlowStatusBadge
                          type="operation"
                          value={statuses.operation_status}
                          label={getOperationStatusOptionLabel(OPERATION_STATUS_OPTIONS, statuses.operation_status)}
                        />
                        <FlowStatusBadge
                          type="settlement"
                          value={statuses.settlement_status}
                          label={getOperationStatusOptionLabel(SETTLEMENT_FLOW_STATUS_OPTIONS, statuses.settlement_status)}
                        />
                      </div>

                      <div className={`admin-card-expandable-content ${isExpanded ? "is-expanded" : ""}`}>
                        <div className="admin-card-expandable-content-inner">
                          <dl className="admin-card-summary">
                            <Info label="배정번호" value={formatManagementNumber(row.assignmentNo)} />
                            <Info label="의뢰번호" value={formatManagementNumber(row.requestNo)} />
                            <Info label="지원번호" value={formatManagementNumber(row.applicationNo)} />
                            <Info label="통역사명" value={row.interpreterName || "-"} />
                            <Info label="행사명" value={row.eventName || "-"} />
                            <Info label="일정" value={row.dateLabel || "-"} />
                            <Info label="장소" value={row.location || "-"} />
                            <Info label="배정 상태" value={row.assignmentStatusLabel} />
                            <Info label="정산 상태" value={row.settlementStatusLabel} />
                          </dl>
                          {row.request && (
                            <div className="admin-card-primary-actions">
                              <button
                                type="button"
                                className="admin-link-button primary subtle"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenRequest(row.request);
                                }}
                              >
                                상세보기
                              </button>
                            </div>
                          )}
                          <AdminOperationsPanel
                            activityLogs={adminActivityLogs}
                            compactModal
                            notes={adminNotes}
                            noteDrafts={noteDrafts}
                            targetId={row.assignment?.id || row.rowId}
                            targetType="assignment"
                            onChangeNoteDraft={onChangeNoteDraft}
                            onCreateNote={onCreateNote}
                          />
                        </div>
                      </div>

                      {/* Expand / Collapse Indicator Button */}
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedId(isExpanded ? null : `assignment-${row.rowId}`);
                          }}
                          style={{
                            fontSize: "11px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "4px 8px",
                            background: "none",
                            border: "none",
                            color: "#6b7280",
                            cursor: "pointer",
                            fontWeight: "800",
                            transition: "color 0.2s ease"
                          }}
                          onMouseEnter={(e) => e.target.style.color = "#4f46e5"}
                          onMouseLeave={(e) => e.target.style.color = "#6b7280"}
                        >
                          {isExpanded ? "▲ 접기" : "▼ 펼치기"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
      </div>

      {filteredPendingRequests.length > 0 && (
        <div className="admin-subsection">
          <SectionTitle
            collapsible
            collapsed={collapsedSections.pendingRequests}
            count={`${filteredPendingRequests.length}건`}
            title="배정 대기 상태 의뢰"
            onToggle={() => toggleSection("pendingRequests")}
          />
          {!collapsedSections.pendingRequests && (
            <div className="admin-management-card-grid">
              {filteredPendingRequests.map((request) => {
                const flowSource = getRequestFlowSource(request, null);
                const headlineStatus = getRequestHeadlineStatus(flowSource);
                const statuses = getOperationFlowStatuses(flowSource);
                const estimateStatus = request.estimate_status || "estimate_preparing";
                const isExpanded = expandedId === `pending-${request.id}`;

                return (
                  <article
                    className={`admin-list-card accordion-card ${isExpanded ? "is-expanded" : ""}`}
                    key={`pending-assignment-${request.id}`}
                    onClick={(e) => {
                      if (
                        e.target.closest("button") ||
                        e.target.closest("select") ||
                        e.target.closest("a") ||
                        e.target.closest("input") ||
                        e.target.closest("textarea") ||
                        e.target.closest(".admin-more-menu") ||
                        e.target.closest(".admin-flow-status-panel")
                      ) {
                        return;
                      }
                      setExpandedId(isExpanded ? null : `pending-${request.id}`);
                    }}
                    style={{
                      cursor: "pointer",
                      transition: "box-shadow 0.2s ease, border-color 0.2s ease",
                      borderColor: isExpanded ? "#c084fc" : "#e5e7eb",
                      boxShadow: isExpanded ? "0 4px 20px rgba(192, 132, 252, 0.15)" : "",
                    }}
                  >
                    <div className="request-card-body" style={{ gap: "8px" }}>
                      <div className="admin-list-card-head" style={{ marginBottom: isExpanded ? "6px" : "0" }}>
                        <div>
                          <span className="admin-card-meta">배정 대기</span>
                          <ManagementNumberBadge value={request.request_no} />
                          <h3 title={request.event_name || request.title || ""}>
                            {request.event_name || request.title || "-"}
                          </h3>
                          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px", fontWeight: "700" }}>
                            {request.company_name || "-"}
                          </div>
                        </div>
                        <span className={`admin-flow-status-badge ${getOperationFlowBadgeClass(headlineStatus.type, headlineStatus.value)}`}>
                          {headlineStatus.label}
                        </span>
                      </div>

                      <div className="admin-status-badge-row" style={{ marginBottom: isExpanded ? "6px" : "0" }}>
                        <FlowStatusBadge
                          type="operation"
                          value={estimateStatus}
                          label={getEstimateStatusLabel(estimateStatus)}
                        />
                        <FlowStatusBadge
                          type="assignment"
                          value={statuses.assignment_status}
                          label={getOperationStatusOptionLabel(ASSIGNMENT_STATUS_OPTIONS, statuses.assignment_status)}
                        />
                        <FlowStatusBadge
                          type="operation"
                          value={statuses.operation_status}
                          label={getOperationStatusOptionLabel(OPERATION_STATUS_OPTIONS, statuses.operation_status)}
                        />
                        <FlowStatusBadge
                          type="settlement"
                          value={statuses.settlement_status}
                          label={getOperationStatusOptionLabel(SETTLEMENT_FLOW_STATUS_OPTIONS, statuses.settlement_status)}
                        />
                      </div>

                      <div className={`admin-card-expandable-content ${isExpanded ? "is-expanded" : ""}`}>
                        <div className="admin-card-expandable-content-inner">
                          <dl className="admin-card-summary">
                            <Info label="의뢰번호" value={formatManagementNumber(request.request_no)} />
                            <Info label="기업명" value={request.company_name || "-"} />
                            <Info
                              label="일정"
                              value={formatDateRange(
                                request.start_date,
                                request.end_date,
                                request.event_date || request.date
                              )}
                            />
                            <Info label="장소" value={request.event_location || request.location || "-"} />
                            <Info label="배정 상태" value={getAssignmentStatusLabel(normalizeAssignmentStatus(request))} />
                          </dl>
                          <div className="admin-card-primary-actions">
                            <button
                              type="button"
                              className="admin-link-button primary subtle"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenRequest(request);
                              }}
                            >
                              상세보기
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expand / Collapse Indicator Button */}
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedId(isExpanded ? null : `pending-${request.id}`);
                          }}
                          style={{
                            fontSize: "11px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "4px 8px",
                            background: "none",
                            border: "none",
                            color: "#6b7280",
                            cursor: "pointer",
                            fontWeight: "800",
                            transition: "color 0.2s ease"
                          }}
                          onMouseEnter={(e) => e.target.style.color = "#4f46e5"}
                          onMouseLeave={(e) => e.target.style.color = "#6b7280"}
                        >
                          {isExpanded ? "▲ 접기" : "▼ 펼치기"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DocumentManagement({
  documents = [],
  initialType = "all",
  interpreters = [],
  onCreateVersion,
  onOpenPdf,
  onVoidDocument,
  requests = [],
  savingKey,
}) {
  const [filters, setFilters] = useState({
    search: "",
    documentType: initialType,
    status: "all",
    startDate: "",
    endDate: "",
  });
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [versionDraft, setVersionDraft] = useState(null);
  const requestMap = useMemo(
    () => new Map(requests.map((request) => [String(request.id), request])),
    [requests]
  );
  const interpreterMap = useMemo(
    () => new Map(interpreters.map((interpreter) => [String(interpreter.id), interpreter])),
    [interpreters]
  );

  useEffect(() => {
    queueMicrotask(() => {
      setFilters((current) => ({ ...current, documentType: initialType }));
      setSelectedDocumentId(null);
      setVersionDraft(null);
    });
  }, [initialType]);

  const filteredDocuments = useMemo(
    () =>
      documents.filter((document) =>
        doesAdminDocumentMatchFilters(document, filters, requestMap, interpreterMap)
      ),
    [documents, filters, interpreterMap, requestMap]
  );
  const selectedDocument =
    documents.find((document) => document.id === selectedDocumentId) || null;
  const versionRows = selectedDocument
    ? documents
        .filter((document) => document.document_no === selectedDocument.document_no)
        .sort((a, b) => Number(b.version || 1) - Number(a.version || 1))
    : [];
  const latestVersion = versionRows[0]?.version || selectedDocument?.version || 1;

  const startVersionDraft = () => {
    if (!selectedDocument) return;
    setVersionDraft({
      amount: selectedDocument.amount || selectedDocument.metadata?.totalAmount || 0,
      revisionNote: "",
      adminNote: selectedDocument.metadata?.admin_note || "",
    });
  };

  return (
    <section className="admin-section">
      <SectionTitle count={`${filteredDocuments.length}건`} title="문서 관리" />
      <div className="admin-filter-bar admin-filters admin-document-filters">
        <label className="admin-filter-search admin-search-control">
          <Search size={16} aria-hidden="true" />
          <input
            value={filters.search}
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="문서번호/기업명/통역사명/행사명 검색"
          />
        </label>
        <select
          className="admin-filter-select"
          value={filters.documentType}
          onChange={(event) =>
            setFilters((current) => ({ ...current, documentType: event.target.value }))
          }
        >
          <option value="all">문서 종류: 전체</option>
          <option value="estimate">견적서</option>
          <option value="completion">업무확인서</option>
          <option value="payout">정산서</option>
        </select>
        <select
          className="admin-filter-select"
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value }))
          }
        >
          <option value="all">상태: 전체</option>
          <option value="draft">임시저장</option>
          <option value="issued">발급완료</option>
          <option value="voided">폐기</option>
        </select>
        <input
          type="date"
          className="admin-filter-select"
          value={filters.startDate}
          onChange={(event) =>
            setFilters((current) => ({ ...current, startDate: event.target.value }))
          }
          aria-label="생성일 시작"
        />
        <input
          type="date"
          className="admin-filter-select"
          value={filters.endDate}
          onChange={(event) =>
            setFilters((current) => ({ ...current, endDate: event.target.value }))
          }
          aria-label="생성일 종료"
        />
      </div>

      {filteredDocuments.length === 0 ? (
        <MessageBox text="조건에 맞는 문서가 없습니다." />
      ) : (
        <div className="admin-document-table-wrap">
          <table className="admin-document-table">
            <thead>
              <tr>
                <th>문서번호</th>
                <th>문서 종류</th>
                <th>관련 의뢰명</th>
                <th>기업명</th>
                <th>통역사명</th>
                <th>생성일</th>
                <th>버전</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((document) => {
                const request = getAdminDocumentRequest(document, requestMap);
                const interpreter = getAdminDocumentInterpreter(document, interpreterMap);

                return (
                  <tr key={document.id} onClick={() => setSelectedDocumentId(document.id)}>
                    <td>{document.document_no}</td>
                    <td>{getDocumentTypeLabel(document.document_type)}</td>
                    <td>{getAdminDocumentEventName(document, request)}</td>
                    <td>{getAdminDocumentCompanyName(document, request)}</td>
                    <td>{getAdminDocumentInterpreterName(document, interpreter)}</td>
                    <td>{formatDate(document.created_at)}</td>
                    <td>v{document.version || 1}</td>
                    <td>{getAdminDocumentStatusLabel(document.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedDocument && (
        <AdminModal
          className="admin-document-detail-modal"
          title="문서 상세"
          titleId="admin-document-detail-title"
          onClose={() => {
            setSelectedDocumentId(null);
            setVersionDraft(null);
          }}
        >
          <div className="admin-document-detail">
            <section>
              <h3>기본 정보</h3>
              <dl className="admin-detail-list compact">
                <Info label="문서번호" value={selectedDocument.document_no} />
                <Info label="문서 종류" value={getDocumentTypeLabel(selectedDocument.document_type)} />
                <Info label="버전" value={`v${selectedDocument.version || 1}`} />
                <Info label="생성일" value={formatDateTime(selectedDocument.created_at)} />
                <Info label="생성 관리자" value={selectedDocument.created_by || "-"} />
                <Info label="상태" value={getAdminDocumentStatusLabel(selectedDocument.status)} />
              </dl>
            </section>

            <section>
              <h3>연결 정보</h3>
              <dl className="admin-detail-list compact">
                <Info
                  label="의뢰 정보"
                  value={getAdminDocumentEventName(
                    selectedDocument,
                    getAdminDocumentRequest(selectedDocument, requestMap)
                  )}
                />
                <Info
                  label="기업 정보"
                  value={getAdminDocumentCompanyName(
                    selectedDocument,
                    getAdminDocumentRequest(selectedDocument, requestMap)
                  )}
                />
                <Info
                  label="통역사 정보"
                  value={getAdminDocumentInterpreterName(
                    selectedDocument,
                    getAdminDocumentInterpreter(selectedDocument, interpreterMap)
                  )}
                />
                <Info label="금액" value={formatDocumentAmount(selectedDocument.amount)} />
              </dl>
            </section>

            <section>
              <h3>파일</h3>
              <div className="admin-card-actions">
                <button
                  type="button"
                  className="admin-save"
                  disabled={!selectedDocument.file_path}
                  onClick={() => onOpenPdf(selectedDocument)}
                >
                  PDF 보기
                </button>
                <button
                  type="button"
                  className="admin-link-button"
                  disabled={!selectedDocument.file_path}
                  onClick={() => onOpenPdf(selectedDocument, { download: true })}
                >
                  다운로드
                </button>
              </div>
            </section>

            <section>
              <h3>관리 기능</h3>
              <div className="admin-card-actions">
                <button type="button" className="admin-save" onClick={startVersionDraft}>
                  새 버전 생성
                </button>
                <button
                  type="button"
                  className="admin-save danger"
                  disabled={
                    selectedDocument.status === "voided" ||
                    savingKey === `document-void-${selectedDocument.id}`
                  }
                  onClick={() => onVoidDocument(selectedDocument)}
                >
                  폐기 처리
                </button>
              </div>
            </section>

            {versionDraft && (
              <section>
                <h3>새 버전 수정</h3>
                <div className="admin-modal-edit-grid">
                  <NumberControl
                    label="금액"
                    value={versionDraft.amount}
                    onChange={(value) =>
                      setVersionDraft((current) => ({ ...current, amount: value }))
                    }
                  />
                  <FieldControl label="수정 메모">
                    <textarea
                      rows={3}
                      value={versionDraft.revisionNote}
                      onChange={(event) =>
                        setVersionDraft((current) => ({
                          ...current,
                          revisionNote: event.target.value,
                        }))
                      }
                    />
                  </FieldControl>
                  <FieldControl label="관리자 메모">
                    <textarea
                      rows={3}
                      value={versionDraft.adminNote}
                      onChange={(event) =>
                        setVersionDraft((current) => ({
                          ...current,
                          adminNote: event.target.value,
                        }))
                      }
                    />
                  </FieldControl>
                </div>
                <div className="admin-modal-actions">
                  <button type="button" className="admin-link-button" onClick={startVersionDraft}>
                    초기화
                  </button>
                  <button
                    type="button"
                    className="admin-save"
                    disabled={savingKey === `document-version-${selectedDocument.id}`}
                    onClick={async () => {
                      await onCreateVersion(selectedDocument, versionDraft);
                      setVersionDraft(null);
                    }}
                  >
                    새 PDF 생성
                  </button>
                </div>
              </section>
            )}

            <section>
              <h3>버전 기록</h3>
              <div className="admin-version-list">
                {versionRows.map((version) => (
                  <article className="admin-version-row" key={version.id}>
                    <div>
                      <strong>
                        v{version.version || 1}
                        {Number(version.version || 1) === Number(latestVersion) ? " (최신)" : ""}
                      </strong>
                      <span>{formatDate(version.created_at)}</span>
                      <span>{version.created_by || "-"}</span>
                      <span>{getAdminDocumentStatusLabel(version.status)}</span>
                    </div>
                    <button
                      type="button"
                      className="admin-link-button"
                      disabled={!version.file_path}
                      onClick={() => onOpenPdf(version)}
                    >
                      보기
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </AdminModal>
      )}
    </section>
  );
}

// eslint-disable-next-line no-unused-vars
function PaymentHistoryManagement({ assignmentsByRequest, interpreters, requests }) {
  const rows = requests.flatMap((request) => {
    const assignments = assignmentsByRequest.get(request.id) || [];
    if (assignments.length === 0) {
      return [
        {
          id: `request-${request.id}`,
          request,
          interpreterName: getAssignedInterpreterName(request, [], interpreters) || "-",
        },
      ];
    }
    return assignments.map((assignment) => ({
      id: `assignment-${assignment.id}`,
      request,
      interpreterName:
        assignment.interpreter?.name ||
        getAssignedInterpreterName(request, [assignment], interpreters) ||
        "-",
    }));
  });

  return (
    <section className="admin-section">
      <SectionTitle count={`${rows.length}건`} title="지급 기록" />
      {rows.length === 0 ? (
        <MessageBox text="현재 DB에 별도 지급 기록 테이블이 없어 정산 완료 건 기준으로 표시합니다." />
      ) : (
        <div className="admin-management-card-grid">
          {rows.map((row) => (
            <article className="admin-list-card" key={row.id}>
              <div className="admin-list-card-head">
                <div>
                  <span className="admin-card-meta">지급 기록</span>
                  <ManagementNumberBadge value={row.request.request_no} />
                  <h3>{row.interpreterName}</h3>
                </div>
                <StatusBadge status={getSettlementFlowStatusLabel(getSettlementStatusValue(row.request))} />
              </div>
              <dl className="admin-card-summary">
                <Info label="통역사" value={row.interpreterName} />
                <Info label="행사명" value={row.request.event_name || row.request.title || "-"} />
                <Info label="지급일" value={formatDate(row.request.updated_at || row.request.created_at)} />
                <Info label="지급 금액" value={formatJPY(getInterpreterPayment(row.request))} />
                <Info label="지급 상태" value={getSettlementFlowStatusLabel(getSettlementStatusValue(row.request))} />
                <Info label="메모" value={row.request?.admin_memo || row.request?.memo || "-"} />
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AdminMemoManagement({ items = [] }) {
  return (
    <section className="admin-section">
      <SectionTitle count={`${items.length}건`} title="관리자 메모" />
      {items.length === 0 ? (
        <MessageBox text="현재 저장된 관리자 메모가 없습니다." />
      ) : (
        <div className="admin-management-card-grid">
          {items.map((item) => (
            <article className="admin-list-card" key={item.id}>
              <div className="admin-list-card-head">
                <div>
                  <span className="admin-card-meta">{item.typeLabel}</span>
                  <ManagementNumberBadge value={item.number} />
                  <h3>{item.title}</h3>
                </div>
              </div>
              <dl className="admin-card-summary">
                {item.details.map((detail) => (
                  <Info key={detail.label} label={detail.label} value={detail.value} />
                ))}
                <Info label="메모" value={item.memo} />
                {item.createdAt && <Info label="작성일" value={formatDateTime(item.createdAt)} />}
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AdminAccountsManagement({
  adminProfile,
  adminUsers,
  currentUser,
  onOpenAdminAccountModal,
}) {
  const currentEmail = currentUser?.email?.trim().toLowerCase() || "";
  const currentRole =
    currentEmail === "onlinkwith@gmail.com" ? "owner" : adminProfile?.role || "staff";

  return (
    <section className="admin-section">
      <SectionTitle count={`${adminUsers.length}명`} title="관리자 계정 관리" />
      <div className="admin-section-toolbar">
        <button type="button" className="admin-save" onClick={onOpenAdminAccountModal}>
          관리자 추가/수정
        </button>
      </div>
      {adminUsers.length === 0 ? (
        <MessageBox text="관리자 계정 목록을 불러오는 중이거나 등록된 관리자가 없습니다." />
      ) : (
        <div className="admin-management-card-grid">
          {adminUsers.map((adminUser) => (
            <article className="admin-list-card" key={adminUser.id || adminUser.email}>
              <div className="admin-list-card-head">
                <div>
                  <span className="admin-card-meta">관리자</span>
                  <h3>{adminUser.email || "-"}</h3>
                </div>
                <StatusBadge status={adminUser.status || "active"} />
              </div>
              <dl className="admin-card-summary">
                <Info label="권한" value={adminUser.role || "-"} />
                <Info
                  label="Auth 매핑"
                  value={adminUser.auth_user_id ? "연동됨" : "권한 미연동"}
                />
                <Info label="Auth user id" value={adminUser.auth_user_id || "-"} />
                <Info label="현재 계정 권한" value={currentRole} />
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ProcessingQueue({ items = [], onOpenItem }) {
  return (
    <section className="admin-processing-queue" aria-label="오늘 처리할 일">
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">QUEUE</p>
          <h2>오늘 처리할 일</h2>
        </div>
        <span>{items.reduce((sum, item) => sum + item.count, 0)}건</span>
      </div>
      <div className="admin-processing-queue-grid">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`admin-processing-queue-item priority-${item.priority}`}
            onClick={() => onOpenItem(item)}
          >
            <span className="admin-processing-queue-label">{item.label}</span>
            <strong>{item.count}</strong>
            <span>{item.description}</span>
            <em>{getQueuePriorityLabel(item.priority)}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

const INVALID_RECIPIENT_EMAIL_PLACEHOLDERS = new Set([
  "관리자 정보 없음",
  "관리자",
  "정보 없음",
  "-",
  "없음",
  "이메일 없음",
  "수신자 없음",
]);

function sanitizeRecipientEmail(email) {
  const trimmed = String(email || "").trim();
  if (!trimmed || !trimmed.includes("@") || INVALID_RECIPIENT_EMAIL_PLACEHOLDERS.has(trimmed)) {
    return "";
  }
  return trimmed;
}

function isEmailNotificationHistoryItem(event = {}) {
  const recipientType = String(event.recipient_type || "").trim().toLowerCase();
  const targetType = String(event.target_type || "").trim().toLowerCase();
  return (
    getNotificationChannel(event) === "email" &&
    Boolean(sanitizeRecipientEmail(event.recipient_email)) &&
    recipientType !== "admin" &&
    targetType !== "admin"
  );
}

function getInternalNotificationPriority(event = {}) {
  const payload = getNotificationPayload(event);
  const value = String(
    event.priority || payload.priority || payload.importance || payload.severity || "normal"
  ).trim().toLowerCase();
  return ["urgent", "critical", "high", "긴급"].includes(value) ? "urgent" : "normal";
}

function NotificationHistoryManagement({
  events = [],
  requests = [],
  interpreters = [],
  assignmentRows = [],
  jobApplications = [],
  filters = {
    recipient: "all",
    status: "all",
    channel: "all",
    startDate: "",
    endDate: "",
  },
  onFiltersChange,
  historyType = "email",
  onHistoryTypeChange,
  processing = false,
  onSendEmail,
  onDelete,
  loadError = null,
}) {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [internalTypeFilter, setInternalTypeFilter] = useState("all");
  const [internalPriorityFilter, setInternalPriorityFilter] = useState("all");
  const notificationItems = buildNotificationDisplayItems({
    events,
    requests,
    interpreters,
    assignmentRows,
    jobApplications,
  });
  const emailItems = notificationItems.filter(isEmailNotificationHistoryItem);
  const internalItems = notificationItems.filter((event) => !isEmailNotificationHistoryItem(event));
  const activeItems = historyType === "internal" ? internalItems : emailItems;
  const internalEventTypes = [...new Set(internalItems.map((event) => event.event_type).filter(Boolean))];
  const visibleEvents = activeItems.filter((event) => {
    if (historyType === "internal") {
      if (internalTypeFilter !== "all" && event.event_type !== internalTypeFilter) return false;
      if (
        internalPriorityFilter !== "all" &&
        getInternalNotificationPriority(event) !== internalPriorityFilter
      ) return false;
    }
    if (historyType === "email" && filters.recipient !== "all") {
      const recipientType = String(event.recipient_type || "").trim().toLowerCase();
      if (filters.recipient === "company") {
        if (!["company", "client"].includes(recipientType)) return false;
      } else if (recipientType !== filters.recipient) {
        return false;
      }
    }
    if (historyType === "email" && filters.status !== "all" && event.status !== filters.status) {
      return false;
    }
    if (historyType === "email" && filters.channel !== "all" && getNotificationChannel(event) !== filters.channel) {
      return false;
    }
    if (filters.startDate && event.created_at) {
      const createdAt = new Date(event.created_at);
      const startAt = new Date(`${filters.startDate}T00:00:00`);
      if (createdAt < startAt) return false;
    }
    if (filters.endDate && event.created_at) {
      const createdAt = new Date(event.created_at);
      const endAt = new Date(`${filters.endDate}T23:59:59`);
      if (createdAt > endAt) return false;
    }
    return true;
  });
  const failedCount = emailItems.filter((event) => event.status === "failed").length;
  const pendingCount = emailItems.filter((event) => event.status === "pending").length;
  const sentCount = emailItems.filter((event) => event.status === "sent").length;
  const todayKey = new Date().toDateString();
  const todayCount = activeItems.filter((event) => {
    if (!event.created_at) return false;
    const createdAt = new Date(event.created_at);
    return !Number.isNaN(createdAt.getTime()) && createdAt.toDateString() === todayKey;
  }).length;
  const urgentCount = internalItems.filter(
    (event) => getInternalNotificationPriority(event) === "urgent"
  ).length;
  const hasReadState = internalItems.some((event) => {
    const payload = getNotificationPayload(event);
    return [event.read_at, event.is_read, payload.read_at, payload.is_read].some(
      (value) => value !== undefined && value !== null
    );
  });
  const visibleIds = visibleEvents.map((event) => event.source_id).filter(Boolean);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const removeEvents = async (ids, message) => {
    if (!window.confirm(message)) return;
    if (await onDelete?.(ids)) setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
  };
  const updateFilter = (key, value) => {
    onFiltersChange?.({
      ...filters,
      [key]: value,
    });
  };
  const changeHistoryType = (nextType) => {
    onHistoryTypeChange?.(nextType);
    setSelectedIds([]);
    setInternalTypeFilter("all");
    setInternalPriorityFilter("all");
    onFiltersChange?.({
      recipient: "all",
      status: "all",
      channel: "all",
      startDate: filters.startDate,
      endDate: filters.endDate,
    });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "notification_history");
      url.searchParams.set("notification_type", nextType);
      window.history.replaceState(
        { page: "admin", subTab: "notification_history", notificationType: nextType },
        "",
        `${url.pathname}?${url.searchParams.toString()}`
      );
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("notification_type") === historyType) return;
    url.searchParams.set("tab", "notification_history");
    url.searchParams.set("notification_type", historyType);
    window.history.replaceState(window.history.state, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [historyType]);

  return (
    <section className="admin-section">
      <div className="admin-notification-history-heading">
        <div>
          <p className="admin-kicker">MANAGE</p>
          <h2>알림 이력</h2>
          <span>(전체 보관)</span>
        </div>
        <p>전체 보관 <strong>{notificationItems.length}건</strong></p>
      </div>
      <div className="admin-notification-type-tabs" role="tablist" aria-label="알림 이력 유형">
        <button type="button" role="tab" aria-selected={historyType === "email"}
          className={historyType === "email" ? "is-active" : ""}
          onClick={() => changeHistoryType("email")}>
          이메일 알림 <span>{emailItems.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={historyType === "internal"}
          className={historyType === "internal" ? "is-active" : ""}
          onClick={() => changeHistoryType("internal")}>
          관리자 내부 알림 <span>{internalItems.length}</span>
        </button>
      </div>
      <div className="admin-section-toolbar admin-notification-toolbar">
        <div className="admin-filter-bar admin-filters">
          {historyType === "email" ? <>
          <select
            className="admin-filter-select"
            value={filters.recipient}
            onChange={(event) => updateFilter("recipient", event.target.value)}
            aria-label="대상 필터"
          >
            <option value="all">대상 전체</option>
            <option value="company">기업</option>
            <option value="interpreter">통역사</option>
            <option value="admin">관리자</option>
          </select>
          <select
            className="admin-filter-select"
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
            aria-label="상태 필터"
          >
            <option value="all">상태 전체</option>
            <option value="pending">발송 대기</option>
            <option value="sending">발송 중</option>
            <option value="sent">발송 완료</option>
            <option value="failed">발송 실패</option>
          </select>
          <select
            className="admin-filter-select"
            value={filters.channel}
            onChange={(event) => updateFilter("channel", event.target.value)}
            aria-label="채널 필터"
          >
            <option value="all">채널 전체</option>
            <option value="email">이메일</option>
            <option value="kakao">카카오</option>
            <option value="internal">내부</option>
          </select>
          </> : <>
          <select className="admin-filter-select" value={internalTypeFilter}
            onChange={(event) => setInternalTypeFilter(event.target.value)} aria-label="알림 종류 필터">
            <option value="all">알림 종류 전체</option>
            {internalEventTypes.map((eventType) => (
              <option key={eventType} value={eventType}>{getNotificationEventTypeLabel(eventType)}</option>
            ))}
          </select>
          <select className="admin-filter-select" value={internalPriorityFilter}
            onChange={(event) => setInternalPriorityFilter(event.target.value)} aria-label="중요도 필터">
            <option value="all">중요도 전체</option>
            <option value="urgent">긴급</option>
            <option value="normal">일반</option>
          </select>
          </>}
          <input
            className="admin-filter-input"
            type="date"
            value={filters.startDate}
            onChange={(event) => updateFilter("startDate", event.target.value)}
            aria-label="시작일"
          />
          <input
            className="admin-filter-input"
            type="date"
            value={filters.endDate}
            onChange={(event) => updateFilter("endDate", event.target.value)}
            aria-label="종료일"
          />
        </div>
        <div className="admin-inline-actions">
          <button type="button" className="admin-secondary admin-notification-delete-selected" disabled={!selectedIds.length || processing}
            onClick={() => removeEvents(selectedIds, `선택한 알림 이력 ${selectedIds.length}건만 삭제합니다. 이미 발송된 이메일은 취소되지 않습니다.`)}>
            <Trash2 size={15} aria-hidden="true" />
            {selectedIds.length ? `선택 삭제 (${selectedIds.length})` : "선택 삭제"}
          </button>
          <button type="button" className="admin-notification-delete-all" disabled={!visibleIds.length || processing}
            onClick={() => removeEvents(visibleIds, "현재 필터 조건의 알림 이력만 삭제합니다. 이미 발송된 이메일은 취소되지 않으며 이 작업은 되돌릴 수 없습니다.")}>
            <Trash2 size={15} aria-hidden="true" /> 전체 삭제
          </button>
        </div>
      </div>
      <div className="admin-notification-log-summary" aria-label="알림 이력 요약">
        {(historyType === "email" ? [
          ["전체 이메일", emailItems.length],
          ["오늘 생성", todayCount],
          ["발송 대기", pendingCount],
          ["발송 실패", failedCount],
          ["발송 완료", sentCount],
        ] : [
          ["전체 내부 알림", internalItems.length],
          ["오늘 생성", todayCount],
          ["긴급", urgentCount],
          ["일반", internalItems.length - urgentCount],
        ]).map(([label, count]) => (
          <div key={label} className="admin-notification-log-summary-item">
            <span>{label}</span>
            <strong>{count}건</strong>
          </div>
        ))}
      </div>
      {visibleEvents.length === 0 ? (
        <>
          <MessageBox
            text={
              loadError
                ? "알림 이력을 불러오지 못했습니다. 관리자 권한 또는 RLS 정책을 확인해주세요."
                : historyType === "email"
                  ? "이메일 발송 이력이 없습니다."
                  : "관리자 내부 알림이 없습니다."
            }
          />
          {loadError && (
            <p className="admin-empty-text">
              알림 조회 오류: {loadError.message || JSON.stringify(loadError)}
            </p>
          )}
        </>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-notification-log-table">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="전체 선택" checked={allSelected}
                  onChange={(e) => setSelectedIds(e.target.checked
                    ? [...new Set([...selectedIds, ...visibleIds])]
                    : selectedIds.filter((id) => !visibleIds.includes(id)))} /></th>
                <th>생성일</th>
                <th>대상</th>
                <th>알림 종류</th>
                <th>제목</th>
                {historyType === "email" ? <>
                  <th>채널</th><th>상태</th><th>발송일</th><th>실패 사유</th>
                </> : <>
                  <th>관련 의뢰</th><th>중요도</th>{hasReadState && <th>읽음 상태</th>}
                </>}
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {visibleEvents.map((event) => (
                <tr key={event.id}>
                  <td><input type="checkbox" aria-label={`${event.title || "알림"} 선택`}
                    checked={selectedIds.includes(event.source_id)}
                    onChange={(e) => setSelectedIds((current) => e.target.checked
                      ? [...new Set([...current, event.source_id])]
                      : current.filter((id) => id !== event.source_id))} /></td>
                  <td>{formatDateTime(event.created_at)}</td>
                  <td>{event.recipientLabel}</td>
                  <td>{event.eventLabel}</td>
                  <td>{event.title || event.message || event.eventLabel}</td>
                  {historyType === "email" ? <>
                  <td>{getNotificationChannelLabel(event.channel)}</td><td>
                    <span className={`status-badge ${getStatusBadgeClass(event.status)}`}>
                      {event.statusLabel}
                    </span>
                  </td>
                  <td>{event.sent_at ? formatDateTime(event.sent_at) : "-"}</td>
                  <td className="admin-table-text">{event.error_message || "-"}</td>
                  </> : <>
                    <td>{event.relatedLabel || "-"}</td>
                    <td><span className={`status-badge ${getInternalNotificationPriority(event) === "urgent" ? "badge-red" : "badge-gray"}`}>
                      {getInternalNotificationPriority(event) === "urgent" ? "긴급" : "일반"}
                    </span></td>
                    {hasReadState && <td>{event.read_at || event.is_read || getNotificationPayload(event).read_at || getNotificationPayload(event).is_read ? "확인 완료" : "미확인"}</td>}
                  </>}
                  <td>
                    <div className="admin-inline-actions admin-notification-row-actions">
                      <button
                        type="button"
                        className="admin-notification-detail-button"
                        onClick={() => setSelectedEvent(event)}
                      >
                        <Eye size={14} aria-hidden="true" /> 상세 보기
                      </button>
                      <button type="button" className="admin-notification-delete-button" disabled={processing}
                        onClick={() => removeEvents([event.source_id], "이 알림 이력만 삭제합니다. 이미 발송된 이메일은 취소되지 않습니다.")}>
                        <Trash2 size={14} aria-hidden="true" /> 삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visibleEvents.length > 0 && loadError && (
        <p className="admin-empty-text">
          알림 조회 오류: {loadError.message || JSON.stringify(loadError)}
        </p>
      )}
      {historyType === "email" && failedCount > 0 && (
        <p className="admin-empty-text">실패 {failedCount}건은 상세보기에서 다시 처리할 수 있습니다.</p>
      )}
      {selectedEvent && (
        <NotificationEventDetailModal
          event={selectedEvent}
          processing={processing}
          onClose={() => setSelectedEvent(null)}
          onSendEmail={onSendEmail}
          isInternal={historyType === "internal"}
        />
      )}
    </section>
  );
}

function getNotificationRecipientLabel(event = {}, context = {}) {
  const type = String(event.recipient_type || "").trim().toLowerCase();
  const payload = getNotificationPayload(event);
  const targetRole = String(event.target_role || payload?.target_role || "").trim().toLowerCase();
  const role = targetRole || type;
  const { request, interpreter } = context;

  // Try to derive a real name in priority order
  let recipientName =
    event.recipient_name ||
    payload?.recipient_name ||
    payload?.company_name ||
    payload?.contact_name ||
    payload?.interpreter_name ||
    payload?.name ||
    null;

  if (!recipientName) {
    if (role === "company" || role === "client") {
      recipientName = request?.company_name || request?.contact_name || null;
    } else if (role === "interpreter") {
      recipientName = interpreter?.name || null;
    }
  }

  // UI Rule:
  // recipient_name이 있으면 recipient_name 표시
  // 없고 target_role='company'이면 '기업'
  // 없고 target_role='interpreter'이면 '통역사'
  // 없고 target_role='admin'이면 '관리자'
  // 그래도 없을 때만 '대상 정보 없음'
  if (!recipientName) {
    if (role === "company" || role === "client") {
      recipientName = "기업";
    } else if (role === "interpreter") {
      recipientName = "통역사";
    } else if (role === "admin") {
      recipientName = "관리자";
    } else {
      recipientName = "대상 정보 없음";
    }
  }

  const email = sanitizeRecipientEmail(event.recipient_email);
  return email ? `${recipientName} / ${email}` : recipientName;
}

function NotificationEventDetailModal({
  event,
  isInternal = false,
  processing = false,
  onClose,
  onSendEmail,
}) {
  const payloadText = getNotificationPayloadSummary(event);
  const isEmailNotification = !isInternal &&
    getNotificationChannel(event) === "email" &&
    Boolean(sanitizeRecipientEmail(event.recipient_email));

  return (
    <div className="admin-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="admin-modal-card admin-notification-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-detail-title"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="admin-modal-head">
          <div>
            <span className="admin-card-meta">알림 상세</span>
            <h2 id="notification-detail-title">{event.eventLabel || "운영 알림"}</h2>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose}>
            닫기
          </button>
        </div>
        <dl className="admin-card-summary admin-notification-detail-list">
          <Info label="알림 종류" value={event.eventLabel} />
          <Info label="제목" value={event.title || "-"} />
          <Info label="대상자" value={event.targetLabel} />
          <Info label="대상 ID" value={event.recipient_id || "-"} />
          <Info label="관련 번호" value={event.relatedLabel} />
          <Info label="관련 의뢰명" value={getNotificationPayload(event)?.event_name || "-"} />
          {isInternal ? (
            <Info label="중요도" value={getInternalNotificationPriority(event) === "urgent" ? "긴급" : "일반"} />
          ) : <>
            <Info label="수신 이메일" value={event.recipient_email || "-"} />
            <Info label="채널" value={getNotificationChannelLabel(event.channel)} />
            <Info label="발송 상태" value={event.statusLabel} />
          </>}
          <Info label="생성일" value={formatDateTime(event.created_at)} />
          {!isInternal && <>
            <Info label="처리일" value={formatDateTime(event.processed_at)} />
            <Info label="발송일" value={formatDateTime(event.sent_at)} />
            <Info label="재시도 횟수" value={`${event.retry_count || 0}회`} />
            <Info label="실패 사유" value={event.error_message || "-"} />
          </>}
          <Info label={isInternal ? "안내 내용" : "본문 미리보기"} value={payloadText} />
        </dl>
        <div className="admin-modal-actions admin-notification-modal-actions">
          <button type="button" className="admin-secondary" onClick={onClose}>
            닫기
          </button>
          {isInternal ? null : isEmailNotification ? (
            <>
              <button
                type="button"
                className="admin-save"
                disabled={processing}
                onClick={() => onSendEmail?.(event)}
              >
                {processing || event.status === "sending" ? "발송 중..." : event.status === "failed" || event.status === "sent" || event.sent_at ? "재발송" : "발송하기"}
              </button>
            </>
          ) : (
            <span className="admin-card-meta">
              {event.status === "sent" || event.sent_at
                ? "이미 발송 완료된 알림입니다."
                : getNotificationChannel(event) === "internal"
                ? "내부 알림은 이메일 발송 대상이 아닙니다."
                : "수신 이메일 없음"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
function SettlementManagement({
  adminActivityLogs = [],
  adminNotes = [],
  requests,
  filters,
  setFilters,
  assignmentsByRequest,
  interpreters,
  savingKey,
  sectionTitle = "정산 관리",
  updateSettlementStatus,
  noteDrafts = {},
  onChangeNoteDraft,
  onCreateNote,
  onOpenDocumentPreview,
  generatedDocuments = [],
  openRequestModal,
}) {
  const [expandedRequestId, setExpandedRequestId] = useState(null);

  const filteredRequests = requests.filter((request) => {
    const matchesMonth =
      !filters.month ||
      isDateRangeOverlappingMonth(
        getDateRangeStart(request.start_date || request.event_date, request.date),
        getDateRangeEnd(request.end_date || request.event_date, request.date),
        filters.month
      );
    const matchesStatus =
      filters.status === "all" ||
      doesRequestMatchSettlementManagementFilter(request, filters.status);

    return matchesMonth && matchesStatus;
  });

  return (
    <section className="admin-section">
      <SectionTitle count={`${filteredRequests.length}건`} title={sectionTitle} />
      <div className="admin-filter-bar admin-filters admin-matching-filters">
        <MonthFilterInput
          value={filters.month}
          onChange={(month) => setFilters((current) => ({ ...current, month }))}
        />
        <select
          className="admin-filter-select"
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value }))
          }
        >
          {SETTLEMENT_MANAGEMENT_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {filteredRequests.length === 0 ? (
        <MessageBox text="조건에 맞는 정산 의뢰가 없습니다." />
      ) : (
        <div className="admin-management-card-grid">
          {filteredRequests.map((request) => (
            <SettlementRequestCard
              key={getSettlementRequestRowKey(request)}
              request={request}
              assignments={assignmentsByRequest.get(request.id) || []}
              interpreters={interpreters}
              savingKey={savingKey}
              updateSettlementStatus={updateSettlementStatus}
              adminNotes={adminNotes}
              adminActivityLogs={adminActivityLogs}
              noteDrafts={noteDrafts}
              onChangeNoteDraft={onChangeNoteDraft}
              onCreateNote={onCreateNote}
              onOpenDocumentPreview={onOpenDocumentPreview}
              generatedDocuments={generatedDocuments}
              openRequestModal={openRequestModal}
              expanded={expandedRequestId === getSettlementRequestRowKey(request)}
              setExpandedRequestId={setExpandedRequestId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SettlementRequestCard({
  request,
  assignments,
  interpreters,
  savingKey,
  updateSettlementStatus,
  onOpenDocumentPreview,
  generatedDocuments = [],
  openRequestModal,
  expanded,
  setExpandedRequestId,
}) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreMenuRef = useRef(null);

  const assignedInterpreterNames = getAssignedInterpreterName(
    request,
    assignments,
    interpreters
  );
  const [draft, setDraft] = useState(() => createSettlementDraft(request));
  const [isFinalAmountTouched, setIsFinalAmountTouched] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setDraft(createSettlementDraft(request));
      setIsFinalAmountTouched(false);
    });
  }, [request]);

  useEffect(() => {
    if (!isMoreOpen) return undefined;

    const handleClickOutside = (event) => {
      if (!moreMenuRef.current?.contains(event.target)) {
        setIsMoreOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMoreOpen]);

  const closeMoreMenu = () => setIsMoreOpen(false);

  const updateDraft = (field, value) => {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      const shouldRecalculateFinal = field !== "settlement_final_amount" && !isFinalAmountTouched;
      const calculated = calculateSettlementAmounts(next);
      return {
        ...next,
        settlement_base_amount: calculated.settlement_base_amount,
        settlement_final_amount: shouldRecalculateFinal
          ? calculated.settlement_final_amount
          : next.settlement_final_amount,
      };
    });
    if (field === "settlement_final_amount") {
      setIsFinalAmountTouched(true);
    }
  };

  const settlementAmounts = calculateSettlementAmounts(draft);
  const interpreterPrice = settlementAmounts.settlement_final_amount;
  const paymentStatus = normalizePaymentStatus(request.payment_status);
  const settlementStatus = normalizeAdminSettlementStatus(
    request._settlement?.settlement_status || request.settlement_status
  );
  const settlementSavingKey = `settlement-request-${getSettlementRequestRowKey(request)}`;
  const eventDate = formatDateRange(request.start_date, request.end_date, request.event_date);
  const dailyRate = SETTLEMENT_LEVEL_DEFAULTS[draft.settlement_level || "LV1"]?.interpreter_payment || 0;

  const assignedId = request.assigned_interpreter_id || request.matched_interpreter_id;
  const interpreterObj = assignedId 
    ? interpreters.find((item) => Number(item.id) === Number(assignedId))
    : assignments.find(Boolean)?.interpreter;

  const payoutMethod = interpreterObj 
    ? (interpreterObj.business_license_file_url ? "사업자" : "개인(3.3%)")
    : null;

  const requestDocuments = generatedDocuments.filter(
    (doc) => String(doc.request_id) === String(request.id)
  );
  const payoutDoc = requestDocuments.find((doc) => doc.document_type === "payout");

  const saveDraft = () => {
    updateSettlementStatus(request, getSettlementSavePayload({ ...request, ...draft }));
    closeMoreMenu();
  };

  const completeSettlement = () => {
    updateSettlementStatus(request, {
      ...getSettlementSavePayload({
        ...request,
        ...draft,
        settlement_status: ADMIN_SETTLEMENT_STATUS.COMPLETED,
      }),
      settlement_status: ADMIN_SETTLEMENT_STATUS.COMPLETED,
      settlement_completed_at: new Date().toISOString(),
    });
    closeMoreMenu();
  };

  return (
    <article
      className={`admin-list-card accordion-card ${expanded ? "is-expanded" : ""}`}
      onClick={(e) => {
        if (
          e.target.closest("button") ||
          e.target.closest("select") ||
          e.target.closest("a") ||
          e.target.closest("input") ||
          e.target.closest("textarea") ||
          e.target.closest(".admin-more-menu") ||
          e.target.closest(".admin-flow-status-panel")
        ) {
          return;
        }
        setExpandedRequestId(expanded ? null : getSettlementRequestRowKey(request));
      }}
      style={{
        cursor: "pointer",
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
        borderColor: expanded ? "#c084fc" : "#e5e7eb",
        boxShadow: expanded ? "0 4px 20px rgba(192, 132, 252, 0.15)" : "",
        minHeight: "170px"
      }}
    >
      <div className="request-card-body" style={{ gap: "8px" }}>
        {/* 상단: 정산/의뢰 번호 & 우측 정산 상태 Badge */}
        <div className="admin-list-card-head" style={{ marginBottom: "4px" }}>
          <div>
            <span className="admin-card-meta">정산</span>
            <ManagementNumberBadge value={request.request_no} />
          </div>
          <span className={`admin-flow-status-badge ${getOperationFlowBadgeClass("settlement", settlementStatus)}`}>
            {getSettlementStatusLabel(settlementStatus)}
          </span>
        </div>

        {/* 제목: 행사명 */}
        <h3 title={request.event_name || ""} style={{ margin: "2px 0 4px" }}>
          {request.event_name || "-"}
        </h3>

        {/* 부제: 통역사명 */}
        <div style={{ fontSize: "13px", color: "#475569", fontWeight: "700", marginBottom: "6px" }}>
          통역사: {assignedInterpreterNames || "-"}
        </div>

        {/* 상태 Badge: 지급 상태, 레벨, 지급 방식(있으면) */}
        <div className="admin-status-badge-row" style={{ marginBottom: "6px" }}>
          <FlowStatusBadge
            type="settlement"
            value={settlementStatus}
            label={`지급 상태: ${getSettlementStatusLabel(settlementStatus)}`}
          />
          <span className="status-badge badge-gray" style={{ fontSize: "11px", fontWeight: "700" }}>
            레벨: {draft.settlement_level || "-"}
          </span>
          {payoutMethod && (
            <span className="status-badge badge-blue" style={{ fontSize: "11px", fontWeight: "700" }}>
              지급 방식: {payoutMethod}
            </span>
          )}
        </div>

        {/* 금액: 최종 지급 예정 금액 */}
        <div style={{ fontSize: "14px", fontWeight: "800", color: "#4f46e5", margin: "4px 0" }}>
          최종 지급 예정 금액: {formatJPY(interpreterPrice)}
        </div>

        {/* Expandable Details Container */}
        <div className={`admin-card-expandable-content ${expanded ? "is-expanded" : ""}`}>
          <div className="admin-card-expandable-content-inner">
            <div className="admin-flow-status-panel" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
                <FieldControl label="업무 일수">
                  <input
                    type="number"
                    min="1"
                    value={draft.settlement_work_days}
                    onChange={(event) => updateDraft("settlement_work_days", event.target.value)}
                  />
                </FieldControl>
                <FieldControl label="적용 레벨">
                  <InlineSelect
                    options={SETTLEMENT_LEVEL_OPTIONS}
                    value={draft.settlement_level}
                    disabled={savingKey === settlementSavingKey}
                    onChange={(value) => updateDraft("settlement_level", value)}
                  />
                </FieldControl>
                <NumberControl
                  label="정산 금액"
                  value={draft.settlement_final_amount}
                  onChange={(value) => updateDraft("settlement_final_amount", value)}
                />
                <NumberControl
                  label="추가 지급"
                  value={draft.settlement_extra_amount}
                  onChange={(value) => updateDraft("settlement_extra_amount", value)}
                />
                <NumberControl
                  label="차감 금액"
                  value={draft.settlement_deduction_amount}
                  onChange={(value) => updateDraft("settlement_deduction_amount", value)}
                />
                <FieldControl label="기업 결제 상태">
                  <InlineSelect
                    options={[
                      { label: "미결제", value: "unpaid" },
                      { label: "결제완료", value: "paid" },
                    ]}
                    value={paymentStatus}
                    disabled={savingKey === settlementSavingKey}
                    onChange={(value) =>
                      updateSettlementStatus(request, { payment_status: value })
                    }
                  />
                </FieldControl>
                <FieldControl label="지급 상태 변경">
                  <InlineSelect
                    options={SETTLEMENT_STATUS_OPTIONS}
                    value={draft.settlement_status}
                    disabled={savingKey === settlementSavingKey}
                    onChange={(value) =>
                      updateDraft("settlement_status", value)
                    }
                  />
                </FieldControl>
                <FieldControl label="지급 방식 변경">
                  <InlineSelect
                    options={[
                      { label: "개인(3.3%)", value: "freelancer" },
                      { label: "사업자", value: "business" },
                    ]}
                    value={payoutMethod === "사업자" ? "business" : "freelancer"}
                    disabled={true}
                    onChange={() => {}}
                  />
                </FieldControl>
              </div>
              <span style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginTop: "6px" }}>
                * 지급 방식은 통역사 프로필의 사업자등록증 첨부 여부에 따라 자동 판정됩니다.
              </span>
            </div>

            <FieldControl label="정산 메모" onClick={(e) => e.stopPropagation()}>
              <textarea
                className="admin-textarea"
                rows={3}
                value={draft.settlement_memo}
                onChange={(event) => updateDraft("settlement_memo", event.target.value)}
                placeholder="정산 메모"
              />
            </FieldControl>

            <dl className="admin-request-summary admin-request-summary-clean">
              <Info label="행사명" value={request.event_name || "-"} />
              <Info label="통역사" value={assignedInterpreterNames || "-"} />
              <Info label="날짜" value={eventDate} />
              <Info label="근무일수" value={`${draft.settlement_work_days || 0}일`} />
              <Info label="적용 레벨" value={draft.settlement_level || "-"} />
              <Info label="일당" value={formatJPY(dailyRate)} />
              <Info label="추가금액" value={formatJPY(draft.settlement_extra_amount)} />
              <Info label="차감금액" value={formatJPY(draft.settlement_deduction_amount)} />
              <Info label="최종 지급금액" value={formatJPY(interpreterPrice)} />
            </dl>

            {/* Row 1: 정산서 생성 / 정산서 보기 */}
            <div className="admin-card-primary-actions">
              <button
                type="button"
                className="admin-link-button primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDocumentPreview("payout", request);
                }}
              >
                정산서 생성
              </button>
              <button
                type="button"
                className="admin-link-button primary subtle"
                disabled={!payoutDoc}
                onClick={(e) => {
                  e.stopPropagation();
                  if (payoutDoc) {
                    openDocumentSignedUrl(supabase, payoutDoc);
                  }
                }}
                style={{
                  background: payoutDoc ? "" : "#f3f4f6",
                  color: payoutDoc ? "" : "#9ca3af",
                  border: payoutDoc ? "" : "1px solid #e5e7eb",
                  cursor: payoutDoc ? "pointer" : "not-allowed",
                }}
              >
                정산서 보기
              </button>
            </div>

            {/* Row 2: 상세보기 / 더보기(...) */}
            <div className="admin-card-secondary-area">
              <div className="admin-card-secondary-actions" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  className="admin-link-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openRequestModal("detail", request);
                  }}
                  style={{ flex: 1 }}
                >
                  상세보기
                </button>
                <div className="admin-more-menu request-more-wrapper" ref={moreMenuRef} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="request-more-trigger"
                    aria-label="더보기"
                    aria-expanded={isMoreOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMoreOpen((current) => !current);
                    }}
                  >
                    <MoreHorizontal size={18} aria-hidden="true" />
                  </button>
                  {isMoreOpen && (
                    <div className="request-more-menu">
                      <button
                        type="button"
                        className="request-more-item"
                        disabled={savingKey === settlementSavingKey}
                        onClick={saveDraft}
                      >
                        수정 저장
                      </button>
                      {settlementStatus !== ADMIN_SETTLEMENT_STATUS.COMPLETED && (
                        <button
                          type="button"
                          className="request-more-item"
                          disabled={savingKey === settlementSavingKey}
                          onClick={completeSettlement}
                        >
                          정산 완료 처리
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Expand / Collapse Indicator Button */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
                  setExpandedRequestId(expanded ? null : getSettlementRequestRowKey(request));
            }}
            style={{
              fontSize: "11px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              background: "none",
              border: "none",
              color: "#6b7280",
              cursor: "pointer",
              fontWeight: "800",
              transition: "color 0.2s ease"
            }}
            onMouseEnter={(e) => e.target.style.color = "#4f46e5"}
            onMouseLeave={(e) => e.target.style.color = "#6b7280"}
          >
            {expanded ? "▲ 접기" : "▼ 펼치기"}
          </button>
        </div>
      </div>
    </article>
  );
}

function SettlementRowActions({
  request,
  settlement,
  savingKey,
  statusScope,
  onOpenDetail,
  onUpdateRequestSettlement,
}) {
  const rowKey = getSettlementRequestRowKey(request);
  const updateKey = `settlement-request-${rowKey}`;
  const isSaving = savingKey === updateKey;
  const hasSettlement = !settlement.is_virtual;

  const confirmSettlement = () => {
    onUpdateRequestSettlement?.(request, {
      settlement_status: "settlement_confirmed",
    });
  };
  const startInterpreterPayment = () => {
    onUpdateRequestSettlement?.(request, {
      settlement_status: "settlement_paying",
    });
  };
  const completeSettlement = () => {
    onUpdateRequestSettlement?.(request, {
      settlement_status: "settlement_completed",
    });
  };
  const revertToPending = () => {
    onUpdateRequestSettlement?.(request, {
      settlement_status: "settlement_waiting",
    });
  };

  if (statusScope === "pending") {
    return (
      <div className="admin-inline-actions">
        <button
          type="button"
          className="admin-save"
          disabled={isSaving}
          onClick={confirmSettlement}
        >
          {savingKey === updateKey ? "처리 중..." : "정산 확정"}
        </button>
      </div>
    );
  }

  if (statusScope === "confirmed") {
    return (
      <div className="admin-inline-actions">
        <button
          type="button"
          className="admin-save"
          disabled={isSaving}
          onClick={startInterpreterPayment}
        >
          {savingKey === updateKey ? "처리 중..." : "통역사 지급"}
        </button>
        {hasSettlement && (
          <button
            type="button"
            className="admin-secondary"
            onClick={() => onOpenDetail(settlement)}
          >
            상세
          </button>
        )}
      </div>
    );
  }

  if (statusScope === "paying") {
    return (
      <div className="admin-inline-actions">
        <button
          type="button"
          className="admin-save"
          disabled={isSaving}
          onClick={completeSettlement}
        >
          {savingKey === updateKey ? "처리 중..." : "정산 완료"}
        </button>
        {hasSettlement && (
          <button
            type="button"
            className="admin-secondary"
            onClick={() => onOpenDetail(settlement)}
          >
            상세
          </button>
        )}
      </div>
    );
  }

  if (statusScope === "completed") {
    return (
      <div className="admin-inline-actions">
        <button
          type="button"
          className="admin-secondary"
          disabled={isSaving}
          onClick={revertToPending}
        >
          {savingKey === updateKey ? "처리 중..." : "대기로 되돌리기"}
        </button>
        {hasSettlement && (
          <button
            type="button"
            className="admin-secondary"
            onClick={() => onOpenDetail(settlement)}
          >
            상세
          </button>
        )}
      </div>
    );
  }

  if (hasSettlement) {
    return (
      <button
        type="button"
        className="admin-secondary"
        onClick={() => onOpenDetail(settlement)}
      >
        상세
      </button>
    );
  }

  return null;
}

function OperationOverview({
  todayItems,
  urgentItems,
  weekItems = [],
  onOpenRequest,
}) {
  const [selectedUrgentItem, setSelectedUrgentItem] = useState(null);

  const handleOpenUrgentDetail = (item) => {
    setSelectedUrgentItem(item);
  };

  const handleMoveToRequest = () => {
    if (!selectedUrgentItem) return;
    const request = selectedUrgentItem.request;
    setSelectedUrgentItem(null);
    onOpenRequest(request);
  };

  return (
    <section className="admin-operation-overview" aria-label="운영 대시보드">
      <div className="admin-operation-panel admin-today-panel">
        <div className="admin-panel-head">
          <div>
            <p className="admin-kicker">TODAY</p>
            <h2>오늘 진행</h2>
          </div>
          <span>{todayItems.length}건</span>
        </div>
        <div className="admin-operation-list">
          {todayItems.length === 0 ? (
            <p className="admin-empty-text">오늘 예정된 운영이 없습니다.</p>
          ) : (
            todayItems.slice(0, 4).map((item) => (
              <article className="admin-operation-item" key={`today-${item.request.id}`}>
                <div>
                  <span className={`admin-flow-status-badge ${item.badgeClass}`}>
                    {item.statusLabel}
                  </span>
                  <strong>{item.timeLabel}</strong>
                </div>
                <h3>{item.request.event_name || "-"}</h3>
                <p>
                  <MapPin size={14} aria-hidden="true" />
                  {item.request.event_location || "-"}
                </p>
                <p>
                  <User size={14} aria-hidden="true" />
                  {item.interpreters || "배정 통역사 없음"}
                </p>
                <p>{item.request.company_name || "-"}</p>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="admin-operation-panel admin-urgent-panel">
        <div className="admin-panel-head">
          <div>
            <p className="admin-kicker">THIS WEEK</p>
            <h2>이번 주 예정</h2>
          </div>
          <span>{weekItems.length}건</span>
        </div>
        <div className="admin-operation-list">
          {weekItems.length === 0 ? (
            <p className="admin-empty-text">이번 주 예정된 운영이 없습니다.</p>
          ) : (
            weekItems.slice(0, 6).map((item) => (
              <button
                type="button"
                className="admin-week-row"
                key={`week-${item.request.id}`}
                onClick={() => onOpenRequest(item.request)}
              >
                <strong>{formatUrgentShortDate(item.request)}</strong>
                <span>{item.request.event_name || "-"}</span>
                <small>{item.request.company_name || "-"} · {item.interpreters || "배정 통역사 없음"}</small>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="admin-operation-panel admin-urgent-panel">
        <div className="admin-panel-head">
          <div>
            <p className="admin-kicker">CHECK</p>
            <h2>긴급 확인</h2>
          </div>
          <span>{urgentItems.length}건</span>
        </div>
        <div className="admin-urgent-list" role="list">
          <div className="admin-urgent-list-scroll">
            {urgentItems.length === 0 ? (
              <p className="admin-empty-text">긴급 확인이 필요한 의뢰가 없습니다.</p>
            ) : (
              urgentItems.slice(0, 5).map((item) => (
                <button
                  type="button"
                  className="admin-urgent-row"
                  key={`urgent-${item.request.id}`}
                  onClick={() => handleOpenUrgentDetail(item)}
                  role="listitem"
                >
                  <span className={`admin-urgent-dday ${getUrgentDdayTone(item)}`}>
                    {item.dDayLabel}
                  </span>
                  <span className="admin-urgent-event">
                    <strong>{item.request.event_name || "-"}</strong>
                    <small>{item.reason}</small>
                  </span>
                  <span className="admin-urgent-manage">확인</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {selectedUrgentItem && (
        <UrgentRequestDetailModal
          item={selectedUrgentItem}
          onClose={() => setSelectedUrgentItem(null)}
          onMoveToRequest={handleMoveToRequest}
        />
      )}
    </section>
  );
}

function ProcessingTaskList({ items = [], onOpenItem }) {
  const [isOpen, setIsOpen] = useState(false);
  const totalCount = items.length;
  const openTasks = () => setIsOpen(true);

  return (
    <section className="admin-task-list-section">
      <button type="button" className="admin-task-list-summary" onClick={openTasks}>
        <div>
          <p className="admin-kicker">TASKS</p>
          <h2>처리 필요 업무 ({totalCount}건)</h2>
        </div>
        <span>{totalCount > 0 ? "목록 보기" : "업무 없음"}</span>
      </button>
      {isOpen && (
        <ProcessingTaskModal
          items={items}
          onClose={() => setIsOpen(false)}
          onOpenItem={(item) => {
            setIsOpen(false);
            onOpenItem(item);
          }}
        />
      )}
    </section>
  );
}

function ProcessingTaskModal({ items = [], onClose, onOpenItem }) {
  return (
    <div className="admin-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="admin-modal-card admin-task-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="processing-task-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <div>
            <p className="admin-kicker">TASKS</p>
            <h2 id="processing-task-title">처리 필요 업무 ({items.length}건)</h2>
          </div>
          <button
            type="button"
            className="admin-modal-icon-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {items.length === 0 ? (
          <p className="admin-empty-text">지금 처리할 업무가 없습니다.</p>
        ) : (
          <div className="admin-task-modal-list">
            {items.map((item) => (
              <article className="admin-task-modal-row" key={item.id}>
                <span>{item.category}</span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
                <em>{formatDate(item.date)}</em>
                <button
                  type="button"
                  className="admin-link-button primary"
                  onClick={() => onOpenItem(item)}
                >
                  바로가기
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RevenueSummaryPanel({ summary }) {
  return (
    <div className="admin-operation-panel admin-revenue-panel">
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">MONTH</p>
          <h2>운영 매출 요약</h2>
        </div>
        <span>예상</span>
      </div>
      <dl className="admin-revenue-grid">
        <div>
          <dt>기업 청구 금액</dt>
          <dd>{formatJPY(summary?.companyAmount || 0)}</dd>
        </div>
        <div>
          <dt>통역사 지급 예정</dt>
          <dd>{formatJPY(summary?.interpreterAmount || 0)}</dd>
        </div>
        <div>
          <dt>예상 운영 수익</dt>
          <dd>{formatJPY(summary?.profit || 0)}</dd>
        </div>
      </dl>
      <p className="admin-revenue-note">세금 계산 전 운영 참고용 예상값입니다.</p>
    </div>
  );
}

function RecentActivityPanel({ activities = [], onOpenActivity }) {
  return (
    <section className="admin-operation-panel admin-activity-panel">
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">RECENT</p>
          <h2>최근 변경</h2>
        </div>
        <span>{activities.length}건</span>
      </div>
      <div className="admin-activity-list">
        {activities.length === 0 ? (
          <p className="admin-empty-text">최근 활동 로그가 없습니다.</p>
        ) : (
          activities.slice(0, 5).map((activity) => (
            <article key={activity.id} className="admin-activity-item">
              <div>
                <strong>{activity.description}</strong>
                <span>{activity.actorLabel || "시스템"}</span>
              </div>
              <time>{formatDateTime(activity.created_at)}</time>
              {activity.targetSubTab && (
                <button
                  type="button"
                  className="admin-link-button"
                  onClick={() => onOpenActivity?.(activity)}
                >
                  바로가기
                </button>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function UrgentRequestDetailModal({ item, onClose, onMoveToRequest }) {
  const request = item.request || {};

  return (
    <div className="admin-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="admin-modal-card admin-urgent-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="urgent-request-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <div>
            <p className="admin-kicker">URGENT</p>
            <h2 id="urgent-request-detail-title">긴급 요청 상세</h2>
          </div>
          <button
            type="button"
            className="admin-modal-icon-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <dl className="admin-urgent-detail-list">
          <div>
            <dt>의뢰번호</dt>
            <dd>{getRequestDisplayNumber(request)}</dd>
          </div>
          <div>
            <dt>기업명</dt>
            <dd>{request.company_name || request.companyName || "-"}</dd>
          </div>
          <div>
            <dt>행사명</dt>
            <dd>{request.event_name || "-"}</dd>
          </div>
          <div>
            <dt>행사 날짜</dt>
            <dd>{item.dateLabel || formatDateRange(request.start_date, request.end_date, request.event_date)}</dd>
          </div>
          <div>
            <dt>장소</dt>
            <dd>{request.event_location || "-"}</dd>
          </div>
          <div>
            <dt>필요 인원</dt>
            <dd>{getRequestPeopleCountLabel(request)}</dd>
          </div>
          <div>
            <dt>현재 지원자</dt>
            <dd>{getRequestApplicantCountLabel(request)}</dd>
          </div>
          <div>
            <dt>매칭 상태</dt>
            <dd>{item.reason || getMatchingStatusLabel(request.matching_status || request.status)}</dd>
          </div>
        </dl>

        <div className="admin-urgent-detail-actions">
          <button type="button" className="admin-auth-primary" onClick={onMoveToRequest}>
            의뢰 관리로 이동
          </button>
          <button type="button" className="admin-auth-secondary" onClick={onClose}>
            닫기
          </button>
        </div>
      </section>
    </div>
  );
}

function getUrgentDdayTone(item = {}) {
  const dDay = Number(item.priority);
  if (Number.isFinite(dDay) && dDay <= 3) return "is-red";
  return "is-orange";
}

function formatUrgentShortDate(request = {}) {
  const date = getRequestPrimaryDate(request);
  if (!date) return "-";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "-";
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${month}.${day}`;
}

function getRequestDisplayNumber(request = {}) {
  return (
    formatManagementNumber(request.management_number) ||
    request.request_no ||
    request.request_number ||
    request.id ||
    "-"
  );
}

function getRequestPeopleCountLabel(request = {}) {
  const count =
    request.requested_people_count ??
    request.people_count ??
    request.required_people_count ??
    request.interpreter_count;
  return count || count === 0 ? `${count}명` : "-";
}

function getRequestApplicantCountLabel(request = {}) {
  const count =
    request.applicant_count ??
    request.application_count ??
    request.applications_count ??
    request.request_applications_count ??
    request.current_applicant_count;
  return count || count === 0 ? `${count}명` : "확인 필요";
}

function MetricCard({ label, value, description, icon: Icon, tone = "purple", onClick }) {
  return (
    <button type="button" className={`admin-metric-card tone-${tone}`} onClick={onClick}>
      <span className="admin-metric-icon">
        {Icon && <Icon size={20} aria-hidden="true" />}
      </span>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{description}</small>
    </button>
  );
}

function SectionTitle({ collapsible = false, collapsed = false, count, title, onToggle }) {
  const content = (
    <>
      <div>
        <p className="admin-kicker">MANAGE</p>
        <h2>{title}</h2>
      </div>
      <span className="admin-count">
        {count}
        {collapsible && (
          <span className="admin-section-toggle-icon" aria-hidden="true">
            {collapsed ? "▼" : "▲"}
          </span>
        )}
      </span>
    </>
  );

  if (collapsible) {
    return (
      <button
        type="button"
        className="admin-section-title admin-section-title-button"
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        {content}
      </button>
    );
  }

  return <div className="admin-section-title">{content}</div>;
}

function InlineSelect({ options, value, onChange, disabled = false }) {
  return (
    <select
      className="admin-inline-select"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => {
        const normalized =
          typeof option === "string" ? { label: getStatusLabel(option), value: option } : option;
        return (
          <option key={normalized.value} value={normalized.value}>
            {normalized.label}
          </option>
        );
      })}
    </select>
  );
}

function OperationFlowStatusControls({
  disabled = false,
  item,
  onChange,
  onSettlementChange = null,
  settlementValue = null,
}) {
  const statuses = getOperationFlowStatuses(item);
  const settlementStatus = onSettlementChange
    ? normalizeAdminSettlementStatus(settlementValue)
    : statuses.settlement_status;

  return (
    <div className="admin-flow-status-controls" aria-label="운영 단계 상태 변경">
      <OperationFlowSelect
        disabled={disabled}
        options={ASSIGNMENT_STATUS_OPTIONS}
        type="assignment"
        value={statuses.assignment_status}
        onChange={(value) => onChange(getAssignmentStatusChanges({ ...item, assignment_status: value }))}
      />
      <OperationFlowSelect
        disabled={disabled}
        options={OPERATION_STATUS_OPTIONS}
        type="operation"
        value={statuses.operation_status}
        onChange={(value) => onChange(getOperationStatusChanges({ ...item, operation_status: value }))}
      />
      <OperationFlowSelect
        disabled={disabled}
        options={onSettlementChange ? SETTLEMENT_STATUS_OPTIONS : SETTLEMENT_FLOW_STATUS_OPTIONS}
        type="settlement"
        value={settlementStatus}
        onChange={(value) =>
          onSettlementChange
            ? onSettlementChange(value)
            : onChange(getSettlementFlowStatusChanges({ ...item, settlement_status: value }))
        }
      />
    </div>
  );
}

function OperationFlowSelect({ disabled, onChange, options, type, value }) {
  const className = `admin-flow-status-select ${getOperationFlowBadgeClass(type, value)}`;

  return (
    <select
      className={className}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      aria-label={getOperationFlowAriaLabel(type)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function FlowStatusBadge({ label, type, value }) {
  return (
    <span className={`admin-flow-status-badge ${getOperationFlowBadgeClass(type, value)}`}>
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  const normalized = status || APPLICATION_STATUS.PENDING;
  return (
    <span className={`status-badge ${getStatusBadgeClass(normalized)}`}>
      {getStatusLabel(normalized)}
    </span>
  );
}

function DuplicateBadge({ title }) {
  return (
    <span className="admin-duplicate-badge" title={title || "중복 의심"}>
      중복 의심
    </span>
  );
}

function ScheduleConflictBadge() {
  return (
    <span className="admin-schedule-conflict-badge" title="일정 충돌">
      일정 충돌
    </span>
  );
}

function ManagementNumberBadge({ value }) {
  return (
    <span className="admin-management-number-badge">
      {formatManagementNumber(value)}
    </span>
  );
}

function ManagementNumberBlock({ label = "관리번호", value }) {
  return (
    <div className="admin-management-number-block">
      <span>{label}</span>
      <ManagementNumberBadge value={value} />
    </div>
  );
}

function formatManagementNumber(value) {
  const normalized = String(value || "").trim();
  return normalized && normalized !== "번호 미생성" ? normalized : "번호 생성 필요";
}

function getAdminActionTypeLabel(actionType) {
  const labels = {
    status_changed: "상태 변경",
    memo_created: "내부 메모 추가",
    assignment_created: "배정 생성",
    settlement_updated: "정산 수정",
    schedule_conflict_override: "일정 충돌 강제 배정",
  };
  return labels[actionType] || actionType || "처리 이력";
}

function parseInterpreterChangeLog(message = "") {
  if (!message || !message.includes("→")) {
    return [{ label: "변경 내용", before: "", after: message || "-" }];
  }

  const [beforeRaw, afterRaw] = message.split("→").map((value) => value.trim());
  const normalize = (text = "") => {
    const result = {};
    const labelMap = {
      상태: "계정 상태",
      검증: "검증 상태",
      활동: "활동 상태",
    };

    text.split(",").forEach((part) => {
      const [key, ...valueParts] = part.split(":").map((value) => value.trim());
      const value = valueParts.join(":").trim();
      if (!key || value === "") return;
      result[labelMap[key] || key] = value;
    });

    return result;
  };

  const before = normalize(beforeRaw);
  const after = normalize(afterRaw);
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const changes = keys
    .filter((key) => before[key] !== after[key])
    .map((key) => ({
      label: key,
      before: before[key] ?? "-",
      after: after[key] ?? "-",
    }));

  return changes.length > 0
    ? changes
    : [{ label: "변경 내용", before: "", after: message }];
}

function formatChangeValue(value = "") {
  const valueMap = {
    active: "활동중",
    inactive: "비활동",
    true: "예",
    false: "아니오",
    pending: "대기",
    approved: "승인 완료",
    rejected: "반려",
  };
  return valueMap[String(value)] || value || "-";
}

function parseRequestStatusChange(message = "") {
  if (!message || !message.includes("→")) return [];

  const [beforeRaw, afterRaw] = message.split("→").map((value) => value.trim());
  const parseSide = (text = "") => {
    const result = {};
    const labelMap = {
      상태: "의뢰 상태",
      결제: "결제 상태",
      운영: "운영 상태",
      배정: "배정 상태",
      정산: "정산 상태",
    };

    text.split(",").forEach((part) => {
      const [key, ...valueParts] = part.split(":");
      const value = valueParts.join(":").trim();
      const label = key?.trim();
      if (!label || !value) return;
      result[labelMap[label] || label] = value;
    });

    return result;
  };

  const before = parseSide(beforeRaw);
  const after = parseSide(afterRaw);

  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((key) => before[key] !== after[key])
    .map((key) => ({
      label: key,
      before: before[key] || "-",
      after: after[key] || "-",
    }));
}

function formatRequestStatusValue(value = "") {
  const map = {
    draft: "작성중",
    assigned: "배정완료",
    unpaid: "미결제",
    paid: "결제완료",
    operation_before: "운영 전",
    operation_ready: "운영 준비중",
    operation_preparing: "운영 준비중",
    operation_scheduled: "운영 예정",
    operation_in_progress: "운영 중",
    operation_completed: "업무 완료",
    assignment_pending: "배정 대기",
    assignment_in_progress: "배정중",
    assignment_completed: "배정완료",
    confirmed: "정산 확정",
    pending: "대기",
    completed: "완료",
  };

  return map[String(value)] || value || "-";
}

function formatHistoryTitle(title = "") {
  if (!title) return "상태 변경";
  return String(title)
    .replaceAll("assignment_pending", "배정 대기")
    .replaceAll("assignment_in_progress", "배정중")
    .replaceAll("assignment_completed", "배정완료")
    .replaceAll("operation_before", "운영 전")
    .replaceAll("operation_in_progress", "운영 중")
    .replaceAll("operation_completed", "업무 완료")
    .replaceAll("draft", "작성중")
    .replaceAll("assigned", "배정완료")
    .replaceAll("unpaid", "미결제")
    .replaceAll("confirmed", "정산 확정");
}

function getRequestName(request = {}) {
  return (
    request?.request_name ||
    request?.event_name ||
    request?.project_name ||
    request?.name ||
    request?.title ||
    request?.request_no ||
    "의뢰명 미등록"
  );
}

function getJobName(job = {}) {
  return (
    job?.job_title ||
    job?.title ||
    job?.event_name ||
    job?.request_name ||
    job?.name ||
    job?.job_no ||
    "공고명 미등록"
  );
}

function getProcessLogSortTime(value) {
  if (value === null || value === undefined || value === "") return 0;
  const dateTime = new Date(value).getTime();
  if (!Number.isNaN(dateTime)) return dateTime;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? 0 : numeric;
}

function formatProcessLogDate(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number" || /^\d+$/.test(String(value))) return "-";
  return formatDateTime(value);
}

function getAdminActivitySummaryLabel(log = {}) {
  if (log.action_type === "memo_created") return "내부 메모 추가";

  const changedFields = getAdminLogChangedFields(log);
  const primaryField = changedFields.find((field) =>
    ["assignment_status", "operation_status", "settlement_status", "payment_status", "status"].includes(field.key)
  );

  if (primaryField) {
    return `${primaryField.label} ${getAdminStatusDisplayValue(primaryField.afterValue)}`;
  }

  return getAdminActionTypeLabel(log.action_type);
}

function getAdminLogActorLabel(log = {}) {
  if (log.actor_name) return log.actor_name;
  if (log.actor_email) return log.actor_email;
  if (log.changed_by) return log.changed_by;
  if (log.actor_user_id) return "관리자";
  return "";
}

function formatAdminActivityLog(log = {}) {
  if (log.action_type === "memo_created") return "관리자가 내부 메모를 추가했습니다.";

  const beforeValue = summarizeAdminLogValue(log.before_value);
  const afterValue = summarizeAdminLogValue(log.after_value);

  if (beforeValue || afterValue) {
    return `${beforeValue || "이전 값 없음"} → ${afterValue || "변경 값 없음"}`;
  }

  return "운영 정보가 변경되었습니다.";
}

function getAdminLogContent(log = {}, changedFields = getAdminLogChangedFields(log), fallback = "운영 정보 변경") {
  const formatted = formatAdminActivityLog(log);
  if (formatted && formatted !== "운영 정보가 변경되었습니다.") return formatted;
  if (changedFields.length > 0) {
    return `${changedFields.map((field) => field.label).join(", ")} 항목이 변경되었습니다.`;
  }
  return fallback;
}

function normalizeAdminLogObject(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { value };
    } catch {
      return { value };
    }
  }
  if (Array.isArray(value)) return { value: value.join(", ") };
  if (typeof value === "object") return value;
  return { value };
}

function normalizeAdminLogComparableValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getAdminLogChangedFields(log = {}) {
  const beforeObject = normalizeAdminLogObject(log.before_value);
  const afterObject = normalizeAdminLogObject(log.after_value);
  const keys = Array.from(new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)]));

  return keys
    .map((key) => ({
      key,
      label: getAdminLogFieldLabel(key),
      beforeValue: beforeObject[key],
      afterValue: afterObject[key],
    }))
    .filter(
      (field) =>
        normalizeAdminLogComparableValue(field.beforeValue) !==
        normalizeAdminLogComparableValue(field.afterValue)
    )
    .filter(
      (field) =>
        normalizeAdminLogComparableValue(field.beforeValue) ||
        normalizeAdminLogComparableValue(field.afterValue)
    );
}

function formatAdminLogDetailValue(value) {
  if (value === null || value === undefined || value === "") return "없음";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return summarizeAdminLogValue(value) || JSON.stringify(value);
  return String(value);
}

function getAdminStatusDisplayValue(value) {
  const raw = formatAdminLogDetailValue(value);
  const labels = {
    assigned: "완료",
    matched: "완료",
    completed: "완료",
    paid: "완료",
    pending: "대기",
    waiting: "대기",
    assigning: "중",
    operation_preparing: "준비중",
    operation_scheduled: "예정",
    operation_before: "전",
    operation_in_progress: "중",
    operation_completed: "완료",
    before_operation: "전",
    not_required: "불필요",
    unpaid: "미결제",
    invoice_sent: "청구",
  };
  return labels[raw] || raw;
}

function summarizeAdminLogValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value !== "object") return String(value);

  return Object.entries(value)
    .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== "")
    .map(([key, entryValue]) => `${getAdminLogFieldLabel(key)}: ${entryValue}`)
    .join(", ");
}

function getAdminLogFieldLabel(key) {
  const labels = {
    status: "상태",
    assignment_status: "배정",
    operation_status: "운영",
    settlement_status: "정산",
    payment_status: "결제",
    activity_status: "활동",
    approved: "검증",
    note: "메모",
  };
  return labels[key] || key;
}

function formatRequestListNumber(request = {}) {
  if (request.request_number) return request.request_number;
  if (request.request_no) return request.request_no;
  if (request.id) {
    const idText = String(request.id);
    const suffix = /^\d+$/.test(idText) ? idText.padStart(3, "0") : idText.slice(0, 8).toUpperCase();
    return `ONLI REQ ${suffix}`;
  }
  return "ONLI REQ";
}

function NumberControl({ label, value, onChange }) {
  return (
    <label className="admin-field-control">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function FieldControl({ label, children }) {
  return (
    <label className="admin-field-control">
      <span>{label}</span>
      {children}
    </label>
  );
}

function RequestReferenceFileBlock({ file, onOpen, onDownload }) {
  if (!file) return null;

  return (
    <div className="admin-reference-file-block">
      <span className="admin-reference-file-label">참고 자료</span>
      <div className="admin-reference-file-row">
        <span className="admin-reference-file-name">📎 {file.name || "첨부 파일"}</span>
        {file.path ? (
          <div className="admin-reference-file-actions">
            <button type="button" onClick={onOpen}>
              보기
            </button>
            <button type="button" onClick={onDownload}>
              다운로드
            </button>
          </div>
        ) : (
          <span className="admin-reference-file-empty">
            기존 업로드 파일 경로가 저장되지 않아 열람할 수 없습니다. 다시 업로드가 필요합니다.
          </span>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </div>
  );
}

function AssignmentList({ emptyText, items, onRemove, handleContactVisibleChange }) {
  if (items.length === 0) {
    return <span className="admin-empty-chip">{emptyText}</span>;
  }

  return (
    <div className="admin-assignment-list">
      {items.map((item) => {
        const requestInterpreter = item.assignment;
        return (
          <div key={item.id} className="admin-assignment-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
            <span style={{ flex: 1, fontSize: "13px", fontWeight: "700", color: "#334155" }}>{item.label}</span>
            {requestInterpreter?.id && (
              <label className="contact-visible-control" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", color: "#475569" }}>
                <input
                  type="checkbox"
                  checked={Boolean(requestInterpreter.contact_visible)}
                  onChange={(event) =>
                    handleContactVisibleChange?.(requestInterpreter.id, event.target.checked)
                  }
                  style={{ cursor: "pointer" }}
                />
                연락처 공개
              </label>
            )}
            <button
              type="button"
              className="admin-link-button danger"
              onClick={() => onRemove(item.assignment || item.id)}
            >
              매칭 취소
            </button>
          </div>
        );
      })}
    </div>
  );
}

function EventDatePickerButton({ label, value, active, placeholder, onClick }) {
  return (
    <div className="date-picker-card">
      <span>{label}</span>
      <button
        type="button"
        className={active ? "is-active" : ""}
        onClick={onClick}
        aria-expanded={active}
      >
        {formatDisplayDate(value) || placeholder}
      </button>
    </div>
  );
}

function MessageBox({ text }) {
  return <div className="admin-message">{text}</div>;
}

function buildJobPayloadFromRequest(request) {
  const title = request.event_name
    ? `${request.event_name} 통역 모집`
    : "통역 모집";
  const peopleCount = request.requested_people_count || request.required_count;
  const level = request.requested_level || request.required_level || "";
  const field = request.interpretation_field || request.job_field || "";
  const startDate = request.start_date || request.event_date || request.date || "";
  const endDate = request.end_date || request.event_date || request.date || "";

  return {
    title,
    event_name: request.event_name || title,
    date: formatDateRange(startDate, endDate, startDate),
    event_date: startDate,
    start_date: startDate,
    end_date: endDate,
    location: request.event_location || request.location || "",
    event_location: request.event_location || request.location || "",
    pay: request.interpreter_fee
      ? `${Number(request.interpreter_fee).toLocaleString()}원`
      : "협의",
    language: "한국어 ↔ 일본어",
    level,
    requested_level: level,
    preference: [field, request.preferred_gender].filter(Boolean).join(" · "),
    preferred_gender: request.preferred_gender || "",
    people: peopleCount ? `${peopleCount}명` : "",
    people_count: peopleCount || null,
    field,
    status: JOB_STATUS.RECRUITING,
    assignment_status: normalizeAssignmentStatus(request),
    operation_status: normalizeOperationStatus(request),
    visibility: "public",
    request_type: getDesignatedRequestType(request).label,
    selected_interpreter_id: request.selected_interpreter_id || request.interpreter_id || null,
    selected_interpreter_name:
      request.selected_interpreter_name || request.interpreter_name || "",
    interpreter_id: request.interpreter_id || request.selected_interpreter_id || null,
    interpreter_name: request.interpreter_name || request.selected_interpreter_name || "",
  };
}

function createRequestEditDraft(request = {}, job = null) {
  const flowSource = getRequestFlowSource(request, job);
  const eventName =
    request.title ||
    request.event_title ||
    request.event_name ||
    job?.title ||
    job?.event_name ||
    "";
  const companyName = request.company_name || request.company || job?.company_name || "";
  const location =
    request.location ||
    request.place ||
    request.event_location ||
    job?.location ||
    job?.event_location ||
    "";
  const startDate = getDateRangeStart(
    request.start_date || request.event_start_date || job?.start_date,
    request.event_date || job?.event_date
  );
  const endDate = getDateRangeEnd(
    request.end_date || request.event_end_date || job?.end_date,
    request.event_date || job?.event_date
  );
  const level =
    request.level ||
    request.requested_level ||
    request.required_level ||
    job?.requested_level ||
    job?.level ||
    "Lv1";

  return {
    id: request.id || "",
    title: eventName,
    event_name: eventName,
    company_name: companyName,
    request_no: request.request_no || request.request_number || "",
    request_type: request.request_type || getDesignatedRequestType(request, job).label,
    start_date: startDate,
    end_date: endDate,
    event_location: location,
    location,
    language: request.language || job?.language || "",
    people_count:
      request.people_count ||
      request.requested_people_count ||
      request.required_people ||
      request.required_count ||
      job?.people_count ||
      "",
    requested_level: level,
    level,
    price:
      request.price ||
      request.daily_pay ||
      request.pay ||
      request.company_amount ||
      request.client_price ||
      job?.pay ||
      "",
    assigned_interpreter:
      request.assigned_interpreter ||
      request.assigned_interpreter_name ||
      request.interpreter_name ||
      "",
    preferred_gender: request.preferred_gender || job?.preferred_gender || "",
    is_public: String(Boolean(request.is_job_public || request.is_public || normalizeJobVisibility(job) === "public")),
    status: normalizeMatchingStatus(flowSource.status),
    assignment_status: normalizeAssignmentStatus(flowSource),
    operation_status: normalizeOperationStatus(flowSource),
    settlement_status: normalizeSettlementFlowStatus(flowSource),
    contact_status: request.contact_status || "not_contacted",
    payment_status: request.payment_status || "unpaid",
    estimate_status: request.estimate_status || "estimate_preparing",
    company_internal_memo: request.company_internal_memo || "",
  };
}

function buildLegacyJobPayloadFromRequest(request) {
  const payload = buildJobPayloadFromRequest(request);
  return {
    title: payload.title,
    location: payload.location,
    date: formatDateRange(payload.start_date, payload.end_date, payload.event_date),
    pay: payload.pay,
    language: payload.language,
    level: payload.level,
    preference: payload.preference,
    people: payload.people,
    status: JOB_STATUS.RECRUITING,
    is_urgent: false,
  };
}

function getRequestJobPublicState(request, job) {
  if (request.job_id && job) {
    const isPublic = normalizeJobVisibility(job) === "public";
    return isPublic
      ? { type: "public", label: "공개중" }
      : { type: "private", label: "비공개" };
  }

  if (request.job_id && !job) {
    return { type: "private", label: "공고 확인 필요" };
  }

  return { type: "missing", label: "공고 미생성" };
}

function isRequestJobPublic(request, jobsById) {
  const job = request.job_id ? jobsById.get(request.job_id) : null;
  if (job) return getRequestJobPublicState(request, job).type === "public";
  return Boolean(request.is_public);
}

function isCompletedRequest(request = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endDateValue =
    request.end_date ||
    request.event_end_date ||
    request.date_end ||
    request.finished_at ||
    request.event_date ||
    getDateRangeEnd("", request.date);
  const endDate = parseRequestDateOnly(endDateValue);
  const isPast =
    endDate instanceof Date &&
    !Number.isNaN(endDate.getTime()) &&
    endDate < today;
  const operationStatus = String(
    request.operation_status ||
      request.status ||
      ""
  ).trim();
  const normalizedStatus = operationStatus.toLowerCase();
  const completedStatuses = new Set([
    "업무완료",
    "운영완료",
    "운영종료",
    "completed",
    "finished",
    "operation_completed",
    "operation_done",
    "done",
    OPERATION_STATUS.COMPLETED,
  ]);

  return (
    isPast &&
    (completedStatuses.has(operationStatus) ||
      completedStatuses.has(normalizedStatus) ||
      normalizeOperationStatus(request) === OPERATION_STATUS.COMPLETED)
  );
}

// eslint-disable-next-line no-unused-vars
function isSettlementCompletedRequest(request = {}) {
  return getSettlementStatusValue(request) === SETTLEMENT_FLOW_STATUS.COMPLETED;
}

function getApplicationStatusValues(application = {}) {
  return [
    application.status,
    application.matching_status,
    application.assignment_status,
  ]
    .filter((status) => status !== undefined && status !== null)
    .map((status) => String(status).trim().toLowerCase())
    .filter(Boolean);
}

function isPostAcceptanceApplication(application = {}) {
  const normalizedStatus = normalizeApplicationStatus(application.status);
  if (normalizedStatus === APPLICATION_STATUS.ACCEPTED) return true;
  return getApplicationStatusValues(application).some((status) =>
    POST_ACCEPTANCE_STATUS_VALUES.has(status)
  );
}

function isApplicantManagementApplication(application = {}) {
  if (isPostAcceptanceApplication(application)) return false;
  return APPLICANT_MANAGEMENT_STATUSES.has(
    normalizeApplicationStatus(application.status)
  );
}

function getApplicationAssignmentStatus(application = {}) {
  const statuses = getApplicationStatusValues(application);
  if (
    statuses.some((status) =>
      ["assigned", "confirmed", "배정", "배정완료", "확정"].includes(status)
    )
  ) {
    return ASSIGNMENT_STATUS.ASSIGNED;
  }
  if (
    statuses.some((status) =>
      ["assigning", "matching", "배정중", "매칭중", "진행중"].includes(status)
    )
  ) {
    return ASSIGNMENT_STATUS.ASSIGNING;
  }
  return ASSIGNMENT_STATUS.WAITING;
}

function buildAssignmentManagementRows({
  assignments = [],
  jobApplications = [],
  matchings = [],
  requests = [],
  interpreters = [],
}) {
  const safeAssignments = compactAdminRows(assignments);
  const safeJobApplications = compactAdminRows(jobApplications);
  const safeMatchings = compactAdminRows(matchings);
  const safeRequests = compactAdminRows(requests);
  const safeInterpreters = compactAdminRows(interpreters);
  const requestsById = new Map(safeRequests.map((request) => [String(request.id), request]));
  const requestsByJobId = safeRequests.reduce((map, request) => {
    if (request.job_id) map.set(String(request.job_id), request);
    return map;
  }, new Map());
  const usedApplicationIds = new Set();
  const applicationsByInterpreterAndJob = safeJobApplications.reduce((map, application) => {
    const key = `${application.interpreter_id || ""}:${application.job_id || ""}`;
    if (!map.has(key)) map.set(key, application);
    return map;
  }, new Map());
  const matchingsByRequestInterpreter = safeMatchings.reduce((map, matching) => {
    const key = `${matching.request_id || ""}:${matching.interpreter_id || ""}`;
    if (!map.has(key)) map.set(key, matching);
    return map;
  }, new Map());
  const interpretersById = new Map(
    safeInterpreters.map((interpreter) => [String(interpreter.id), interpreter])
  );

  const assignmentRows = safeAssignments.map((assignment) => {
    const request = requestsById.get(String(assignment.request_id)) || null;
    const matching =
      matchingsByRequestInterpreter.get(
        `${assignment.request_id || ""}:${assignment.interpreter_id || ""}`
      ) || {};
    const application =
      request?.job_id
        ? applicationsByInterpreterAndJob.get(
            `${assignment.interpreter_id || ""}:${request.job_id || ""}`
          )
        : null;
    if (application?.id) usedApplicationIds.add(application.id);
    const interpreter =
      assignment.interpreter || interpretersById.get(String(assignment.interpreter_id)) || {};
      const assignmentStatus = normalizeAssignmentStatus(request || {});
      const settlementStatus = request ? getSettlementStatusValue(request) : SETTLEMENT_FLOW_STATUS.NOT_REQUIRED;


    return {
      rowId: `assignment-${assignment.id}`,
      assignment,
      request,
      assignmentNo: matching.matching_no || `ONLI-MAT-${String(assignment.id).padStart(4, "0")}`,
      requestNo: request?.request_no || request?.request_number || "",
      applicationNo: application?.application_no || "",
      interpreterName: interpreter.name || "",
      eventName: request?.event_name || request?.title || "",
      dateLabel: request
        ? formatDateRange(request.start_date, request.end_date, request.event_date || request.date)
        : "-",
      location: request?.event_location || request?.location || "",
      assignmentStatusValue: assignmentStatus,
      assignmentStatusLabel: getAssignmentStatusLabel(assignmentStatus),
      settlementStatusLabel: getSettlementFlowStatusLabel(settlementStatus),
    };
  });

  const acceptedApplicationRows = safeJobApplications
    .filter(
      (application) => {
        const excludedStatuses = ['rejected', 'withdrawn', 'cancelled'];
        return !usedApplicationIds.has(application.id) &&
               !excludedStatuses.includes(application.status);
      }
    )
    .map((application) => {
      const request = (application.jobs?.request_id ? requestsById.get(String(application.jobs.request_id)) : requestsByJobId.get(String(application.job_id))) || null;
      const assignmentStatus = getApplicationAssignmentStatus(application);

      return {
        rowId: `application-assignment-${application.id}`,
        assignment: null,
        request,
        application,
        assignmentNo: application.matching_no || "",
        requestNo: request?.request_no || request?.request_number || "",
        applicationNo: application.application_no || "",
        interpreterName: application.applicant_name || application.name || "",
        eventName:
          request?.event_name ||
          request?.title ||
          application.jobs?.event_name ||
          application.jobs?.title ||
          "",
        dateLabel: request
          ? formatDateRange(request.start_date, request.end_date, request.event_date || request.date)
          : "-",
        location: request?.event_location || request?.location || "",
        assignmentStatusValue: assignmentStatus,
        assignmentStatusLabel: getAssignmentStatusLabel(assignmentStatus),
        settlementStatusLabel: getSettlementFlowStatusLabel(
          request ? getSettlementStatusValue(request) : SETTLEMENT_FLOW_STATUS.NOT_REQUIRED
        ),
      };
    });

  return [...assignmentRows, ...acceptedApplicationRows];
}

function normalizeAssignmentManagementSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]/g, "");
}

function getAssignmentManagementSearchValues(item = {}) {
  const request = item.request || item;
  return [
    item.assignmentNo,
    item.requestNo,
    item.applicationNo,
    request.request_no,
    request.request_number,
    request.management_no,
    request.company_name,
    item.interpreterName,
    item.eventName,
    request.event_name,
    request.title,
    item.location,
    request.event_location,
    request.location,
  ];
}

function getAssignmentManagementStatusValue(item = {}) {
  if (item.assignmentStatusValue) return item.assignmentStatusValue;

  const source = item.request || item.assignment || item;
  const rawStatuses = [
    source.status,
    source.matching_status,
    source.assignment_status,
    source.operation_status,
  ].map((status) => String(status || "").trim().toLowerCase());

  if (
    rawStatuses.some((status) =>
      ["cancelled", "canceled", "cancel", "취소", "취소됨"].includes(status)
    )
  ) {
    return "cancelled";
  }

  if (
    normalizeOperationStatus(source) === OPERATION_STATUS.COMPLETED ||
    rawStatuses.some((status) =>
      ["completed", "complete", "finished", "done", "업무완료", "운영완료", "완료"].includes(status)
    )
  ) {
    return "completed";
  }

  return normalizeAssignmentStatus(source);
}

function doesAssignmentManagementItemMatchFilters(item = {}, filters = {}) {
  const search = normalizeAssignmentManagementSearchText(filters.search);
  const matchesSearch =
    !search ||
    getAssignmentManagementSearchValues(item).some((value) =>
      normalizeAssignmentManagementSearchText(value).includes(search)
    );
  const matchesStatus =
    !filters.status ||
    filters.status === "all" ||
    getAssignmentManagementStatusValue(item) === filters.status;

  return matchesSearch && matchesStatus;
}

function buildAdminMemoItems({ requests = [], interpreters = [], assignmentRows = [] }) {
  const requestMemos = compactAdminRows(requests)
    .filter((request) => hasAdminMemo(request))
    .map((request) => ({
      id: `request-${request.id}`,
      typeLabel: "의뢰 메모",
      number: request.request_no || request.request_number || "",
      title: request.event_name || request.title || request.company_name || "-",
      memo: getAdminMemo(request),
      details: [
        { label: "의뢰번호", value: formatManagementNumber(request.request_no || request.request_number) },
        { label: "기업명", value: request.company_name || "-" },
        { label: "행사명", value: request.event_name || request.title || "-" },
      ],
    }));
  const interpreterMemos = compactAdminRows(interpreters)
    .filter((interpreter) => hasAdminMemo(interpreter))
    .map((interpreter) => ({
      id: `interpreter-${interpreter.id}`,
      typeLabel: "통역사 메모",
      number: interpreter.interpreter_no || "",
      title: interpreter.name || "-",
      memo: getAdminMemo(interpreter),
      details: [
        { label: "통역사 번호", value: formatManagementNumber(interpreter.interpreter_no) },
        { label: "이름", value: interpreter.name || "-" },
      ],
    }));
  const assignmentMemos = compactAdminRows(assignmentRows)
    .filter((row) => row?.assignment && hasAdminMemo(row.assignment))
    .map((row) => ({
      id: `assignment-${row.assignment.id}`,
      typeLabel: "배정 메모",
      number: row.assignmentNo,
      title: row.interpreterName || row.eventName || "-",
      memo: getAdminMemo(row.assignment),
      details: [
        { label: "배정번호", value: formatManagementNumber(row.assignmentNo) },
        { label: "통역사명", value: row.interpreterName || "-" },
        { label: "행사명", value: row.eventName || "-" },
      ],
    }));

  return [...requestMemos, ...interpreterMemos, ...assignmentMemos];
}

function buildAdminNoteDisplayItems({
  notes = [],
  requests = [],
  interpreters = [],
  assignmentRows = [],
  jobApplications = [],
}) {
  const safeRequests = compactAdminRows(requests);
  const safeInterpreters = compactAdminRows(interpreters);
  const safeAssignmentRows = compactAdminRows(assignmentRows);
  const safeJobApplications = compactAdminRows(jobApplications);
  const requestsById = new Map(safeRequests.map((request) => [String(request.id), request]));
  const requestsByJobId = new Map(
    safeRequests
      .filter((request) => request.job_id)
      .map((request) => [String(request.job_id), request])
  );
  const interpretersById = new Map(
    safeInterpreters.map((interpreter) => [String(interpreter.id), interpreter])
  );
  const applicationsById = new Map(
    safeJobApplications.map((application) => [String(application.id), application])
  );
  const assignmentRowsById = new Map(
    safeAssignmentRows
      .filter((row) => row?.assignment?.id)
      .map((row) => [String(row.assignment.id), row])
  );

  return uniqueById(notes).map((note) => {
    const targetType = normalizeAdminTargetType(note.target_type);
    const targetId = String(note.target_id || "");
    const application = targetType === "application" ? applicationsById.get(targetId) : null;
    const applicationRequest = application?.job_id
      ? requestsByJobId.get(String(application.job_id))
      : null;
    const request = targetType === "request" ? requestsById.get(targetId) : applicationRequest;
    const interpreter =
      targetType === "interpreter"
        ? interpretersById.get(targetId)
        : application?.interpreter_id
          ? interpretersById.get(String(application.interpreter_id))
          : null;
    const assignmentRow = targetType === "assignment" ? assignmentRowsById.get(targetId) : null;

    return {
      id: `note-${note.id}`,
      typeLabel: getAdminNoteTypeLabel(targetType),
      number: getAdminNoteNumber({ targetType, request, interpreter, application, assignmentRow }),
      title: getAdminNoteTitle({ targetType, request, interpreter, application, assignmentRow }),
      memo: note.note,
      createdAt: note.created_at,
      details: getAdminNoteDetails({ targetType, request, interpreter, application, assignmentRow }),
    };
  });
}

function buildAdminMemoDisplayItems({
  items = [],
  notes = [],
  requests = [],
  interpreters = [],
  assignmentRows = [],
  jobApplications = [],
}) {
  const noteItems = buildAdminNoteDisplayItems({
    notes,
    requests,
    interpreters,
    assignmentRows,
    jobApplications,
  });
  return uniqueById([...noteItems, ...items]);
}

function getAdminNoteTypeLabel(targetType) {
  const labels = {
    application: "지원 메모",
    request: "의뢰 메모",
    interpreter: "통역사 메모",
    assignment: "배정 메모",
  };
  return labels[targetType] || "운영 메모";
}

function getAdminNoteNumber({ targetType, request, interpreter, application, assignmentRow }) {
  if (targetType === "application") return application?.application_no || "";
  if (targetType === "request") return request?.request_no || request?.request_number || "";
  if (targetType === "interpreter") return interpreter?.interpreter_no || "";
  if (targetType === "assignment") return assignmentRow?.assignmentNo || "";
  return "";
}

function getAdminNoteTitle({ targetType, request, interpreter, application, assignmentRow }) {
  if (targetType === "application") return application?.applicant_name || interpreter?.name || "-";
  if (targetType === "request") return request?.event_name || request?.title || request?.company_name || "-";
  if (targetType === "interpreter") return interpreter?.name || "-";
  if (targetType === "assignment") return assignmentRow?.interpreterName || assignmentRow?.eventName || "-";
  return "-";
}

function getAdminNoteDetails({ targetType, request, interpreter, application, assignmentRow }) {
  if (targetType === "application") {
    return [
      { label: "지원번호", value: formatManagementNumber(application?.application_no) },
      { label: "지원자 이름", value: application?.applicant_name || interpreter?.name || "-" },
      {
        label: "연결 의뢰번호",
        value: formatManagementNumber(request?.request_no || request?.request_number),
      },
      { label: "행사명", value: request?.event_name || application?.jobs?.event_name || application?.jobs?.title || "-" },
    ];
  }

  if (targetType === "request") {
    return [
      { label: "의뢰번호", value: formatManagementNumber(request?.request_no || request?.request_number) },
      { label: "기업명", value: request?.company_name || "-" },
      { label: "행사명", value: request?.event_name || request?.title || "-" },
    ];
  }

  if (targetType === "interpreter") {
    return [
      { label: "통역사 번호", value: formatManagementNumber(interpreter?.interpreter_no) },
      { label: "이름", value: interpreter?.name || "-" },
    ];
  }

  if (targetType === "assignment") {
    return [
      { label: "배정번호", value: formatManagementNumber(assignmentRow?.assignmentNo) },
      { label: "통역사명", value: assignmentRow?.interpreterName || "-" },
      { label: "행사명", value: assignmentRow?.eventName || "-" },
    ];
  }

  return [{ label: "대상", value: "운영 관리 항목" }];
}

function hasAdminMemo(item = {}) {
  return Boolean(getAdminMemo(item));
}

function getAdminMemo(item = {}) {
  return String(item?.admin_memo ?? "").trim();
}

function getEstimateStatusLabel(value) {
  const normalized = String(value || "estimate_preparing").trim();
  const legacyLabels = {
    estimate_pending: "견적 준비중",
    estimate_sent: "견적 확인 필요",
    company_approved: "견적 승인 완료",
  };
  return (
    ESTIMATE_STATUS_OPTIONS.find((option) => option.value === normalized)?.label ||
    legacyLabels[normalized] ||
    "견적 준비중"
  );
}

function formatTimeRange(startTime, endTime) {
  if (startTime && endTime) return `${startTime} ~ ${endTime}`;
  if (startTime) return `${startTime} 시작`;
  if (endTime) return `${endTime} 종료`;
  return "-";
}

function getCompanyHistory(request = {}, requests = [], assignments = [], interpreters = []) {
  const companyName = String(request.company_name || "").trim();
  const relatedRequests = companyName
    ? requests.filter((item) => String(item.company_name || "").trim() === companyName)
    : [];
  const events = relatedRequests
    .map((item) => item.event_name || item.title)
    .filter(Boolean)
    .slice(0, 5)
    .join(" / ");
  const totalAmount = relatedRequests.reduce(
    (sum, item) => sum + Number(getCompanyAmount(item) || 0),
    0
  );
  const interpreterNames = Array.from(new Set([
    ...relatedRequests
      .map((item) => item.assigned_interpreter || item.assigned_interpreter_name || item.interpreter_name)
      .filter(Boolean),
    ...assignments
      .map((assignment) => getAssignedInterpreterLabel(getAssignmentInterpreter(assignment, interpreters)))
      .filter((name) => name && name !== "-"),
  ])).slice(0, 5).join(" / ");
  const memo = relatedRequests
    .map((item) => item.company_internal_memo || item.admin_memo)
    .filter(Boolean)
    .at(0);

  return {
    requestCount: relatedRequests.length,
    events,
    interpreters: interpreterNames,
    totalAmount,
    memo,
  };
}

function getOnliPerformanceCount({ interpreter = {}, matchings = [], requestAssignments = [], requests = [] } = {}) {
  const interpreterId = String(interpreter.id || "");
  if (!interpreterId) return 0;

  const completedKeys = new Set();

  matchings.forEach((matching) => {
    if (String(matching.interpreter_id || "") !== interpreterId) return;
    if (!isCompletedOnliPerformanceRecord(matching)) return;
    const key = matching.request_id
      ? `request:${matching.request_id}`
      : `matching:${matching.id || matching.job_id || ""}`;
    completedKeys.add(key);
  });

  requestAssignments.forEach((assignment) => {
    if (String(assignment.interpreter_id || "") !== interpreterId) return;
    const request = requests.find((item) => String(item.id || "") === String(assignment.request_id || ""));
    if (!request || !isCompletedOnliPerformanceRecord(request)) return;
    completedKeys.add(`request:${request.id}`);
  });

  requests.forEach((request) => {
    const assignedId = request.assigned_interpreter_id || request.matched_interpreter_id;
    if (String(assignedId || "") !== interpreterId) return;
    if (!isCompletedOnliPerformanceRecord(request)) return;
    completedKeys.add(`request:${request.id}`);
  });

  return completedKeys.size;
}

function isCompletedOnliPerformanceRecord(item = {}) {
  if (isExcludedOnliPerformanceRecord(item)) return false;
  const operationStatus = normalizeOperationStatus(item);
  const settlementStatus = normalizeSettlementFlowStatus(item);
  const status = String(item.status || item.matching_status || "").trim().toLowerCase();
  return (
    operationStatus === OPERATION_STATUS.COMPLETED ||
    settlementStatus === SETTLEMENT_FLOW_STATUS.PENDING ||
    settlementStatus === SETTLEMENT_FLOW_STATUS.COMPLETED ||
    ["completed", "settlement_waiting", "settled", "업무완료", "운영완료", "정산대기", "정산완료"].includes(status)
  );
}

function isExcludedOnliPerformanceRecord(item = {}) {
  const statusText = [
    item.status,
    item.matching_status,
    item.assignment_status,
    item.operation_status,
    item.settlement_status,
    item.cancel_reason,
    item.event_name,
    item.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    item.is_test === true ||
    item.test_data === true ||
    item.is_test_data === true ||
    statusText.includes("test") ||
    statusText.includes("테스트") ||
    statusText.includes("cancel") ||
    statusText.includes("취소") ||
    statusText.includes("no_show") ||
    statusText.includes("noshow") ||
    statusText.includes("노쇼")
  );
}

function normalizeAdminTargetType(targetType) {
  const normalized = String(targetType || "").trim().toLowerCase();
  if (["job_application", "job_applications", "application", "applications"].includes(normalized)) {
    return "application";
  }
  if (["request", "requests"].includes(normalized)) return "request";
  if (["business", "businesses", "company", "companies"].includes(normalized)) return "business";
  if (["document", "documents"].includes(normalized)) return "document";
  if (["payment", "payments"].includes(normalized)) return "payment";
  if (["interpreter", "interpreters"].includes(normalized)) return "interpreter";
  if (["assignment", "assignments", "matching", "matchings", "request_interpreter"].includes(normalized)) {
    return "assignment";
  }
  return normalized || "operation";
}

function compactAdminRows(items = []) {
  return Array.isArray(items) ? items.filter(Boolean) : [];
}

function normalizeRequestInterpreterRows(items = []) {
  return compactAdminRows(items).map((item) => ({
    ...item,
    contact_visible: Boolean(item.contact_visible),
  }));
}

function logSupabaseFetchError(label, error) {
  console.error(`${label} Supabase query failed`, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    error,
  });
}

function uniqueById(items = []) {
  const seen = new Set();
  return compactAdminRows(items).filter((item) => {
    const id = String(item?.id || "");
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildNotificationDisplayItems({
  events = [],
  requests = [],
  interpreters = [],
  assignmentRows = [],
  jobApplications = [],
}) {
  const safeRequests = compactAdminRows(requests);
  const safeInterpreters = compactAdminRows(interpreters);
  const safeAssignmentRows = compactAdminRows(assignmentRows);
  const safeJobApplications = compactAdminRows(jobApplications);
  const requestsById = new Map(safeRequests.map((request) => [String(request.id), request]));
  const requestsByJobId = new Map(
    safeRequests
      .filter((request) => request.job_id)
      .map((request) => [String(request.job_id), request])
  );
  const interpretersById = new Map(
    safeInterpreters.map((interpreter) => [String(interpreter.id), interpreter])
  );
  const applicationsById = new Map(
    safeJobApplications.map((application) => [String(application.id), application])
  );
  const assignmentRowsById = new Map(
    safeAssignmentRows
      .filter((row) => row?.assignment?.id)
      .map((row) => [String(row.assignment.id), row])
  );

  return uniqueById(events).map((event) => {
    const payload = getNotificationPayload(event);
    const targetType = normalizeAdminTargetType(event.target_type);
    const targetId = String(event.target_id || "");
    const application =
      targetType === "application"
        ? applicationsById.get(targetId) || applicationsById.get(String(payload.application_id || ""))
        : null;
    const assignmentRow =
      targetType === "assignment"
        ? assignmentRowsById.get(targetId) || assignmentRowsById.get(String(payload.assignment_id || ""))
        : null;
    const request =
      (targetType === "request" ? requestsById.get(targetId) : null) ||
      (payload.request_id ? requestsById.get(String(payload.request_id)) : null) ||
      (application?.job_id ? requestsByJobId.get(String(application.job_id)) : null) ||
      assignmentRow?.request ||
      null;
    const interpreter =
      (targetType === "interpreter" ? interpretersById.get(targetId) : null) ||
      (payload.interpreter_id ? interpretersById.get(String(payload.interpreter_id)) : null) ||
      (application?.interpreter_id ? interpretersById.get(String(application.interpreter_id)) : null) ||
      null;

    return {
      ...event,
      eventLabel: getNotificationEventTypeLabel(event.event_type),
      statusLabel: getNotificationStatusLabel(event.status),
      recipientLabel: getNotificationRecipientLabel(event, { request, interpreter, payload }),
      targetLabel: getNotificationTargetLabel({
        targetType,
        payload,
        request,
        interpreter,
        application,
        assignmentRow,
      }),
      relatedLabel: getNotificationRelatedLabel({
        targetType,
        request,
        interpreter,
        application,
        assignmentRow,
      }),
    };
  });
}

function getNotificationPayload(event = {}) {
  if (!event.payload || typeof event.payload !== "string") return event.payload || {};
  try {
    return JSON.parse(event.payload);
  } catch {
    return {};
  }
}

function mapNotificationsToEvents(notifications = []) {
  return notifications.map((notification) => ({
    id: `notification-${notification.id}`,
    source_id: notification.id,
    event_type: notification.notification_type || "notification",
    title: notification.title,
    message: notification.message,
    channel: notification.channel,
    target_role: notification.target_role,
    target_type: notification.related_request_id ? "request" : "notification",
    target_id: notification.related_request_id
      ? String(notification.related_request_id)
      : String(notification.related_document_id || notification.id),
    recipient_type: notification.recipient_type,
    recipient_id: notification.recipient_id,
    recipient_name: notification.recipient_name,
    recipient_email: notification.recipient_email,
    recipient_phone: notification.recipient_phone,
    payload: {
      ...(notification.metadata || {}),
      title: notification.title,
      message: notification.message,
      channel: notification.channel,
      target_role: notification.target_role,
      recipient_name: notification.recipient_name,
      related_document_id: notification.related_document_id,
      source_table: "notifications",
    },
    status: notification.status,
    retry_count: 0,
    error_message: notification.error_message,
    created_at: notification.created_at,
    processed_at: notification.sent_at,
    sent_at: notification.sent_at,
    source_table: "notifications",
  }));
}

function getNotificationPayloadSummary(event = {}) {
  const payload = getNotificationPayload(event);
  const directText =
    payload.message ||
    payload.memo ||
    payload.note ||
    payload.content ||
    payload.description ||
    payload.title ||
    "";

  if (directText) return String(directText);

  const summaryItems = [
    payload.company_name,
    payload.event_name,
    payload.applicant_name,
    payload.interpreter_name,
    payload.status_label,
    payload.status,
  ].filter(Boolean);

  if (summaryItems.length > 0) return summaryItems.join(" / ");
  if (event.error_message) return event.error_message;

  return "-";
}

function getNotificationEventTypeLabel(eventType) {
  const labels = {
    assignment_created: "배정 완료 알림",
    interpreter_assignment_completed: "배정 완료 알림",
    application_created: "신규 지원 알림",
    interpreter_application_received: "지원 완료 알림",
    new_request: "신규 의뢰 알림",
    admin_new_request: "신규 의뢰 알림",
    admin_new_company: "신규 기업 등록 알림",
    admin_estimate_approved: "견적 승인 완료 알림",
    status_changed: "상태 변경 알림",
    settlement_ready: "정산 대기 알림",
    application_status_changed: "지원 상태 변경 알림",
    settlement_status_changed: "정산 상태 변경 알림",
    interpreter_payout_issued: "정산서 발급 알림",
    interpreter_payout_completed: "정산 완료 알림",
    memo_created: "내부 메모 알림",
    new_interpreter: "신규 통역사 알림",
    request_created_client: "의뢰 접수 완료 알림",
    company_request_received: "의뢰 접수 완료 알림",
    company_estimate_issued: "견적서 발급 알림",
    company_estimate_approved: "견적 승인 완료 알림",
    client_review_started: "의뢰 검토 시작 알림",
    client_estimate_ready: "견적 안내 알림",
    client_recruiting_started: "통역사 모집 시작 알림",
    assignment_confirmed_client: "배정 완료 알림",
    company_assignment_completed: "배정 완료 알림",
    client_work_completed: "업무 완료 알림",
    company_completion_document_issued: "업무확인서 발급 알림",
    company_payment_invoice_sent: "입금 안내 알림",
    company_payment_paid: "입금 확인 알림",
    company_payment_overdue: "연체 안내 알림",
    admin_payment_overdue: "결제 연체 알림",
    client_settlement_ready: "정산/결제 안내 알림",
  };
  return labels[String(eventType || "").trim()] || "운영 알림";
}

function getNotificationChannel(event = {}) {
  return String(event.channel || "email").trim().toLowerCase() || "email";
}

function getNotificationChannelLabel(channel) {
  const labels = {
    email: "이메일",
    kakao: "카카오",
    internal: "내부",
  };
  return labels[String(channel || "email").trim().toLowerCase()] || "이메일";
}


function getNotificationStatusLabel(status) {
  const labels = {
    pending: "발송 대기",
    sending: "발송 중",
    sent: "발송 완료",
    failed: "발송 실패",
  };
  return labels[String(status || "").trim().toLowerCase()] || "상태 확인 필요";
}

function getCompanyPaymentStatusLabel(status) {
  const option = COMPANY_PAYMENT_STATUS_OPTIONS.find(
    (item) => item.value === String(status || "").trim()
  );
  return option?.label || "미입금";
}

function getCompanyPaymentMethodLabel(method) {
  const option = COMPANY_PAYMENT_METHOD_OPTIONS.find(
    (item) => item.value === String(method || "").trim()
  );
  return option?.label || "미입력";
}

function getCompanyPaymentBadgeClass(status) {
  const classes = {
    unpaid: "badge-yellow",
    invoice_sent: "badge-blue",
    paid: "badge-green",
    overdue: "badge-red",
    refunded: "badge-gray",
  };
  return classes[String(status || "").trim()] || "badge-yellow";
}

function getSettlementPayoutStatusLabel(status) {
  return getSettlementStatusLabel(status);
}

function getSettlementPayoutBadgeClass(status) {
  return getSettlementStatusBadgeClass(status);
}

function normalizeSettlementPayoutStatus(status) {
  return normalizeAdminSettlementStatus(status);
}

function findPayoutDocumentForSettlement(documents = [], settlement = {}) {
  if (!settlement) return null;
  return (
    documents.find((document) => document.id === settlement.payout_document_id) ||
    documents.find(
      (document) =>
        document.document_type === "payout" &&
        String(document.settlement_id || "") === String(settlement.id)
    ) ||
    documents.find(
      (document) =>
        document.document_type === "payout" &&
        String(document.request_id || "") === String(settlement.request_id || "") &&
        String(document.interpreter_id || "") === String(settlement.interpreter_id || "")
    ) ||
    null
  );
}

function doesInterpreterSettlementMatchFilters(row = {}, filters = {}) {
  const settlement = row.settlement || {};
  const request = row.request || {};
  const interpreter = row.interpreter || {};
  const search = String(filters.search || "").trim().toLowerCase();

  if (
    filters.status &&
    filters.status !== "all" &&
    normalizeSettlementPayoutStatus(settlement.settlement_status) !== filters.status
  ) {
    return false;
  }

  if (search) {
    const haystack = [
      interpreter.name,
      request.event_name,
      request.title,
      request.request_no,
      settlement.assignment_id,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  const rowStartDate = String(
    request.event_start_date || request.start_date || request.event_date || settlement.created_at || ""
  ).slice(0, 10);
  const rowEndDate = String(
    request.event_end_date || request.end_date || request.event_date || request.event_start_date || request.start_date || ""
  ).slice(0, 10);
  if (filters.startDate && rowEndDate && rowEndDate < filters.startDate) return false;
  if (filters.endDate && rowStartDate && rowStartDate > filters.endDate) return false;
  return true;
}

function doesCompanyPaymentMatchFilters(row, filters = {}) {
  const payment = row.payment || {};
  if (filters.status && filters.status !== "all" && payment.payment_status !== filters.status) {
    return false;
  }

  const search = String(filters.search || "").trim().toLowerCase();
  if (search) {
    const haystack = [
      row.requestNo,
      row.companyName,
      row.eventName,
      payment.admin_memo,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  const compareDate = payment.due_date || payment.created_at;
  if (filters.startDate && compareDate) {
    const value = new Date(`${String(compareDate).slice(0, 10)}T00:00:00`);
    const start = new Date(`${filters.startDate}T00:00:00`);
    if (value < start) return false;
  }
  if (filters.endDate && compareDate) {
    const value = new Date(`${String(compareDate).slice(0, 10)}T00:00:00`);
    const end = new Date(`${filters.endDate}T23:59:59`);
    if (value > end) return false;
  }

  return true;
}

function getNotificationTargetLabel({
  targetType,
  payload = {},
  request,
  interpreter,
  application,
  assignmentRow,
}) {
  if (targetType === "assignment") {
    return assignmentRow?.interpreterName || interpreter?.name || "배정 대상 통역사";
  }
  if (targetType === "application") {
    return application?.applicant_name || payload.applicant_name || "지원자";
  }
  if (targetType === "request") {
    return request?.company_name || payload.company_name || "의뢰 기업";
  }
  if (targetType === "business") {
    return payload.company_name || "등록 기업";
  }
  if (targetType === "document") {
    return payload.company_name || payload.interpreter_name || "문서 대상";
  }
  if (targetType === "payment") {
    return payload.company_name || "결제 대상 기업";
  }
  if (targetType === "interpreter") {
    return interpreter?.name || payload.name || "통역사";
  }
  return "운영 담당자 확인";
}

function getNotificationRelatedLabel({ targetType, request, interpreter, application, assignmentRow }) {
  if (targetType === "assignment") return formatManagementNumber(assignmentRow?.assignmentNo);
  if (targetType === "application") return formatManagementNumber(application?.application_no);
  if (targetType === "request") return formatManagementNumber(request?.request_no || request?.request_number);
  if (targetType === "business") return formatManagementNumber(request?.company_no || "-");
  if (targetType === "document") return "-";
  if (targetType === "payment") return formatManagementNumber(request?.request_no || "-");
  if (targetType === "interpreter") return formatManagementNumber(interpreter?.interpreter_no);
  return "-";
}

function buildProcessingQueueItems({
  newRequests = [],
  pendingResumeReviewInterpreters = [],
  uncheckedApplications = [],
  pendingAssignmentRequests = [],
}) {
  return [
    {
      id: "new-requests",
      label: "신규 의뢰",
      count: newRequests.length,
      description: "접수 확인 및 공고 전환",
      priority: getQueuePriority(newRequests, "new_request"),
      targetSubTab: "new_requests",
    },
    {
      id: "pending-interpreters",
      label: "검증 대기 통역사",
      count: pendingResumeReviewInterpreters.length,
      description: "이력서 검토 및 활동 승인",
      priority: pendingResumeReviewInterpreters.length > 0 ? "today" : "general",
      targetSubTab: "verification_pending",
    },
    {
      id: "unchecked-applications",
      label: "신규 지원자",
      count: uncheckedApplications.length,
      description: "검토중/합격/불합격 처리",
      priority: uncheckedApplications.length > 0 ? "urgent" : "general",
      targetSubTab: "applications",
    },
    {
      id: "pending-assignments",
      label: "배정 대기 의뢰",
      count: pendingAssignmentRequests.length,
      description: "행사일 임박 건 우선 배정",
      priority: getQueuePriority(pendingAssignmentRequests, "assignment"),
      targetSubTab: "assignments",
    },
  ];
}

function buildProcessingTaskItems({
  businesses = [],
  generatedDocuments = [],
  newRequests = [],
  pendingAssignmentRequests = [],
  requests = [],
  settlements = [],
}) {
  const tasks = [];
  const requestMap = new Map(requests.map((request) => [String(request.id), request]));

  businesses
    .filter((business) => isBusinessApprovalPending(business))
    .slice(0, 5)
    .forEach((business) => {
      tasks.push({
        id: `business-${business.id}`,
        category: "기업",
        title: business.company_name || business.name || "신규 기업",
        description: "신규 기업 승인 요청",
        date: business.created_at,
        targetSubTab: "all_businesses",
      });
    });

  newRequests.slice(0, 5).forEach((request) => {
    tasks.push({
      id: `new-request-${request.id}`,
      category: "의뢰",
      title: request.event_name || request.title || "신규 의뢰",
      description: "신규 의뢰 확인 필요",
      date: request.created_at || request.start_date || request.event_date,
      targetSubTab: "new_requests",
    });
  });

  requests
    .filter((request) => isEstimateCreationNeeded(request, generatedDocuments))
    .slice(0, 5)
    .forEach((request) => {
      tasks.push({
        id: `estimate-${request.id}`,
        category: "견적",
        title: request.event_name || request.title || "견적 필요 의뢰",
        description: "견적 생성 필요",
        date: request.created_at || request.start_date || request.event_date,
        targetSubTab: "estimate_documents",
      });
    });

  pendingAssignmentRequests.slice(0, 5).forEach((request) => {
    tasks.push({
      id: `assignment-${request.id}`,
      category: "배정",
      title: request.event_name || request.title || "배정 필요 의뢰",
      description: "견적 승인 완료 또는 일정 임박, 통역사 배정 필요",
      date: request.start_date || request.event_date || request.created_at,
      targetSubTab: "assignments",
    });
  });

  requests
    .filter((request) => isWorkCompletionCheckNeeded(request))
    .slice(0, 5)
    .forEach((request) => {
      tasks.push({
        id: `completion-${request.id}`,
        category: "의뢰",
        title: request.event_name || request.title || "완료 확인 필요",
        description: "업무 완료 확인 필요",
        date: request.end_date || request.event_date || request.start_date,
        targetSubTab: "all_requests",
      });
    });

  settlements
    .filter((settlement) => normalizeSettlementPayoutStatus(settlement.settlement_status || settlement.payout_status) === "settlement_waiting")
    .slice(0, 5)
    .forEach((settlement) => {
      const request = requestMap.get(String(settlement.request_id)) || {};
      tasks.push({
        id: `settlement-${settlement.id}`,
        category: "정산",
        title: request.event_name || request.title || `정산 ${formatManagementNumber(settlement.request_id)}`,
        description: settlement.payout_document_id ? "지급 대기" : "정산서 생성 필요",
        date: settlement.created_at,
        targetSubTab: settlement.payout_document_id ? "settlement_waiting" : "payout_documents",
      });
    });

  return tasks
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 12);
}

function buildRevenueSummary({ settlementRowsByScope = {} } = {}) {
  const pendingRows = settlementRowsByScope.pending || [];
  const confirmedRows = settlementRowsByScope.confirmed || [];
  const payingRows = settlementRowsByScope.paying || [];
  const completedRows = settlementRowsByScope.completed || [];
  const summaryRows = [...pendingRows, ...confirmedRows, ...payingRows, ...completedRows];

  const companyAmount = summaryRows.reduce(
    (sum, request) => sum + normalizeMoneyInput(request.company_invoice_amount ?? getCompanyAmount(request)),
    0
  );
  const interpreterAmount = summaryRows.reduce(
    (sum, request) =>
      sum +
      normalizeMoneyInput(
        request.interpreter_total_amount ?? getInterpreterPaymentForSummary(request)
      ),
    0
  );

  return {
    companyAmount,
    interpreterAmount,
    profit: companyAmount - interpreterAmount,
  };
}

function isSettlementPaid(request = {}) {
  const settlement = request._settlement || {};
  return (
    normalizeSettlementPayoutStatus(settlement.settlement_status) === "settlement_completed" ||
    Boolean(settlement.paid_at || request.paid_at || request.settlement_completed_at)
  );
}

function buildRecentActivityItems({
  adminActivityLogs = [],
  generatedDocuments = [],
  notificationEvents = [],
  payments = [],
  settlements = [],
} = {}) {
  return [
    ...adminActivityLogs.map((log) => ({
      id: `log-${log.id}`,
      description: getActivityDescription(log.action_type),
      actorLabel: getAdminLogActorLabel(log) || "관리자",
      created_at: log.created_at,
      targetSubTab: getActivityTargetSubTab(log.target_type),
    })),
    ...generatedDocuments.map((document) => ({
      id: `doc-${document.id}`,
      description: `${getDocumentTypeLabel(document.document_type)} 생성`,
      actorLabel: "시스템",
      created_at: document.created_at,
      targetSubTab: "all_documents",
    })),
    ...payments
      .filter((payment) => payment.payment_status === "paid")
      .map((payment) => ({
        id: `payment-${payment.id}`,
        description: "기업 입금 확인",
        actorLabel: "관리자",
        created_at: payment.updated_at || payment.paid_at || payment.created_at,
        targetSubTab: "company_payments",
      })),
    ...settlements
      .filter((settlement) => normalizeSettlementPayoutStatus(settlement.settlement_status || settlement.payout_status) === "settlement_completed")
      .map((settlement) => ({
        id: `settlement-${settlement.id}`,
        description: "정산 완료",
        actorLabel: "관리자",
        created_at: settlement.updated_at || settlement.paid_at || settlement.created_at,
        targetSubTab: "settlement_completed",
      })),
    ...notificationEvents
      .filter((event) => event.status === "failed")
      .map((event) => ({
        id: `notification-${event.id}`,
        description: "알림 발송 실패",
        actorLabel: "시스템",
        created_at: event.created_at,
        targetSubTab: "notification_history",
      })),
  ]
    .filter((item) => item.created_at)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10);
}

function getActivityTargetSubTab(targetType) {
  const normalized = normalizeAdminTargetType(targetType);
  if (normalized === "request") return "all_requests";
  if (normalized === "interpreter") return "registered_interpreters";
  if (normalized === "application") return "applications";
  if (normalized === "assignment") return "assignments";
  if (normalized === "business") return "all_businesses";
  return null;
}

function getActivityDescription(actionType) {
  const labels = {
    admin_note_created: "관리자 메모 추가",
    request_updated: "의뢰 정보 변경",
    settlement_updated: "정산 수정",
    assignment_created: "통역사 배정",
    business_updated: "기업 정보 변경",
  };
  return labels[actionType] || "운영 정보 변경";
}

function isBusinessApprovalPending(business = {}) {
  const status = String(
    business.status || business.approval_status || business.review_status || ""
  )
    .trim()
    .toLowerCase();
  return (
    business.approved === false ||
    ["pending", "approval_pending", "review_pending", "unconfirmed", "미확인", "승인대기"].includes(status)
  );
}

function isEstimateCreationNeeded(request = {}, documents = []) {
  const estimateStatus = String(request.estimate_status || "").trim().toLowerCase();
  const hasEstimate = documents.some(
    (document) =>
      document.document_type === "estimate" &&
      String(document.request_id || "") === String(request.id || "")
  );
  return !hasEstimate && ["estimate_required", "estimate_preparing", "pending", ""].includes(estimateStatus);
}

function isWorkCompletionCheckNeeded(request = {}) {
  const end = getDateRangeEnd(request.end_date || request.event_date, request.start_date);
  if (!end) return false;
  const today = new Date().toISOString().slice(0, 10);
  return end < today && normalizeOperationStatus(request) !== OPERATION_STATUS.COMPLETED;
}

function getQueuePriority(items = [], type) {
  if (items.length === 0) return "general";
  if (type === "new_request") {
    return items.some((item) => isOlderThanHours(item.created_at, 24)) ? "urgent" : "today";
  }
  if (type === "assignment") {
    return items.some((item) => isRequestWithinDays(item, 3)) ? "urgent" : "today";
  }
  return "today";
}

function getQueuePriorityLabel(priority) {
  if (priority === "urgent") return "긴급";
  if (priority === "today") return "오늘 처리";
  return "일반";
}

function isOlderThanHours(value, hours) {
  const createdAt = value ? new Date(value) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
  return Date.now() - createdAt.getTime() >= hours * 60 * 60 * 1000;
}

function parseRequestDateOnly(value) {
  if (!value) return null;
  const text = String(value).trim();
  const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function adminDateFromISO(value) {
  const isoDate = normalizeDateToISO(value);
  if (!isoDate) return undefined;

  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function adminISOFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDateInRange(date, startDate, endDate, fallbackDate) {
  const start = startDate || fallbackDate;
  const end = endDate || fallbackDate;
  if (!start) return false;
  if (!end) return date === start;
  return start <= date && date <= end;
}

function getRequestPrimaryDate(request = {}) {
  return normalizeDateToISO(
    request.start_date ||
      request.event_start_date ||
      request.work_date ||
      request.date ||
      request.event_date
  );
}

function getAssignmentScheduleRange(request = {}, job = {}) {
  const range = getScheduleRange(request, job);
  return {
    startDate: normalizeScheduleDate(range.startDate),
    endDate: normalizeScheduleDate(range.endDate || range.startDate),
  };
}

function hasInterpreterScheduleConflict(getInterpreterScheduleConflicts, interpreterId, range) {
  if (!getInterpreterScheduleConflicts || !interpreterId || !range?.startDate) return false;
  return getInterpreterScheduleConflicts(interpreterId, range).length > 0;
}

function getInterpreterScheduleConflictsForSource(
  getInterpreterScheduleConflicts,
  interpreterId,
  range,
  source = {}
) {
  if (!getInterpreterScheduleConflicts || !interpreterId || !range?.startDate) return [];
  return getInterpreterScheduleConflicts(interpreterId, range).filter((matching) => {
    if (source.id && String(matching.request_id) === String(source.id)) return false;
    if (source.job_id && String(matching.job_id) === String(source.job_id)) return false;
    if (source.id && String(matching.job_id) === String(source.id)) return false;
    return true;
  });
}

function hasApplicationScheduleConflict(
  application = {},
  scheduleSource = {},
  getInterpreterScheduleConflicts
) {
  if (!application?.interpreter_id || !getInterpreterScheduleConflicts) return false;
  const range = getAssignmentScheduleRange(scheduleSource);
  return getInterpreterScheduleConflictsForSource(
    getInterpreterScheduleConflicts,
    application.interpreter_id,
    range,
    scheduleSource
  ).length > 0;
}

function buildScheduleConflictMessage(conflicts = [], target = {}, interpreter = {}) {
  const conflictText = conflicts.map(formatScheduleConflictLine).join("\n");
  const targetDate = formatDateRange(
    target?.start_date,
    target?.end_date,
    target?.event_date || target?.date
  );

  return [
    "해당 통역사는 이미 같은 기간에 배정된 일정이 있습니다.",
    interpreter?.name ? `선택 통역사: ${interpreter.name}` : "",
    `신규 일정: ${targetDate}`,
    `기존 일정: ${conflictText}`,
    "그래도 배정하시겠습니까?",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatScheduleConflictLine(conflict = {}) {
  const title = getConflictEventTitle(conflict);
  const date = formatDateRange(conflict.start_date, conflict.end_date, conflict.start_date);
  const location = conflict.jobs?.location || conflict.location || "장소 미입력";
  return `${title} / ${date} / ${location}`;
}

function getConflictEventTitle(conflict = {}) {
  return (
    conflict.jobs?.title ||
    conflict.jobs?.company_name ||
    conflict.title ||
    conflict.event_name ||
    "행사명 미입력"
  );
}

function isRequestWithinDays(request, days) {
  const dDay = getRequestDday(request);
  return dDay !== null && dDay >= 0 && dDay <= days;
}

function getRequestDday(request = {}) {
  const date = getRequestPrimaryDate(request);
  if (!date) {
    console.warn("urgent request skipped: invalid start date", request);
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  target.setHours(0, 0, 0, 0);
  if (Number.isNaN(target.getTime())) {
    console.warn("urgent request skipped: invalid start date", request);
    return null;
  }
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function getDdayLabel(request = {}) {
  const dDay = getRequestDday(request);
  if (dDay === null) return "D-?";
  if (dDay === 0) return "D-DAY";
  if (dDay > 0) return `D-${dDay}`;
  return `D+${Math.abs(dDay)}`;
}

function isUrgentOperationRequest(request = {}) {
  const statuses = getOperationFlowStatuses(request);
  const finishedStatuses = new Set([
    "completed",
    "settled",
    "cancelled",
    "closed",
    "deleted",
    "업무완료",
    "운영완료",
    "정산완료",
    "취소",
    "마감",
  ]);
  const statusValues = [
    request.status,
    request.matching_status,
    request.operation_status,
    request.settlement_status,
    statuses.operation_status,
    statuses.settlement_status,
  ].map((status) => String(status || "").trim().toLowerCase());
  const isFinished = statusValues.some((status) => finishedStatuses.has(status));

  return !isFinished && isRequestWithinDays(request, 7);
}

function buildOperationDashboard(
  requests = [],
  assignmentsByRequest = new Map(),
  interpreters = []
) {
  const today = new Date().toISOString().slice(0, 10);
  const nextWeekDate = new Date();
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);
  const nextWeek = nextWeekDate.toISOString().slice(0, 10);

  const todayItems = requests
    .filter(
      (request) =>
        !isDashboardExcludedRequest(request) &&
        isDateInRange(today, request.start_date, request.end_date, request.event_date)
    )
    .map((request) => {
      const operationStatus = normalizeOperationStatus(request);
      const startDate = getDateRangeStart(request.start_date, request.event_date);
      const statusLabel =
        operationStatus === OPERATION_STATUS.IN_PROGRESS
          ? "운영중"
          : startDate === today
            ? "오늘 시작"
            : "운영예정";
      const badgeClass =
        operationStatus === OPERATION_STATUS.IN_PROGRESS
          ? getOperationFlowBadgeClass("operation", OPERATION_STATUS.IN_PROGRESS)
          : getOperationFlowBadgeClass("operation", OPERATION_STATUS.BEFORE_OPERATION);

      return {
        request,
        statusLabel,
        badgeClass,
        timeLabel: request.work_hours || formatDateRange(request.start_date, request.end_date, request.event_date),
        interpreters: getAssignedInterpreterName(
          request,
          assignmentsByRequest.get(request.id) || [],
          interpreters
        ),
      };
    });

  const weekItems = requests
    .filter((request) => {
      if (isDashboardExcludedRequest(request)) return false;
      const startDate = getDateRangeStart(request.start_date || request.event_date, request.date);
      if (!startDate) return false;
      return startDate >= today && startDate <= nextWeek;
    })
    .sort(
      (a, b) =>
        String(getDateRangeStart(a.start_date || a.event_date, a.date)).localeCompare(
          String(getDateRangeStart(b.start_date || b.event_date, b.date))
        )
    )
    .map((request) => ({
      request,
      interpreters: getAssignedInterpreterName(
        request,
        assignmentsByRequest.get(request.id) || [],
        interpreters
      ),
    }));

  const urgentItems = requests
    .map((request) => {
      const isUnassigned =
        normalizeAssignmentStatus(request) !== ASSIGNMENT_STATUS.ASSIGNED;
      const reason = isUnassigned ? "통역사 미배정" : "일정 확인";

      return {
        request,
        reason,
        priority: getRequestDday(request) ?? 99,
        dDayLabel: getDdayLabel(request),
        dateLabel: formatDateRange(request.start_date, request.end_date, request.event_date),
        interpreters: getAssignedInterpreterName(
          request,
          assignmentsByRequest.get(request.id) || [],
          interpreters
        ),
        visible: isUrgentOperationRequest(request),
      };
    })
    .filter((item) => item.visible)
    .sort((a, b) => a.priority - b.priority);

  return { todayItems, urgentItems, weekItems };
}

function isDashboardExcludedRequest(request = {}) {
  const statusText = [
    request.status,
    request.matching_status,
    request.operation_status,
    request.settlement_status,
    request.request_status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    normalizeOperationStatus(request) === OPERATION_STATUS.COMPLETED ||
    statusText.includes("cancel") ||
    statusText.includes("취소") ||
    statusText.includes("cancelled") ||
    statusText.includes("canceled")
  );
}

function getAssignedInterpreterName(request = {}, assignments = [], interpreters = []) {
  const assignedNames = getAssignedInterpreterNames(request, assignments, interpreters);
  if (assignedNames.length > 0) return assignedNames.join(", ");

  const storedName =
    request.assigned_interpreter_name || request.matched_interpreter_name || "";
  if (storedName) return storedName;

  const assignedId = request.assigned_interpreter_id || request.matched_interpreter_id;
  if (assignedId) {
    const interpreter = interpreters.find(
      (item) => Number(item.id) === Number(assignedId)
    );
    if (interpreter?.name) return interpreter.name;
  }

  const assignment = assignments.find(Boolean);
  return getAssignmentInterpreterName(assignment, interpreters) || "";
}

function getAssignedInterpreterNames(request = {}, assignments = [], interpreters = []) {
  const assignedInterpreterMap = new Map();
  assignments.forEach((assignment, index) => {
    const interpreter = getAssignmentInterpreter(assignment, interpreters);
    const interpreterId =
      assignment?.interpreter_id ||
      assignment?.assigned_interpreter_id ||
      assignment?.matched_interpreter_id ||
      interpreter?.id;
    const name = getAssignmentInterpreterName(assignment, interpreters);
    if (!name) return;
    assignedInterpreterMap.set(
      interpreterId ? String(interpreterId) : `name:${name}:${index}`,
      name
    );
  });
  const names = Array.from(assignedInterpreterMap.values());

  if (names.length > 0) return Array.from(new Set(names));

  return [
    request.assigned_interpreter_name,
    request.matched_interpreter_name,
    request.assigned_interpreter,
    request.interpreter_name,
  ].filter(Boolean);
}

function getAssignmentInterpreterName(assignment = {}, interpreters = []) {
  const nestedInterpreter =
    assignment?.interpreter ||
    assignment?.assigned_interpreter ||
    assignment?.interpreter_profile ||
    assignment?.profile;

  if (nestedInterpreter?.name) return nestedInterpreter.name;

  const directName =
    assignment?.interpreter_name ||
    assignment?.assigned_interpreter_name ||
    assignment?.matched_interpreter_name ||
    assignment?.name;
  if (directName) return directName;

  const interpreterId =
    assignment?.interpreter_id ||
    assignment?.assigned_interpreter_id ||
    assignment?.matched_interpreter_id;
  if (!interpreterId) return "";

  const interpreter = interpreters.find(
    (item) => String(item.id) === String(interpreterId)
  );
  return interpreter?.name || "";
}

function getAdminDocumentRequest(document = {}, requestMap = new Map()) {
  return document.request_id ? requestMap.get(String(document.request_id)) || null : null;
}

function getAdminDocumentInterpreter(document = {}, interpreterMap = new Map()) {
  return document.interpreter_id
    ? interpreterMap.get(String(document.interpreter_id)) || null
    : null;
}

function getAdminDocumentEventName(document = {}, request = null) {
  const metadata = document.metadata || {};
  return (
    metadata.eventName ||
    metadata.event_name ||
    request?.event_name ||
    request?.title ||
    document.title ||
    "-"
  );
}

function getAdminDocumentCompanyName(document = {}, request = null) {
  const metadata = document.metadata || {};
  return metadata.companyName || metadata.company_name || request?.company_name || "-";
}

function getAdminDocumentInterpreterName(document = {}, interpreter = null) {
  const metadata = document.metadata || {};
  return (
    metadata.interpreterName ||
    metadata.interpreter_name ||
    metadata.interpreters ||
    interpreter?.name ||
    "-"
  );
}

function getAdminDocumentStatusLabel(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "draft") return "임시저장";
  if (normalized === "issued") return "발급완료";
  if (normalized === "voided") return "폐기";
  return status || "-";
}

function doesAdminDocumentMatchFilters(document, filters, requestMap, interpreterMap) {
  if (filters.documentType !== "all" && document.document_type !== filters.documentType) {
    return false;
  }
  if (filters.status !== "all" && document.status !== filters.status) return false;

  const createdDate = String(document.created_at || "").slice(0, 10);
  if (filters.startDate && createdDate < filters.startDate) return false;
  if (filters.endDate && createdDate > filters.endDate) return false;

  const request = getAdminDocumentRequest(document, requestMap);
  const interpreter = getAdminDocumentInterpreter(document, interpreterMap);
  const search = String(filters.search || "").trim().toLowerCase();
  if (!search) return true;

  return [
    document.document_no,
    getAdminDocumentCompanyName(document, request),
    getAdminDocumentInterpreterName(document, interpreter),
    getAdminDocumentEventName(document, request),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(search);
}

function buildApplicationAssignmentRows(applications = [], assignments = [], interpreters = []) {
  const safeApplications = compactAdminRows(applications);
  const safeAssignments = compactAdminRows(assignments);
  const safeInterpreters = compactAdminRows(interpreters);
  const usedApplicationIds = new Set();
  const assignmentRows = [];

  safeAssignments.forEach((assignment) => {
    const interpreter = getAssignmentInterpreter(assignment, safeInterpreters);
    const matchedApplication = interpreter
      ? safeApplications.find(
          (application) =>
            !usedApplicationIds.has(application.id) &&
            applicationMatchesInterpreter(application, interpreter)
        )
      : null;

    if (matchedApplication) {
      usedApplicationIds.add(matchedApplication.id);
      assignmentRows.push({
        ...matchedApplication,
        rowId: `application-${matchedApplication.id}`,
        assigned: true,
        assignment,
        source: "application",
      });
      return;
    }

    assignmentRows.push({
      id: `assignment-${assignment.id}`,
      rowId: `assignment-${assignment.id}`,
      interpreter_id: assignment.interpreter_id,
      applicant_name: interpreter?.name || assignment.interpreter?.name || "이름 미입력",
      phone: interpreter?.phone || "",
      email: interpreter?.email || "",
      gender: interpreter?.gender || "",
      language: interpreter?.language_level || interpreter?.jlpt || interpreter?.level || "",
      experience: getExperienceLabel(interpreter || {}),
      message: "관리자가 직접 배정한 통역사입니다.",
      status: MATCHING_STATUS.ASSIGNED,
      created_at: assignment.assigned_at,
      assigned: true,
      assignment,
      source: "direct-assignment",
    });
  });

  const applicationRows = safeApplications
    .filter((application) => !usedApplicationIds.has(application.id))
    .map((application) => ({
      ...application,
      rowId: `application-${application.id}`,
      assigned: false,
      source: "application",
    }));

  return [...assignmentRows, ...applicationRows].sort(sortApplicationRows);
}

function sortApplicationRows(a, b) {
  const priority = {
    [MATCHING_STATUS.ASSIGNED]: 0,
    [APPLICATION_STATUS.ACCEPTED]: 0,
    [APPLICATION_STATUS.REVIEWING]: 2,
    [APPLICATION_STATUS.PENDING]: 1,
    [APPLICATION_STATUS.REJECTED]: 3,
    [APPLICATION_STATUS.CANCELLED]: 4,
  };
  const aStatus = a.assigned
    ? MATCHING_STATUS.ASSIGNED
    : normalizeApplicationStatus(a.status);
  const bStatus = b.assigned
    ? MATCHING_STATUS.ASSIGNED
    : normalizeApplicationStatus(b.status);
  const statusDiff = (priority[aStatus] ?? 1) - (priority[bStatus] ?? 1);
  if (statusDiff !== 0) return statusDiff;
  return String(b.created_at || "").localeCompare(String(a.created_at || ""));
}

function findInterpreterForApplication(application = {}, interpreters = []) {
  return interpreters.find((interpreter) =>
    applicationMatchesInterpreter(application, interpreter)
  );
}

function findApplicationForInterpreter(applications = [], interpreter = {}) {
  return applications.find((application) =>
    applicationMatchesInterpreter(application, interpreter)
  );
}

function applicationMatchesInterpreter(application = {}, interpreter = {}) {
  if (!application || !interpreter) return false;
  if (
    application.interpreter_id &&
    Number(application.interpreter_id) === Number(interpreter.id)
  ) {
    return true;
  }

  const appEmail = normalizeText(application.email);
  const appPhone = normalizePhone(application.phone || application.applicant_contact);
  const appName = normalizeText(application.applicant_name || application.name);
  const interpreterEmail = normalizeText(interpreter.email);
  const interpreterPhone = normalizePhone(interpreter.phone);
  const interpreterName = normalizeText(interpreter.name);

  return Boolean(
    (appEmail && interpreterEmail && appEmail === interpreterEmail) ||
      (appPhone && interpreterPhone && appPhone === interpreterPhone) ||
      (appName && interpreterName && appName === interpreterName)
  );
}

function getAssignmentInterpreter(assignment = {}, interpreters = []) {
  return (
    assignment.interpreter ||
    interpreters.find((interpreter) => Number(interpreter.id) === Number(assignment.interpreter_id)) ||
    null
  );
}

function getInterpreterSelectLabel(interpreter = {}) {
  return [
    interpreter.name || "이름 미입력",
    getInterpreterRegionLabel(interpreter),
    normalizeLevel(interpreter.level || "Lv 미정"),
    getInterpreterFieldLabel(interpreter),
  ]
    .filter(Boolean)
    .join(" / ");
}

function getAssignedInterpreterLabel(interpreter = {}) {
  return [
    interpreter?.name || "이름 미입력",
    normalizeLevel(interpreter?.level || "Lv 미정"),
    getInterpreterFieldLabel(interpreter),
  ]
    .filter(Boolean)
    .join(" / ");
}

function getInterpreterRegionLabel(interpreter = {}) {
  return (
    formatList(
      interpreter.available_regions ||
        interpreter.available_region ||
        interpreter.available_area
    ) ||
    interpreter.region ||
    interpreter.location ||
    "활동지역 미입력"
  );
}

function getInterpreterFieldLabel(interpreter = {}) {
  return (
    formatList(interpreter.specialties || interpreter.specialty) ||
    formatList(interpreter.available_tasks) ||
    interpreter.interpretation_field ||
    interpreter.category ||
    "분야 미입력"
  );
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function getRequestRequiredCount(request = {}) {
  return getPositiveInteger(
    request.requested_people_count || request.required_count || request.people_count,
    1
  );
}

function buildAssignmentRequestChanges(assignments = [], requiredCount = 1) {
  const primaryAssignment = assignments[assignments.length - 1] || null;
  const interpreterId = primaryAssignment?.interpreter_id || null;
  const interpreterName = primaryAssignment?.interpreter?.name || null;
  const hasAssignments = assignments.length > 0;
  const isFullyAssigned = hasAssignments && assignments.length >= requiredCount;

  return {
    status: hasAssignments ? MATCHING_STATUS.ASSIGNED : MATCHING_STATUS.DRAFT,
    matching_status: hasAssignments ? MATCHING_STATUS.ASSIGNED : MATCHING_STATUS.DRAFT,
    assignment_status: hasAssignments
      ? (isFullyAssigned ? ASSIGNMENT_STATUS.ASSIGNED : ASSIGNMENT_STATUS.ASSIGNING)
      : ASSIGNMENT_STATUS.WAITING,
    assigned_interpreter_id: interpreterId,
    assigned_interpreter_name: interpreterName,
    matched_interpreter_id: interpreterId,
    matched_interpreter_name: interpreterName,
  };
}

function upsertAssignment(items, nextAssignment) {
  if (!nextAssignment?.id) return items;
  const exists = items.some((item) => item.id === nextAssignment.id);
  if (exists) {
    return uniqueRequestInterpreterAssignments(
      items.map((item) =>
        item.id === nextAssignment.id ? { ...item, ...nextAssignment } : item
      )
    );
  }
  return uniqueRequestInterpreterAssignments([nextAssignment, ...items]);
}

function uniqueRequestInterpreterAssignments(items = []) {
  const assignmentsByPair = new Map();

  items.filter(Boolean).forEach((assignment, index) => {
    const requestId = assignment.request_id;
    const interpreterId = assignment.interpreter_id;
    const key =
      requestId && interpreterId
        ? `${requestId}:${interpreterId}`
        : `assignment:${assignment.id || index}`;
    const existing = assignmentsByPair.get(key);
    if (!existing) {
      assignmentsByPair.set(key, assignment);
      return;
    }

    assignmentsByPair.set(key, pickLatestAssignment(existing, assignment));
  });

  return Array.from(assignmentsByPair.values());
}

function pickLatestAssignment(current = {}, incoming = {}) {
  const currentId = Number(current.id);
  const incomingId = Number(incoming.id);
  const incomingIsNewerId =
    Number.isFinite(incomingId) &&
    (!Number.isFinite(currentId) || incomingId > currentId);
  const currentAssignedAt = current.assigned_at ? new Date(current.assigned_at).getTime() : 0;
  const incomingAssignedAt = incoming.assigned_at ? new Date(incoming.assigned_at).getTime() : 0;
  const incomingIsNewerDate = incomingAssignedAt > currentAssignedAt;
  const newer = incomingIsNewerId || incomingIsNewerDate ? incoming : current;
  const older = newer === incoming ? current : incoming;

  return {
    ...older,
    ...newer,
    interpreter: newer.interpreter || older.interpreter,
  };
}

function normalizeMoneyInput(value) {
  const numericValue = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numericValue) ? numericValue : 0;
}

const SETTLEMENT_LEVEL_DEFAULTS = {
  LV1: { company_amount: 220000, interpreter_payment: 180000 },
  LV2: { company_amount: 245000, interpreter_payment: 200000 },
  LV3: { company_amount: 280000, interpreter_payment: 230000 },
  LV4: { company_amount: 300000, interpreter_payment: 245000 },
};

const SETTLEMENT_LEVEL_OPTIONS = Object.keys(SETTLEMENT_LEVEL_DEFAULTS).map((level) => ({
  label: level,
  value: level,
}));

function getSettlementLevel(request = {}) {
  const level = String(request.settlement_level || request.requested_level || request.required_level || "")
    .trim()
    .toUpperCase()
    .replace(/^LV\s*/, "LV");
  return Object.prototype.hasOwnProperty.call(SETTLEMENT_LEVEL_DEFAULTS, level)
    ? level
    : "";
}

function getSettlementWorkDays(request = {}) {
  const savedDays = Number(request.settlement_work_days);
  if (Number.isFinite(savedDays) && savedDays > 0) return Math.max(1, Math.round(savedDays));

  const start = getDateRangeStart(request.start_date || request.event_date, request.date);
  const end = getDateRangeEnd(request.end_date || request.event_date, request.date);
  const startDate = start ? new Date(`${start}T00:00:00`) : null;
  const endDate = end ? new Date(`${end}T00:00:00`) : startDate;

  if (!startDate || Number.isNaN(startDate.getTime())) return 1;
  if (!endDate || Number.isNaN(endDate.getTime())) return 1;

  const diffDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  return Math.max(1, diffDays);
}

function calculateSettlementAmounts(request = {}) {
  const level = getSettlementLevel(request) || "LV1";
  const workDays = getSettlementWorkDays({ ...request, settlement_level: level });
  const extraAmount = normalizeMoneyInput(request.settlement_extra_amount);
  const deductionAmount = normalizeMoneyInput(request.settlement_deduction_amount);
  const baseAmount = SETTLEMENT_LEVEL_DEFAULTS[level].interpreter_payment * workDays;
  const getManualAmount = (...values) => {
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return normalizeMoneyInput(value);
      }
    }
    return null;
  };
  const manualAmount = getManualAmount(
    request.settlement_final_amount,
    request.interpreter_payment,
    request.interpreter_price
  );
  const finalAmount = manualAmount ?? Math.max(0, baseAmount + extraAmount - deductionAmount);

  return {
    settlement_work_days: workDays,
    settlement_level: level,
    settlement_base_amount: baseAmount,
    settlement_extra_amount: extraAmount,
    settlement_deduction_amount: deductionAmount,
    settlement_final_amount: finalAmount,
    interpreter_payment: finalAmount,
    interpreter_price: finalAmount,
  };
}

function getSettlementSavePayload(request = {}) {
  const calculated = calculateSettlementAmounts(request);
  const companyAmount = getCompanyAmount(request);
  const finalAmount = calculated.settlement_final_amount;
  return {
    ...calculated,
    company_fee: companyAmount,
    company_amount: companyAmount,
    client_price: companyAmount,
    interpreter_fee: finalAmount,
    platform_profit: companyAmount - finalAmount,
    profit: companyAmount - finalAmount,
    settlement_memo: request.settlement_memo || "",
    settlement_status: normalizeAdminSettlementStatus(
      request._settlement?.settlement_status || request.settlement_status
    ),
    payment_status: request.payment_status || "unpaid",
  };
}

function mapSettlementFlowStatusToPayoutStatus(status) {
  const standard = normalizeAdminSettlementStatus(status);
  if (standard === "settlement_confirmed") return "confirmed";
  if (standard === "settlement_paying") return "confirmed";
  if (standard === "settlement_completed") return "paid";
  const normalized = normalizeSettlementFlowStatus({ settlement_status: status });
  if (normalized === SETTLEMENT_FLOW_STATUS.CONFIRMED) return "confirmed";
  if (normalized === SETTLEMENT_FLOW_STATUS.COMPLETED) return "paid";
  if (normalized === SETTLEMENT_FLOW_STATUS.ON_HOLD) return "withheld";
  return "pending";
}

function mapAdminSettlementStatusToPayoutStatus(status) {
  const normalized = normalizeAdminSettlementStatus(status);
  if (normalized === "settlement_completed") return "paid";
  if (normalized === "settlement_confirmed" || normalized === "settlement_paying") return "confirmed";
  return "pending";
}

function mapAdminSettlementStatusToDbStatus(status) {
  const normalized = normalizeAdminSettlementStatus(status);
  if (normalized === "settlement_completed") return "settlement_completed";
  if (normalized === "settlement_paying") return "settlement_paying";
  if (normalized === "settlement_confirmed") return "settlement_confirmed";
  return "settlement_waiting";
}

function loadAdminRequestRows(args = {}) {
  return buildSettlementManagementRows(args);
}

function buildSettlementManagementRows({ requests = [], assignments = [], interpreters = [], settlements = [] } = {}) {
  const safeRequests = compactAdminRows(requests);
  const safeAssignments = compactAdminRows(assignments);
  const settlementRows = compactAdminRows(settlements);
  const requestById = new Map(safeRequests.map((request) => [String(request.id), request]));
  const interpreterById = new Map(compactAdminRows(interpreters).map((interpreter) => [String(interpreter.id), interpreter]));
  const settlementByAssignment = settlementRows.reduce((map, settlement) => {
    const assignmentKey = String(settlement.assignment_id || "");
    const requestId = String(settlement.request_id || "");
    const interpreterId = String(settlement.interpreter_id || "");
    const keys = [
      assignmentKey,
      requestId && interpreterId ? `${requestId}:${interpreterId}` : "",
      requestId,
    ].filter(Boolean);
    keys.forEach((key) => {
      const current = map.get(key);
      if (!current || getSettlementRowSortTime(settlement) > getSettlementRowSortTime(current)) {
        map.set(key, settlement);
      }
    });
    return map;
  }, new Map());
  const assignmentRows = safeAssignments
    .filter((assignment) => assignment.request_id && assignment.interpreter_id)
    .map((assignment) => {
      const request = requestById.get(String(assignment.request_id)) || {};
      const interpreter = interpreterById.get(String(assignment.interpreter_id)) || {};
      return {
        ...request,
        id: assignment.request_id,
        request_id: assignment.request_id,
        _row_key: `assignment-${assignment.id || `${assignment.request_id}-${assignment.interpreter_id}`}`,
        _assignment: assignment,
        _assignment_id: assignment.id,
        _settlement_source: "request_interpreters",
        assigned_interpreter_id: assignment.interpreter_id,
        matched_interpreter_id: assignment.interpreter_id,
        assigned_interpreter_name: interpreter.name || request.assigned_interpreter_name || request.matched_interpreter_name,
        matched_interpreter_name: interpreter.name || request.matched_interpreter_name || request.assigned_interpreter_name,
      };
    });
  const fallbackRequestRows = safeRequests
    .filter((request) => request.assigned_interpreter_id || request.matched_interpreter_id)
    .map((request) => ({
      ...request,
      _row_key: `request-${request.id}`,
      _settlement_source: "request",
    }));
  const baseRows = uniqueSettlementBaseRows([...assignmentRows, ...fallbackRequestRows]);
  const rows = baseRows.map((row) => {
    const requestId = String(row.id || row.request_id || "");
    const interpreterId = String(row.assigned_interpreter_id || row.matched_interpreter_id || "");
    const assignmentKey = row._assignment_id ? `request_interpreters:${row._assignment_id}` : "";
    const settlement =
      settlementByAssignment.get(assignmentKey) ||
      settlementByAssignment.get(`${requestId}:${interpreterId}`) ||
      settlementByAssignment.get(requestId);
    const baseRow = settlement
      ? (() => {
          const amount = normalizeMoneyInput(
            settlement.amount ??
              row.settlement_final_amount ??
              row.interpreter_payment ??
              row.interpreter_price ??
              0
          );
          const workDays = Math.max(1, Number(settlement.work_days ?? row.settlement_work_days ?? 1));
          const dailyRate = normalizeMoneyInput(
            settlement.daily_rate ?? row.daily_rate ?? (workDays > 0 ? amount / workDays : amount)
          );
          const companyAmount = getCompanyAmount(row);
          return {
            ...row,
            _settlement_id: settlement.id,
            _settlement: settlement,
            request_id: row.id || row.request_id,
            request_code: row.request_code || row.request_no || row.management_no || "",
            request_title: row.event_name || row.title || "",
            job_id: row.job_id || null,
            company_id: row.company_id || null,
            assignment_id: settlement.assignment_id || row._assignment_id || null,
            interpreter_id: settlement.interpreter_id || row.assigned_interpreter_id || row.matched_interpreter_id || null,
            interpreter_name: row.assigned_interpreter_name || row.matched_interpreter_name || "",
            settlement_id: settlement.id,
            payout_status: settlement.settlement_status,
            paid_at: settlement.paid_at || row.paid_at,
            interpreter_payment_started_at: settlement.interpreter_payment_started_at || row.interpreter_payment_started_at,
            settlement_confirmed_at: settlement.settlement_confirmed_at || row.settlement_confirmed_at,
            settlement_final_amount: amount ?? row.settlement_final_amount,
            interpreter_payment: amount ?? row.interpreter_payment,
            interpreter_price: amount ?? row.interpreter_price,
            interpreter_total_amount: amount,
            company_invoice_amount: companyAmount,
            daily_rate: dailyRate,
            work_days: workDays,
            settlement_completed_at: settlement.settlement_completed_at || settlement.paid_at || row.settlement_completed_at,
            assigned_interpreter_id:
              settlement.interpreter_id || row.assigned_interpreter_id || row.matched_interpreter_id,
            matched_interpreter_id:
              settlement.interpreter_id || row.matched_interpreter_id || row.assigned_interpreter_id,
          };
        })()
      : (() => {
          const calculated = calculateSettlementAmounts(row);
          const workDays = Math.max(1, Number(row.settlement_work_days ?? calculated.settlement_work_days ?? 1));
          const amount = normalizeMoneyInput(
            row.settlement_final_amount ??
              row.interpreter_payment ??
              row.interpreter_price ??
              calculated.settlement_final_amount
          );
          const companyAmount = getCompanyAmount(row);
          return {
            ...row,
            request_id: row.id || row.request_id,
            request_code: row.request_code || row.request_no || row.management_no || "",
            request_title: row.event_name || row.title || "",
            job_id: row.job_id || null,
            company_id: row.company_id || null,
            assignment_id: row._assignment_id || null,
            interpreter_id: row.assigned_interpreter_id || row.matched_interpreter_id || row.interpreter_id || null,
            interpreter_name: row.assigned_interpreter_name || row.matched_interpreter_name || "",
            settlement_id: null,
            interpreter_total_amount: amount,
            company_invoice_amount: companyAmount,
            daily_rate: workDays > 0 ? amount / workDays : amount,
            work_days: workDays,
          };
        })();
    const settlementStatus = settlement
      ? normalizeAdminSettlementStatus(settlement.settlement_status)
      : ADMIN_SETTLEMENT_STATUS.WAITING;
    return {
      ...baseRow,
      settlement_status: settlementStatus,
    };
  });
  const settlementCandidates = rows.filter(isSettlementManagementCandidate);
  if (settlementCandidates.length > 0) {
    console.table(
      settlementCandidates.map((row) => ({
        request_code: row.request_no || row.management_no || row.id,
        settlement_id: row._settlement_id || "",
        settlement_status: row.settlement_status || "",
      }))
    );
  }

  return {
    rows: sortSettlementRows(settlementCandidates),
    pending: sortSettlementRows(
      settlementCandidates.filter(
        (row) => row.settlement_status === ADMIN_SETTLEMENT_STATUS.WAITING
      )
    ),
    confirmed: sortSettlementRows(
      settlementCandidates.filter(
        (row) => row.settlement_status === ADMIN_SETTLEMENT_STATUS.CONFIRMED
      )
    ),
    paying: sortSettlementRows(
      settlementCandidates.filter(
        (row) => row.settlement_status === ADMIN_SETTLEMENT_STATUS.PAYING
      )
    ),
    completed: sortSettlementRows(
      settlementCandidates.filter(
        (row) => row.settlement_status === ADMIN_SETTLEMENT_STATUS.COMPLETED
      )
    ),
    hold: [],
    paymentHistory: [],
  };
}

function uniqueSettlementBaseRows(rows = []) {
  const seen = new Set();
  return compactAdminRows(rows).filter((row) => {
    const key = `${row.id || row.request_id || ""}:${row.assigned_interpreter_id || row.matched_interpreter_id || ""}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSettlementManagementCandidate(request = {}) {
  if (!request?.id) return false;
  if (request._settlement?.id) return true;
  return isSettlementAssignmentReady(request) || Boolean(
    request.interpreter_id ||
      request.assigned_interpreter_id ||
      request.matched_interpreter_id
  );
}

function isSettlementAssignmentReady(request = {}) {
  const assignmentStatus = normalizeAssignmentStatus(request);
  return assignmentStatus === ASSIGNMENT_STATUS.ASSIGNED;
}

function isSettlementOperationCompleted(request = {}) {
  const status = normalizeText(request.status || request.matching_status);
  const operationStatus = normalizeText(request.operation_status);
  return (
    normalizeOperationStatus(request) === OPERATION_STATUS.COMPLETED ||
    ["completed", "done", "finished", "operation_completed", "업무완료", "운영완료"].includes(status) ||
    ["completed", "done", "finished", "operation_completed", "업무완료", "운영완료"].includes(operationStatus)
  );
}

function getSettlementStatusValue(request = {}) {
  const group = getSettlementGroup(request, request._settlement);
  if (group === "confirmed") return SETTLEMENT_FLOW_STATUS.CONFIRMED;
  if (group === "paying" || group === "completed") return SETTLEMENT_FLOW_STATUS.COMPLETED;
  if (group === "pending") return SETTLEMENT_FLOW_STATUS.PENDING;
  return SETTLEMENT_FLOW_STATUS.NOT_REQUIRED;
}

function getSettlementStatusGroup(request = {}) {
  return getSettlementGroup(request, request._settlement);
}

function getSettlementGroup(request = {}, settlement = null) {
  if (settlement?.settlement_status !== undefined || settlement?.status !== undefined || settlement?.payout_status !== undefined) {
    const settlementStatus = normalizeAdminSettlementStatus(
      settlement.settlement_status || settlement.status || settlement.payout_status
    );
    if (settlementStatus === "settlement_confirmed") return "confirmed";
    if (settlementStatus === "settlement_paying") return "paying";
    if (settlementStatus === "settlement_completed") return "completed";
    return "pending";
  }

  if (!settlement?.id && isSettlementAssignmentReady(request)) return "pending";
  if (!settlement?.id && (isSettlementOperationCompleted(request) || isCompletedRequest(request))) return "pending";

  return "pending";
}

function sortSettlementRows(rows = []) {
  return [...rows].sort((a, b) => getSettlementRowSortTime(b) - getSettlementRowSortTime(a));
}

function getSettlementRowSortTime(request = {}) {
  return new Date(
    request.paid_at ||
      request.settlement_completed_at ||
      request.settlement_confirmed_at ||
      request.updated_at ||
      request.end_date ||
      request.event_date ||
      request.start_date ||
      request.created_at ||
      0
  ).getTime();
}

function findSettlementForRequest(request = {}, settlements = []) {
  const requestId = String(request.id || request.request_id || "");
  if (!requestId) return null;

  const targetInterpreterId = String(
    request.assigned_interpreter_id ||
      request.matched_interpreter_id ||
      request.interpreter_id ||
      ""
  );
  const assignmentId = request._assignment_id ? `request_interpreters:${request._assignment_id}` : "";

  const matches = compactAdminRows(settlements).filter(
    (settlement) => String(settlement.request_id || "") === requestId
  );
  if (matches.length === 0) return null;

  return (
    (assignmentId &&
      matches.find((settlement) => String(settlement.assignment_id || "") === assignmentId)) ||
    (targetInterpreterId &&
      matches.find((settlement) => String(settlement.interpreter_id || "") === targetInterpreterId)) ||
    matches.sort((a, b) => getSettlementRowSortTime(b) - getSettlementRowSortTime(a))[0] ||
    null
  );
}

function getRequestSettlementControlStatus(request = {}) {
  const settlement = request._settlement || null;
  if (settlement) {
    return normalizeAdminSettlementStatus(
      settlement.settlement_status || settlement.status || settlement.payout_status
    );
  }
  return "settlement_waiting";
}

function buildSettlementPreviewFromRequest(request = {}, settlements = []) {
  const targetInterpreterId = request.assigned_interpreter_id || request.matched_interpreter_id || null;
  const existingSettlement =
    request._settlement ||
    settlements.find(
      (settlement) =>
        String(settlement.request_id || "") === String(request.id || request.request_id || "") &&
        (!targetInterpreterId || String(settlement.interpreter_id || "") === String(targetInterpreterId))
    );
  const calculated = calculateSettlementAmounts(request);
  const assignment = request._assignment || {};
  const workDays = Math.max(1, Number(existingSettlement?.work_days ?? assignment.work_days ?? calculated.settlement_work_days ?? 1));
  const amount = normalizeMoneyInput(
    existingSettlement?.final_amount ??
      existingSettlement?.amount ??
      assignment.final_amount ??
      assignment.total_amount ??
      request.settlement_final_amount ??
      request.interpreter_payment ??
      request.interpreter_price ??
      calculated.settlement_final_amount ??
      0
  );
  const interpreterId =
    existingSettlement?.interpreter_id ||
    targetInterpreterId ||
    null;

  return {
    ...(existingSettlement || {}),
    id: existingSettlement?.id || `request-settlement-${request.id}`,
    is_virtual: !existingSettlement,
    request_id: request.id || request.request_id,
    job_id: request.job_id || null,
    company_id: request.company_id || null,
    assignment_id: existingSettlement?.assignment_id || request.assignment_id || request._assignment_id || null,
    interpreter_id: interpreterId,
    amount,
    settlement_status: existingSettlement
      ? normalizeAdminSettlementStatus(existingSettlement.settlement_status)
      : ADMIN_SETTLEMENT_STATUS.WAITING,
    payout_status: existingSettlement
      ? normalizeAdminSettlementStatus(existingSettlement.settlement_status)
      : ADMIN_SETTLEMENT_STATUS.WAITING,
    work_days: existingSettlement?.work_days ?? assignment.work_days ?? workDays,
    daily_rate: existingSettlement?.daily_rate ?? assignment.daily_rate ?? (workDays > 0 ? amount / workDays : amount),
    extra_amount: normalizeMoneyInput(existingSettlement?.extra_amount ?? calculated.settlement_extra_amount),
    deduction_amount: normalizeMoneyInput(existingSettlement?.deduction_amount ?? calculated.settlement_deduction_amount),
    admin_memo: existingSettlement?.admin_memo || request.settlement_memo || "",
    paid_at:
      existingSettlement?.paid_at ||
      (getSettlementStatusGroup(request) === "completed"
        ? request.paid_at || request.settlement_completed_at || null
        : null),
    interpreter_payment_started_at: existingSettlement?.interpreter_payment_started_at || null,
    settlement_completed_at: existingSettlement?.settlement_completed_at || existingSettlement?.paid_at || null,
    settlement_confirmed_at: existingSettlement?.settlement_confirmed_at || request.settlement_confirmed_at || null,
    created_at: request.updated_at || request.created_at,
  };
}

function getSettlementRequestRowKey(request = {}) {
  return request._row_key || `request-${request.id}`;
}

function createSettlementDraft(request = {}) {
  const calculated = calculateSettlementAmounts(request);
  return {
    settlement_work_days: calculated.settlement_work_days,
    settlement_level: calculated.settlement_level,
    settlement_base_amount: calculated.settlement_base_amount,
    settlement_extra_amount: calculated.settlement_extra_amount,
    settlement_deduction_amount: calculated.settlement_deduction_amount,
    settlement_final_amount: calculated.settlement_final_amount,
    settlement_status: normalizeAdminSettlementStatus(
      request._settlement?.settlement_status || request.settlement_status
    ),
    settlement_memo: request.settlement_memo || "",
    payment_status: request.payment_status || "unpaid",
  };
}

function applySettlementDefaults(request = {}, touched = {}) {
  const level = getSettlementLevel(request);
  if (!level) return request;

  const defaults = SETTLEMENT_LEVEL_DEFAULTS[level];
  const calculated = calculateSettlementAmounts(request);
  const currentCompanyAmount = getCompanyAmount(request);
  const currentInterpreterPayment = getInterpreterPayment(request);
  const nextCompanyAmount =
    !touched.company_amount && currentCompanyAmount === 0
      ? defaults.company_amount
      : currentCompanyAmount;
  const hasStoredInterpreterPayment =
    request._settlement?.amount !== undefined &&
    request._settlement?.amount !== null;
  const nextInterpreterPayment =
    !hasStoredInterpreterPayment &&
    !touched.interpreter_payment &&
    currentInterpreterPayment === 0
      ? calculated.settlement_final_amount
      : currentInterpreterPayment;

  if (
    nextCompanyAmount === currentCompanyAmount &&
    nextInterpreterPayment === currentInterpreterPayment &&
    request.settlement_base_amount
  ) {
    return request;
  }

  const platformProfit = nextCompanyAmount - nextInterpreterPayment;
  return {
    ...request,
    company_amount: nextCompanyAmount,
    client_price: nextCompanyAmount,
    interpreter_payment: nextInterpreterPayment,
    interpreter_price: nextInterpreterPayment,
    settlement_work_days: calculated.settlement_work_days,
    settlement_level: calculated.settlement_level,
    settlement_base_amount: calculated.settlement_base_amount,
    settlement_extra_amount: calculated.settlement_extra_amount,
    settlement_deduction_amount: calculated.settlement_deduction_amount,
    settlement_final_amount: nextInterpreterPayment,
    platform_profit: platformProfit,
    profit: platformProfit,
  };
}

function normalizePaymentStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (["paid", "결제완료", "결제 완료"].includes(value)) return "paid";
  return "unpaid";
}

function doesRequestMatchSettlementManagementFilter(request = {}, filter = "all") {
  if (filter === "all") return true;
  const settlementStatus = normalizeAdminSettlementStatus(
    request._settlement?.settlement_status || request.settlement_status
  );

  if (filter === "settlement_waiting") {
    return settlementStatus === ADMIN_SETTLEMENT_STATUS.WAITING;
  }
  if (filter === "settlement_confirmed") {
    return settlementStatus === ADMIN_SETTLEMENT_STATUS.CONFIRMED;
  }
  if (filter === "settlement_paying") {
    return settlementStatus === ADMIN_SETTLEMENT_STATUS.PAYING;
  }
  if (filter === "settlement_completed" || filter === "settlement_paid") {
    return settlementStatus === ADMIN_SETTLEMENT_STATUS.COMPLETED;
  }
  return true;
}

function getCompanyAmount(request = {}) {
  return normalizeMoneyInput(
    request.company_fee ??
      request.company_amount ??
      request.client_price ??
      request.estimated_price ??
      request.total_amount ??
      request.amount
  );
}

function getInterpreterPayment(request = {}) {
  return normalizeMoneyInput(
    request._settlement?.amount ??
      request.interpreter_fee ??
      request.interpreter_payment ??
      request.interpreter_price ??
      request.settlement_final_amount ??
      request.interpreter_pay
  );
}

function getInterpreterPaymentForSummary(request = {}) {
  if (request._settlement?.amount !== undefined && request._settlement?.amount !== null) {
    return normalizeMoneyInput(request._settlement.amount);
  }
  if (request.interpreter_total_amount !== undefined && request.interpreter_total_amount !== null) {
    return normalizeMoneyInput(request.interpreter_total_amount);
  }
  const savedAmount = getInterpreterPayment(request);
  if (
    request.interpreter_payment !== undefined ||
    request.interpreter_price !== undefined ||
    request.settlement_final_amount !== undefined
  ) {
    return savedAmount;
  }
  return normalizeMoneyInput(calculateSettlementAmounts(request).settlement_final_amount);
}

function getPlatformProfit(request = {}) {
  if (request.platform_profit !== undefined && request.platform_profit !== null) {
    return normalizeMoneyInput(request.platform_profit);
  }
  if (request.profit !== undefined && request.profit !== null) {
    return normalizeMoneyInput(request.profit);
  }
  return getCompanyAmount(request) - getInterpreterPayment(request);
}

function getDesignatedRequestType(...items) {
  const isDesignated = isDesignatedRequest(...items);
  return {
    isDesignated,
    label: getRequestTypeLabel(...items),
  };
}

function getStatusBadgeClass(status) {
  return getStandardStatusBadgeClass(status);
}

function getOperationFlowStatuses(item = {}) {
  return {
    assignment_status: normalizeAssignmentStatus(item),
    operation_status: normalizeOperationStatus(item),
    settlement_status: normalizeSettlementFlowStatus(item),
  };
}

function getRequestHeadlineStatus(item = {}) {
  const statuses = getOperationFlowStatuses(item);

  if (statuses.settlement_status === SETTLEMENT_FLOW_STATUS.COMPLETED) {
    return { type: "settlement", value: statuses.settlement_status, label: "정산완료" };
  }
  if (statuses.settlement_status === SETTLEMENT_FLOW_STATUS.CONFIRMED) {
    return { type: "settlement", value: statuses.settlement_status, label: "정산확정" };
  }
  if (statuses.settlement_status === SETTLEMENT_FLOW_STATUS.ON_HOLD) {
    return { type: "settlement", value: statuses.settlement_status, label: "정산보류" };
  }
  if (statuses.settlement_status === SETTLEMENT_FLOW_STATUS.PENDING) {
    return { type: "settlement", value: statuses.settlement_status, label: "정산대기" };
  }
  if (statuses.operation_status === OPERATION_STATUS.COMPLETED) {
    return { type: "operation", value: statuses.operation_status, label: "업무완료" };
  }
  if (statuses.operation_status === OPERATION_STATUS.IN_PROGRESS) {
    return { type: "operation", value: statuses.operation_status, label: "운영중" };
  }
  if (statuses.operation_status === OPERATION_STATUS.SCHEDULED) {
    return { type: "operation", value: statuses.operation_status, label: "운영 예정" };
  }
  if (statuses.operation_status === OPERATION_STATUS.PREPARING) {
    return { type: "operation", value: statuses.operation_status, label: "운영 준비중" };
  }
  if (statuses.operation_status === OPERATION_STATUS.BEFORE_OPERATION) {
    return { type: "operation", value: statuses.operation_status, label: "운영전" };
  }
  if (statuses.assignment_status === ASSIGNMENT_STATUS.ASSIGNED) {
    return { type: "assignment", value: statuses.assignment_status, label: "배정완료" };
  }
  if (statuses.assignment_status === ASSIGNMENT_STATUS.ASSIGNING) {
    return {
      type: "assignment",
      value: statuses.assignment_status,
      label: isDesignatedRequest(item) ? "통역사 확인중" : "배정중",
    };
  }
  return { type: "assignment", value: statuses.assignment_status, label: "배정대기" };
}

function getRequestFlowSource(request = {}, job = null) {
  if (!job) return request;

  return {
    ...request,
    assignment_status: job.assignment_status,
    operation_status: job.operation_status,
    settlement_status: job.settlement_status,
    status: job.status || request.status,
  };
}

function getDesignatedRequestCheckStatus(request = {}, assignments = []) {
  if (!isDesignatedRequest(request)) return "-";
  if (assignments.length > 0 || normalizeAssignmentStatus(request) === ASSIGNMENT_STATUS.ASSIGNED) {
    return "가능";
  }
  if (normalizeMatchingStatus(request.status || request.matching_status) === MATCHING_STATUS.CANCELLED) {
    return "불가";
  }
  return "확인중";
}

function getAssignmentStatusChanges(item = {}) {
  const value = normalizeAssignmentStatus(item);
  return {
    assignment_status: value,
  };
}

function getOperationStatusChanges(item = {}) {
  const value = normalizeOperationStatus(item);
  return { operation_status: value };
}

function getSettlementFlowStatusChanges(item = {}) {
  const value = normalizeSettlementFlowStatus(item);
  const changes = { settlement_status: value };
  if (value === SETTLEMENT_FLOW_STATUS.COMPLETED) {
    changes.status = MATCHING_STATUS.SETTLED;
    changes.matching_status = MATCHING_STATUS.SETTLED;
  }
  if (value === SETTLEMENT_FLOW_STATUS.PENDING) {
    changes.status = MATCHING_STATUS.SETTLEMENT_PENDING;
    changes.matching_status = MATCHING_STATUS.SETTLEMENT_PENDING;
  }
  return changes;
}

function getLegacyRequestStatusFromFlow(item = {}) {
  const settlementStatus = normalizeSettlementFlowStatus(item);
  const operationStatus = normalizeOperationStatus(item);
  const assignmentStatus = normalizeAssignmentStatus(item);

  if (settlementStatus === SETTLEMENT_FLOW_STATUS.COMPLETED) return MATCHING_STATUS.SETTLED;
  if (settlementStatus === SETTLEMENT_FLOW_STATUS.CONFIRMED) return MATCHING_STATUS.SETTLEMENT_PENDING;
  if (settlementStatus === SETTLEMENT_FLOW_STATUS.PENDING) return MATCHING_STATUS.SETTLEMENT_PENDING;
  if (settlementStatus === SETTLEMENT_FLOW_STATUS.ON_HOLD) return MATCHING_STATUS.COMPLETED;
  if (operationStatus === OPERATION_STATUS.COMPLETED) return MATCHING_STATUS.COMPLETED;
  if (operationStatus === OPERATION_STATUS.IN_PROGRESS) return MATCHING_STATUS.IN_PROGRESS;
  if (assignmentStatus === ASSIGNMENT_STATUS.ASSIGNED) return MATCHING_STATUS.ASSIGNED;
  return MATCHING_STATUS.DRAFT;
}

function getRequestStatusPayloadFromFlow(item = {}) {
  const legacyStatus = getLegacyRequestStatusFromFlow(item);
  const operationStatus = normalizeOperationStatus(item);
  const settlementStatus = normalizeSettlementFlowStatus(item);
  const operationRequiresAssignment =
    operationStatus === OPERATION_STATUS.IN_PROGRESS ||
    operationStatus === OPERATION_STATUS.COMPLETED ||
    settlementStatus !== SETTLEMENT_FLOW_STATUS.NOT_REQUIRED;
  const settlementRequiresCompletion =
    settlementStatus !== SETTLEMENT_FLOW_STATUS.NOT_REQUIRED;

  return {
    assignment_status: operationRequiresAssignment
      ? ASSIGNMENT_STATUS.ASSIGNED
      : normalizeAssignmentStatus(item),
    operation_status: settlementRequiresCompletion
      ? OPERATION_STATUS.COMPLETED
      : operationStatus,
    settlement_status: settlementStatus,
    status: legacyStatus,
    matching_status: legacyStatus,
  };
}

function getJobStatusPayloadFromFlow(item = {}) {
  const settlementStatus = normalizeSettlementFlowStatus(item);
  const rawOperationStatus = normalizeOperationStatus(item);
  const operationStatus =
    settlementStatus !== SETTLEMENT_FLOW_STATUS.NOT_REQUIRED
      ? OPERATION_STATUS.COMPLETED
      : rawOperationStatus;
  const assignmentStatus =
    operationStatus === OPERATION_STATUS.IN_PROGRESS ||
    operationStatus === OPERATION_STATUS.COMPLETED
      ? ASSIGNMENT_STATUS.ASSIGNED
      : normalizeAssignmentStatus(item);

  if (operationStatus === OPERATION_STATUS.COMPLETED) {
    return {
      assignment_status: assignmentStatus,
      operation_status: operationStatus,
      settlement_status: settlementStatus,
      status: JOB_STATUS.COMPLETED,
      is_urgent: false,
    };
  }

  if (assignmentStatus === ASSIGNMENT_STATUS.ASSIGNED) {
    return {
      assignment_status: assignmentStatus,
      operation_status: operationStatus,
      settlement_status: settlementStatus,
      status: JOB_STATUS.ASSIGNED,
      is_urgent: false,
    };
  }

  if (assignmentStatus === ASSIGNMENT_STATUS.ASSIGNING) {
    return {
      assignment_status: assignmentStatus,
      operation_status: operationStatus,
      settlement_status: settlementStatus,
      status: JOB_STATUS.ASSIGNING,
      is_urgent: false,
    };
  }

  return {
    assignment_status: assignmentStatus,
    operation_status: operationStatus,
    settlement_status: settlementStatus,
    status: JOB_STATUS.RECRUITING,
  };
}

function getOperationFlowBadgeClass(type, value) {
  if (type === "assignment") return getAssignmentStatusBadgeClass(value);
  if (type === "operation") return getOperationStatusBadgeClass(value);
  return getSettlementPayoutBadgeClass(value);
}

function getOperationStatusOptionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || value;
}

function getOperationFlowAriaLabel(type) {
  if (type === "assignment") return "배정 상태";
  if (type === "operation") return "운영 상태";
  return "정산 상태";
}

function getApplicationLanguage(application = {}, job = {}) {
  return (
    application.language ||
    application.japanese_level ||
    application.language_level ||
    job?.language ||
    "-"
  );
}

function isMissingColumnError(error) {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /column|schema cache/i.test(error?.message || "")
  );
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key, value]) => INTERPRETER_UPDATE_COLUMNS.has(key) && value !== undefined
    )
  );
}

function prepareInterpreterUpdatePayload(changes = {}) {
  const normalizedChanges = { ...changes };

  if (isResumeVerificationStatusValue(normalizedChanges.status)) {
    if (!("approved" in normalizedChanges)) {
      normalizedChanges.approved = true;
    }
    delete normalizedChanges.status;
  }

  if (!("approved" in normalizedChanges)) {
    if ("resume_verified" in normalizedChanges) {
      normalizedChanges.approved = normalizedChanges.resume_verified;
    } else if ("verified" in normalizedChanges) {
      normalizedChanges.approved = normalizedChanges.verified;
    }
  }

  const payload = cleanPayload(normalizedChanges);

  if ("age" in payload && String(payload.age || "").trim() !== "") {
    const age = toNonNegativeInteger(payload.age);
    if (age === null) return { payload: {}, errorMessage: "숫자 항목은 숫자로 입력해주세요." };
    payload.age = String(age);
  }

  if ("warning_count" in payload) {
    const count = toNonNegativeInteger(payload.warning_count);
    if (count === null) return { payload: {}, errorMessage: "숫자 항목은 숫자로 입력해주세요." };
    payload.warning_count = count;
  }

  if ("experience_count" in payload) {
    const count = toNonNegativeInteger(payload.experience_count);
    if (count === null) return { payload: {}, errorMessage: "숫자 항목은 숫자로 입력해주세요." };
    payload.experience_count = count;
  }

  if ("has_experience" in payload) {
    payload.has_experience = normalizeBoolean(payload.has_experience);
    if (!payload.has_experience) payload.experience_count = 0;
  }

  if (payload.has_experience && String(changes.experience_count ?? "").trim() === "") {
    return { payload: {}, errorMessage: "통역 경험 횟수를 입력해주세요." };
  }

  if ("approved" in payload) {
    payload.approved = normalizeBoolean(payload.approved);
  }

  if ("is_public" in payload) {
    payload.is_public = normalizeBoolean(payload.is_public);
  }

  if ("status" in payload) {
    payload.status = normalizeInterpreterStatus(payload.status);
  }

  if ("activity_status" in payload) {
    payload.activity_status = normalizeInterpreterActivityStatus(payload.activity_status);
  }

  return { payload, errorMessage: "" };
}

function isResumeVerificationStatusValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return [
    "이력서 검증 완료",
    "검증 완료",
    "verified",
    "resume_verified",
  ].includes(normalized);
}

function isResumeReviewPending(interpreter = {}) {
  const hasResume =
    Boolean(interpreter.resume_url) ||
    Boolean(interpreter.resume_file_url) ||
    Boolean(interpreter.resume_path) ||
    interpreter.resume_uploaded === true ||
    interpreter.resume_submitted === true ||
    Boolean(interpreter.resume_submitted_at);
  const verificationStatus = String(interpreter.verification_status || "")
    .trim()
    .toLowerCase();
  const isVerified =
    interpreter.resume_verified === true ||
    interpreter.verified === true ||
    interpreter.approved === true ||
    verificationStatus === "verified";

  return hasResume && !isVerified;
}

function isInterpreterResumeVerificationComplete(interpreter = {}) {
  return Boolean(
    interpreter.resume_verified ?? interpreter.verified ?? interpreter.approved
  );
}

function getResumeVerifiedEmailSentAt(interpreter = {}) {
  return interpreter.resume_verified_email_sent_at || "";
}

function getInterpreterVerificationEmail(interpreter = {}) {
  return getEmailRecipient(
    interpreter.email,
    interpreter.contact_email,
    interpreter.applicant_email
  );
}

async function updateInterpreterResumeVerifiedEmailSentAt(interpreterId, sentAt) {
  const { data, error } = await supabase
    .from("interpreters")
    .update({ resume_verified_email_sent_at: sentAt })
    .eq("id", interpreterId)
    .select("id, resume_verified_email_sent_at")
    .single();

  if (!error) return { data, error: null };

  if (isMissingColumnError(error)) {
    console.warn("resume_verified_email_sent_at 컬럼이 없어 발송 시각 저장을 건너뜁니다.", error);
    return { data: null, error: null, skipped: true };
  }

  return { data: null, error };
}

function toNonNegativeInteger(value) {
  const text = String(value ?? "").trim();
  if (text === "") return 0;
  if (!/^\d+$/.test(text)) return null;
  return Math.max(0, Number(text));
}

function normalizeBoolean(value) {
  return value === true || value === "true";
}

function normalizeInterpreterStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["withdrawn", "탈퇴", "탈퇴 회원", "탈퇴회원"].includes(normalized)) return WITHDRAWN_STATUS;
  if (["승인 대기", "대기", "pending"].includes(normalized)) return "pending";
  if (["승인 완료", "승인", "활동중", "approved", "active"].includes(normalized)) return "active";
  if (["거절", "반려", "rejected"].includes(normalized)) return "rejected";
  if (INTERPRETER_STATUS_VALUES.has(normalized)) return normalized;
  return "pending";
}

function normalizeInterpreterActivityStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["활동중", "active"].includes(normalized)) return INTERPRETER_ACTIVITY_STATUS.ACTIVE;
  if (["비활성", "inactive"].includes(normalized)) return INTERPRETER_ACTIVITY_STATUS.INACTIVE;
  if (["일시중지", "paused"].includes(normalized)) return INTERPRETER_ACTIVITY_STATUS.PAUSED;
  if (["활동불가", "unavailable"].includes(normalized)) return INTERPRETER_ACTIVITY_STATUS.UNAVAILABLE;
  if (Object.values(INTERPRETER_ACTIVITY_STATUS).includes(normalized)) return normalized;
  return INTERPRETER_ACTIVITY_STATUS.ACTIVE;
}

function withoutOperationFlowColumns(payload) {
  const legacyPayload = { ...payload };
  delete legacyPayload.assignment_status;
  delete legacyPayload.operation_status;
  delete legacyPayload.settlement_status;
  return legacyPayload;
}

async function updateJobWithFallback(jobId, changes) {
  const jobChanges = { ...(changes || {}) };
  delete jobChanges.updated_at;
  let previousJob = null;
  const statusFields = ["status", "assignment_status", "operation_status", "settlement_status"];
  const hasStatusChange = statusFields.some(field => field in jobChanges);

  if (Object.keys(jobChanges).length === 0) {
    return { data: null, error: null };
  }

  if (hasStatusChange) {
    const { data } = await supabase
      .from("jobs")
      .select("status, assignment_status, operation_status, settlement_status")
      .eq("id", jobId)
      .single();
    previousJob = data;
  }

  const { data, error } = await supabase
    .from("jobs")
    .update(jobChanges)
    .eq("id", jobId)
    .select("*")
    .single();

  const handleNotification = async (updatedJob) => {
    if (!previousJob) return;

    for (const field of statusFields) {
      if (field in jobChanges && previousJob[field] !== updatedJob[field]) {
        try {
          const previousStatus = previousJob[field];
          const nextStatus = updatedJob[field];
          
          await supabase.from("notifications").insert({
            notification_type: "status_changed",
            title: "상태 변경 알림",
            message: `${updatedJob.title || updatedJob.event_name || "의뢰"} 상태가 ${previousStatus || "-"}에서 ${nextStatus}로 변경되었습니다.`,
            channel: "internal",
            recipient_type: "admin",
            status: "pending"
          });
        } catch (err) {
          console.error("Failed to insert status_changed notification", err);
        }
      }
    }
  };

  if (!error) {
    await handleNotification(data);
    return { data, error: null };
  }
  if (!isMissingColumnError(error)) return { data: null, error };

  console.error("Failed to update job status", error);
  const legacyChanges = withoutOperationFlowColumns(changes);
  delete legacyChanges.updated_at;
  if (Object.keys(legacyChanges).length === 0) {
    return { data: null, error: null };
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("jobs")
    .update(legacyChanges)
    .eq("id", jobId)
    .select("*")
    .single();

  if (fallbackError) {
    console.error("Failed to update job status", fallbackError);
  } else if (fallbackData) {
    await handleNotification(fallbackData);
  }
  
  return { data: fallbackData, error: fallbackError };
}

function upsertById(items, nextItem) {
  if (!nextItem?.id) return items;
  const exists = items.some((item) => item.id === nextItem.id);
  if (exists) {
    return items.map((item) => (item.id === nextItem.id ? { ...item, ...nextItem } : item));
  }
  return [nextItem, ...items];
}

function formatJPY(value) {
  return `¥${Number(value || 0).toLocaleString()}`;
}

async function createAdminDocumentPdfBlob({ title, rows = [] }) {
  const width = 1240;
  const height = 1754;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#111827";
  context.font = "700 48px system-ui, -apple-system, BlinkMacSystemFont, 'Noto Sans KR', sans-serif";
  context.fillText(title || "ON-LI 문서", 80, 120);
  context.font = "400 24px system-ui, -apple-system, BlinkMacSystemFont, 'Noto Sans KR', sans-serif";
  context.fillStyle = "#4b5563";
  context.fillText(`발급일 ${new Date().toLocaleDateString("ko-KR")}`, 80, 162);
  context.strokeStyle = "#111827";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(80, 195);
  context.lineTo(width - 80, 195);
  context.stroke();

  let y = 270;
  rows.forEach(([label, value]) => {
    context.fillStyle = "#6b7280";
    context.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, 'Noto Sans KR', sans-serif";
    context.fillText(label, 80, y);
    context.fillStyle = "#111827";
    context.font = "400 26px system-ui, -apple-system, BlinkMacSystemFont, 'Noto Sans KR', sans-serif";
    wrapPdfCanvasText(context, String(value || "-"), 260, y, width - 340, 34);
    y += 58;
  });

  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const jpegBytes = dataUrlToBytes(jpegDataUrl);
  return buildImagePdfBlob(jpegBytes, width, height);
}

function wrapPdfCanvasText(context, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = "";
  let lineY = y;
  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
      return;
    }
    line = testLine;
  });
  if (line) context.fillText(line, x, lineY);
}

function dataUrlToBytes(dataUrl) {
  const binary = atob(dataUrl.split(",")[1] || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function buildImagePdfBlob(imageBytes, width, height) {
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [];
  let position = 0;
  const append = (part) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    parts.push(bytes);
    position += bytes.length;
  };
  const object = (id, objectParts) => {
    offsets[id] = position;
    append(`${id} 0 obj\n`);
    objectParts.forEach(append);
    append("\nendobj\n");
  };

  append("%PDF-1.4\n");
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  object(3, [
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] `,
    "/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
  ]);
  object(4, [
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} `,
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
    imageBytes,
    "\nendstream",
  ]);
  const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
  object(5, [`<< /Length ${content.length} >>\nstream\n${content}endstream`]);
  const xrefStart = position;
  append("xref\n0 6\n0000000000 65535 f \n");
  for (let id = 1; id <= 5; id += 1) {
    append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
  return new Blob(parts, { type: "application/pdf" });
}

function formatDate(value) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getAgreementStatusLabel(item = {}) {
  return item.agreed_terms && item.agreed_policy ? "완료" : "미동의";
}

function formatList(value) {
  if (Array.isArray(value) && value.length > 0) return value.join(", ");
  return value || "-";
}

function formatListOrMissing(value) {
  if (Array.isArray(value)) {
    const list = value.filter(Boolean);
    return list.length > 0 ? list.join(", ") : "미입력";
  }

  return value || "미입력";
}

function createInterpreterEditDraft(interpreter = {}) {
  return {
    name: interpreter.name || "",
    email: interpreter.email || "",
    phone: interpreter.phone || "",
    kakao_or_line: interpreter.kakao_or_line || "",
    gender: interpreter.gender || "",
    age: interpreter.age || "",
    region: interpreter.region || "",
    level: interpreter.level || "Lv1",
    approved: String(Boolean(interpreter.approved)),
    status: getInterpreterFilterStatus(interpreter),
    activity_status: getInterpreterActivityStatus(interpreter),
    warning_count: interpreter.warning_count || 0,
    jlpt: interpreter.jlpt || "",
    stay_period: interpreter.stay_period || "",
    school: interpreter.school || "",
    has_experience: String(Boolean(interpreter.has_experience)),
    experience_count: interpreter.experience_count || 0,
    available_tasks: interpreter.available_tasks || "",
    specialties: listToDraftText(interpreter.specialties),
    available_regions: listToDraftText(interpreter.available_regions),
    admin_memo:
      interpreter?.admin_memo ||
      interpreter?.management_memo ||
      interpreter?.memo ||
      interpreter?.note ||
      "",
  };
}

function getInterpreterChangesFromDraft(draft = {}) {
  return {
    name: draft.name,
    email: draft.email,
    kakao_or_line: draft.kakao_or_line,
    gender: draft.gender,
    age: draft.age,
    region: draft.region,
    level: draft.level,
    approved: draft.approved === "true",
    status: draft.status,
    activity_status: draft.activity_status || INTERPRETER_ACTIVITY_STATUS.ACTIVE,
    warning_count: Math.max(0, Number(draft.warning_count || 0)),
    jlpt: draft.jlpt,
    stay_period: draft.stay_period,
    school: draft.school,
    has_experience: draft.has_experience === "true",
    experience_count: draft.has_experience === "true" ? draft.experience_count : 0,
    available_tasks: draft.available_tasks,
    specialties: draftTextToList(draft.specialties),
    available_regions: draftTextToList(draft.available_regions),
    admin_memo: draft.admin_memo || "",
  };
}

function getInitial(value) {
  return String(value || "ON").trim().slice(0, 1).toUpperCase();
}

function listToDraftText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return value || "";
}

function draftTextToList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getJobDisplayTitle(job, jobId) {
  return job?.title || job?.event_name || (jobId ? `#${jobId}` : "공고 정보 없음");
}

function getJobOrganizationLabel(job) {
  return job?.company_name || job?.event_name || job?.event_location || "-";
}

function getExperienceLabel(interpreter) {
  return interpreter.has_experience ? "통역 경험 있음" : "통역 경험 없음";
}

function getInterpreterFilterStatus(interpreter = {}) {
  if (isWithdrawnInterpreter(interpreter)) return WITHDRAWN_STATUS;
  const status = String(interpreter.status || "").toLowerCase().trim();
  if (status === "rejected" || status === "반려") return "rejected";
  if (status === "active" || status === "활동중" || status === "승인 완료") return "active";
  if (status === "suspended" || status === "정지") return "suspended";
  if (status === "warning" || status === "경고") return "warning";
  return "pending";
}

function getInterpreterActivityStatus(interpreter = {}) {
  const status = String(interpreter.activity_status || "").trim().toLowerCase();
  if (Object.values(INTERPRETER_ACTIVITY_STATUS).includes(status)) return status;
  return INTERPRETER_ACTIVITY_STATUS.ACTIVE;
}

function isPendingInterpreter(interpreter = {}) {
  const status = String(interpreter.status || "").toLowerCase().trim();
  return PENDING_INTERPRETER_STATUSES.includes(status);
}

function isNewRequest(request = {}) {
  const hasAdminChecked = Object.prototype.hasOwnProperty.call(request, "admin_checked");
  const hasCheckedAt = Object.prototype.hasOwnProperty.call(request, "checked_at");

  if (hasAdminChecked && request.admin_checked === true) {
    return false;
  }

  if (hasCheckedAt && request.checked_at) {
    return false;
  }

  if (hasAdminChecked && request.admin_checked === false) {
    return true;
  }

  const statusValues = [
    request.status,
    request.matching_status,
    request.request_status,
    request.contact_status,
  ].map((status) => String(status || "").trim().toLowerCase());

  return statusValues.some((status) => NEW_REQUEST_STATUSES.includes(status));
}

function doesRequestMatchManagementStatusFilter(request = {}, filter = "all") {
  if (filter === "all") return true;
  if (filter === "new_request") return isNewRequest(request);
  if (filter === OPERATION_STATUS.BEFORE_OPERATION) {
    return normalizeOperationStatus(request) === OPERATION_STATUS.BEFORE_OPERATION;
  }
  if (filter === OPERATION_STATUS.PREPARING) {
    return normalizeOperationStatus(request) === OPERATION_STATUS.PREPARING;
  }
  if (filter === OPERATION_STATUS.SCHEDULED) {
    return normalizeOperationStatus(request) === OPERATION_STATUS.SCHEDULED;
  }
  if (filter === OPERATION_STATUS.IN_PROGRESS) {
    return normalizeOperationStatus(request) === OPERATION_STATUS.IN_PROGRESS;
  }
  if (filter === OPERATION_STATUS.COMPLETED) {
    return normalizeOperationStatus(request) === OPERATION_STATUS.COMPLETED;
  }

  return request.status === filter;
}

function getInterpreterStatusLabel(interpreter = {}) {
  if (isWithdrawnInterpreter(interpreter)) return "탈퇴 회원";
  const status = String(interpreter.status || "").toLowerCase().trim();
  if (status === "rejected" || status === "반려") return "반려";
  if (status === "active" || status === "활동중" || status === "승인 완료") return "승인 완료";
  if (status === "suspended" || status === "정지") return "정지";
  if (status === "warning" || status === "경고") return "경고";
  return "승인 대기";
}

function sortInterpretersForAdmin(a, b) {
  const aPending = isPendingInterpreter(a) ? 0 : 1;
  const bPending = isPendingInterpreter(b) ? 0 : 1;
  if (aPending !== bPending) return aPending - bPending;
  return Number(b.id || 0) - Number(a.id || 0);
}

function groupBy(items, key) {
  return items.reduce((map, item) => {
    const list = map.get(item[key]) || [];
    map.set(item[key], [...list, item]);
    return map;
  }, new Map());
}

function groupByStringKey(items, key) {
  return items.reduce((map, item) => {
    const itemKey = String(item[key]);
    const list = map.get(itemKey) || [];
    map.set(itemKey, [...list, item]);
    return map;
  }, new Map());
}

function getStoragePathFromUrl(filePath, bucketName) {
  if (!filePath) return "";
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    const parts = filePath.split(`/${bucketName}/`);
    if (parts.length > 1) {
      return decodeURIComponent(parts[1].split("?")[0]);
    }
    return "";
  }
  return filePath;
}

function getRequestDescription(request = {}) {
  return (
    request.job_description ||
    request.request_detail ||
    request.request_details ||
    ""
  );
}

function getRequestReferenceFile(requestOrDescription = {}, maybeDescription = "") {
  const request =
    typeof requestOrDescription === "string" ? {} : requestOrDescription || {};
  const description =
    typeof requestOrDescription === "string" ? requestOrDescription : maybeDescription;
  const fileName =
    request.reference_file_name ||
    description.match(/^참고 자료 파일명:\s*(.+)$/m)?.[1]?.trim() ||
    description.match(/^참고 자료:\s*있음\s*\((.+)\)$/m)?.[1]?.trim() ||
    "";
  const filePath =
    request.reference_file_path ||
    request.reference_file_url ||
    description.match(/^참고 자료 파일 경로:\s*(.+)$/m)?.[1]?.trim() ||
    description.match(/^참고 자료 파일 URL:\s*(.+)$/m)?.[1]?.trim() ||
    "";

  if (!fileName && !filePath) return null;

  return {
    name: fileName || filePath.split("/").pop() || "첨부 파일",
    path: getStoragePathFromUrl(filePath, REQUEST_REFERENCE_BUCKET) || filePath,
  };
}

function removeRequestReferenceFileMeta(description = "") {
  return description
    .split("\n")
    .filter(
      (line) =>
        !/^참고 자료 파일명:\s*/.test(line) &&
        !/^참고 자료 파일 경로:\s*/.test(line) &&
        !/^참고 자료 파일 URL:\s*/.test(line)
    )
    .join("\n")
    .trim();
}

function getStatusLabel(status) {
  const normalizedApplication = normalizeApplicationStatus(status);
  if (
    Object.values(APPLICATION_STATUS).includes(status) ||
    ["지원접수", "지원완료", "검토중", "보류", "합격", "매칭완료", "불합격"].includes(status)
  ) {
    return getApplicationStatusLabel(normalizedApplication);
  }

  const normalizedMatching = normalizeMatchingStatus(status);
  if (
    Object.values(MATCHING_STATUS).includes(status) ||
    ["임시배정", "배정", "배정완료", "확정", "운영중", "진행중", "업무완료", "운영완료", "정산대기"].includes(status)
  ) {
    return getMatchingStatusLabel(normalizedMatching);
  }

  return STATUS_LABELS[status] || status || "-";
}

export default Admin;
