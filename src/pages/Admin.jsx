import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
import AdminJobs from "./AdminJobs";
import { normalizeJobVisibility } from "../utils/jobStatus";
import { formatDateRange, getDateRangeEnd, getDateRangeStart } from "../utils/dateRange";
import { fetchJobApplications as fetchBaseJobApplications } from "../utils/jobsApi";
import { normalizeLevel } from "../utils/levelBadge";
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
  "pending",
  "matching",
  "confirmed",
  "completed",
  "cancelled",
];
const CONTACT_STATUSES = [
  "not_contacted",
  "contacted",
  "group_created",
  "meeting_done",
];
const PAYMENT_STATUSES = ["unpaid", "paid"];
const JOB_APPLICATION_STATUSES = ["지원완료", "검토중", "매칭완료", "보류", "불합격"];
const ONGOING_REQUEST_STATUSES = ["pending", "matching", "confirmed"];
const STATUS_LABELS = {
  pending: "대기",
  active: "활동중",
  warning: "경고",
  suspended: "정지",
  matching: "매칭중",
  confirmed: "확정",
  completed: "완료",
  cancelled: "취소",
  not_contacted: "미연락",
  contacted: "연락완료",
  group_created: "단톡방 생성",
  meeting_done: "미팅완료",
  unpaid: "미결제",
  paid: "결제완료",
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
        email,
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

  useEffect(() => {
    if (!interpreterModalType) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeInterpreterModal();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeInterpreterModal, interpreterModalType]);

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
        (application) => application.status === "매칭완료"
      ),
    [jobApplications]
  );

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
          ["지원완료", "검토중"].includes(application.status || "지원완료")
        ).length,
        todayMatched: jobApplications.filter(
          (application) =>
            application.status === "매칭완료" &&
            String(application.created_at || "").startsWith(today)
        ).length,
        ongoingRequests: requests.filter((request) =>
          ONGOING_REQUEST_STATUSES.includes(request.status || "pending")
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

    setInterpreters((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item))
    );
    setSelectedInterpreter((current) =>
      current?.id === id ? { ...current, ...changes } : current
    );
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
    setInterpreterEditDraft(
      modalType === "edit" ? createInterpreterEditDraft(interpreter) : null
    );
  };

  const updateInterpreterEditDraft = (name, value) => {
    setInterpreterEditDraft((current) => ({
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
    closeInterpreterModal();
  };

  const updateRequest = async (id, changes) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    const request = requests.find((item) => item.id === id);
    const nextClientPrice =
      changes.client_price !== undefined
        ? Number(changes.client_price || 0)
        : Number(request?.client_price || 0);
    const nextInterpreterPrice =
      changes.interpreter_price !== undefined
        ? Number(changes.interpreter_price || 0)
        : Number(request?.interpreter_price || 0);
    const payload = {
      ...changes,
      profit: nextClientPrice - nextInterpreterPrice,
    };

    setSavingKey(`request-${id}`);
    const { error } = await supabase
      .from("requests")
      .update(payload)
      .eq("id", id);
    setSavingKey("");

    if (error) {
      console.error(error);
      alert("의뢰 정보 변경에 실패했습니다.");
      return;
    }

    setRequests((current) =>
      current.map((item) => (item.id === id ? { ...item, ...payload } : item))
    );
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
        return;
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
    } catch (error) {
      console.error("request job visibility error:", error);
      alert("공고 공개 처리에 실패했습니다.");
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
    setRequests((current) =>
      current.map((request) => {
        if (request.id !== requestId) return request;
        const nextRequest = { ...request, [field]: value };
        nextRequest.profit =
          Number(nextRequest.client_price || 0) -
          Number(nextRequest.interpreter_price || 0);
        return nextRequest;
      })
    );
  };

  const assignInterpreter = async (requestId) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    const interpreterId = Number(assignmentDrafts[requestId]);

    if (!interpreterId) {
      alert("배정할 통역사를 선택해주세요.");
      return;
    }

    setSavingKey(`assign-${requestId}`);
    const { error } = await supabase.from("request_interpreters").insert([
      {
        request_id: requestId,
        interpreter_id: interpreterId,
      },
    ]);
    setSavingKey("");

    if (error) {
      console.error(error);
      alert(
        error.code === "23505"
          ? "이미 배정된 통역사입니다."
          : "통역사 배정에 실패했습니다."
      );
      return;
    }

    setAssignmentDrafts((current) => ({ ...current, [requestId]: "" }));
    fetchAdminData();
  };

  const removeAssignment = async (assignmentId) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    setSavingKey(`assignment-${assignmentId}`);
    const { error } = await supabase
      .from("request_interpreters")
      .delete()
      .eq("id", assignmentId);
    setSavingKey("");

    if (error) {
      console.error(error);
      alert("배정 해제에 실패했습니다.");
      return;
    }

    setAssignments((current) =>
      current.filter((assignment) => assignment.id !== assignmentId)
    );
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

      if (askAssignJob && status === "매칭완료" && jobId) {
        const shouldAssignJob = window.confirm(
          "이 공고를 배정완료로 변경할까요?"
        );

        if (shouldAssignJob) {
          const { error: jobError } = await supabase
            .from("jobs")
            .update({ status: "assigned", is_urgent: false })
            .eq("id", jobId);

          if (jobError) {
            console.error("공고 상태 변경 실패:", jobError);
            alert(jobError.message);
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

    const ok = window.confirm(
      "정말 이 의뢰를 삭제하시겠습니까? 삭제 후 복구할 수 없습니다."
    );
    if (!ok) return;

    setSavingKey(`request-delete-${request.id}`);

    try {
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

          <button type="button" onClick={fetchAdminData} className="admin-refresh">
            새로고침
          </button>
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
                setFilters={setRequestFilters}
                assignInterpreter={assignInterpreter}
                handlePriceDraft={handlePriceDraft}
                removeAssignment={removeAssignment}
                updateRequest={updateRequest}
                updateApplicationStatus={updateJobApplicationStatus}
                deleteRequest={deleteRequest}
                toggleRequestJobPublic={toggleRequestJobPublic}
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
            />{selectedRequest && (
      <div
        className="admin-modal-backdrop"
        onClick={() => setSelectedRequest(null)}
      >
        <div
          className="admin-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="admin-modal-header">
            <h2>의뢰 상세</h2>

            <button
              type="button"
              className="admin-modal-close"
              onClick={() => setSelectedRequest(null)}
            >
              ×
            </button>
          </div>

          <div className="admin-modal-body">
            <p>
              <strong>제목</strong>
              <br />
              {selectedRequest.title || "-"}
            </p>

            <p>
              <strong>장소</strong>
              <br />
              {selectedRequest.location || "-"}
            </p>

            <p>
              <strong>일정</strong>
              <br />
              {selectedRequest.start_date || "-"} ~{" "}
              {selectedRequest.end_date || "-"}
            </p>

            <p>
              <strong>인원</strong>
              <br />
              {selectedRequest.people || "-"}
            </p>

            <p>
              <strong>레벨</strong>
              <br />
              {selectedRequest.level || "-"}
            </p>

            <p>
              <strong>상태</strong>
              <br />
              {selectedRequest.status || "-"}
            </p>

            <p>
              <strong>의뢰 내용</strong>
              <br />
              {selectedRequest.description ||
                selectedRequest.preference ||
                "-"}
            </p>
          </div>
        </div>
      </div>
    )}
          
          </>
        )}
      </div>
    </div>
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
  setFilters,
  assignInterpreter,
  handlePriceDraft,
  removeAssignment,
  updateRequest,
  updateApplicationStatus,
  deleteRequest,
  toggleRequestJobPublic,
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
              {getStatusLabel(status)}
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
              removeAssignment={removeAssignment}
              updateRequest={updateRequest}
              updateApplicationStatus={updateApplicationStatus}
              deleteRequest={deleteRequest}
              toggleRequestJobPublic={toggleRequestJobPublic}
              setSelectedRequest={setSelectedRequest}
            
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
  removeAssignment,
  updateRequest,
  updateApplicationStatus,
  deleteRequest,
  toggleRequestJobPublic,
  setSelectedRequest,
}) {
  const job = request.job_id ? jobsById.get(request.job_id) : null;
  const linkedRequest = request.job_id ? requestsByJobId.get(String(request.job_id)) : null;
  const jobPublicState = getRequestJobPublicState(request, job);
  const requestType = getDesignatedRequestType(request, job, linkedRequest);
  const designatedInterpreterName = getDesignatedInterpreterName(
    [request, job, linkedRequest],
    interpreters
  );

  return (
    <article className="admin-request-card">
      <div className="admin-request-card-head">
        <div>
          <span className="admin-request-id">#{request.id}</span>
          <h3 title={request.event_name || ""}>{request.event_name || "-"}</h3>
        </div>
        <StatusBadge status={request.status || "pending"} />
      </div>

      <dl className="admin-request-summary">
        <Info label="기업명" value={request.company_name || "-"} />
        <Info label="의뢰 유형" value={requestType.label} />
        <Info label="지정 통역사" value={designatedInterpreterName} />
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

      <div className="admin-request-controls">
        <FieldControl label="의뢰 상태">
          <InlineSelect
            options={REQUEST_STATUSES}
            value={request.status || "pending"}
            onChange={(value) => updateRequest(request.id, { status: value })}
          />
        </FieldControl>
        <FieldControl label="연락 상태">
          <InlineSelect
            options={CONTACT_STATUSES}
            value={request.contact_status || "not_contacted"}
            onChange={(value) =>
              updateRequest(request.id, { contact_status: value })
            }
          />
        </FieldControl>
        <FieldControl label="결제 상태">
          <InlineSelect
            options={PAYMENT_STATUSES}
            value={request.payment_status || "unpaid"}
            onChange={(value) =>
              updateRequest(request.id, { payment_status: value })
            }
          />
        </FieldControl>
      </div>

      <div className="admin-request-actions">
        <button
          type="button"
          className="admin-link-button"
          onClick={() =>
            setApplicationsRequestId(applicationsExpanded ? null : request.id)
          }
        >
          지원자 확인 ({jobApplications.length}명)
        </button>
        <button
          type="button"
          className="admin-link-button"
          disabled={savingKey === `request-job-${request.id}`}
          onClick={() =>
            toggleRequestJobPublic(request, jobPublicState.type !== "public")
          }
        >
          {jobPublicState.type === "public" ? "비공개 전환" : "공고 공개"}
        </button>
        {request.job_id && (
          <button
            type="button"
            className="admin-link-button"
            onClick={onJobsAdminClick}
          >
            공고 수정
          </button>
        )}
        <button
          type="button"
          className="admin-link-button"
          onClick={() => setExpandedRequest(request)}
        >
          {expanded ? "닫기" : "상세 보기"}
        </button>
        <button
          type="button"
          className="admin-link-button danger"
          disabled={savingKey === `request-delete-${request.id}`}
          onClick={() => setSelectedRequest(job)}
        >
          삭제
        </button>
      </div>

      {applicationsExpanded && (
        <JobApplicationsPanel
          applications={jobApplications}
          onStatusChange={updateApplicationStatus}
        />
      )}
      
    </article>
  );
}

function RequestDetailPanel({
  applications,
  assignmentDrafts,
  assignments,
  interpreters,
  request,
  savingKey,
  setAssignmentDrafts,
  assignInterpreter,
  handlePriceDraft,
  removeAssignment,
  updateRequest,
  updateApplicationStatus,
}) {
  const requestType = getDesignatedRequestType(request);
  const designatedInterpreterName = getDesignatedInterpreterName([request], interpreters);

  return (
    <div className="admin-detail-panel">
      <div>
        <h3>의뢰 기본 정보</h3>
        <dl className="admin-detail-list compact">
          <Info label="담당자" value={request.manager_name} />
          <Info label="의뢰 유형" value={requestType.label} />
          <Info label="지정 통역사" value={designatedInterpreterName} />
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
            value={request.client_price || 0}
            onChange={(value) => handlePriceDraft(request.id, "client_price", value)}
          />
          <NumberControl
            label="통역사 지급"
            value={request.interpreter_price || 0}
            onChange={(value) =>
              handlePriceDraft(request.id, "interpreter_price", value)
            }
          />
          <div className="admin-profit">
            <span>플랫폼 수익</span>
            <strong>{formatKRW(request.profit || 0)}</strong>
          </div>
          <button
            type="button"
            className="admin-save"
            disabled={savingKey === `request-${request.id}`}
            onClick={() =>
              updateRequest(request.id, {
                client_price: Number(request.client_price || 0),
                interpreter_price: Number(request.interpreter_price || 0),
              })
            }
          >
            정산 저장
          </button>
        </div>
      </div>

      <div>
        <h3>매칭 통역사</h3>
        <ChipList
          emptyText="미배정"
          items={assignments.map((assignment) => ({
            id: assignment.id,
            label: assignment.interpreter?.name || "이름 미입력",
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
            {interpreters
              .filter(
                (interpreter) =>
                  interpreter.approved && interpreter.status !== "suspended"
              )
              .map((interpreter) => (
                <option key={interpreter.id} value={interpreter.id}>
                  {interpreter.name || "이름 미입력"} · {interpreter.level || "Lv 미정"}
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
          onStatusChange={updateApplicationStatus}
        />
      </div>
    </div>
  );
}

function JobApplicationsPanel({ applications, onStatusChange }) {
  if (applications.length === 0) {
    return <span className="admin-empty-chip">이 공고에는 아직 지원자가 없습니다.</span>;
  }

  return (
    <div className="admin-nested-card-list">
      {applications.map((application) => (
        <article key={application.id} className="admin-nested-card">
          <div className="admin-list-card-head compact">
            <div>
              <span className="admin-card-meta">{formatDate(application.created_at)}</span>
              <h3>{application.applicant_name || "이름 미입력"}</h3>
            </div>
            <StatusBadge status={application.status || "지원완료"} />
          </div>

          <dl className="admin-card-summary compact">
            <Info label="성별" value={application.gender || "-"} />
            <Info label="언어" value={getApplicationLanguage(application)} />
            <Info label="경력" value={application.experience || application.career || "-"} />
            <Info label="연락처" value={application.phone || "연락처 미입력"} />
            <Info label="이메일" value={application.email || "-"} />
            <Info label="메모" value={application.message || "지원 메모 없음"} />
          </dl>

          {onStatusChange ? (
            <div className="admin-card-actions">
              {application.status === "매칭완료" ? (
                <StatusBadge status="매칭완료" />
              ) : (
                <button
                  type="button"
                  className="admin-link-button primary"
                  onClick={() =>
                    onStatusChange(application, "매칭완료", {
                      confirmMessage: "이 지원자를 매칭완료로 변경하시겠습니까?",
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
                disabled={application.status === "보류"}
                onClick={() =>
                  onStatusChange(application, "보류", {
                    confirmMessage: "이 지원자를 보류 상태로 변경하시겠습니까?",
                  })
                }
              >
                보류
              </button>
              <button
                type="button"
                className="admin-link-button danger"
                disabled={application.status === "불합격"}
                onClick={() =>
                  onStatusChange(application, "불합격", {
                    confirmMessage: "이 지원자를 불합격 상태로 변경하시겠습니까?",
                  })
                }
              >
                불합격
              </button>
            </div>
          ) : null}
        </article>
      ))}
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
  const managementMemo =
    interpreter.admin_memo ||
    interpreter.management_memo ||
    interpreter.memo ||
    interpreter.note ||
    "";

  return (
    <div className="admin-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="admin-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="interpreter-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <div>
            <span className="admin-card-meta">INTERPRETER</span>
            <h2 id="interpreter-modal-title">
              {modalType === "detail" ? "통역사 상세 정보" : "통역사 정보 수정"}
            </h2>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose}>
            닫기
          </button>
        </div>

        {modalType === "detail" ? (
          <div className="admin-modal-sections">
            <ModalInfoSection title="기본 정보">
              <Info label="이름" value={interpreter.name || "미입력"} />
              <Info label="성별" value={interpreter.gender || "미입력"} />
              <Info label="나이" value={interpreter.age || "미입력"} />
              <Info label="레벨" value={normalizeLevel(interpreter.level)} />
              <Info label="승인 상태" value={interpreter.approved ? "승인 완료" : "승인 대기"} />
              <Info label="활동 상태" value={approvalLabel} />
            </ModalInfoSection>

            <ModalInfoSection title="프로필 정보" twoColumn>
              <Info label="언어 수준" value={interpreter.language_level || interpreter.level || "미입력"} />
              <Info label="JLPT 여부" value={interpreter.jlpt || "미입력"} />
              <Info label="통역 경험 여부" value={getExperienceLabel(interpreter)} />
              <Info
                label="통역 경험 횟수"
                value={
                  interpreter.experience_count || interpreter.experience_count === 0
                    ? `${interpreter.experience_count}회`
                    : "미입력"
                }
              />
              <Info label="가능 업무" value={interpreter.available_tasks || "미입력"} />
              <Info label="전문 분야" value={formatListOrMissing(interpreter.specialties)} />
              <Info label="활동 가능 지역" value={formatListOrMissing(interpreter.available_regions)} />
              <Info label="일본 체류 기간" value={interpreter.stay_period || "미입력"} />
              <Info label="학교/전공" value={interpreter.school || "미입력"} />
            </ModalInfoSection>

            <section className="admin-private-info admin-modal-private-info" aria-label="관리자 전용 정보">
              <div className="admin-private-info-head">
                <h3>관리자 전용 정보</h3>
                <span>관리자 전용</span>
              </div>
              <dl className="admin-info-section">
                <Info label="이메일" value={interpreter.email || "미입력"} />
                <Info label="전화번호" value={interpreter.phone || "미입력"} />
                <Info label="Kakao/LINE" value={interpreter.kakao_or_line || "미입력"} />
              </dl>
            </section>

            <ModalInfoSection title="운영 상태">
              <Info label="경고 횟수" value={`${interpreter.warning_count || 0}회`} />
              <Info label="메모" value={managementMemo || "미입력"} />
            </ModalInfoSection>
          </div>
        ) : (
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
        )}
      </section>
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
        <StatusBadge status={application.status || "지원완료"} />
      </div>

      <dl className="admin-card-summary">
        <Info label="지원 공고" value={getJobDisplayTitle(job, application.job_id)} />
        <Info label="기업/행사" value={getJobOrganizationLabel(job)} />
        <Info label="언어" value={getApplicationLanguage(application, job)} />
        <Info label="지원일" value={formatDate(application.created_at)} />
        <Info label="메모" value={application.message || "지원 메모 없음"} />
      </dl>

      <div className="admin-card-controls-grid single">
        <FieldControl label="상태">
          <InlineSelect
            options={JOB_APPLICATION_STATUSES}
            value={application.status || "지원완료"}
            disabled={savingKey === `job-application-${application.id}`}
            onChange={(value) => updateApplicationStatus(application, value)}
          />
        </FieldControl>
      </div>

      <div className="admin-card-actions">
        {application.status === "매칭완료" ? (
          <StatusBadge status="매칭완료" />
        ) : (
          <button
            type="button"
            className="admin-link-button primary"
            disabled={savingKey === `job-application-${application.id}`}
            onClick={() =>
              updateApplicationStatus(application, "매칭완료", {
                confirmMessage: "이 지원자를 매칭완료로 변경하시겠습니까?",
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
  jobsById,
  requestsByJobId,
  interpreters,
  savingKey,
  updateApplicationStatus,
}) {
  return (
    <section className="admin-section">
      <SectionTitle count={`${applications.length}건`} title="매칭 관리" />
      {applications.length === 0 ? (
        <MessageBox text="아직 매칭완료된 지원자가 없습니다." />
      ) : (
        <div className="admin-management-card-grid">
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

function MatchingCard({
  application,
  job,
  requestType,
  designatedInterpreterName,
  savingKey,
  updateApplicationStatus,
}) {
  return (
    <article className="admin-list-card">
      <div className="admin-list-card-head">
        <div>
          <span className="admin-card-meta">매칭</span>
          <h3 title={getJobDisplayTitle(job, application.job_id)}>
            {getJobDisplayTitle(job, application.job_id)}
          </h3>
        </div>
        <StatusBadge status={application.status || "매칭완료"} />
      </div>

      <dl className="admin-card-summary">
        <Info label="기업/행사" value={getJobOrganizationLabel(job)} />
        <Info label="통역사명" value={application.applicant_name || "이름 미입력"} />
        <Info
          label="날짜"
          value={formatDateRange(job?.start_date, job?.end_date, job?.event_date || job?.date)}
        />
        <Info label="장소" value={job?.event_location || job?.location || "-"} />
        <Info label="언어" value={getApplicationLanguage(application, job)} />
        <Info label="지정 통역사" value={designatedInterpreterName} />
      </dl>

      <div className="admin-card-chip-row">
        <span className={`status-badge ${requestType.isDesignated ? "badge-designated" : "badge-neutral"}`}>
          {requestType.label}
        </span>
        <span className="admin-empty-chip">{application.phone || "연락처 미입력"}</span>
      </div>

      <div className="admin-card-controls-grid single">
        <FieldControl label="매칭 상태">
          <InlineSelect
            options={JOB_APPLICATION_STATUSES}
            value={application.status || "매칭완료"}
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

function StatusBadge({ status }) {
  const normalized = status || "지원완료";
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

function ChipList({ emptyText, items, onRemove }) {
  if (items.length === 0) {
    return <span className="admin-empty-chip">{emptyText}</span>;
  }

  return (
    <div className="admin-chip-list">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="admin-chip"
          onClick={() => onRemove(item.id)}
        >
          {item.label} ×
        </button>
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
    status: "open",
    visibility: "public",
    request_type: getDesignatedRequestType(request).label,
    selected_interpreter_id: request.selected_interpreter_id || request.interpreter_id || null,
    selected_interpreter_name:
      request.selected_interpreter_name || request.interpreter_name || "",
    interpreter_id: request.interpreter_id || request.selected_interpreter_id || null,
    interpreter_name: request.interpreter_name || request.selected_interpreter_name || "",
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
    status: "open",
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

function getDesignatedRequestType(...items) {
  const isDesignated = isDesignatedRequest(...items);
  return {
    isDesignated,
    label: getRequestTypeLabel(...items),
  };
}

function getStatusBadgeClass(status) {
  if (["모집중", "open", "공개", "public", "매칭완료", "completed", "승인 완료"].includes(status)) {
    return "badge-green";
  }
  if (["배정완료", "assigned", "지원완료"].includes(status)) {
    return "badge-blue";
  }
  if (["모집마감", "closed", "비공개", "private", "일반의뢰"].includes(status)) {
    return "badge-gray";
  }
  if (["검토중", "승인 대기"].includes(status)) return "badge-yellow";
  if (["보류"].includes(status)) return "badge-orange";
  if (["불합격", "cancelled", "suspended", "반려", "rejected"].includes(status)) return "badge-red";
  if (["지정의뢰"].includes(status)) return "badge-purple";
  return "badge-blue";
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

function formatDate(value) {
  if (!value) return "-";
  return String(value).slice(0, 10);
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
  };
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
  return STATUS_LABELS[status] || status || "-";
}

export default Admin;
