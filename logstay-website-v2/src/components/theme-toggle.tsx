"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <button
      onClick={() => {
        // Toggle based on current document class (avoids hydration mismatch)
        const isDark = document.documentElement.classList.contains("dark");
        setTheme(isDark ? "light" : "dark");
      }}
      aria-label="Toggle theme"
      className="fixed right-4 top-4 z-50 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/80 backdrop-blur transition-colors hover:border-ember/60 hover:text-ember"
    >
      {/* Render both icons; CSS shows the right one based on theme */}
      <Sun className="hidden h-3.5 w-3.5 dark:block" />
      <Moon className="block h-3.5 w-3.5 dark:hidden" />
    </button>
  );
}
