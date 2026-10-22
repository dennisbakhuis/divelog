# Shearwater dive data

This page describes the Shearwater data the server reads: the Shearwater Cloud database and the
**PNF** (Petrel Native Format) dive blobs stored in it. The PNF parser
(`divelog_server/importers/shearwater_pnf.py`) is written from this page. It covers the
Petrel family (Perdix, Perdix AI, Perdix 2, Petrel 2/3, Teric, Peregrine, Tern, NERD 2) on
current firmware.

The format knowledge comes from the open-source projects
[libdivecomputer](https://github.com/libdivecomputer/libdivecomputer) and
[Subsurface](https://github.com/subsurface/subsurface), credited in `NOTICE`. The Perdix AI
observations come from 221 real dives (log versions 11 and 13).

## Shearwater Cloud database

Shearwater Cloud (desktop and mobile) keeps its dives in a SQLite file, `dive_data.db`. The
mobile app's *Export account* writes a ZIP with this database and a `SyncReport.txt`.

| Table | Columns used | Notes |
|---|---|---|
| `log_data` | `log_id`, `format`, `file_name`, `data_bytes_1` | One row per dive blob. `format = 'sw-pnf'`. `file_name` looks like `Perdix AI[344FDE85]#674 2026-8-8 7-44-48.swlogzp` |
| `dive_details` | `DiveId` (= `log_id`), `SerialNumber`, `DiveDate` | User-entered fields (site, buddy, notes, GPS, tank pressures) live here and may be empty. `DiveNumber` is **not** the computer's dive number |

`dive_logs` is a decoded header table that may be empty, so everything is read from the blob.

**DiveId.** `log_data.log_id` (= `dive_details.DiveId`) is a string of 18 digits, such as
`723431761786175088`. On all 221 dives it is `72343176 × 10^10` plus the dive's start as epoch
seconds: the computer's local wall clock read as UTC, so the start before any clock correction
(`1786175088` is 2026-08-08 07:44:48, dive #674). The prefix is fixed per computer; how it is
derived from the serial is unknown. The id is identical in the phone and desktop exports. A dive
the computer split into two blobs (458–460) has one `DiveId` per blob. It is not used as the key
because XML and Bluetooth downloads lack it; the importer stores it in `source_ids` and
recognises it (see [Matching dives to the log](#matching-dives-to-the-log)).

**Blob framing.** `data_bytes_1` is a 4-byte little-endian uncompressed length followed by a gzip
stream. The stream may be followed by zero padding (62 of the 221 Perdix AI blobs, some padded to
exactly 8196 bytes), which is ignored; the length prefix matches the decompressed body. A
standalone `.swlogdata` file is the same body, uncompressed and without a prefix. The body is the
PNF record stream below.

## PNF records

If the body starts with `FF FF`, it is the older Predator-style layout. It is not supported and is
rejected.

Otherwise the body is a sequence of **32-byte records**. Byte 0 is the record type. All multi-byte
values are big-endian, and offsets below are from the start of the record.

| Type | Record |
|---|---|
| `0x00` | padding: skip |
| `0x01` | dive sample |
| `0x02` | freedive samples (4 × 8 bytes) |
| `0x10`–`0x19` | opening records 0–9: settings at the start of the dive |
| `0x20`–`0x29` | closing records 0–9: state at the end of the dive |
| `0x30` | info event |
| `0xE1` | extended sample: tank 3/4 pressures (log version ≥ 13) |
| `0xFF` | final record |
| others | not documented (the Perdix AI writes `0x51`, `0x70`–`0x75` and `0x80`–`0x89`): skip |

Opening and closing records 0–4 are always present. Records 5 and up depend on the log version.
When a type appears twice, the first record counts.

### Opening 0 (`0x10`)

| Offset | Size | Field |
|---|---|---|
| 2 | 2 | dive number on the computer |
| 4 | 1 | GF low, % |
| 5 | 1 | GF high, % |
| 8 | 1 | units: 0 metric, 1 imperial |
| 12 | 4 | dive start, seconds since 1970 **in local wall-clock time** (read as UTC, no zone) |
| 20–24 | 5 | O2 % of open-circuit gases 0–4 |
| 25–29 | 5 | O2 % of diluents 0–4 (gases 5–9) |
| 30–31 | 2 | He % of gases 0–1 |

### Opening 1 (`0x11`)

| Offset | Size | Field |
|---|---|---|
| 1–8 | 8 | He % of gases 2–9 |
| 16 | 2 | surface pressure, mbar |
| 18 | 4 | serial number; as 8 hex digits it is the serial shown by Shearwater |

### Opening 2–4

| Record | Offset | Size | Field |
|---|---|---|---|
| `0x12` | 18 | 1 | deco model: 0 ZHL-16C GF, 1 VPM-B, 2 VPM-B/GFS, 3 DCIEM |
| `0x13` | 3 | 2 | water density, kg/m³: 1000 fresh, 1020 EN 13319, 1030 salt |
| `0x14` | 1 | 1 | dive mode (log version ≥ 8): 0 CC/BO, 1 OC Tec, 2 Gauge, 3 PPO2 display, 4 SC/BO, 5 CC/BO 2, 6 OC Rec, 7 Freedive, 12 Avelo |
| `0x14` | 16 | 1 | log version |
| `0x14` | 17 | 2 | enabled gases, bit *i* = gas *i* |

### Opening 5 (`0x15`, log version ≥ 9)

| Offset | Size | Field |
|---|---|---|
| 23 | 2 | sample interval, ms. Without this record the interval is 10 000 ms |
| 26 | 4 | UTC offset in minutes, signed. The Perdix AI writes 0, so it is not used |
| 30 | 1 | daylight saving, hours. Not used |

### Closing 0 (`0x20`)

| Offset | Size | Field |
|---|---|---|
| 4 | 2 | maximum depth × 10, in metres or feet |
| 6 | 3 | dive time, s. Excludes the surface samples logged after the dive |
| 12 | 4 | dive end, same clock as the start |

### Final (`0xFF`)

| Offset | Size | Field |
|---|---|---|
| 2 | 4 | serial number (as opening 1) |
| 13 | 1 | model: 3 Petrel 2, 5 Perdix, 6 Perdix AI, 7 NERD 2, 8 Teric, 9 Peregrine, 10 Petrel 3, 11 Perdix 2, 12 Tern, 13 Peregrine TX, 14 Perdix 3 |

### Dive sample (`0x01`)

| Offset | Size | Field |
|---|---|---|
| 1 | 2 | depth × 10, in metres or feet |
| 3 | 2 | next stop depth, metres or feet; 0 means no stop |
| 5 | 2 | time to surface, minutes |
| 7 | 1 | ppO2 × 100 |
| 8 | 1 | O2 % of the current gas |
| 9 | 1 | He % of the current gas |
| 10 | 1 | no-deco limit in minutes when the stop depth is 0, otherwise the stop time |
| 12 | 1 | status: bit `0x10` set means open circuit. A log with no open-circuit sample is a closed-circuit log and is rejected |
| 14 | 1 | water temperature, °C or °F, signed. For a negative value *t*: `t += 102`, then if `t > 0` set `t = 0` |
| 23 | 1 | CNS % |

The depth, next stop depth and time to surface are 2-byte fields at offsets 1, 3 and 5; the
next stop depth is not ×10.

Sample *k* (counting from 0) is at *k* × interval, so the first sample is at t = 0. On the 221
Perdix AI dives the last sample below 0 m then falls within a few seconds of the closing 0 dive
time. The computer keeps sampling at 0 m after surfacing, for up to the end-dive delay (up to 60
samples). Those trailing surface samples are not part of the dive time in closing 0; the parser
keeps the first of them as the surface point and drops the rest.

A change of (O2, He) between samples, ignoring (0, 0), is a gas switch.

## Units

The units byte in opening 0 applies to depths, stop depths and temperatures:
- feet × 0.3048 = metres;
- (°F − 32) × 5/9 = °C.

## Log version gates

| Log version | Adds |
|---|---|
| 7 | air integration on tanks 1–2 |
| 8 | dive mode in opening 4 |
| 9 | opening 5: sample interval, time zone |
| 11 | stack time (opening 6) |
| 13 | tanks 3–4, `0xE1` samples |
| 17 | GNSS position in `0x19` / `0x29` |

## Split dives

A computer can write one dive number in two blobs when the diver surfaces briefly. The Perdix AI
did this for dives 458–460. The importer merges blobs with the same serial and dive number in
start order:
- a later part's sample times are offset by its start minus the first part's start;
- each join is a surface break `[last t of the earlier part, first t of the next part]`;
- `computer_records` repeats the number once per part, the dive time is the sum of the parts'
  and the end is the last part's.

Two other shapes exist in a log and are importer behaviour, not format facts:
- **One log, several log dives.** The diver can split one computer log into several dives in the
  log (`profile_<n>_1.json`, `profile_<n>_2.json`, …), as for 603, 610 and 614, where short
  surface intervals did not end the dive on the computer. Every one of those dives carries the
  same computer number, so a dive with that number, a date within a day of the computer dive's
  and a profile means the log is already imported. The Cloud import never splits on its own, it only offers the breaks
  (`surface_breaks_of`): runs of samples at 0.3 m or shallower lasting at least 60 s, runs less
  than 180 s apart merged into one break, and only breaks that start 180 s after the first
  sample and end 180 s before the last sample below 0.3 m, so the surface tail never counts. A
  break is suggested when a log dive without this computer's profile starts between a minute
  before it and 10 min after it. With `split=614@1740,614@3970` the import cuts the log there
  (`split_at`): part 1 runs from t = 0 to the first break's first surface sample, each later
  part from the previous break's last surface sample, shifted to t = 0, and each part gets its
  own dive time, depths, temperatures and gas at its start. Each part is matched on its own
  (a `link=614.2:612`, else the nearest dive within 10 min, else a dive with the number, dated
  within a day, and no profile) and becomes its own log dive with its own profile, which keeps
  the dive's `source_ids`.
- **Several computer numbers, one log dive.** The diver can join consecutive computer dives into
  one profile (`computer_records: [13, 14]`), as for 13+14 and 542+543. The later numbers then
  have no profile of their own, but they are already in the log.

## Matching dives to the log

The XML and Cloud imports decide per computer dive whether it is already in the log (`have`),
belongs to a logged dive without its profile (`attach`) or is `new`, in this order:

1. **Cloud id.** A log dive holding a profile whose `source_ids` contains one of the dive's
   `DiveId`s has it. Ids are unique, so neither the number nor the date is checked. The Cloud
   import writes `"source_ids"` right after `"source"` (`"Perdix AI 344FDE85"`): one id per blob,
   in start order; a joined dive lists those of every dive joined, and each part of a split dive
   gets all of the dive's ids. XML and command-line imports write no `source_ids`.
2. **Computer number, near its date.** A log dive whose `computer` list holds the dive number
   matches only when its `date` is within a day of the computer dive's corrected start date. A
   new computer's numbers restart at 1, so a hand-logged dive `computer: [14]` from years ago must
   not take the new computer's #14. With a profile from this computer (its `source` names this
   serial or none) the dive is `have`; a dive without profiles is `attach`. A number on a far
   date is ignored.
3. **Time.** The logged dive on the same date starting nearest to the corrected start, within
   10 min and without a profile from this computer, is `attach`.
4. Anything else is `new`.

The log's profiles are read once per import for their serials and ids.
