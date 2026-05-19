import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Languages,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  Star,
  User,
  X,
} from "lucide-react";
import { supabase, supabaseConfigError } from "../supabase";
import AdminJobs from "./AdminJobs";
import { normalizeJobVisibility } from "../utils/jobStatus";
import {
  APPLICATION_STATUS,
  APPLICATION_STATUS_OPTIONS,
  JOB_STATUS,
  MATCHING_STATUS,
  getApplicationStatusLabel,
  getMatchingStatusLabel,
  getStatusBadgeClass as getStandardStatusBadgeClass,
  normalizeApplicationStatus,
  normalizeMatchingStatus,
} from "../utils/status";
import { formatDateRange, getDateRangeEnd, getDateRangeStart } from "../utils/dateRange";
import { fetchJobApplications as fetchBaseJobApplications } from "../utils/jobsApi";
import { getPositiveInteger } from "../utils/jobRecruitment";
import { normalizeLevel } from "../utils/levelBadge";
import { getDuplicateApplicationIdSet } from "../utils/duplicateApplications";
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
import "./Admin.css";

// TODO: 실서비스 전에는 Supabase Auth 관리자 권한 필요.

const TABS = [
  { id: "requests", label: "의뢰 관리" },
  { id: "jobs", label: "통역 공고 관리" },
  { id: "interpreters", label: "통역사 관리" },
  { id: "applications", label: "지원자 관리" },
  { id: "matching", label: "매칭 관리" },
];
const INTERPRETER_STATUSES = ["pending", "active", "rejected", "warning", "suspended"];
const LEVELS = ["Lv1", "Lv2", "Lv3", "Lv4"];
const REQUEST_STATUSES = [
  MATCHING_STATUS.DRAFT,
  MATCHING_STATUS.ASSIGNED,
  MATCHING_STATUS.CONFIRMED,
  MATCHING_STATUS.IN_PROGRESS,
  MATCHING_STATUS.COMPLETED,
  MATCHING_STATUS.SETTLEMENT_PENDING,
  MATCHING_STATUS.SETTLED,
  MATCHING_STATUS.CANCELLED,
];
const JOB_APPLICATION_STATUSES = APPLICATION_STATUS_OPTIONS;
const ONGOING_REQUEST_STATUSES = [
  MATCHING_STATUS.DRAFT,
  MATCHING_STATUS.ASSIGNED,
  MATCHING_STATUS.CONFIRMED,
  MATCHING_STATUS.IN_PROGRESS,
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
  const joinedResult = await supabase
    .from("job_applications")
    .select(
      `
        id,
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

  const fallbackData = await fetchBaseJobApplications(supabase);

  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  return {
    data: fallbackData.map((application) => ({
      ...application,
      jobs: jobsById.get(application.job_id) || null,
    })),
    error: null,
  };
}

function Admin() {
  const [activeTab, setActiveTab] = useState("requests");
  const [requests, setRequests] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [interpreters, setInterpreters] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [jobApplications, setJobApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [expandedRequestId, setExpandedRequestId] = useState(null);
  const [applicationsRequestId, setApplicationsRequestId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [activeRequestModal, setActiveRequestModal] = useState(null);
  const [requestEditDraft, setRequestEditDraft] = useState(null);
  const [selectedInterpreter, setSelectedInterpreter] = useState(null);
  const [interpreterModalType, setInterpreterModalType] = useState(null);
  const [interpreterEditDraft, setInterpreterEditDraft] = useState(null);
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [interpreterFilters, setInterpreterFilters] = useState({
    search: "",
    level: "all",
    status: "all",
    approved: "all",
  });
  const [requestFilters, setRequestFilters] = useState({
    search: "",
    date: "",
    status: "all",
    public: "all",
  });

  const fetchAdminData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    if (!supabase) {
      setErrorMessage(supabaseConfigError.message);
      setLoading(false);
      return;
    }

    const [requestResult, jobResult, interpreterResult, assignmentResult] =
      await Promise.all([
        supabase.from("requests").select("*").order("created_at", {
          ascending: false,
          nullsFirst: false,
        }),
        supabase.from("jobs").select("*").order("created_at", {
          ascending: false,
          nullsFirst: false,
        }),
        supabase.from("interpreters").select("*").order("id", {
          ascending: false,
        }),
        supabase
          .from("request_interpreters")
          .select(
            "id, request_id, interpreter_id, assigned_at, interpreter:interpreters(id, name, level, status, approved)"
          )
          .order("id", { ascending: false }),
      ]);

    if (
      requestResult.error ||
      jobResult.error ||
      interpreterResult.error ||
      assignmentResult.error
    ) {
      console.error(
        requestResult.error ||
          jobResult.error ||
          interpreterResult.error ||
          assignmentResult.error
      );
      setErrorMessage("관리자 데이터를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const jobApplicationResult = await fetchJobApplicationsWithJobs(jobResult.data || []);
    if (jobApplicationResult.error) {
      console.error("job_applications fetch error:", jobApplicationResult.error);
      setErrorMessage("관리자 데이터를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    setRequests(requestResult.data || []);
    setJobs(jobResult.data || []);
    setInterpreters(interpreterResult.data || []);
    setAssignments(assignmentResult.data || []);
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
  const matchedApplications = useMemo(
    () =>
      jobApplications.filter(
        (application) => normalizeApplicationStatus(application.status) === APPLICATION_STATUS.ACCEPTED
      ),
    [jobApplications]
  );
  const matchedRequests = useMemo(
    () =>
      requests.filter((request) =>
        isRequestVisibleInMatching(
          request,
          assignmentsByRequest.get(request.id) || []
        )
      ),
    [assignmentsByRequest, requests]
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

  const filteredRequests = useMemo(() => {
    const search = requestFilters.search.trim().toLowerCase();

    return requests.filter((request) => {
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
        !requestFilters.date ||
        isDateInRange(
          requestFilters.date,
          request.start_date,
          request.end_date,
          request.event_date
        );
      const matchesStatus =
        requestFilters.status === "all" ||
        request.status === requestFilters.status;
      const matchesPublic =
        requestFilters.public === "all" ||
        String(isRequestJobPublic(request, jobsById)) === requestFilters.public;

      return matchesSearch && matchesDate && matchesStatus && matchesPublic;
    });
  }, [jobsById, requestFilters, requests]);

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
        getInterpreterFilterStatus(interpreter) === interpreterFilters.status;
      const matchesApproved =
        interpreterFilters.approved === "all" ||
        String(Boolean(interpreter.approved)) === interpreterFilters.approved;

      return matchesSearch && matchesLevel && matchesStatus && matchesApproved;
    }).sort(sortInterpretersForAdmin);
  }, [interpreterFilters, interpreters]);

  const dashboard = useMemo(
    () => {
      const today = new Date().toISOString().slice(0, 10);
      return {
        totalRequests: requests.length,
        todayApplications: jobApplications.filter((application) =>
          String(application.created_at || "").startsWith(today)
        ).length,
        uncheckedApplications: jobApplications.filter((application) =>
          [APPLICATION_STATUS.PENDING, APPLICATION_STATUS.REVIEWING].includes(
            normalizeApplicationStatus(application.status)
          )
        ).length,
        todayMatched: jobApplications.filter(
          (application) =>
            normalizeApplicationStatus(application.status) === APPLICATION_STATUS.ACCEPTED &&
            String(application.created_at || "").startsWith(today)
        ).length,
        ongoingRequests: requests.filter((request) =>
          ONGOING_REQUEST_STATUSES.includes(normalizeMatchingStatus(request.status))
        ).length,
        urgentRequests: requests.filter((request) => isRequestWithinDays(request, 7)).length,
        newInterpreterApplications: interpreters.filter(isPendingInterpreter).length,
      };
    },
    [interpreters, jobApplications, requests]
  );

  const metricCards = [
    {
      label: "전체 의뢰",
      value: `${dashboard.totalRequests}건`,
      targetTab: "requests",
    },
    {
      label: "오늘 신규 지원",
      value: `${dashboard.todayApplications}건`,
      targetTab: "applications",
    },
    {
      label: "미확인 지원",
      value: `${dashboard.uncheckedApplications}건`,
      targetTab: "applications",
    },
    {
      label: "신규 통역사 신청",
      value: `${dashboard.newInterpreterApplications}명`,
      description: "검토가 필요한 통역사",
      targetTab: "interpreters",
      pendingInterpretersOnly: true,
    },
    {
      label: "오늘 매칭 완료",
      value: `${dashboard.todayMatched}건`,
      targetTab: "matching",
    },
    {
      label: "진행중 프로젝트",
      value: `${dashboard.ongoingRequests}건`,
      targetTab: "requests",
    },
    {
      label: "긴급 요청(D-7)",
      value: `${dashboard.urgentRequests}건`,
      targetTab: "requests",
    },
  ];

  const switchToJobsTab = () => {
    setActiveTab("jobs");
  };

  const handleMetricCardClick = (card) => {
    if (card.pendingInterpretersOnly) {
      setInterpreterFilters((current) => ({
        ...current,
        status: "pending",
        approved: "false",
      }));
    }
    setActiveTab(card.targetTab);
  };

  const updateInterpreter = async (id, changes) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    setSavingKey(`interpreter-${id}`);
    const { error } = await supabase
      .from("interpreters")
      .update(changes)
      .eq("id", id);
    setSavingKey("");

    if (error) {
      console.error(error);
      alert("통역사 정보 변경에 실패했습니다.");
      return;
    }

    const interpreter = interpreters.find((item) => item.id === id);
    const isNewApproval =
      changes.approved === true &&
      changes.status === "active" &&
      interpreter &&
      !interpreter.approved;

    setInterpreters((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item))
    );
    setSelectedInterpreter((current) =>
      current?.id === id ? { ...current, ...changes } : current
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
      [name]: value,
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
        ? createRequestEditDraft(request, requestJob)
        : null
    );
  };

  const updateRequestEditDraft = (name, value) => {
    setRequestEditDraft((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const saveInterpreterEditDraft = async () => {
    if (!selectedInterpreter || !interpreterEditDraft) return;

    await updateInterpreter(
      selectedInterpreter.id,
      getInterpreterChangesFromDraft(interpreterEditDraft)
    );
    if (interpreterModalType === "edit") closeInterpreterModal();
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
    if (!activeRequest || !requestEditDraft) return;

    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    const peopleCount = Number(requestEditDraft.people_count || 1);
    const requestPayload = {
      event_name: requestEditDraft.event_name,
      company_name: requestEditDraft.company_name,
      request_type: requestEditDraft.request_type,
      start_date: requestEditDraft.start_date,
      end_date: requestEditDraft.end_date,
      event_date: requestEditDraft.start_date,
      event_location: requestEditDraft.event_location,
      requested_people_count: peopleCount,
      required_count: peopleCount,
      requested_level: requestEditDraft.requested_level,
      required_level: requestEditDraft.requested_level,
      preferred_gender: requestEditDraft.preferred_gender,
      status: getLegacyRequestStatusFromFlow(requestEditDraft),
      assignment_status: normalizeAssignmentStatus(requestEditDraft),
      operation_status: normalizeOperationStatus(requestEditDraft),
      settlement_status: normalizeSettlementFlowStatus(requestEditDraft),
      contact_status: requestEditDraft.contact_status,
      payment_status: requestEditDraft.payment_status,
      is_public: requestEditDraft.is_public === "true",
      is_job_public: requestEditDraft.is_public === "true",
    };
    const jobPayload = {
      event_name: requestEditDraft.event_name,
      title: requestEditDraft.event_name
        ? `${requestEditDraft.event_name} 통역 모집`
        : "통역 모집",
      company_name: requestEditDraft.company_name,
      start_date: requestEditDraft.start_date,
      end_date: requestEditDraft.end_date,
      event_date: requestEditDraft.start_date,
      date: formatDateRange(
        requestEditDraft.start_date,
        requestEditDraft.end_date,
        requestEditDraft.start_date
      ),
      location: requestEditDraft.event_location,
      event_location: requestEditDraft.event_location,
      people_count: peopleCount,
      people: `${peopleCount}명`,
      requested_level: requestEditDraft.requested_level,
      level: requestEditDraft.requested_level,
      preferred_gender: requestEditDraft.preferred_gender,
      visibility: requestEditDraft.is_public === "true" ? "public" : "private",
      ...getJobStatusPayloadFromFlow(requestEditDraft),
    };

    setSavingKey(`request-edit-${activeRequest.id}`);
    try {
      const { data: updatedRequest, error: requestError } =
        await updateRequestWithFallback(activeRequest.id, requestPayload);
      if (requestError) throw requestError;

      let updatedJob = null;
      if (activeRequest.job_id) {
        const { data, error } = await updateJobWithFallback(
          activeRequest.job_id,
          jobPayload
        );
        if (error) throw error;
        updatedJob = data;
      }

      setRequests((current) =>
        current.map((request) =>
          request.id === activeRequest.id
            ? { ...request, ...requestPayload, ...(updatedRequest || {}) }
            : request
        )
      );
      setJobs((current) =>
        updatedJob
          ? current.map((job) =>
              job.id === activeRequest.job_id ? { ...job, ...updatedJob } : job
            )
          : current
      );
      closeRequestModal();
      alert("공고 정보가 저장되었습니다.");
    } catch (error) {
      console.error("공고 수정 실패:", {
        requestId: activeRequest.id,
        jobId: activeRequest.job_id,
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
    const fullPayload = buildJobPayloadFromRequest(request);
    const { data, error } = await supabase
      .from("jobs")
      .insert([fullPayload])
      .select("*")
      .single();

    if (!error) return { data, error: null };

    console.error("jobs insert error:", error);
    if (!isMissingColumnError(error)) return { data: null, error };

    const { data: fallbackData, error: fallbackError } = await supabase
      .from("jobs")
      .insert([buildLegacyJobPayloadFromRequest(request)])
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
    const status = isAssigned ? JOB_STATUS.ASSIGNED : JOB_STATUS.OPEN;
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

  const sendTestEmail = async () => {
    try {
      const result = await sendAutoEmail("test", "onlinkwith@gmail.com", {
        name: "ON-LI TEST",
      });
      console.log("메일 테스트 결과", result);
    } catch (error) {
      console.error("메일 테스트 실패", error);
    }
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
            <button type="button" onClick={sendTestEmail} className="admin-email-test">
              메일 테스트
            </button>
            <button type="button" onClick={fetchAdminData} className="admin-refresh">
              새로고침
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
                  onClick={() => handleMetricCardClick(card)}
                />
              ))}
            </section>

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
                interpreters={interpreters}
                requests={filteredRequests}
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
                updateApplicationStatus={updateJobApplicationStatus}
              />
            )}

            {activeTab === "applications" && (
              <ApplicationManagement
                applications={jobApplications}
                jobsById={jobsById}
                savingKey={savingKey}
                updateApplicationStatus={updateJobApplicationStatus}
                deleteApplication={deleteJobApplication}
              />
            )}

            {activeTab === "matching" && (
              <MatchingManagement
                applications={matchedApplications}
                requests={matchedRequests}
                assignmentsByRequest={assignmentsByRequest}
                jobsById={jobsById}
                requestsByJobId={requestsByJobId}
                interpreters={interpreters}
                savingKey={savingKey}
                updateApplicationStatus={updateJobApplicationStatus}
              />
            )}

            <InterpreterModal
              draft={interpreterEditDraft}
              interpreter={selectedInterpreter}
              modalType={interpreterModalType}
              saving={
                selectedInterpreter
                  ? savingKey === `interpreter-${selectedInterpreter.id}`
                  : false
              }
              onChangeDraft={updateInterpreterEditDraft}
              onClose={closeInterpreterModal}
              onSave={saveInterpreterEditDraft}
            />
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

function AdminModal({ children, onClose, title, titleId }) {
  return (
    <div className="admin-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="admin-modal-card"
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
  if (!draft) return null;

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
            value={draft.event_name || ""}
            onChange={(event) => onChange("event_name", event.target.value)}
          />
        </FieldControl>
        <FieldControl label="기업명">
          <input
            value={draft.company_name || ""}
            onChange={(event) => onChange("company_name", event.target.value)}
          />
        </FieldControl>
        <FieldControl label="의뢰 유형">
          <InlineSelect
            options={[
              { label: "일반의뢰", value: "일반의뢰" },
              { label: "지정의뢰", value: "지정의뢰" },
            ]}
            value={draft.request_type || "일반의뢰"}
            onChange={(value) => onChange("request_type", value)}
          />
        </FieldControl>
        <DateControl
          label="행사 시작일"
          value={draft.start_date || ""}
          onChange={(value) => onChange("start_date", value)}
        />
        <DateControl
          label="행사 종료일"
          value={draft.end_date || ""}
          onChange={(value) => onChange("end_date", value)}
        />
        <FieldControl label="장소">
          <input
            value={draft.event_location || ""}
            onChange={(event) => onChange("event_location", event.target.value)}
          />
        </FieldControl>
        <NumberControl
          label="필요 인원 수"
          value={draft.people_count || 1}
          onChange={(value) => onChange("people_count", value)}
        />
        <FieldControl label="희망 통역 레벨">
          <InlineSelect
            options={LEVELS}
            value={draft.requested_level || "Lv1"}
            onChange={(value) => onChange("requested_level", value)}
          />
        </FieldControl>
        <FieldControl label="희망 성별">
          <input
            value={draft.preferred_gender || ""}
            onChange={(event) => onChange("preferred_gender", event.target.value)}
          />
        </FieldControl>
        <FieldControl label="공개 여부">
          <InlineSelect
            options={[
              { label: "공개", value: "true" },
              { label: "비공개", value: "false" },
            ]}
            value={draft.is_public || "false"}
            onChange={(value) => onChange("is_public", value)}
          />
        </FieldControl>
        <FieldControl label="배정 상태">
          <InlineSelect
            options={ASSIGNMENT_STATUS_OPTIONS}
            value={normalizeAssignmentStatus(draft)}
            onChange={(value) => onChange("assignment_status", value)}
          />
        </FieldControl>
        <FieldControl label="운영 상태">
          <InlineSelect
            options={OPERATION_STATUS_OPTIONS}
            value={normalizeOperationStatus(draft)}
            onChange={(value) => onChange("operation_status", value)}
          />
        </FieldControl>
        <FieldControl label="정산 상태">
          <InlineSelect
            options={SETTLEMENT_FLOW_STATUS_OPTIONS}
            value={normalizeSettlementFlowStatus(draft)}
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
  interpreters,
  jobsById,
  requestsByJobId,
  jobApplicationsByJob,
  onJobsAdminClick,
  requests,
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
  return (
    <section className="admin-section">
      <SectionTitle count={`${requests.length}건`} title="의뢰 관리" />
      <div className="admin-filters admin-request-filters">
        <input
          value={filters.search}
          onChange={(event) =>
            setFilters((current) => ({ ...current, search: event.target.value }))
          }
          placeholder="기업명/행사명 검색"
        />
        <input
          type="date"
          value={filters.date}
          onChange={(event) =>
            setFilters((current) => ({ ...current, date: event.target.value }))
          }
        />
        <select
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value }))
          }
        >
          <option value="all">전체 상태</option>
          {REQUEST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {getMatchingStatusLabel(status)}
            </option>
          ))}
        </select>
        <select
          value={filters.public}
          onChange={(event) =>
            setFilters((current) => ({ ...current, public: event.target.value }))
          }
        >
          <option value="all">공개 전체</option>
          <option value="true">공개</option>
          <option value="false">비공개</option>
        </select>
      </div>

      {requests.length === 0 ? (
        <MessageBox text="조건에 맞는 의뢰가 없습니다." />
      ) : (
        <div className="admin-request-card-grid">
          {requests.map((request) => (
            <AdminRequestCard
              key={request.id}
              applicationsExpanded={applicationsRequestId === request.id}
              assignmentDrafts={assignmentDrafts}
              assignments={assignmentsByRequest.get(request.id) || []}
              expanded={expandedRequestId === request.id}
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
  applicationsExpanded,
  assignmentDrafts,
  assignments,
  expanded,
  interpreters,
  jobApplications,
  jobsById,
  requestsByJobId,
  onJobsAdminClick,
  request,
  savingKey,
  setAssignmentDrafts,
  setApplicationsRequestId,
  setExpandedRequestId,
  assignInterpreter,
  handlePriceDraft,
  saveSettlement,
  removeAssignment,
  updateRequest,
  updateApplicationStatus,
  deleteRequest,
  toggleRequestJobPublic,
  updateRequestFlowStatus,
  openRequestModal,
}) {
  const job = request.job_id ? jobsById.get(request.job_id) : null;
  const linkedRequest = request.job_id ? requestsByJobId.get(String(request.job_id)) : null;
  const flowSource = getRequestFlowSource(request, job);
  const jobPublicState = getRequestJobPublicState(request, job);
  const requestType = getDesignatedRequestType(request, job, linkedRequest);
  const designatedInterpreterName = getDesignatedInterpreterName(
    [request, job, linkedRequest],
    interpreters
  );
  const assignedInterpreterName = getAssignedInterpreterName(
    request,
    assignments,
    interpreters
  );
  return (
    <article className="admin-request-card">
      <div className="admin-request-card-head">
        <div>
          <span className="admin-request-id">#{request.id}</span>
          <h3 title={request.event_name || ""}>{request.event_name || "-"}</h3>
        </div>
        <OperationFlowStatusControls
          item={flowSource}
          disabled={savingKey === `request-${request.id}`}
          onChange={(changes) => updateRequestFlowStatus(request, changes)}
        />
      </div>

      <dl className="admin-request-summary">
        <Info label="기업명" value={request.company_name || "-"} />
        <Info label="의뢰 유형" value={requestType.label} />
        <Info label="지정 통역사" value={designatedInterpreterName} />
        <Info label="배정 통역사" value={assignedInterpreterName} />
        <Info label="약관 동의" value={getAgreementStatusLabel(request)} />
        <Info label="동의 시간" value={formatDateTime(request.agreed_at)} />
        <Info
          label="날짜"
          value={formatDateRange(
            request.start_date,
            request.end_date,
            request.event_date
          )}
        />
        <Info label="장소" value={request.event_location || "-"} />
        <Info label="공개 여부" value={jobPublicState.label} />
      </dl>

      <div className="admin-request-actions">
        <button
          type="button"
          className="admin-link-button"
          onClick={() => openRequestModal("applicants", request)}
        >
          지원자 확인 ({jobApplications.length}명)
        </button>
        <button
          type="button"
          className="admin-link-button"
          disabled={savingKey === `request-job-${request.id}`}
          onClick={() => openRequestModal("visibility", request)}
        >
          {jobPublicState.type === "public" ? "비공개 전환" : "공고 공개"}
        </button>
        {request.job_id && (
          <button
            type="button"
            className="admin-link-button"
            onClick={() => openRequestModal("edit", request)}
          >
            공고 수정
          </button>
        )}
        <button
          type="button"
          className="admin-link-button"
          onClick={() => openRequestModal("detail", request)}
        >
          상세 보기
        </button>
        <button
          type="button"
          className="admin-link-button danger"
          disabled={savingKey === `request-delete-${request.id}`}
          onClick={() => openRequestModal("delete", request)}
        >
          삭제
        </button>
      </div>
    </article>
  );
}

function RequestDetailPanel({
  applications,
  assignmentDrafts,
  assignments,
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

  return (
    <div className="admin-detail-panel">
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
        <div className="admin-settlement">
          <DateControl
            label="시작일"
            value={getDateRangeStart(request.start_date, request.event_date)}
            onChange={(value) => {
              const end = getDateRangeEnd(request.end_date, request.event_date);
              if (end && end < value) {
                alert("종료일은 시작일보다 빠를 수 없습니다.");
                return;
              }
              updateRequest(request.id, {
                start_date: value,
                event_date: value,
              });
            }}
          />
          <DateControl
            label="종료일"
            value={getDateRangeEnd(request.end_date, request.event_date)}
            onChange={(value) => {
              const start = getDateRangeStart(request.start_date, request.event_date);
              if (value < start) {
                alert("종료일은 시작일보다 빠를 수 없습니다.");
                return;
              }
              updateRequest(request.id, { end_date: value });
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
  interpreters = [],
  onRemoveAssignment,
  onStatusChange,
}) {
  const [openApplicantId, setOpenApplicantId] = useState(null);
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

        return (
          <article key={application.rowId} className="admin-applicant-accordion-item">
            <button
              type="button"
              className="admin-applicant-summary"
              aria-expanded={expanded}
              onClick={() => toggleRow(application.rowId)}
            >
              <StatusBadge status={status} />
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
                  <strong>{application.applicant_name || "이름 미입력"}</strong>
                  <StatusBadge status={status} />
                  <span>{sourceLabel}</span>
                </div>

                <div className="admin-applicant-detail-grid">
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
          {INTERPRETER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {getInterpreterStatusLabel({ status, approved: status === "active" })}
            </option>
          ))}
        </select>
        <select
          value={filters.approved}
          onChange={(event) =>
            setFilters((current) => ({ ...current, approved: event.target.value }))
          }
        >
          <option value="all">전체 승인</option>
          <option value="false">승인 대기</option>
          <option value="true">승인 완료</option>
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
  interpreter,
  savingKey,
  onOpenModal,
  updateInterpreter,
  deleteInterpreter,
}) {
  const approvalLabel = getInterpreterStatusLabel(interpreter);
  const isSaving = savingKey === `interpreter-${interpreter.id}`;

  return (
    <article className="admin-list-card admin-interpreter-card">
      <div className="admin-list-card-head">
        <div>
          <span className="admin-card-meta">통역사</span>
          <h3>{interpreter.name || "이름 미입력"}</h3>
        </div>
        <StatusBadge status={approvalLabel} />
      </div>

      <dl className="admin-card-summary">
        <Info label="레벨" value={normalizeLevel(interpreter.level)} />
        <Info label="승인 상태" value={interpreter.approved ? "승인 완료" : "승인 대기"} />
        <Info label="활동 상태" value={approvalLabel} />
        <Info label="활동 지역" value={formatListOrMissing(interpreter.available_regions)} />
        <Info label="전문 분야" value={formatListOrMissing(interpreter.specialties)} />
        <Info label="통역 경험" value={getExperienceLabel(interpreter)} />
        <Info label="경고" value={`${interpreter.warning_count || 0}회`} />
      </dl>

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
              approved: true,
              status: "active",
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
              approved: false,
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
  interpreter,
  modalType,
  saving,
  onChangeDraft,
  onClose,
  onSave,
}) {
  if (!interpreter || !modalType) return null;

  const approvalLabel = getInterpreterStatusLabel(interpreter);
  const levelLabel = normalizeLevel(interpreter.level);
  const approvalStatus = interpreter.approved ? "승인 완료" : "승인 대기";
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
                  <span className="status-badge badge-blue">{levelLabel}</span>
                  <StatusBadge status={approvalStatus} />
                  <StatusBadge status={approvalLabel} />
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
                <InterpreterDetailItem label="승인 상태" value={approvalStatus} />
                <InterpreterDetailItem label="활동 상태" value={approvalLabel} />
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
                <InterpreterDetailItem label="운영 메모" value={managementMemo} />
                <InterpreterDetailItem label="공개 노출" value="관리자 전용 정보" />
              </InterpreterDetailSection>
            </div>

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
              <FieldControl label="레벨">
                <InlineSelect
                  options={LEVELS}
                  value={draft?.level || "Lv1"}
                  onChange={(value) => onChangeDraft("level", value)}
                />
              </FieldControl>
              <FieldControl label="승인 상태">
                <InlineSelect
                  options={[
                    { label: "승인 대기", value: "false" },
                    { label: "승인 완료", value: "true" },
                  ]}
                  value={draft?.approved || "false"}
                  onChange={(value) => onChangeDraft("approved", value)}
                />
              </FieldControl>
              <FieldControl label="활동 상태">
                <InlineSelect
                  options={INTERPRETER_STATUSES.map((status) => ({
                    value: status,
                    label: getInterpreterStatusLabel({
                      status,
                      approved: status === "active",
                    }),
                  }))}
                  value={draft?.status || "pending"}
                  onChange={(value) => onChangeDraft("status", value)}
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
              <FieldControl label="JLPT 여부">
                <input
                  value={draft?.jlpt || ""}
                  onChange={(event) => onChangeDraft("jlpt", event.target.value)}
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
  jobsById,
  savingKey,
  updateApplicationStatus,
  deleteApplication,
}) {
  const duplicateApplicationIds = useMemo(
    () => getDuplicateApplicationIdSet(applications),
    [applications]
  );

  return (
    <section className="admin-section">
      <SectionTitle count={`${applications.length}명`} title="지원자 관리" />
      {applications.length === 0 ? (
        <MessageBox text="아직 접수된 지원자가 없습니다." />
      ) : (
        <div className="admin-management-card-grid">
          {applications.map((application) => {
            const job = application.jobs || jobsById.get(application.job_id);

            return (
              <ApplicationCard
                key={application.id}
                application={application}
                job={job}
                savingKey={savingKey}
                updateApplicationStatus={updateApplicationStatus}
                deleteApplication={deleteApplication}
                duplicateSuspected={duplicateApplicationIds.has(application.id)}
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
  savingKey,
  updateApplicationStatus,
  deleteApplication,
  duplicateSuspected,
}) {
  return (
    <article className="admin-list-card">
      <div className="admin-list-card-head">
        <div>
          <span className="admin-card-meta">지원자</span>
          <h3 title={application.applicant_name || ""}>
            {application.applicant_name || "이름 미입력"}
          </h3>
        </div>
        <div className="admin-card-chip-row">
          {duplicateSuspected && (
            <span className="admin-duplicate-badge">중복 의심</span>
          )}
          <StatusBadge status={application.status || APPLICATION_STATUS.PENDING} />
        </div>
      </div>

      <dl className="admin-card-summary">
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

function MatchingManagement({
  applications,
  requests,
  assignmentsByRequest,
  jobsById,
  requestsByJobId,
  interpreters,
  savingKey,
  updateApplicationStatus,
}) {
  const totalCount = applications.length + requests.length;

  return (
    <section className="admin-section">
      <SectionTitle count={`${totalCount}건`} title="매칭 관리" />
      {totalCount === 0 ? (
        <MessageBox text="아직 배정완료된 의뢰가 없습니다." />
      ) : (
        <div className="admin-management-card-grid">
          {requests.map((request) => (
            <MatchingRequestCard
              key={`request-${request.id}`}
              request={request}
              assignments={assignmentsByRequest.get(request.id) || []}
              interpreters={interpreters}
            />
          ))}
          {applications.map((application) => {
            const job = jobsById.get(application.job_id) || application.jobs;
            const request = application.job_id
              ? requestsByJobId.get(String(application.job_id))
              : null;
            const requestType = getDesignatedRequestType(request, job);
            const designatedInterpreterName = getDesignatedInterpreterName(
              [request, job],
              interpreters
            );

            return (
              <MatchingCard
                key={application.id}
                application={application}
                job={job}
                request={request}
                requestType={requestType}
                designatedInterpreterName={designatedInterpreterName}
                savingKey={savingKey}
                updateApplicationStatus={updateApplicationStatus}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function MatchingRequestCard({ request, assignments, interpreters }) {
  const assignedInterpreterName = getAssignedInterpreterName(
    request,
    assignments,
    interpreters
  );
  const peopleCount = request.requested_people_count || request.required_count;
  const clientPrice = getCompanyAmount(request);
  const interpreterPrice = getInterpreterPayment(request);
  const platformProfit = getPlatformProfit(request);

  return (
    <article className="admin-list-card">
      <div className="admin-list-card-head">
        <div>
          <span className="admin-card-meta">의뢰 매칭</span>
          <h3 title={request.event_name || ""}>{request.event_name || "-"}</h3>
        </div>
        <StatusBadge
          status={normalizeMatchingStatus(request.status || request.matching_status)}
        />
      </div>

      <dl className="admin-card-summary">
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
        <Info label="장소" value={request.event_location || request.location || "-"} />
        <Info label="배정 통역사" value={assignedInterpreterName} />
        <Info label="필요 인원 수" value={peopleCount ? `${peopleCount}명` : "-"} />
        <Info label="기업 금액" value={formatJPY(clientPrice)} />
        <Info label="통역사 지급액" value={formatJPY(interpreterPrice)} />
        <Info label="플랫폼 수익" value={formatJPY(platformProfit)} />
        <Info label="결제 상태" value={getStatusLabel(request.payment_status || "unpaid")} />
        <Info
          label="정산 상태"
          value={getSettlementFlowStatusLabel(normalizeSettlementFlowStatus(request))}
        />
      </dl>
    </article>
  );
}

function MatchingCard({
  application,
  job,
  request,
  requestType,
  designatedInterpreterName,
  savingKey,
  updateApplicationStatus,
}) {
  const peopleCount =
    request?.requested_people_count ||
    request?.required_count ||
    job?.people_count ||
    job?.people;
  const clientPrice = getCompanyAmount(request);
  const interpreterPrice = getInterpreterPayment(request);
  const platformProfit = getPlatformProfit(request);

  return (
    <article className="admin-list-card">
      <div className="admin-list-card-head">
        <div>
          <span className="admin-card-meta">매칭</span>
          <h3 title={getJobDisplayTitle(job, application.job_id)}>
            {getJobDisplayTitle(job, application.job_id)}
          </h3>
        </div>
        <StatusBadge status={normalizeApplicationStatus(application.status)} />
      </div>

      <dl className="admin-card-summary">
        <Info label="기업명" value={request?.company_name || job?.company_name || "-"} />
        <Info label="행사명" value={job?.event_name || request?.event_name || "-"} />
        <Info
          label="행사 기간"
          value={formatDateRange(job?.start_date, job?.end_date, job?.event_date || job?.date)}
        />
        <Info label="장소" value={job?.event_location || job?.location || "-"} />
        <Info label="배정 통역사" value={application.applicant_name || "이름 미입력"} />
        <Info label="필요 인원 수" value={peopleCount ? `${peopleCount}`.replace(/명$/, "") + "명" : "-"} />
        <Info label="기업 금액" value={formatJPY(clientPrice)} />
        <Info label="통역사 지급액" value={formatJPY(interpreterPrice)} />
        <Info label="플랫폼 수익" value={formatJPY(platformProfit)} />
        <Info label="결제 상태" value={getStatusLabel(request?.payment_status || "unpaid")} />
        <Info
          label="정산 상태"
          value={getSettlementFlowStatusLabel(normalizeSettlementFlowStatus(request || {}))}
        />
      </dl>

      <div className="admin-card-chip-row">
        <span className={`status-badge ${requestType.isDesignated ? "badge-designated" : "badge-neutral"}`}>
          {requestType.label}
        </span>
        <span className="admin-empty-chip">지정 통역사: {designatedInterpreterName || "-"}</span>
        <span className="admin-empty-chip">{application.phone || "연락처 미입력"}</span>
      </div>

      <div className="admin-card-controls-grid single">
        <FieldControl label="매칭 상태">
          <InlineSelect
            options={JOB_APPLICATION_STATUSES}
            value={normalizeApplicationStatus(application.status)}
            disabled={savingKey === `job-application-${application.id}`}
            onChange={(value) => updateApplicationStatus(application, value)}
          />
        </FieldControl>
      </div>
    </article>
  );
}

function MetricCard({ label, value, description, onClick }) {
  return (
    <button type="button" className="admin-metric-card" onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
      {description && <small>{description}</small>}
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

function StatusBadge({ status }) {
  const normalized = status || APPLICATION_STATUS.PENDING;
  return (
    <span className={`status-badge ${getStatusBadgeClass(normalized)}`}>
      {getStatusLabel(normalized)}
    </span>
  );
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

function DateControl({ label, value, onChange }) {
  return (
    <label className="admin-field-control">
      <span>{label}</span>
      <input
        type="date"
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
    status: JOB_STATUS.OPEN,
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

  return {
    event_name: request.event_name || job?.event_name || "",
    company_name: request.company_name || job?.company_name || "",
    request_type: request.request_type || getDesignatedRequestType(request, job).label,
    start_date: getDateRangeStart(request.start_date || job?.start_date, request.event_date || job?.event_date),
    end_date: getDateRangeEnd(request.end_date || job?.end_date, request.event_date || job?.event_date),
    event_location: request.event_location || job?.event_location || job?.location || "",
    people_count: request.requested_people_count || request.required_count || job?.people_count || 1,
    requested_level: request.requested_level || request.required_level || job?.requested_level || job?.level || "Lv1",
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
    status: JOB_STATUS.OPEN,
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

function isDateInRange(date, startDate, endDate, fallbackDate) {
  const start = startDate || fallbackDate;
  const end = endDate || fallbackDate;
  if (!start) return false;
  if (!end) return date === start;
  return start <= date && date <= end;
}

function isRequestWithinDays(request, days) {
  const date = getDateRangeStart(request.start_date, request.event_date);
  if (!date) return false;

  const today = new Date();
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return false;

  const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= days;
}

function isRequestVisibleInMatching(request, assignments = []) {
  return (
    normalizeMatchingStatus(request.matching_status) === MATCHING_STATUS.ASSIGNED ||
    normalizeMatchingStatus(request.status) === MATCHING_STATUS.ASSIGNED ||
    Boolean(
      request.assigned_interpreter_id ||
        request.assigned_interpreter_name ||
        request.matched_interpreter_id ||
        request.matched_interpreter_name
    ) ||
    assignments.length > 0
  );
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

  return {
    assignment_status: assignmentStatus,
    operation_status: operationStatus,
    settlement_status: settlementStatus,
    status: JOB_STATUS.OPEN,
  };
}

function getOperationFlowBadgeClass(type, value) {
  if (type === "assignment") return getAssignmentStatusBadgeClass(value);
  if (type === "operation") return getOperationStatusBadgeClass(value);
  return getSettlementFlowStatusBadgeClass(value);
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
    gender: interpreter.gender || "",
    age: interpreter.age || "",
    region: interpreter.region || "",
    level: interpreter.level || "Lv1",
    approved: String(Boolean(interpreter.approved)),
    status: getInterpreterFilterStatus(interpreter),
    warning_count: interpreter.warning_count || 0,
    jlpt: interpreter.jlpt || "",
    stay_period: interpreter.stay_period || "",
    school: interpreter.school || "",
    has_experience: String(Boolean(interpreter.has_experience)),
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
    gender: draft.gender,
    age: draft.age,
    region: draft.region,
    level: draft.level,
    approved: draft.approved === "true",
    status: draft.status,
    warning_count: Math.max(0, Number(draft.warning_count || 0)),
    jlpt: draft.jlpt,
    stay_period: draft.stay_period,
    school: draft.school,
    has_experience: draft.has_experience === "true",
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
  if (interpreter.status === "rejected") return "rejected";
  if (interpreter.approved) return interpreter.status || "active";
  return "pending";
}

function isPendingInterpreter(interpreter = {}) {
  const status = String(interpreter.status || "").toLowerCase();
  return !interpreter.approved && !["rejected", "suspended", "반려"].includes(status);
}

function getInterpreterStatusLabel(interpreter = {}) {
  if (interpreter.status === "rejected") return "반려";
  if (isPendingInterpreter(interpreter)) return "승인 대기";
  if (interpreter.approved) return "승인 완료";
  return getStatusLabel(interpreter.status) || "승인 대기";
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
