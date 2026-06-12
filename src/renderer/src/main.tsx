import React from "react";
import ReactDOM from "react-dom/client";
import "./assets/main.css";

const DemoApp: React.FC = () => {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [templateSelected, setTemplateSelected] = React.useState(false);
  const [projectName, setProjectName] = React.useState("");
  const [created, setCreated] = React.useState(false);

  const reset = () => {
    setSettingsOpen(false);
    setTemplateSelected(false);
    setProjectName("");
    setCreated(false);
  };

  return (
    <div className="main-window">
      <div className="demo-stage">
        <div className="demo-header">
          <p className="demo-eyebrow">Specter Guided Workspace</p>
          <h1>Project Setup</h1>
          <p>
            Follow the same ghost cursor and confirmation flow used over real
            apps.
          </p>
        </div>

        <button
          className={`demo-target demo-button-one ${settingsOpen ? "is-done" : ""}`}
          onClick={() => setSettingsOpen(true)}
        >
          {settingsOpen ? "Settings Opened" : "Open Settings"}
        </button>

        <button
          className={`demo-target demo-button-two ${templateSelected ? "is-done" : ""}`}
          onClick={() => setTemplateSelected(true)}
        >
          {templateSelected ? "Template Chosen" : "Choose Template"}
        </button>

        <input
          className="demo-target demo-input"
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="Project name"
          aria-label="Project name"
        />

        <button
          className={`demo-target demo-confirm ${created ? "is-done" : ""}`}
          onClick={() => setCreated(true)}
        >
          {created ? "Created" : "Create"}
        </button>

        <div className="demo-status" aria-live="polite">
          <span className={settingsOpen ? "is-done" : ""}>1</span>
          <span className={templateSelected ? "is-done" : ""}>2</span>
          <span className={projectName.trim() ? "is-done" : ""}>3</span>
          <span className={created ? "is-done" : ""}>4</span>
        </div>

        <button className="demo-reset" onClick={reset}>
          Reset
        </button>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DemoApp />
  </React.StrictMode>,
);
