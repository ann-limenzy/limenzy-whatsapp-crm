"use client";

import { useActionState } from "react";

import {
  setManagerRecordScopeAction,
  setPermissionGrantedAction,
  type PermissionActionState,
} from "@/app/actions/permissions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type {
  ConfigurablePermission,
  ManagerRecordScope,
} from "@/lib/permissions";

const INITIAL: PermissionActionState = { status: "idle" };

/** §162.1 names exactly these two, and no default. */
const SCOPES: {
  value: ManagerRecordScope;
  label: string;
  description: string;
}[] = [
  {
    value: "all_records",
    label: "All Records",
    description:
      "Managers may access every Lead and Customer in this workspace.",
  },
  {
    value: "own_assigned_shared",
    label: "Own, Assigned and Explicitly Shared Records",
    description:
      "Managers may access records they own, operational items assigned to them once the related record is validated, and records explicitly shared with them.",
  },
];

const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  staff_sales: "Staff/Sales",
};

/** Turn an action key into something readable without inventing new wording. */
const readable = (action: string) =>
  action.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function StatusAlert({ state }: { state: PermissionActionState }) {
  if (state.status === "forbidden") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Only an Owner/Admin can change permissions</AlertTitle>
        <AlertDescription>
          Ask an Owner/Admin of this workspace to make this change.
        </AlertDescription>
      </Alert>
    );
  }
  if (state.status === "unavailable") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Permissions cannot be configured yet</AlertTitle>
        <AlertDescription>Nothing was changed.</AlertDescription>
      </Alert>
    );
  }
  if (state.status === "invalid") {
    return (
      <Alert variant="destructive">
        <AlertTitle>That request wasn&rsquo;t valid</AlertTitle>
        <AlertDescription>Nothing was changed.</AlertDescription>
      </Alert>
    );
  }
  return null;
}

/**
 * Settings → Roles &amp; Permissions — spec §162, §162.1.
 *
 * Shows only the cells §162 marks "Configurable"; the list is derived from the
 * matrix on the server, so a fixed cell or a "Decision required" rule cannot
 * appear here. Every change is re-authorised on the server, so hiding a
 * control is presentation and not the gate.
 *
 * Neither setting has a specification-defined default, so an unconfigured
 * workspace is shown as needing a decision rather than as one where everything
 * happens to be off.
 */
export function PermissionSettingsForm({
  configurable,
  granted,
  isConfigured,
  managerRecordScope,
}: {
  /** The §162 Configurable cells, derived from the matrix. */
  configurable: readonly ConfigurablePermission[];
  /** Those currently granted. */
  granted: readonly string[];
  /** False when this workspace has never been configured. */
  isConfigured: boolean;
  /** The chosen §162.1 scope, or undefined when none has been chosen. */
  managerRecordScope: ManagerRecordScope | undefined;
}) {
  const [permissionState, permissionAction, permissionPending] = useActionState(
    setPermissionGrantedAction,
    INITIAL,
  );
  const [scopeState, scopeAction, scopePending] = useActionState(
    setManagerRecordScopeAction,
    INITIAL,
  );
  const on = new Set(granted);

  return (
    <div className="grid gap-8">
      <section aria-labelledby="manager-scope-heading" className="grid gap-3">
        <div className="grid gap-1">
          <h3 id="manager-scope-heading" className="text-base font-semibold">
            Manager record visibility
          </h3>
          <p className="text-sm text-muted-foreground">
            Which Leads and Customers a Manager may open in this workspace.
          </p>
        </div>

        <StatusAlert state={scopeState} />

        {managerRecordScope === undefined ? (
          <Alert>
            <AlertTitle>This needs a decision</AlertTitle>
            <AlertDescription>
              The specification names no default, so until one is chosen a
              Manager cannot access any record. Choose one below.
            </AlertDescription>
          </Alert>
        ) : null}

        <ul className="grid gap-0">
          {SCOPES.map((scope, index) => {
            const chosen = managerRecordScope === scope.value;
            return (
              <li key={scope.value}>
                {index > 0 ? <Separator className="my-1" /> : null}
                <div className="flex items-start justify-between gap-4 py-3">
                  <div className="grid gap-0.5">
                    <span className="text-sm font-medium">{scope.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {scope.description}
                    </span>
                  </div>
                  {chosen ? (
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      Current
                    </span>
                  ) : (
                    <form action={scopeAction} className="shrink-0">
                      <input type="hidden" name="scope" value={scope.value} />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={scopePending}
                        aria-label={`Use ${scope.label}`}
                      >
                        Use this
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="configurable-heading" className="grid gap-3">
        <div className="grid gap-1">
          <h3 id="configurable-heading" className="text-base font-semibold">
            Configurable permissions
          </h3>
          <p className="text-sm text-muted-foreground">
            The permissions this workspace can decide for itself. The rest are
            fixed and are not shown here.
          </p>
        </div>

        <StatusAlert state={permissionState} />

        {!isConfigured ? (
          <Alert>
            <AlertTitle>This needs a decision</AlertTitle>
            <AlertDescription>
              The specification names no default, so every permission below is
              denied until it is granted here.
            </AlertDescription>
          </Alert>
        ) : null}

        <ul className="grid gap-0">
          {configurable.map((entry, index) => {
            const isOn = on.has(entry.action);
            return (
              <li key={entry.action}>
                {index > 0 ? <Separator className="my-1" /> : null}
                <div className="flex items-start justify-between gap-4 py-3">
                  <div className="grid gap-0.5">
                    <span className="text-sm font-medium">
                      {readable(entry.action)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {ROLE_LABELS[entry.role] ?? entry.role} ·{" "}
                      {isOn
                        ? "Granted"
                        : isConfigured
                          ? "Not granted"
                          : "Denied"}
                      {entry.requires.length > 0
                        ? " · still limited to the permitted scope"
                        : ""}
                    </span>
                  </div>
                  <form action={permissionAction} className="shrink-0">
                    <input
                      type="hidden"
                      name="permission"
                      value={entry.action}
                    />
                    <input
                      type="hidden"
                      name="grant"
                      value={isOn ? "false" : "true"}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant={isOn ? "outline" : "default"}
                      disabled={permissionPending}
                      aria-label={`${isOn ? "Revoke" : "Grant"} ${readable(entry.action)}`}
                    >
                      {isOn ? "Revoke" : "Grant"}
                    </Button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="text-xs text-muted-foreground">
          Granting a permission says what a role may do. It does not grant
          access to any particular record — that is decided separately by
          Manager record visibility above, by explicit shares, and by row-level
          security on every statement.
        </p>
      </section>
    </div>
  );
}
