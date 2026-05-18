import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
import {
  JOB_STATUS_OPTIONS,
  JOB_VISIBILITY_OPTIONS,
  JOB_STATUS,
  getJobStatusLabel,
  getJobVisibilityLabel,
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
import { fetchJobApplications } from "../utils/jobsApi";
import { getDuplicateApplicationIdSet } from "../utils/duplicateApplications";
import {
  getDesignatedInterpreterName,
  getRequestTypeLabel,
  isDesignatedRequest,
} from "../utils/designatedRequest";
import "./Admin.css";

const emptyForm = {
  title: "",
  location: "",
  start_date: "",
  end_date: "",
  pay: "",
  language: "한국어 ↔ 일본어",
  level: "",
  preference: "",
  people: "",
  visibility: "public",
  status: JOB_STATUS.OPEN,
  is_urgent: false,
};

function getSupabaseErrorMessage(error, fallback) {
  return error?.message ? `${fallback} (${error.message})` : fallback;
}

function AdminJobs({
  onBackClick,
  embedded = false,
  jobs: controlledJobs,
  requests = [],
  interpreters = [],
  assignments = [],
  applications: controlledApplications,
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
      if (!supabase) throw supabaseConfigError;

      const [jobResult, applicationData] = await Promise.all([
        supabase.from("jobs").select("*").order("created_at", { ascending: false }),
        fetchJobApplications(),
      ]);

      if (jobResult.error) throw jobResult.error;

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

    if (form.end_date < form.start_date) {
      const message = "종료일은 시작일보다 빠를 수 없습니다.";
      setErrorMessage(message);
      alert(message);
      setSaving(false);
      return;
    }

    const formattedDate = formatDateRange(form.start_date, form.end_date);

    const payload = {
      title: form.title,
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
      status: form.status,
      is_urgent: form.status === "closing_soon",
    };

    try {
      const { error } = editingId
        ? await supabase.from("jobs").update(payload).eq("id", editingId)
        : await supabase.from("jobs").insert([payload]);

      if (error) throw error;

      resetForm();
      if (isControlled) {
        await onDataChanged?.();
      } else {
        await fetchJobs();
      }
      alert("공고가 저장되었습니다.");
    } catch (error) {
      console.error(error);
      alert(getSupabaseErrorMessage(error, "공고 저장에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (job) => {
    setEditingId(job.id);
    setForm({
      title: job.title || "",
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
      is_urgent: normalizeJobStatus(job) === "closing_soon",
    });
  };

  const updateJob = async (job, changes) => {
    if (!supabase) {
      alert(supabaseConfigError.message);
      return;
    }

    try {
      const { error } = await supabase.from("jobs").update(changes).eq("id", job.id);

      if (error) throw error;

      if (isControlled) {
        await onDataChanged?.();
      } else {
        setJobs((current) =>
          current.map((item) => (item.id === job.id ? { ...item, ...changes } : item))
        );
      }
    } catch (error) {
      console.error(error);
      alert(getSupabaseErrorMessage(error, "공고 변경에 실패했습니다."));
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

        const { error: jobError } = await supabase
          .from("jobs")
          .update({ status: JOB_STATUS.ASSIGNED, is_urgent: false })
          .eq("id", application.job_id);

        if (jobError) {
          console.error("공고 상태 변경 실패:", jobError);
          alert("공고 모집 상태 변경에 실패했습니다.");
        } else {
          setJobs((current) =>
            current.map((job) =>
              String(job.id) === String(application.job_id)
                ? { ...job, status: JOB_STATUS.ASSIGNED, is_urgent: false }
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
          <SectionTitle count={`${visibleJobs.length}건`} title="통역 공고 관리" />

        <form className="admin-job-form" onSubmit={handleSubmit}>
          <JobField label="공고 제목">
            <input name="title" value={form.title} onChange={handleChange} required />
          </JobField>
          <JobField label="장소">
            <input name="location" value={form.location} onChange={handleChange} />
          </JobField>
          <JobField label="시작일">
            <input
              name="start_date"
              type="date"
              value={form.start_date}
              onChange={handleChange}
              required
            />
          </JobField>
          <JobField label="종료일">
            <input
              name="end_date"
              type="date"
              value={form.end_date}
              onChange={handleChange}
              required
            />
          </JobField>
          <JobField label="일급">
            <input name="pay" value={form.pay} onChange={handleChange} />
          </JobField>
          <JobField label="언어">
            <input name="language" value={form.language} onChange={handleChange} />
          </JobField>
          <JobField label="레벨">
            <input name="level" value={form.level} onChange={handleChange} />
          </JobField>
          <JobField label="우대">
            <input name="preference" value={form.preference} onChange={handleChange} />
          </JobField>
          <JobField label="모집 인원">
            <input name="people" value={form.people} onChange={handleChange} />
          </JobField>
          <JobField label="공고 공개 상태">
            <select name="visibility" value={form.visibility} onChange={handleChange}>
              {JOB_VISIBILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </JobField>
          <JobField label="모집 상태">
            <select name="status" value={form.status} onChange={handleChange}>
              {JOB_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </JobField>

          <div className="admin-job-form-actions">
            <button type="submit" className="admin-save" disabled={saving}>
              {saving ? "저장 중..." : editingId ? "공고 수정" : "공고 등록"}
            </button>
            {editingId && (
              <button type="button" className="admin-link-button" onClick={resetForm}>
                새 공고 입력
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="admin-section">
        {loading ? (
          <MessageBox text="공고를 불러오는 중입니다..." />
        ) : errorMessage ? (
          <MessageBox text={errorMessage} />
        ) : (
          visibleJobs.length === 0 ? (
            <MessageBox text="현재 등록된 공고가 없습니다." />
          ) : (
            <div className="admin-management-card-grid">
              {visibleJobs.map((job) => {
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
          job={visibleJobs.find(
            (job) => String(job.id) === String(activeApplicantsJobId)
          )}
          onClose={closeApplicantsModal}
          onStatusChange={updateApplicationStatus}
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
          <button type="button" onClick={fetchJobs} className="admin-refresh">
            새로고침
          </button>
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
}) {
  return (
    <article className="admin-list-card">
      <div className="admin-list-card-head">
        <div>
          <span className="admin-card-meta">통역 공고</span>
          <h3 title={job.title || ""}>{job.event_name || job.title || "-"}</h3>
        </div>
        <span className={`status-badge ${getJobStatusBadgeClass(normalizeJobStatus(job))}`}>
          {getJobStatusLabel(job)}
        </span>
      </div>

      <dl className="admin-card-summary">
        <JobInfo label="기업명" value={job.company_name || "-"} />
        <JobInfo
          label="날짜"
          value={formatDateRange(job.start_date, job.end_date, job.event_date || job.date)}
        />
        <JobInfo label="장소" value={job.location || job.event_location || "-"} />
        <JobInfo label="언어" value={job.language || "-"} />
        <JobInfo label="지원자 수" value={`${jobApplications.length}명`} />
        <JobInfo label="합격" value={`${matchedCount}명`} />
      </dl>

      <div className="admin-card-chip-row">
        <span className={`status-badge ${requestType.isDesignated ? "badge-purple" : "badge-gray"}`}>
          {requestType.label}
        </span>
        <span className={`status-badge ${getVisibilityBadgeClass(normalizeJobVisibility(job))}`}>
          {getJobVisibilityLabel(job)}
        </span>
        {requestType.isDesignated && (
          <span className="admin-empty-chip">지정: {interpreterName}</span>
        )}
        {assignedInterpreterName && (
          <span className="admin-empty-chip">배정: {assignedInterpreterName}</span>
        )}
      </div>

      <div className="admin-card-controls-grid">
        <JobField label="모집 상태">
          <select
            className="admin-inline-select"
            value={normalizeJobStatus(job)}
            onChange={(event) =>
              updateJob(job, {
                status: event.target.value,
                is_urgent: event.target.value === "closing_soon",
              })
            }
          >
            {JOB_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </JobField>
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
      </div>

      <div className="admin-card-actions">
        <button
          type="button"
          className="admin-link-button primary"
          onClick={() => openApplicantsModal(job.id)}
        >
          지원자 {jobApplications.length}명
        </button>
        <button type="button" className="admin-link-button" onClick={() => startEdit(job)}>
          수정
        </button>
        <button type="button" className="admin-link-button danger" onClick={() => deleteJob(job)}>
          삭제
        </button>
      </div>

    </article>
  );
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

function MessageBox({ text }) {
  return <div className="admin-message">{text}</div>;
}

function JobApplicantsModal({ applications, job, onClose, onStatusChange }) {
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
          job={job || {}}
          onStatusChange={onStatusChange}
        />
      </section>
    </div>
  );
}

function JobApplicationsPanel({ applications, job, onStatusChange }) {
  const [openApplicationId, setOpenApplicationId] = useState(null);
  const duplicateApplicationIds = useMemo(
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
            const duplicateSuspected = duplicateApplicationIds.has(application.id);

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
                    <span className="admin-duplicate-badge">중복 의심</span>
                  )}
                  <span className="admin-applicant-summary-text">
                    <strong>{application.applicant_name || "이름 미입력"}</strong>
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
                      <strong>{application.applicant_name || "이름 미입력"}</strong>
                      <div className="admin-card-chip-row">
                        {duplicateSuspected && (
                          <span className="admin-duplicate-badge">중복 의심</span>
                        )}
                        <StatusBadge status={status} />
                      </div>
                      <span>지원자</span>
                    </div>

                    <div className="admin-applicant-detail-grid">
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

function getStatusBadgeClass(status) {
  return getStandardStatusBadgeClass(status);
}

function getJobStatusBadgeClass(status) {
  return getStandardStatusBadgeClass(status);
}

function getVisibilityBadgeClass(visibility) {
  return getStatusBadgeClass(visibility === "public" ? "공개" : "비공개");
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

function formatDate(value) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

export default AdminJobs;
