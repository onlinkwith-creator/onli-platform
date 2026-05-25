import { useEffect, useState } from "react";
import Home from "./pages/Home";
import About from "./pages/About";
import InterpreterList from "./pages/InterpreterList";
import InterpreterDetail from "./pages/InterpreterDetail";
import RegisterInterpreter from "./pages/RegisterInterpreter";
import RequestForm from "./pages/RequestForm";
import Admin from "./pages/Admin";
import JobList from "./pages/JobList";
import JobDetail from "./pages/JobDetail";
import InterpreterLogin from "./pages/InterpreterLogin";
import InterpreterSignup from "./pages/InterpreterSignup";
import InterpreterMypage from "./pages/InterpreterMypage";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import PolicyPage, { POLICY_PAGES } from "./pages/PolicyPage";
import { useAuth } from "./hooks/useAuth";
import { supabase } from "./supabase";
import { PUBLIC_INTERPRETER_SELECT } from "./utils/publicInterpreter";

const POLICY_PATH_TO_KEY = Object.fromEntries(
  Object.entries(POLICY_PAGES).map(([key, policy]) => [policy.path, key])
);

function getInitialPage() {
  const path = window.location.pathname;

  if (POLICY_PATH_TO_KEY[path]) return "policy";
  if (path === "/about") return "about";
  if (path === "/register") return "register";
  if (path === "/admin/jobs") return "admin";
  if (path === "/admin") return "admin";
  if (path === "/request") return "jobCreate";
  if (path === "/jobs") return "jobs";
  if (path === "/jobs/create") return "jobCreate";
  if (path === "/login") return "login";
  if (path === "/interpreter-login") return "interpreterLogin";
  if (path === "/interpreter-signup") return "interpreterSignup";
  if (path === "/interpreter-mypage") return "interpreterMypage";
  if (path === "/reset-password") return "resetPassword";
  if (path.startsWith("/jobs/") && path.endsWith("/apply")) {
    // /jobs/:id/apply를 /jobs/:id#apply로 리다이렉트
    const jobId = path.split("/")[2];
    if (jobId) {
      window.history.replaceState({}, "", `/jobs/${jobId}#apply`);
    }
    return "jobDetail";
  }
  if (path.startsWith("/jobs/")) return "jobDetail";
  if (path === "/interpreters") return "list";
  if (path.startsWith("/interpreters/") && path.endsWith("/request")) {
    return "missingInterpreterRequest";
  }
  if (path.startsWith("/interpreters/")) return "detail";
  return "home";
}

function getInitialInterpreterId() {
  const path = window.location.pathname;
  if (!path.startsWith("/interpreters/") || path.endsWith("/request")) return null;
  return path.split("/")[2] || null;
}

function getInitialJobId() {
  const path = window.location.pathname;
  if (!path.startsWith("/jobs/")) return null;
  return path.split("/")[2] || null;
}

function getInitialPolicyKey() {
  return POLICY_PATH_TO_KEY[window.location.pathname] || null;
}

function getPath(page, interpreter, jobId, policyKey) {
  if (page === "policy" && policyKey) {
    return POLICY_PAGES[policyKey]?.path || "/";
  }
  if (page === "about") return "/about";
  if (page === "register") return "/register";
  if (page === "admin") return "/admin";
  if (page === "jobs") return "/jobs";
  if (page === "jobCreate") return "/request";
  if (page === "jobDetail" && jobId) return `/jobs/${jobId}`;
  if (page === "login") return "/login";
  if (page === "interpreterLogin") return "/interpreter-login";
  if (page === "interpreterSignup") return "/interpreter-signup";
  if (page === "interpreterMypage") return "/interpreter-mypage";
  if (page === "resetPassword") return "/reset-password";
  if (page === "list") return "/interpreters";
  if (page === "detail" && interpreter?.id) {
    return `/interpreters/${interpreter.id}`;
  }
  if (page === "request" && interpreter?.id) {
    return `/interpreters/${interpreter.id}/request`;
  }
  return "/";
}

