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

**Blob framing.** `data_bytes_1` is a 4-byte little-endian uncompressed length followed by a gzip
stream. A standalone `.swlogdata` file is the same body, uncompressed and without a prefix. The
body is the PNF record stream below.

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
| others | not documented (the Perdix AI writes `0x51` and `0x70`–`0x75`): skip |

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
| 12 | 1 | status: bit `0x10` set means open circuit |
| 14 | 1 | water temperature, °C or °F, signed. For a negative value *t*: `t += 102`, then if `t > 0` set `t = 0` |
| 23 | 1 | CNS % |

Sample *k* (counting from 1) is at *k* × interval. The computer keeps sampling at 0 m after
surfacing, for up to the end-dive delay. Those trailing surface samples are not part of the dive
time in closing 0.

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
start order, and counts each join as a surface break.
