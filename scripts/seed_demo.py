#!/usr/bin/env python3
"""Seed a RUNNING Edu3D API with demo teachers, students, courses and activity, over real HTTP.

    python scripts/seed_demo.py --base-url http://localhost:8000
    python scripts/seed_demo.py --base-url http://localhost:8000 --password 'MyDemoPass123!'
    python scripts/seed_demo.py --with-ai        # also add short-answer questions (AI marking costs tokens)

What it creates (all synthetic, see docs/demo-data.md):
  * School "Riverside Academy (Demo)" with 2 teachers and 12 students in two classrooms.
  * "Human Body Systems" (Ms Okafor): brain, lungs, heart and whole-body chapters, each with
    lessons, a 3D scene (the anatomy GLBs in packages/demo-assets) + tour animation, and a quiz.
  * "Cells: The Building Blocks of Life" (Mr Reyes): plant cell chapter with a 3D scene and quiz.
  * Student activity with distinct profiles (high achiever ... not started): lessons opened and
    completed, 3D interactions and quiz attempts, so the teacher analytics have something to show.

Idempotent: accounts, the school, classrooms and assets are reused; a course that already
exists (same title, same teacher) is left alone and its student activity is not repeated.
Needs EDU3D_OPEN_REGISTRATION=true (the default) for the demo accounts to be created, and the
GLBs fetched from Git LFS (`git lfs pull`). Standard library only.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "packages" / "three-d-contracts" / "fixtures"
GLB_DIR = ROOT / "packages" / "demo-assets" / "glb"
META_DIR = ROOT / "packages" / "demo-assets" / "metadata"
BOOK_DIR = ROOT / "packages" / "demo-assets" / "books"

# Source textbook per course (OpenStax Concepts of Biology excerpts, CC BY-NC-SA 4.0; see
# packages/demo-assets/books/README.md): file, document title, chapter title -> PDF page range.
BOOKS = {
    "Human Body Systems": (
        "concepts-biology-ch16-body-systems.pdf",
        "Concepts of Biology, Ch. 16: The Body's Systems (OpenStax)",
        {
            "The Brain and Nervous System": (32, 41),  # 16.6 Nervous System
            "Breathing and the Lungs": (14, 20),  # 16.3 Circulatory and Respiratory Systems
            "The Heart and Circulation": (14, 20),
            "Organs Working Together": (3, 7),  # chapter intro + 16.1 Homeostasis
        },
    ),
    "Cells: The Building Blocks of Life": (
        "concepts-biology-ch03-cell-structure.pdf",
        "Concepts of Biology, Ch. 3: Cell Structure and Function (OpenStax)",
        {"Inside a Plant Cell": (8, 22)},  # 3.3 Eukaryotic Cells, 3.4 The Cell Membrane
    ),
}

DOMAIN = "demo.example.org"
SCHOOL = {"name": "Riverside Academy (Demo)", "slug": "riverside-academy-demo"}
TEACHERS = [
    {"key": "okafor", "name": "Ms Amara Okafor", "email": f"amara.okafor@{DOMAIN}"},
    {"key": "reyes", "name": "Mr Daniel Reyes", "email": f"daniel.reyes@{DOMAIN}"},
]
# profile: how much of the course a student has done and how well they answer
# (share of lessons completed, chance of a correct MCQ answer, retake a failed quiz?)
PROFILES = {
    "high": (1.0, 0.95, False),
    "steady": (0.85, 0.75, True),
    "average": (0.6, 0.6, True),
    "struggling": (0.45, 0.35, True),
    "starting": (0.15, 0.55, False),
    "inactive": (0.0, 0.0, False),
}
STUDENTS = [
    # name, classroom, profile
    ("Aisha Rahman", "a", "high"),
    ("Ben Carter", "a", "average"),
    ("Chloe Nguyen", "a", "steady"),
    ("Diego Alvarez", "a", "struggling"),
    ("Emma Schmidt", "a", "high"),
    ("Farhan Hossain", "a", "starting"),
    ("Grace Mensah", "b", "steady"),
    ("Hiro Tanaka", "b", "average"),
    ("Isla MacLeod", "b", "high"),
    ("Jamal Brooks", "b", "struggling"),
    ("Keira Walsh", "b", "average"),
    ("Liam O'Connor", "b", "inactive"),
]
CLASSROOMS = {
    "a": {"name": "Year 8 Biology – Set A", "academic_year": "2026-27"},
    "b": {"name": "Year 8 Biology – Set B", "academic_year": "2026-27"},
}
# asset_id in packages/demo-assets -> library name
ASSETS = {
    "human_brain_v1": "Human brain (detailed)",
    "human_lungs_v1": "Human lungs (detailed)",
    "human_heart_v2": "Human heart (detailed)",
    "human_body_v1": "Human body with organs",
    "plant_cell_v2": "Plant cell (detailed, cutaway)",
    "dna_replication_v1": "DNA replication fork (detailed)",
    "car_engine_v1": "Four-stroke car engine (cutaway)",
}


def email_for(name: str) -> str:
    first, *rest = name.lower().replace("'", "").split()
    return f"{first}.{rest[-1] if rest else 'student'}@{DOMAIN}"


def md(*paras: str) -> str:
    return "\n\n".join(paras)


def mcq(
    key: str, text: str, options: list[str], correct: int, why: str, difficulty: str = "medium"
) -> dict[str, Any]:
    return {
        "key": key,
        "question_type": "mcq",
        "question_text": text,
        "difficulty": difficulty,
        "explanation_correct": why,
        "options": [
            {"key": "abcdef"[i], "text": t, "is_correct": i == correct}
            for i, t in enumerate(options)
        ],
    }


def short(key: str, text: str, model: str, rubric: list[tuple[str, float]]) -> dict[str, Any]:
    return {
        "key": key,
        "question_type": "short_answer",
        "question_text": text,
        "points": sum(p for _, p in rubric),
        "model_answer": model,
        "rubric": [{"description": d, "points": p} for d, p in rubric],
    }


# --------------------------------------------------------------------------- course content

HUMAN_BODY = {
    "teacher": "okafor",
    "classrooms": ["a", "b"],
    "course": {
        "title": "Human Body Systems",
        "description": "How the brain, lungs and heart keep us alive, explored with interactive 3D models.",
        "subject": "Biology",
        "grade_level": "Year 8",
    },
    "chapters": [
        {
            "title": "The Brain and Nervous System",
            "description": "The parts of the brain and what each one controls.",
            "objectives": [
                "Name the four lobes of the cerebrum and describe one job of each.",
                "Explain the roles of the cerebellum and the brainstem.",
            ],
            "lessons": [
                (
                    "Parts of the brain",
                    [
                        (
                            "The cerebrum",
                            md(
                                "The **cerebrum** is the largest part of the brain. Its wrinkled surface, the "
                                "**cortex**, is folded into ridges (gyri) and grooves (sulci), which lets a large "
                                "area fit inside the skull.",
                                "A deep groove divides the cerebrum into left and right **hemispheres**. Each "
                                "hemisphere mostly controls the opposite side of the body.",
                            ),
                            ["cerebrum", "cortex", "hemisphere"],
                        ),
                        (
                            "The four lobes",
                            md(
                                "- **Frontal lobe** – planning, decisions, voluntary movement and speech.",
                                "- **Parietal lobe** – touch, temperature, pain and body position.",
                                "- **Temporal lobe** – hearing, understanding language and memory.",
                                "- **Occipital lobe** – vision.",
                                "Open the 3D model and use **Explode** to separate the lobes.",
                            ),
                            ["frontal lobe", "parietal lobe", "temporal lobe", "occipital lobe"],
                        ),
                    ],
                    "scene_brain_01",
                ),
                (
                    "Cerebellum and brainstem",
                    [
                        (
                            "The cerebellum",
                            md(
                                "The **cerebellum** sits under the back of the cerebrum. It coordinates "
                                "movement and balance, so that actions like walking or catching a ball are "
                                "smooth and accurate."
                            ),
                            ["cerebellum"],
                        ),
                        (
                            "The brainstem",
                            md(
                                "The **brainstem** connects the brain to the spinal cord. It controls automatic "
                                "functions you never think about: breathing, heart rate and swallowing."
                            ),
                            ["brainstem", "spinal cord"],
                        ),
                    ],
                    None,
                ),
            ],
            "quiz": (
                "Brain quiz",
                [
                    mcq(
                        "q1",
                        "Which lobe mainly processes vision?",
                        ["Frontal", "Temporal", "Occipital", "Parietal"],
                        2,
                        "The occipital lobe at the back of the brain is the visual centre.",
                    ),
                    mcq(
                        "q2",
                        "Which part of the brain coordinates balance and smooth movement?",
                        ["Cerebellum", "Brainstem", "Frontal lobe", "Temporal lobe"],
                        0,
                        "The cerebellum fine-tunes movement and balance.",
                        "easy",
                    ),
                    mcq(
                        "q3",
                        "Breathing and heart rate are controlled automatically by the…",
                        ["Parietal lobe", "Brainstem", "Occipital lobe", "Cortex"],
                        1,
                        "The brainstem runs automatic, life-sustaining functions.",
                    ),
                    mcq(
                        "q4",
                        "Why is the surface of the cerebrum folded?",
                        [
                            "To make it lighter",
                            "To fit a large surface area inside the skull",
                            "To store blood",
                            "To protect the brainstem",
                        ],
                        1,
                        "Folding packs a large cortex into a small space.",
                        "hard",
                    ),
                ],
                short(
                    "q5",
                    "Describe what the frontal lobe does.",
                    "It plans and makes decisions, controls voluntary movement and helps produce speech.",
                    [
                        ("Mentions planning or decision-making", 1),
                        ("Mentions movement or speech", 1),
                    ],
                ),
            ),
        },
        {
            "title": "Breathing and the Lungs",
            "description": "How air travels into the lungs and how gas exchange happens.",
            "objectives": [
                "Describe the path of air from the trachea to the alveoli.",
                "Explain how the diaphragm makes us breathe in.",
            ],
            "lessons": [
                (
                    "The airways",
                    [
                        (
                            "From nose to lungs",
                            md(
                                "Air passes through the **larynx** (voice box) into the **trachea**. Rings of "
                                "cartilage keep the trachea open.",
                                "The trachea splits into two **bronchi**, one for each lung. These branch again "
                                "and again into tiny **bronchioles** that end in air sacs called **alveoli**.",
                            ),
                            ["trachea", "bronchi", "alveoli"],
                        ),
                        (
                            "Lobes of the lungs",
                            md(
                                "The right lung has **three lobes**; the left has **two**, leaving room for the "
                                "heart. In the 3D model, fade the lobes to see the bronchial tree inside."
                            ),
                            ["lobe"],
                        ),
                    ],
                    "scene_lungs_01",
                ),
                (
                    "Breathing and gas exchange",
                    [
                        (
                            "Breathing in and out",
                            md(
                                "When you breathe in, the **diaphragm** contracts and flattens and the ribs move "
                                "up and out. The chest gets bigger, pressure falls, and air flows in.",
                                "When you breathe out, the diaphragm relaxes back into a dome and air is pushed out.",
                            ),
                            ["diaphragm", "inhalation", "exhalation"],
                        ),
                        (
                            "Gas exchange",
                            md(
                                "In the alveoli, **oxygen** diffuses into the blood and **carbon dioxide** "
                                "diffuses out to be breathed away. Alveoli have thin walls and a huge surface "
                                "area, which makes this fast."
                            ),
                            ["diffusion", "oxygen", "carbon dioxide"],
                        ),
                    ],
                    None,
                ),
            ],
            "quiz": (
                "Lungs quiz",
                [
                    mcq(
                        "q1",
                        "What keeps the trachea open?",
                        ["Muscle", "Rings of cartilage", "Bone", "Fat"],
                        1,
                        "C-shaped cartilage rings stop the trachea collapsing.",
                        "easy",
                    ),
                    mcq(
                        "q2",
                        "How many lobes does the left lung have?",
                        ["One", "Two", "Three", "Four"],
                        1,
                        "The left lung has two lobes, leaving space for the heart.",
                    ),
                    mcq(
                        "q3",
                        "What happens to the diaphragm when you breathe in?",
                        [
                            "It relaxes and domes upwards",
                            "It contracts and flattens",
                            "It stays still",
                            "It moves the heart",
                        ],
                        1,
                        "Contracting flattens the diaphragm and enlarges the chest.",
                    ),
                    mcq(
                        "q4",
                        "Where does gas exchange take place?",
                        ["Trachea", "Bronchi", "Alveoli", "Larynx"],
                        2,
                        "Alveoli have thin walls and a large surface area for diffusion.",
                    ),
                ],
                short(
                    "q5",
                    "Explain why alveoli are good at gas exchange.",
                    "They have very thin walls, a huge surface area and a good blood supply, so gases diffuse quickly.",
                    [("Thin walls or short diffusion distance", 1), ("Large surface area", 1)],
                ),
            ),
        },
        {
            "title": "The Heart and Circulation",
            "description": "The four chambers of the heart and the double circulation.",
            "objectives": [
                "Name the four chambers of the heart and the main blood vessels.",
                "Trace the path of blood through the heart, lungs and body.",
            ],
            "lessons": [
                (
                    "Inside the heart",
                    [
                        (
                            "Four chambers",
                            md(
                                "The heart has two **atria** at the top, which receive blood, and two "
                                "**ventricles** below, which pump it out.",
                                "The **left ventricle** has the thickest wall because it pumps blood all around "
                                "the body.",
                            ),
                            ["atrium", "ventricle"],
                        ),
                        (
                            "Blood vessels of the heart",
                            md(
                                "- **Venae cavae** bring deoxygenated blood from the body to the right atrium.",
                                "- The **pulmonary trunk** carries it to the lungs.",
                                "- **Pulmonary veins** return oxygenated blood to the left atrium.",
                                "- The **aorta** carries it to the body.",
                                "The **coronary arteries** on the heart's surface supply the heart muscle itself.",
                            ),
                            ["aorta", "vena cava", "coronary artery"],
                        ),
                    ],
                    "scene_heart_03",
                ),
                (
                    "Double circulation",
                    [
                        (
                            "Two loops",
                            md(
                                "Blood passes through the heart **twice** on each trip around the body: once to "
                                "collect oxygen from the lungs, and once to deliver it to the body. Press **Play** "
                                "on the 3D tour to follow it."
                            ),
                            ["double circulation"],
                        ),
                    ],
                    None,
                ),
            ],
            "quiz": (
                "Heart quiz",
                [
                    mcq(
                        "q1",
                        "Which chamber has the thickest muscular wall?",
                        ["Right atrium", "Left atrium", "Right ventricle", "Left ventricle"],
                        3,
                        "The left ventricle pumps blood to the whole body.",
                        "easy",
                    ),
                    mcq(
                        "q2",
                        "Which vessel carries blood from the heart to the lungs?",
                        ["Aorta", "Pulmonary trunk", "Pulmonary vein", "Vena cava"],
                        1,
                        "The pulmonary trunk carries deoxygenated blood to the lungs.",
                    ),
                    mcq(
                        "q3",
                        "Blood returning from the lungs enters the…",
                        ["Left atrium", "Right atrium", "Right ventricle", "Aorta"],
                        0,
                        "Pulmonary veins empty into the left atrium.",
                    ),
                    mcq(
                        "q4",
                        "What do the coronary arteries supply?",
                        ["The lungs", "The brain", "The heart muscle", "The liver"],
                        2,
                        "Coronary arteries feed the heart muscle itself.",
                        "hard",
                    ),
                ],
                short(
                    "q5",
                    "Why is human circulation called a double circulation?",
                    "Blood passes through the heart twice per circuit: heart to lungs and back, then heart to body and back.",
                    [("Passes through the heart twice", 1), ("Names the lung and body loops", 1)],
                ),
            ),
        },
        {
            "title": "Organs Working Together",
            "description": "Where the major organs sit in the body and how they depend on each other.",
            "objectives": [
                "Locate the brain, lungs and heart in the body and explain how they work together."
            ],
            "lessons": [
                (
                    "Organs in the body",
                    [
                        (
                            "Where the organs are",
                            md(
                                "The **brain** is protected by the skull. The **lungs** fill most of the chest, "
                                "and the **heart** sits between them, slightly to the left.",
                                "In the 3D model the skin is see-through. Use **Explode** to lift the organs out.",
                            ),
                            ["skull", "thorax"],
                        ),
                        (
                            "Working together",
                            md(
                                "The lungs load the blood with oxygen, the heart pumps it, and the brain controls "
                                "the rate of both breathing and the heartbeat. Exercise shows this teamwork: your "
                                "brain speeds up your breathing and heart rate together."
                            ),
                            ["organ system"],
                        ),
                    ],
                    "scene_body_01",
                ),
            ],
            "quiz": (
                "Organs quiz",
                [
                    mcq(
                        "q1",
                        "Which organ sits between the lungs, slightly to the left?",
                        ["Liver", "Heart", "Stomach", "Brain"],
                        1,
                        "The heart lies in the middle of the chest, tilted to the left.",
                        "easy",
                    ),
                    mcq(
                        "q2",
                        "Which organ controls breathing rate and heart rate?",
                        ["Brain", "Lungs", "Heart", "Diaphragm"],
                        0,
                        "The brainstem adjusts breathing and heart rate.",
                    ),
                    mcq(
                        "q3",
                        "During exercise, what happens to breathing and heart rate?",
                        [
                            "Both slow down",
                            "Both speed up",
                            "Only breathing speeds up",
                            "Nothing changes",
                        ],
                        1,
                        "Muscles need more oxygen, so both increase.",
                    ),
                ],
                None,
            ),
        },
    ],
}

CELLS = {
    "teacher": "reyes",
    "classrooms": ["b"],
    "course": {
        "title": "Cells: The Building Blocks of Life",
        "description": "Plant cell structure explored with a detailed, explodable 3D cell.",
        "subject": "Biology",
        "grade_level": "Year 8",
    },
    "chapters": [
        {
            "title": "Inside a Plant Cell",
            "description": "Organelles and what they do.",
            "objectives": [
                "Identify the main organelles of a plant cell.",
                "Describe the function of the nucleus, chloroplasts, mitochondria and vacuole.",
            ],
            "lessons": [
                (
                    "Organelles",
                    [
                        (
                            "Outside layers",
                            md(
                                "Plant cells have a rigid **cell wall** made of cellulose, which supports the "
                                "cell. Just inside it, the **cell membrane** controls what enters and leaves."
                            ),
                            ["cell wall", "cell membrane"],
                        ),
                        (
                            "Inside the cell",
                            md(
                                "- The **nucleus** contains DNA and controls the cell.",
                                "- **Chloroplasts** carry out photosynthesis.",
                                "- **Mitochondria** release energy by respiration.",
                                "- The large **central vacuole** stores cell sap and keeps the cell firm.",
                                "Explode the 3D cell to see each organelle on its own.",
                            ),
                            ["nucleus", "chloroplast", "mitochondria", "vacuole"],
                        ),
                    ],
                    "scene_plant_cell_02",
                ),
            ],
            "quiz": (
                "Plant cell quiz",
                [
                    mcq(
                        "q1",
                        "Which organelle carries out photosynthesis?",
                        ["Mitochondrion", "Chloroplast", "Nucleus", "Vacuole"],
                        1,
                        "Chloroplasts contain chlorophyll and make glucose.",
                        "easy",
                    ),
                    mcq(
                        "q2",
                        "What is the cell wall made of?",
                        ["Protein", "Cellulose", "Fat", "Starch"],
                        1,
                        "Plant cell walls are made of cellulose.",
                    ),
                    mcq(
                        "q3",
                        "Where is most of the cell's DNA?",
                        ["Nucleus", "Ribosome", "Cell wall", "Vacuole"],
                        0,
                        "DNA is kept in the nucleus.",
                    ),
                    mcq(
                        "q4",
                        "Which structure is found in plant cells but NOT animal cells?",
                        ["Cell membrane", "Mitochondria", "Cell wall", "Nucleus"],
                        2,
                        "Animal cells have no cell wall.",
                        "hard",
                    ),
                ],
                None,
            ),
        },
    ],
}

DNA = {
    "teacher": "reyes",
    "classrooms": ["b"],
    "course": {
        "title": "DNA: Copying the Code of Life",
        "description": "How DNA is built and copied, explored with a detailed 3D replication fork.",
        "subject": "Biology",
        "grade_level": "Year 8",
    },
    "chapters": [
        {
            "title": "DNA Replication",
            "description": "The structure of DNA and the enzymes that copy it.",
            "objectives": [
                "Describe DNA as a double helix of nucleotides joined by complementary base pairs.",
                "Explain the roles of helicase, primase and DNA polymerase in replication.",
                "Distinguish the leading strand from the lagging strand.",
            ],
            "lessons": [
                (
                    "The replication fork",
                    [
                        (
                            "The double helix",
                            md(
                                "DNA is two strands twisted into a **double helix**. Each strand has a "
                                "backbone of **sugar** (deoxyribose) and **phosphate** groups.",
                                "The **bases** pair across the middle: **A with T** (two hydrogen "
                                "bonds) and **G with C** (three hydrogen bonds).",
                            ),
                            ["double helix", "nucleotide", "base pair", "hydrogen bond"],
                        ),
                        (
                            "Unzipping and copying",
                            md(
                                "- **Helicase** unzips the helix by breaking the hydrogen bonds.",
                                "- **Primase** lays down a short RNA **primer** to start each new strand.",
                                "- **DNA polymerase** adds matching nucleotides to build the new strand.",
                                "- The **leading strand** is copied continuously; the **lagging strand** "
                                "is made in short **Okazaki fragments**.",
                                "Use the guided tour to follow each enzyme along the fork.",
                            ),
                            ["helicase", "primase", "DNA polymerase", "Okazaki fragment"],
                        ),
                    ],
                    "scene_dna_replication_01",
                ),
            ],
            "quiz": (
                "DNA replication quiz",
                [
                    mcq(
                        "q1",
                        "Which base pairs with adenine (A)?",
                        ["Guanine", "Cytosine", "Thymine", "Uracil"],
                        2,
                        "A always pairs with T in DNA.",
                        "easy",
                    ),
                    mcq(
                        "q2",
                        "Which enzyme unzips the DNA double helix?",
                        ["DNA polymerase", "Helicase", "Primase", "Ligase"],
                        1,
                        "Helicase breaks the hydrogen bonds between base pairs.",
                    ),
                    mcq(
                        "q3",
                        "What are Okazaki fragments?",
                        [
                            "Pieces of the lagging strand",
                            "Broken hydrogen bonds",
                            "RNA primers",
                            "Parts of the sugar-phosphate backbone",
                        ],
                        0,
                        "The lagging strand is built in short pieces called Okazaki fragments.",
                    ),
                    mcq(
                        "q4",
                        "Why is a G–C pair held together more strongly than an A–T pair?",
                        [
                            "It has three hydrogen bonds instead of two",
                            "G and C are larger molecules",
                            "It is bonded to more phosphates",
                            "It contains uracil",
                        ],
                        0,
                        "G–C pairs form three hydrogen bonds; A–T pairs form two.",
                        "hard",
                    ),
                ],
                None,
            ),
        },
    ],
}

ENGINE = {
    "teacher": "okafor",
    "classrooms": ["a"],
    "course": {
        "title": "How Engines Work",
        "description": "Energy transfer in a four-stroke petrol engine, explored with a 3D cutaway.",
        "subject": "Physics",
        "grade_level": "Year 8",
    },
    "chapters": [
        {
            "title": "The Four-Stroke Engine",
            "description": "The parts of a car engine and the four-stroke cycle.",
            "objectives": [
                "Name the main parts of a four-stroke engine.",
                "Describe the intake, compression, power and exhaust strokes in order.",
                "Explain how chemical energy in fuel becomes kinetic energy of the crankshaft.",
            ],
            "lessons": [
                (
                    "Inside the engine",
                    [
                        (
                            "The moving parts",
                            md(
                                "Fuel burns inside the **cylinders** of the engine block. The expanding gas "
                                "pushes a **piston** down; the **connecting rod** turns the **crankshaft**, "
                                "changing up-and-down motion into rotation.",
                                "The **camshafts**, driven by the **timing belt**, open the **valves** at "
                                "the right moment in each cycle.",
                            ),
                            ["piston", "connecting rod", "crankshaft", "valve", "camshaft"],
                        ),
                        (
                            "The four strokes",
                            md(
                                "1. **Intake** – the piston moves down and draws in air and fuel.",
                                "2. **Compression** – the piston moves up and squeezes the mixture.",
                                "3. **Power** – the **spark plug** ignites the mixture and the hot gas "
                                "forces the piston down.",
                                "4. **Exhaust** – the piston moves up and pushes the burnt gases out.",
                                "Play the four-stroke animation to watch each stage.",
                            ),
                            ["intake", "compression", "power stroke", "exhaust", "spark plug"],
                        ),
                    ],
                    "scene_car_engine_01",
                ),
            ],
            "quiz": (
                "Four-stroke engine quiz",
                [
                    mcq(
                        "q1",
                        "In which stroke does the fuel–air mixture ignite?",
                        ["Intake", "Compression", "Power", "Exhaust"],
                        2,
                        "The spark plug fires at the start of the power stroke.",
                        "easy",
                    ),
                    mcq(
                        "q2",
                        "What does the crankshaft do?",
                        [
                            "Opens the valves",
                            "Turns the pistons' up-and-down motion into rotation",
                            "Sprays fuel into the cylinder",
                            "Cools the engine",
                        ],
                        1,
                        "The connecting rods turn the crankshaft, which converts linear motion to rotation.",
                    ),
                    mcq(
                        "q3",
                        "What is the correct order of the four strokes?",
                        [
                            "Intake, compression, power, exhaust",
                            "Compression, intake, exhaust, power",
                            "Power, intake, compression, exhaust",
                            "Intake, power, compression, exhaust",
                        ],
                        0,
                        "Intake, compression, power, exhaust – then the cycle repeats.",
                    ),
                    mcq(
                        "q4",
                        "Which energy transfer happens in the power stroke?",
                        [
                            "Kinetic to chemical",
                            "Chemical to thermal and kinetic",
                            "Electrical to chemical",
                            "Thermal to chemical",
                        ],
                        1,
                        "Burning fuel releases chemical energy as heat, and the expanding gas moves the piston.",
                        "hard",
                    ),
                ],
                None,
            ),
        },
    ],
}

COURSES = [HUMAN_BODY, CELLS, DNA, ENGINE]
SCENE_ASSET = {  # fixture scene -> asset it renders
    "scene_brain_01": "human_brain_v1",
    "scene_lungs_01": "human_lungs_v1",
    "scene_heart_03": "human_heart_v2",
    "scene_body_01": "human_body_v1",
    "scene_plant_cell_02": "plant_cell_v2",
    "scene_dna_replication_01": "dna_replication_v1",
    "scene_car_engine_01": "car_engine_v1",
}

# --------------------------------------------------------------------------- HTTP


class ApiError(Exception):
    def __init__(self, status: int, method: str, path: str, raw: bytes) -> None:
        super().__init__(f"{method} {path} -> {status}: {raw[:400]!r}")
        self.status = status


class Client:
    def __init__(self, base: str) -> None:
        self.root = base.rstrip("/")
        self.base = self.root + "/api/v1"
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

    def call(
        self, method: str, path: str, body: Any = None, expect: tuple[int, ...] = (200, 201)
    ) -> Any:
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(
            self.base + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json", "X-Requested-With": "edu3d"},
        )
        try:
            with self.opener.open(req, timeout=300) as r:
                status, raw = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, raw = e.code, e.read()
        if status not in expect:
            raise ApiError(status, method, path, raw)
        return json.loads(raw) if raw else None

    def put_bytes(self, url: str, data: bytes, headers: dict[str, str]) -> None:
        full = url if url.startswith("http") else self.root + url
        if full.startswith(self.root):  # API-served upload (local storage): needs the CSRF header
            headers = {**headers, "X-Requested-With": "edu3d"}
        req = urllib.request.Request(full, data=data, method="PUT", headers=headers)
        with self.opener.open(req, timeout=600) as r:
            if r.status not in (200, 201, 204):
                raise RuntimeError(f"upload failed: {r.status}")


def log(msg: str) -> None:
    print(msg, flush=True)


# --------------------------------------------------------------------------- steps


def account(
    base: str, name: str, email: str, kind: str, password: str
) -> tuple[Client, dict[str, Any]]:
    c = Client(base)
    try:
        c.call(
            "POST",
            "/auth/register",
            {"email": email, "password": password, "display_name": name, "account_type": kind},
            (201,),
        )
        created = True
    except ApiError as e:
        if e.status != 409:
            raise
        created = False
    try:
        c.call("POST", "/auth/login", {"email": email, "password": password})
    except ApiError as e:
        if e.status == 401:
            sys.exit(
                f"{email} already exists with a different password; pass --password or remove it."
            )
        raise
    me = c.call("GET", "/users/me")
    if me.get("account_type") != kind:
        sys.exit(f"{email} exists but is a {me.get('account_type')}, not a {kind}.")
    log(f"  {'created' if created else 'reused '} {kind:7} {email}")
    return c, me


def ensure_school(admin: Client) -> dict[str, Any]:
    for s in admin.call("GET", "/schools"):
        if s["slug"] == SCHOOL["slug"]:
            return s
    return admin.call("POST", "/schools", SCHOOL, (201,))


def ensure_member(admin: Client, path: str, email: str, role: str) -> None:
    members = admin.call("GET", path)
    if any(
        m["user"]["email"].lower() == email.lower()
        for m in members
        if "user" in m and m["user"].get("email")
    ):
        return
    try:
        admin.call("POST", path, {"email": email, "role": role}, (200, 201))
    except ApiError as e:
        if e.status != 409:
            raise


def ensure_classrooms(admin: Client, school_id: str) -> dict[str, dict[str, Any]]:
    existing = {c["name"]: c for c in admin.call("GET", f"/schools/{school_id}/classrooms")}
    out = {}
    for key, spec in CLASSROOMS.items():
        out[key] = existing.get(spec["name"]) or admin.call(
            "POST", "/classrooms", {"school_id": school_id, **spec}, (201,)
        )
    return out


def ensure_assets(owner: Client, school_id: str) -> dict[str, dict[str, Any]]:
    """Upload each demo GLB as a school asset (visible to every teacher in the school) and approve it."""
    mine = {a["name"]: a for a in owner.call("GET", "/assets")}
    out = {}
    for asset_id, name in ASSETS.items():
        a = mine.get(name)
        if a and a["review_status"] == "approved" and a["latest_version"] > 0:
            out[asset_id] = a
            log(f"  reused  asset   {name} ({a['slug']})")
            continue
        glb = GLB_DIR / f"{asset_id}.glb"
        data = glb.read_bytes()
        if data.startswith(b"version https://git-lfs"):
            sys.exit(f"{glb} is a Git LFS pointer; run `git lfs pull` first.")
        meta = json.loads((META_DIR / f"{asset_id}.json").read_text())
        if not a:
            a = owner.call(
                "POST",
                "/assets",
                {
                    "name": name,
                    "description": meta.get("description", ""),
                    "category": meta.get("category"),
                    "subject": meta.get("subject"),
                    "license_name": meta.get("license", {}).get("spdx", "CC0-1.0"),
                    "attribution_text": meta.get("license", {}).get("source", ""),
                    "school_id": school_id,
                },
                (201,),
            )
        if a["latest_version"] == 0:
            up = owner.call(
                "POST", f"/assets/{a['id']}/versions/upload-url", {"size_bytes": len(data)}
            )
            owner.put_bytes(
                up["url"], data, up.get("headers") or {"Content-Type": "model/gltf-binary"}
            )
            owner.call("POST", f"/assets/{a['id']}/versions/{up['version_number']}/complete")
        a = owner.call(
            "POST",
            f"/assets/{a['id']}/review",
            {"decision": "approved", "notes": "Demo asset (draft, unreviewed content)."},
        )
        out[asset_id] = a
        log(f"  created asset   {name} ({len(data) / 1e6:.1f} MB, {a['slug']})")
    return out


def scene_spec(fixture: str, asset: dict[str, Any]) -> dict[str, Any]:
    spec = json.loads((FIXTURES / f"{fixture}.json").read_text())
    spec["asset_refs"] = [{"asset_id": asset["slug"], "version": asset["latest_version"]}]
    return spec


def animation_specs(spec: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for anim_id in spec.get("animation_refs", []):
        f = FIXTURES / f"animation_{anim_id}.json"
        if f.exists():
            out.append(json.loads(f.read_text()))
    return out


def wait_job(c: Client, job_id: str, timeout_s: int = 300) -> dict[str, Any]:
    for _ in range(timeout_s // 2):
        job: dict[str, Any] = c.call("GET", f"/jobs/{job_id}")
        if job["status"] == "completed":
            return job
        if job["status"] in {"failed", "cancelled"}:
            raise RuntimeError(f"job {job_id} {job['status']}: {job.get('error_message')}")
        time.sleep(2)
    raise RuntimeError(f"job {job_id} did not finish in {timeout_s}s")


def ensure_book(t: Client, course_id: str, course_title: str) -> None:
    """Upload the course's source PDF (once) and point each chapter at its pages."""
    if course_title not in BOOKS:
        return
    filename, title, pages = BOOKS[course_title]
    doc = next(
        (d for d in t.call("GET", f"/courses/{course_id}/documents") if d["title"] == title), None
    )
    if doc is None or doc["processing_status"] in {"pending_upload", "failed"}:
        data = (BOOK_DIR / filename).read_bytes()
        if not data.startswith(b"%PDF"):
            sys.exit(f"{BOOK_DIR / filename} is not a PDF (Git LFS pointer?)")
        up = t.call(
            "POST",
            "/documents/upload-url",
            {
                "course_id": course_id,
                "filename": filename,
                "mime_type": "application/pdf",
                "size_bytes": len(data),
                "title": title,
            },
            (200, 201),
        )
        t.put_bytes(
            up["upload"]["url"],
            data,
            up["upload"].get("headers") or {"Content-Type": "application/pdf"},
        )
        res = t.call("POST", f"/documents/{up['document']['id']}/complete", expect=(200, 201, 202))
        wait_job(t, res["job"]["id"])
        doc = t.call("GET", f"/documents/{up['document']['id']}")
        log(
            f"  created book    {title} ({len(data) / 1e6:.1f} MB, {doc['page_count']} pages, {doc['processing_status']})"
        )
    else:
        log(f"  reused  book    {title} ({doc['page_count']} pages, {doc['processing_status']})")
    for ch in t.call("GET", f"/courses/{course_id}/chapters"):
        rng = pages.get(ch["title"])
        want = (
            [{"document_id": doc["id"], "page_start": rng[0], "page_end": rng[1]}] if rng else None
        )
        have = [
            {k: r.get(k) for k in ("document_id", "page_start", "page_end")}
            for r in ch.get("source_refs") or []
        ]
        if want and have != want:
            t.call("PATCH", f"/chapters/{ch['id']}", {"source_refs": want})


