import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
import AdminJobs from "./AdminJobs";
import { normalizeJobVisibility } from "../utils/jobStatus";
import { formatDateRange, getDateRangeEnd, getDateRangeStart } from "../utils/dateRange";
import { fetchJobApplications as fetchBaseJobApplications } from "../utils/jobsApi";
import "./Admin.css";

// TODO: 실서비스 전에는 Supabase Auth 관리자 권한 필요.

const TABS = [
  { id: "requests", label: "의뢰 관리" },
  { id: "jobs", label: "통역 공고 관리" },
  { id: "interpreters", label: "통역사 관리" },
  { id: "applications", label: "지원자 관리" },
  { id: "matching", label: "매칭 관리" },
];
const INTERPRETER_STATUSES = ["active", "warning", "suspended"];
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
  active: "활동중",
  warning: "경고",
  suspended: "정지",
  pending: "대기",
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
          event_location
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
  const [expandedInterpreterId, setExpandedInterpreterId] = useState(null);
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

  const assignmentsByRequest = useMemo(() => groupBy(assignments, "request_id"), [
    assignments,
  ]);
  const jobApplicationsByJob = useMemo(
    () => groupByStringKey(jobApplications, "job_id"),
    [jobApplications]
  );
  const jobsById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const requestsById = useMemo(
    () => new Map(requests.map((request) => [request.id, request])),
    [requests]
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
        interpreter.status === interpreterFilters.status;
      const matchesApproved =
        interpreterFilters.approved === "all" ||
        String(Boolean(interpreter.approved)) === interpreterFilters.approved;

      return matchesSearch && matchesLevel && matchesStatus && matchesApproved;
    });
  }, [interpreterFilters, interpreters]);

  const dashboard = useMemo(
    () => {
      const today = new Date().toISOString().slice(0, 10);
      return {
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
    };
    },
    [jobApplications, requests]
  );

  const switchToJobsTab = () => {
    setActiveTab("jobs");
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

  const updateJobApplicationStatus = async (application, status) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    setSavingKey(`job-application-${application.id}`);
    const { error } = await supabase
      .from("job_applications")
      .update({ status })
      .eq("id", application.id);
    setSavingKey("");

    if (error) {
      console.error("job_applications status update error:", error);
      alert("지원 상태 변경에 실패했습니다.");
      return;
    }

    setJobApplications((current) =>
      current.map((item) =>
        item.id === application.id ? { ...item, status } : item
      )
    );
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

    setJobApplications((current) =>
      current.filter((item) => item.id !== application.id)
    );
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
              <MetricCard label="오늘 신규 지원" value={`${dashboard.todayApplications}건`} />
              <MetricCard
                label="미확인 지원"
                value={`${dashboard.uncheckedApplications}건`}
              />
              <MetricCard
                label="오늘 매칭 완료"
                value={`${dashboard.todayMatched}건`}
              />
              <MetricCard
                label="진행중 프로젝트"
                value={`${dashboard.ongoingRequests}건`}
              />
              <MetricCard
                label="긴급 요청(D-7)"
                value={`${dashboard.urgentRequests}건`}
              />
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
                expandedInterpreterId={expandedInterpreterId}
                filters={interpreterFilters}
                interpreters={filteredInterpreters}
                savingKey={savingKey}
                setExpandedInterpreterId={setExpandedInterpreterId}
                setFilters={setInterpreterFilters}
                setInterpreters={setInterpreters}
                updateInterpreter={updateInterpreter}
              />
            )}

            {activeTab === "jobs" && <AdminJobs embedded />}

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
                assignments={assignments}
                requestsById={requestsById}
                removeAssignment={removeAssignment}
                savingKey={savingKey}
              />
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

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-col-id">ID</th>
              <th className="admin-col-title">행사명</th>
              <th className="admin-col-company">기업명</th>
              <th className="admin-col-status">의뢰 유형</th>
              <th className="admin-col-company">지정 통역사</th>
              <th className="admin-col-date">날짜</th>
              <th className="admin-col-location">장소</th>
              <th>지원자</th>
              <th className="admin-col-status">의뢰 상태</th>
              <th className="admin-col-status">연락 상태</th>
              <th className="admin-col-status">결제 상태</th>
              <th className="admin-col-public">공고 공개</th>
              <th className="admin-col-actions">상세/수정</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <EmptyTableRow colSpan="13" text="조건에 맞는 의뢰가 없습니다." />
            ) : (
              requests.map((request) => (
                <FragmentRequestRow
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
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FragmentRequestRow({
  applicationsExpanded,
  assignmentDrafts,
  assignments,
  expanded,
  interpreters,
  jobApplications,
  jobsById,
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
}) {
  const job = request.job_id ? jobsById.get(request.job_id) : null;
  const jobPublicState = getRequestJobPublicState(request, job);
  const requestType = getDesignatedRequestType(request, job);
  const designatedInterpreterName = getDesignatedInterpreterName(request, job);

  return (
    <>
      <tr>
        <td className="admin-col-id">#{request.id}</td>
        <td
          className="admin-strong-cell admin-col-title"
          title={request.event_name || ""}
        >
          {request.event_name || "-"}
        </td>
        <td className="admin-col-company" title={request.company_name || ""}>
          {request.company_name || "-"}
        </td>
        <td className="admin-col-status">
          <span className={`status-badge ${requestType.isDesignated ? "badge-designated" : "badge-neutral"}`}>
            {requestType.label}
          </span>
        </td>
        <td className="admin-col-company" title={designatedInterpreterName}>
          {designatedInterpreterName}
        </td>
        <td className="admin-col-date">
          {formatDateRange(
            request.start_date,
            request.end_date,
            request.event_date
        )}
        </td>
        <td className="admin-col-location" title={request.event_location || ""}>
          {request.event_location || "-"}
        </td>
        <td className="admin-col-status">
          <button
            type="button"
            className="admin-link-button"
            onClick={() =>
              setApplicationsRequestId(applicationsExpanded ? null : request.id)
            }
          >
            지원자 확인 ({jobApplications.length}명)
          </button>
        </td>
        <td className="admin-col-status">
          <InlineSelect
            options={REQUEST_STATUSES}
            value={request.status || "pending"}
            onChange={(value) => updateRequest(request.id, { status: value })}
          />
        </td>
        <td className="admin-col-status">
          <InlineSelect
            options={CONTACT_STATUSES}
            value={request.contact_status || "not_contacted"}
            onChange={(value) =>
              updateRequest(request.id, { contact_status: value })
            }
          />
        </td>
        <td className="admin-col-public">
          <InlineSelect
            options={PAYMENT_STATUSES}
            value={request.payment_status || "unpaid"}
            onChange={(value) =>
              updateRequest(request.id, { payment_status: value })
            }
          />
        </td>
        <td>
          <div className="admin-public-control">
            <span className={`admin-public-badge ${jobPublicState.type}`}>
              {jobPublicState.label}
            </span>
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
          </div>
        </td>
        <td className="admin-col-actions">
          <div className="admin-row-actions">
            <button
              type="button"
              className="admin-link-button"
              onClick={() => setExpandedRequestId(expanded ? null : request.id)}
            >
              {expanded ? "닫기" : "상세 보기"}
            </button>
            <button
              type="button"
              className="admin-link-button danger"
              disabled={savingKey === `request-delete-${request.id}`}
              onClick={() => deleteRequest(request)}
            >
              삭제
            </button>
          </div>
        </td>
      </tr>
      {applicationsExpanded && (
        <tr className="admin-expanded-row">
          <td colSpan="13">
            <JobApplicationsPanel
              applications={jobApplications}
              onStatusChange={updateApplicationStatus}
            />
          </td>
        </tr>
      )}
      {expanded && (
        <tr className="admin-expanded-row">
          <td colSpan="13">
            <RequestDetailPanel
              applications={jobApplications}
              assignmentDrafts={assignmentDrafts}
              assignments={assignments}
              interpreters={interpreters}
              request={request}
              savingKey={savingKey}
              setAssignmentDrafts={setAssignmentDrafts}
              assignInterpreter={assignInterpreter}
              handlePriceDraft={handlePriceDraft}
              removeAssignment={removeAssignment}
              updateRequest={updateRequest}
              updateApplicationStatus={updateApplicationStatus}
            />
          </td>
        </tr>
      )}
    </>
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
  const designatedInterpreterName = getDesignatedInterpreterName(request);

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
    <div className="admin-nested-table-wrap">
      <table className="admin-nested-table">
        <thead>
          <tr>
            <th>이름</th>
            <th>언어</th>
            <th>경력</th>
            <th>지원일</th>
            <th>상태</th>
            <th>연락처</th>
            <th>메모</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((application) => (
            <tr key={application.id}>
              <td className="admin-strong-cell">{application.applicant_name || "이름 미입력"}</td>
              <td>{application.language || application.japanese_level || "-"}</td>
              <td>{application.experience || application.career || "-"}</td>
              <td>{formatDate(application.created_at)}</td>
              <td>
                <span className={`status-badge ${getApplicationStatusClass(application.status)}`}>
                  {application.status || "지원완료"}
                </span>
              </td>
              <td title={`${application.phone || ""} ${application.email || ""}`}>
                {application.phone || "연락처 미입력"}
                <span className="admin-muted-inline">{application.email || ""}</span>
              </td>
              <td title={application.message || ""}>{application.message || "지원 메모 없음"}</td>
              <td>
                {onStatusChange ? (
                  <div className="admin-row-actions">
                    <button
                      type="button"
                      className="admin-link-button"
                      onClick={() => onStatusChange(application, "매칭완료")}
                    >
                      매칭하기
                    </button>
                    <button
                      type="button"
                      className="admin-link-button warning"
                      onClick={() => onStatusChange(application, "보류")}
                    >
                      보류
                    </button>
                    <button
                      type="button"
                      className="admin-link-button danger"
                      onClick={() => onStatusChange(application, "불합격")}
                    >
                      불합격
                    </button>
                  </div>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InterpreterManagement({
  expandedInterpreterId,
  filters,
  interpreters,
  savingKey,
  setExpandedInterpreterId,
  setFilters,
  setInterpreters,
  updateInterpreter,
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
              {getStatusLabel(status)}
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
          <option value="true">승인</option>
          <option value="false">미승인</option>
        </select>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>레벨</th>
              <th>JLPT</th>
              <th>경험</th>
              <th>전문 분야</th>
              <th>승인</th>
              <th>활동 상태</th>
              <th>경고</th>
              <th>상세/수정</th>
            </tr>
          </thead>
          <tbody>
            {interpreters.length === 0 ? (
              <EmptyTableRow colSpan="9" text="조건에 맞는 통역사가 없습니다." />
            ) : (
              interpreters.map((interpreter) => (
                <FragmentInterpreterRow
                  key={interpreter.id}
                  expanded={expandedInterpreterId === interpreter.id}
                  interpreter={interpreter}
                  savingKey={savingKey}
                  setExpandedInterpreterId={setExpandedInterpreterId}
                  setInterpreters={setInterpreters}
                  updateInterpreter={updateInterpreter}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FragmentInterpreterRow({
  expanded,
  interpreter,
  savingKey,
  setExpandedInterpreterId,
  setInterpreters,
  updateInterpreter,
}) {
  return (
    <>
      <tr>
        <td className="admin-strong-cell">{interpreter.name || "이름 미입력"}</td>
        <td>
          <InlineSelect
            options={LEVELS}
            value={interpreter.level || "Lv1"}
            onChange={(value) => updateInterpreter(interpreter.id, { level: value })}
          />
        </td>
        <td>{interpreter.jlpt || "-"}</td>
        <td>{getExperienceLabel(interpreter)}</td>
        <td>{formatList(interpreter.specialties)}</td>
        <td>
          <div className="admin-approval-cell">
            <span
              className={
                interpreter.approved ? "admin-approved" : "admin-pending"
              }
            >
              {interpreter.approved ? "승인" : "미승인"}
            </span>
            <InlineSelect
              options={[
                { label: "미승인", value: "false" },
                { label: "승인", value: "true" },
              ]}
              value={String(Boolean(interpreter.approved))}
              onChange={(value) =>
                updateInterpreter(interpreter.id, { approved: value === "true" })
              }
            />
          </div>
        </td>
        <td>
          <InlineSelect
            options={INTERPRETER_STATUSES}
            value={interpreter.status || "active"}
            onChange={(value) => updateInterpreter(interpreter.id, { status: value })}
          />
        </td>
        <td>{interpreter.warning_count || 0}회</td>
        <td>
          <button
            type="button"
            className="admin-link-button"
            onClick={() =>
              setExpandedInterpreterId(expanded ? null : interpreter.id)
            }
          >
            {expanded ? "닫기" : "상세 보기"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="admin-expanded-row">
          <td colSpan="9">
            <InterpreterDetailPanel
              interpreter={interpreter}
              savingKey={savingKey}
              setInterpreters={setInterpreters}
              updateInterpreter={updateInterpreter}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function InterpreterDetailPanel({
  interpreter,
  savingKey,
  setInterpreters,
  updateInterpreter,
}) {
  return (
    <div className="admin-detail-panel interpreter-detail">
      <dl className="admin-detail-list">
        <Info label="연락처" value={interpreter.phone} />
        <Info label="이메일" value={interpreter.email} />
        <Info label="카카오/라인" value={interpreter.kakao_or_line} />
        <Info label="학교/전공" value={interpreter.school} />
        <Info label="거주 지역" value={interpreter.region} />
        <Info label="가능 지역" value={formatList(interpreter.available_regions)} />
        <Info label="전문 분야" value={formatList(interpreter.specialties)} />
        <Info label="가능 업무" value={interpreter.available_tasks} />
      </dl>

      <div>
        <h3>운영 상태</h3>
        <div className="admin-settlement">
          <NumberControl
            label="경고 횟수"
            value={interpreter.warning_count || 0}
            onChange={(value) =>
              setInterpreters((current) =>
                current.map((item) =>
                  item.id === interpreter.id
                    ? { ...item, warning_count: Math.max(0, Number(value || 0)) }
                    : item
                )
              )
            }
          />
          <button
            type="button"
            className="admin-save"
            disabled={savingKey === `interpreter-${interpreter.id}`}
            onClick={() =>
              updateInterpreter(interpreter.id, {
                warning_count: Number(interpreter.warning_count || 0),
                status:
                  Number(interpreter.warning_count || 0) > 0
                    ? "warning"
                    : interpreter.status,
              })
            }
          >
            경고 저장
          </button>
          <button
            type="button"
            className="admin-save dark"
            disabled={savingKey === `interpreter-${interpreter.id}`}
            onClick={() =>
              updateInterpreter(interpreter.id, {
                approved: !interpreter.approved,
              })
            }
          >
            {interpreter.approved ? "미승인으로 변경" : "승인하기"}
          </button>
        </div>
      </div>
    </div>
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
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-col-company">지원자</th>
              <th className="admin-col-title">공고</th>
              <th className="admin-col-company">기업/행사</th>
              <th>연락처</th>
              <th>이메일</th>
              <th className="admin-col-date">지원일</th>
              <th className="admin-col-status">상태</th>
              <th className="admin-col-message">메모</th>
              <th className="admin-col-actions">관리</th>
            </tr>
          </thead>
          <tbody>
            {applications.length === 0 ? (
              <EmptyTableRow colSpan="9" text="아직 접수된 지원자가 없습니다." />
            ) : (
              applications.map((application) => {
                const job = application.jobs || jobsById.get(application.job_id);

                return (
                  <tr key={application.id}>
                    <td
                      className="admin-strong-cell admin-col-company"
                      title={application.applicant_name || ""}
                    >
                      {application.applicant_name || "이름 미입력"}
                    </td>
                    <td
                      className="admin-col-title"
                      title={getJobDisplayTitle(job, application.job_id)}
                    >
                      {getJobDisplayTitle(job, application.job_id)}
                    </td>
                    <td
                      className="admin-col-company"
                      title={getJobOrganizationLabel(job)}
                    >
                      {getJobOrganizationLabel(job)}
                    </td>
                    <td title={application.phone || ""}>
                      {application.phone || "연락처 미입력"}
                    </td>
                    <td title={application.email || ""}>
                      {application.email || "이메일 미입력"}
                    </td>
                    <td className="admin-col-date">{formatDate(application.created_at)}</td>
                    <td className="admin-col-status">
                      <InlineSelect
                        options={JOB_APPLICATION_STATUSES}
                        value={application.status || "지원완료"}
                        disabled={savingKey === `job-application-${application.id}`}
                        onChange={(value) =>
                          updateApplicationStatus(application, value)
                        }
                      />
                    </td>
                    <td className="admin-col-message" title={application.message || ""}>
                      {application.message || "지원 메모 없음"}
                    </td>
                    <td className="admin-col-actions">
                      <button
                        type="button"
                        className="admin-link-button danger"
                        disabled={savingKey === `job-application-delete-${application.id}`}
                        onClick={() => deleteApplication(application)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MatchingManagement({ assignments, requestsById, removeAssignment, savingKey }) {
  return (
    <section className="admin-section">
      <SectionTitle count={`${assignments.length}건`} title="매칭 관리" />
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-col-title">행사명</th>
              <th className="admin-col-company">기업명</th>
              <th className="admin-col-date">날짜</th>
              <th className="admin-col-location">장소</th>
              <th>통역사</th>
              <th className="admin-col-status">상태</th>
              <th className="admin-col-actions">관리</th>
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 ? (
              <EmptyTableRow colSpan="7" text="아직 배정된 매칭이 없습니다." />
            ) : (
              assignments.map((assignment) => {
                const request = requestsById.get(assignment.request_id);
                return (
                  <tr key={assignment.id}>
                    <td className="admin-strong-cell admin-col-title" title={request?.event_name || ""}>
                      {request?.event_name || `의뢰 #${assignment.request_id}`}
                    </td>
                    <td className="admin-col-company" title={request?.company_name || ""}>
                      {request?.company_name || "-"}
                    </td>
                    <td className="admin-col-date">
                      {formatDateRange(
                        request?.start_date,
                        request?.end_date,
                        request?.event_date
                      )}
                    </td>
                    <td className="admin-col-location" title={request?.event_location || ""}>
                      {request?.event_location || "-"}
                    </td>
                    <td>{assignment.interpreter?.name || "이름 미입력"}</td>
                    <td>
                      <span className="status-badge application-status-매칭완료">
                        매칭완료
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-link-button danger"
                        disabled={savingKey === `assignment-${assignment.id}`}
                        onClick={() => removeAssignment(assignment.id)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MetricCard({ label, value }) {
  return (
    <article className="admin-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
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

function Info({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </div>
  );
}

function EmptyTableRow({ colSpan, text }) {
  return (
    <tr>
      <td colSpan={colSpan} className="admin-empty-row">
        {text}
      </td>
    </tr>
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

function getDesignatedRequestType(request = {}, job = {}) {
  const isDesignated = Boolean(
    request.selected_interpreter_id ||
      request.selected_interpreter_name ||
      request.interpreter_id ||
      request.interpreter_name ||
      job?.selected_interpreter_id ||
      job?.selected_interpreter_name ||
      job?.interpreter_id ||
      job?.interpreter_name
  );

  return {
    isDesignated,
    label: isDesignated ? "지정의뢰" : "일반의뢰",
  };
}

function getDesignatedInterpreterName(request = {}, job = {}) {
  return (
    request.selected_interpreter_name ||
    request.interpreter_name ||
    job?.selected_interpreter_name ||
    job?.interpreter_name ||
    (request.selected_interpreter_id || request.interpreter_id
      ? `#${request.selected_interpreter_id || request.interpreter_id}`
      : "") ||
    (job?.selected_interpreter_id || job?.interpreter_id
      ? `#${job.selected_interpreter_id || job.interpreter_id}`
      : "") ||
    "-"
  );
}

function getApplicationStatusClass(status) {
  return `application-status-${status || "지원완료"}`;
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

function getJobDisplayTitle(job, jobId) {
  return job?.title || job?.event_name || (jobId ? `#${jobId}` : "공고 정보 없음");
}

function getJobOrganizationLabel(job) {
  return job?.company_name || job?.event_name || job?.event_location || "-";
}

function getExperienceLabel(interpreter) {
  const rawExperience =
    interpreter.interpretation_experience || interpreter.experience_count;
  const numericExperience = Number(rawExperience);

  if (!rawExperience && rawExperience !== 0) return "-";
  if (Number.isNaN(numericExperience)) return String(rawExperience);
  if (numericExperience >= 10) return "10회 이상";
  return `${numericExperience}회`;
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
