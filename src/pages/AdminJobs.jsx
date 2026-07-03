import { useCallback, useEffect, useMemo, useState } from "react";
import { publicSupabase, supabase, supabaseConfigError } from "../supabase";
import DateRangeInput from "../components/DateRangeInput";
import MonthFilterInput from "../components/MonthFilterInput";
import {
  JOB_VISIBILITY_OPTIONS,
  JOB_STATUS_OPTIONS,
  JOB_STATUS,
  normalizeJobStatus,
  normalizeJobVisibility,
} from "../utils/jobStatus";
import {
  APPLICATION_STATUS,
  getApplicationStatusLabel,
  getStatusBadgeClass as getStandardStatusBadgeClass,
  normalizeApplicationStatus,
} from "../utils/status";
import { formatDateRange, getDateRangeEnd, getDateRangeStart } from "../utils/dateRange";
import { isDateRangeOverlappingMonth } from "../utils/date";
import { fetchJobApplications } from "../utils/jobsApi";
import { getDuplicateApplicationIdSet } from "../utils/duplicateCheck";
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
  normalizeAssignmentStatus,
  normalizeOperationStatus,
  normalizeSettlementFlowStatus,
} from "../utils/operationsStatus";
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
import "./Admin.css";

const emptyForm = {
  title: "",
  company_name: "",
  location: "",
  start_date: "",
  end_date: "",
  pay: "",
  language: "한국어 ↔ 일본어",
  level: "",
  preference: "",
  people: "",
  visibility: "public",
  status: JOB_STATUS.RECRUITING,
  assignment_status: ASSIGNMENT_STATUS.WAITING,
  operation_status: OPERATION_STATUS.BEFORE_OPERATION,
  settlement_status: SETTLEMENT_FLOW_STATUS.NOT_REQUIRED,
  is_urgent: false,
};

function getSupabaseErrorMessage(error, fallback) {
  return error?.message ? `${fallback} (${error.message})` : fallback;
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
  let result = await supabase.from("jobs").update(changes).eq("id", jobId);

  if (result.error && isMissingColumnError(result.error)) {
    console.error("Failed to update job status", result.error);
    result = await supabase
      .from("jobs")
      .update(withoutOperationFlowColumns(changes))
      .eq("id", jobId);
  }

  return result;
}