def build_course(
    t: Client,
    plan: dict[str, Any],
    school_id: str,
    assets: dict[str, dict[str, Any]],
    with_ai: bool,
) -> dict[str, Any] | None:
    existing = [c for c in t.call("GET", "/courses") if c["title"] == plan["course"]["title"]]
    if any(c["status"] == "published" for c in existing):
        log(f"  reused  course  {plan['course']['title']} (left unchanged)")
        return None
    if existing:  # a draft left by an interrupted run: clear it and build again
        course = existing[0]
        for ch in t.call("GET", f"/courses/{course['id']}/chapters"):
            t.call("DELETE", f"/chapters/{ch['id']}", expect=(204,))
        log(f"  resumed course  {course['title']} (cleared an incomplete draft)")
    else:
        course = t.call("POST", "/courses", {**plan["course"], "school_id": school_id}, (201,))
    built: dict[str, Any] = {"course": course, "chapters": []}
    for ch in plan["chapters"]:
        chapter = t.call(
            "POST",
            f"/courses/{course['id']}/chapters",
            {"title": ch["title"], "description": ch["description"]},
            (201,),
        )
        t.call(
            "PUT", f"/chapters/{chapter['id']}/objectives", [{"text": o} for o in ch["objectives"]]
        )
        lessons = []
        for title, sections, fixture in ch["lessons"]:
            lesson = t.call(
                "POST",
                f"/chapters/{chapter['id']}/lessons",
                {
                    "title": title,
                    "content": {
                        "sections": [
                            {"title": s, "body_markdown": b, "key_terms": k} for s, b, k in sections
                        ],
                        "summary": [s for s, _, _ in sections],
                    },
                },
                (201,),
            )
            scene = None
            if fixture:
                spec = scene_spec(fixture, assets[SCENE_ASSET[fixture]])
                scene = t.call("POST", f"/lessons/{lesson['id']}/scenes", {"spec": spec}, (201,))
                for anim in animation_specs(spec):
                    t.call("POST", f"/scenes/{scene['id']}/animations", {"spec": anim}, (201,))
                scene = {
                    **scene,
                    "component_ids": [c["component_id"] for c in spec["components"]],
                    "animation_ids": spec.get("animation_refs", []),
                }
            lessons.append({"lesson": lesson, "scene": scene})
        quiz_title, questions, short_q = ch["quiz"]
        qs = list(questions) + ([short_q] if (with_ai and short_q) else [])
        quiz = t.call(
            "POST",
            f"/chapters/{chapter['id']}/assessments",
            {"title": quiz_title, "passing_score": 60, "max_attempts": 3},
            (201,),
        )
        t.call(
            "PUT",
            f"/assessments/{quiz['id']}/questions",
            {"expected_version": quiz["version"], "content": {"questions": qs}},
        )
        res = t.call("POST", f"/chapters/{chapter['id']}/publish", {"include_course": True})
        if res.get("skipped"):
            log(f"    note: skipped while publishing {ch['title']}: {res['skipped']}")
        built["chapters"].append(
            {"chapter": chapter, "lessons": lessons, "quiz": quiz, "questions": qs}
        )
        log(f"  created chapter {ch['title']} ({len(lessons)} lessons, {len(qs)} questions)")
    t.call("PATCH", f"/courses/{course['id']}", {"status": "published"})
    log(f"  created course  {course['title']}")
    return built


