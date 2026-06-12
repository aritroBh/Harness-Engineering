import React from "react";
import {
  ThemeProvider,
  createTheme,
  defaultDarkTheme,
} from "@openuidev/react-ui";

const specterDarkTheme = createTheme({
  ...defaultDarkTheme,
  interactiveAccentDefault: "oklch(0.72 0.14 262)",
  borderInfoEmphasis: "oklch(0.62 0.19 259)",
  borderSuccessEmphasis: "oklch(0.63 0.17 149)",
  infoBackground: "oklch(0.62 0.19 259 / 0.14)",
  successBackground: "oklch(0.63 0.17 149 / 0.14)",
  purpleBackground: "oklch(0.63 0.23 304 / 0.14)",
});

interface SpecterOpenUIProviderProps {
  children: React.ReactNode;
}

export const SpecterOpenUIProvider: React.FC<SpecterOpenUIProviderProps> = ({
  children,
}) => (
  <ThemeProvider
    mode="dark"
    darkTheme={specterDarkTheme}
    cssSelector='[data-specter-openui="true"]'
  >
    <div data-specter-openui="true" className="specter-openui-root">
      {children}
    </div>
  </ThemeProvider>
);
