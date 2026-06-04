import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  CheckCircle2,
  Eye,
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
  User,
  X,
} from "lucide-react";
import { publicSupabase, supabase, supabaseConfigError } from "../supabase";
import DateRangeInput from "../components/DateRangeInput";
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
  normalizeMatchingStatus,
} from "../utils/status";
import { formatDateRange, getDateRangeEnd, getDateRangeStart } from "../utils/dateRange";
import { isDateRangeOverlappingMonth, normalizeDateToISO } from "../utils/date";
import {
  ACTIVE_MATCHING_STATUSES,
  checkInterpreterScheduleConflict,
  findLocalScheduleConflicts,
  getScheduleRange,
  normalizeScheduleDate,
} from "../utils/scheduleConflict";
import { fetchJobApplications as fetchBaseJobApplications } from "../utils/jobsApi";
import { getPositiveInteger } from "../utils/jobRecruitment";
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
  getAssignmentStatusBadgeClass,
  getOperationStatusBadgeClass,
  getSettlementFlowStatusBadgeClass,
  getSettlementFlowStatusLabel,
  normalizeAssignmentStatus,
  normalizeOperationStatus,
  normalizeSettlementFlowStatus,
} from "../utils/operationsStatus";
import { getEmailRecipient, sendAdminAutoEmail, sendAutoEmail } from "../lib/email";
import {
  getDesignatedInterpreterName,
  getRequestTypeLabel,
  isDesignatedRequest,
} from "../utils/designatedRequest";
import {
  MANAGEMENT_NUMBER_CONFIG,
  addManagementNumber,
  isManagementNumberConflict,
} from "../utils/managementNumber";
import { useAuth } from "../hooks/useAuth";
import "./Admin.css";

// TODO: 실서비스 전에는 Supabase Auth 관리자 권한 필요.