def student_activity(s: Client, built: dict[str, Any], profile: str, rnd: random.Random) -> str:
    share, accuracy, retake = PROFILES[profile]
    lessons = [(ch, l) for ch in built["chapters"] for l in ch["lessons"]]
    n_done = round(share * len(lessons))
    done_chapters = set()
    for i, (ch, item) in enumerate(lessons[: n_done + (1 if 0 < n_done < len(lessons) else 0)]):
        lesson, scene = item["lesson"], item["scene"]
        s.call("GET", f"/lessons/{lesson['id']}")
        events: list[dict[str, Any]] = [{"event_type": "lesson_opened", "lesson_id": lesson["id"]}]
        if scene and rnd.random() < 0.3 + 0.7 * share:
            events.append(
                {"event_type": "scene_opened", "lesson_id": lesson["id"], "scene_id": scene["id"]}
            )
            for comp in rnd.sample(
                scene["component_ids"], k=min(len(scene["component_ids"]), rnd.randint(1, 5))
            ):
                events.append(
                    {
                        "event_type": "component_selected",
                        "lesson_id": lesson["id"],
                        "scene_id": scene["id"],
                        "component_id": comp,
                    }
                )
            for anim in scene["animation_ids"]:
                if rnd.random() < share:
                    events.append(
                        {
                            "event_type": "animation_started",
                            "lesson_id": lesson["id"],
                            "scene_id": scene["id"],
                            "animation_id": anim,
                        }
                    )
                    if rnd.random() < 0.8:
                        events.append(
                            {
                                "event_type": "animation_completed",
                                "lesson_id": lesson["id"],
                                "scene_id": scene["id"],
                                "animation_id": anim,
                            }
                        )
        s.call("POST", "/learning-events", {"events": events})
        finished = i < n_done
        s.call(
            "POST",
            f"/lessons/{lesson['id']}/progress",
            {"status": "completed" if finished else "in_progress"},
        )
        if finished and item is ch["lessons"][-1]:
            done_chapters.add(ch["chapter"]["id"])
    scores = []
    for ch in built["chapters"]:
        if ch["chapter"]["id"] not in done_chapters:
            continue
        for attempt in range(2 if retake else 1):
            start = s.call("POST", f"/assessments/{ch['quiz']['id']}/attempts", expect=(201,))
            answers = []
            for q in ch["questions"]:
                if q["question_type"] == "mcq":
                    right = next(o["key"] for o in q["options"] if o["is_correct"])
                    wrong = [o["key"] for o in q["options"] if not o["is_correct"]]
                    ok = rnd.random() < min(0.98, accuracy + 0.15 * attempt)
                    answers.append(
                        {
                            "question_key": q["key"],
                            "selected_option_key": right if ok else rnd.choice(wrong),
                        }
                    )
                else:
                    text = (
                        q["model_answer"]
                        if rnd.random() < accuracy
                        else "I am not sure, something to do with the body."
                    )
                    answers.append({"question_key": q["key"], "answer_text": text})
            res = s.call("POST", f"/attempts/{start['attempt_id']}/submit", {"answers": answers})
            pct = None
            if res.get("score") is not None and res.get("max_score"):
                pct = 100 * res["score"] / res["max_score"]
            elif res.get("provisional_score") is not None and res.get("max_score"):
                pct = 100 * res["provisional_score"] / res["max_score"]
            if pct is not None:
                scores.append(pct)
            if pct is None or pct >= 60:
                break
    avg = f"{sum(scores) / len(scores):.0f}%" if scores else "no quizzes"
    return f"{n_done}/{len(lessons)} lessons, {avg}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument(
        "--password",
        default="DemoPassword2026!",
        help="password for every demo account (min 12 chars)",
    )
    ap.add_argument(
        "--with-ai",
        action="store_true",
        help="add short-answer questions (AI marking costs tokens)",
    )
    ap.add_argument("--seed", type=int, default=2026, help="random seed for student activity")
    a = ap.parse_args()
    if len(a.password) < 12:
        sys.exit("--password must be at least 12 characters")
    log(f"Seeding demo data into {a.base_url}")
    Client(a.base_url).call("GET", "/health/ready")

    log("Accounts")
    teachers = {
        t["key"]: account(a.base_url, t["name"], t["email"], "teacher", a.password)
        for t in TEACHERS
    }
    students = [
        (name, room, prof, *account(a.base_url, name, email_for(name), "student", a.password))
        for name, room, prof in STUDENTS
    ]

    log("School and classrooms")
    admin = teachers["okafor"][0]
    school = ensure_school(admin)
    sid = school["id"]
    ensure_member(admin, f"/schools/{sid}/members", TEACHERS[1]["email"], "teacher")
    for name, *_ in students:
        ensure_member(admin, f"/schools/{sid}/members", email_for(name), "student")
    rooms = ensure_classrooms(admin, sid)
    for key, room in rooms.items():
        for t in TEACHERS:
            ensure_member(admin, f"/classrooms/{room['id']}/members", t["email"], "teacher")
        for name, rk, *_ in students:
            if rk == key:
                ensure_member(
                    admin, f"/classrooms/{room['id']}/members", email_for(name), "student"
                )
    log(
        f"  {school['name']}: {len(TEACHERS)} teachers, {len(students)} students, {len(rooms)} classrooms"
    )

    log("3D library")
    assets = ensure_assets(admin, sid)

    rnd = random.Random(a.seed)
    for plan in COURSES:
        t, _ = teachers[plan["teacher"]]
        log(f"Course: {plan['course']['title']}")
        built = build_course(t, plan, sid, assets, a.with_ai)
        title = plan["course"]["title"]
        course_id = (
            built["course"]["id"]
            if built
            else next(c["id"] for c in t.call("GET", "/courses") if c["title"] == title)
        )
        ensure_book(t, course_id, title)
        if built is None:
            continue
        for key in plan["classrooms"]:
            t.call(
                "POST",
                f"/courses/{built['course']['id']}/enrollments",
                {"classroom_id": rooms[key]["id"]},
            )
        log("  student activity")
        for name, rk, prof, client, _ in students:
            if rk not in plan["classrooms"]:
                continue
            summary = student_activity(client, built, prof, rnd)
            log(f"    {name:16} {prof:10} {summary}")

    log(
        "\nDone. Sign in at the web app with any of these (password for all: the --password value):"
    )
    for t in TEACHERS:
        log(f"  teacher  {t['email']}")
    for name, room, prof in STUDENTS:
        log(f"  student  {email_for(name):34} {CLASSROOMS[room]['name']:24} {prof}")


if __name__ == "__main__":
    main()