function AdminJobs({
  onBackClick,
  embedded = false,
  jobs: controlledJobs,
  requests = [],
  interpreters = [],
  assignments = [],
  applications: controlledApplications,
  getInterpreterScheduleConflicts,
  onDataChanged,
  updateApplicationStatus: sharedUpdateApplicationStatus,
}) {
  const isControlled = embedded && Array.isArray(controlledJobs);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [activeApplicantsJobId, setActiveApplicantsJobId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [jobFilters, setJobFilters] = useState({
    search: "",
    month: "",
    status: "all",
    visibility: "all",
  });
  const [isJobEditModalOpen, setIsJobEditModalOpen] = useState(false);
  const [isJobCreateModalOpen, setIsJobCreateModalOpen] = useState(false);
  const [localExpandedJobId, setLocalExpandedJobId] = useState(null);
  const visibleJobs = isControlled ? controlledJobs : jobs;
  const visibleApplications = isControlled
    ? controlledApplications || []
    : applications;
  const requestsByJobId = requests.reduce((map, request) => {
    if (request.job_id) map.set(String(request.job_id), request);
    return map;
  }, new Map());
  const assignmentsByRequestId = assignments.reduce((map, assignment) => {
    const requestId = String(assignment.request_id || "");
    if (!requestId) return map;
    const list = map.get(requestId) || [];
    list.push(assignment);
    map.set(requestId, list);
    return map;
  }, new Map());

  const fetchJobs = useCallback(async () => {
    if (isControlled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      if (!publicSupabase) throw supabaseConfigError;

      const [jobResult, applicationData] = await Promise.all([
        publicSupabase.from("jobs").select("*").order("created_at", { ascending: false }),
        fetchJobApplications(publicSupabase),
      ]);

      if (jobResult.error) {
        console.error("Supabase select error:", jobResult.error);
        alert(jobResult.error.message);
        throw jobResult.error;
      }

      console.log("loaded jobs:", jobResult.data || []);
      console.log("loaded applications:", applicationData || []);
      setJobs(jobResult.data || []);
      setApplications(applicationData);
    } catch (error) {
      console.error(error);
      setJobs([]);
      setApplications([]);
      setErrorMessage(
        getSupabaseErrorMessage(error, "통역 공고를 불러오지 못했습니다.")
      );
    } finally {
      setLoading(false);
    }
  }, [isControlled]);

  useEffect(() => {
    queueMicrotask(fetchJobs);
  }, [fetchJobs]);

  const handleChange = (event) => {
    const { name, type, checked, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");

    if (!supabase) {
      setErrorMessage(supabaseConfigError.message);
      setSaving(false);
      return;
    }

    if (!form.start_date) {
      const message = "시작일을 선택해주세요.";
      setErrorMessage(message);
      alert(message);
      setSaving(false);
      return;
    }

    if (!form.end_date) {
      const message = "종료일을 선택해주세요.";
      setErrorMessage(message);
      alert(message);
      setSaving(false);
      return;
    }

    if (form.end_date < form.start_date) {
      const message = "종료일은 시작일보다 빠를 수 없습니다.";
      setErrorMessage(message);
      alert(message);
      setSaving(false);
      return;
    }

    const formattedDate = formatDateRange(form.start_date, form.end_date);

    let payload = {
      title: form.title,
      company_name: form.company_name,
      location: form.location,
      date: formattedDate,
      event_date: form.start_date,
      start_date: form.start_date,
      end_date: form.end_date,
      pay: form.pay,
      language: form.language,
      level: form.level,
      preference: form.preference,
      people: form.people,
      visibility: form.visibility,
      ...getJobStatusPayloadFromFlow(form),
    };
    const managementConfig = MANAGEMENT_NUMBER_CONFIG.jobs;

    if (!editingId) {
      payload = await addManagementNumber({
        supabase,
        table: "jobs",
        payload,
        ...managementConfig,
      });
    }

    try {
      let result = editingId
        ? await supabase.from("jobs").update(payload).eq("id", editingId)
        : await supabase.from("jobs").insert([payload]);

      if (!editingId && isManagementNumberConflict(result.error, managementConfig.column)) {
        payload = await addManagementNumber({
          supabase,
          table: "jobs",
          payload: { ...payload, [managementConfig.column]: "" },
          ...managementConfig,
        });
        result = await supabase.from("jobs").insert([payload]);
      }

      if (result.error && isMissingColumnError(result.error)) {
        console.error("Failed to update job status", result.error);
        const legacyPayload = withoutOperationFlowColumns(payload);
        result = editingId
          ? await supabase.from("jobs").update(legacyPayload).eq("id", editingId)
          : await supabase.from("jobs").insert([legacyPayload]);
      }

      if (result.error) throw result.error;

      if (editingId) {
        try {
          const originalJob = visibleJobs.find(j => j.id === editingId) || {};
          const fieldMap = {
            title: "행사명",
            company_name: "고객사명",
            location: "장소",
            start_date: "시작일",
            end_date: "종료일",
            pay: "급여",
            language: "언어",
            level: "통역레벨",
            preference: "우대조건",
            people: "인원",
            visibility: "공개여부"
          };
          
          const updated_fields = [];
          for (const key in fieldMap) {
            if (payload[key] !== originalJob[key]) {
              updated_fields.push(fieldMap[key]);
            }
          }
          
          const { data: userData } = await supabase.auth.getUser();
          
          await supabase.from("notifications").insert({
            channel: "internal",
            recipient_type: "admin",
            notification_type: "job_updated",
            title: "의뢰 수정",
            message: `${form.title} 의뢰가 수정되었습니다.`,
            related_id: editingId,
            related_type: "job",
            status: "pending",
            metadata: {
              updated_by: userData?.user?.id,
              updated_fields
            }
          });
        } catch (notifError) {
          console.error("Failed to create job_updated notification", notifError);
        }
      }

      resetForm();
      setIsJobEditModalOpen(false);
      setIsJobCreateModalOpen(false);
      if (isControlled) {
        await onDataChanged?.();
      } else {
        await fetchJobs();
      }
      alert("공고가 저장되었습니다.");
    } catch (error) {
      console.error("Failed to update job status", error);
      console.error("insert failed", {
        table: "jobs",
        payload,
        error,
      });
      alert(getSupabaseErrorMessage(error, "공고 저장에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (job) => {
    setEditingId(job.id);
    setForm({
      title: job.title || "",
      company_name: job.company_name || "",
      location: job.location || "",
      start_date: getDateRangeStart(job.start_date, job.event_date || job.date),
      end_date: getDateRangeEnd(job.end_date, job.event_date || job.date),
      pay: job.pay || "",
      language: job.language || "",
      level: job.level || "",
      preference: job.preference || "",
      people: job.people || "",
      visibility: normalizeJobVisibility(job),
      status: normalizeJobStatus(job),
      assignment_status: normalizeAssignmentStatus(job),
      operation_status: normalizeOperationStatus(job),
      settlement_status: normalizeSettlementFlowStatus(job),
      is_urgent: normalizeJobStatus(job) === "closing_soon",
    });
    setIsJobEditModalOpen(true);
  };

  const openCreateModal = () => {
    setForm(emptyForm);
    setEditingId(null);
    setIsJobCreateModalOpen(true);
  };

  const closeJobModal = () => {
    resetForm();
    setIsJobEditModalOpen(false);
    setIsJobCreateModalOpen(false);
  };

  const handleModalChange = (event) => {
    if (event.target.name === "date_range") {
      const { startDate, endDate } = event.target.value;
      setForm((current) => ({
        ...current,
        start_date: startDate,
        end_date: endDate,
      }));
    } else {
      handleChange(event);
    }
  };

  const updateJob = async (job, changes) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    try {
      const result = await updateJobWithFallback(job.id, changes);

      if (result.error) throw result.error;

      if (isControlled) {
        await onDataChanged?.();
      } else {
        await fetchJobs();
      }
    } catch (error) {
      console.error("Failed to update job status", error);
      alert("상태 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  const deleteJob = async (job) => {
    if (!window.confirm(`"${job.title || "공고"}"를 삭제할까요?`)) return;
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    try {
      const { error: applicationError } = await supabase
        .from("job_applications")
        .delete()
        .eq("job_id", job.id);

      if (applicationError) throw applicationError;

      const { error } = await supabase.from("jobs").delete().eq("id", job.id);

      if (error) throw error;

      if (isControlled) {
        await onDataChanged?.();
      } else {
        setJobs((current) => current.filter((item) => item.id !== job.id));
        setApplications((current) =>
          current.filter((application) => String(application.job_id) !== String(job.id))
        );
      }
      setActiveApplicantsJobId((current) =>
        String(current) === String(job.id) ? null : current
      );
      if (editingId === job.id) resetForm();
    } catch (error) {
      console.error(error);
      alert(getSupabaseErrorMessage(error, "공고 삭제에 실패했습니다."));
    }
  };

  const getApplicationsForJob = (jobId) =>
    visibleApplications.filter(
      (application) => String(application.job_id) === String(jobId)
    );

  const getMatchedCount = (jobId) => {
    const request = requestsByJobId.get(String(jobId));
    const assignmentCount = request
      ? (assignmentsByRequestId.get(String(request.id)) || []).length
      : 0;
    const applicationCount = visibleApplications.filter(
      (application) =>
        String(application.job_id) === String(jobId) &&
        normalizeApplicationStatus(application.status) === APPLICATION_STATUS.ACCEPTED
    ).length;

    return Math.max(assignmentCount, applicationCount);
  };
  const filteredJobs = visibleJobs.filter((job) => {
    const search = jobFilters.search.trim().toLowerCase();
    const searchableText = [
      job.title,
      job.event_name,
      job.company_name,
      job.location,
      job.event_location,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesSearch = !search || searchableText.includes(search);
    const matchesMonth =
      !jobFilters.month ||
      isDateRangeOverlappingMonth(
        getDateRangeStart(job.start_date || job.event_date, job.date),
        getDateRangeEnd(job.end_date || job.event_date, job.date),
        jobFilters.month
      );
    const matchesStatus =
      jobFilters.status === "all" || normalizeJobStatus(job) === jobFilters.status;
    const matchesVisibility =
      jobFilters.visibility === "all" ||
      normalizeJobVisibility(job) === jobFilters.visibility;

    return matchesSearch && matchesMonth && matchesStatus && matchesVisibility;
  });

  const refreshApplications = async () => {
    const applicationData = await fetchJobApplications();
    setApplications(applicationData);
    return applicationData;
  };

  const closeApplicantsModal = useCallback(() => {
    setActiveApplicantsJobId(null);
  }, []);

  useEffect(() => {
    if (!activeApplicantsJobId) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeApplicantsModal();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeApplicantsJobId, closeApplicantsModal]);

  const updateApplicationStatus = async (
    application,
    status,
    { confirmMessage, askAssignJob = false } = {}
  ) => {
    if (sharedUpdateApplicationStatus) {
      await sharedUpdateApplicationStatus(application, status, {
        confirmMessage,
        askAssignJob,
      });
      return;
    }

    if (!application?.id) {
      console.error("지원자 상태 변경 실패: application.id가 없습니다.", application);
      alert("지원자 정보를 확인할 수 없습니다.");
      return;
    }

    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    if (confirmMessage && !window.confirm(confirmMessage)) return;

    const { error } = await supabase
      .from("job_applications")
      .update({ status })
      .eq("id", application.id);

    if (error) {
      console.error("지원자 상태 변경 실패:", error);
      alert("지원자 상태 변경에 실패했습니다.");
      return;
    }

    setApplications((current) =>
      current.map((item) =>
        item.id === application.id ? { ...item, status } : item
      )
    );

    if (askAssignJob) {
      const shouldAssign = window.confirm(
        "공고 모집 상태도 배정완료로 변경하시겠습니까?"
      );

      if (shouldAssign) {
        if (!application.job_id) {
          console.error("공고 상태 변경 실패: application.job_id가 없습니다.", application);
          alert("공고 정보를 확인할 수 없습니다.");
          await refreshApplications();
          return;
        }

        const { error: jobError } = await updateJobWithFallback(application.job_id, {
          status: JOB_STATUS.ASSIGNED,
          assignment_status: ASSIGNMENT_STATUS.ASSIGNED,
          is_urgent: false,
        });

        if (jobError) {
          console.error("Failed to update job status", jobError);
          alert("상태 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
        } else {
          setJobs((current) =>
            current.map((job) =>
              String(job.id) === String(application.job_id)
                ? {
                    ...job,
                    status: JOB_STATUS.ASSIGNED,
                    assignment_status: ASSIGNMENT_STATUS.ASSIGNED,
                    is_urgent: false,
                  }
                : job
            )
          );
        }
      }
    }

    await refreshApplications();
  };

  const content = (
    <>
      <section className="admin-section">
        <div className="admin-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div>
              <p className="admin-kicker">MANAGE</p>
              <h2>통역 공고 관리</h2>
            </div>
            <span className="admin-count">{`${filteredJobs.length}건`}</span>
          </div>
          <button
            type="button"
            className="admin-save"
            onClick={openCreateModal}
            style={{ height: "40px", padding: "0 16px", borderRadius: "12px", background: "#4f46e5", color: "#ffffff", fontWeight: "bold", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            + 새 공고 등록
          </button>
        </div>

        <div className="admin-filter-bar admin-filters admin-job-filters">
          <label className="admin-filter-search admin-search-control">
            <input
              value={jobFilters.search}
              onChange={(event) =>
                setJobFilters((current) => ({ ...current, search: event.target.value }))
              }
              placeholder="공고명/기업명/장소 검색"
            />
          </label>
          <MonthFilterInput
            value={jobFilters.month}
            onChange={(month) => setJobFilters((current) => ({ ...current, month }))}
          />
          <select
            className="admin-filter-select"
            value={jobFilters.status}
            onChange={(event) =>
              setJobFilters((current) => ({ ...current, status: event.target.value }))
            }
          >
            <option value="all">전체 상태</option>
            {JOB_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="admin-filter-select"
            value={jobFilters.visibility}
            onChange={(event) =>
              setJobFilters((current) => ({ ...current, visibility: event.target.value }))
            }
          >
            <option value="all">공개 전체</option>
            {JOB_VISIBILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <MessageBox text="공고를 불러오는 중입니다..." />
        ) : errorMessage ? (
          <MessageBox text={errorMessage} />
        ) : (
          filteredJobs.length === 0 ? (
            <MessageBox text="현재 등록된 공고가 없습니다." />
          ) : (
            <div className="admin-management-card-grid">
              {filteredJobs.map((job) => {
                const jobApplications = getApplicationsForJob(job.id);
                const matchedCount = getMatchedCount(job.id);
                const request = requestsByJobId.get(String(job.id));
                const requestAssignments = request
                  ? assignmentsByRequestId.get(String(request.id)) || []
                  : [];
                const requestType = getDesignatedJobType(job, request);
                const interpreterName = getDesignatedInterpreterName(
                  [job, request],
                  interpreters
                );
                const assignedInterpreterName = getAssignedInterpreterName(
                  requestAssignments,
                  interpreters
                );

                return (
                  <JobManagementCard
                    key={job.id}
                    assignedInterpreterName={assignedInterpreterName}
                    interpreterName={interpreterName}
                    job={job}
                    jobApplications={jobApplications}
                    matchedCount={matchedCount}
                    requestType={requestType}
                    deleteJob={deleteJob}
                    openApplicantsModal={setActiveApplicantsJobId}
                    startEdit={startEdit}
                    updateJob={updateJob}
                    request={request}
                    expanded={localExpandedJobId === job.id}
                    setExpandedJobId={setLocalExpandedJobId}
                  />
                );
              })}
            </div>
          )
        )}
      </section>

      {activeApplicantsJobId && (
        <JobApplicantsModal
          applications={getApplicationsForJob(activeApplicantsJobId)}
          getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
          job={visibleJobs.find(
            (job) => String(job.id) === String(activeApplicantsJobId)
          )}
          onClose={closeApplicantsModal}
          onStatusChange={updateApplicationStatus}
        />
      )}

      {(isJobEditModalOpen || isJobCreateModalOpen) && (
        <JobModal
          editingId={editingId}
          form={form}
          saving={saving}
          onChange={handleModalChange}
          onClose={closeJobModal}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );

  if (embedded) return content;

  return (
    <div className="admin-page">
      <div className="admin-shell">
        <button type="button" onClick={onBackClick} className="admin-back">
          ← 관리자 홈으로
        </button>
        <header className="admin-header">
          <div>
            <p className="admin-kicker">ON-LI ADMIN</p>
            <h1>통역 공고 관리</h1>
            <p>홈페이지와 전체 공고 페이지에 노출되는 공고를 관리합니다.</p>
          </div>
          <div className="admin-header-actions">
            <button
              type="button"
              onClick={() => {
                window.location.href = "/";
              }}
              className="admin-home-button"
            >
              <span className="full-text">← 홈페이지</span>
              <span className="mobile-text">← 홈</span>
            </button>
            <button type="button" onClick={fetchJobs} className="admin-refresh">
              새로고침
            </button>
          </div>
        </header>
        {content}
      </div>
    </div>
  );
}

function JobManagementCard({
  assignedInterpreterName,
  interpreterName,
  job,
  jobApplications,
  matchedCount,
  requestType,
  deleteJob,
  openApplicantsModal,
  startEdit,
  updateJob,
  request,
  expanded,
  setExpandedJobId,
}) {
  const statuses = getOperationFlowStatuses(job);
  const headlineStatus = getRequestHeadlineStatus(job);
  const estimateStatus = request?.estimate_status || "estimate_preparing";

  return (
    <article
      className={`admin-list-card accordion-card ${expanded ? "is-expanded" : ""}`}
      onClick={(e) => {
        // Only expand/collapse if clicking general areas, not controls or buttons
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
        setExpandedJobId(expanded ? null : job.id);
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
            <ManagementNumberBadge value={job.job_no} />
            <h3 className="job-card-title" title={job.event_name || job.title || ""}>
              {job.event_name || job.title || "-"}
            </h3>
            <div className="admin-company-history-link" style={{ fontSize: "12px", color: "#6b7280" }}>
              {job.company_name || "-"}
            </div>
          </div>
          <span className={`admin-flow-status-badge ${getOperationFlowBadgeClass(headlineStatus.type, headlineStatus.value)}`}>
            {headlineStatus.label}
          </span>
        </div>

        <div className="admin-status-badge-row" style={{ marginBottom: expanded ? "6px" : "0" }}>
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

        {/* Expandable Details Container */}
        <div className={`admin-card-expandable-content ${expanded ? "is-expanded" : ""}`}>
          <div className="admin-card-expandable-content-inner">
            <div className="admin-flow-status-panel" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
                <JobField label="공개 상태">
                  <select
                    className="admin-inline-select"
                    value={normalizeJobVisibility(job)}
                    onChange={(event) => updateJob(job, { visibility: event.target.value })}
                  >
                    {JOB_VISIBILITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </JobField>
                <JobField label="배정 상태">
                  <select
                    className="admin-inline-select"
                    value={statuses.assignment_status}
                    onChange={(event) => updateJob(job, getAssignmentStatusChanges({ ...job, assignment_status: event.target.value }))}
                  >
                    {ASSIGNMENT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </JobField>
                <JobField label="운영 상태">
                  <select
                    className="admin-inline-select"
                    value={statuses.operation_status}
                    onChange={(event) => updateJob(job, getOperationStatusChanges({ ...job, operation_status: event.target.value }))}
                  >
                    {OPERATION_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </JobField>
                <JobField label="정산 상태">
                  <select
                    className="admin-inline-select"
                    value={statuses.settlement_status}
                    onChange={(event) => updateJob(job, getSettlementFlowStatusChanges({ ...job, settlement_status: event.target.value }))}
                  >
                    {SETTLEMENT_FLOW_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </JobField>
              </div>
            </div>

            <dl className="admin-request-summary admin-request-summary-clean">
              <JobInfo label="공고번호" value={formatManagementNumber(job.job_no)} />
              <JobInfo label="날짜" value={formatDateRange(job.start_date, job.end_date, job.event_date || job.date)} />
              <JobInfo label="장소" value={job.location || job.event_location || "-"} />
              <JobInfo label="언어" value={job.language || "-"} />
              <JobInfo label="지원자 수" value={`${jobApplications.length}명`} />
              <JobInfo label="합격자 수" value={`${matchedCount}명`} />
              <JobInfo label="지정 요청" value={requestType.isDesignated ? `지정: ${interpreterName}` : "-"} />
              <JobInfo label="배정 통역사" value={assignedInterpreterName || "-"} />
            </dl>

            <div className="admin-card-primary-actions">
              <button
                type="button"
                className="admin-link-button primary"
                onClick={(e) => {
                  e.stopPropagation();
                  openApplicantsModal(job.id);
                }}
              >
                지원자 확인 ({jobApplications.length}명)
              </button>
              <button
                type="button"
                className="admin-link-button primary subtle"
                onClick={(e) => {
                  e.stopPropagation();
                  startEdit(job);
                }}
              >
                수정
              </button>
            </div>

            <div className="admin-card-secondary-area">
              <div className="admin-card-secondary-actions" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="admin-link-button danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteJob(job);
                  }}
                >
                  삭제
                </button>
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
              setExpandedJobId(expanded ? null : job.id);
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

const ESTIMATE_STATUS_OPTIONS = [
  { value: "estimate_preparing", label: "견적 준비중" },
  { value: "estimate_required", label: "견적 확인 필요" },
  { value: "estimate_approved", label: "견적 승인 완료" },
];

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

function FlowStatusBadge({ label, type, value }) {
  return (
    <span className={`admin-flow-status-badge ${getOperationFlowBadgeClass(type, value)}`}>
      {label}
    </span>
  );
}

function getOperationStatusOptionLabel(options, value) {
  return options.find((opt) => opt.value === value)?.label || "-";
}

function JobField({ label, children }) {
  return (
    <label className="admin-field-control">
      <span>{label}</span>
      {children}
    </label>
  );
}

function JobInfo({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </div>
  );
}



function MessageBox({ text }) {
  return <div className="admin-message">{text}</div>;
}

function JobApplicantsModal({
  applications,
  getInterpreterScheduleConflicts,
  job,
  onClose,
  onStatusChange,
}) {
  return (
    <div className="admin-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="admin-modal-card admin-jobs-applicant-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-applicants-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <div>
            <p className="admin-kicker">APPLICANTS</p>
            <ManagementNumberBlock label="관리번호" value={job?.job_no} />
            <h2 id="job-applicants-modal-title">
              지원자 목록 - {job?.event_name || job?.title || "공고"}
            </h2>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose}>
            닫기
          </button>
        </div>
        <JobApplicationsPanel
          applications={applications}
          getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
          job={job || {}}
          onStatusChange={onStatusChange}
        />
      </section>
    </div>
  );
}

function JobApplicationsPanel({
  applications,
  getInterpreterScheduleConflicts,
  job,
  onStatusChange,
}) {
  const [openApplicationId, setOpenApplicationId] = useState(null);
  const duplicateData = useMemo(
    () => getDuplicateApplicationIdSet(applications),
    [applications]
  );
  const toggleApplication = (applicationId) => {
    setOpenApplicationId((current) =>
      String(current) === String(applicationId) ? null : applicationId
    );
  };

  return (
    <div className="admin-applications-panel">
      {applications.length === 0 ? (
        <span className="admin-empty-chip">이 공고에는 아직 지원자가 없습니다.</span>
      ) : (
        <div className="admin-applicant-accordion-list">
          {applications.map((application) => {
            const status = normalizeApplicationStatus(application.status);
            const language =
              application.language || application.japanese_level || job.language || "-";
            const expanded = String(openApplicationId) === String(application.id);
            const duplicateSuspected = duplicateData.duplicateIds.has(application.id);
            const duplicateTitle = (duplicateData.reasonMap.get(application.id) || []).join(", ");
            const scheduleConflict = hasJobApplicationScheduleConflict(
              application,
              job,
              getInterpreterScheduleConflicts
            );

            return (
              <article key={application.id} className="admin-applicant-accordion-item">
                <button
                  type="button"
                  className="admin-applicant-summary"
                  aria-expanded={expanded}
                  onClick={() => toggleApplication(application.id)}
                >
                  <StatusBadge status={status} />
                  {duplicateSuspected && (
                    <span className="admin-duplicate-badge" title={duplicateTitle || "중복 의심"}>
                      중복 의심
                    </span>
                  )}
                  {scheduleConflict && <ScheduleConflictBadge />}
                  <span className="admin-applicant-summary-text">
                    <strong>{application.applicant_name || "이름 미입력"}</strong>
                    <ManagementNumberBadge value={application.application_no} />
                    <span>{language}</span>
                    <span>지원자</span>
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
                        {duplicateSuspected && (
                          <span className="admin-duplicate-badge" title={duplicateTitle || "중복 의심"}>
                            중복 의심
                          </span>
                        )}
                        {scheduleConflict && <ScheduleConflictBadge />}
                        <StatusBadge status={status} />
                      </div>
                      <span>지원자</span>
                    </div>

                    <div className="admin-applicant-detail-grid">
                      <JobApplicantDetailItem
                        label="지원번호"
                        value={formatManagementNumber(application.application_no)}
                      />
                      <JobApplicantDetailItem label="성별" value={application.gender || "-"} />
                      <JobApplicantDetailItem label="언어/레벨" value={language} />
                      <JobApplicantDetailItem
                        label="경력"
                        value={application.experience || application.career || "-"}
                      />
                      <JobApplicantDetailItem
                        full
                        label="연락처"
                        value={application.phone || "연락처 미입력"}
                      />
                      <JobApplicantDetailItem full label="이메일" value={application.email || "-"} />
                      <JobApplicantDetailItem
                        full
                        multiline
                        label="메모"
                        value={application.message || "지원 메모 없음"}
                      />
                    </div>

                    <div className="admin-card-actions">
                      {normalizeApplicationStatus(application.status) === APPLICATION_STATUS.ACCEPTED ? (
                        <>
                          <StatusBadge status={APPLICATION_STATUS.ACCEPTED} />
                          <button
                            type="button"
                            className="admin-link-button warning"
                            onClick={() =>
                              onStatusChange(application, APPLICATION_STATUS.PENDING, {
                                confirmMessage: "이 지원자의 매칭을 취소하시겠습니까?",
                              })
                            }
                          >
                            매칭 취소
                          </button>
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
                      {normalizeApplicationStatus(application.status) !== APPLICATION_STATUS.REVIEWING && (
                        <button
                          type="button"
                          className="admin-link-button warning"
                          onClick={() =>
                            onStatusChange(application, APPLICATION_STATUS.REVIEWING, {
                              confirmMessage: "이 지원자를 검토중 상태로 변경하시겠습니까?",
                            })
                          }
                        >
                          검토중
                        </button>
                      )}
                      {normalizeApplicationStatus(application.status) !== APPLICATION_STATUS.REJECTED && (
                        <button
                          type="button"
                          className="admin-link-button danger"
                          onClick={() =>
                            onStatusChange(application, APPLICATION_STATUS.REJECTED, {
                              confirmMessage: "이 지원자를 불합격 상태로 변경하시겠습니까?",
                            })
                          }
                        >
                          불합격
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function JobApplicantDetailItem({ full = false, label, multiline = false, value }) {
  return (
    <div
      className={`admin-applicant-detail-item${full ? " is-full" : ""}${multiline ? " is-multiline" : ""}`}
    >
      <span>{label}</span>
      <p>{value || "-"}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = normalizeApplicationStatus(status);
  return (
    <span className={`status-badge ${getStatusBadgeClass(normalized)}`}>
      {getApplicationStatusLabel(normalized)}
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

function hasJobApplicationScheduleConflict(application = {}, job = {}, getInterpreterScheduleConflicts) {
  if (!application?.interpreter_id || !getInterpreterScheduleConflicts) return false;
  const startDate = getDateRangeStart(
    job.start_date || job.event_start_date || job.event_date || job.work_date,
    job.date
  );
  const endDate = getDateRangeEnd(
    job.end_date || job.event_end_date || job.event_date || job.work_date,
    job.date
  );
  if (!startDate) return false;

  return getInterpreterScheduleConflicts(application.interpreter_id, {
    startDate,
    endDate: endDate || startDate,
  }).some((matching) => String(matching.job_id) !== String(job.id));
}





function getStatusBadgeClass(status) {
  return getStandardStatusBadgeClass(status);
}



function getDesignatedJobType(...items) {
  const isDesignated = isDesignatedRequest(...items);
  return {
    isDesignated,
    label: getRequestTypeLabel(...items),
  };
}

function getAssignedInterpreterName(assignments = [], interpreters = []) {
  return assignments
    .map((assignment) => {
      if (assignment.interpreter?.name) return assignment.interpreter.name;
      const interpreter = interpreters.find(
        (item) => Number(item.id) === Number(assignment.interpreter_id)
      );
      return interpreter?.name || "";
    })
    .filter(Boolean)
    .join(", ");
}



function getOperationFlowStatuses(item = {}) {
  return {
    assignment_status: normalizeAssignmentStatus(item),
    operation_status: normalizeOperationStatus(item),
    settlement_status: normalizeSettlementFlowStatus(item),
  };
}

function getAssignmentStatusChanges(item = {}) {
  return {
    ...getJobStatusPayloadFromFlow(item),
  };
}

function getOperationStatusChanges(item = {}) {
  return {
    ...getJobStatusPayloadFromFlow(item),
  };
}

function getSettlementFlowStatusChanges(item = {}) {
  return {
    ...getJobStatusPayloadFromFlow(item),
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



function JobModal({
  editingId,
  form,
  saving,
  onChange,
  onClose,
  onSubmit,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="job-modal-backdrop" onMouseDown={onClose}>
      <section
        className="job-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid #e5e7eb", paddingBottom: "12px" }}>
          <div>
            <span className="admin-card-meta">JOB POSTING</span>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "900", color: "#111827" }}>
              {editingId ? "공고 수정" : "새 공고 등록"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#9ca3af", padding: 0 }}
          >
            &times;
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="job-modal-grid">
            <JobField label="공고 제목">
              <input name="title" value={form.title} onChange={onChange} required style={{ width: "100%", height: "40px", boxSizing: "border-box", padding: "0 10px", borderRadius: "8px", border: "1px solid #d1d5db" }} />
            </JobField>
            
            <JobField label="기업명">
              <input name="company_name" value={form.company_name} onChange={onChange} style={{ width: "100%", height: "40px", boxSizing: "border-box", padding: "0 10px", borderRadius: "8px", border: "1px solid #d1d5db" }} />
            </JobField>

            <JobField label="장소">
              <input name="location" value={form.location} onChange={onChange} style={{ width: "100%", height: "40px", boxSizing: "border-box", padding: "0 10px", borderRadius: "8px", border: "1px solid #d1d5db" }} />
            </JobField>

            <div className="admin-job-date-range" style={{ gridColumn: "1 / -1" }}>
              <DateRangeInput
                required
                label="행사 기간"
                startDate={form.start_date}
                endDate={form.end_date}
                onChange={({ startDate, endDate }) =>
                  onChange({
                    target: {
                      name: "date_range",
                      value: { startDate, endDate }
                    }
                  })
                }
              />
            </div>

            <JobField label="일급">
              <input name="pay" value={form.pay} onChange={onChange} style={{ width: "100%", height: "40px", boxSizing: "border-box", padding: "0 10px", borderRadius: "8px", border: "1px solid #d1d5db" }} />
            </JobField>

            <JobField label="언어">
              <input name="language" value={form.language} onChange={onChange} style={{ width: "100%", height: "40px", boxSizing: "border-box", padding: "0 10px", borderRadius: "8px", border: "1px solid #d1d5db" }} />
            </JobField>

            <JobField label="레벨">
              <input name="level" value={form.level} onChange={onChange} style={{ width: "100%", height: "40px", boxSizing: "border-box", padding: "0 10px", borderRadius: "8px", border: "1px solid #d1d5db" }} />
            </JobField>

            <JobField label="우대">
              <input name="preference" value={form.preference} onChange={onChange} style={{ width: "100%", height: "40px", boxSizing: "border-box", padding: "0 10px", borderRadius: "8px", border: "1px solid #d1d5db" }} />
            </JobField>

            <JobField label="모집 인원">
              <input name="people" value={form.people} onChange={onChange} style={{ width: "100%", height: "40px", boxSizing: "border-box", padding: "0 10px", borderRadius: "8px", border: "1px solid #d1d5db" }} />
            </JobField>

            <JobField label="공고 공개 상태">
              <select name="visibility" value={form.visibility} onChange={onChange} style={{ width: "100%", height: "40px", boxSizing: "border-box", padding: "0 10px", borderRadius: "8px", border: "1px solid #d1d5db", background: "#fff" }}>
                {JOB_VISIBILITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </JobField>

            <JobField label="배정 상태">
              <select name="assignment_status" value={form.assignment_status} onChange={onChange} style={{ width: "100%", height: "40px", boxSizing: "border-box", padding: "0 10px", borderRadius: "8px", border: "1px solid #d1d5db", background: "#fff" }}>
                {ASSIGNMENT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </JobField>

            <JobField label="운영 상태">
              <select name="operation_status" value={form.operation_status} onChange={onChange} style={{ width: "100%", height: "40px", boxSizing: "border-box", padding: "0 10px", borderRadius: "8px", border: "1px solid #d1d5db", background: "#fff" }}>
                {OPERATION_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </JobField>

            <JobField label="정산 상태">
              <select name="settlement_status" value={form.settlement_status} onChange={onChange} style={{ width: "100%", height: "40px", boxSizing: "border-box", padding: "0 10px", borderRadius: "8px", border: "1px solid #d1d5db", background: "#fff" }}>
                {SETTLEMENT_FLOW_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </JobField>
          </div>

          <div className="admin-job-form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
            <button
              type="button"
              className="admin-link-button"
              onClick={onClose}
              style={{ height: "40px", padding: "0 20px", borderRadius: "8px", border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontWeight: "600" }}
            >
              취소
            </button>
            <button
              type="submit"
              className="admin-save"
              disabled={saving}
              style={{ height: "40px", padding: "0 20px", borderRadius: "8px", background: "#4f46e5", color: "#fff", border: "none", cursor: "pointer", fontWeight: "600" }}
            >
              {saving ? "저장 중..." : editingId ? "저장" : "등록"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default AdminJobs;
