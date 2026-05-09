import { useEffect, useState } from "react";
import Home from "./pages/Home";
import InterpreterList from "./pages/InterpreterList";
import InterpreterDetail from "./pages/InterpreterDetail";
import RegisterInterpreter from "./pages/RegisterInterpreter";
import RequestForm from "./pages/RequestForm";
import Admin from "./pages/Admin";
import JobList from "./pages/JobList";
import JobDetail from "./pages/JobDetail";

function getInitialPage() {
  const path = window.location.pathname;

  if (path === "/register") return "register";
  if (path === "/admin") return "admin";
  if (path === "/jobs") return "jobs";
  if (path === "/jobs/create") return "jobCreate";
  if (path.startsWith("/jobs/")) return "jobDetail";
  if (path === "/interpreters") return "list";
  if (path.startsWith("/interpreters/") && path.endsWith("/request")) {
    return "missingInterpreterRequest";
  }
  if (path.startsWith("/interpreters/")) return "missingInterpreterDetail";
  return "home";
}

function getInitialJobId() {
  const path = window.location.pathname;
  if (!path.startsWith("/jobs/")) return null;
  return path.split("/")[2] || null;
}

function getPath(page, interpreter, jobId) {
  if (page === "register") return "/register";
  if (page === "admin") return "/admin";
  if (page === "jobs") return "/jobs";
  if (page === "jobCreate") return "/jobs/create";
  if (page === "jobDetail" && jobId) return `/jobs/${jobId}`;
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
  const [selectedJobId, setSelectedJobId] = useState(getInitialJobId);

  const navigate = (
    nextPage,
    interpreter = selectedInterpreter,
    jobId = selectedJobId
  ) => {
    setSelectedInterpreter(interpreter);
    setSelectedJobId(jobId);
    setPage(nextPage);
    window.history.pushState(
      { page: nextPage, interpreter, jobId },
      "",
      getPath(nextPage, interpreter, jobId)
    );
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  useEffect(() => {
    const handlePopState = (event) => {
      const statePage = event.state?.page || getInitialPage();
      setPage(statePage);
      setSelectedInterpreter(event.state?.interpreter || null);
      setSelectedJobId(event.state?.jobId || getInitialJobId());
      window.scrollTo({ top: 0, behavior: "instant" });
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return (
    <>
      {page === "home" && (
        <Home
          onRegisterClick={() => navigate("register", null)}
          onListClick={() => navigate("list", null)}
          onInterpreterClick={(person) => navigate("detail", person)}
          onJobsClick={() => navigate("jobs", null, null)}
          onJobCreateClick={() => navigate("jobCreate", null, null)}
        />
      )}

      {page === "register" && (
        <RegisterInterpreter onBackClick={() => navigate("home", null)} />
      )}

      {page === "admin" && <Admin onBackClick={() => navigate("home", null)} />}

      {page === "jobs" && (
        <JobList
          onBackClick={() => navigate("home", null, null)}
          onJobClick={(job) => navigate("jobDetail", null, job.id)}
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
          onDetailClick={(person) => {
            navigate("detail", person);
          }}
        />
      )}

      {page === "detail" && selectedInterpreter && (
        <InterpreterDetail
          interpreter={selectedInterpreter}
          onBackClick={() => navigate("list", null)}
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
    width: "100vw",
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
