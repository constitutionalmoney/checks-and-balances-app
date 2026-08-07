---
title: Authentication Accessibility Contract Review
status: Synthetic service-contract review; user interfaces not yet implemented
last_updated: 2026-08-06
issue: 17
---

# Authentication accessibility contract review

Issue #17 establishes service contracts that the participant and committee interfaces must expose
accessibly. This is **not an interface accessibility pass**: the participant and committee screens
belong to issues #20 and #21 and must receive keyboard, screen-reader, zoom/reflow, contrast, error,
and device testing before any pilot.

## Required method choice

Participant authentication must present separately named choices for:

- a platform passkey on the current computer or device;
- a roaming security key, so a smartphone and QR scan are not required;
- a verified-email fallback for sign-in where policy permits; and
- verified-email recovery followed by adding a new passkey.

Committee authentication requires a user-verifying passkey. A roaming security key is the
non-smartphone route. Email can initiate recovery but cannot create a committee session; recovery
suspends access until a different authorized human approves it.

The interface must not depend on colour, motion, camera, QR, biometric capability, or a particular
brand of device. “Passkey” help must explain that a device PIN or external security key may satisfy
the flow and must not imply that biometrics are required or sent to the application.

## Ceremony and error requirements

- Every method is a semantic button with a visible label and programmatic name.
- Focus returns to the method heading after cancellation or failure.
- Challenge expiry and generic authentication failure are announced without exposing whether an
  account exists.
- Countdown information is supplemental; expiry is expressed in text and enforced by the server.
- Recovery instructions identify the next step, alternative route, and support boundary.
- Session/device inventory uses the user-provided device label plus last-used and expiry times;
  revocation controls include the affected label and a confirmation step.
- Consent purposes are separate headings/controls. Optional Verus link, public proof, and disclosure
  choices are off by default and cannot be bundled with required notices.
- Support instructions state that support cannot approve a verification, change evidence results,
  alter attestation status, or impersonate consent.

## Later UI verification gate

Issues #20/#21 must add automated semantic checks plus manual coverage for keyboard-only use,
screen readers, 200% and 400% zoom/reflow, high contrast, reduced motion, authenticator cancellation,
email delay, expired links, lost device, roaming-key use, no-smartphone completion, and committee
recovery review. Until that evidence exists, authentication remains non-operational.
