import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CalendarDays,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Lock,
  UserRoundCog,
} from "lucide-react";
import { supabase, supabaseConfigError } from "../supabase";
import { fetchPublicJobs } from "../utils/jobsApi";
import { canApplyToJob, normalizeJobStatus } from "../utils/jobStatus";
import { formatCompactJobDateRange, formatDateRange } from "../utils/dateRange";
import { getJobLevelSummary, getJobSpecialty } from "../utils/jobDisplay";
import { getApplicationStatusLabel, getMatchingStatusLabel, getStatusBadgeClass } from "../utils/status";
import {
  SETTLEMENT_FLOW_STATUS,
  getSettlementFlowStatusLabel,
  normalizeSettlementFlowStatus,
} from "../utils/operationsStatus";
import "./InterpreterDashboard.css";

const PROFILE_COLUMNS = [
  "id",
  "auth_user_id",
  "interpreter_no",
  "name",
  "email",
  "level",
  "status",
  "activity_status",
  "is_public",
  "resume_url",
  "resume_file_url",
  "resume_file_name",
  "bankbook_file_url",
  "bankbook_file_name",
  "business_license_file_url",
  "business_license_file_name",
].join(", ");

const TAB_ITEMS = [
  { id: "jobs", label: "지원 가능 공고" },
  { id: "applications", label: "내 지원 현황" },
  { id: "assignments", label: "배정 업무" },
  { id: "settlements", label: "정산" },
  { id: "profile", label: "프로필 관리" },
];

