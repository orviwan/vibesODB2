# Agent instructions for vibesODB2

This file is for AI coding agents (Claude Code, Copilot, Cursor, Codex and similar) working in this repository. Humans: see CONTRIBUTING.md, which these rules mirror.

## What this project is

A browser PWA (`pwa/`) and a Python CLI (`vibesodb2/`) that talk UDS over ISO-TP through ELM327-style Bluetooth adapters to read and write long coding on Volkswagen Group control units. Writes change real vehicles. Treat every change to `pwa/js/uds.js`, `pwa/js/safety.js`, `pwa/js/writeflow.js`, `pwa/js/ble.js`, `vibesodb2/uds/`, `vibesodb2/safety/` and `vibesodb2/adapter/` as safety-relevant.

## Hard rules

1. **Test first.** Write a failing test, watch it fail, then implement. JS tests: `tests/js/*.test.mjs` (node:test, run `npm run test:js`). Python: `tests/*.py` (`pytest -q`). Do not write production code in the safety-relevant files without a test that failed first.
2. **One write path.** All ECU writes go through `executeCodingWrite` (PWA) or `SafetyEngine.execute_safe_write` (CLI). Never call `writeDataById` / `write_data_by_id` from UI or feature code.
3. **Re-target after broadcast.** Any `7DF` request leaves the adapter on the functional header. Call `setTargetModule` before further UDS traffic. Never send `2E` on `7DF`.
4. **Verify writes.** Positive response `6E <DID>` plus read-back equality is the only definition of success. Do not return `true` unconditionally anywhere in the protocol layer.
5. **No guessed identifiers, no fake SecurityAccess, no unverified modules.** Do not add DID/routine probing loops. Do not send PINs as key bytes. Modules with `verified: false` in `MODULE_ARBITRATION` stay out of the default scan and out of write paths.
6. **Blacklist is immutable.** `0x03`, `0x15`, `0x44` are never coding-write targets. Do not add brake, airbag or steering actuation features.
7. **Bus lock.** Wrap any new diagnostic operation in the PWA with `app.withBusLock(...)`.
8. **Keep tables in sync.** `MODULE_ARBITRATION` (JS) and `MODULE_REGISTRY` (Python) must match; `tests/test_module_table.py` checks it.
9. **Simulator honesty.** `pwa/js/simulator.js` and `vibesodb2/sim/` must behave like a real bus. Unknown headers address no module. Do not make the simulator lenient to get a test green.
10. **Honest UI.** Never display success for an operation that was not confirmed by the ECU. Never present an unverified decode as fact (see the removed "mileage tampering" tool in `docs/REMOVED_FEATURES.md`).

## Content and legal rules

- Write all descriptive text (feature descriptions, fault-code causes/fixes, docs) in your own words. Never copy from diagnostic tool label files, vendor databases, wikis or forums.
- Every schema feature has `verified_on: []`. Only a human who tested on a car may add entries; agents leave it empty.
- Do not use other companies' product names as names of things in this project. The dashboard tab is "Live Dashboard", not a manufacturer's product name. Refer to adapters as "ELM327-compatible". Keep the README's trademark and disclaimer sections intact.
- Do not add analytics, remote fetches, or external scripts to the PWA. The only remote schema origin is this repository (`vibesodb2/schema/loader.py`).
- Never commit real VINs, registration plates or personal data. Simulator VINs end in `000001`.
- Do not claim vehicle support in docs beyond what the code and `verified_on` data support. Vehicles that need KWP2000 over TP2.0 are not supported for coding; say so.

## Workflow

- Run `npm test` before claiming anything works. It runs syntax checks, JS unit tests, pytest and the headless-Chrome end-to-end test (`scripts/test_pwa_sim.py`, needs Chrome).
- Regenerate screenshots with `npm run screenshots` after UI changes; the files in `docs/images/` are referenced by the README.
- Keep `README.md`, `ADVANCED.md` and `docs/REMOVED_FEATURES.md` accurate to the code. If you remove or add a safety check, update the safety modal text in `pwa/index.html` and both docs in the same change.
- Do not push directly to `main`. Branch, push, open a pull request. The Pages deploy runs from `main` only after tests pass.
- Do not rename the repository, the published URL, or the package name; that is the maintainer's call.