function App() {
  const [page, setPage] = useState(getInitialPage);
  const [selectedInterpreter, setSelectedInterpreter] = useState(null);
  const [selectedInterpreterId, setSelectedInterpreterId] = useState(getInitialInterpreterId);
  const [selectedJobId, setSelectedJobId] = useState(getInitialJobId);
  const [selectedPolicyKey, setSelectedPolicyKey] = useState(getInitialPolicyKey);
  const { user, loading: authLoading, signOut, isAdmin } = useAuth();

  const navigate = (
    nextPage,
    interpreter = selectedInterpreter,
    jobId = selectedJobId,
    policyKey = selectedPolicyKey
  ) => {
    setSelectedInterpreter(interpreter);
    setSelectedInterpreterId(interpreter?.id || null);
    setSelectedJobId(jobId);
    setSelectedPolicyKey(policyKey || null);
    setPage(nextPage);
    window.history.pushState(
      { page: nextPage, interpreter, jobId, policyKey },
      "",
      getPath(nextPage, interpreter, jobId, policyKey)
    );
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const navigateAdminJobs = () => {
    setSelectedInterpreter(null);
    setSelectedInterpreterId(null);
    setSelectedJobId(null);
    setSelectedPolicyKey(null);
    setPage("admin");
    window.history.pushState({ page: "admin" }, "", "/admin/jobs");
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const handleInterpreterSignOut = async () => {
    await signOut();
    navigate("interpreterLogin", null, null);
  };

  const handleLogout = async () => {
    await signOut();
    navigate("home", null, null);
  };

  const openInterpreterRegister = () => {
    if (authLoading) return;
    if (!user) {
      alert("로그인 후 이용 가능합니다.");
      navigate("login", null, null);
      return;
    }
    navigate("register", null, null);
  };

  useEffect(() => {
    const handlePopState = (event) => {
      const statePage = event.state?.page || getInitialPage();
      setPage(statePage);
      setSelectedInterpreter(event.state?.interpreter || null);
      setSelectedInterpreterId(
        event.state?.interpreter?.id || getInitialInterpreterId()
      );
      setSelectedJobId(event.state?.jobId || getInitialJobId());
      setSelectedPolicyKey(event.state?.policyKey || getInitialPolicyKey());
      window.scrollTo({ top: 0, behavior: "instant" });
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        if (page === "register") {
          alert("로그인 후 이용 가능합니다.");
          navigate("login", null, null);
        } else if (page === "interpreterMypage") {
          alert("로그인 후 이용 가능합니다.");
          navigate("interpreterLogin", null, null);
        }
      } else if (!isAdmin && page === "admin") {
        alert("관리자 권한이 없습니다.");
        navigate("home", null, null);
      }
    }
  }, [user, authLoading, page, isAdmin]);

  useEffect(() => {
    const fetchInterpreter = async () => {
      if (page !== "detail" || selectedInterpreter || !selectedInterpreterId || !supabase) {
        return;
      }

      const { data, error } = await supabase
        .from("interpreters")
        .select(PUBLIC_INTERPRETER_SELECT)
        .eq("id", selectedInterpreterId)
        .eq("approved", true)
        .in("status", ["active", "warning"])
        .single();

      if (error) {
        console.error(error);
        return;
      }

      setSelectedInterpreter(data || null);
    };

    queueMicrotask(fetchInterpreter);
  }, [page, selectedInterpreter, selectedInterpreterId]);

  return (
    <>
      {page === "home" && (
        <Home
          user={user}
          isAdmin={isAdmin}
          onLogoutClick={handleLogout}
          onRegisterClick={openInterpreterRegister}
          onAboutClick={() => navigate("about", null, null)}
          onListClick={() => navigate("list", null)}
          onInterpreterClick={(person) => navigate("detail", person)}
          onJobsClick={() => navigate("jobs", null, null)}
          onJobDetailClick={(job) => navigate("jobDetail", null, job.id)}
          onJobApplyClick={(job) => {
            navigate("jobDetail", null, job.id);
            setTimeout(() => {
              const applySection = document.getElementById("apply");
              if (applySection) {
                applySection.scrollIntoView({ behavior: "smooth" });
              }
            }, 0);
          }}
          onRequestClick={() => navigate("jobCreate", null, null)}
          onInterpreterLoginClick={() => navigate("login", null, null)}
          onInterpreterSignupClick={() => navigate("login", null, null)}
          onMypageClick={() => navigate("interpreterMypage", null, null)}
        />
      )}

      {page === "about" && (
        <About
          onBackClick={() => navigate("home", null, null)}
          onRequestClick={() => navigate("jobCreate", null, null)}
          onListClick={() => navigate("list", null, null)}
        />
      )}

      {page === "register" && authLoading && (
        <RouteMessage
          title="로그인 상태를 확인 중입니다."
          description="통역사 등록은 로그인 후 이용할 수 있습니다."
          primaryText="로그인하기"
          onPrimaryClick={() => navigate("login", null, null)}
          onHomeClick={() => navigate("home", null, null)}
        />
      )}

      {page === "register" && !authLoading && !user && (
        <RouteMessage
          title="로그인 후 이용 가능합니다."
          description="통역사 등록은 로그인 후 이용 가능합니다."
          primaryText="로그인하기"
          onPrimaryClick={() => navigate("login", null, null)}
          onHomeClick={() => navigate("home", null, null)}
        />
      )}

      {page === "register" && !authLoading && user && (
        <RegisterInterpreter
          authUser={user}
          onBackClick={() => navigate("home", null)}
          onSubmitSuccess={() => navigate("home", null)}
          onLoginClick={() => navigate("login", null, null)}
          onSignupClick={() => navigate("login", null, null)}
        />
      )}

      {page === "login" && (
        <Login
          onBackClick={() => navigate("home", null, null)}
          onLoginSuccess={() => navigate("home", null, null)}
        />
      )}

      {page === "resetPassword" && (
        <ResetPassword
          onBackToLogin={() => navigate("login", null, null)}
        />
      )}

      {page === "interpreterLogin" && (
        <InterpreterLogin
          onBackClick={() => navigate("home", null, null)}
          onSignupClick={() => navigate("interpreterSignup", null, null)}
          onLoginSuccess={() => navigate("interpreterMypage", null, null)}
        />
      )}

      {page === "interpreterSignup" && (
        <InterpreterSignup
          onBackClick={() => navigate("home", null, null)}
          onLoginClick={() => navigate("interpreterLogin", null, null)}
          onSignupSuccess={() => navigate("interpreterMypage", null, null)}
        />
      )}

      {page === "interpreterMypage" && authLoading && (
        <RouteMessage
          title="로그인 상태를 확인 중입니다."
          description="마이페이지는 로그인 후 이용 가능합니다."
          primaryText="로그인하기"
          onPrimaryClick={() => navigate("interpreterLogin", null, null)}
          onHomeClick={() => navigate("home", null, null)}
        />
      )}

      {page === "interpreterMypage" && !authLoading && !user && (
        <RouteMessage
          title="로그인이 필요합니다."
          description="통역사 마이페이지는 로그인 후 이용 가능합니다."
          primaryText="통역사 로그인하기"
          onPrimaryClick={() => navigate("interpreterLogin", null, null)}
          onHomeClick={() => navigate("home", null, null)}
        />
      )}

      {page === "interpreterMypage" && !authLoading && user && (
        <InterpreterMypage
          authLoading={authLoading}
          user={user}
          onLoginClick={() => navigate("interpreterLogin", null, null)}
          onRegisterClick={openInterpreterRegister}
          onHomeClick={() => navigate("home", null, null)}
          onSignOut={handleInterpreterSignOut}
        />
      )}

      {page === "admin" && authLoading && (
        <RouteMessage
          title="로그인 상태를 확인 중입니다."
          description="관리자 기능은 로그인 후 권한 확인이 완료되면 이용 가능합니다."
          primaryText="로그인하기"
          onPrimaryClick={() => navigate("login", null, null)}
          onHomeClick={() => navigate("home", null, null)}
        />
      )}

      {page === "admin" && !authLoading && !user && (
        <Login
          onBackClick={() => navigate("home", null, null)}
          onLoginSuccess={() => {}}
          isAdminMode={true}
        />
      )}

      {page === "admin" && !authLoading && user && !isAdmin && (
        <RouteMessage
          title="관리자 권한이 필요합니다."
          description="관리자 계정으로 로그인해주세요."
          primaryText="로그인하기"
          onPrimaryClick={() => navigate("login", null, null)}
          onHomeClick={() => navigate("home", null, null)}
        />
      )}

      {page === "admin" && !authLoading && user && isAdmin && (
        <Admin onBackClick={() => navigate("home", null)} />
      )}

      {page === "policy" && selectedPolicyKey && (
        <PolicyPage
          policyKey={selectedPolicyKey}
          onNavigate={(targetPage, targetPolicyKey) => navigate(targetPage, null, null, targetPolicyKey)}
        />
      )}

      {page === "jobs" && (
        <JobList
          onBackClick={() => navigate("home", null, null)}
          onCreateJobClick={navigateAdminJobs}
          onDetailClick={(job) => navigate("jobDetail", null, job.id)}
          onApplyClick={(job) => {
            navigate("jobDetail", null, job.id);
            setTimeout(() => {
              const applySection = document.getElementById("apply");
              if (applySection) {
                applySection.scrollIntoView({ behavior: "smooth" });
              }
            }, 0);
          }}
        />
      )}

      {page === "jobCreate" && (
        <RequestForm
          interpreter={null}
          onBackClick={() => navigate("home", null, null)}
          onSubmitSuccess={() => navigate("home", null, null)}
        />
      )}

      {page === "jobDetail" && (
        <JobDetail
          jobId={selectedJobId}
          onBackClick={() => navigate("jobs", null, null)}
        />
      )}

      {page === "list" && (
        <InterpreterList
          onBackClick={() => navigate("home", null)}
          onRegisterClick={openInterpreterRegister}
          onDetailClick={(person) => {
            navigate("detail", person);
          }}
        />
      )}

      {page === "detail" && selectedInterpreter && (
        <InterpreterDetail
          interpreter={selectedInterpreter}
          onBackClick={() => navigate("home", null, null)}
          onRequestClick={(person) => {
            navigate("request", person);
          }}
        />
      )}

      {page === "detail" && !selectedInterpreter && (
        <RouteMessage
          title="통역사 정보를 다시 선택해주세요."
          description="새로고침 또는 직접 URL 접속으로 선택 정보가 사라졌습니다."
          primaryText="통역사 리스트 보기"
          onPrimaryClick={() => navigate("list", null)}
          onHomeClick={() => navigate("home", null)}
        />
      )}

      {page === "request" && selectedInterpreter && (
        <RequestForm
          interpreter={selectedInterpreter}
          onBackClick={() => navigate("detail", selectedInterpreter)}
          onSubmitSuccess={() => navigate("home", null)}
        />
      )}

      {page === "request" && !selectedInterpreter && (
        <RouteMessage
          title="의뢰할 통역사를 다시 선택해주세요."
          description="통역사 프로필에서 의뢰 문의를 시작하면 정확한 정보로 접수할 수 있습니다."
          primaryText="통역사 리스트 보기"
          onPrimaryClick={() => navigate("list", null)}
          onHomeClick={() => navigate("home", null)}
        />
      )}

      {page === "missingInterpreterDetail" && (
        <RouteMessage
          title="통역사 상세 페이지를 바로 열 수 없습니다."
          description="현재 구조에서는 리스트에서 통역사를 선택해야 상세 정보를 볼 수 있습니다."
          primaryText="통역사 리스트 보기"
          onPrimaryClick={() => navigate("list", null)}
          onHomeClick={() => navigate("home", null)}
        />
      )}

      {page === "missingInterpreterRequest" && (
        <RouteMessage
          title="의뢰 문의를 바로 열 수 없습니다."
          description="통역사 프로필에서 의뢰 문의를 시작해주세요."
          primaryText="통역사 리스트 보기"
          onPrimaryClick={() => navigate("list", null)}
          onHomeClick={() => navigate("home", null)}
        />
      )}
    </>
  );
}

function RouteMessage({
  title,
  description,
  primaryText,
  onPrimaryClick,
  onHomeClick,
}) {
  return (
    <div style={routeMessageStyles.page}>
      <section style={routeMessageStyles.card}>
        <p style={routeMessageStyles.kicker}>ON-LI</p>
        <h1 style={routeMessageStyles.title}>{title}</h1>
        <p style={routeMessageStyles.description}>{description}</p>
        <div style={routeMessageStyles.actions}>
          <button
            type="button"
            onClick={onPrimaryClick}
            style={routeMessageStyles.primary}
          >
            {primaryText}
          </button>
          <button type="button" onClick={onHomeClick} style={routeMessageStyles.secondary}>
            홈으로
          </button>
        </div>
      </section>
    </div>
  );
}

const routeMessageStyles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    boxSizing: "border-box",
    display: "grid",
    placeItems: "center",
    padding: "40px 20px",
    background: "linear-gradient(135deg, #f8fafc, #eef2ff)",
    color: "#111827",
  },
  card: {
    width: "min(100%, 560px)",
    boxSizing: "border-box",
    padding: "34px",
    borderRadius: "24px",
    background: "rgba(255, 255, 255, 0.96)",
    border: "1px solid rgba(255, 255, 255, 0.85)",
    boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12)",
    textAlign: "left",
  },
  kicker: {
    margin: "0 0 10px",
    color: "#4f46e5",
    fontSize: "12px",
    fontWeight: 900,
    letterSpacing: "4px",
  },
  title: {
    margin: 0,
    fontSize: "30px",
    lineHeight: 1.25,
    fontWeight: 900,
  },
  description: {
    margin: "14px 0 0",
    color: "#6b7280",
    fontSize: "15px",
    lineHeight: 1.7,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "24px",
  },
  primary: {
    border: "none",
    borderRadius: "999px",
    padding: "13px 18px",
    background: "#4f46e5",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 900,
  },
  secondary: {
    border: "1px solid #d1d5db",
    borderRadius: "999px",
    padding: "13px 18px",
    background: "#ffffff",
    color: "#111827",
    cursor: "pointer",
    fontWeight: 900,
  },
};

export default App;
{/* test */}
