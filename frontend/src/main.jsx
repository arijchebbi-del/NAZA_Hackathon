import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SpaceExplorer from "./SpaceExplorer";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SpaceExplorer
      title="Lunar landing sites are floating"
      siteName="Sample Site A"
      onLand={(site) => console.log(`Landing on ${site}`)}
    />
  </StrictMode>
);
