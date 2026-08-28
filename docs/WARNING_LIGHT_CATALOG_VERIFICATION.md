# Warning-light catalogue verified against the owner's manual

`catalog/kia-rio/warning-lights/index.ts` shipped with an explicit provenance
limit: its 13 entries described the standardised ISO 2575 / ECE R121
tell-tales and had **not** been checked against this car's owner's manual.
This document closes that gap and records what the check found.

**Source**: `YB_2019_es_ES.pdf`, the Kia Rio YB owner's manual in Spanish,
620 pages. It is kept outside the repository on purpose (ADR-009) and is not
redistributed here — what follows are the tell-tale names it lists and the
conclusions drawn from them, not its text.

**Section**: "Testigos indicadores y de advertencia", pages 4-70 to 4-77.

**Method**: the manual uses Type0/Identity-H CID fonts with ToUnicode CMaps,
and this machine has no `pdftotext`, poppler, pypdf, pdfminer or pymupdf. The
text was extracted with a purpose-written pass — object-stream expansion,
`FlateDecode`, per-font ToUnicode mapping, `Tj`/`TJ` operators — run from a
scratch directory. The extractor is not part of the repository; it produced
evidence, not a build artefact.

**Physical-cluster provenance**: high-resolution cluster photograph captured
2026-08-28, ignition on and engine off, at 76066 km, with a later clearer copy
supplied from `5805678457499883578.jpg`. The lamp test confirmed ten existing
catalogue entries — `abs`, `tpms`, `esc-traction`, `power-steering`,
`charging-system`, `oil-pressure`, `brake-system`, `airbag-srs`,
`check-engine`, and `immobilizer` — plus exactly two additions: `esc-off` and
`seatbelt`. Their shapes, `car-with-skid-marks-off` and
`seated-person-with-belt`, are descriptive catalogue identifiers, not Kia
names. `esc-off` is the amber driver-selected system-disabled state; `seatbelt`
is the red belt reminder.

The amber key-shaped lamp at the lower right confirms the already-catalogued
`immobilizer` entry and has no new catalogue entry: it must not be guessed as
GPF or another emissions warning. `(A)` Auto Stop/Start is a status indicator,
not a warning. The amber lamp below ABS is the already catalogued TPMS lamp,
not a second amber `(!)`, and there is no door-ajar lamp. No other lamp is
marked absent: a lamp test does not illuminate every fault-dependent
tell-tale.

The guided identifier was also physically exercised during the last vehicle
trip, according to the owner. `abs`, `seatbelt`, and `immobilizer` each reached
the correct result. No screenshots were captured for that identifier run, so
that part of the physical record is owner-reported rather than image-backed.

## Result

**Manual-backed result:** eleven of the original thirteen entries are confirmed
by the owner's manual. The manual documents a tell-tale for each, and the
catalogue's severity and description are consistent with what it says.

**Physical-cluster result:** the later 2026-08-28 vehicle evidence confirmed ten
existing entries by photograph, added photo-backed `esc-off` and `seatbelt`, and
recorded owner-reported guided-identifier success for `abs`, `seatbelt`, and
`immobilizer` without screenshots. Do not read the manual-backed count as the
full physical closure status.

| Catalogue entry | Manual tell-tale | |
|---|---|---|
| `check-engine` | Testigo indicador de avería (MIL) | confirmed |
| `oil-pressure` | Luz de advertencia de la presión de aceite del motor | confirmed |
| `charging-system` | Testigo de advertencia del sistema de carga | confirmed |
| `brake-system` | Testigo de advertencia del líquido de frenos y del freno de estacionamiento | confirmed |
| `abs` | Testigo de advertencia del sistema de frenos antibloqueo (ABS) | confirmed |
| `airbag-srs` | Testigo de advertencia del airbag | confirmed |
| `power-steering` | Testigo de advertencia de la dirección asistida electrónica (EPS) | confirmed |
| `tpms` | Testigo de advertencia de presión baja de los neumáticos (si está equipado) | confirmed |
| `esc-traction` | Testigo indicador del control electrónico de estabilidad (ESC) (si está equipado) | confirmed |
| `low-fuel` | Testigo de advertencia del nivel bajo de combustible | confirmed |
| `immobilizer` | Testigo indicador del inmovilizador (con y sin llave inteligente) | confirmed |

### Two entries the manual does not support

**`coolant-temperature` is not a tell-tale on this car.** The manual has no
coolant warning lamp in the tell-tale section. It documents an *indicator* —
"Indicador de temperatura del refrigerante del motor", a needle gauge — and
separately an LCD warning *message*, "Motor sobrecalentado", shown above
120 °C. A driver whose engine is overheating sees a needle in the red or a
line of text, not a symbol of the kind the guided flow asks them to match.

**`check-engine-blinking` is not documented.** The manual's MIL section
describes steady illumination only, and says nothing about a blinking state.
The word "parpadea" appears 74 times elsewhere in the manual, so its absence
here is a fact about this section rather than about the vocabulary. A
blinking MIL meaning an active misfire is a real and safety-relevant OBD
convention — it is simply not a claim this manual makes.

Neither entry is deleted. The convention behind the blinking MIL is sound,
and a driver may still meet a thermometer symbol on a variant this manual
does not cover. What changes is the provenance: both are marked as
convention rather than as manual-verified.

### Tell-tales the manual lists and the catalogue does not

The catalogue covered the standardised set. The manual names roughly thirty
tell-tales in total, so the gap is expected — most of the remainder are
lighting and convenience indicators (turn signals, main beam, fog lamps,
cruise control, doors ajar, washer fluid, seat belt) that carry no diagnostic
meaning for a read-only OBD tool.

Three of the absences fell inside this project's declared engine and
emissions scope. **They have since been added**, taking the catalogue from
13 entries to 16:

| Manual tell-tale | Catalogue entry | Why it matters here |
|---|---|---|
| Testigo de advertencia del sistema de escape (GPF) (motor de gasolina) (si está equipado) | `exhaust-gpf`, `exhaust-gpf-blinking` | The gasoline particulate filter is an emissions device; a fault here is exactly what this tool reads |
| Testigo de advertencia del nivel de aceite del motor (si está equipado) | `engine-oil-level` | Distinct from `oil-pressure` — level, not pressure. Two different lamps and two different failures |
| Testigo de advertencia maestro | `master-warning` | The master warning aggregates several conditions; a driver seeing it had no way to look it up here |

The GPF lamp became two entries because the manual gives it two procedures:
steady is cleared by a regeneration drive — over 30 minutes, at least
80 km/h, third gear or higher, 1500-4000 rpm — while blinking after that
drive means the filter needs a workshop. One entry would have given one of
those states the wrong advice.

`engine-oil-level` is `warning` where `oil-pressure` is `critical`, and the
difference is deliberate: low pressure means stop the engine before it
seizes, low level means top it up soon.

`master-warning` names no fault of its own. The manual lists what it stands
in for — TPMS, low engine oil, and the FCA, BCW and HBA assistance systems —
so its advice sends the driver to the LCD message rather than guessing.

## What this does and does not establish

It establishes that the catalogue's names, coverage and severities agree with
Kia's own document for eleven entries, and it names precisely where they do
not.

It does not establish that every manual tell-tale is fitted to this car. The
manual covers the YB generation across trims and markets, and "si está
equipado" appears throughout. The physical lamp test confirms the eleven
entries recorded above, but cannot establish absence for tell-tales that do
not illuminate without their triggering condition.
