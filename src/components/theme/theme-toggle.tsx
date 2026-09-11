"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * Theme control.
 *
 * The trigger icon is swapped with CSS (`dark:` variants) rather than from
 * React state, so the correct icon is present in the very first paint and no
 * hydration mismatch is possible.
 *
 * The "currently selected" checkmark reads client-only state, but the menu
 * content is mounted by Radix only once the menu is opened — which cannot
 * happen before hydration — so it needs no mount gate.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Change colour theme"
          data-testid="theme-toggle"
        >
          <Sun className="size-[18px] dark:hidden" aria-hidden="true" />
          <Moon className="hidden size-[18px] dark:block" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = theme === option.value;
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => setTheme(option.value)}
              aria-current={selected ? "true" : undefined}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="flex-1">{option.label}</span>
              {selected ? (
                <Check className="size-4" aria-hidden="true" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
