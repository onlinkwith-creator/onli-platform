import { useState } from "react";
import Home from "./pages/Home";
import RegisterInterpreter from "./pages/RegisterInterpreter";
import InterpreterList from "./pages/InterpreterList";

function App() {
  const [page, setPage] = useState("home");

  return (
    <>
      {page === "home" && (
        <Home
          onRegisterClick={() => setPage("register")}
          onListClick={() => setPage("list")}
        />
      )}

      {page === "register" && <RegisterInterpreter />}

      {page === "list" && (
        <InterpreterList onBackClick={() => setPage("home")} />
      )}
    </>
  );
}

export default App;