const TABS = [
  { id: "requests", label: "의뢰 관리" },
  { id: "completedRequests", label: "완료 의뢰" },
  { id: "jobs", label: "통역 공고 관리" },
  { id: "interpreters", label: "통역사 관리" },
  { id: "applications", label: "지원자 관리" },
  { id: "matching", label: "정산 관리" },
];
const INTERPRETER_STATUSES = ["pending", "active", "rejected", "warning", "suspended"];
const LEVELS = ["Lv1", "Lv2", "Lv3", "Lv4"];
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
  "updated_at",
]);
const INTERPRETER_STATUS_VALUES = new Set(INTERPRETER_STATUSES);
const REQUEST_MANAGEMENT_FILTERS = [
  { value: "all", label: "전체" },
  { value: "new_request", label: "신규 의뢰" },
  { value: "before_operation", label: "운영 전" },
  { value: "operation_in_progress", label: "운영 중" },
  { value: "operation_completed", label: "운영 종료" },
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
const EMPTY_REQUEST_EDIT_DRAFT = {
  id: "",
  title: "",
  event_name: "",
  company_name: "",
  request_no: "",
  request_type: "일반의뢰",
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
};
const JOB_APPLICATION_STATUSES = APPLICATION_STATUS_OPTIONS;
const SETTLEMENT_MANAGEMENT_FILTERS = [
  { value: "all", label: "전체" },
  { value: "unpaid", label: "미결제" },
  { value: "paid", label: "결제완료" },
  { value: "settlement_pending", label: "정산대기" },
  { value: "settlement_completed", label: "정산완료" },
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
  settlement_pending: "정산대기",
  completed: "운영완료",
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
        applicant_phone,
        email,
        applicant_email,
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

  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  return {
    data: fallbackData.map((application) => ({
      ...application,
      jobs: jobsById.get(application.job_id) || null,
    })),
    error: null,
  };
}

function Admin({ onBackClick }) {
  const { user, signOut, adminProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("requests");
  const [requests, setRequests] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [interpreters, setInterpreters] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [matchings, setMatchings] = useState([]);
  const [jobApplications, setJobApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [expandedRequestId, setExpandedRequestId] = useState(null);
  const [applicationsRequestId, setApplicationsRequestId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [activeRequestModal, setActiveRequestModal] = useState(null);
  const [requestEditDraft, setRequestEditDraft] = useState(null);
  const [isAdminAccountModalOpen, setIsAdminAccountModalOpen] = useState(false);
  const [isSettlementPendingModalOpen, setIsSettlementPendingModalOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminAccountDraft, setAdminAccountDraft] = useState({
    email: "",
    role: "staff",
  });
  const [isAdminAccountSaving, setIsAdminAccountSaving] = useState(false);
  const [selectedInterpreter, setSelectedInterpreter] = useState(null);
  const [interpreterModalType, setInterpreterModalType] = useState(null);
  const [interpreterEditDraft, setInterpreterEditDraft] = useState(null);
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [interpreterFilters, setInterpreterFilters] = useState({
    search: "",
    level: "all",
    status: "all",
    activity: "all",
    approved: "all",
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
  const [matchingFilters, setMatchingFilters] = useState({
    month: "",
    status: "all",
  });
  const [applicationFilters, setApplicationFilters] = useState({
    status: "all",
    duplicate: "all",
  });

  const fetchAdminData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    if (!publicSupabase) {
      setErrorMessage(supabaseConfigError.message);
      setLoading(false);
      return;
    }

    const [requestResult, jobResult, interpreterResult, assignmentResult, matchingResult] =
      await Promise.all([
        publicSupabase.from("requests").select("*").order("created_at", {
          ascending: false,
          nullsFirst: false,
        }),
        publicSupabase.from("jobs").select("*").order("created_at", {
          ascending: false,
          nullsFirst: false,
        }),
        publicSupabase.from("interpreters").select("*").order("id", {
          ascending: false,
        }),
        publicSupabase
          .from("request_interpreters")
          .select(
            "id, request_id, interpreter_id, assigned_at, interpreter:interpreters(id, name, level, status, approved)"
          )
          .order("id", { ascending: false }),
        publicSupabase
          .from("matchings")
          .select("id, matching_no, job_id, request_id, interpreter_id, start_date, end_date, status")
          .order("created_at", { ascending: false }),
      ]);

    if (
      requestResult.error ||
      jobResult.error ||
      interpreterResult.error ||
      assignmentResult.error
    ) {
      const error =
        requestResult.error ||
        jobResult.error ||
        interpreterResult.error ||
        assignmentResult.error;
      console.error("Supabase select error:", error);
      alert(error.message);
      setErrorMessage("관리자 데이터를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    if (matchingResult.error) {
      console.warn("matchings fetch skipped:", matchingResult.error);
    }

    const jobApplicationResult = await fetchJobApplicationsWithJobs(jobResult.data || []);
    if (jobApplicationResult.error) {
      console.error("Supabase select error:", jobApplicationResult.error);
      alert(jobApplicationResult.error.message);
      setErrorMessage("관리자 데이터를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    console.log("loaded jobs:", jobResult.data || []);
    console.log("loaded interpreters:", interpreterResult.data || []);
    console.log("loaded applications:", jobApplicationResult.data || []);
    setRequests(requestResult.data || []);
    setJobs(jobResult.data || []);
    setInterpreters(interpreterResult.data || []);
    setAssignments(assignmentResult.data || []);
    setMatchings(matchingResult.error ? [] : matchingResult.data || []);
    setJobApplications(jobApplicationResult.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(fetchAdminData);
  }, [fetchAdminData]);

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
      .select("id, email, role, status, created_at, updated_at")
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

  const assignmentsByRequest = useMemo(() => groupBy(assignments, "request_id"), [
    assignments,
  ]);
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

  const activeRequests = useMemo(
    () => requests.filter((request) => !isCompletedRequest(request)),
    [requests]
  );
  const completedRequests = useMemo(
    () => requests.filter((request) => isCompletedRequest(request)),
    [requests]
  );
  const settlementPendingRequests = useMemo(
    () => requests.filter((request) => isSettlementPendingRequest(request)),
    [requests]
  );

  const filteredRequests = useMemo(() => {
    const search = requestFilters.search.trim().toLowerCase();

    const result = activeRequests.filter((request) => {
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
  }, [activeRequests, jobsById, requestFilters]);

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
        (interpreterFilters.status === "inactive"
          ? getInterpreterActivityStatus(interpreter) === INTERPRETER_ACTIVITY_STATUS.INACTIVE
          : getInterpreterFilterStatus(interpreter) === interpreterFilters.status);
      const matchesActivity =
        interpreterFilters.activity === "all" ||
        getInterpreterActivityStatus(interpreter) === interpreterFilters.activity;
      const matchesApproved =
        interpreterFilters.approved === "all" ||
        String(Boolean(interpreter.approved)) === interpreterFilters.approved;
      const matchesDuplicate =
        interpreterFilters.duplicate === "all" ||
        duplicateInterpreterResult.duplicateIds.has(interpreter.id);

      return (
        matchesSearch &&
        matchesLevel &&
        matchesStatus &&
        matchesActivity &&
        matchesApproved &&
        matchesDuplicate
      );
    }).sort(sortInterpretersForAdmin);
  }, [duplicateInterpreterResult, interpreterFilters, interpreters]);

  const dashboard = useMemo(
    () => {
      return {
        totalRequests: requests.length,
        totalInterpreters: interpreters.length,
        pendingInterpreters: interpreters.filter((interpreter) =>
          isPendingInterpreter(interpreter)
        ).length,
        newRequests: requests.filter((request) => isNewRequest(request)).length,
        uncheckedApplications: jobApplications.filter((application) =>
          [APPLICATION_STATUS.PENDING, APPLICATION_STATUS.REVIEWING].includes(
            normalizeApplicationStatus(application.status)
          )
        ).length,
        settlementPending: settlementPendingRequests.length,
      };
    },
    [
      jobApplications,
      requests,
      interpreters,
      settlementPendingRequests.length,
    ]
  );

  const operationDashboard = useMemo(
    () => buildOperationDashboard(requests, assignmentsByRequest, interpreters),
    [assignmentsByRequest, interpreters, requests]
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

  const metricCards = [
    {
      label: "전체 의뢰",
      value: `${dashboard.totalRequests}건`,
      description: "누적 운영 건수",
      tone: "purple",
      icon: Briefcase,
      targetTab: "requests",
    },
    {
      label: "전체 통역사",
      value: `${dashboard.totalInterpreters}명`,
      description: "등록된 전체 통역사",
      tone: "green",
      icon: User,
      targetTab: "interpreters",
    },
    {
      label: "신규 통역사 지원",
      value: `${dashboard.pendingInterpreters}명`,
      description: "승인 검토 필요",
      tone: "purple",
      icon: Star,
      targetTab: "interpreters",
    },
    {
      label: "신규 의뢰",
      value: `${dashboard.newRequests}건`,
      description: "새 의뢰 확인 필요",
      tone: "blue",
      icon: Mail,
      targetTab: "requests",
    },
    {
      label: "미확인 지원",
      value: `${dashboard.uncheckedApplications}건`,
      description: "검토가 필요한 지원",
      tone: "orange",
      icon: Eye,
      targetTab: "applications",
    },
    {
      label: "정산 대기",
      value: `${dashboard.settlementPending}건`,
      description: "정산 처리 필요",
      tone: "indigo",
      icon: CheckCircle2,
      targetTab: "matching",
    },
  ];

  const switchToJobsTab = () => {
    setActiveTab("jobs");
  };

  const handleMetricCardClick = (card) => {
    if (card.label === "전체 의뢰") {
      setRequestFilters((prev) => ({
        ...prev,
        search: "",
        month: "",
        status: "all",
        public: "all",
      }));
      setActiveTab("requests");
    } else if (card.label === "전체 통역사") {
      setInterpreterFilters({
        search: "",
        level: "all",
        status: "all",
        activity: "all",
        approved: "all",
        duplicate: "all",
      });
      setActiveTab("interpreters");
    } else if (card.label === "신규 통역사 지원") {
      setInterpreterFilters({
        search: "",
        level: "all",
        status: "pending",
        activity: "all",
        approved: "all",
        duplicate: "all",
      });
      setActiveTab("interpreters");
    } else if (card.label === "신규 의뢰") {
      setRequestFilters((prev) => ({
        ...prev,
        search: "",
        month: "",
        status: "new_request",
        public: "all",
      }));
      setActiveTab("requests");
    } else if (card.label === "미확인 지원") {
      setApplicationFilters({
        status: "unchecked",
        duplicate: "all",
      });
      setActiveTab("applications");
    } else if (card.label === "정산 대기") {
      setMatchingFilters((prev) => ({
        ...prev,
        month: "",
        status: "settlement_pending",
      }));
      setActiveTab("matching");
    } else {
      setActiveTab(card.targetTab);
    }
  };

  const updateAdminAccountDraft = (name, value) => {
    setAdminAccountDraft((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const createAdminUser = async () => {
    const email = adminAccountDraft.email.trim().toLowerCase();
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

    setAdminAccountDraft({ email: "", role: "staff" });
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

    await fetchAdminData();

    if (options.showSuccess) {
      alert("수정 완료");
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
    setActiveRequestModal({ type, requestId: request.id, request });
    setSelectedRequest(type === "detail" ? request : null);
    const requestJob = request.job_id
      ? jobsById.get(String(request.job_id)) || jobsById.get(request.job_id) || null
      : null;
    setRequestEditDraft(
      type === "edit"
        ? { ...EMPTY_REQUEST_EDIT_DRAFT, ...createRequestEditDraft(request, requestJob) }
        : null
    );
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
    const nextClientPrice = getCompanyAmount({ ...request, ...changes });
    const nextInterpreterPrice = getInterpreterPayment({ ...request, ...changes });
    const payload = {
      ...changes,
      company_amount: nextClientPrice,
      interpreter_payment: nextInterpreterPrice,
      platform_profit: nextClientPrice - nextInterpreterPrice,
      client_price: nextClientPrice,
      interpreter_price: nextInterpreterPrice,
      profit: nextClientPrice - nextInterpreterPrice,
    };

    setSavingKey(`request-${id}`);
    let { data, error } = await supabase
      .from("requests")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (error && isMissingColumnError(error)) {
      console.error("request update column fallback:", error);
      const legacyPayload = {
        ...changes,
        client_price: nextClientPrice,
        interpreter_price: nextInterpreterPrice,
        profit: nextClientPrice - nextInterpreterPrice,
      };
      delete legacyPayload.company_amount;
      delete legacyPayload.interpreter_payment;
      delete legacyPayload.platform_profit;
      delete legacyPayload.assignment_status;
      delete legacyPayload.operation_status;
      delete legacyPayload.settlement_status;

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
      console.error(error);
      alert("의뢰 정보 변경에 실패했습니다.");
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
    } catch (error) {
      console.error("operation flow status update error:", error);
      alert("운영 단계 상태 변경에 실패했습니다.");
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
    const requestPayload = {
      event_name: draft.event_name,
      company_name: draft.company_name,
      request_no: draft.request_no,
      request_type: draft.request_type,
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
      is_public: draft.is_public === "true",
      is_job_public: draft.is_public === "true",
      client_price: clientPrice,
      assigned_interpreter_name: draft.assigned_interpreter,
    };
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
      const { data: updatedRequests, error: requestError } = await supabase
        .from("requests")
        .update(requestPayload)
        .eq("id", draft.id)
        .select();

      if (requestError) {
        alert(`수정 실패: ${requestError.message}`);
        return;
      }

      if (!updatedRequests || updatedRequests.length === 0) {
        alert("수정 실패: 변경된 의뢰가 없습니다.");
        return;
      }

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
            ? { ...request, ...requestPayload, ...(updatedRequests[0] || {}) }
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
      closeRequestModal();
      alert("공고 정보가 저장되었습니다.");
    } catch (error) {
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
    const { data, error } = await supabase
      .from("requests")
      .update(changes)
      .eq("id", requestId)
      .select("*")
      .single();

    if (!error) return { data, error: null };

    console.error("request update error:", error);
    if (!isMissingColumnError(error)) return { data: null, error };

    const legacyChanges = {};
    if (changes.is_public !== undefined) legacyChanges.is_public = Boolean(changes.is_public);
    if (changes.event_date !== undefined) legacyChanges.event_date = changes.event_date;
    if (Object.keys(legacyChanges).length === 0) return { data: null, error: null };

    const { data: fallbackData, error: fallbackError } = await supabase
      .from("requests")
      .update(legacyChanges)
      .eq("id", requestId)
      .select("*")
      .single();

    if (fallbackError) console.error("request update fallback error:", fallbackError);
    return { data: fallbackData, error: fallbackError };
  };

  const handlePriceDraft = (requestId, field, value) => {
    const updatePrice = (request) => {
      const numericValue = normalizeMoneyInput(value);
      const mirrorField =
        field === "company_amount" ? "client_price" : "interpreter_price";
      const nextRequest = {
        ...request,
        [field]: numericValue,
        [mirrorField]: numericValue,
      };
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

  const saveSettlement = async (request) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    const companyAmount = getCompanyAmount(request);
    const interpreterPayment = getInterpreterPayment(request);
    const platformProfit = companyAmount - interpreterPayment;
    const payload = {
      company_amount: companyAmount,
      interpreter_payment: interpreterPayment,
      platform_profit: platformProfit,
      client_price: companyAmount,
      interpreter_price: interpreterPayment,
      profit: platformProfit,
      payment_status: request.payment_status || "unpaid",
      settlement_status: normalizeSettlementFlowStatus(request),
    };

    setSavingKey(`request-${request.id}`);
    const { data, error } = await updateRequestSettlementRow(request.id, payload);
    setSavingKey("");

    if (error) {
      console.error("정산 저장 디버그:", {
        table: "requests",
        id: request.id,
        payload,
        error,
      });
      alert(`정산 저장에 실패했습니다: ${error.message || "원인을 확인해주세요."}`);
      return;
    }

    setRequests((current) =>
      current.map((item) =>
        item.id === request.id ? { ...item, ...payload, ...(data || {}) } : item
      )
    );
    setSelectedRequest((current) =>
      current?.id === request.id ? { ...current, ...payload, ...(data || {}) } : current
    );
    alert("정산 정보가 저장되었습니다.");
  };

  const completeSettlementFromPendingModal = async (request) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    if (!window.confirm("정산완료로 변경하시겠습니까?")) return;

    const payload = {
      settlement_status: "정산완료",
      updated_at: new Date().toISOString(),
    };

    setSavingKey(`settlement-pending-${request.id}`);
    let { error } = await supabase
      .from("requests")
      .update(payload)
      .eq("id", request.id);

    if (error && isMissingColumnError(error)) {
      ({ error } = await supabase
        .from("requests")
        .update({ settlement_status: payload.settlement_status })
        .eq("id", request.id));
    }

    setSavingKey("");

    if (error) {
      alert(`정산완료 처리 실패: ${error.message}`);
      return;
    }

    await fetchAdminData();
  };

  const openRequestDetailFromSettlementPending = (request) => {
    setIsSettlementPendingModalOpen(false);
    openRequestModal("detail", request);
  };

  const updateRequestSettlementRow = async (requestId, payload) => {
    const { data, error } = await supabase
      .from("requests")
      .update(payload)
      .eq("id", requestId)
      .select("*")
      .single();

    if (!error) return { data, error: null };
    if (!isMissingColumnError(error)) return { data: null, error };

    console.error("request settlement column fallback:", {
      table: "requests",
      id: requestId,
      payload,
      error,
    });
    const legacyPayload = {
      client_price: payload.company_amount,
      interpreter_price: payload.interpreter_payment,
      profit: payload.platform_profit,
      payment_status: payload.payment_status,
      settlement_status: payload.settlement_status,
    };

    let { data: fallbackData, error: fallbackError } = await supabase
      .from("requests")
      .update(legacyPayload)
      .eq("id", requestId)
      .select("*")
      .single();

    if (fallbackError && isMissingColumnError(fallbackError)) {
      console.error("request settlement status fallback:", {
        table: "requests",
        id: requestId,
        payload: legacyPayload,
        error: fallbackError,
      });
      const minimumPayload = {
        client_price: payload.company_amount,
        interpreter_price: payload.interpreter_payment,
        profit: payload.platform_profit,
      };
      const minimumResult = await supabase
        .from("requests")
        .update(minimumPayload)
        .eq("id", requestId)
        .select("*")
        .single();
      fallbackData = minimumResult.data;
      fallbackError = minimumResult.error;
    }

    return { data: fallbackData, error: fallbackError };
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

    const conflictCheck = await confirmScheduleConflictOverride({
      interpreterId,
      scheduleRange,
      selectedJob,
      request,
      interpreter,
    });

    if (!conflictCheck.shouldProceed) return false;

    setSavingKey(`assign-${requestId}`);
    const payload = {
      request_id: requestId,
      interpreter_id: interpreterId,
    };
    const { data: assignmentData, error } = await supabase
      .from("request_interpreters")
      .insert([payload])
      .select(
        "id, request_id, interpreter_id, assigned_at, interpreter:interpreters(id, name, level, status, approved)"
      )
      .single();

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
      interpreter: assignmentData?.interpreter || interpreter,
    };
    const matchingData = await createMatchingScheduleSnapshot({
      request,
      selectedJob,
      interpreterId,
      scheduleRange,
    });
    if (conflictCheck.isOverride && matchingData?.id) {
      await logScheduleConflictOverride(matchingData.id, conflictCheck.conflicts);
    }

    const nextAssignments = [...currentAssignments, nextAssignment];
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
    const requestId =
      typeof assignment === "object" ? assignment?.request_id : null;

    setSavingKey(`assignment-${assignmentId}`);
    const { error } = await supabase
      .from("request_interpreters")
      .delete()
      .eq("id", assignmentId);

    let requestError = null;
    let nextRequestChanges = null;
    if (!error && requestId) {
      const request = requests.find((item) => item.id === requestId);
      const remainingAssignments = (assignmentsByRequest.get(requestId) || []).filter(
        (assignment) => assignment.id !== assignmentId
      );
      const requiredCount = getRequestRequiredCount(request);
      nextRequestChanges = buildAssignmentRequestChanges(
        remainingAssignments,
        requiredCount
      );
      const result = await updateRequestAssignmentRow(
        requestId,
        nextRequestChanges,
        { status: nextRequestChanges.status }
      );
      requestError = result.error;
      if (!requestError) {
        await updateLinkedJobAssignmentStatus(
          request,
          remainingAssignments.length,
          requiredCount,
          remainingAssignments
        );
        const interpreter = getAssignmentInterpreter(assignment, interpreters);
        if (interpreter?.id) {
          const { error: matchingError } = await supabase
            .from("matchings")
            .update({ status: "cancelled" })
            .eq("request_id", requestId)
            .eq("interpreter_id", interpreter.id)
            .in("status", ACTIVE_MATCHING_STATUSES);

          if (matchingError) console.warn("matching schedule cancel skipped:", matchingError);
          if (!matchingError) {
            setMatchings((current) =>
              current.map((matching) =>
                Number(matching.request_id) === Number(requestId) &&
                Number(matching.interpreter_id) === Number(interpreter.id)
                  ? { ...matching, status: "cancelled" }
                  : matching
              )
            );
          }
        }
        await updateMatchingApplicationStatus(request, interpreter, APPLICATION_STATUS.PENDING);
      }
    }
    setSavingKey("");

    if (error || requestError) {
      console.error("매칭 취소 실패:", error || requestError);
      alert(`매칭 취소에 실패했습니다: ${(error || requestError).message}`);
      return;
    }

    setAssignments((current) =>
      current.filter((assignment) => assignment.id !== assignmentId)
    );
    if (requestId && nextRequestChanges) {
      setRequests((current) =>
        current.map((request) =>
          request.id === requestId ? { ...request, ...nextRequestChanges } : request
        )
      );
      setSelectedRequest((current) =>
        current?.id === requestId ? { ...current, ...nextRequestChanges } : current
      );
    }
    alert("매칭이 취소되었습니다.");
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
    const status = isAssigned ? JOB_STATUS.ASSIGNED : JOB_STATUS.ASSIGNING;
    const assignmentStatus = isAssigned
      ? ASSIGNMENT_STATUS.ASSIGNED
      : ASSIGNMENT_STATUS.ASSIGNING;
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
    const { data, error } = await supabase
      .from("requests")
      .update(changes)
      .eq("id", requestId)
      .select("*")
      .single();

    if (!error) return { data, error: null };
    if (!isMissingColumnError(error)) return { data: null, error };

    console.error("request assignment column fallback:", error);
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("requests")
      .update(fallbackChanges)
      .eq("id", requestId)
      .select("*")
      .single();

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

    const payload = {
      ...changes,
      updated_at: new Date().toISOString(),
    };

    setSavingKey(`settlement-request-${request.id}`);
    let { data, error } = await supabase
      .from("requests")
      .update(payload)
      .eq("id", request.id)
      .select("*");

    if (error && isMissingColumnError(error)) {
      ({ data, error } = await supabase
        .from("requests")
        .update(changes)
        .eq("id", request.id)
        .select("*"));
    }

    setSavingKey("");

    if (error) {
      alert(`정산 상태 변경 실패: ${error.message}`);
      return false;
    }

    if (!data || data.length === 0) {
      alert("정산 상태 변경 실패: 변경된 의뢰가 없습니다.");
      return false;
    }

    await fetchAdminData();
    return true;
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
    const { error } = await supabase
      .from("job_applications")
      .delete()
      .eq("id", application.id);
    setSavingKey("");

    if (error) {
      console.error("지원자 삭제 실패:", error);
      alert(error.message);
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

        {loading ? (
          <MessageBox text="관리자 데이터를 불러오는 중입니다..." />
        ) : errorMessage ? (
          <MessageBox text={errorMessage} />
        ) : (
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
              onOpenRequest={(request) => {
                setActiveTab("requests");
                openRequestModal("detail", request);
              }}
            />

            <nav className="admin-tabs" aria-label="관리자 메뉴">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={activeTab === tab.id ? "is-active" : ""}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {activeTab === "requests" && (
              <RequestManagement
                applicationsRequestId={applicationsRequestId}
                assignmentDrafts={assignmentDrafts}
                assignmentsByRequest={assignmentsByRequest}
                expandedRequestId={expandedRequestId}
                filters={requestFilters}
                getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
                interpreters={interpreters}
                requests={filteredRequests}
                sectionCount={activeRequests.length}
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
                updateRequestFlowStatus={updateRequestFlowStatus}
              />
            )}

            {activeTab === "completedRequests" && (
              <RequestManagement
                applicationsRequestId={applicationsRequestId}
                assignmentDrafts={assignmentDrafts}
                assignmentsByRequest={assignmentsByRequest}
                expandedRequestId={expandedRequestId}
                filters={requestFilters}
                getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
                interpreters={interpreters}
                requests={filteredCompletedRequests}
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
                updateRequestFlowStatus={updateRequestFlowStatus}
              />
            )}

            {activeTab === "interpreters" && (
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

            {activeTab === "jobs" && (
              <AdminJobs
                embedded
                jobs={jobs}
                requests={requests}
                interpreters={interpreters}
                assignments={assignments}
                applications={jobApplications}
                onDataChanged={fetchAdminData}
                getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
                matchings={matchings}
                updateApplicationStatus={updateJobApplicationStatus}
              />
            )}

            {activeTab === "applications" && (
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
              />
            )}

            {activeTab === "matching" && (
              <SettlementManagement
                filters={matchingFilters}
                requests={requests}
                assignmentsByRequest={assignmentsByRequest}
                interpreters={interpreters}
                savingKey={savingKey}
                setFilters={setMatchingFilters}
                updateSettlementStatus={updateSettlementManagementStatus}
              />
            )}

            <InterpreterModal
              draft={interpreterEditDraft}
              interpreter={selectedInterpreter}
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
                savingKey={savingKey}
                setAssignmentDrafts={setAssignmentDrafts}
                assignInterpreter={assignInterpreter}
                deleteRequest={deleteRequest}
                handlePriceDraft={handlePriceDraft}
                onChangeDraft={updateRequestEditDraft}
                onClose={closeRequestModal}
                onRemoveAssignment={removeAssignment}
                onSaveEdit={saveRequestEditDraft}
                saveSettlement={saveSettlement}
                toggleRequestJobPublic={toggleRequestJobPublic}
                updateApplicationStatus={updateJobApplicationStatus}
                updateRequest={updateRequest}
                updateRequestFlowStatus={updateRequestFlowStatus}
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
  applications,
  assignments,
  assignmentDrafts,
  draft,
  getInterpreterScheduleConflicts,
  interpreters,
  job,
  request,
  savingKey,
  setAssignmentDrafts,
  assignInterpreter,
  deleteRequest,
  handlePriceDraft,
  onChangeDraft,
  onClose,
  onRemoveAssignment,
  onSaveEdit,
  saveSettlement,
  toggleRequestJobPublic,
  updateApplicationStatus,
  updateRequest,
  updateRequestFlowStatus,
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

  return (
    <AdminModal title={modalTitle} titleId={modalId} onClose={onClose}>
      {activeModal.type === "detail" && (
        <RequestDetailPanel
          request={request}
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
          saveSettlement={saveSettlement}
          removeAssignment={onRemoveAssignment}
          updateRequest={updateRequest}
          updateRequestFlowStatus={updateRequestFlowStatus}
          updateApplicationStatus={updateApplicationStatus}
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
                    {getSettlementFlowStatusLabel(normalizeSettlementFlowStatus(request))}
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
            이메일을 등록하면 해당 계정이 로그인 시 관리자 권한을 갖습니다.
            (상대방이 직접 회원가입 후 로그인 필요)
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
              const loginStatus = isSelf ? "현재 로그인 중" : "가입 후 로그인 필요";
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

function AdminModal({ children, className = "", onClose, title, titleId }) {
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
            <span className="admin-card-meta">REQUEST</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose}>
            닫기
          </button>
        </div>
        {children}
      </section>
    </div>
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
              { label: "일반의뢰", value: "일반의뢰" },
              { label: "지정의뢰", value: "지정의뢰" },
            ]}
            value={form.request_type || "일반의뢰"}
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
      </div>
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

function RequestManagement({
  applicationsRequestId,
  assignmentDrafts,
  assignmentsByRequest,
  expandedRequestId,
  filters,
  getInterpreterScheduleConflicts,
  interpreters,
  jobsById,
  requestsByJobId,
  jobApplicationsByJob,
  onJobsAdminClick,
  requests,
  sectionCount,
  sectionTitle = "의뢰 관리",
  savingKey,
  setAssignmentDrafts,
  setApplicationsRequestId,
  setExpandedRequestId,
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
  updateRequestFlowStatus,
}) {
  const isListView = filters.view === "list";

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
              expanded={expandedRequestId === request.id}
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
              savingKey={savingKey}
              setAssignmentDrafts={setAssignmentDrafts}
              setApplicationsRequestId={setApplicationsRequestId}
              setExpandedRequestId={setExpandedRequestId}
              assignInterpreter={assignInterpreter}
              handlePriceDraft={handlePriceDraft}
              saveSettlement={saveSettlement}
              removeAssignment={removeAssignment}
              updateRequest={updateRequest}
              updateRequestFlowStatus={updateRequestFlowStatus}
              updateApplicationStatus={updateApplicationStatus}
              deleteRequest={deleteRequest}
              toggleRequestJobPublic={toggleRequestJobPublic}
              openRequestModal={openRequestModal}
            
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
  savingKey,
  updateRequestFlowStatus,
  openRequestModal,
}) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const job = request.job_id ? jobsById.get(request.job_id) : null;
  const linkedRequest = request.job_id ? requestsByJobId.get(String(request.job_id)) : null;
  const flowSource = getRequestFlowSource(request, job);
  const jobPublicState = getRequestJobPublicState(request, job);
  const designatedInterpreterName = getDesignatedInterpreterName(
    [request, job, linkedRequest],
    interpreters
  );
  const assignedInterpreterName = getAssignedInterpreterName(
    request,
    assignments,
    interpreters
  );
  const statuses = getOperationFlowStatuses(flowSource);
  const headlineStatus = getRequestHeadlineStatus(flowSource);
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
    <article className="admin-request-card request-card">
      <div className="request-card-body">
        <div className="admin-request-card-head">
          <div>
            <ManagementNumberBadge value={request.request_no} />
            <h3 title={request.event_name || ""}>{request.event_name || "-"}</h3>
            <p>{request.company_name || "-"}</p>
          </div>
          <span className={`admin-flow-status-badge ${getOperationFlowBadgeClass(headlineStatus.type, headlineStatus.value)}`}>
            {headlineStatus.label}
          </span>
        </div>

        <div className="admin-status-badge-row">
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

        <dl className="admin-request-summary admin-request-summary-clean">
          <Info label="의뢰번호" value={formatManagementNumber(request.request_no)} />
          <Info label="날짜" value={requestDate} />
          <Info label="장소" value={request.event_location || "-"} />
          <Info label="배정 통역사" value={assignedInterpreterName || designatedInterpreterName || "-"} />
        </dl>

        <OperationFlowStatusControls
          item={flowSource}
          disabled={savingKey === `request-${request.id}`}
          onChange={(changes) => updateRequestFlowStatus(request, changes)}
        />
      </div>

      <div className="admin-request-actions request-card-actions">
        <button
          type="button"
          className="admin-link-button primary"
          onClick={() => openRequestModal("applicants", request)}
        >
          지원자 확인 ({jobApplications.length}명)
        </button>
        <button
          type="button"
          className="admin-link-button primary subtle"
          onClick={() => openRequestModal("detail", request)}
        >
          상세보기
        </button>
        <div className="admin-more-menu request-more-wrapper" ref={moreMenuRef}>
          <button
            type="button"
            className="request-more-trigger"
            aria-label="더보기"
            aria-expanded={isMoreOpen}
            onClick={() => setIsMoreOpen((current) => !current)}
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>
          {isMoreOpen && (
            <div className="request-more-menu">
              <button
                type="button"
                className="request-more-item"
                onClick={() => {
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
                onClick={() => {
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
                onClick={() => {
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
    </article>
  );
}

function RequestDetailPanel({
  applications,
  assignmentDrafts,
  assignments,
  getInterpreterScheduleConflicts,
  interpreters,
  job,
  request,
  savingKey,
  setAssignmentDrafts,
  assignInterpreter,
  handlePriceDraft,
  saveSettlement,
  removeAssignment,
  updateRequest,
  updateApplicationStatus,
  updateRequestFlowStatus,
}) {
  const flowSource = getRequestFlowSource(request, job);
  const requestType = getDesignatedRequestType(request);
  const designatedInterpreterName = getDesignatedInterpreterName([request], interpreters);
  const assignedInterpreterName = getAssignedInterpreterName(
    request,
    assignments,
    interpreters
  );
  const assignedInterpreterIds = new Set(
    assignments.map((assignment) => String(assignment.interpreter_id))
  );
  const assignableInterpreters = interpreters.filter(
    (interpreter) =>
      interpreter.approved &&
      interpreter.status !== "suspended" &&
      !assignedInterpreterIds.has(String(interpreter.id))
  );
  const scheduleRange = getAssignmentScheduleRange(request, job);

  return (
    <div className="admin-detail-panel">
      <ManagementNumberBlock label="관리번호" value={request.request_no} />

      <div className="admin-flow-status-panel">
        <h3>운영 단계</h3>
        <OperationFlowStatusControls
          item={flowSource}
          disabled={savingKey === `request-${request.id}`}
          onChange={(changes) => updateRequestFlowStatus(request, changes)}
        />
      </div>

      <div>
        <h3>의뢰 기본 정보</h3>
        <dl className="admin-detail-list compact">
          <Info label="의뢰번호" value={formatManagementNumber(request.request_no)} />
          <Info label="담당자" value={request.manager_name} />
          <Info label="의뢰 유형" value={requestType.label} />
          <Info label="지정 통역사" value={designatedInterpreterName} />
          <Info label="배정 통역사" value={assignedInterpreterName} />
          <Info label="약관 동의" value={getAgreementStatusLabel(request)} />
          <Info label="동의 시간" value={formatDateTime(request.agreed_at)} />
          <Info label="이메일" value={request.email} />
          <Info label="연락처" value={request.phone} />
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
            label="희망 통역 레벨"
            value={request.requested_level || request.required_level}
          />
          <Info
            label="필요 인원 수"
            value={
              request.requested_people_count || request.required_count
                ? `${request.requested_people_count || request.required_count}명`
                : "-"
            }
          />
          <Info label="희망 성별" value={request.preferred_gender} />
        </dl>
      </div>

      <div>
        <h3>업무 내용</h3>
        <p>{request.job_description || request.request_detail || "-"}</p>
        <h3>복장/주의사항</h3>
        <p>{request.dress_code || "추후 안내"}</p>
      </div>

      <div>
        <h3>행사 기간 수정</h3>
        <div className="admin-date-range-panel">
          <DateRangeInput
            required
            label="행사 기간"
            startDate={getDateRangeStart(request.start_date, request.event_date)}
            endDate={getDateRangeEnd(request.end_date, request.event_date)}
            onChange={({ startDate, endDate }) => {
              if (startDate && endDate && endDate < startDate) {
                alert("종료일은 시작일보다 빠를 수 없습니다.");
                return;
              }
              updateRequest(request.id, {
                start_date: startDate,
                end_date: endDate,
                event_date: startDate,
              });
            }}
          />
        </div>
      </div>

      <div>
        <h3>정산 관리</h3>
        <div className="admin-settlement">
          <NumberControl
            label="기업 금액"
            value={getCompanyAmount(request)}
            onChange={(value) => handlePriceDraft(request.id, "company_amount", value)}
          />
          <NumberControl
            label="통역사 지급액"
            value={getInterpreterPayment(request)}
            onChange={(value) =>
              handlePriceDraft(request.id, "interpreter_payment", value)
            }
          />
          <div className="admin-profit">
            <span>플랫폼 수익</span>
            <strong>{formatJPY(getPlatformProfit(request))}</strong>
          </div>
          <button
            type="button"
            className="admin-save"
            disabled={savingKey === `request-${request.id}`}
            onClick={() => saveSettlement(request)}
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
        />
        <div className="admin-assign-row">
          <select
            value={assignmentDrafts[request.id] || ""}
            onChange={(event) =>
              setAssignmentDrafts((current) => ({
                ...current,
                [request.id]: event.target.value,
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
          <button type="button" onClick={() => assignInterpreter(request.id)}>
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
  const rows = buildApplicationAssignmentRows(applications, assignments, interpreters);
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
          <option value="all">전체 상태</option>
          <option value="pending">신규 통역사 지원</option>
          <option value="active">승인 완료</option>
          <option value="inactive">비활성</option>
          <option value="rejected">반려</option>
          <option value="warning">경고</option>
          <option value="suspended">정지</option>
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
          <option value="all">전체 뱃지</option>
          <option value="false">뱃지 미노출</option>
          <option value="true">검증 뱃지 노출</option>
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
        <MessageBox text="조건에 맞는 통역사가 없습니다." />
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
  savingKey,
  onOpenModal,
  updateInterpreter,
  deleteInterpreter,
}) {
  const approvalLabel = getInterpreterStatusLabel(interpreter);
  const activityStatus = getInterpreterActivityStatus(interpreter);
  const activityLabel = getInterpreterActivityStatusLabel(activityStatus);
  const isSaving = savingKey === `interpreter-${interpreter.id}`;
  const duplicateTitle = duplicateReasons.join(", ");

  const handleDownloadFile = async (filePath, fileName) => {
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

  return (
    <article className="admin-list-card admin-interpreter-card">
      <div className="admin-list-card-head">
        <div>
          <span className="admin-card-meta">통역사</span>
          <h3>{interpreter.name || "이름 미입력"}</h3>
        </div>
        <div className="admin-card-chip-row">
          {interpreter.approved && (
            <span className="status-badge verified" style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              ✨ 검증 완료
            </span>
          )}
          {!interpreter.approved && (interpreter.resume_url || interpreter.resume_file_url) && (
            <span className="status-badge pending" style={{ background: '#fef9c3', color: '#a16207', border: '1px solid #fef08a' }}>
              ⏳ 심사 대기
            </span>
          )}
          {duplicateSuspected && (
            <DuplicateBadge title={duplicateTitle} />
          )}
          <StatusBadge status={approvalLabel} />
          <span className={`status-badge ${getInterpreterActivityStatusBadgeClass(activityStatus)}`}>
            {activityLabel}
          </span>
        </div>
      </div>

      <dl className="admin-card-summary">
        <Info label="통역사번호" value={formatManagementNumber(interpreter.interpreter_no)} />
        <Info label="레벨" value={normalizeLevel(interpreter.level)} />
        <Info label="승인 상태" value={approvalLabel} />
        <Info label="활동 상태" value={activityLabel} />
        <Info
          label="이력서 제출"
          value={
            interpreter.approved ? (
              <span style={{ color: "#15803d", fontWeight: "bold" }}>✨ 검증 완료</span>
            ) : (interpreter.resume_url || interpreter.resume_file_url) ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "#a16207", fontWeight: "bold" }}>
                  ⏳ 심사 대기 (
                  {interpreter.resume_url && interpreter.resume_file_url ? "링크+파일" : interpreter.resume_file_url ? "파일" : "링크"}
                  )
                </span>
                {interpreter.resume_url && (
                  <a href={interpreter.resume_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#3b82f6", textDecoration: "underline", wordBreak: "break-all" }}>
                    🔗 포트폴리오 링크
                  </a>
                )}
                {interpreter.resume_file_url && (
                  <button
                    type="button"
                    onClick={() => handleDownloadFile(interpreter.resume_file_url, interpreter.resume_file_name)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", background: "#5b5cf0", color: "#ffffff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: "pointer", marginTop: "2px", width: "fit-content" }}
                  >
                    📥 파일 다운로드
                  </button>
                )}
              </div>
            ) : (
              <span style={{ color: "#6b7280" }}>미제출</span>
            )
          }
        />
        {interpreter.resume_submitted_at && (
          <Info
            label="제출일"
            value={new Date(interpreter.resume_submitted_at).toLocaleDateString()}
          />
        )}
        <Info label="활동 지역" value={formatListOrMissing(interpreter.available_regions)} />
        <Info label="전문 분야" value={formatListOrMissing(interpreter.specialties)} />
        <Info label="통역 경험" value={getExperienceLabel(interpreter)} />
        <Info label="경고" value={`${interpreter.warning_count || 0}회`} />
      </dl>

      <div className="admin-card-controls-grid single">
        <FieldControl label="공개 활동 상태">
          <select
            className="admin-inline-select"
            value={activityStatus}
            disabled={isSaving}
            onChange={(event) =>
              updateInterpreter(interpreter.id, {
                activity_status: event.target.value,
              })
            }
          >
            {INTERPRETER_ACTIVITY_STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </FieldControl>
      </div>

      <div className="admin-card-actions admin-interpreter-actions">
        <button
          type="button"
          className="admin-link-button admin-detail-action"
          onClick={() => onOpenModal(interpreter, "detail")}
        >
          상세보기
        </button>
        <button
          type="button"
          className="admin-link-button admin-edit-action"
          onClick={() => onOpenModal(interpreter, "edit")}
        >
          수정
        </button>
        <button
          type="button"
          className="admin-save admin-approve-action"
          disabled={isSaving}
          onClick={() =>
            updateInterpreter(interpreter.id, {
              status: "active",
              activity_status: INTERPRETER_ACTIVITY_STATUS.ACTIVE,
            })
          }
        >
          승인
        </button>
        <button
          type="button"
          className="admin-save orange admin-reject-action"
          disabled={isSaving}
          onClick={() =>
            updateInterpreter(interpreter.id, {
              status: "rejected",
            })
          }
        >
          반려
        </button>
        <button
          type="button"
          className="admin-save danger admin-delete-action"
          disabled={isSaving}
          onClick={() => deleteInterpreter(interpreter.id)}
        >
          삭제
        </button>
      </div>
    </article>
  );
}

function InterpreterModal({
  draft,
  duplicateReasons = [],
  duplicateSuspected = false,
  interpreter,
  modalType,
  saving,
  onChangeDraft,
  onClose,
  onSave,
  updateInterpreter,
}) {
  if (!interpreter || !modalType) return null;

  const handleDownloadFile = async (filePath, fileName) => {
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

  const approvalLabel = getInterpreterStatusLabel(interpreter);
  const levelLabel = normalizeLevel(interpreter.level);
  const approvalStatus = approvalLabel;
  const activityStatus = getInterpreterActivityStatus(interpreter);
  const activityLabel = getInterpreterActivityStatusLabel(activityStatus);
  const duplicateTitle = duplicateReasons.join(", ");
  const adminMemo =
    draft?.admin_memo ??
    interpreter.admin_memo ??
    interpreter.management_memo ??
    interpreter.memo ??
    interpreter.note ??
    "";
  const managementMemo =
    interpreter.admin_memo ||
    interpreter.management_memo ||
    interpreter.memo ||
    interpreter.note ||
    "";

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
                <InterpreterQuickInfo icon={Phone} label="전화번호" value={interpreter.phone} />
                <InterpreterQuickInfo icon={Mail} label="이메일" value={interpreter.email} />
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

            <div className="admin-interpreter-detail-grid">
              <InterpreterDetailSection icon={User} title="기본 정보">
                <InterpreterDetailItem label="이름" value={interpreter.name} />
                <InterpreterDetailItem label="성별" value={interpreter.gender} />
                <InterpreterDetailItem label="나이" value={interpreter.age} />
                <InterpreterDetailItem label="레벨" value={levelLabel} />
                <InterpreterDetailItem label="승인 상태" value={approvalLabel} />
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
                {interpreter.resume_submitted_at && (
                  <InterpreterDetailItem
                    label="이력서 제출일"
                    value={formatDateTime(interpreter.resume_submitted_at)}
                  />
                )}
                <InterpreterDetailItem label="검증된 통역사 뱃지" value={interpreter.approved ? "검증 완료" : "미검증"} />
                <InterpreterDetailItem label="공개 활동 상태" value={activityLabel} />
              </InterpreterDetailSection>

              <InterpreterDetailSection icon={Languages} title="활동 정보">
                <InterpreterDetailItem label="언어 수준" value={interpreter.language_level || interpreter.level} />
                <InterpreterDetailItem label="JLPT 여부" value={interpreter.jlpt} />
                <InterpreterDetailItem label="통역 경험" value={getExperienceLabel(interpreter)} />
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

              <InterpreterDetailSection icon={Star} title="프로필 정보">
                <InterpreterDetailItem
                  label="전문 분야"
                  value={formatListOrMissing(interpreter.specialties)}
                />
                <InterpreterDetailItem label="일본 체류 기간" value={interpreter.stay_period} />
                <InterpreterDetailItem label="학교/전공" value={interpreter.school} />
                <InterpreterDetailItem label="Kakao/LINE" value={interpreter.kakao_or_line} />
                <InterpreterDetailItem label="약관 동의" value={getAgreementStatusLabel(interpreter)} />
                <InterpreterDetailItem label="동의 시간" value={formatDateTime(interpreter.agreed_at)} />
              </InterpreterDetailSection>

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
            </div>

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
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: "600", color: "var(--text-h)" }}>검증 통역사 뱃지 및 이력서 관리</h3>
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
                          ✨ 검증 완료
                        </span>
                      ) : (interpreter.resume_url || interpreter.resume_file_url) ? (
                        <span className="status-badge pending" style={{ background: '#fef9c3', color: '#a16207', border: '1px solid #fef08a', padding: "6px 12px", borderRadius: "20px", fontWeight: "bold", display: "inline-block" }}>
                          ⏳ 심사 대기중
                        </span>
                      ) : (
                        <span className="status-badge unsubmitted" style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb', padding: "6px 12px", borderRadius: "20px", display: "inline-block" }}>
                          미제출
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
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-h)", fontWeight: "600" }}>검증 통역사 권한 제어</p>
                    <p style={{ margin: "4px 0 0 0", fontSize: "0.8rem", color: "var(--text)" }}>
                      승인 시 해당 통역사의 프로필에 <strong>✨ ON-LI 검증 통역사</strong> 뱃지가 노출되며 신뢰도를 높여줍니다.
                    </p>
                  </div>
                  <div>
                    {interpreter.approved ? (
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm("이 통역사의 검증 완료 뱃지를 취소하시겠습니까?")) {
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
                        검증 배지 회수하기
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm("이 통역사의 이력서를 승인하고 검증 완료 뱃지를 부여하시겠습니까?")) {
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
                        검증 배지 승인하기
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="admin-interpreter-memo-card">
              <div className="admin-interpreter-section-title">
                <ShieldAlert size={18} aria-hidden="true" />
                <h3>관리자 메모</h3>
              </div>
              <textarea
                rows={5}
                value={adminMemo}
                onChange={(event) => onChangeDraft("admin_memo", event.target.value)}
                placeholder="운영팀 내부에서만 확인하는 메모를 입력하세요."
              />
              <div className="admin-interpreter-memo-actions">
                <span>공개 페이지에는 노출되지 않습니다.</span>
                <button type="button" className="admin-save" disabled={saving} onClick={onSave}>
                  {saving ? "저장 중..." : "메모 저장"}
                </button>
              </div>
            </section>
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
              <FieldControl label="카카오/라인 ID">
                <input
                  value={draft?.kakao_or_line || ""}
                  onChange={(event) => onChangeDraft("kakao_or_line", event.target.value)}
                  placeholder="카카오톡 또는 라인 ID를 입력해주세요"
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
              <FieldControl label="검증된 통역사 뱃지">
                <InlineSelect
                  options={[
                    { label: "일반 통역사 (뱃지 미노출)", value: "false" },
                    { label: "검증 완료 (뱃지 노출)", value: "true" },
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

function ModalInfoSection({ children, title, twoColumn = false }) {
  return (
    <section className="admin-info-block">
      <h3>{title}</h3>
      <dl className={`admin-info-section${twoColumn ? " two-column" : ""}`}>
        {children}
      </dl>
    </section>
  );
}

function ApplicationManagement({
  applications,
  duplicateResult,
  getInterpreterScheduleConflicts,
  jobsById,
  savingKey,
  updateApplicationStatus,
  deleteApplication,
  filters,
  setFilters,
}) {
  const duplicateData = useMemo(
    () => duplicateResult || getDuplicateApplicationIdSet(applications),
    [applications, duplicateResult]
  );
  const visibleApplications = useMemo(
    () =>
      applications.filter((application) => {
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
    [applications, duplicateData, filters.duplicate, filters.status]
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
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function ApplicationCard({
  application,
  job,
  scheduleConflict,
  savingKey,
  updateApplicationStatus,
  deleteApplication,
  duplicateReasons,
  duplicateSuspected,
}) {
  const duplicateTitle = duplicateReasons.join(", ");

  return (
    <article className="admin-list-card">
      <div className="admin-list-card-head">
        <div>
          <span className="admin-card-meta">지원자</span>
          <ManagementNumberBadge value={application.application_no} />
          <h3 title={application.applicant_name || ""}>
            {application.applicant_name || "이름 미입력"}
          </h3>
        </div>
        <div className="admin-card-chip-row">
          {duplicateSuspected && (
            <DuplicateBadge title={duplicateTitle} />
          )}
          {scheduleConflict && <ScheduleConflictBadge />}
          <StatusBadge status={application.status || APPLICATION_STATUS.PENDING} />
        </div>
      </div>

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
            onClick={() =>
              updateApplicationStatus(application, APPLICATION_STATUS.ACCEPTED, {
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
          className="admin-link-button danger"
          disabled={savingKey === `job-application-delete-${application.id}`}
          onClick={() => deleteApplication(application)}
        >
          삭제
        </button>
      </div>
    </article>
  );
}

function SettlementManagement({
  requests,
  filters,
  setFilters,
  assignmentsByRequest,
  interpreters,
  savingKey,
  updateSettlementStatus,
}) {
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
      <SectionTitle count={`${filteredRequests.length}건`} title="정산 관리" />
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
              key={request.id}
              request={request}
              assignments={assignmentsByRequest.get(request.id) || []}
              interpreters={interpreters}
              savingKey={savingKey}
              updateSettlementStatus={updateSettlementStatus}
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
}) {
  const assignedInterpreterNames = getAssignedInterpreterName(
    request,
    assignments,
    interpreters
  );
  const clientPrice = getCompanyAmount(request);
  const interpreterPrice = getInterpreterPayment(request);
  const platformProfit = getPlatformProfit(request);
  const paymentStatus = normalizePaymentStatus(request.payment_status);
  const settlementStatus = normalizeSettlementFlowStatus(request);

  return (
    <article className="admin-list-card">
      <div className="admin-list-card-head">
        <div>
          <span className="admin-card-meta">정산</span>
          <ManagementNumberBadge value={request.request_no} />
          <h3 title={request.event_name || ""}>{request.event_name || "-"}</h3>
        </div>
        <StatusBadge status={getSettlementFlowStatusLabel(settlementStatus)} />
      </div>

      <dl className="admin-card-summary">
        <Info label="의뢰번호" value={formatManagementNumber(request.request_no)} />
        <Info label="기업명" value={request.company_name || "-"} />
        <Info label="행사명" value={request.event_name || "-"} />
        <Info
          label="행사 기간"
          value={formatDateRange(
            request.start_date,
            request.end_date,
            request.event_date
          )}
        />
        <Info label="배정 통역사" value={assignedInterpreterNames || "-"} />
        <Info label="기업 청구액" value={formatJPY(clientPrice)} />
        <Info label="통역사 지급액" value={formatJPY(interpreterPrice)} />
        <Info label="플랫폼 수익" value={formatJPY(platformProfit)} />
        <Info label="기업 결제 상태" value={getStatusLabel(paymentStatus)} />
        <Info
          label="통역사 정산 상태"
          value={getSettlementFlowStatusLabel(settlementStatus)}
        />
      </dl>

      <div className="admin-card-controls-grid">
        <FieldControl label="기업 결제 상태">
          <InlineSelect
            options={[
              { label: "미결제", value: "unpaid" },
              { label: "결제완료", value: "paid" },
            ]}
            value={paymentStatus}
            disabled={savingKey === `settlement-request-${request.id}`}
            onChange={(value) =>
              updateSettlementStatus(request, { payment_status: value })
            }
          />
        </FieldControl>
        <FieldControl label="통역사 정산 상태">
          <InlineSelect
            options={[
              { label: "정산대기", value: SETTLEMENT_FLOW_STATUS.PENDING },
              { label: "정산완료", value: SETTLEMENT_FLOW_STATUS.COMPLETED },
            ]}
            value={settlementStatus}
            disabled={savingKey === `settlement-request-${request.id}`}
            onChange={(value) =>
              updateSettlementStatus(request, { settlement_status: value })
            }
          />
        </FieldControl>
      </div>
    </article>
  );
}

function OperationOverview({ todayItems, urgentItems, onOpenRequest }) {
  return (
    <section className="admin-operation-overview" aria-label="오늘 운영과 긴급 요청">
      <div className="admin-operation-panel admin-today-panel">
        <div className="admin-panel-head">
          <div>
            <p className="admin-kicker">TODAY</p>
            <h2>오늘 운영</h2>
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
              </article>
            ))
          )}
        </div>
      </div>

      <div className="admin-operation-panel admin-urgent-panel">
        <div className="admin-panel-head">
          <div>
            <p className="admin-kicker">URGENT</p>
            <h2>긴급 요청</h2>
          </div>
          <span>{urgentItems.length}건</span>
        </div>
        <div className="admin-operation-list">
          {urgentItems.length === 0 ? (
            <p className="admin-empty-text">긴급 확인이 필요한 의뢰가 없습니다.</p>
          ) : (
            urgentItems.slice(0, 4).map((item) => (
              <article className="admin-urgent-item" key={`urgent-${item.request.id}`}>
                <div className="admin-urgent-topline">
                  <span>{item.dDayLabel}</span>
                  <small>{item.reason}</small>
                </div>
                <h3>{item.request.event_name || "-"}</h3>
                <p>{item.dateLabel}</p>
                <p>{item.request.event_location || "-"}</p>
                <p>{item.interpreters || "통역사 미배정"}</p>
                <button type="button" onClick={() => onOpenRequest(item.request)}>
                  바로 확인
                </button>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
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

function SectionTitle({ count, title }) {
  return (
    <div className="admin-section-title">
      <div>
        <p className="admin-kicker">MANAGE</p>
        <h2>{title}</h2>
      </div>
      <span className="admin-count">{count}</span>
    </div>
  );
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

function OperationFlowStatusControls({ disabled = false, item, onChange }) {
  const statuses = getOperationFlowStatuses(item);

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
        options={SETTLEMENT_FLOW_STATUS_OPTIONS}
        type="settlement"
        value={statuses.settlement_status}
        onChange={(value) => onChange(getSettlementFlowStatusChanges({ ...item, settlement_status: value }))}
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
  return value || "번호 미생성";
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

function Info({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </div>
  );
}

function AssignmentList({ emptyText, items, onRemove }) {
  if (items.length === 0) {
    return <span className="admin-empty-chip">{emptyText}</span>;
  }

  return (
    <div className="admin-assignment-list">
      {items.map((item) => (
        <div key={item.id} className="admin-assignment-row">
          <span>{item.label}</span>
          <button
            type="button"
            className="admin-link-button danger"
            onClick={() => onRemove(item.assignment || item.id)}
          >
            매칭 취소
          </button>
        </div>
      ))}
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
    settlement_status: normalizeSettlementFlowStatus(request),
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

function isSettlementPendingRequest(request = {}) {
  const status = String(
    request.settlement_status ||
      request.payment_status ||
      ""
  ).trim();
  const normalizedStatus = status.toLowerCase();
  return (
    ["정산대기", "settlement_pending", "pending"].includes(status) ||
    ["settlement_pending", "pending"].includes(normalizedStatus) ||
    normalizeSettlementFlowStatus(request) === SETTLEMENT_FLOW_STATUS.PENDING
  );
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

  const todayItems = requests
    .filter((request) =>
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

  return { todayItems, urgentItems };
}

function getScheduleConflictRequestIds(requests = [], assignmentsByRequest = new Map()) {
  const conflictIds = new Set();

  requests.forEach((request, index) => {
    const requestInterpreterIds = getRequestAssignedInterpreterIds(
      request,
      assignmentsByRequest.get(request.id) || []
    );
    if (requestInterpreterIds.length === 0) return;

    requests.slice(index + 1).forEach((otherRequest) => {
      if (!doRequestDatesOverlap(request, otherRequest)) return;

      const otherInterpreterIds = getRequestAssignedInterpreterIds(
        otherRequest,
        assignmentsByRequest.get(otherRequest.id) || []
      );
      const hasSharedInterpreter = requestInterpreterIds.some((id) =>
        otherInterpreterIds.includes(id)
      );
      if (!hasSharedInterpreter) return;

      conflictIds.add(String(request.id));
      conflictIds.add(String(otherRequest.id));
    });
  });

  return conflictIds;
}

function getRequestAssignedInterpreterIds(request = {}, assignments = []) {
  const ids = assignments
    .map((assignment) => assignment.interpreter_id)
    .filter(Boolean)
    .map(String);

  [
    request.assigned_interpreter_id,
    request.matched_interpreter_id,
    request.interpreter_id,
  ].forEach((id) => {
    if (id) ids.push(String(id));
  });

  return [...new Set(ids)];
}

function doRequestDatesOverlap(a = {}, b = {}) {
  const aStart = a.start_date || a.event_date;
  const aEnd = a.end_date || a.event_date || aStart;
  const bStart = b.start_date || b.event_date;
  const bEnd = b.end_date || b.event_date || bStart;
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

function getAssignedInterpreterName(request = {}, assignments = [], interpreters = []) {
  if (assignments.length > 0) {
    return assignments
      .map((assignment) => assignment.interpreter?.name)
      .filter(Boolean)
      .join(", ");
  }

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
  return assignment?.interpreter?.name || "";
}

function buildApplicationAssignmentRows(applications = [], assignments = [], interpreters = []) {
  const usedApplicationIds = new Set();
  const assignmentRows = [];

  assignments.forEach((assignment) => {
    const interpreter = getAssignmentInterpreter(assignment, interpreters);
    const matchedApplication = interpreter
      ? applications.find(
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

  const applicationRows = applications
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
    return items.map((item) =>
      item.id === nextAssignment.id ? { ...item, ...nextAssignment } : item
    );
  }
  return [nextAssignment, ...items];
}

function normalizeMoneyInput(value) {
  const numericValue = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizePaymentStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (["paid", "결제완료", "결제 완료"].includes(value)) return "paid";
  return "unpaid";
}

function doesRequestMatchSettlementManagementFilter(request = {}, filter = "all") {
  if (filter === "all") return true;
  const paymentStatus = normalizePaymentStatus(request.payment_status);
  const settlementStatus = normalizeSettlementFlowStatus(request);

  if (filter === "unpaid" || filter === "paid") return paymentStatus === filter;
  if (filter === "settlement_pending") {
    return settlementStatus === SETTLEMENT_FLOW_STATUS.PENDING;
  }
  if (filter === "settlement_completed") {
    return settlementStatus === SETTLEMENT_FLOW_STATUS.COMPLETED;
  }
  return true;
}

function getCompanyAmount(request = {}) {
  return normalizeMoneyInput(request.company_amount ?? request.client_price);
}

function getInterpreterPayment(request = {}) {
  return normalizeMoneyInput(
    request.interpreter_payment ?? request.interpreter_price
  );
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
  if (statuses.settlement_status === SETTLEMENT_FLOW_STATUS.PENDING) {
    return { type: "settlement", value: statuses.settlement_status, label: "정산대기" };
  }
  if (statuses.operation_status === OPERATION_STATUS.COMPLETED) {
    return { type: "operation", value: statuses.operation_status, label: "운영완료" };
  }
  if (statuses.operation_status === OPERATION_STATUS.IN_PROGRESS) {
    return { type: "operation", value: statuses.operation_status, label: "운영중" };
  }
  if (statuses.assignment_status === ASSIGNMENT_STATUS.ASSIGNED) {
    return { type: "assignment", value: statuses.assignment_status, label: "배정완료" };
  }
  if (statuses.assignment_status === ASSIGNMENT_STATUS.ASSIGNING) {
    return { type: "assignment", value: statuses.assignment_status, label: "배정중" };
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

function getAssignmentStatusChanges(item = {}) {
  const value = normalizeAssignmentStatus(item);
  return {
    assignment_status: value,
    status:
      value === ASSIGNMENT_STATUS.ASSIGNED
        ? MATCHING_STATUS.ASSIGNED
        : MATCHING_STATUS.DRAFT,
    matching_status:
      value === ASSIGNMENT_STATUS.ASSIGNED
        ? MATCHING_STATUS.ASSIGNED
        : MATCHING_STATUS.DRAFT,
  };
}

function getOperationStatusChanges(item = {}) {
  const value = normalizeOperationStatus(item);
  const changes = { operation_status: value };
  if (value === OPERATION_STATUS.IN_PROGRESS) {
    changes.status = MATCHING_STATUS.IN_PROGRESS;
    changes.matching_status = MATCHING_STATUS.IN_PROGRESS;
  }
  if (value === OPERATION_STATUS.COMPLETED) {
    changes.status = MATCHING_STATUS.COMPLETED;
    changes.matching_status = MATCHING_STATUS.COMPLETED;
    changes.settlement_status = SETTLEMENT_FLOW_STATUS.PENDING;
  }
  return changes;
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
  if (settlementStatus === SETTLEMENT_FLOW_STATUS.PENDING) return MATCHING_STATUS.SETTLEMENT_PENDING;
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
  return getSettlementFlowStatusBadgeClass(value);
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
  const payload = cleanPayload(changes);

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

  if ("status" in payload) {
    payload.status = normalizeInterpreterStatus(payload.status);
  }

  if ("activity_status" in payload) {
    payload.activity_status = normalizeInterpreterActivityStatus(payload.activity_status);
  }

  return { payload, errorMessage: "" };
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
  const { data, error } = await supabase
    .from("jobs")
    .update(changes)
    .eq("id", jobId)
    .select("*")
    .single();

  if (!error) return { data, error: null };
  if (!isMissingColumnError(error)) return { data: null, error };

  console.error("Failed to update job status", error);
  const legacyChanges = withoutOperationFlowColumns(changes);
  if (Object.keys(legacyChanges).length === 0) {
    return { data: null, error: null };
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("jobs")
    .update(legacyChanges)
    .eq("id", jobId)
    .select("*")
    .single();

  if (fallbackError) console.error("Failed to update job status", fallbackError);
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

function formatKRW(value) {
  return `₩${Number(value || 0).toLocaleString()}`;
}

function formatJPY(value) {
  return `¥${Number(value || 0).toLocaleString()}`;
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
      interpreter.admin_memo ||
      interpreter.management_memo ||
      interpreter.memo ||
      interpreter.note ||
      "",
  };
}

function getInterpreterChangesFromDraft(draft = {}) {
  return {
    name: draft.name,
    email: draft.email,
    phone: draft.phone,
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
  if (filter === "before_operation") {
    return normalizeOperationStatus(request) === OPERATION_STATUS.BEFORE_OPERATION;
  }
  if (filter === "operation_in_progress") {
    return normalizeOperationStatus(request) === OPERATION_STATUS.IN_PROGRESS;
  }
  if (filter === "operation_completed") {
    return normalizeOperationStatus(request) === OPERATION_STATUS.COMPLETED;
  }

  return request.status === filter;
}

function getInterpreterStatusLabel(interpreter = {}) {
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
    ["임시배정", "배정", "배정완료", "확정", "운영중", "진행중", "운영완료", "정산대기"].includes(status)
  ) {
    return getMatchingStatusLabel(normalizedMatching);
  }

  return STATUS_LABELS[status] || status || "-";
}

export default Admin;
