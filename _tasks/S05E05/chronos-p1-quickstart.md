# CHRONOS-P1 Quickstart Guide

## Device Overview

CHRONOS-P1 is a pocket time machine for a single operator (40–145 kg). Supported date range: **1500–2499**. For jumps outside this range, use CHRONOS-P2.

- **Power requirement:** 5 MW
- **Batteries:** 2× XLPWR-A; each jump consumes approximately 1/3 of total capacity
- **Safety lock:** The device will not initiate a jump unless all parameters are correctly configured

---

## Parameters

### Manual (physical switches and controls)

| Parameter | Values | Effect |
|---|---|---|
| PT-A | ON / OFF | Enables travel to the past |
| PT-B | ON / OFF | Enables travel to the future |
| PT-A + PT-B (simultaneous) | ON | Opens a stable time tunnel |
| PWR | 0–100 | Protection level; set according to target year (see Protection Levels table) |
| Mode toggle | `standby` / `active` | API configuration requires `standby`; jump requires `active` |
| Activator (pulsing sphere) | press | Initiates the jump; only accessible when `flux density` = 100% |

### Via API (requires `standby` mode)

| Parameter | Description |
|---|---|
| `day`, `month`, `year` | Target date (must be within 1500–2499) |
| `stabilization` | Travel correction factor; the API response body after setting the date includes guidance on what value to use (may be in natural language — interpret accordingly), then set this parameter via API |
| `sync ratio` | Temporal synchronization indicator; calculate using the formula below and pass as a decimal `0.00–1.00` |

### Automatic / read-only (cannot be set manually or via API)

| Parameter | Description |
|---|---|
| `flux density` | Derived from the correctness of all other parameters; must reach `100%` before a jump can be initiated |
| `internalMode` | Auto-cycles every few seconds based on the core rhythm; determines which target year range is currently active |

---

## InternalMode Reference

| internalMode | Supported year range |
|---|---|
| 1 | < 2000 |
| 2 | 2000–2150 |
| 3 | 2151–2300 |
| 4 | 2301–2499 |

`internalMode` cannot be forced. Wait until the device cycles to the mode matching your target year before initiating a jump.

---

## Sync Ratio Calculation

```
sync_ratio_raw = (day × 8 + month × 12 + year × 7) mod 101
```

Pass the result to the API as a two-decimal fraction:

| Raw result | API value |
|---|---|
| 0 | `0.00` |
| 37 | `0.37` |
| 100 | `1.00` |

---

## Recommended Protection Levels (PWR)

| Year | PWR |
|---|---|
| 2024 | 19 |
| 2026 | 28 |
| 2238 | 91 |

---

## Initiating a Jump

Pre-flight checklist:

1. Set **PWR** to the value for the target year
2. Configure target date (`day`, `month`, `year`) via API (device must be in `standby`)
3. Read the `stabilization` guidance from the API response body, then set it via API
4. Calculate and set `sync ratio` via API
5. Switch mode toggle to `active`
6. Confirm: device state = `excellent`, `flux density` = `100%`, pulsing sphere glows green

Press the activator (pulsing sphere at the top of the device).

---

## Time Tunnel vs. Jump

| | Jump | Tunnel |
|---|---|---|
| Battery required | any | ≥ 60% |
| Energy cost | low | high |
| Best for | long stays (hours / days / months) | quick repeated crossings, groups, cargo transport |
| Max recommended open time | — | ~15 minutes |
| Activation | PT-A or PT-B | PT-A + PT-B simultaneously |

**Tunnel "present" reference:** the date of first device programming plus battery insertion.

The tunnel may temporarily close and reopen automatically — this is normal energy-saving behavior, not a fault.

---

## API Usage

- Send JSON requests to the device endpoint (obtain the endpoint address from your time-travel department manager)
- All configuration changes must be made while the device is in `standby` mode
- Send `help` to list available commands and current supported operations
- Send `reset` to recover from unresponsive state or configuration errors
