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

## Result

**Eleven of the thirteen entries are confirmed.** The manual documents a
tell-tale for each, and the catalogue's severity and description are
consistent with what it says.

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

The catalogue covers the standardised set. The manual names roughly thirty
tell-tales in total, so the gap is expected — most of the remainder are
lighting and convenience indicators (turn signals, main beam, fog lamps,
cruise control, doors ajar, washer fluid, seat belt) that carry no diagnostic
meaning for a read-only OBD tool.

Three of the absences do fall inside this project's declared engine and
emissions scope:

| Manual tell-tale | Why it matters here |
|---|---|
| Testigo de advertencia del sistema de escape (GPF) (motor de gasolina) (si está equipado) | The gasoline particulate filter is an emissions device; a fault here is exactly what this tool reads |
| Testigo de advertencia del nivel de aceite del motor (si está equipado) | Distinct from `oil-pressure` — level, not pressure. Two different lamps and two different failures |
| Testigo de advertencia maestro | The master warning aggregates several conditions; a driver seeing it has no way to look it up here |

Adding them is open work. It changes what a driver is told about a lit lamp,
which is a content decision rather than a mechanical one, so it is recorded
here rather than taken silently.

## What this does and does not establish

It establishes that the catalogue's names, coverage and severities agree with
Kia's own document for eleven entries, and it names precisely where they do
not.

It does not establish anything about this particular car's instrument
cluster. The manual covers the YB generation across trims and markets, and
"si está equipado" appears throughout. Confirming which lamps this vehicle
physically has still requires looking at it.
