import { applyTransition } from "./transition.js";

export const NOTIFICATION_STATES = [
  "pending",
  "claimed",
  "delivered",
  "retryable_failed",
  "terminal_failed",
  "dead_letter",
  "cancelled",
] as const;
export type NotificationState = (typeof NOTIFICATION_STATES)[number];

function transition(
  command: string,
  state: NotificationState,
  expected: readonly NotificationState[],
  next: NotificationState,
): NotificationState {
  return applyTransition("notification", command, state, expected, next);
}

export const claimNotification = (state: NotificationState): NotificationState =>
  transition("claimNotification", state, ["pending"], "claimed");
export const recordNotificationDelivery = (state: NotificationState): NotificationState =>
  transition("recordNotificationDelivery", state, ["claimed"], "delivered");
export const recordRetryableNotificationFailure = (state: NotificationState): NotificationState =>
  transition("recordRetryableNotificationFailure", state, ["claimed"], "retryable_failed");
export const retryNotification = (state: NotificationState): NotificationState =>
  transition("retryNotification", state, ["retryable_failed"], "pending");
export const recordTerminalNotificationFailure = (state: NotificationState): NotificationState =>
  transition("recordTerminalNotificationFailure", state, ["claimed"], "terminal_failed");
export const deadLetterNotification = (state: NotificationState): NotificationState =>
  transition("deadLetterNotification", state, ["terminal_failed"], "dead_letter");
export const cancelPendingNotification = (state: NotificationState): NotificationState =>
  transition("cancelPendingNotification", state, ["pending"], "cancelled");
