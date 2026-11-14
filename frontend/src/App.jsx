import { useEffect, useState } from "react";
import Home from "./home/Home";
import MissionApp from "./app/MissionApp";

function currentPath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function App() {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const handlePopState = () => setPath(currentPath());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  if (path === "/app") {
    return <MissionApp onBack={() => navigate("/")} />;
  }

  return <Home onLand={() => navigate("/app")} />;
}
