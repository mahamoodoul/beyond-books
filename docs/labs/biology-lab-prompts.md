# Biology lab prompts

Nine ready-to-use prompts for new Biology labs. None of them is built yet. To build one, copy
its prompt, together with the "Shared requirements" block, into a Claude Code session in this
repo.

## Shared requirements (paste with every prompt)

```text
Build a new lab kind in the existing Labs feature. Follow the pattern of the "respiration",
"orbits" and "tectonics" kinds exactly:

Backend
- New engine in backend/app/modules/labs/engines/<kind>.py: pydantic State / Goal / Palette
  (extra="forbid"), compute(), achieved_now(), message(), and an Engine class with kind, title,
  description, default_goal, default_palette, validate_goal, validate_palette, validate_state,
  evaluate, options, goal_count, summary; register() it.
- Add the kind to ORDER and _load() in backend/app/modules/labs/engines/__init__.py.
- Use the half-up _r() rounding and format floats with :g so messages match the frontend.
- Tests in backend/tests/test_labs_science.py: engine cases, plus the kind added to the
  parametrized API round-trip test.

Frontend
- Port the engine to frontend/src/features/labs/engines/<kind>.ts with identical numbers,
  rounding and message text, plus <kind>.test.ts asserting the same cases as the backend test.
- Board component frontend/src/features/labs/<Name>Lab.tsx: dark bench-style SVG (viewBox
  760x440, className "w-full ... rounded-2xl", role="img", aria-label), a readout panel,
  LabSlider / LabSegment controls (preview while dragging, one undo step on release),
  TaskChips under the board, useLabClock for animation (frozen with reduced motion),
  readOnly support for the teacher view, a "simplified model" note on the board.
- Register it in engines/index.ts (KIND_LABEL, KIND_ICON, TASK_LABELS, emptyState,
  evaluateState), guide.ts (step per task with a numbered hint and a "Why?" detail),
  ScienceBoards.tsx (SCIENCE_KINDS, ScienceBoard branch, NEXT_IDEA, PALETTE_LIST if the
  teacher can narrow a list), and TeacherLabsPage.tsx DEFAULT_TEXT.
- It must work in full screen (Fullscreen.tsx) like the other labs.

Quality
- Student-friendly language: short sentences, the "why" in the detail text.
- Render every view headlessly, look at the screenshots, fix overlaps.
- Run backend ruff, mypy and pytest, frontend tsc, vitest and build. All green before done.
- Add a published sample lab for teacher@gmail.com, and tick the lab in
  docs/FEATURE_CHECKLIST.md section 4b.
- Do not commit unless asked.
```

---

## 1. Heart and circulation (kind: `circulation`)

```text
Build a Biology lab "Heart and circulation" (kind "circulation").

What the student does
- Heart view: a cross-section of the heart with four chambers (right atrium, right ventricle,
  left atrium, left ventricle), four valves, the vena cava, pulmonary artery, pulmonary veins and
  aorta. The heart beats at the chosen heart rate (Auto) or step by step (contract / relax).
  Valves open and close in the right order; blood flows only one way.
- Body loop view: a simple double-circulation diagram (heart, lungs, body). A red blood cell
  travels the full route: body -> right heart -> lungs (turns red, picks up O2) -> left heart
  -> body (turns blue-red, gives O2 to the muscles). "Trace a blood cell" follows one cell with
  numbered stage captions.
- Controls: heart rate (40-200 bpm), stroke volume (40-120 mL), activity (rest, walk, run),
  a "leaky valve" toggle (pick which valve).
- Readouts: cardiac output = heart rate x stroke volume (L/min), oxygen delivered vs needed
  for the activity, a warning when a leaky valve lets blood flow backwards (output drops).

Tasks
- "chambers": click all four chambers to name them
- "route": trace a blood cell through the whole double circulation
- "exercise": keep oxygen delivery up while running by raising heart rate and stroke volume
- "valve": turn on a leaky valve and see the backflow and the drop in output
- "pulse": find a heart rate above 120 bpm and read the cardiac output

Model (educational, state it on the board): cardiac output in L/min; O2 delivered =
output x 0.05 (simplified extraction); needs: rest 0.25, walk 0.9, run 2.2 L/min; a leaky valve
loses 30 % of the stroke volume.

Link it to the breathing lab in the "Why?" texts: lungs load oxygen, the heart delivers it.
```

## 2. Photosynthesis (kind: `photosynthesis`)

