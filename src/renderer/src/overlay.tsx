import ReactDOM from "react-dom/client";
import OverlayApp from "./OverlayApp";
import { SpecterOpenUIProvider } from "../overlay/SpecterOpenUIProvider";
import "@openuidev/react-ui/components.css";
import "@openuidev/react-ui/defaults.css";
import "./assets/overlay.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <SpecterOpenUIProvider>
    <OverlayApp />
  </SpecterOpenUIProvider>,
);
