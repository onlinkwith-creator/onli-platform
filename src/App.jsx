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

      {page === "detail" && (
        <InterpreterDetail
          interpreter={selectedInterpreter}
          onBackClick={() => navigate("list", null)}
          onRequestClick={(person) => {
            navigate("request", person);
          }}
        />
      )}

      {page === "request" && (
        <RequestForm
          interpreter={selectedInterpreter}
          onBackClick={() => navigate("detail", selectedInterpreter)}
          onSubmitSuccess={() => navigate("home", null)}
        />
      )}
    </>
  );
}

export default App;
