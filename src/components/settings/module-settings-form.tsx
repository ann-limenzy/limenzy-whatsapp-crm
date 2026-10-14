"use client";

import { useActionState } from "react";

import {
  setModuleEnabledAction,
  type ModuleActionState,
} from "@/app/actions/modules";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MODULE_LABELS, type ModuleKey } from "@/lib/modules";

const INITIAL: ModuleActionState = { status: "idle" };

/**
 * Settings → Modules & Features — spec §171.
 *
 * One form per module, each posting to the same Server Action. The action
 * re-resolves the membership and re-checks the Owner/Admin role on the server,
 * so this component hiding a control is presentation, never the gate; the same
 * POST from a Manager is refused.
 *
 * §172 requires a blocked change to "explain which dependent feature must be
 * disabled first". The action returns that explanation and it is shown here
 * verbatim — the wording is the specification's, not this component's.
 *
 * The action revalidates the layout on success, so the navigation re-renders
 * with the module shown or hidden without a manual reload.
 */
export function ModuleSettingsForm({
  modules,
  enabled,
  usingDefaults,
}: {
  /** Every switchable module, in the specification's order. */
  modules: readonly ModuleKey[];
  /** Those currently enabled, resolved on the server. */
  enabled: readonly ModuleKey[];
  /** True when the workspace has never been configured (§8 defaults apply). */
  usingDefaults: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    setModuleEnabledAction,
    INITIAL,
  );
  const on = new Set(enabled);

  return (
    <div className="grid gap-4">
      {state.status === "blocked" ? (
        <Alert variant="destructive">
          <AlertTitle>That change was blocked</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "forbidden" ? (
        <Alert variant="destructive">
          <AlertTitle>Only an Owner/Admin can change modules</AlertTitle>
          <AlertDescription>
            Ask an Owner/Admin of this workspace to make this change.
          </AlertDescription>
        </Alert>
      ) : null}

      {state.status === "unavailable" ? (
        <Alert variant="destructive">
          <AlertTitle>Modules cannot be configured yet</AlertTitle>
          <AlertDescription>
            This workspace&rsquo;s module settings are not available. Nothing
            was changed.
          </AlertDescription>
        </Alert>
      ) : null}

      {state.status === "invalid" ? (
        <Alert variant="destructive">
          <AlertTitle>That request wasn&rsquo;t valid</AlertTitle>
          <AlertDescription>Nothing was changed.</AlertDescription>
        </Alert>
      ) : null}

      {usingDefaults ? (
        <p className="text-sm text-muted-foreground">
          This workspace uses the recommended setup, so every module is enabled.
          Changing one below saves the workspace&rsquo;s own configuration.
        </p>
      ) : null}

      <ul className="grid gap-0">
        {modules.map((module, index) => {
          const isOn = on.has(module);
          return (
            <li key={module}>
              {index > 0 ? <Separator className="my-1" /> : null}
              <div className="flex items-center justify-between gap-4 py-3">
                <div className="grid gap-0.5">
                  <span className="text-sm font-medium">
                    {MODULE_LABELS[module]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isOn ? "Enabled" : "Disabled"}
                  </span>
                </div>

                <form action={formAction}>
                  <input type="hidden" name="module" value={module} />
                  <input
                    type="hidden"
                    name="enable"
                    value={isOn ? "false" : "true"}
                  />
                  {/* The visible word is short; the accessible name names the
                      module, so a screen-reader user hears which button this
                      is without the label being repeated as a text node. */}
                  <Button
                    type="submit"
                    variant={isOn ? "outline" : "default"}
                    size="sm"
                    disabled={pending}
                    aria-label={`${isOn ? "Disable" : "Enable"} ${MODULE_LABELS[module]}`}
                  >
                    {isOn ? "Disable" : "Enable"}
                  </Button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        Customer Management is a core module and cannot be disabled. Disabling a
        module hides its navigation and prevents new activity in it; existing
        data is kept and becomes visible again if it is re-enabled.
      </p>
    </div>
  );
}
