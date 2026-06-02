import { useEffect, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
import {
  INTERPRETER_ACTIVITY_STATUS,
  getInterpreterActivityStatusLabel,
  getApplicationStatusLabel,
  getMatchingStatusLabel,
  getStatusBadgeClass,
} from "../utils/status";
import { normalizeLevel } from "../utils/levelBadge";
import "./InterpreterAuth.css";
import {
  Award,
  BriefcaseBusiness,
  CircleCheck,
  FileText,
} from "lucide-react";

const TABS = [
  { id: "profile", label: "프로필 정보", icon: "👤" },
  { id: "applications", label: "지원 내역", icon: "📄" },
  { id: "assignments", label: "배정 내역", icon: "💼" },
  { id: "schedule", label: "일정 및 캘린더", icon: "📅" },
];

function InterpreterMypage({
  authLoading,
  user,
  onLoginClick,
  onRegisterClick,
  onHomeClick,
  onSignOut,
}) {
  const [interpreter, setInterpreter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("loading");

  // Dynamic dashboard states
  const [applications, setApplications] = useState([]);
  const [matchings, setMatchings] = useState([]);
  const [activeTab, setActiveTab] = useState("profile");
  const [loadingData, setLoadingData] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Collapsible sections for mobile view
  const [showIntro, setShowIntro] = useState(false);
  const [showCareer, setShowCareer] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [showTasks, setShowTasks] = useState(false);

  // Profile Edit Mode States
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    gender: "",
    level: "Lv1",
  });
  const [specialtiesInput, setSpecialtiesInput] = useState("");
  const [regionsInput, setRegionsInput] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Resume Submission States
  const [isSubmittingResume, setIsSubmittingResume] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleStartEdit = () => {
    if (!interpreter) return;
    setEditForm({
      name: interpreter.name || "",
      phone: interpreter.phone || "",
      gender: interpreter.gender || "",
      level: interpreter.level || "Lv1",
    });
    setSpecialtiesInput(
      Array.isArray(interpreter.specialties)
        ? interpreter.specialties.filter(Boolean).join(", ")
        : ""
    );
    setRegionsInput(
      Array.isArray(interpreter.available_regions)
        ? interpreter.available_regions.filter(Boolean).join(", ")
        : ""
    );
    setIsEditingProfile(true);
  };

  const handleEditFormChange = (e) => {
    const { name, value } = e.target;
    setEditForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleCancelEdit = () => {
    setIsEditingProfile(false);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (isUpdatingProfile || !supabase || !interpreter) return;
    setIsUpdatingProfile(true);

    const specialties = specialtiesInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const available_regions = regionsInput
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    const payload = {
      name: editForm.name,
      phone: editForm.phone,
      gender: editForm.gender,
      level: editForm.level,
      specialties,
      available_regions,
    };

    const { data, error } = await supabase
      .from("interpreters")
      .update(payload)
      .eq("id", interpreter.id)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to update interpreter profile", error);
      alert("프로필 수정에 실패했습니다. 다시 시도해주세요.");
    } else {
      setInterpreter(data);
      setIsEditingProfile(false);
      alert("프로필 정보가 성공적으로 수정되었습니다.");
    }
    setIsUpdatingProfile(false);
  };


  const handleFileSelection = (file) => {
    if (!file) return;

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("파일 크기는 최대 10MB까지 가능합니다.");
      return;
    }

    const allowedExtensions = ["pdf", "doc", "docx", "png", "jpg", "jpeg"];
    const fileExtension = file.name.split(".").pop().toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      alert("허용되지 않는 파일 형식입니다. (PDF, DOC, DOCX, PNG, JPG 파일만 가능)");
      return;
    }

    setResumeFile(file);
  };

  const handleDownloadResume = async (filePath, fileName) => {
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

  const handleUpdateResume = async (e) => {
    e.preventDefault();
    if (isSubmittingResume || !supabase || !interpreter || !user) return;

    if (!resumeFile) {
      alert("업로드할 이력서 파일을 선택해주세요.");
      return;
    }

    setIsSubmittingResume(true);

    // 1. Supabase Storage bucket 존재 여부 확인
    try {
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      if (bucketsError) throw bucketsError;
      
      const bucketExists = buckets?.some(b => b.id === "resume-files");
      if (!bucketExists) {
        console.error("resume-files bucket not found");
      }
    } catch (err) {
      console.error("Failed to check storage buckets:", err);
    }

    let filePath = "";
    let fileUrl = "";
    let fileName = "";

    // 4. safe filename 처리
    const safeFileName = resumeFile.name
      .replace(/\s+/g, "_")
      .replace(/[^\w.-]/g, "");

    // 5. 업로드 경로 수정
    filePath = `${user.id}/${Date.now()}_${safeFileName}`;
    fileName = resumeFile.name;

    // 3. Storage upload 실행
    // authenticated user upload 허용 필요
    // Supabase Storage에서 resume-files bucket 생성 필요
    try {
      const { data, error } = await supabase.storage
        .from("resume-files")
        .upload(filePath, resumeFile, {
          upsert: true,
        });

      if (error) {
        console.error("Resume upload error message:", error.message);
        throw error;
      }

      // 8. public URL 생성 수정
      const {
        data: { publicUrl },
      } = supabase.storage
        .from("resume-files")
        .getPublicUrl(filePath);

      fileUrl = publicUrl;
    } catch (uploadError) {
      console.error("Resume upload error:", uploadError);
      console.error("Details: ", {
        uploadError,
        filePath,
        userId: user.id,
      });
      alert("이력서 파일 업로드에 실패했습니다. 다시 시도해주세요.");
      setIsSubmittingResume(false);
      return;
    }

    // 7. DB 저장은 업로드 성공 후만 실행
    const payload = {
      resume_file_url: fileUrl,
      resume_file_name: fileName,
      resume_uploaded_at: new Date().toISOString(),
      resume_submitted_at: new Date().toISOString(),
      badge_review_status: "review_pending",
      status: "pending",
    };

    const { data: dbData, error: dbError } = await supabase
      .from("interpreters")
      .update(payload)
      .eq("id", interpreter.id)
      .select("*")
      .single();

    if (dbError) {
      console.error("Failed to submit resume to DB", dbError);
      console.error("Details: ", {
        dbError,
        payload,
        userId: user.id,
      });
      alert("이력서 제출에 실패했습니다. 다시 시도해주세요.");
    } else {
      setInterpreter(dbData);
      alert("이력서가 정상 제출되었습니다.");
      setResumeFile(null);
    }
    setIsSubmittingResume(false);
  };

  const fetchApplicationsData = async (interpreterId) => {
    if (!supabase) return [];
    
    // Attempt joined query
    const { data, error } = await supabase
      .from("job_applications")
      .select(`
        id,
        application_no,
        job_id,
        applicant_name,
        phone,
        email,
        message,
        status,
        created_at,
        jobs (
          id,
          job_no,
          title,
          location,
          start_date,
          end_date,
          language
        )
      `)
      .eq("interpreter_id", interpreterId);

    if (error) {
      console.warn("Direct job_applications join failed, attempting fallback", error);
      // Fallback: fetch job_applications then fetch jobs separately
      const { data: apps, error: appsErr } = await supabase
        .from("job_applications")
        .select("*")
        .eq("interpreter_id", interpreterId);

      if (appsErr) {
        console.error("Fallback job_applications fetch failed", appsErr);
        return [];
      }

      if (!apps || apps.length === 0) return [];

      const jobIds = [...new Set(apps.map((a) => a.job_id).filter(Boolean))];
      if (jobIds.length === 0) {
        return apps.map((a) => ({ ...a, jobs: null }));
      }

      const { data: jobsList, error: jobsErr } = await supabase
        .from("jobs")
        .select("*")
        .in("id", jobIds);

      if (jobsErr) {
        console.error("Fallback jobs fetch failed", jobsErr);
        return apps.map((a) => ({ ...a, jobs: null }));
      }

      const jobsMap = new Map(jobsList.map((j) => [j.id, j]));
      return apps.map((a) => ({
        ...a,
        jobs: jobsMap.get(a.job_id) || null,
      }));
    }

    return data || [];
  };

  const fetchMatchingsData = async (interpreterId) => {
    if (!supabase) return [];

    // Attempt joined query
    const { data, error } = await supabase
      .from("matchings")
      .select(`
        id,
        matching_no,
        job_id,
        start_date,
        end_date,
        status,
        jobs (
          id,
          job_no,
          title,
          company_name,
          location,
          language
        )
      `)
      .eq("interpreter_id", interpreterId);

    if (error) {
      console.warn("Direct matchings join failed, attempting fallback", error);
      // Fallback
      const { data: mats, error: matsErr } = await supabase
        .from("matchings")
        .select("*")
        .eq("interpreter_id", interpreterId);

      if (matsErr) {
        console.error("Fallback matchings fetch failed", matsErr);
        return [];
      }

      if (!mats || mats.length === 0) return [];

      const jobIds = [...new Set(mats.map((m) => m.job_id).filter(Boolean))];
      if (jobIds.length === 0) {
        return mats.map((m) => ({ ...m, jobs: null }));
      }

      const { data: jobsList, error: jobsErr } = await supabase
        .from("jobs")
        .select("*")
        .in("id", jobIds);

      if (jobsErr) {
        console.error("Fallback jobs fetch failed for matchings", jobsErr);
        return mats.map((m) => ({ ...m, jobs: null }));
      }

      const jobsMap = new Map(jobsList.map((j) => [j.id, j]));
      return mats.map((m) => ({
        ...m,
        jobs: jobsMap.get(m.job_id) || null,
      }));
    }

    return data || [];
  };

  useEffect(() => {
    const fetchInterpreter = async () => {
      if (authLoading) return;

      if (!user) {
        setStatus("signedOut");
        setLoading(false);
        return;
      }

      if (!supabase) {
        setMessage(supabaseConfigError.message);
        setStatus("error");
        setLoading(false);
        return;
      }

      const normalizedUserEmail = normalizeEmail(user.email);
      if (!normalizedUserEmail) {
        setMessage("로그인 계정 이메일을 확인할 수 없습니다.");
        setStatus("error");
        setLoading(false);
        return;
      }

      setLoading(true);
      setMessage("");
      setStatus("loading");
      console.log("current user:", user);

      const { data, error } = await supabase
        .from("interpreters")
        .select("*")
        .ilike("email", normalizedUserEmail);

      if (error) {
        console.error("Interpreter profile fetch failed", error);
        setMessage("통역사 정보를 불러오지 못했습니다.");
        setStatus("error");
        setLoading(false);
        return;
      }

      let matches = (data || []).filter(
        (item) => normalizeEmail(item.email) === normalizedUserEmail
      );

      if (matches.length === 0) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("interpreters")
          .select("*");

        if (fallbackError) {
          console.error("Interpreter profile fallback fetch failed", fallbackError);
          setMessage("통역사 정보를 불러오지 못했습니다.");
          setStatus("error");
          setLoading(false);
          return;
        }

        matches = (fallbackData || []).filter(
          (item) => normalizeEmail(item.email) === normalizedUserEmail
        );
      }

      if (matches.length > 1) {
        console.warn("Duplicate interpreter email found", {
          email: normalizedUserEmail,
          ids: matches.map((item) => item.id),
        });
      }

      const nextInterpreter = matches[0] || null;
      setInterpreter(nextInterpreter);
      setStatus(nextInterpreter ? "ready" : "notRegistered");

      if (nextInterpreter) {
        // Link auth_user_id if not present
        if (
          Object.prototype.hasOwnProperty.call(nextInterpreter, "auth_user_id") &&
          !nextInterpreter.auth_user_id
        ) {
          const { data: updated, error: updateError } = await supabase
            .from("interpreters")
            .update({ auth_user_id: user.id })
            .eq("id", nextInterpreter.id)
            .select("*")
            .single();

          if (updateError) {
            console.warn("Interpreter auth_user_id update skipped", updateError);
          } else {
            setInterpreter(updated || nextInterpreter);
          }
        }

        // Fetch applications and matchings dynamically
        setLoadingData(true);
        try {
          const [apps, mats] = await Promise.all([
            fetchApplicationsData(nextInterpreter.id),
            fetchMatchingsData(nextInterpreter.id),
          ]);
          setApplications(apps);
          setMatchings(mats);
        } catch (err) {
          console.error("Failed to load applications/matchings", err);
        } finally {
          setLoadingData(false);
        }
      }

      setLoading(false);
    };

    queueMicrotask(fetchInterpreter);
  }, [authLoading, user]);

  const handleUpdateActivityStatus = async (newStatus) => {
    if (!interpreter || isUpdatingStatus || !supabase) return;
    setIsUpdatingStatus(true);

    const { data, error } = await supabase
      .from("interpreters")
      .update({ activity_status: newStatus })
      .eq("id", interpreter.id)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to update activity status", error);
      alert("활동 상태 변경에 실패했습니다. 다시 시도해주세요.");
    } else {
      setInterpreter(data || { ...interpreter, activity_status: newStatus });
    }
    setIsUpdatingStatus(false);
  };

  if (authLoading || loading) {
    return (
      <main className="interpreter-auth-page">
        <section className="interpreter-auth-card">
          <p className="interpreter-auth-kicker">ON-LI INTERPRETER</p>
          <h1>마이페이지를 준비 중입니다.</h1>
          <p>로그인 상태와 통역사 정보를 확인하고 있습니다.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="interpreter-auth-page">
        <section className="interpreter-auth-card">
          <p className="interpreter-auth-kicker">ON-LI INTERPRETER</p>
          <h1>로그인이 필요합니다.</h1>
          <p>통역사 계정으로 로그인해주세요.</p>
          <div className="interpreter-auth-form">
            <button type="button" className="interpreter-auth-primary" onClick={onLoginClick}>
              통역사 로그인
            </button>
            <button type="button" className="interpreter-auth-secondary" onClick={onHomeClick}>
              메인으로 돌아가기
            </button>
          </div>
        </section>
      </main>
    );
  }

  const activityStatus = getActivityStatus(interpreter);

  return (
    <main className="interpreter-mypage">
      <div className="interpreter-mypage-shell">
        <section className="interpreter-mypage-head">
          <div className="interpreter-mypage-userinfo">
            <p className="interpreter-auth-kicker">ON-LI INTERPRETER PROFILE</p>
            <h1>{interpreter ? `${interpreter.name} 통역사 마이페이지` : "통역사 마이페이지"}</h1>
            <p className="interpreter-mypage-email">{interpreter?.email || user.email}</p>
          </div>
          <div className="interpreter-mypage-actions">
            <button type="button" className="interpreter-auth-secondary" onClick={onHomeClick}>
              메인으로
            </button>
            <button type="button" className="interpreter-auth-primary" onClick={onSignOut}>
              로그아웃
            </button>
          </div>
        </section>

        {status === "error" && message && (
          <p className="interpreter-auth-message is-error">{message}</p>
        )}

        {status === "notRegistered" ? (
          <section className="interpreter-mypage-grid is-unregistered">
            <article className="interpreter-mypage-card">
              <h2>프로필 미등록 상태</h2>
              <p style={{ margin: "20px 0", lineHeight: "1.7", color: "#6b7280" }}>
                아직 이 계정({user.email})으로 등록된 통역사 프로필이 없습니다.
                통역 서비스 이용 및 공고 지원을 위해 아래 통역사 등록을 먼저 완료해주세요.
              </p>
              <div className="interpreter-mypage-actions">
                <button
                  type="button"
                  className="interpreter-auth-primary"
                  onClick={onRegisterClick}
                >
                  통역사 등록하기
                </button>
              </div>
            </article>
          </section>
        ) : (
          <>
            {/* Quick Metrics Dashboard Row */}
            <section className="interpreter-mypage-stats">
              <div className="mypage-stat-card">
                <span className="stat-icon">
                  <FileText size={24} aria-hidden="true" />
                </span>
                <div className="stat-details">
                  <span className="stat-label">총 지원 건수</span>
                  <span className="stat-value">{applications.length}건</span>
                </div>
              </div>
              <div className="mypage-stat-card">
                <span className="stat-icon">
                  <BriefcaseBusiness size={24} aria-hidden="true" />
                </span>
                <div className="stat-details">
                  <span className="stat-label">배정 완료</span>
                  <span className="stat-value">
                    {
                      matchings.filter((m) =>
                        ["assigned", "confirmed", "in_progress", "completed", "settled"].includes(
                          String(m.status || "").toLowerCase()
                        )
                      ).length
                    }건
                  </span>
                </div>
              </div>
              <div className="mypage-stat-card">
                <span className="stat-icon">
                  <Award size={24} aria-hidden="true" />
                </span>
                <div className="stat-details">
                  <span className="stat-label">통역사 레벨</span>
                  <span className="stat-value">{normalizeLevel(interpreter?.level || "Lv1")}</span>
                </div>
              </div>
              <div className="mypage-stat-card">
                <span className="stat-icon">
                  <CircleCheck size={24} aria-hidden="true" />
                </span>
                <div className="stat-details">
                  <span className="stat-label">활동 상태</span>
                  <span className={`stat-value status-${activityStatus}`}>
                    {getInterpreterActivityStatusLabel(activityStatus)}
                  </span>
                </div>
              </div>
            </section>

            {/* Mobile Stats Dashboard */}
            <section className="mobile-stat-grid">
              <div className="stat-card">
                <div className="stat-label-row">
                  <span className="stat-emoji">📄</span>
                  <span className="stat-label">지원 건수</span>
                </div>
                <span className="stat-value">{applications.length}건</span>
              </div>
              
              <div className="stat-card">
                <div className="stat-label-row">
                  <span className="stat-emoji">💼</span>
                  <span className="stat-label">배정 완료</span>
                </div>
                <span className="stat-value">
                  {
                    matchings.filter((m) =>
                      ["assigned", "confirmed", "in_progress", "completed", "settled"].includes(
                        String(m.status || "").toLowerCase()
                      )
                    ).length
                  }건
                </span>
              </div>
              
              <div className="stat-card">
                <div className="stat-label-row">
                  <span className="stat-emoji">🏅</span>
                  <span className="stat-label">통역 레벨</span>
                </div>
                <span className="stat-value">{normalizeLevel(interpreter?.level || "Lv1")}</span>
              </div>
              
              <div className="stat-card">
                <div className="stat-label-row">
                  <span className="stat-emoji">●</span>
                  <span className="stat-label">활동 상태</span>
                </div>
                <span className={`stat-value status-${activityStatus}`}>
                  {getInterpreterActivityStatusLabel(activityStatus)}
                </span>
              </div>
            </section>

            {/* Dashboard Workspace */}
            <section className="interpreter-mypage-grid">
              {/* Sidebar Tabs */}
              <div className="interpreter-mypage-tabs">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`mypage-tab-btn ${activeTab === tab.id ? "is-active" : ""}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span className="tab-icon">{tab.icon}</span>
                    <span className="tab-label">{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Dynamic Content Pane */}
              <div className="interpreter-mypage-tab-pane">
                {activeTab === "profile" && interpreter && (
                  <>
                    <article className="interpreter-mypage-card animate-fade-in">
                    <div className="card-header-with-action">
                      <h2>프로필 정보</h2>
                      <div className="profile-header-actions" style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                        {!isEditingProfile && (
                          <button
                            type="button"
                            className="interpreter-auth-secondary edit-btn"
                            onClick={handleStartEdit}
                            style={{ padding: "6px 12px", fontSize: "13px", height: "36px", display: "flex", alignItems: "center", gap: "6px", margin: 0 }}
                          >
                            ✏️ 프로필 수정
                          </button>
                        )}
                        <div className="status-selector-wrapper">
                          <label htmlFor="activity-status-select">활동 상태 수정:</label>
                          <select
                            id="activity-status-select"
                            value={activityStatus}
                            disabled={isUpdatingStatus}
                            onChange={(e) => handleUpdateActivityStatus(e.target.value)}
                            className="interpreter-status-select"
                          >
                            <option value="active">활동중 (공고 매칭 수신)</option>
                            <option value="paused">일시중지 (배정 제외)</option>
                            <option value="inactive">비활성 (활동 안함)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {isEditingProfile ? (
                      <form onSubmit={handleUpdateProfile} className="interpreter-edit-profile-form" style={{ marginTop: "20px" }}>
                        <div className="form-group-grid">
                          <label className="edit-form-label" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" }}>
                            <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>이름</span>
                            <input
                               type="text"
                               name="name"
                               value={editForm.name}
                               onChange={handleEditFormChange}
                               required
                               style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px" }}
                            />
                          </label>
                          <label className="edit-form-label" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" }}>
                            <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>연락처</span>
                            <input
                               type="text"
                               name="phone"
                               value={editForm.phone}
                               onChange={handleEditFormChange}
                               required
                               style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px" }}
                            />
                          </label>
                          <label className="edit-form-label" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" }}>
                            <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>이메일 (수정 불가)</span>
                            <input
                               type="email"
                               value={interpreter.email}
                               disabled
                               className="disabled-input"
                               style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "10px", fontSize: "14px", background: "#f3f4f6", color: "#9ca3af", cursor: "not-allowed" }}
                            />
                          </label>
                          <div className="form-subgroup-grid">
                            <label className="edit-form-label" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" }}>
                              <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>성별</span>
                              <select
                                name="gender"
                                value={editForm.gender}
                                onChange={handleEditFormChange}
                                required
                                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px", height: "42px" }}
                              >
                                <option value="여성">여성</option>
                                <option value="남성">남성</option>
                                <option value="기타/응답 안 함">기타/응답 안 함</option>
                              </select>
                            </label>
                            <label className="edit-form-label" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" }}>
                              <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>통역사 레벨</span>
                              <select
                                name="level"
                                value={editForm.level}
                                onChange={handleEditFormChange}
                                required
                                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px", height: "42px" }}
                              >
                                <option value="Lv1">Lv1</option>
                                <option value="Lv2">Lv2</option>
                                <option value="Lv3">Lv3</option>
                                <option value="Lv4">Lv4</option>
                              </select>
                            </label>
                          </div>
                        </div>

                        <label className="edit-form-label full-width" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left", marginBottom: "16px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>전문 분야 (쉼표로 구분)</span>
                          <input
                            type="text"
                            value={specialtiesInput}
                            onChange={(e) => setSpecialtiesInput(e.target.value)}
                            placeholder="예: IT, 의료, 제조, 비즈니스 미팅"
                            style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px" }}
                          />
                        </label>

                        <label className="edit-form-label full-width" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left", marginBottom: "24px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>활동 가능 지역 (쉼표로 구분)</span>
                          <input
                            type="text"
                            value={regionsInput}
                            onChange={(e) => setRegionsInput(e.target.value)}
                            placeholder="예: 도쿄, 오사카, 서울, 후쿠오카"
                            style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px" }}
                          />
                        </label>

                        <div className="edit-form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                          <button
                            type="button"
                            className="interpreter-auth-secondary"
                            onClick={handleCancelEdit}
                            disabled={isUpdatingProfile}
                            style={{ padding: "10px 20px", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}
                          >
                            취소
                          </button>
                          <button
                            type="submit"
                            className="interpreter-auth-primary"
                            disabled={isUpdatingProfile}
                            style={{ padding: "10px 20px", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: "pointer", background: "#4f46e5", color: "#ffffff", border: "none" }}
                          >
                            {isUpdatingProfile ? "저장 중..." : "변경사항 저장"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        {/* PC Profile View */}
                        <div className="desktop-profile-view">
                          <dl className="interpreter-profile-list">
                            <ProfileRow label="이름" value={interpreter.name || "미입력"} />
                            <ProfileRow label="이메일" value={interpreter.email || user.email} />
                            <ProfileRow label="연락처" value={interpreter.phone || "미입력"} />
                            <ProfileRow label="성별" value={interpreter.gender || "미입력"} />
                            <ProfileRow
                              label="승인 상태"
                              value={
                                <span
                                  className={`status-badge ${
                                    interpreter.status === "active" || interpreter.status === "승인 완료" || interpreter.status === "활동중"
                                      ? "badge-green"
                                      : interpreter.status === "rejected" || interpreter.status === "반려"
                                      ? "badge-red"
                                      : "badge-yellow"
                                  }`}
                                >
                                  {interpreter.status === "active" || interpreter.status === "승인 완료" || interpreter.status === "활동중"
                                    ? "승인 완료"
                                    : interpreter.status === "rejected" || interpreter.status === "반려"
                                    ? "반려"
                                    : "승인 대기"}
                                </span>
                              }
                            />
                            <ProfileRow
                              label="활동 상태"
                              value={
                                <span
                                  className={`status-badge ${
                                    activityStatus === "active"
                                      ? "badge-green"
                                      : activityStatus === "paused"
                                      ? "badge-yellow"
                                      : "badge-gray"
                                  }`}
                                >
                                  {getInterpreterActivityStatusLabel(activityStatus)}
                                </span>
                              }
                            />
                            <ProfileRow
                              label="통역사 레벨"
                              value={
                                <span className="interpreter-tag-level">
                                  {normalizeLevel(interpreter.level || "Lv1")}
                                </span>
                              }
                            />
                            <ProfileRow
                              label="전문 분야"
                              value={
                                <div className="interpreter-specialties-tags">
                                  {Array.isArray(interpreter.specialties) &&
                                  interpreter.specialties.filter(Boolean).length > 0 ? (
                                    interpreter.specialties
                                      .filter(Boolean)
                                      .map((spec, i) => (
                                        <span key={i} className="interpreter-tag spec">
                                          {spec}
                                        </span>
                                      ))
                                  ) : (
                                    <span className="no-tags">등록된 분야가 없습니다.</span>
                                  )}
                                </div>
                              }
                            />
                            <ProfileRow
                              label="활동 가능 지역"
                              value={
                                <div className="interpreter-regions-tags">
                                  {Array.isArray(interpreter.available_regions) &&
                                  interpreter.available_regions.filter(Boolean).length > 0 ? (
                                    interpreter.available_regions
                                      .filter(Boolean)
                                      .map((reg, i) => (
                                        <span key={i} className="interpreter-tag region">
                                          {reg}
                                        </span>
                                      ))
                                  ) : (
                                    <span className="no-tags">등록된 지역이 없습니다.</span>
                                  )}
                                </div>
                              }
                            />
                          </dl>
                        </div>

                        {/* Mobile Profile View */}
                        <div className="mobile-profile-view">
                          <div className="mobile-profile-email-card">
                            <span className="profile-label">이메일</span>
                            <strong className="profile-value">{interpreter.email || user.email}</strong>
                          </div>

                          <div className="mobile-profile-grid">
                            <div className="profile-grid-item">
                              <span className="profile-label">이름</span>
                              <strong className="profile-value">{interpreter.name || "미입력"}</strong>
                            </div>
                            <div className="profile-grid-item">
                              <span className="profile-label">성별</span>
                              <strong className="profile-value">{interpreter.gender || "미입력"}</strong>
                            </div>
                            <div className="profile-grid-item">
                              <span className="profile-label">연락처</span>
                              <strong className="profile-value">{interpreter.phone || "미입력"}</strong>
                            </div>
                            <div className="profile-grid-item">
                              <span className="profile-label">레벨</span>
                              <strong className="profile-value">{normalizeLevel(interpreter.level || "Lv1")}</strong>
                            </div>
                            <div className="profile-grid-item">
                              <span className="profile-label">승인 상태</span>
                              <strong className="profile-value">
                                <span
                                  className={`status-badge ${
                                    interpreter.status === "active" || interpreter.status === "승인 완료" || interpreter.status === "활동중"
                                      ? "badge-green"
                                      : interpreter.status === "rejected" || interpreter.status === "반려"
                                      ? "badge-red"
                                      : "badge-yellow"
                                  }`}
                                >
                                  {interpreter.status === "active" || interpreter.status === "승인 완료" || interpreter.status === "활동중"
                                    ? "승인 완료"
                                    : interpreter.status === "rejected" || interpreter.status === "반려"
                                    ? "반려"
                                    : "승인 대기"}
                                </span>
                              </strong>
                            </div>
                            <div className="profile-grid-item">
                              <span className="profile-label">활동 상태</span>
                              <strong className="profile-value">
                                <span
                                  className={`status-badge ${
                                    activityStatus === "active"
                                      ? "badge-green"
                                      : activityStatus === "paused"
                                      ? "badge-yellow"
                                      : "badge-gray"
                                  }`}
                                >
                                  {getInterpreterActivityStatusLabel(activityStatus)}
                                </span>
                              </strong>
                            </div>
                            <div className="profile-grid-item">
                              <span className="profile-label">활동 지역</span>
                              <strong className="profile-value">
                                {Array.isArray(interpreter.available_regions) &&
                                interpreter.available_regions.filter(Boolean).length > 0
                                  ? interpreter.available_regions.filter(Boolean).slice(0, 2).join(", ")
                                  : interpreter.region || "미입력"}
                              </strong>
                            </div>
                            <div className="profile-grid-item">
                              <span className="profile-label">가능 언어</span>
                              <strong className="profile-value">
                                {interpreter.language_level || interpreter.jlpt || "한국어 · 일본어"}
                              </strong>
                            </div>
                          </div>

                          {/* Collapsible details for mobile */}
                          <div className="mobile-collapsible-details">
                            <div className="collapsible-card">
                              <button
                                type="button"
                                className="collapsible-header"
                                onClick={() => setShowIntro(!showIntro)}
                              >
                                <span>📝 자기소개</span>
                                <span>{showIntro ? "접기 ▲" : "상세 정보 보기 ▼"}</span>
                              </button>
                              {showIntro && (
                                <div className="collapsible-body">
                                  <p>{interpreter.intro || interpreter.self_intro || interpreter.introduction || "등록된 자기소개가 없습니다."}</p>
                                </div>
                              )}
                            </div>

                            <div className="collapsible-card">
                              <button
                                type="button"
                                className="collapsible-header"
                                onClick={() => setShowCareer(!showCareer)}
                              >
                                <span>💼 경력 정보</span>
                                <span>{showCareer ? "접기 ▲" : "상세 정보 보기 ▼"}</span>
                              </button>
                              {showCareer && (
                                <div className="collapsible-body">
                                  <p>{interpreter.career || interpreter.experience || (interpreter.experience_count ? `통역 경험 ${interpreter.experience_count}회` : "등록된 경력 정보가 없습니다.")}</p>
                                </div>
                              )}
                            </div>

                            <div className="collapsible-card">
                              <button
                                type="button"
                                className="collapsible-header"
                                onClick={() => setShowEvents(!showEvents)}
                              >
                                <span>📅 최근 참여 행사</span>
                                <span>{showEvents ? "접기 ▲" : "상세 정보 보기 ▼"}</span>
                              </button>
                              {showEvents && (
                                <div className="collapsible-body">
                                  {(() => {
                                    const source = interpreter.recent_events || interpreter.recent_event || interpreter.recent_projects || interpreter.event_history || interpreter.participated_events;
                                    const eventsList = Array.isArray(source)
                                      ? source.map(e => typeof e === "string" ? e.trim() : e?.name || e?.title || "").filter(Boolean)
                                      : typeof source === "string"
                                      ? source.split(/[,/]/).map(s => s.trim()).filter(Boolean)
                                      : [];
                                    
                                    return eventsList.length > 0 ? (
                                      <ul className="mobile-event-list" style={{ margin: 0, paddingLeft: "16px", listStyleType: "disc" }}>
                                        {eventsList.map((e, idx) => (
                                          <li key={idx} style={{ marginBottom: "4px", fontSize: "12px", color: "#4b5563" }}>{e}</li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p style={{ margin: 0 }}>등록된 최근 참여 행사가 없습니다.</p>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>

                            <div className="collapsible-card">
                              <button
                                type="button"
                                className="collapsible-header"
                                onClick={() => setShowTasks(!showTasks)}
                              >
                                <span>🏅 가능 업무</span>
                                <span>{showTasks ? "접기 ▲" : "상세 정보 보기 ▼"}</span>
                              </button>
                              {showTasks && (
                                <div className="collapsible-body">
                                  <p>
                                    {Array.isArray(interpreter.available_tasks) && interpreter.available_tasks.filter(Boolean).length > 0
                                      ? interpreter.available_tasks.filter(Boolean).join(", ")
                                      : String(interpreter.available_tasks || interpreter.available_work || "등록된 가능 업무가 없습니다.")}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </article>

                  {/* Verification Badge & Resume Card */}
                  <article className="mypage-verification-card animate-fade-in">
                    <h3>통역사 검증 & 배지 신청</h3>
                    
                    {interpreter.approved ? (
                      <div className="verification-status-box verified">
                        <span className="verification-status-badge verified">✨ 검증 완료</span>
                        <div className="verification-status-details">
                          <h4 className="verification-status-title">ON-LI 공식 검증 통역사</h4>
                          <p className="verification-status-desc">
                            귀하는 ON-LI 공식 인증을 받은 신뢰할 수 있는 통역사입니다. 
                            프로필에 검증 완료 배지가 표시되며 공고 추천 및 매칭에서 우선 순위를 얻게 됩니다.
                          </p>
                          {interpreter.resume_file_name && (
                            <div className="verification-status-file-link" onClick={() => handleDownloadResume(interpreter.resume_file_url, interpreter.resume_file_name)} style={{ cursor: "pointer", marginTop: "12px", display: "inline-flex", alignItems: "center", gap: "6px", color: "#d97706", fontWeight: "700", fontSize: "13px" }}>
                              📎 {interpreter.resume_file_name} (이력서 보기)
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (interpreter.resume_url || interpreter.resume_file_url) ? (
                      <div className="verification-status-box pending">
                        <span className="verification-status-badge pending">⏳ 검토 대기</span>
                        <div className="verification-status-details">
                          <h4 className="verification-status-title">이력서 검토 중</h4>
                          <p className="verification-status-desc">
                            제출하신 이력서를 바탕으로 운영팀에서 검증 절차를 진행 중입니다. 
                            심사는 영업일 기준 1~3일 소요됩니다.
                          </p>
                          {interpreter.resume_file_name && (
                            <div className="verification-status-file-link" onClick={() => handleDownloadResume(interpreter.resume_file_url, interpreter.resume_file_name)} style={{ cursor: "pointer", marginTop: "12px", display: "inline-flex", alignItems: "center", gap: "6px", color: "#5b5cf0", fontWeight: "700", fontSize: "13px" }}>
                              📎 {interpreter.resume_file_name} (이력서 다운로드)
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="verification-status-box unsubmitted">
                        <span className="verification-status-badge unsubmitted">📄 이력서 미제출</span>
                        <div className="verification-status-details">
                          <h4 className="verification-status-title">검증 배지 미보유</h4>
                          <p className="verification-status-desc">
                            검증된 통역사 배지를 획득하려면 아래에서 이력서(경력 소개서) 파일을 업로드해주세요. 
                            운영팀의 심사를 거쳐 배지가 수여됩니다.
                          </p>
                        </div>
                      </div>
                    )}

                    {!interpreter.approved && (
                      <form onSubmit={handleUpdateResume} className="resume-submit-form">
                        
                        {/* File Upload Zone */}
                        <div className="resume-input-group">
                          <label>이력서 파일 업로드</label>
                          <div 
                            className={`resume-upload-zone ${isDragOver ? "is-dragover" : ""}`}
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setIsDragOver(false);
                              const file = e.dataTransfer.files[0];
                              if (file) handleFileSelection(file);
                            }}
                          >
                            <input
                              id="resume-file-input"
                              type="file"
                              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                              onChange={(e) => {
                                const file = e.target.files[0];
                                if (file) handleFileSelection(file);
                              }}
                              style={{ display: "none" }}
                            />
                            
                            <label htmlFor="resume-file-input" className="resume-upload-label">
                              <span className="upload-icon">📤</span>
                              <strong>PDF / DOCX / 포트폴리오 파일 업로드</strong>
                              <span className="upload-tip">허용 형식: PDF, DOC, DOCX, PNG, JPG (최대 10MB)</span>
                            </label>
                          </div>
                        </div>

                        {/* Selected File Preview */}
                        {resumeFile && (
                          <div className="resume-selected-file-card">
                            <span className="file-icon">📄</span>
                            <div className="file-details">
                              <span className="file-name">{resumeFile.name}</span>
                              <span className="file-size">{(resumeFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                            </div>
                            <button 
                              type="button" 
                              className="file-remove-btn"
                              onClick={() => setResumeFile(null)}
                            >
                              ❌
                            </button>
                          </div>
                        )}

                        {/* Previously Uploaded File Preview */}
                        {!resumeFile && interpreter.resume_file_name && (
                          <div className="resume-selected-file-card uploaded">
                            <span className="file-icon">✅</span>
                            <div className="file-details" onClick={() => handleDownloadResume(interpreter.resume_file_url, interpreter.resume_file_name)} style={{ cursor: "pointer" }}>
                              <span className="file-name">{interpreter.resume_file_name}</span>
                              <span className="file-uploaded-at">제출일: {interpreter.resume_uploaded_at ? new Date(interpreter.resume_uploaded_at).toLocaleDateString() : "확인 불가"}</span>
                            </div>
                            <button 
                              type="button" 
                              className="file-download-btn"
                              onClick={() => handleDownloadResume(interpreter.resume_file_url, interpreter.resume_file_name)}
                              title="다운로드"
                            >
                              📥
                            </button>
                          </div>
                        )}

                        <button
                          type="submit"
                          className="resume-submit-btn"
                          disabled={isSubmittingResume}
                        >
                          {isSubmittingResume ? "제출 중..." : interpreter.resume_file_url ? "이력서 수정 및 재제출" : "이력서 제출하기"}
                        </button>
                      </form>
                    )}
                  </article>
                </>
              )}

                {activeTab === "applications" && (
                  <article className="interpreter-mypage-card animate-fade-in">
                    <h2>지원 내역 목록</h2>
                    {loadingData ? (
                      <p className="loading-text">지원 내역을 불러오고 있습니다...</p>
                    ) : applications.length === 0 ? (
                      <div className="interpreter-empty-state">
                        <span className="empty-icon">📄</span>
                        <p>아직 지원한 통역 공고가 없습니다.</p>
                        <button
                          type="button"
                          className="interpreter-auth-primary"
                          onClick={onHomeClick}
                        >
                          통역 공고 둘러보기
                        </button>
                      </div>
                    ) : (
                      <div className="interpreter-application-list">
                        {applications.map((app) => {
                          const jobTitle = app.jobs?.title || "삭제되었거나 찾을 수 없는 공고";
                          const jobLocation = app.jobs?.location || "-";
                          const start = app.jobs?.start_date;
                          const end = app.jobs?.end_date;
                          const jobDates = start ? `${formatDate(start)} ~ ${formatDate(end)}` : "-";
                          const badgeClass = getStatusBadgeClass(app.status);
                          const statusLabel = getApplicationStatusLabel(app.status);

                          return (
                            <div key={app.id} className="interpreter-application-card">
                              <div className="card-top-row">
                                <span className="app-no">{app.application_no || `No.${app.id}`}</span>
                                <span className={`status-badge ${badgeClass}`}>{statusLabel}</span>
                              </div>
                              <h3>{jobTitle}</h3>
                              <div className="app-job-details">
                                <p>
                                  <span>📍 위치:</span> {jobLocation}
                                </p>
                                <p>
                                  <span>📅 일정:</span> {jobDates}
                                </p>
                                {app.message && (
                                  <div className="app-message-box">
                                    <span>✍️ 지원 메시지:</span>
                                    <p>{app.message}</p>
                                  </div>
                                )}
                              </div>
                              <div className="app-date-row">
                                지원 일시: {formatDate(app.created_at)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                )}

                {activeTab === "assignments" && (
                  <article className="interpreter-mypage-card animate-fade-in">
                    <h2>배정 내역 목록</h2>
                    {loadingData ? (
                      <p className="loading-text">배정 내역을 불러오고 있습니다...</p>
                    ) : matchings.length === 0 ? (
                      <div className="interpreter-empty-state">
                        <span className="empty-icon">💼</span>
                        <p>아직 배정 완료된 통역 일정이 없습니다.</p>
                        <p className="empty-sub">
                          프로필 정보와 활동 가능 지역을 최신화해두시면 더 활발하게 매칭 제안을
                          받으실 수 있습니다.
                        </p>
                      </div>
                    ) : (
                      <div className="interpreter-assignment-list">
                        {matchings.map((mat) => {
                          const jobTitle = mat.jobs?.title || "배정된 공고";
                          const companyName = mat.jobs?.company_name || "비공개 협력사";
                          const location = mat.jobs?.location || "-";
                          const start = mat.start_date || mat.jobs?.start_date;
                          const end = mat.end_date || mat.jobs?.end_date;
                          const dateRange = start ? `${formatDate(start)} ~ ${formatDate(end)}` : "-";
                          const statusLabel = getMatchingStatusLabel(mat.status);
                          const badgeClass = getStatusBadgeClass(mat.status);

                          return (
                            <div key={mat.id} className="interpreter-assignment-card">
                              <div className="card-top-row">
                                <span className="matching-no">
                                  {mat.matching_no || `Matching No.${mat.id}`}
                                </span>
                                <span className={`status-badge ${badgeClass}`}>{statusLabel}</span>
                              </div>
                              <h3>{jobTitle}</h3>
                              <div className="assignment-details">
                                <p>
                                  <span>🏢 파트너사:</span> {companyName}
                                </p>
                                <p>
                                  <span>📍 장소:</span> {location}
                                </p>
                                <p>
                                  <span>📅 근무 기간:</span> {dateRange}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                )}

                {activeTab === "schedule" && (
                  <article className="interpreter-mypage-card animate-fade-in">
                    <h2>내 일정 및 캘린더 타임라인</h2>
                    <p className="schedule-intro-text">
                      확정된 통역 매칭 일정 목록입니다. 이 기간 동안은 다른 공고 신청 시 일정이
                      중복될 수 있으니 사전에 참고해주시기 바랍니다.
                    </p>

                    {loadingData ? (
                      <p className="loading-text">일정을 불러오고 있습니다...</p>
                    ) : (
                      (() => {
                        const activeMatchings = matchings.filter((m) =>
                          ["assigned", "confirmed", "in_progress"].includes(
                            String(m.status || "").toLowerCase()
                          )
                        );

                        if (activeMatchings.length === 0) {
                          return (
                            <div className="interpreter-empty-state">
                              <span className="empty-icon">📅</span>
                              <p>예정된 통역 일정이 없습니다.</p>
                              <p className="empty-sub">
                                배정 완료된 통역 일정이 이곳에 일대일 타임라인 형식으로
                                정리됩니다.
                              </p>
                            </div>
                          );
                        }

                        return (
                          <div className="interpreter-schedule-timeline">
                            {activeMatchings.map((mat) => {
                              const jobTitle = mat.jobs?.title || "배정된 통역";
                              const location = mat.jobs?.location || "-";
                              const start = mat.start_date || mat.jobs?.start_date;
                              const end = mat.end_date || mat.jobs?.end_date;
                              const rangeText = start ? `${formatDate(start)} ~ ${formatDate(end)}` : "-";
                              const countdown = getDaysRemaining(start);
                              const isUnderway = String(mat.status).toLowerCase() === "in_progress";

                              return (
                                <div key={mat.id} className="timeline-item">
                                  <div className="timeline-badge-column">
                                    <span
                                      className={`countdown-badge ${
                                        isUnderway ? "is-active" : ""
                                      }`}
                                    >
                                      {isUnderway ? "진행중" : countdown}
                                    </span>
                                    <span className="timeline-line"></span>
                                  </div>
                                  <div className="timeline-content-card">
                                    <h4>{jobTitle}</h4>
                                    <div className="timeline-job-meta">
                                      <p>📅 {rangeText}</p>
                                      <p>📍 {location}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()
                    )}
                  </article>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function ProfileRow({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getDaysRemaining(startDateStr) {
  if (!startDateStr) return null;
  const start = new Date(startDateStr);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = start - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "오늘";
  if (diffDays < 0) return `완료`;
  return `D-${diffDays}`;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getActivityStatus(interpreter) {
  const status = String(interpreter?.activity_status || "").trim().toLowerCase();
  if (Object.values(INTERPRETER_ACTIVITY_STATUS).includes(status)) return status;
  return INTERPRETER_ACTIVITY_STATUS.ACTIVE;
}

export default InterpreterMypage;
