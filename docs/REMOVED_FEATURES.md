# Features removed pending verification

This file records tools that shipped in earlier alpha builds and were removed on 2026-09-17, why, and what it takes to bring one back. Nothing here is lost: the git history has the old code. It is not offered to users because it did not meet the bar below.

## The bar for any feature that writes to a control unit

1. **Verified identifiers.** Every DID, routine ID, sub-function and payload layout is confirmed on at least one named vehicle (model, year, module part number) and recorded in the feature's `verified_on` list.
2. **Audited write path.** The feature runs through `pwa/js/writeflow.js` (PWA) or `SafetyEngine.execute_safe_write` (CLI): blacklist, live baseline, ignition and engine interlock, length check, snapshot, positive-response check, read-back verification.
3. **No guessing on the bus.** A feature never tries a list of candidate identifiers until one accepts. If the correct identifier for a platform is unknown, the feature is unavailable on that platform.
4. **Honest failure.** A failed operation says it failed. It never says "command sent, verify manually" for something that was rejected.
5. **Tests.** Unit tests for the protocol layer and a simulator profile that answers the verified identifiers.

## Removed tools

### Service reminder reset (oil / inspection intervals)
Wrote two-byte zeros to cluster identifiers `0x2262`..`0x2265` and executed routines `0x0201`/`0x0202` after guessing them. None were verified. Ran with no ignition or engine interlock and no snapshot.

### 12V battery registration
Tried identifiers `0x0E0C`..`0x0E0F`, then `0x0607`, `0x2A00`, `0x1A02`, `0x002B` on the gateway, then `0x0001` on module `0x61`, writing a guessed payload to whichever accepted. Also attempted SecurityAccess by sending a five-digit login as a two-byte key, which is wrong for UDS and can lock the ECU. The "read" side displayed made-up defaults (capacity, vendor, serial) when nothing was found.

### Electronic parking brake service mode
Sent routines `0x0007`/`0x0008` to module `0x53` at an unverified CAN ID. On failure the UI still told the user the command was sent and to pump the brake before driving. Brake actuation is safety-critical and stays out until it is verified end to end and has its own interlocks (vehicle stationary, wheel speed zero, calipers state read back).

### One-click adaptations (comfort indicators, acoustic lock, start/stop, teardrop wipe)
Wrote single bytes to identifiers `0x0745`, `0x08C6`, `0x091F` on the BCM and `0x003E` on the gateway after the same invalid SecurityAccess attempt. Unverified.

### "True ECU mileage" checker
Decoded identifier `0xF1A5` from the engine ECU with an invented formula and printed "MILEAGE TAMPERING SUSPECTED" when it disagreed with the dashboard. Replaced by a read of the standard SAE J1979 PID `01 A6` only, shown with neutral wording.

## Bringing one back

Open an issue titled `verify: <feature>` with the vehicle, module part number, the exact request/response log from a known-good tool, and what changed on the car. Then implement it behind the audited write path with tests. See CONTRIBUTING.md.
