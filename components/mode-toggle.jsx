"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes only knows the real theme on the client; until mounted,
  // render the light-mode label to avoid a hydration mismatch.
  useEffect(() => setMounted(true), []);

  // Derive the label from the resolved (effective) theme, not from a
  // hardcoded string or local state, so it stays in sync across client-side
  // navigation: in dark mode the button offers light mode, and vice versa.
  const isDark = mounted && resolvedTheme === "dark";
  const label = isDark ? "切換淺色模式" : "切換深色模式";

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">{label}</span>
    </Button>
  );
}
