import { useCallback, useEffect, useState } from "react";
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

function AdminJobs({ onBackClick, embedded = false }) {
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [selectedJobForApplications, setSelectedJobForApplications] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchJobs = useCallback(async () => {
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
  }, []);

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
      await fetchJobs();
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

      setJobs((current) =>
        current.map((item) => (item.id === job.id ? { ...item, ...changes } : item))
      );
      setSelectedJobForApplications((current) =>
        current?.id === job.id ? { ...current, ...changes } : current
      );
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
      const { error } = await supabase.from("jobs").delete().eq("id", job.id);

      if (error) throw error;

      setJobs((current) => current.filter((item) => item.id !== job.id));
      setApplications((current) =>
        current.filter((application) => String(application.job_id) !== String(job.id))
      );
      setSelectedJobForApplications((current) =>
        current?.id === job.id ? null : current
      );
      if (editingId === job.id) resetForm();
    } catch (error) {
      console.error(error);
      alert(getSupabaseErrorMessage(error, "공고 삭제에 실패했습니다."));
    }
  };

  const getApplicationsForJob = (jobId) =>
    applications.filter((application) => String(application.job_id) === String(jobId));

  const content = (
    <>
      <section className="admin-section">
        <SectionTitle count={`${jobs.length}건`} title="통역 공고 관리" />

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
                  <th>공고 제목</th>
                  <th>장소</th>
                  <th>날짜</th>
                  <th>일급</th>
                  <th>언어</th>
                  <th>레벨</th>
                  <th>우대</th>
                  <th>인원</th>
                  <th>공개 상태</th>
                  <th>모집 상태</th>
                  <th>지원자</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan="12" className="admin-empty-row">
                      현재 등록된 공고가 없습니다.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id}>
                      <td className="admin-strong-cell">{job.title || "-"}</td>
                      <td>{job.location || "-"}</td>
                      <td>
                        {formatDateRange(
                          job.start_date,
                          job.end_date,
                          job.event_date || job.date
                        )}
                      </td>
                      <td>{job.pay || "-"}</td>
                      <td>{job.language || "-"}</td>
                      <td>{job.level || "-"}</td>
                      <td>{job.preference || "-"}</td>
                      <td>{job.people || "-"}</td>
                      <td>
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
                        <span className="admin-muted-inline">
                          {getJobVisibilityLabel(job)}
                        </span>
                      </td>
                      <td>
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
                        <span className="admin-muted-inline">
                          {getJobStatusLabel(job)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="admin-link-button"
                          onClick={() =>
                            setSelectedJobForApplications((current) =>
                              current?.id === job.id ? null : job
                            )
                          }
                        >
                          지원자 확인 ({getApplicationsForJob(job.id).length}명)
                        </button>
                      </td>
                      <td>
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
                  ))
                )}
              </tbody>
            </table>
            {selectedJobForApplications && (
              <JobApplicationsPanel
                applications={getApplicationsForJob(selectedJobForApplications.id)}
                job={selectedJobForApplications}
              />
            )}
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

function JobApplicationsPanel({ applications, job }) {
  return (
    <div className="admin-applications-panel">
      <h4>{job.title || "공고"} 지원자 확인</h4>
      {applications.length === 0 ? (
        <span className="admin-empty-chip">이 공고에는 아직 지원자가 없습니다.</span>
      ) : (
        <div className="admin-application-list">
          {applications.map((application) => (
            <article key={application.id} className="admin-application-card">
              <div>
                <strong>{application.applicant_name || "이름 미입력"}</strong>
                <span>
                  {application.phone || "연락처 미입력"} ·{" "}
                  {application.email || "이메일 미입력"}
                </span>
                <span>
                  지원일 {formatDate(application.created_at)} ·{" "}
                  {application.status || "지원완료"}
                </span>
                <p>{application.message || "지원 메모 없음"}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(value) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

export default AdminJobs;
