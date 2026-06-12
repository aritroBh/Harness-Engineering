import { createRoot } from "react-dom/client";
import { ClinicalApp } from "./ClinicalApp";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<ClinicalApp />);
}
