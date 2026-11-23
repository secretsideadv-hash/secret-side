export type EngineErrorCode =
  | "session_completed"
  | "stop_not_current"
  | "not_arrived"
  | "hint_unavailable"
  | "reveal_unavailable"
  | "invalid_answer"
  | "content_mismatch";

/** Thrown for actions the rules don't allow. Messages are safe to log, never contain answers. */
export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "EngineError";
  }
}
