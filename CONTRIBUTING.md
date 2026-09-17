# Contributing to vibesODB2

Thanks for helping. This tool writes to vehicle control units, so the rules below are strict on purpose.

## 1. Safety rules for code

- **Every write goes through the audited path.** PWA: `executeCodingWrite` in `pwa/js/writeflow.js`. CLI: `SafetyEngine.execute_safe_write` in `vibesodb2/safety/guardrails.py`. Do not call `writeDataById` / `write_data_by_id` from feature code directly.
- **Never write on the functional header.** After any `7DF` broadcast request, re-target the module before UDS traffic. `writeflow.js` does this; keep it that way.
- **Verify, don't assume.** A write succeeds only when the ECU answers `6E <DID>` and the read-back matches. "No response" is a failure.
- **No guessed identifiers on the bus.** Do not loop over candidate DIDs or routines until one accepts. Unknown means unavailable.
- **No fake SecurityAccess.** Do not send login PINs as raw key bytes. If a module needs a seed/key algorithm we do not have, the feature is unavailable on that module.
- **Blacklist stays.** ABS/ESP (`0x03`), airbag (`0x15`) and steering (`0x44`) are never coding-write targets. Brake actuation of any kind is out of scope until it has verified identifiers and its own interlocks.
- **Bus ownership.** Any diagnostic operation in the PWA runs under `app.withBusLock()` so telemetry and the ignition poll cannot interleave with it.
- **Module CAN IDs** live in `pwa/js/uds.js` and must match `vibesodb2/adapter/elm327.py`. `tests/test_module_table.py` enforces this. Add an entry with `verified: false` unless you have confirmed it on a real vehicle.

## 2. Tests come first

The project follows test-driven development. For any bug fix or feature:

1. Write a failing test (`tests/js/*.test.mjs` for the PWA, `tests/*.py` for the CLI).
2. Watch it fail for the right reason.
3. Write the minimal code to pass.
4. Run everything: `npm test` (syntax, JS unit tests, pytest, headless-Chrome end-to-end).

The simulator must behave like a real bus. Do not make the simulator forgiving to make a test pass.

## 3. Content rules (schemas, fault-code text, docs)

- **Original text only.** Feature descriptions, prerequisites, fault-code meanings, causes and fixes must be written in your own words for this project. Do not paste from diagnostic tool label files, vendor databases, wikis, manuals or forum posts. Byte/bit coordinates and code numbers are facts and are fine.
- **Mark verification.** Every feature has a `verified_on` list. Add `"<Make Model Year> (<module part number>)"` only for a coordinate you personally confirmed changes what the description says. Leave it empty otherwise. The UI shows unverified features as such.
- **Regulated behaviour.** Features in the `Daytime Running Lights` and `Exterior Lighting` categories carry a road-legal warning automatically. If you add a category that changes regulated behaviour, extend `isRegulatedFeature` in `pwa/js/schemas.js` and add a test.
- **No trademarks as product names.** Refer to other companies' products only descriptively ("compatible with ELM327-style adapters"), never as the name of something in this project. See the trademark notes in the README.
- **No real identifiers.** Do not commit real VINs, registration plates, or personal data. Simulator and test VINs use the `...000001`-style serial.

## 4. Licence and sign-off

By contributing you agree that your contribution is licensed under the MIT licence in `LICENSE`, and you certify the [Developer Certificate of Origin 1.1](https://developercertificate.org/): that you wrote it or otherwise have the right to submit it. Add `Signed-off-by: Name <email>` to your commits (`git commit -s`).

## 5. Reporting a verified coordinate or fault code

Open an issue titled `verify: <feature or code>` with: vehicle make/model/year, module part number (`0xF187`), the before/after coding hex, what changed on the car, and the tool you cross-checked with (name only, no exported data from it).
