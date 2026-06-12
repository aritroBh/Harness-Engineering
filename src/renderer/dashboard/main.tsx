import React from "react";
import { createRoot } from "react-dom/client";
import { DashboardApp } from "./DashboardApp";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <DashboardApp />
    </React.StrictMode>,
  );
}
