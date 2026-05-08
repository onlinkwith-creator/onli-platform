import { useState } from "react";
import Home from "./pages/Home";
import InterpreterList from "./pages/InterpreterList";
import InterpreterDetail from "./pages/InterpreterDetail";
import RequestForm from "./components/RequestForm";

function App() {
  const [page, setPage] = useState("home");
  const [selectedInterpreter, setSelectedInterpreter] = useState(null);

  return (
    <>
      {page === "home" && <Home onListClick={() => setPage("list")} />}

      {page === "list" && (
        <InterpreterList
          onBackClick={() => setPage("home")}
          onDetailClick={(person) => {
            setSelectedInterpreter(person);
            setPage("detail");
          }}
        />
      )}

      {page === "detail" && (
        <InterpreterDetail
          interpreter={selectedInterpreter}
          onBackClick={() => setPage("list")}
          onRequestClick={(person) => {
            setSelectedInterpreter(person);
            setPage("request");
          }}
        />
      )}

      {page === "request" && (
        <RequestForm
          interpreter={selectedInterpreter}
          onBackClick={() => setPage("detail")}
          onSubmitSuccess={() => setPage("home")}
        />
      )}
    </>
  );
}

export default App;