function InterpreterDashboard({
  authLoading,
  isAdmin = false,
  user,
  onHomeClick,
  onJobDetailClick,
  onLoginClick,
  onMypageClick,
  onRegisterClick,
  onSignOut,
}) {
  const [interpreter, setInterpreter] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [activeTab, setActiveTab] = useState("jobs");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPublicSaving, setIsPublicSaving] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (authLoading) return;
    if (!user || isAdmin) {
      setLoading(false);
      return;
    }
    if (!supabase) {
      setErrorMessage(supabaseConfigError.message);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const normalizedEmail = normalizeEmail(user.email);
    if (!normalizedEmail) {
      setErrorMessage("로그인 계정 이메일을 확인할 수 없습니다.");
      setLoading(false);
      return;
    }

    const { data: authProfiles, error: authProfileError } = await supabase
      .from("interpreters")
      .select(PROFILE_COLUMNS)
      .eq("auth_user_id", user.id)
      .limit(1);

    if (authProfileError) {
      console.error("Interpreter dashboard profile fetch failed", authProfileError);
      setErrorMessage("통역사 프로필을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    let nextInterpreter = authProfiles?.[0] || null;

    if (!nextInterpreter) {
      const { data: emailProfiles, error: emailProfileError } = await supabase
        .from("interpreters")
        .select(PROFILE_COLUMNS)
        .ilike("email", normalizedEmail)
        .limit(5);

      if (emailProfileError) {
        console.error("Interpreter dashboard email profile fetch failed", emailProfileError);
        setErrorMessage("통역사 프로필을 불러오지 못했습니다.");
        setLoading(false);
        return;
      }

      nextInterpreter = (emailProfiles || []).find(
        (row) => normalizeEmail(row.email) === normalizedEmail
      );
    }

    if (!nextInterpreter) {
      setInterpreter(null);
      setLoading(false);
      return;
    }

    let resolvedInterpreter = nextInterpreter;
    if (!resolvedInterpreter.auth_user_id) {
      const { data: linkedProfile, error: linkError } = await supabase
        .from("interpreters")
        .update({ auth_user_id: user.id })
        .eq("id", resolvedInterpreter.id)
        .select(PROFILE_COLUMNS)
        .single();

      if (linkError) {
        console.warn("Interpreter auth_user_id link skipped", linkError);
      } else {
        resolvedInterpreter = linkedProfile || resolvedInterpreter;
      }
    }

    setInterpreter(resolvedInterpreter);

    const [jobResult, applicationResult, assignmentResult, settlementResult] = await Promise.all([
      fetchPublicJobs(supabase),
      supabase.rpc("get_my_job_applications"),
      supabase.rpc("get_my_assignments"),
      supabase.rpc("get_my_settlements"),
    ]);

    if (jobResult.error) {
      console.error("Interpreter dashboard public jobs fetch failed", jobResult.error);
    }
    if (applicationResult.error) {
      console.error("Interpreter dashboard applications fetch failed", applicationResult.error);
    }
    if (assignmentResult.error) {
      console.error("Interpreter dashboard assignments fetch failed", assignmentResult.error);
    }
    if (settlementResult.error) {
      console.error("Interpreter dashboard settlements fetch failed", settlementResult.error);
    }

    setJobs((jobResult.data || []).filter(isRecruitingPublicJob).slice(0, 12));
    setApplications((applicationResult.data || []).map(mapApplicationRow));
    setAssignments((assignmentResult.data || []).map(mapAssignmentRow));
    setSettlements((settlementResult.data || []).map(mapSettlementRow));
    setLoading(false);
  }, [authLoading, isAdmin, user]);

  useEffect(() => {
    queueMicrotask(loadDashboard);
  }, [loadDashboard]);

  const upcomingAssignments = useMemo(
    () => assignments.filter((assignment) => isUpcomingAssignment(assignment)),
    [assignments]
  );
  const completedAssignments = useMemo(
    () => assignments.filter((assignment) => isCompletedAssignment(assignment)),
    [assignments]
  );
  const pendingSettlements = useMemo(
    () => settlements.filter((settlement) => isPendingSettlement(settlement)),
    [settlements]
  );
  const paidSettlements = useMemo(
    () => settlements.filter((settlement) => isPaidSettlement(settlement)),
    [settlements]
  );
  const pendingSettlementAmount = useMemo(
    () => pendingSettlements.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [pendingSettlements]
  );

  const handleTogglePublic = async () => {
    if (!supabase || !interpreter || isPublicSaving) return;
    const nextValue = interpreter.is_public ? false : true;
    setIsPublicSaving(true);

    const { data, error } = await supabase
      .from("interpreters")
      .update({ is_public: nextValue })
      .eq("id", interpreter.id)
      .eq("auth_user_id", user.id)
      .select(PROFILE_COLUMNS)
      .single();

    if (error) {
      console.error("Profile public status update failed", error);
      alert("프로필 공개 상태 변경에 실패했습니다.");
    } else {
      setInterpreter(data || { ...interpreter, is_public: nextValue });
    }

    setIsPublicSaving(false);
  };

  if (authLoading || loading) {
    return (
      <main className="interpreter-dashboard">
        <section className="interpreter-dashboard-message">
          <p className="dashboard-kicker">ON-LI INTERPRETER</p>
          <h1>통역사 대시보드를 불러오고 있습니다.</h1>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <DashboardGate
        icon={Lock}
        title="로그인이 필요합니다."
        description="통역사 대시보드는 로그인한 통역사만 이용할 수 있습니다."
        primaryText="통역사 로그인"
        onPrimaryClick={onLoginClick}
        onHomeClick={onHomeClick}
      />
    );
  }

  if (isAdmin) {
    return (
      <DashboardGate
        icon={Lock}
        title="접근 권한이 없습니다."
        description="관리자 계정은 통역사 전용 대시보드에 접근할 수 없습니다."
        primaryText="메인으로"
        onPrimaryClick={onHomeClick}
        onHomeClick={onHomeClick}
      />
    );
  }

  if (!interpreter) {
    return (
      <DashboardGate
        icon={UserRoundCog}
        title="통역사 프로필이 필요합니다."
        description="현재 로그인 계정과 연결된 통역사 프로필이 없습니다."
        primaryText="통역사 등록하기"
        onPrimaryClick={onRegisterClick}
        onHomeClick={onHomeClick}
      />
    );
  }

  return (
    <main className="interpreter-dashboard">
      <div className="interpreter-dashboard-shell">
        <section className="interpreter-dashboard-head">
          <div>
            <p className="dashboard-kicker">ON-LI INTERPRETER</p>
            <h1>통역사 대시보드</h1>
            <p>{interpreter.name || user.email}님의 지원, 배정, 정산, 프로필 상태입니다.</p>
          </div>
          <div className="dashboard-head-actions">
            <button type="button" className="dashboard-secondary-button" onClick={onHomeClick}>
              메인으로
            </button>
            <button type="button" className="dashboard-primary-button" onClick={onSignOut}>
              로그아웃
            </button>
          </div>
        </section>

        {errorMessage && <p className="dashboard-alert">{errorMessage}</p>}

        <section className="dashboard-summary-grid" aria-label="통역사 대시보드 요약">
          <SummaryCard icon={FileText} label="지원 중" value={`${applications.length}건`} />
          <SummaryCard icon={CalendarDays} label="예정 업무" value={`${upcomingAssignments.length}건`} />
          <SummaryCard icon={Banknote} label="정산 예정" value={formatCurrency(pendingSettlementAmount)} />
          <SummaryCard
            icon={interpreter.is_public ? Eye : EyeOff}
            label="프로필 공개 상태"
            value={interpreter.is_public ? "공개" : "비공개"}
          />
        </section>

        <nav className="dashboard-tabs" aria-label="통역사 대시보드 섹션">
          {TAB_ITEMS.map((tab) => (
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

        <section className="dashboard-panel">
          {activeTab === "jobs" && (
            <DashboardSection title="지원 가능 공고" description="모집중인 공개 공고입니다.">
              <CardList
                emptyText="현재 지원 가능한 공개 공고가 없습니다."
                items={jobs}
                renderItem={(job) => (
                  <JobDashboardCard
                    key={job.id}
                    job={job}
                    actionText={canApplyToJob(job) ? "상세 확인" : "공고 확인"}
                    onClick={() => onJobDetailClick?.(job.id)}
                  />
                )}
              />
            </DashboardSection>
          )}

          {activeTab === "applications" && (
            <DashboardSection title="내 지원 현황" description="현재 로그인한 통역사의 지원 내역입니다.">
              <CardList
                emptyText="아직 지원한 공고가 없습니다."
                items={applications}
                renderItem={(application) => (
                  <RecordCard
                    key={application.id}
                    title={application.title}
                    code={application.code}
                    meta={[application.dateLabel, application.location].filter(Boolean).join(" / ")}
                    status={getApplicationStatusLabel(application.status)}
                    statusClass={getStatusBadgeClass(application.status)}
                    onClick={() => application.jobId && onJobDetailClick?.(application.jobId)}
                  />
                )}
              />
            </DashboardSection>
          )}

          {activeTab === "assignments" && (
            <DashboardSection title="배정 업무" description="배정 완료 상태의 예정 업무와 완료 업무입니다.">
              <div className="dashboard-split-grid">
                <Subsection title="예정 업무">
                  <CardList
                    emptyText="예정된 배정 업무가 없습니다."
                    items={upcomingAssignments}
                    renderItem={(assignment) => (
                      <RecordCard
                        key={assignment.id}
                        title={assignment.title}
                        code={assignment.code}
                        meta={[assignment.dateLabel, assignment.location].filter(Boolean).join(" / ")}
                        status={getMatchingStatusLabel(assignment.status)}
                        statusClass={getStatusBadgeClass(assignment.status)}
                        onClick={() => assignment.jobId && onJobDetailClick?.(assignment.jobId)}
                      />
                    )}
                  />
                </Subsection>
                <Subsection title="완료 업무">
                  <CardList
                    emptyText="완료된 배정 업무가 없습니다."
                    items={completedAssignments}
                    renderItem={(assignment) => (
                      <RecordCard
                        key={assignment.id}
                        title={assignment.title}
                        code={assignment.code}
                        meta={[assignment.dateLabel, assignment.location].filter(Boolean).join(" / ")}
                        status={getMatchingStatusLabel(assignment.status)}
                        statusClass={getStatusBadgeClass(assignment.status)}
                        onClick={() => assignment.jobId && onJobDetailClick?.(assignment.jobId)}
                      />
                    )}
                  />
                </Subsection>
              </div>
            </DashboardSection>
          )}

          {activeTab === "settlements" && (
            <DashboardSection title="정산" description="정산 예정 금액과 지급 완료 내역입니다.">
              <div className="dashboard-settlement-summary">
                <SummaryPill label="예정 금액" value={formatCurrency(pendingSettlementAmount)} />
                <SummaryPill label="정산 완료" value={`${paidSettlements.length}건`} />
                <SummaryPill label="지급 상태" value={getPaymentOverview(settlements)} />
              </div>
              <div className="dashboard-split-grid">
                <Subsection title="정산 예정">
                  <CardList
                    emptyText="정산 예정 내역이 없습니다."
                    items={pendingSettlements}
                    renderItem={(settlement) => (
                      <SettlementCard key={settlement.id} settlement={settlement} />
                    )}
                  />
                </Subsection>
                <Subsection title="정산 완료">
                  <CardList
                    emptyText="정산 완료 내역이 없습니다."
                    items={paidSettlements}
                    renderItem={(settlement) => (
                      <SettlementCard key={settlement.id} settlement={settlement} />
                    )}
                  />
                </Subsection>
              </div>
            </DashboardSection>
          )}

          {activeTab === "profile" && (
            <DashboardSection title="프로필 관리" description="공개 상태, 이력서, 계좌 관련 정보를 확인합니다.">
              <div className="dashboard-profile-grid">
                <article className="dashboard-profile-card">
                  <div>
                    <h3>프로필 공개</h3>
                    <p>공개 목록 노출 여부를 변경합니다.</p>
                  </div>
                  <button
                    type="button"
                    className={`dashboard-toggle-button ${interpreter.is_public ? "is-on" : ""}`}
                    disabled={isPublicSaving}
                    onClick={handleTogglePublic}
                    aria-pressed={interpreter.is_public ? true : false}
                  >
                    {interpreter.is_public ? "ON" : "OFF"}
                  </button>
                </article>
                <ProfileStatusCard
                  title="이력서"
                  value={getResumeLabel(interpreter)}
                  actionText="이력서 관리"
                  onClick={onMypageClick}
                />
                <ProfileStatusCard
                  title="계좌 정보"
                  value={getAccountLabel(interpreter)}
                  actionText="계좌 정보 관리"
                  onClick={onMypageClick}
                />
              </div>
            </DashboardSection>
          )}
        </section>
      </div>
    </main>
  );
}

function DashboardGate({ description, icon: Icon, onHomeClick, onPrimaryClick, primaryText, title }) {
  return (
    <main className="interpreter-dashboard">
      <section className="interpreter-dashboard-message">
        {Icon && <Icon size={32} aria-hidden="true" />}
        <p className="dashboard-kicker">ON-LI INTERPRETER</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="dashboard-head-actions">
          <button type="button" className="dashboard-primary-button" onClick={onPrimaryClick}>
            {primaryText}
          </button>
          <button type="button" className="dashboard-secondary-button" onClick={onHomeClick}>
            메인으로
          </button>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <article className="dashboard-summary-card">
      <span className="dashboard-summary-icon">
        <Icon size={22} aria-hidden="true" />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function DashboardSection({ children, description, title }) {
  return (
    <div className="dashboard-section">
      <div className="dashboard-section-head">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}

function Subsection({ children, title }) {
  return (
    <div className="dashboard-subsection">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function CardList({ emptyText, items, renderItem }) {
  if (!items.length) {
    return <p className="dashboard-empty">{emptyText}</p>;
  }

  return <div className="dashboard-card-list">{items.map(renderItem)}</div>;
}

function JobDashboardCard({ actionText, job, onClick }) {
  return (
    <button type="button" className="dashboard-list-card" onClick={onClick}>
      <div>
        <span className="dashboard-record-code">{job.job_no || "공개 공고"}</span>
        <h3>{job.event_name || job.title || "통역 공고"}</h3>
        <p>{formatCompactJobDateRange(job)} / {job.event_location || job.location || "장소 미정"}</p>
        <p>{getJobLevelSummary(job)} · {getJobSpecialty(job)}</p>
      </div>
      <span className="dashboard-card-action">
        {actionText}
        <ChevronRight size={16} aria-hidden="true" />
      </span>
    </button>
  );
}

function RecordCard({ code, meta, onClick, status, statusClass, title }) {
  const Component = onClick ? "button" : "article";
  return (
    <Component type={onClick ? "button" : undefined} className="dashboard-list-card" onClick={onClick}>
      <div>
        <span className="dashboard-record-code">{code || "관리번호 확인 중"}</span>
        <h3>{title}</h3>
        <p>{meta || "일정 정보 확인 중"}</p>
      </div>
      <span className={`status-badge ${statusClass}`}>{status}</span>
    </Component>
  );
}

function SettlementCard({ settlement }) {
  return (
    <article className="dashboard-list-card">
      <div>
        <span className="dashboard-record-code">{settlement.code || "정산 내역"}</span>
        <h3>{settlement.title}</h3>
        <p>{settlement.dateLabel}</p>
        <p>{getSettlementFlowStatusLabel(settlement.settlementStatus)} · {getPaymentStatusLabel(settlement.paymentStatus)}</p>
      </div>
      <strong className="dashboard-money">{formatCurrency(settlement.amount)}</strong>
    </article>
  );
}

function SummaryPill({ label, value }) {
  return (
    <span className="dashboard-summary-pill">
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function ProfileStatusCard({ actionText, onClick, title, value }) {
  return (
    <article className="dashboard-profile-card">
      <div>
        <h3>{title}</h3>
        <p>{value}</p>
      </div>
      <button type="button" className="dashboard-secondary-button" onClick={onClick}>
        {actionText}
      </button>
    </article>
  );
}

function isRecruitingPublicJob(job = {}) {
  const status = normalizeJobStatus(job);
  return status === "recruiting" || status === "open";
}

function mapApplicationRow(row = {}) {
  return {
    id: row.application_id,
    code: row.application_code || row.public_job_code,
    jobId: row.job_id,
    status: row.application_status,
    title: row.event_name || row.title || "지원한 공고",
    location: row.location || "",
    dateLabel: formatDateRange(row.start_date, row.end_date, row.work_date),
  };
}

function mapAssignmentRow(row = {}) {
  return {
    id: row.assignment_id,
    code: row.assignment_code || row.public_job_code,
    jobId: row.job_id,
    status: row.public_status,
    title: row.event_name || row.title || "배정된 통역",
    location: row.location || "",
    startDate: row.start_date,
    endDate: row.end_date,
    dateLabel: formatDateRange(row.start_date, row.end_date, row.work_date),
  };
}

function mapSettlementRow(row = {}) {
  return {
    id: row.settlement_id,
    code: row.assignment_code || row.public_job_code,
    status: row.public_status,
    title: row.event_name || row.title || "정산 내역",
    startDate: row.start_date,
    endDate: row.end_date,
    dateLabel: formatDateRange(row.start_date, row.end_date),
    amount: Number(row.amount || 0),
    settlementStatus: normalizeSettlementFlowStatus({
      settlement_status: row.settlement_status,
      status: row.public_status,
    }),
    paymentStatus: normalizePaymentStatus(row.payment_status),
  };
}

function isUpcomingAssignment(assignment) {
  if (!isAssignedStatus(assignment.status)) return false;
  if (isCompletedAssignment(assignment)) return false;
  const start = getDateOnly(assignment.startDate || assignment.endDate);
  if (!start) return true;
  return start >= getDateOnly(new Date());
}

function isCompletedAssignment(assignment) {
  const status = String(assignment.status || "").toLowerCase();
  if (["completed", "settled", "정산완료", "운영완료", "완료"].includes(status)) return true;
  const end = getDateOnly(assignment.endDate || assignment.startDate);
  return end ? end < getDateOnly(new Date()) : false;
}

function isAssignedStatus(status) {
  return ["assigned", "confirmed", "in_progress", "completed", "settled", "배정완료", "배정", "운영완료"].includes(
    String(status || "").toLowerCase()
  );
}

function isPendingSettlement(settlement) {
  return (
    settlement.amount > 0 &&
    settlement.settlementStatus !== SETTLEMENT_FLOW_STATUS.COMPLETED &&
    settlement.paymentStatus !== "paid"
  );
}

function isPaidSettlement(settlement) {
  return settlement.settlementStatus === SETTLEMENT_FLOW_STATUS.COMPLETED || settlement.paymentStatus === "paid";
}

function getPaymentOverview(settlements) {
  if (settlements.some((item) => item.paymentStatus === "processing")) return "processing";
  if (settlements.some((item) => item.paymentStatus === "pending")) return "pending";
  if (settlements.some((item) => item.paymentStatus === "paid")) return "paid";
  return "pending";
}

function normalizePaymentStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (["paid", "completed", "정산완료", "지급완료"].includes(value)) return "paid";
  if (["processing", "in_progress", "처리중", "지급중"].includes(value)) return "processing";
  return "pending";
}

function getPaymentStatusLabel(status) {
  return {
    pending: "pending",
    processing: "processing",
    paid: "paid",
  }[status] || "pending";
}

function getResumeLabel(interpreter) {
  if (interpreter.resume_file_url) return interpreter.resume_file_name || "이력서 파일 등록";
  if (interpreter.resume_url) return "이력서 링크 등록";
  return "미등록";
}

function getAccountLabel(interpreter) {
  const labels = [];
  if (interpreter.bankbook_file_url) labels.push("통장 사본 등록");
  if (interpreter.business_license_file_url) labels.push("사업자등록증 등록");
  return labels.length ? labels.join(" / ") : "미등록";
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString("ko-KR")}원`;
}

function getDateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export default InterpreterDashboard;
