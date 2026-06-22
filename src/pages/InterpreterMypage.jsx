import { useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
import {
  INTERPRETER_ACTIVITY_STATUS,
  getInterpreterActivityStatusLabel,
  getApplicationStatusLabel,
  getJobStatusLabel,
  getMatchingStatusLabel,
  getStatusBadgeClass,
} from "../utils/status";
import { normalizeLevel } from "../utils/levelBadge";
import {
  getJobLevelSummary,
  getJobPayDisplay,
  getJobSpecialty,
} from "../utils/jobDisplay";
import { formatDateRange } from "../utils/dateRange";
import { getRecruitmentCountDisplay } from "../utils/jobRecruitment";
import {
  canWithdrawJobApplication,
  isJobApplicationWithdrawalPermissionError,
  withdrawOwnJobApplication,
} from "../utils/applicationContact";
import {
  WITHDRAWN_ACCOUNT_MESSAGE,
  WITHDRAWN_STATUS,
  isWithdrawnInterpreter,
} from "../utils/accountStatus";
import "./InterpreterAuth.css";
import {
  Award,
  BriefcaseBusiness,
  CircleCheck,
  FileText,
  X,
} from "lucide-react";
import TakeHomeCalculator from "../components/TakeHomeCalculator";

const TABS = [
  { id: "profile", label: "프로필 정보", icon: "👤" },
  { id: "applications", label: "지원 내역", icon: "📄" },
  { id: "assignments", label: "배정 내역", icon: "💼" },
  { id: "schedule", label: "일정 및 캘린더", icon: "📅" },
  { id: "takeHome", label: "예상 실수령액 계산", icon: "🧮" },
];

const SETTLEMENT_DOCUMENT_BUCKET = "resume-files";
const SETTLEMENT_DOCUMENT_MAX_SIZE = 10 * 1024 * 1024;
const SETTLEMENT_DOCUMENT_TYPES = {
  bankbook: {
    label: "통장 사본",
    description: "정산 받을 계좌 확인을 위해 등록해주세요.",
    filePrefix: "bankbook",
    urlField: "bankbook_file_url",
    nameField: "bankbook_file_name",
  },
  businessLicense: {
    label: "사업자등록증",
    description: "사업자 정산 대상인 경우 등록해주세요.",
    filePrefix: "business_license",
    urlField: "business_license_file_url",
    nameField: "business_license_file_name",
  },
};

function InterpreterMypage({
  authLoading,
  user,
  onLoginClick,
  onRegisterClick,
  onHomeClick,
  onJobDetailClick,
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
  const [withdrawalTarget, setWithdrawalTarget] = useState(null);
  const [isWithdrawingApplication, setIsWithdrawingApplication] = useState(false);
  const [withdrawalMessage, setWithdrawalMessage] = useState("");
  const [withdrawalError, setWithdrawalError] = useState("");
  const [isAccountWithdrawalOpen, setIsAccountWithdrawalOpen] = useState(false);
  const [accountWithdrawalText, setAccountWithdrawalText] = useState("");
  const [isWithdrawingAccount, setIsWithdrawingAccount] = useState(false);
  const [expandedApplicationIds, setExpandedApplicationIds] = useState(
    () => new Set()
  );
  const [expandedAssignmentIds, setExpandedAssignmentIds] = useState(
    () => new Set()
  );

  useEffect(() => {
    if (!withdrawalTarget) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isWithdrawingApplication) {
        setWithdrawalTarget(null);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [withdrawalTarget, isWithdrawingApplication]);

  useEffect(() => {
    if (!isAccountWithdrawalOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isWithdrawingAccount) {
        setIsAccountWithdrawalOpen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountWithdrawalOpen, isWithdrawingAccount]);

  // Collapsible sections for mobile view
  const [showIntro, setShowIntro] = useState(false);
  const [showCareer, setShowCareer] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [showTasks, setShowTasks] = useState(false);

  // Profile Edit Mode States
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    kakao_or_line: "",
    gender: "",
    level: "Lv1",
    intro: "",
    career: "",
    available_tasks: "",
  });
  const [specialtiesInput, setSpecialtiesInput] = useState("");
  const [regionsInput, setRegionsInput] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Resume Submission States
  const [isSubmittingResume, setIsSubmittingResume] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [resumeActionMode, setResumeActionMode] = useState("");
  const resumeActionInputRef = useRef(null);
  const [uploadingSettlementDocType, setUploadingSettlementDocType] = useState("");
  const [settlementDocActionType, setSettlementDocActionType] = useState("");
  const settlementDocInputRef = useRef(null);

  const fetchInterpreterProfile = async () => {
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

    const nextInterpreter =
      matches.find((item) => !isWithdrawnInterpreter(item)) || matches[0] || null;
    setInterpreter(nextInterpreter);
    if (isWithdrawnInterpreter(nextInterpreter)) {
      setStatus("withdrawn");
      setLoading(false);
      return;
    }

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

  const handleStartEdit = () => {
    if (!interpreter) return;
    setEditForm({
      name: interpreter.name || "",
      kakao_or_line: interpreter.kakao_or_line || "",
      gender: interpreter.gender || "",
      level: interpreter.level || "Lv1",
      intro: interpreter.short_intro || interpreter.intro || interpreter.self_intro || interpreter.introduction || "",
      career: interpreter.strength || interpreter.career || interpreter.experience || "",
      available_tasks: interpreter.available_tasks || interpreter.available_work || "",
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
      kakao_or_line: editForm.kakao_or_line,
      gender: editForm.gender,
      specialties,
      available_regions,
      short_intro: editForm.intro,
      strength: editForm.career,
      available_tasks: editForm.available_tasks,
    };

    console.log("Updating interpreter profile. Payload:", payload);

    const { data, error } = await supabase
      .from("interpreters")
      .update(payload)
      .eq("id", interpreter.id)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to update interpreter profile. Error details:", error);
      alert(`프로필 수정에 실패했습니다. (사유: ${error.message || "알 수 없는 오류"})`);
    } else {
      setInterpreter(data);
      setIsEditingProfile(false);
      alert("프로필 정보가 성공적으로 수정되었습니다.");
      // Refetch the full profile to sync all DB states immediately
      await fetchInterpreterProfile();
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

    const fileExtension = file.name.split(".").pop().toLowerCase();
    if (fileExtension !== "pdf" && file.type !== "application/pdf") {
      alert("PDF 파일만 업로드할 수 있습니다.");
      return;
    }

    setResumeFile(file);
  };

  const handleDownloadResume = async (filePath, fileName) => {
    if (!supabase || !filePath) return;
    try {
      const resolvedPath = getResumeStoragePath(filePath);
      if (!resolvedPath) throw new Error("Resume storage path is empty");

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

  const removeResumeFileFromStorage = async (fileUrl) => {
    const filePath = getResumeStoragePath(fileUrl);
    if (!supabase || !filePath) return;

    const { error } = await supabase.storage
      .from("resume-files")
      .remove([filePath]);

    if (error) {
      console.warn("Resume storage delete skipped", error);
    }
  };

  const uploadResumeFile = async (file, { failureMessage = "이력서 파일 업로드에 실패했습니다. 다시 시도해주세요." } = {}) => {
    if (!file || !supabase || !interpreter || !user) return null;

    // Supabase Storage bucket 존재 여부 확인
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

    const safeFileName = file.name
      .replace(/\s+/g, "_")
      .replace(/[^\w.-]/g, "");
    const filePath = `${user.id}/${Date.now()}_${safeFileName}`;

    try {
      const { error } = await supabase.storage
        .from("resume-files")
        .upload(filePath, file, {
          upsert: true,
        });

      if (error) {
        console.error("Resume upload error message:", error.message);
        throw error;
      }

      const {
        data: { publicUrl },
      } = supabase.storage
        .from("resume-files")
        .getPublicUrl(filePath);

      return {
        fileName: file.name,
        filePath,
        fileUrl: publicUrl,
      };
    } catch (uploadError) {
      console.error("Resume upload error:", uploadError);
      console.error("Details: ", {
        uploadError,
        filePath,
        userId: user.id,
      });
      alert(failureMessage);
      return null;
    }
  };

  const saveResumeUpload = async (file, { successMessage = "이력서가 정상 제출되었습니다.", failureMessage = "이력서 제출에 실패했습니다. 다시 시도해주세요.", deletePrevious = false } = {}) => {
    if (isSubmittingResume || !supabase || !interpreter || !user) return;

    if (!file) {
      alert("업로드할 이력서 파일을 선택해주세요.");
      return;
    }

    setIsSubmittingResume(true);

    const previousFileUrl = interpreter.resume_file_url || interpreter.resume_url || "";
    const uploadResult = await uploadResumeFile(file, { failureMessage });
    if (!uploadResult) {
      setIsSubmittingResume(false);
      return;
    }

    const payload = {
      resume_url: null,
      resume_file_url: uploadResult.fileUrl,
      resume_file_name: uploadResult.fileName,
      resume_uploaded_at: new Date().toISOString(),
      resume_submitted_at: new Date().toISOString(),
      approved: false,
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
      alert(failureMessage);
    } else {
      setInterpreter(dbData);
      if (deletePrevious && previousFileUrl && previousFileUrl !== uploadResult.fileUrl) {
        await removeResumeFileFromStorage(previousFileUrl);
      }
      alert(successMessage);
      setResumeFile(null);
    }
    setIsSubmittingResume(false);
  };

  const handleUpdateResume = async (e) => {
    e.preventDefault();
    await saveResumeUpload(resumeFile);
  };

  const openResumeFilePicker = (mode) => {
    if (isSubmittingResume) return;
    setResumeActionMode(mode);
    if (resumeActionInputRef.current) {
      resumeActionInputRef.current.value = "";
      resumeActionInputRef.current.click();
    }
  };

  const handleResumeActionFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const maxSize = 10 * 1024 * 1024;
    const fileExtension = file.name.split(".").pop().toLowerCase();
    if (file.size > maxSize) {
      alert("파일 크기는 최대 10MB까지 가능합니다.");
      setResumeActionMode("");
      return;
    }
    if (fileExtension !== "pdf" && file.type !== "application/pdf") {
      alert("PDF 파일만 업로드할 수 있습니다.");
      setResumeActionMode("");
      return;
    }

    const mode = resumeActionMode || (interpreter?.resume_file_url || interpreter?.resume_url ? "edit" : "register");
    await saveResumeUpload(file, {
      successMessage: mode === "edit" ? "이력서가 수정되었습니다." : "이력서가 등록되었습니다.",
      failureMessage: mode === "edit" ? "이력서 수정에 실패했습니다." : "이력서 등록에 실패했습니다.",
      deletePrevious: mode === "edit",
    });
    setResumeActionMode("");
  };

  const handleDeleteResume = async () => {
    if (isSubmittingResume || !supabase || !interpreter) return;
    if (!window.confirm("등록된 이력서를 삭제하시겠습니까?")) return;

    setIsSubmittingResume(true);
    const previousFileUrl = interpreter.resume_file_url || interpreter.resume_url || "";
    const payload = {
      resume_url: null,
      resume_file_url: null,
      resume_file_name: null,
      resume_uploaded_at: null,
      resume_submitted_at: null,
      approved: false,
    };

    const { data, error } = await supabase
      .from("interpreters")
      .update(payload)
      .eq("id", interpreter.id)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to delete resume from DB", error);
      alert("이력서 삭제에 실패했습니다.");
      setIsSubmittingResume(false);
      return;
    }

    setInterpreter(data || { ...interpreter, ...payload });
    setResumeFile(null);
    await removeResumeFileFromStorage(previousFileUrl);
    setIsSubmittingResume(false);
  };

  const validateSettlementDocumentFile = (file) => {
    if (!file) return false;

    const fileExtension = String(file.name.split(".").pop() || "").toLowerCase();
    const allowedExtensions = ["pdf", "jpg", "jpeg", "png"];
    if (!allowedExtensions.includes(fileExtension)) {
      alert("PDF, JPG, PNG 파일만 업로드할 수 있습니다.");
      return false;
    }

    if (file.size > SETTLEMENT_DOCUMENT_MAX_SIZE) {
      alert("파일 용량은 10MB 이하만 업로드할 수 있습니다.");
      return false;
    }

    return true;
  };

  const uploadSettlementDocumentFile = async (file, docConfig) => {
    if (!file || !supabase || !interpreter || !user || !docConfig) return null;

    const fileExtension = String(file.name.split(".").pop() || "").toLowerCase();
    const filePath = `interpreter-documents/${user.id}/settlement/${docConfig.filePrefix}_${Date.now()}.${fileExtension}`;

    try {
      const { error } = await supabase.storage
        .from(SETTLEMENT_DOCUMENT_BUCKET)
        .upload(filePath, file, { upsert: true });

      if (error) {
        console.error("Storage upload error:", error);
        throw error;
      }

      const {
        data: { publicUrl },
      } = supabase.storage
        .from(SETTLEMENT_DOCUMENT_BUCKET)
        .getPublicUrl(filePath);

      return {
        fileName: file.name,
        filePath,
        fileUrl: publicUrl,
      };
    } catch (error) {
      console.error("Storage upload error:", error);
      alert("파일 업로드에 실패했습니다. 다시 시도해주세요.");
      return null;
    }
  };

  const updateSettlementDocumentMetadata = async (payload) => {
    if (!supabase || !interpreter || !user) {
      return { data: null, error: new Error("Missing Supabase, interpreter, or user") };
    }

    const normalizedUserEmail = normalizeEmail(user.email);
    const canMatchUserId =
      Object.prototype.hasOwnProperty.call(interpreter, "user_id") &&
      interpreter.user_id === user.id;
    const canMatchAuthUser =
      Object.prototype.hasOwnProperty.call(interpreter, "auth_user_id") &&
      interpreter.auth_user_id === user.id;

    const updateByColumn = async (column, value) => {
      const result = await supabase
        .from("interpreters")
        .update(payload)
        .eq(column, value)
        .select("*")
        .single();

      if (result.error) {
        console.error("DB update error:", result.error);
      }

      return result;
    };

    if (canMatchUserId) {
      const result = await updateByColumn("user_id", user.id);
      if (!result.error) return result;
    }

    if (canMatchAuthUser) {
      const result = await updateByColumn("auth_user_id", user.id);
      if (!result.error) return result;
    }

    if (normalizedUserEmail) {
      const result = await supabase
        .from("interpreters")
        .update(payload)
        .eq("id", interpreter.id)
        .ilike("email", normalizedUserEmail)
        .select("*")
        .single();

      if (result.error) {
        console.error("DB update error:", result.error);
      } else {
        return result;
      }
    }

    const result = await supabase
      .from("interpreters")
      .update(payload)
      .eq("id", interpreter.id)
      .select("*")
      .single();

    if (result.error) {
      console.error("DB update error:", result.error);
    }

    return result;
  };

  const removeSettlementDocumentFromStorage = async (fileUrl) => {
    const filePath = getStoragePathFromUrl(fileUrl, SETTLEMENT_DOCUMENT_BUCKET);
    if (!supabase || !filePath) return;

    const { error } = await supabase.storage
      .from(SETTLEMENT_DOCUMENT_BUCKET)
      .remove([filePath]);

    if (error) {
      console.warn("Settlement document storage delete skipped", error);
    }
  };

  const openSettlementDocument = async (fileUrl) => {
    if (!supabase || !fileUrl) return;

    try {
      const resolvedPath = getStoragePathFromUrl(fileUrl, SETTLEMENT_DOCUMENT_BUCKET);
      if (!resolvedPath) throw new Error("Settlement document storage path is empty");

      const { data, error } = await supabase.storage
        .from(SETTLEMENT_DOCUMENT_BUCKET)
        .createSignedUrl(resolvedPath, 60);

      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (error) {
      console.error("Failed to generate settlement document signed URL", error);
      alert("파일 업로드에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const openSettlementDocumentPicker = (docType) => {
    if (uploadingSettlementDocType) return;
    setSettlementDocActionType(docType);
    if (settlementDocInputRef.current) {
      settlementDocInputRef.current.value = "";
      settlementDocInputRef.current.click();
    }
  };

  const handleSettlementDocumentFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const docType = settlementDocActionType;
    const docConfig = SETTLEMENT_DOCUMENT_TYPES[docType];
    if (!docConfig || !validateSettlementDocumentFile(file)) {
      setSettlementDocActionType("");
      return;
    }

    setUploadingSettlementDocType(docType);

    const previousFileUrl = interpreter?.[docConfig.urlField] || "";
    const uploadResult = await uploadSettlementDocumentFile(file, docConfig);
    if (!uploadResult) {
      setUploadingSettlementDocType("");
      setSettlementDocActionType("");
      return;
    }

    const payload = {
      [docConfig.urlField]: uploadResult.fileUrl,
      [docConfig.nameField]: uploadResult.fileName,
    };

    const { data, error } = await updateSettlementDocumentMetadata(payload);

    if (error) {
      console.error("DB update error:", error);
      await removeSettlementDocumentFromStorage(uploadResult.fileUrl);
      alert("파일 업로드에 실패했습니다. 다시 시도해주세요.");
    } else {
      setInterpreter(data || { ...interpreter, ...payload });
      if (previousFileUrl && previousFileUrl !== uploadResult.fileUrl) {
        await removeSettlementDocumentFromStorage(previousFileUrl);
      }
      alert("정산 서류가 등록되었습니다.");
    }

    setUploadingSettlementDocType("");
    setSettlementDocActionType("");
  };

  const handleDeleteSettlementDocument = async (docType) => {
    const docConfig = SETTLEMENT_DOCUMENT_TYPES[docType];
    if (!docConfig || uploadingSettlementDocType || !supabase || !interpreter) return;
    if (!window.confirm(`${docConfig.label} 파일을 삭제하시겠습니까?`)) return;

    setUploadingSettlementDocType(docType);
    const previousFileUrl = interpreter?.[docConfig.urlField] || "";
    const payload = {
      [docConfig.urlField]: null,
      [docConfig.nameField]: null,
    };

    const { data, error } = await updateSettlementDocumentMetadata(payload);

    if (error) {
      console.error("DB update error:", error);
      alert("파일 업로드에 실패했습니다. 다시 시도해주세요.");
      setUploadingSettlementDocType("");
      return;
    }

    setInterpreter(data || { ...interpreter, ...payload });
    await removeSettlementDocumentFromStorage(previousFileUrl);
    setUploadingSettlementDocType("");
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
        jobs (*)
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

      const jobsMap = new Map(jobsList.map((j) => [String(j.id), j]));
      return apps.map((a) => ({
        ...a,
        jobs: jobsMap.get(String(a.job_id)) || null,
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
        created_at,
        jobs (*)
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

      const jobsMap = new Map(jobsList.map((j) => [String(j.id), j]));
      return mats.map((m) => ({
        ...m,
        jobs: jobsMap.get(String(m.job_id)) || null,
      }));
    }

    return data || [];
  };

  const handleConfirmWithdrawal = async () => {
    if (
      !supabase ||
      !interpreter?.id ||
      !withdrawalTarget?.id ||
      isWithdrawingApplication
    ) {
      return;
    }

    setIsWithdrawingApplication(true);
    setWithdrawalError("");
    setWithdrawalMessage("");

    try {
      const deletedApplication = await withdrawOwnJobApplication(supabase, {
        applicationId: withdrawalTarget.id,
        interpreterId: interpreter.id,
      });

      if (!deletedApplication) {
        setWithdrawalError(
          "지원 상태가 변경되었거나 철회 권한을 확인할 수 없습니다. 새로고침 후 다시 확인해 주세요."
        );
        return;
      }

      const refreshedApplications = await fetchApplicationsData(interpreter.id);
      setApplications(refreshedApplications);
      setExpandedApplicationIds((current) => {
        const next = new Set(current);
        next.delete(withdrawalTarget.id);
        return next;
      });
      setWithdrawalTarget(null);
      setWithdrawalMessage("지원이 철회되었습니다.");
    } catch (error) {
      if (isJobApplicationWithdrawalPermissionError(error)) {
        setWithdrawalError(
          "지원 철회 권한을 확인할 수 없습니다. ON-LI에 문의해 주세요."
        );
      } else {
        setWithdrawalError(
          "지원을 철회하지 못했습니다. 잠시 후 다시 시도해 주세요."
        );
      }
    } finally {
      setIsWithdrawingApplication(false);
    }
  };

  const toggleApplicationDetails = (applicationId) => {
    setExpandedApplicationIds((current) => {
      return current.has(applicationId) ? new Set() : new Set([applicationId]);
    });
  };

  const toggleAssignmentDetails = (matchingId) => {
    setExpandedAssignmentIds((current) => {
      return current.has(matchingId) ? new Set() : new Set([matchingId]);
    });
  };

  useEffect(() => {
    queueMicrotask(fetchInterpreterProfile);
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

  const closeAccountWithdrawalModal = () => {
    if (isWithdrawingAccount) return;
    setIsAccountWithdrawalOpen(false);
    setAccountWithdrawalText("");
  };

  const handleWithdrawAccount = async () => {
    if (
      isWithdrawingAccount ||
      accountWithdrawalText !== "탈퇴합니다" ||
      !supabase ||
      !interpreter?.id ||
      !user
    ) {
      return;
    }

    const withdrawnAt = new Date().toISOString();
    const payload = {
      status: WITHDRAWN_STATUS,
      is_public: false,
      withdrawn_at: withdrawnAt,
    };

    setIsWithdrawingAccount(true);

    const { data, error } = await supabase
      .from("interpreters")
      .update(payload)
      .eq("id", interpreter.id)
      .select("*")
      .single();

    if (error) {
      console.error("Account withdrawal failed", error);
      alert(`회원 탈퇴 신청에 실패했습니다. (${error.message})`);
      setIsWithdrawingAccount(false);
      return;
    }

    await updateOptionalUserWithdrawalTables(user, withdrawnAt);

    setInterpreter(data || { ...interpreter, ...payload });
    setStatus("withdrawn");
    setIsAccountWithdrawalOpen(false);
    setAccountWithdrawalText("");
    setIsWithdrawingAccount(false);
    alert("회원 탈퇴 신청이 완료되었습니다.");
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

  if (status === "withdrawn") {
    return (
      <main className="interpreter-auth-page">
        <section className="interpreter-auth-card">
          <p className="interpreter-auth-kicker">ON-LI INTERPRETER</p>
          <h1>탈퇴 처리된 계정입니다</h1>
          <p>{WITHDRAWN_ACCOUNT_MESSAGE}</p>
          <div className="interpreter-auth-form">
            <button type="button" className="interpreter-auth-secondary" onClick={onHomeClick}>
              메인으로 돌아가기
            </button>
            <button type="button" className="interpreter-auth-primary" onClick={onSignOut}>
              로그아웃
            </button>
          </div>
        </section>
      </main>
    );
  }

  const activityStatus = getActivityStatus(interpreter);
  const resumeFileUrl = interpreter?.resume_file_url || interpreter?.resume_url || "";
  const resumeFileName = interpreter?.resume_file_name || (resumeFileUrl ? "이력서 파일" : "");
  const hasResume = Boolean(String(resumeFileUrl || "").trim());
  const isVerifiedWithResume = interpreter?.approved === true && hasResume;

  // DB-driven recent events from matchings
  const recentAssignedEvents = (matchings || [])
    .filter((m) =>
      ["assigned", "confirmed", "in_progress", "completed", "settled", "배정완료", "운영완료", "배정"].includes(
        String(m.status || "").toLowerCase()
      )
    )
    .sort((a, b) => {
      const aDate = a.start_date ? new Date(a.start_date).getTime() : 0;
      const bDate = b.start_date ? new Date(b.start_date).getTime() : 0;
      return bDate - aDate;
    })
    .slice(0, 5)
    .map((m) => {
      const title = m.jobs?.title || "통역 프로젝트";
      const dateStr = m.start_date ? new Date(m.start_date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : "";
      return dateStr ? `${title} (${dateStr})` : title;
    });

  return (
    <main className="interpreter-mypage">
      <div className="interpreter-mypage-shell">
        <section className="interpreter-mypage-head">
          <div className="interpreter-mypage-userinfo desktop-header-only">
            <p className="interpreter-auth-kicker">ON-LI INTERPRETER PROFILE</p>
            <h1>{interpreter ? `${interpreter.name} 통역사 마이페이지` : "통역사 마이페이지"}</h1>
            <p className="interpreter-mypage-email">{interpreter?.email || user.email}</p>
          </div>
          <div className="interpreter-mypage-userinfo mobile-header-only">
            <p className="interpreter-auth-kicker">ON-LI INTERPRETER PROFILE</p>
            <h1 className="mobile-user-name">{interpreter ? interpreter.name : "통역사 마이페이지"}</h1>
            <p className="mobile-user-label">통역사 마이페이지</p>
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
                      <form onSubmit={handleUpdateProfile} className="interpreter-edit-profile-form profile-edit-form" style={{ marginTop: "20px" }}>
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
                            <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>카카오톡 ID</span>
                            <input
                               type="text"
                               name="kakao_or_line"
                               value={editForm.kakao_or_line}
                               onChange={handleEditFormChange}
                               required
                               placeholder="카카오톡 ID를 입력해주세요"
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
                              <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>통역사 레벨 (수정 불가)</span>
                              <select
                                name="level"
                                value={editForm.level}
                                disabled
                                required
                                style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "10px", fontSize: "14px", height: "42px", background: "#f3f4f6", color: "#9ca3af", cursor: "not-allowed" }}
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

                        <label className="edit-form-label full-width" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left", marginBottom: "16px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>활동 가능 지역 (쉼표로 구분)</span>
                          <input
                            type="text"
                            value={regionsInput}
                            onChange={(e) => setRegionsInput(e.target.value)}
                            placeholder="예: 도쿄, 오사카, 서울, 후쿠오카"
                            style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px" }}
                          />
                        </label>

                        <label className="edit-form-label full-width" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left", marginBottom: "16px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>자기소개</span>
                          <textarea
                            name="intro"
                            value={editForm.intro}
                            onChange={handleEditFormChange}
                            placeholder="자기소개를 입력해주세요."
                            rows={4}
                            style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px", fontFamily: "inherit", resize: "vertical" }}
                          />
                        </label>

                        <label className="edit-form-label full-width" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left", marginBottom: "16px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>경력 설명</span>
                          <textarea
                            name="career"
                            value={editForm.career}
                            onChange={handleEditFormChange}
                            placeholder="통역 경력을 상세히 입력해주세요."
                            rows={4}
                            style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px", fontFamily: "inherit", resize: "vertical" }}
                          />
                        </label>

                        <label className="edit-form-label full-width" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left", marginBottom: "24px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>가능 업무</span>
                          <input
                            type="text"
                            name="available_tasks"
                            value={editForm.available_tasks}
                            onChange={handleEditFormChange}
                            placeholder="수행 가능한 통역 업무 유형을 입력해주세요. (예: 순차통역, 동시통역, 수행비서)"
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
                        <section className="profile-edit-account-management">
                          <h3>계정 관리</h3>
                          <p>
                            회원 탈퇴 시 프로필은 공개 목록에서 표시되지 않으며, 진행 중인 의뢰,
                            지원, 정산 기록은 운영 및 법적 보관 목적에 따라 보관될 수 있습니다.
                          </p>
                          <button
                            type="button"
                            className="interpreter-danger-outline-button"
                            onClick={() => setIsAccountWithdrawalOpen(true)}
                          >
                            회원 탈퇴
                          </button>
                        </section>
                      </form>
                    ) : (
                      <>
                        {/* PC Profile View */}
                        <div className="desktop-profile-view">
                          <dl className="interpreter-profile-list">
                            <ProfileRow label="이름" value={interpreter.name || "미입력"} />
                            <ProfileRow label="이메일" value={interpreter.email || user.email} />
                            <ProfileRow label="카카오톡 ID" value={interpreter.kakao_or_line || "미입력"} />
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

                          <div className="desktop-profile-details">
                            <div className="desktop-profile-details-card">
                              <h3>📝 자기소개</h3>
                              <p>{interpreter.short_intro || interpreter.intro || interpreter.self_intro || interpreter.introduction || "등록된 자기소개가 없습니다."}</p>
                            </div>

                            <div className="desktop-profile-details-card">
                              <h3>
                                <span>💼 경력 정보</span>
                                <span className="career-count-badge">통역 경험 {interpreter.experience_count || 0}회</span>
                              </h3>
                              <p>{interpreter.strength || interpreter.career || interpreter.experience || "등록된 경력 정보가 없습니다."}</p>
                            </div>

                            <div className="desktop-profile-details-card">
                              <h3>📅 최근 참여 행사</h3>
                              {recentAssignedEvents && recentAssignedEvents.length > 0 ? (
                                <ul style={{ margin: 0, paddingLeft: "20px", listStyleType: "disc" }}>
                                  {recentAssignedEvents.map((evt, idx) => (
                                    <li key={idx} style={{ fontSize: "13px", color: "#4b5563", marginBottom: "4px" }}>
                                      {evt}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p>등록된 최근 참여 행사가 없습니다.</p>
                              )}
                            </div>

                            <div className="desktop-profile-details-card">
                              <h3>🏅 가능 업무</h3>
                              <p>
                                {Array.isArray(interpreter.available_tasks) && interpreter.available_tasks.filter(Boolean).length > 0
                                  ? interpreter.available_tasks.filter(Boolean).join(", ")
                                  : String(interpreter.available_tasks || interpreter.available_work || "등록된 가능 업무가 없습니다.")}
                              </p>
                            </div>
                          </div>
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
                              <span className="profile-label">카카오톡 ID</span>
                              <strong className="profile-value">{interpreter.kakao_or_line || "미입력"}</strong>
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
                                  <p>{interpreter.short_intro || interpreter.intro || interpreter.self_intro || interpreter.introduction || "등록된 자기소개가 없습니다."}</p>
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
                                  <p>{interpreter.strength || interpreter.career || interpreter.experience || (interpreter.experience_count ? `통역 경험 ${interpreter.experience_count}회` : "등록된 경력 정보가 없습니다.")}</p>
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
                    <p className="verification-status-desc resume-required-note">
                      통역 공고 지원을 위해 이력서 등록은 필수입니다. ON-LI 운영팀 검토 후 검증 완료 배지가 표시될 수 있습니다.
                    </p>
                    <input
                      ref={resumeActionInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={handleResumeActionFileChange}
                      style={{ display: "none" }}
                    />
                    
                    {isVerifiedWithResume ? (
                      <div className="verification-status-box verified">
                        <span className="verification-status-badge verified">✨ 검증 완료</span>
                        <div className="verification-status-details">
                          <h4 className="verification-status-title">ON-LI 공식 검증 통역사</h4>
                          <p className="verification-status-desc">
                            귀하는 ON-LI 공식 인증을 받은 신뢰할 수 있는 통역사입니다. 
                            프로필에 검증 완료 배지가 표시되며 공고 추천 및 매칭에서 우선 순위를 얻게 됩니다.
                          </p>
                          <ResumeFileActions
                            fileName={resumeFileName}
                            fileUrl={resumeFileUrl}
                            isBusy={isSubmittingResume}
                            mode={resumeActionMode}
                            onView={() => handleDownloadResume(resumeFileUrl, resumeFileName)}
                            onEdit={() => openResumeFilePicker("edit")}
                            onDelete={handleDeleteResume}
                            onRegister={() => openResumeFilePicker("register")}
                          />
                        </div>
                      </div>
                    ) : hasResume ? (
                      <div className="verification-status-box pending">
                        <span className="verification-status-badge pending">⏳ 검증 대기</span>
                        <div className="verification-status-details">
                          <h4 className="verification-status-title">이력서 검토 중</h4>
                          <p className="verification-status-desc">
                            제출하신 이력서를 바탕으로 운영팀에서 검증 절차를 진행 중입니다. 
                            심사는 영업일 기준 1~3일 소요됩니다.
                          </p>
                          <ResumeFileActions
                            fileName={resumeFileName}
                            fileUrl={resumeFileUrl}
                            isBusy={isSubmittingResume}
                            mode={resumeActionMode}
                            onView={() => handleDownloadResume(resumeFileUrl, resumeFileName)}
                            onEdit={() => openResumeFilePicker("edit")}
                            onDelete={handleDeleteResume}
                            onRegister={() => openResumeFilePicker("register")}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="verification-status-box unsubmitted">
                        <span className="verification-status-badge unsubmitted">📄 이력서 등록 필요</span>
                        <div className="verification-status-details">
                          <h4 className="verification-status-title">이력서 등록 필요</h4>
                          <p className="verification-status-desc">
                            아래에서 이력서(경력 소개서) 파일을 업로드해주세요.
                          </p>
                          <ResumeFileActions
                            fileName={resumeFileName}
                            fileUrl={resumeFileUrl}
                            isBusy={isSubmittingResume}
                            mode={resumeActionMode}
                            onView={() => handleDownloadResume(resumeFileUrl, resumeFileName)}
                            onEdit={() => openResumeFilePicker("edit")}
                            onDelete={handleDeleteResume}
                            onRegister={() => openResumeFilePicker("register")}
                          />
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
                              accept="application/pdf,.pdf"
                              onChange={(e) => {
                                const file = e.target.files[0];
                                if (file) handleFileSelection(file);
                              }}
                              style={{ display: "none" }}
                            />
                            
                            <label htmlFor="resume-file-input" className="resume-upload-label">
                              <span className="upload-icon">📤</span>
                              <strong>PDF 이력서 파일 업로드</strong>
                              <span className="upload-tip">허용 형식: PDF (최대 10MB)</span>
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
                            <div className="file-details" onClick={() => handleDownloadResume(resumeFileUrl, resumeFileName)} style={{ cursor: "pointer" }}>
                              <span className="file-name">{interpreter.resume_file_name}</span>
                              <span className="file-uploaded-at">제출일: {interpreter.resume_uploaded_at ? new Date(interpreter.resume_uploaded_at).toLocaleDateString() : "확인 불가"}</span>
                            </div>
                            <button 
                              type="button" 
                              className="file-download-btn"
                              onClick={() => handleDownloadResume(resumeFileUrl, resumeFileName)}
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

                  <article className="mypage-verification-card settlement-documents-card animate-fade-in">
                    <h3>정산 서류 등록</h3>
                    <p className="verification-status-desc resume-required-note">
                      정산 진행을 위해 필요한 서류를 등록해주세요. 등록된 서류는 ON-LI 운영팀의 정산 확인 용도로만 사용됩니다.
                    </p>
                    <input
                      ref={settlementDocInputRef}
                      type="file"
                      accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png"
                      onChange={handleSettlementDocumentFileChange}
                      style={{ display: "none" }}
                    />
                    <div className="settlement-document-grid">
                      {Object.entries(SETTLEMENT_DOCUMENT_TYPES).map(([docType, docConfig]) => (
                        <SettlementDocumentCard
                          key={docType}
                          label={docConfig.label}
                          description={docConfig.description}
                          fileName={interpreter?.[docConfig.nameField]}
                          fileUrl={interpreter?.[docConfig.urlField]}
                          isBusy={uploadingSettlementDocType === docType}
                          onUpload={() => openSettlementDocumentPicker(docType)}
                          onView={() => openSettlementDocument(interpreter?.[docConfig.urlField])}
                          onDelete={() => handleDeleteSettlementDocument(docType)}
                        />
                      ))}
                    </div>
                  </article>
                </>
              )}

                {activeTab === "applications" && (
                  <article className="interpreter-mypage-card animate-fade-in">
                    <h2>지원 내역 목록</h2>
                    {withdrawalMessage && (
                      <p className="application-withdrawal-message is-success" role="status">
                        {withdrawalMessage}
                      </p>
                    )}
                    {withdrawalError && (
                      <p className="application-withdrawal-message is-error" role="alert">
                        {withdrawalError}
                      </p>
                    )}
                    {loadingData ? (
                      <p className="loading-text">지원 내역을 불러오고 있습니다...</p>
                    ) : applications.length === 0 ? (
                      <div className="interpreter-empty-state">
                        <span className="empty-icon">📄</span>
                        <p>아직 지원한 통역 공고가 없습니다.</p>
                        <p className="empty-sub">
                          관심 있는 공고에 지원하면 이곳에서 확인할 수 있습니다.
                        </p>
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
                          const job = app.jobs;
                          const jobTitle =
                            job?.event_name || job?.title || "공고 제목 미등록";
                          const badgeClass = getStatusBadgeClass(app.status);
                          const statusLabel = getApplicationStatusLabel(app.status);
                          const canWithdraw = canWithdrawJobApplication(app.status);
                          const isMatched = ["accepted", "매칭완료"].includes(
                            String(app.status || "").trim().toLowerCase()
                          );
                          const isExpanded = expandedApplicationIds.has(app.id);
                          const hasLinkedJob =
                            job?.id &&
                            String(app.job_id) === String(job.id);
                          const applicationNo = app.application_no || `No.${app.id}`;
                          const scheduleText = formatDateRange(
                            job?.start_date,
                            job?.end_date,
                            job?.event_date || job?.date
                          );
                          const locationText =
                            job?.location || job?.event_location || "장소 미등록";

                          return (
                            <div key={app.id} className="interpreter-application-card">
                              <div className="card-top-row">
                                <span className="app-no">{applicationNo}</span>
                                <span className={`status-badge ${badgeClass}`}>{statusLabel}</span>
                              </div>
                              <div
                                className="application-list-summary"
                                role="button"
                                tabIndex={0}
                                onClick={() => toggleApplicationDetails(app.id)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    toggleApplicationDetails(app.id);
                                  }
                                }}
                              >
                                <h3>{jobTitle}</h3>
                                <p className="application-company">
                                  {job?.company_name || "기업명 미등록"}
                                </p>
                                <p className="application-primary-meta">
                                  {scheduleText} / {locationText}
                                </p>
                                <p className="application-secondary-meta">
                                  {getJobLevelSummary(job || {})} · {getJobSpecialty(job || {})}
                                </p>
                                <p className="application-language">
                                  {job?.language || "통역 언어 미등록"}
                                </p>
                              </div>

                              <button
                                type="button"
                                className="application-detail-toggle"
                                onClick={() => toggleApplicationDetails(app.id)}
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? "접기" : "상세 보기"}
                              </button>

                              {isExpanded && job && (
                                <ApplicationDetailPanel
                                  application={app}
                                  job={job}
                                  statusLabel={statusLabel}
                                  canWithdraw={canWithdraw}
                                  isMatched={isMatched}
                                  hasLinkedJob={hasLinkedJob}
                                  onJobDetailClick={onJobDetailClick}
                                  onWithdraw={() => {
                                    setWithdrawalMessage("");
                                    setWithdrawalError("");
                                    setWithdrawalTarget(app);
                                  }}
                                />
                              )}

                              {isExpanded && !job && (
                                <p className="application-job-unavailable">
                                  현재 공고 정보를 불러올 수 없습니다.
                                </p>
                              )}
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
                        <p>아직 배정된 통역 업무가 없습니다.</p>
                        <p className="empty-sub">
                          지원한 공고가 배정 확정되면 이곳에서 확인할 수 있습니다.
                        </p>
                      </div>
                    ) : (
                      <div className="interpreter-assignment-list">
                        {matchings.map((mat) => {
                          const job = mat.jobs;
                          const jobTitle =
                            job?.event_name || job?.title || "배정된 공고";
                          const start = mat.start_date || job?.start_date;
                          const end = mat.end_date || job?.end_date;
                          const statusLabel = getMatchingStatusLabel(mat.status);
                          const badgeClass = getStatusBadgeClass(mat.status);
                          const isExpanded = expandedAssignmentIds.has(mat.id);
                          const hasLinkedJob =
                            job?.id &&
                            String(mat.job_id) === String(job.id);
                          const matchingNo = mat.matching_no || `Matching No.${mat.id}`;
                          const scheduleText = formatDateRange(
                            start,
                            end,
                            job?.event_date || job?.date
                          );
                          const locationText =
                            job?.location || job?.event_location || "장소 미등록";

                          return (
                            <div key={mat.id} className="interpreter-assignment-card">
                              <div className="card-top-row">
                                <span className="matching-no">{matchingNo}</span>
                                <span className={`status-badge ${badgeClass}`}>{statusLabel}</span>
                              </div>
                              <div
                                className="assignment-list-summary"
                                role="button"
                                tabIndex={0}
                                onClick={() => toggleAssignmentDetails(mat.id)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    toggleAssignmentDetails(mat.id);
                                  }
                                }}
                              >
                                <h3>{jobTitle}</h3>
                                <p className="assignment-company">
                                  {job?.company_name || "기업명 미등록"}
                                </p>
                                <p className="assignment-primary-meta">
                                  {scheduleText} / {locationText}
                                </p>
                                <p className="assignment-secondary-meta">
                                  {getJobLevelSummary(job || {})} · {getJobSpecialty(job || {})}
                                </p>
                                <p className="assignment-language">
                                  {job?.language || "통역 언어 미등록"}
                                </p>
                              </div>

                              <button
                                type="button"
                                className="application-detail-toggle assignment-detail-toggle"
                                onClick={() => toggleAssignmentDetails(mat.id)}
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? "상세 닫기" : "상세 보기"}
                              </button>

                              {isExpanded && job && (
                                <AssignmentDetailPanel
                                  job={job}
                                  matching={mat}
                                  startDate={start}
                                  endDate={end}
                                  statusLabel={statusLabel}
                                  hasLinkedJob={hasLinkedJob}
                                  onJobDetailClick={onJobDetailClick}
                                />
                              )}

                              {isExpanded && !job && (
                                <p className="application-job-unavailable">
                                  현재 공고 정보를 불러올 수 없습니다.
                                </p>
                              )}
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

                {activeTab === "takeHome" && (
                  <TakeHomeCalculator className="animate-fade-in" />
                )}
              </div>
            </section>
          </>
        )}
      </div>
      {isAccountWithdrawalOpen && (
        <div
          className="application-withdrawal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeAccountWithdrawalModal();
            }
          }}
        >
          <section
            className="application-withdrawal-modal account-withdrawal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-withdrawal-title"
          >
            <button
              type="button"
              className="application-withdrawal-close"
              onClick={closeAccountWithdrawalModal}
              disabled={isWithdrawingAccount}
              aria-label="회원 탈퇴 확인창 닫기"
            >
              <X size={19} />
            </button>
            <h2 id="account-withdrawal-title">회원 탈퇴</h2>
            <p>
              회원 탈퇴 시 ON-LI 이용이 제한되며, 등록된 프로필은 공개 목록에서 표시되지 않습니다.
              <br />
              진행 중인 의뢰, 지원, 정산 기록은 운영 및 법적 보관 목적에 따라 일정 기간 보관될 수 있습니다.
            </p>
            <label className="account-withdrawal-confirm-field">
              <span>탈퇴를 진행하려면 아래 문구를 입력해주세요.</span>
              <strong>탈퇴합니다</strong>
              <input
                value={accountWithdrawalText}
                onChange={(event) => setAccountWithdrawalText(event.target.value)}
                disabled={isWithdrawingAccount}
                autoFocus
              />
            </label>
            <div className="application-withdrawal-actions">
              <button
                type="button"
                className="application-withdrawal-cancel"
                onClick={closeAccountWithdrawalModal}
                disabled={isWithdrawingAccount}
              >
                취소
              </button>
              <button
                type="button"
                className="application-withdrawal-confirm"
                onClick={handleWithdrawAccount}
                disabled={isWithdrawingAccount || accountWithdrawalText !== "탈퇴합니다"}
              >
                {isWithdrawingAccount ? "처리 중..." : "탈퇴 신청"}
              </button>
            </div>
          </section>
        </div>
      )}
      {withdrawalTarget && (
        <div
          className="application-withdrawal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !isWithdrawingApplication
            ) {
              setWithdrawalTarget(null);
            }
          }}
        >
          <section
            className="application-withdrawal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="application-withdrawal-title"
          >
            <button
              type="button"
              className="application-withdrawal-close"
              onClick={() => setWithdrawalTarget(null)}
              disabled={isWithdrawingApplication}
              aria-label="지원 철회 확인창 닫기"
            >
              <X size={19} />
            </button>
            <h2 id="application-withdrawal-title">지원을 철회하시겠습니까?</h2>
            <p>
              지원 철회 후에는 해당 지원 내역이 삭제됩니다.
              <br />
              다시 지원하려면 해당 공고에서 새로 지원해야 합니다.
            </p>
            <div className="application-withdrawal-actions">
              <button
                type="button"
                className="application-withdrawal-cancel"
                onClick={() => setWithdrawalTarget(null)}
                disabled={isWithdrawingApplication}
              >
                계속 지원하기
              </button>
              <button
                type="button"
                className="application-withdrawal-confirm"
                onClick={handleConfirmWithdrawal}
                disabled={isWithdrawingApplication}
              >
                {isWithdrawingApplication ? "철회 중..." : "지원 철회"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

async function updateOptionalUserWithdrawalTables(user, withdrawnAt) {
  if (!supabase || !user?.id) return;

  const payload = {
    status: WITHDRAWN_STATUS,
    withdrawn_at: withdrawnAt,
  };

  await Promise.all(
    ["profiles", "users"].map(async (table) => {
      const { error } = await supabase
        .from(table)
        .update(payload)
        .eq("id", user.id);

      if (error && !isMissingTableOrColumnError(error)) {
        console.warn(`${table} withdrawal update skipped`, error);
      }
    })
  );
}

function isMissingTableOrColumnError(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    error?.code === "PGRST205" ||
    /schema cache|does not exist|column|table/i.test(error?.message || "")
  );
}

function ApplicationInfo({ label, value }) {
  return (
    <div className="application-info-item">
      <span>{label}</span>
      <strong>{value || "미등록"}</strong>
    </div>
  );
}

function ApplicationDetailPanel({
  application,
  job,
  statusLabel,
  canWithdraw,
  isMatched,
  hasLinkedJob,
  onJobDetailClick,
  onWithdraw,
}) {
  return (
    <div className="application-expanded-panel">
      <section className="application-info-section">
        <h4>공고 정보</h4>
        <div className="application-info-grid">
          <ApplicationInfo label="기업명" value={job.company_name || "미등록"} />
          <ApplicationInfo label="통역 언어" value={job.language || "별도 안내"} />
          <ApplicationInfo label="통역 레벨" value={getJobLevelSummary(job)} />
          <ApplicationInfo label="전문 분야" value={getJobSpecialty(job)} />
          <ApplicationInfo
            label="근무 장소"
            value={job.location || job.event_location || "미등록"}
          />
          <ApplicationInfo
            label="근무 일정"
            value={formatDateRange(job.start_date, job.end_date, job.event_date || job.date)}
          />
          <ApplicationInfo label="근무 시간" value="별도 안내" />
          <ApplicationInfo
            label="모집 인원"
            value={`${getRecruitmentCountDisplay(job)}명`}
          />
          <ApplicationInfo
            label="성별 조건"
            value={job.preferred_gender || "성별 무관"}
          />
          <ApplicationInfo label="지급/단가 기준" value={getJobPayDisplay(job)} />
          <ApplicationInfo
            label="현재 공고 상태"
            value={getJobStatusLabel(job.status)}
          />
        </div>
      </section>

      <section className="application-info-section is-personal">
        <h4>내 지원 정보</h4>
        <div className="application-personal-info">
          {application.message && (
            <div className="app-message-box">
              <span>지원 메모</span>
              <p>{application.message}</p>
            </div>
          )}
          <div className="application-personal-meta">
            <ApplicationInfo label="지원 상태" value={statusLabel} />
            <ApplicationInfo label="지원 등록일" value={formatDate(application.created_at)} />
            <ApplicationInfo label="지원 철회" value={canWithdraw ? "가능" : "불가"} />
          </div>
        </div>
      </section>

      <div className="application-card-footer">
        <div className="app-date-row">
          지원 일시: {formatDate(application.created_at)}
        </div>
        <div className="application-card-actions">
          {hasLinkedJob && (
            <button
              type="button"
              className="application-job-detail-button"
              onClick={() => onJobDetailClick?.(application.job_id)}
            >
              공고 상세 보기
            </button>
          )}
          {canWithdraw && (
            <button
              type="button"
              className="application-withdraw-button"
              onClick={onWithdraw}
            >
              지원 철회
            </button>
          )}
        </div>
      </div>

      {isMatched && (
        <p className="application-withdrawal-note">
          매칭이 완료된 지원은 직접 철회할 수 없습니다. 변경이 필요한 경우 ON-LI에 문의해 주세요.
        </p>
      )}
    </div>
  );
}

function JobInformationSection({
  job,
  startDate,
  endDate,
  countLabel,
  isExpanded,
  onToggle,
}) {
  return (
    <section className="application-info-section">
      <h4>공고 정보</h4>
      <div className="application-info-grid">
        <ApplicationInfo label="기업명" value={job.company_name || "미등록"} />
        <ApplicationInfo label="통역 언어" value={job.language || "별도 안내"} />
        <ApplicationInfo label="통역 레벨" value={getJobLevelSummary(job)} />
        <ApplicationInfo label="전문 분야" value={getJobSpecialty(job)} />
        <ApplicationInfo
          label="근무 장소"
          value={job.location || job.event_location || "미등록"}
        />
        <ApplicationInfo
          label="근무 일정"
          value={formatDateRange(
            startDate || job.start_date,
            endDate || job.end_date,
            job.event_date || job.date
          )}
        />
        <ApplicationInfo label="근무 시간" value="별도 안내" />
        <ApplicationInfo
          label={countLabel}
          value={`${getRecruitmentCountDisplay(job)}명`}
        />
        <ApplicationInfo
          label="성별 조건"
          value={job.preferred_gender || "성별 무관"}
        />
        <ApplicationInfo label="지급/단가 기준" value={getJobPayDisplay(job)} />
        <ApplicationInfo
          label="현재 공고 상태"
          value={getJobStatusLabel(job.status)}
        />
      </div>

      <button
        type="button"
        className="application-detail-toggle"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        {isExpanded ? "상세 정보 닫기" : "상세 정보 보기"}
      </button>

      {isExpanded && (
        <div className="application-expanded-details">
          <ApplicationDetail
            label="공고 소개"
            value={
              job.description ||
              job.job_description ||
              "등록된 공고 소개가 없습니다."
            }
          />
          <ApplicationDetail
            label="원하는 통역사"
            value={
              job.preference ||
              `${getJobLevelSummary(job)} 역량을 갖춘 통역사를 찾고 있습니다.`
            }
          />
          <ApplicationDetail
            label="우대사항 및 안내"
            value={job.dress_code || job.preferred_gender || "별도 안내"}
          />
          <div className="application-detail-block">
            <strong>추가 안내사항</strong>
            <ul>
              <li>요구 레벨에 맞는 일급 기준이 적용됩니다.</li>
              <li>배정 완료 시 지원이 제한될 수 있습니다.</li>
              <li>운영팀 확인 후 최종 연락드립니다.</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function AssignmentDetailPanel({
  job,
  matching,
  startDate,
  endDate,
  statusLabel,
  hasLinkedJob,
  onJobDetailClick,
}) {
  return (
    <div className="assignment-expanded-panel">
      <section className="application-info-section">
        <h4>공고 정보</h4>
        <div className="application-info-grid">
          <ApplicationInfo label="기업명" value={job.company_name || "미등록"} />
          <ApplicationInfo label="통역 언어" value={job.language || "별도 안내"} />
          <ApplicationInfo label="통역 레벨" value={getJobLevelSummary(job)} />
          <ApplicationInfo label="전문 분야" value={getJobSpecialty(job)} />
          <ApplicationInfo
            label="근무 장소"
            value={job.location || job.event_location || "미등록"}
          />
          <ApplicationInfo
            label="근무 일정"
            value={formatDateRange(
              startDate || job.start_date,
              endDate || job.end_date,
              job.event_date || job.date
            )}
          />
          <ApplicationInfo label="근무 시간" value="별도 안내" />
          <ApplicationInfo
            label="모집 인원"
            value={`${getRecruitmentCountDisplay(job)}명`}
          />
          <ApplicationInfo
            label="성별 조건"
            value={job.preferred_gender || "성별 무관"}
          />
          <ApplicationInfo label="지급/단가 기준" value={getJobPayDisplay(job)} />
          <ApplicationInfo
            label="현재 공고 상태"
            value={getJobStatusLabel(job.status)}
          />
        </div>

        <div className="application-expanded-details assignment-detail-descriptions">
          <ApplicationDetail
            label="공고 소개"
            value={
              job.description ||
              job.job_description ||
              "등록된 공고 소개가 없습니다."
            }
          />
          <ApplicationDetail
            label="원하는 통역사"
            value={
              job.preference ||
              `${getJobLevelSummary(job)} 역량을 갖춘 통역사를 찾고 있습니다.`
            }
          />
          <ApplicationDetail
            label="우대사항 및 안내"
            value={job.dress_code || job.preferred_gender || "별도 안내"}
          />
          <div className="application-detail-block">
            <strong>추가 안내사항</strong>
            <ul>
              <li>요구 레벨에 맞는 일급 기준이 적용됩니다.</li>
              <li>배정 완료 시 지원이 제한될 수 있습니다.</li>
              <li>운영팀 확인 후 최종 연락드립니다.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="application-info-section is-personal">
        <h4>내 배정 정보</h4>
        <div className="application-personal-meta">
          <ApplicationInfo label="배정 상태" value={statusLabel} />
          <ApplicationInfo label="배정 등록일" value={formatDate(matching.created_at)} />
          <ApplicationInfo
            label="업무 예정일"
            value={formatDateRange(
              startDate,
              endDate,
              job.event_date || job.date
            )}
          />
          <ApplicationInfo label="담당 기업" value={job.company_name || "미등록"} />
          <ApplicationInfo label="현재 진행 상태" value={statusLabel} />
        </div>
      </section>

      <div className="application-card-footer assignment-card-footer">
        <p className="assignment-change-note">
          배정이 완료된 업무의 변경 또는 취소가 필요한 경우 ON-LI에 문의해 주세요.
        </p>
        {hasLinkedJob && (
          <div className="application-card-actions">
            <button
              type="button"
              className="application-job-detail-button"
              onClick={() => onJobDetailClick?.(matching.job_id)}
            >
              공고 상세 보기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ApplicationDetail({ label, value }) {
  return (
    <div className="application-detail-block">
      <strong>{label}</strong>
      <p>{value || "별도 안내"}</p>
    </div>
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

function ResumeFileActions({
  fileName,
  fileUrl,
  isBusy,
  mode,
  onView,
  onEdit,
  onDelete,
  onRegister,
}) {
  const hasResume = Boolean(fileName || fileUrl);

  if (!hasResume) {
    return (
      <div className="resume-file-actions is-empty">
        <span>등록된 이력서가 없습니다.</span>
        <button
          type="button"
          className="resume-inline-action"
          onClick={onRegister}
          disabled={isBusy}
        >
          {isBusy && mode === "register" ? "업로드 중..." : "이력서 등록"}
        </button>
      </div>
    );
  }

  return (
    <div className="resume-file-actions">
      <button
        type="button"
        className="resume-file-view-link"
        onClick={onView}
        disabled={!fileUrl || isBusy}
      >
        📎 {fileName || "이력서 파일"} (이력서 보기)
      </button>
      <div className="resume-file-action-buttons">
        <button
          type="button"
          className="resume-inline-action"
          onClick={onEdit}
          disabled={isBusy}
        >
          {isBusy && mode === "edit" ? "업로드 중..." : "수정"}
        </button>
        <button
          type="button"
          className="resume-inline-action danger"
          onClick={onDelete}
          disabled={isBusy}
        >
          삭제
        </button>
      </div>
    </div>
  );
}

function SettlementDocumentCard({
  label,
  description,
  fileName,
  fileUrl,
  isBusy,
  onUpload,
  onView,
  onDelete,
}) {
  const hasFile = Boolean(fileName || fileUrl);

  return (
    <section className="settlement-document-box">
      <div>
        <h4>{label}</h4>
        <p>{description}</p>
        <span>업로드 가능 형식: PDF, JPG, PNG</span>
      </div>

      {hasFile ? (
        <div className="settlement-document-file">
          <span className="file-icon">📎</span>
          <strong>{fileName || label}</strong>
          <div className="settlement-document-actions">
            <button type="button" onClick={onView} disabled={!fileUrl || isBusy}>
              보기
            </button>
            <button type="button" onClick={onUpload} disabled={isBusy}>
              {isBusy ? "업로드 중..." : "수정"}
            </button>
            <button type="button" className="danger" onClick={onDelete} disabled={isBusy}>
              삭제
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="settlement-document-upload-button"
          onClick={onUpload}
          disabled={isBusy}
        >
          {isBusy ? "업로드 중..." : "파일 업로드"}
        </button>
      )}
    </section>
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

function getResumeStoragePath(filePath) {
  return getStoragePathFromUrl(filePath, "resume-files");
}

function getStoragePathFromUrl(filePath, bucketName) {
  if (!filePath) return "";
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    const parts = filePath.split(`/${bucketName}/`);
    if (parts.length > 1) {
      return decodeURIComponent(parts[1].split("?")[0]);
    }
    return "";
  }
  return filePath;
}

function getActivityStatus(interpreter) {
  const status = String(interpreter?.activity_status || "").trim().toLowerCase();
  if (Object.values(INTERPRETER_ACTIVITY_STATUS).includes(status)) return status;
  return INTERPRETER_ACTIVITY_STATUS.ACTIVE;
}

export default InterpreterMypage;
