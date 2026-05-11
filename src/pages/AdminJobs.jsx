import { Fragment, useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
import {
  JOB_STATUS_OPTIONS,
  JOB_VISIBILITY_OPTIONS,
  getJobStatusLabel,
  getJobVisibilityLabel,
  normalizeJobStatus,
  normalizeJobVisibility,
} from "../utils/jobStatus";
import { formatDateRange, getDateRangeEnd, getDateRangeStart } from "../utils/dateRange";
import { fetchJobApplications } from "../utils/jobsApi";
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
  status: "open",
  is_urgent: false,
};

function getSupabaseErrorMessage(error, fallback) {
  return error?.message ? `${fallback} (${error.message})` : fallback;
}

const APPLICATION_STATUS_LABELS = {
  지원완료: "지원완료",
  검토중: "검토중",
  매칭완료: "매칭완료",
  보류: "보류",
  불합격: "불합격",
};

function AdminJobs({
  onBackClick,
  embedded = false,
  jobs: controlledJobs,
  requests = [],
  interpreters = [],
  applications: controlledApplications,
  onDataChanged,
  updateApplicationStatus: sharedUpdateApplicationStatus,
}) {
  const isControlled = embedded && Array.isArray(controlledJobs);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [expandedJobId, setExpandedJobId] = useState(null);
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
      setExpandedJobId((current) =>
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

  const getMatchedCount = (jobId) =>
    visibleApplications.filter(
      (application) =>
        String(application.job_id) === String(jobId) &&
        application.status === "매칭완료"
    ).length;

  const refreshApplications = async () => {
    const applicationData = await fetchJobApplications();
    setApplications(applicationData);
    return applicationData;
  };

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
          .update({ status: "assigned", is_urgent: false })
          .eq("id", application.job_id);

        if (jobError) {
          console.error("공고 상태 변경 실패:", jobError);
          alert("공고 모집 상태 변경에 실패했습니다.");
        } else {
          setJobs((current) =>
            current.map((job) =>
              String(job.id) === String(application.job_id)
                ? { ...job, status: "assigned", is_urgent: false }
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
          <div className="admin-table-wrap">
            <table className="admin-table admin-jobs-table">
              <thead>
                <tr>
                  <th className="admin-col-title">행사명</th>
                  <th className="admin-col-company">기업명</th>
                  <th className="admin-col-date">날짜</th>
                  <th className="admin-col-location">장소</th>
                  <th className="admin-col-language">언어</th>
                  <th>일급</th>
                  <th className="admin-col-status">지원자</th>
                  <th className="admin-col-status">매칭완료</th>
                  <th className="admin-col-status">모집 상태</th>
                  <th className="admin-col-status">공개 상태</th>
                  <th className="admin-col-actions">관리</th>
                </tr>
              </thead>
              <tbody>
                {visibleJobs.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="admin-empty-row">
                      현재 등록된 공고가 없습니다.
                    </td>
                  </tr>
                ) : (
                  visibleJobs.map((job) => {
                    const jobApplications = getApplicationsForJob(job.id);
                    const matchedCount = getMatchedCount(job.id);
                    const expanded = String(expandedJobId) === String(job.id);
                    const request = requestsByJobId.get(String(job.id));
                    const requestType = getDesignatedJobType(job, request);
                    const interpreterName = getDesignatedInterpreterName(
                      [job, request],
                      interpreters
                    );

                    return (
                      <Fragment key={job.id}>
                        <tr>
                          <td
                            className="admin-strong-cell admin-col-title"
                            title={job.title || ""}
                          >
                            <span className="admin-job-title">
                              {job.event_name || job.title || "-"}
                            </span>
                            <span className={`status-badge ${requestType.isDesignated ? "badge-purple" : "badge-gray"}`}>
                              {requestType.label}
                            </span>
                          </td>
                          <td
                            className="admin-col-company"
                            title={job.company_name || interpreterName}
                          >
                            {job.company_name || "-"}
                            {requestType.isDesignated && (
                              <span className="admin-muted-inline">
                                지정: {interpreterName}
                              </span>
                            )}
                          </td>
                          <td className="admin-col-date">
                            {formatDateRange(
                              job.start_date,
                              job.end_date,
                              job.event_date || job.date
                            )}
                          </td>
                          <td className="admin-col-location" title={job.location || job.event_location || ""}>
                            <span className="location-cell">{job.location || job.event_location || "-"}</span>
                          </td>
                          <td className="admin-col-language language-cell" title={job.language || ""}>
                            {job.language || "-"}
                          </td>
                          <td title={job.pay || ""}>{job.pay || "-"}</td>
                          <td className="admin-col-status">
                            <button
                              type="button"
                              className="admin-link-button primary"
                              onClick={() =>
                                setExpandedJobId((current) =>
                                  String(current) === String(job.id) ? null : job.id
                                )
                              }
                            >
                              지원자 {jobApplications.length}명
                            </button>
                          </td>
                          <td className="admin-col-status">
                            <span className="admin-match-count">
                              {matchedCount}명
                            </span>
                          </td>
                          <td className="admin-col-status">
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
                            <span className={`status-badge ${getJobStatusBadgeClass(normalizeJobStatus(job))}`}>
                              {getJobStatusLabel(job)}
                            </span>
                          </td>
                          <td className="admin-col-status">
                            <select
                              className="admin-inline-select"
                              value={normalizeJobVisibility(job)}
                              onChange={(event) =>
                                updateJob(job, { visibility: event.target.value })
                              }
                            >
                              {JOB_VISIBILITY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <span className={`status-badge ${getVisibilityBadgeClass(normalizeJobVisibility(job))}`}>
                              {getJobVisibilityLabel(job)}
                            </span>
                          </td>
                          <td className="admin-col-actions actions-cell">
                            <div className="admin-row-actions">
                              <button
                                type="button"
                                className="admin-link-button"
                                onClick={() => startEdit(job)}
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                className="admin-link-button danger"
                                onClick={() => deleteJob(job)}
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="admin-expanded-row admin-job-applications-row">
                            <td colSpan="11">
                              <JobApplicationsPanel
                                applications={jobApplications}
                                job={job}
                                onStatusChange={updateApplicationStatus}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
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

function JobField({ label, children }) {
  return (
    <label className="admin-field-control">
      <span>{label}</span>
      {children}
    </label>
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

function JobApplicationsPanel({ applications, job, onStatusChange }) {
  return (
    <div className="admin-applications-panel">
      <h4 title={job.title || ""}>{job.title || "공고"} 지원자 확인</h4>
      {applications.length === 0 ? (
        <span className="admin-empty-chip">이 공고에는 아직 지원자가 없습니다.</span>
      ) : (
        <div className="admin-nested-table-wrap">
          <table className="admin-nested-table">
            <thead>
              <tr>
                <th>지원일</th>
                <th>이름</th>
                <th>성별</th>
                <th>언어</th>
                <th>경력</th>
                <th>연락처</th>
                <th>이메일</th>
                <th>상태</th>
                <th>메모</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application.id}>
                  <td>{formatDate(application.created_at)}</td>
                  <td className="admin-strong-cell" title={application.applicant_name || ""}>
                    {application.applicant_name || "이름 미입력"}
                  </td>
                  <td>{application.gender || "-"}</td>
                  <td>{application.language || application.japanese_level || job.language || "-"}</td>
                  <td>{application.experience || application.career || "-"}</td>
                  <td title={`${application.phone || ""} ${application.email || ""}`}>
                    {application.phone || "연락처 미입력"}
                  </td>
                  <td title={application.email || ""}>
                    {application.email || "-"}
                  </td>
                  <td><StatusBadge status={application.status || "지원완료"} /></td>
                  <td title={application.message || ""}>
                    {application.message || "지원 메모 없음"}
                  </td>
                  <td>
                    <div className="admin-application-actions actions-cell">
                      {application.status === "매칭완료" ? (
                        <StatusBadge status="매칭완료" />
                      ) : (
                        <button
                          type="button"
                          className="admin-link-button primary"
                          onClick={() =>
                            onStatusChange(application, "매칭완료", {
                              confirmMessage: "이 지원자를 해당 공고에 매칭하시겠습니까?",
                              askAssignJob: true,
                            })
                          }
                        >
                          매칭하기
                        </button>
                      )}
                      {application.status !== "보류" && (
                        <button
                          type="button"
                          className="admin-link-button warning"
                          onClick={() =>
                            onStatusChange(application, "보류", {
                              confirmMessage: "이 지원자를 보류 상태로 변경하시겠습니까?",
                            })
                          }
                        >
                          보류
                        </button>
                      )}
                      {application.status !== "불합격" && (
                        <button
                          type="button"
                          className="admin-link-button danger"
                          onClick={() =>
                            onStatusChange(application, "불합격", {
                              confirmMessage: "이 지원자를 불합격 상태로 변경하시겠습니까?",
                            })
                          }
                        >
                          불합격
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = APPLICATION_STATUS_LABELS[status] || status || "지원완료";
  return (
    <span className={`status-badge ${getStatusBadgeClass(normalized)}`}>
      {normalized}
    </span>
  );
}

function getStatusBadgeClass(status) {
  if (["모집중", "open", "공개", "public", "매칭완료"].includes(status)) {
    return "badge-green";
  }
  if (["배정완료", "assigned", "지원완료"].includes(status)) {
    return "badge-blue";
  }
  if (["모집마감", "closed", "비공개", "private", "일반의뢰"].includes(status)) {
    return "badge-gray";
  }
  if (status === "검토중") return "badge-yellow";
  if (status === "보류") return "badge-orange";
  if (status === "불합격") return "badge-red";
  if (status === "지정의뢰") return "badge-purple";
  return "badge-blue";
}

function getJobStatusBadgeClass(status) {
  return getStatusBadgeClass(
    { open: "모집중", assigned: "배정완료", closed: "모집마감" }[status] || status
  );
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

function formatDate(value) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

export default AdminJobs;
