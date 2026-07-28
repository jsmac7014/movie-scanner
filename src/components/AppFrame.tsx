"use client";

import type { ReactNode } from "react";
import { Mozilla_Headline } from "next/font/google";
import { AppShell } from "@astryxdesign/core/AppShell";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { Button } from "@astryxdesign/core/Button";

const mozillaHeadline = Mozilla_Headline({
  subsets: ["latin"],
  weight: "variable",
  adjustFontFallback: false,
});

interface AppFrameProps {
  children: ReactNode;
  backHref?: string;
}

export function AppFrame({ children, backHref }: AppFrameProps) {
  return (
    <AppShell
      height="auto"
      contentPadding={0}
      variant="surface"
      topNav={
        <TopNav
          heading={
             <TopNavHeading
               heading="MovieScanner"
               headingHref="/"
               className={mozillaHeadline.className}
             />
          }
          endContent={
            backHref ? (
              <Button
                variant="ghost"
                size="sm"
                label="영화 선택"
                href={backHref}
              />
            ) : undefined
          }
        />
      }
    >
      {children}
    </AppShell>
  );
}
