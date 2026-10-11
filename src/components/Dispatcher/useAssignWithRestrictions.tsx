import { useState } from "react";

import { useAssignCargoMutation, type CargoAssignment } from "../../app/api/cargos";
import { groupMessages } from "../../utils/notices";
import { ConfirmDialog } from "../ui/ui";
import { errorMessage } from "../../utils/errors";

type AssignRequest = { id: string } & CargoAssignment;

// The API refuses a truck whose route breaks height or weight limits until the dispatcher accepts them.
const restrictionsIn = (error: unknown) => {
  const { status, data } = (error ?? {}) as { status?: number; data?: { code?: string; violations?: string[] } };
  return status === 409 && data?.code === "ROUTE_RESTRICTIONS" ? (data.violations ?? []) : undefined;
};

/**
 * Assigns driver, truck and trailer to a load. When the truck's route has restrictions the
 * dispatcher gets a dialog listing them and has to choose "Assign anyway".
 * Render `dialog` somewhere in the calling component.
 */
export const useAssignWithRestrictions = () => {
  const [assignCargo, { isLoading }] = useAssignCargoMutation();
  const [pending, setPending] = useState<{ request: AssignRequest; violations: string[]; error?: string }>();

  /** `knownViolations`, when the route is already on screen, opens the dialog without a round-trip. */
  const assign = async (request: AssignRequest, knownViolations: string[] = []) => {
    if (knownViolations.length) {
      setPending({ request, violations: knownViolations });
      return;
    }
    const result = await assignCargo(request);
    const violations = "error" in result ? restrictionsIn(result.error) : undefined;
    if (violations) setPending({ request, violations });
  };

  const acceptAndAssign = async () => {
    if (!pending) return;
    const result = await assignCargo({ ...pending.request, acceptRestrictions: true });
    if ("error" in result) setPending({ ...pending, error: errorMessage(result.error, "Could not assign the truck.") });
    else setPending(undefined);
  };

  const dialog = pending && (
    <ConfirmDialog
      danger
      title="Truck restrictions on this route"
      confirmLabel="Assign anyway"
      busy={isLoading}
      onConfirm={acceptAndAssign}
      onCancel={() => setPending(undefined)}
      message={
        <>
          <p style={{ margin: "0 0 8px" }}>This truck's route breaks these limits:</p>
          <ul style={{ margin: "0 0 8px", paddingLeft: 18, color: "var(--color-danger)" }}>
            {groupMessages(pending.violations).map(({ message, count }) => (
              <li key={message}>
                {message}
                {count > 1 && ` (${count} places)`}
              </li>
            ))}
          </ul>
          <p style={{ margin: 0 }}>
            Assign it anyway only if the driver has a permit or another way in has been arranged. Your name is
            recorded on the load and the driver sees these restrictions.
          </p>
          {pending.error && <p style={{ margin: "8px 0 0", color: "var(--color-danger)" }}>{pending.error}</p>}
        </>
      }
    />
  );

  return { assign, dialog, isLoading };
};