```text
Build a Biology lab "Photosynthesis: what makes a plant grow?" (kind "photosynthesis").

What the student does
- A beaker of water with pondweed, a lamp on a track that the student drags closer or further
  away, a CO2 control (add sodium hydrogen carbonate: 0-3 spoonfuls), and a thermometer /
  water-bath temperature (5-45 °C). Oxygen bubbles rise from the weed at the computed rate
  (animated), with a bubble counter per minute.
- A second view: a leaf cell zoom with a chloroplast; light, CO2 and water go in, glucose and
  O2 come out (the word equation, and the symbol equation as an option).
- A small live graph of rate vs the variable the student last changed.

Model (rule-based, limiting factors): light intensity ~ 1 / distance^2 (normalised);
rate = min(light term, CO2 term, temperature term) x 100 bubbles/min, where the temperature
term rises to an optimum at 25-30 °C and falls to 0 by 45 °C (enzymes denature). The message
names the limiting factor right now.

Tasks
- "light": show that moving the lamp closer raises the rate
- "limit": find a setting where more light no longer helps, and name the limiting factor
- "co2": raise the rate by adding CO2
- "temperature": find the best temperature, then show that too hot stops it
- "equation": open the leaf view and complete the word equation (drag the words)
```

## 3. Genetics: Punnett squares (kind: `genetics`)

```text
Build a Biology lab "Genetics: crossing pea plants" (kind "genetics").

What the student does
- Pick a trait (pea colour Y/y yellow dominant, pea shape R/r round dominant, flower colour
  P/p purple dominant; one trait at a time). Choose each parent's genotype with allele tiles
  (YY, Yy, yy).
- The Punnett square fills in with drag-and-drop or "Fill for me". The student first predicts
  the ratio (slider or buttons), then presses "Grow 100 offspring" and sees a field of plants
  appear with the observed counts (seeded random so the server and browser agree for the same
  seed).
- "Breed the next generation" takes two offspring as new parents (F1 x F1 gives 3:1).
- Readouts: genotype ratio, phenotype ratio, predicted vs observed, dominant/recessive labels.

Model: Mendelian single-gene inheritance; observed counts from a deterministic PRNG seeded by
the state's seed field (store the seed in the state so the server reproduces the counts).

Tasks
- "fill": fill a Punnett square correctly
- "predict": predict the ratio of a cross before growing it, within 10 %
- "ratio": produce a 3:1 phenotype ratio (Yy x Yy)
- "carrier": find out whether a yellow parent is YY or Yy with a test cross (x yy)
- "generation": breed an F2 generation from F1 offspring
```

## 4. Enzyme activity (kind: `enzymes`)

```text
Build a Biology lab "Enzymes: the lock and key" (kind "enzymes").

What the student does
- A test tube of starch with amylase. Controls: temperature (0-80 °C), pH (1-13), enzyme
  amount, substrate amount. A timer runs; iodine spot tests on a tile change from blue-black to
  orange as starch is digested. The time to completion is the result.
- Molecule view: enzyme shapes with an active site; substrate molecules fit like a key
  (animated). Above the optimum temperature or at the wrong pH the active site changes shape
  (denatured) and nothing fits.
- A rate graph builds up as the student tests different temperatures or pHs (each run adds a
  point).

Model: rate = enzyme factor x temperature factor x pH factor; temperature factor doubles every
10 °C up to the optimum (37 °C) then drops to 0 by 60 °C; pH factor is a bell curve around the
optimum (amylase pH 7; option: pepsin pH 2).

Tasks
- "optimum_t": find the optimum temperature (plot at least 4 temperatures)
- "denature": show that the enzyme stops working when too hot, and see the active site change
- "optimum_ph": find the optimum pH
- "pepsin": switch to pepsin and show its optimum pH is different
- "amount": show that more enzyme speeds it up
```

## 5. Osmosis and cells (kind: `osmosis`)

```text
Build a Biology lab "Osmosis: cells in salt and water" (kind "osmosis").

What the student does
- Pick a cell (red blood cell, plant cell, potato chip) and drop it into a solution: pure
  water, a matching solution (isotonic), or salty / sugary water (0-10 % concentration slider).
- Animated water molecules cross the partially permeable membrane in the net direction; the
  cell swells, shrinks or stays the same. Red blood cells burst (lysis) in pure water and crinkle
  in salt water; plant cells go turgid or plasmolysed (membrane pulls from the wall), but never
  burst because of the cell wall.
- Potato chip view: mass change % after 30 minutes for each concentration; the student plots
  points and finds where the line crosses 0 (the cell's own concentration).

Model: net water flow ~ (outside concentration - inside concentration); cell volume changes
until balanced or a limit (burst for animal cells, wall for plant cells). Inside concentration:
blood 0.9 %, plant/potato ~ 3 %.

Tasks
- "swell": make an animal cell swell (and burst)
- "shrink": make a cell shrink
- "plant": compare a plant cell and an animal cell in pure water (why the plant cell does not
  burst)
- "balance": find the concentration where the potato's mass does not change
- "explain": in the membrane view, show which way the water moves and why
```

