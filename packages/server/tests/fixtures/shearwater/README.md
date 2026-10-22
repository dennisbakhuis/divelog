# Shearwater PNF golden fixtures

Real dive logs from Dennis Bakhuis's own dives on his Perdix AI (serial `344FDE85`), copied
unchanged from the `log_data.data_bytes_1` column of his Shearwater Cloud desktop database
(`dive_data.db`, opened read-only) on 21 October 2026. Each `.swlog` file is one blob: a 4-byte
little-endian length followed by a gzip stream of PNF records (see `docs/SHEARWATER.md`).

| Dive | Why |
|---|---|
| `457.swlog` | the first dive on the computer, log version 11 |
| `458-1.swlog`, `458-2.swlog` | one dive the computer split in two logs at a surface break |
| `64.swlog` | the deepest dive (43.8 m), trimix 21/35 to nitrox 32, deco stops, log version 13 |
| `550.swlog` | a nitrox 32 to oxygen switch with deco stops |
| `674.swlog` | the latest dive, whose clock was 7 hours behind |

`<n>.json` is the expected `ShearwaterDive.profile()` of each dive (both parts merged for 458).
It was generated with the parser and checked by hand: dates, depths in metres, temperatures in
°C, 10-second samples and no surface tail. `test_shearwater_pnf.py` asserts exact equality.
