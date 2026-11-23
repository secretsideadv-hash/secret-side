"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "../ui/primitives";

/** Submit button for the unlock form; shows progress while the server action runs. */
export function UnlockButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${buttonClass.primary} flex-1`}>
      {pending ? "Unlocking…" : "Unlock adventure"}
    </button>
  );
}