## 6. Food chains and populations (kind: `ecosystem`)

```text
Build a Biology lab "Food chains and populations" (kind "ecosystem").

What the student does
- A meadow with grass, rabbits and foxes (option to add a hawk and mice). The student sets the
  starting numbers, adds or removes a species, adds a drought year or a disease, and runs the
  years (Play, or step a year).
- Animated meadow with icons scaled to the population, plus a line chart of the three
  populations over time.
- Food web view: arrows showing who eats whom (energy flow), and an energy pyramid with about
  10 % passed up each level.

Model: discrete-time predator-prey (Lotka-Volterra style) with carrying capacity for the grass;
yearly steps, deterministic so server and browser agree; clamp at 0 (extinct). Show that it is
simplified.

Tasks
- "cycle": run 20 years and see the predator-prey cycle (fox numbers lag rabbits)
- "remove": remove the foxes and see what happens to the rabbits and the grass
- "collapse": cause a population to collapse
- "pyramid": open the energy pyramid and find how much energy reaches the foxes
- "balance": find starting numbers where all three species survive 30 years
```

## 7. Nerves and the reflex arc (kind: `reflex`)

```text
Build a Biology lab "Nerves: how fast can you react?" (kind "reflex").

What the student does
- Reflex view: a hand touches a hot plate; the student follows the signal step by step:
  receptor -> sensory neurone -> relay neurone in the spinal cord -> motor neurone -> muscle
  (effector). Each part is clickable and named; the impulse is animated along the neurones.
  A synapse zoom shows neurotransmitter crossing the gap.
- Reaction test view: the student does a real ruler-drop style test in the browser (click as
  soon as the screen changes colour), five tries; the board shows their reaction times and the
  average, next to a typical reflex time (~50 ms) to compare reflex vs conscious reaction.
- Nerve speed comparison: myelinated vs unmyelinated neurone race.

Model: path lengths (arm ~0.8 m, spinal cord path) and nerve speeds (myelinated ~100 m/s,
unmyelinated ~1 m/s) give the signal times; synapse delay ~0.5 ms each.

Tasks
- "arc": name all five parts of the reflex arc in order
- "synapse": open the synapse and see how the signal crosses
- "react": do five reaction-time tries
- "compare": compare your reaction time with the reflex time and explain the difference
- "myelin": race a myelinated and an unmyelinated neurone

Store only the reaction times (numbers), never anything else about the student.
```

## 8. Digestive system journey (kind: `digestion`)

```text
Build a Biology lab "The journey of a sandwich" (kind "digestion").

What the student does
- A body outline with the digestive system: mouth, oesophagus, stomach, liver/gall bladder,
  pancreas, small intestine, large intestine. The student moves a bite of food along the tract
  (drag, or "Next stop"), and at each organ sees what happens (chewing, peristalsis, acid,
  enzymes, bile, absorption, water absorption).
- The bite is shown as a stacked bar of starch, protein and fat that breaks down into sugars,
  amino acids, fatty acids and glycerol at the right organs (amylase in mouth and small
  intestine, protease in stomach and small intestine, lipase + bile in small intestine).
- Villus zoom: nutrients cross into the blood capillaries and the lacteal.
- Option: choose the meal (sandwich, steak, chips) to see different mixes.

Model: rule table per organ: which enzymes act, pH, time spent, what is absorbed.

Tasks
- "route": take the food through every organ in order
- "enzymes": match each enzyme to the food it breaks down
- "acid": find where the pH is lowest and why
- "absorb": zoom into a villus and see where nutrients enter the blood
- "bile": show what bile does to fat (emulsifying into droplets)
```

## 9. Cell division: mitosis (kind: `mitosis`)

```text
Build a Biology lab "Cell division: mitosis" (kind "mitosis").

What the student does
- An animal cell with coloured chromosome pairs. The student steps through the phases
  (interphase with DNA copying, prophase, metaphase, anaphase, telophase, cytokinesis), and in
  metaphase drags each chromosome to the middle line; in anaphase pulls the chromatids apart to
  the poles (spindle fibres drawn).
- A microscope view: a tile of onion root tip cells in different phases; the student labels
  cells by phase and counts them to estimate how long each phase lasts.
- A chromosome counter shows 46 -> 92 copies (after copying) -> 46 + 46 in two daughter cells.

Model: rule-based phase checks (all chromosomes on the equator before anaphase, each daughter
gets one chromatid of each). The onion tile is a fixed, seeded set of cells so the count is
checkable.

Tasks
- "copy": copy the DNA in interphase
- "line_up": line up all chromosomes in metaphase
- "separate": separate the chromatids correctly in anaphase
- "daughters": finish with two identical daughter cells (check the counts)
- "microscope": label 10 onion cells by phase
```
