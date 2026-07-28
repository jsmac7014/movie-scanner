"use client";

import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import "@astryxdesign/theme-neutral/theme.css";
import { Theme } from "@astryxdesign/core/theme";

export function Providers({ children }: { children: React.ReactNode }) {
  return <Theme theme={neutralTheme} mode="dark">{children}</Theme>;
}
