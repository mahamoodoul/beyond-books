#!/usr/bin/env python3
"""Seed the "The Circulatory System" demo course into a RUNNING Edu3D API over real HTTP.

    python3 scripts/seed_demo_course.py                                  # local stack
    python3 scripts/seed_demo_course.py --base-url https://edu3d.example.org \
        --teacher teacher@school.org:secret --student student@school.org:secret

Everything goes through the public API, exactly as a teacher would do it in the UI:
teacher + student accounts (registered if they don't exist yet), course, five chapters with
lessons and objectives, the interactive heart model uploaded to the 3D library and approved,
a published 3D scene on the heart lesson, a quiz, and the student's enrolment.

heart.glb ships meshopt-compressed for the AR/3D viewer; it is decompressed on the fly with
scripts/decompress-glb.mjs (needs Node and `frontend/node_modules`) because the 3D library only
accepts plain glTF buffers.

The heart lesson's scene references the uploaded asset; the frontend recognises that asset
(slug prefix `interactive_human_heart`) and adds the interactive 3D heart (CT scan) and AR
launcher next to the standard scene viewer.

Idempotent: if the teacher already owns a course with the same title it only makes sure the
student is enrolled. Add --update-content to also bring that course's objectives and lesson text
up to date (edited and re-published through the API, like a teacher would). Standard library only.
"""

import argparse
import json
import re
import struct
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
COURSE_TITLE = "The Circulatory System"
HEART_ASSET_NAME = "Interactive Human Heart"  # slug becomes interactive_human_heart_<hex>

# Mesh-name prefixes in heart.glb → labels (matches frontend/src/features/ar/content/heartParts.ts).
HEART_PARTS = {
    "LeftVentricle": "Left ventricle",
    "RightVentricle": "Right ventricle",
    "RightAtrium": "Right atrium",
    "LeftAtrium": "Left atrium",
    "Aorta": "Aorta",
    "PulmonaryArtery": "Pulmonary artery",
    "SuperiorVenaCava": "Superior vena cava",
    "InferiorVenaCava": "Inferior vena cava",
    "PulmonaryVeins": "Pulmonary veins",
    "CoronaryArteries": "Coronary arteries",
    "CardiacVeins": "Cardiac veins",
}

# Full lesson for "A powerful pump" (chapter 1), written to the lesson content contract:
# sections (title, markdown body, key terms) + summary. Grade 8 level; ties into the 3D heart.
HEART_LESSON_SECTIONS: list[dict[str, Any]] = [
    {
        "title": "The big idea",
        "body_markdown": (
            "Your heart is a hollow, muscular pump about the size of your fist. It sits in the middle "
            "of your chest, tipped slightly to the left, protected by your ribs.\n\n"
            "Every beat squeezes blood out into your blood vessels. That blood carries **oxygen** and "
            "**nutrients** to every cell and takes waste such as **carbon dioxide** away. If the pump "
            "stops, cells run out of oxygen within minutes, which is why the heart never takes a day off."
        ),
        "key_terms": ["Heart", "Oxygen", "Circulation"],
    },
    {
        "title": "Four chambers, two pumps",
        "body_markdown": (
            "Inside, the heart is divided into **four chambers**. A thick wall of muscle called the "
            "**septum** splits it into a right side and a left side, so it works like **two pumps "
            "side by side**.\n\n"
            "- **Right atrium**: receives oxygen-poor blood returning from the body.\n"
            "- **Right ventricle**: pumps that blood to the lungs to pick up oxygen.\n"
            "- **Left atrium**: receives oxygen-rich blood coming back from the lungs.\n"
            "- **Left ventricle**: pumps oxygen-rich blood out to the whole body.\n\n"
            "The two **atria** (top) are receiving rooms with thin walls. The two **ventricles** "
            "(bottom) do the hard pushing, so their walls are thicker. The left ventricle has the "
            "thickest wall of all, about three times thicker than the right, because it has to push "
            "blood all the way to your toes."
        ),
        "key_terms": ["Atrium", "Ventricle", "Septum"],
    },
    {
        "title": "Valves: one-way doors",
        "body_markdown": (
            "Blood must only flow forwards. Four **valves** act like one-way doors: they open to let "
            "blood through, then snap shut so it can’t flow back.\n\n"
            "1. **Tricuspid valve**: between the right atrium and right ventricle.\n"
            "2. **Pulmonary valve**: where blood leaves the right ventricle for the lungs.\n"
            "3. **Mitral valve**: between the left atrium and left ventricle.\n"
            "4. **Aortic valve**: where blood leaves the left ventricle into the aorta.\n\n"
            "The *lub-dub* sound a doctor hears through a stethoscope is these valves closing: "
            "**lub** when the valves between atria and ventricles shut, **dub** when the pulmonary "
            "and aortic valves shut."
        ),
        "key_terms": ["Valve", "Tricuspid valve", "Mitral valve", "Aortic valve"],
    },
    {
        "title": "Follow a drop of blood",
        "body_markdown": (
            "Blood makes **two loops**, and it passes through the heart once on each.\n\n"
            "**Loop 1: to the lungs and back (pulmonary circulation)**\n\n"
            "1. Oxygen-poor blood from the body arrives through the **superior and inferior vena "
            "cava** into the right atrium.\n"
            "2. It drops through the tricuspid valve into the right ventricle.\n"
            "3. The right ventricle pumps it through the **pulmonary artery** to the lungs, where it "
            "picks up oxygen and drops off carbon dioxide.\n\n"
            "**Loop 2: to the body and back (systemic circulation)**\n\n"
            "4. Fresh, oxygen-rich blood returns through the **pulmonary veins** into the left atrium.\n"
            "5. It passes through the mitral valve into the left ventricle.\n"
            "6. The left ventricle pushes it through the aortic valve into the **aorta**, the body’s "
            "largest artery, which branches out to every organ.\n\n"
            "> Tip: in diagrams, oxygen-poor blood is usually blue and oxygen-rich blood red. Real "
            "blood is always red: darker when it has less oxygen."
        ),
        "key_terms": ["Vena cava", "Pulmonary artery", "Pulmonary veins", "Aorta"],
    },
    {
        "title": "The heart feeds itself",
        "body_markdown": (
            "The heart is a muscle, so it needs its own supply of oxygen too. It can’t soak oxygen "
            "up from the blood rushing through its chambers. Instead, the **coronary arteries** "
            "branch off the bottom of the aorta and wrap around the outside of the heart, and "
            "**cardiac veins** collect the used blood.\n\n"
            "If a coronary artery becomes blocked, part of the heart muscle stops getting oxygen. "
            "That is what happens in a **heart attack**."
        ),
        "key_terms": ["Coronary arteries", "Cardiac veins"],
    },
    {
        "title": "Your heart by the numbers",
        "body_markdown": (
            "- **60 to 100** beats per minute for most people at rest. Exercise can push it much "
            "higher.\n"
            "- About **100,000** beats every day, and around **2.5 billion** in a lifetime.\n"
            "- About **5 litres** of blood pumped every minute at rest, roughly all the blood in "
            "your body.\n"
            "- About **250 to 350 grams** in an adult, about the same as a can of soup."
        ),
        "key_terms": ["Heart rate", "Pulse"],
    },
    {
        "title": "Explore it in 3D",
        "body_markdown": (
            "Open **View in 3D** next to this lesson and try these:\n\n"
            "1. Choose **Full screen**, then pick **Left ventricle** in the **Key**. Compare it with "
            "the right ventricle. Which one looks bigger and stronger?\n"
            "2. Turn on **Slice view** and choose **Axial**. Move the slider slowly and find the slice "
            "where you can see all four chambers at once.\n"
            "3. Press **Beat** and watch the atria squeeze just before the ventricles.\n"
            "4. Use **Explode** to pull the parts apart, then find the four vessels that bring blood "
            "*into* the heart."
        ),
        "key_terms": [],
    },
    {
        "title": "Words to know",
        "body_markdown": (
            "- **Atrium** (plural *atria*): an upper chamber that receives blood.\n"
            "- **Ventricle**: a lower chamber that pumps blood out of the heart.\n"
            "- **Septum**: the muscle wall dividing the left and right sides of the heart.\n"
            "- **Valve**: a flap that stops blood flowing backwards.\n"
            "- **Artery**: a vessel carrying blood *away* from the heart.\n"
            "- **Vein**: a vessel carrying blood *back* to the heart.\n"
            "- **Aorta**: the largest artery; it carries oxygen-rich blood to the body.\n"
            "- **Coronary arteries**: vessels that supply the heart muscle itself."
        ),
        "key_terms": [],
    },
    {
        "title": "Think about it",
        "body_markdown": (
            "- Why does the left ventricle need a thicker wall than the right ventricle?\n"
            "- What would happen to blood flow if the mitral valve didn’t close properly?\n"
            "- Put your fingers on your wrist and count your pulse for 15 seconds, then multiply by "
            "4. How does it change after 20 jumping jacks?"
        ),
        "key_terms": [],
    },
]

HEART_LESSON_SUMMARY = [
    "The heart is a muscular pump that moves blood around the body without stopping.",
    "It has four chambers: two atria that receive blood and two ventricles that pump it out.",
    "The right side sends blood to the lungs; the left side sends oxygen-rich blood to the body.",
    "Four one-way valves keep blood moving forwards and make the lub-dub sound.",
    "The coronary arteries supply the heart muscle with its own oxygen.",
]

CHAPTERS: list[dict[str, Any]] = [
    {
        "title": "Meet your heart",
        "lesson": "A powerful pump",
        "objectives": [
            "Identify the four chambers of the heart and what each one does",
            "Explain how valves keep blood flowing in one direction",
            "Trace the path blood takes through the heart, lungs and body",
            "Describe how the heart muscle gets its own oxygen supply",
        ],
        "explanation": "Your heart is a muscular pump about the size of your fist. Four chambers "
        "work together: the right atrium and ventricle receive blood from the body and send it "
        "to the lungs; the left atrium and ventricle receive oxygen-rich blood and pump it "
        "around the body. One-way valves keep the blood moving in the right direction.",
        "terms": [
            ("Atrium", "An upper heart chamber that receives blood."),
            ("Ventricle", "A lower heart chamber that pumps blood out."),
            ("Valve", "A flap that prevents blood from flowing backward."),
        ],
        "examples": [
            "The right ventricle pumps blood to the lungs.",
            "The left ventricle has a thicker wall because it pumps blood around the whole body.",
        ],
        "summary": "Four chambers and one-way valves keep blood moving through the heart.",
        "heart_scene": True,
        "sections": HEART_LESSON_SECTIONS,
        "summary_points": HEART_LESSON_SUMMARY,
    },
    {
        "title": "The highway system",
        "lesson": "A network for every cell",
        "objectives": [
            "Compare arteries, veins and capillaries",
            "Explain how materials move between blood and cells",
        ],
        "explanation": "Blood travels through a branching network of vessels. Arteries carry "
        "blood away from the heart, veins return it, and tiny capillaries connect the two. "
        "Their thin walls let oxygen, nutrients and waste move between the blood and nearby cells.",
        "terms": [
            ("Artery", "A blood vessel that carries blood away from the heart."),
            ("Vein", "A blood vessel that returns blood to the heart."),
            ("Capillary", "A tiny vessel where materials move between blood and cells."),
        ],
        "examples": [
            "The pulmonary artery carries blood toward the lungs.",
            "Capillary networks wrap around tissues to deliver oxygen.",
        ],
        "summary": "Arteries go away, veins return, and capillaries exchange materials with cells.",
    },
    {
        "title": "What blood carries",
        "lesson": "More than a red liquid",
        "objectives": ["Name the main components of blood", "Connect each component to its job"],
        "explanation": "Blood is a living tissue made of plasma, red blood cells, white blood "
        "cells and platelets. Red cells carry oxygen, white cells help defend the body, and "
        "platelets help seal a cut. Plasma carries these components and many dissolved substances.",
        "terms": [
            ("Plasma", "The liquid part of blood that carries cells and dissolved materials."),
            ("Red blood cell", "A cell that carries oxygen around the body."),
            ("Platelet", "A cell fragment that helps blood clot."),
        ],
        "examples": [
            "Red blood cells contain haemoglobin, which binds oxygen.",
            "Platelets gather at a damaged vessel to help form a clot.",
        ],
        "summary": "Blood components work together to transport, protect and repair.",
    },
    {
        "title": "A breath of oxygen",
        "lesson": "The lungs and circulation",
        "objectives": ["Describe gas exchange in the lungs", "Explain why blood visits the lungs"],
        "explanation": "At the lungs, oxygen moves from inhaled air into the blood, while carbon "
        "dioxide moves from blood into the air to be breathed out. This exchange refreshes the "
        "blood before the heart sends it to the body.",
        "terms": [
            ("Oxygen", "A gas cells use to release energy from food."),
            ("Gas exchange", "The movement of oxygen and carbon dioxide between air and blood."),
        ],
        "examples": [
            "Oxygen diffuses into nearby capillaries around the air sacs.",
            "Carbon dioxide leaves the blood and is exhaled.",
        ],
        "summary": "The lungs add oxygen to blood and remove carbon dioxide.",
    },
    {
        "title": "Keeping the heart healthy",
        "lesson": "Small habits, strong heart",
        "objectives": [
            "Name habits that support heart health",
            "Explain how exercise changes heart rate",
        ],
        "explanation": "Regular movement strengthens the heart muscle. Balanced food, sleep and "
        "not smoking also support the circulatory system. During exercise, muscles need more "
        "oxygen, so heart rate rises to deliver oxygen-rich blood faster.",
        "terms": [
            ("Heart rate", "The number of heartbeats in one minute."),
            ("Pulse", "The pressure wave felt as the heart pumps blood through arteries."),
        ],
        "examples": [
            "Your pulse rises when you run and gradually slows as you rest.",
            "A short walk is one way to add more movement to the day.",
        ],
        "summary": "Healthy habits support the heart, and exercise makes it pump faster for a while.",
    },
]

QUIZ = [
    {
        "question_type": "mcq",
        "question_text": "Which chamber pumps oxygen-rich blood to the body?",
        "options": [
            {"text": "Right atrium"},
            {"text": "Right ventricle"},
            {"text": "Left atrium"},
            {"text": "Left ventricle", "is_correct": True},
        ],
        "explanation_correct": "The left ventricle pumps oxygen-rich blood into the aorta and "
        "around the body.",
    },
    {
        "question_type": "mcq",
        "question_text": "Heart valves help prevent blood from flowing backward.",
        "options": [{"text": "True", "is_correct": True}, {"text": "False"}],
        "explanation_correct": "Valves open and close to keep blood moving in one direction.",
    },
    {
        "question_type": "short_answer",
        "question_text": "In a sentence or two, explain how blood travels from the body to the "
        "lungs and back to the body.",
        "points": 3,
        "rubric": [
            {"description": "Names the right side before the lungs", "points": 1},
            {"description": "Mentions oxygen pickup in the lungs", "points": 1},
            {"description": "Names the left side returning blood to the body", "points": 1},
        ],
        "model_answer": "Blood enters the right side of the heart and is pumped to the lungs. "
        "After picking up oxygen, it returns to the left side, which pumps it around the body.",
    },
]


class Client:
    def __init__(self, base: str) -> None:
        self.host = base.rstrip("/")
        self.base = self.host + "/api/v1"
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

    def call(self, method: str, path: str, body: Any = None, expect: tuple[int, ...] = (200,)) -> Any:
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, method=method, headers={
            "Content-Type": "application/json", "X-Requested-With": "edu3d"})
        status, raw = self._send(req)
        if status not in expect:
            raise RuntimeError(f"{method} {path} -> {status}: {raw[:400]!r}")
        return json.loads(raw) if raw else None

    def put_bytes(self, url: str, data: bytes, headers: dict[str, str]) -> None:
        full = url if url.startswith("http") else self.host + url
        req = urllib.request.Request(full, data=data, method="PUT",
                                     headers={**headers, "X-Requested-With": "edu3d"})
        status, raw = self._send(req)
        if status not in (200, 201, 204):
            raise RuntimeError(f"upload -> {status}: {raw[:300]!r}")

    def _send(self, req: urllib.request.Request) -> tuple[int, bytes]:
        try:
            with self.opener.open(req, timeout=120) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()


def ensure_account(c: Client, cred: str, kind: str, name: str) -> str:
    email, password = cred.split(":", 1)
    try:
        c.call("POST", "/auth/login", {"email": email, "password": password})
        print(f"  ok    {kind} {email} (existing account)")
    except RuntimeError:
        c.call("POST", "/auth/register", {"email": email, "password": password,
                                          "display_name": name, "account_type": kind}, (201,))
        c.call("POST", "/auth/login", {"email": email, "password": password})
        print(f"  ok    {kind} {email} (registered)")
    return email


def lesson_content(ch: dict[str, Any]) -> dict[str, Any]:
    terms = "\n".join(f"- **{t}**: {d}" for t, d in ch["terms"])
    examples = "\n".join(f"- {e}" for e in ch["examples"])
    content: dict[str, Any] = {
        "sections": [
            {"title": "The big idea", "body_markdown": ch["explanation"],
             "key_terms": [t for t, _ in ch["terms"]]},
            {"title": "Words to know", "body_markdown": terms},
            {"title": "Think about it", "body_markdown": examples},
        ],
        "summary": [ch["summary"]],
    }
    if ch.get("sections"):
        content = {"sections": ch["sections"], "summary": ch["summary_points"]}
    if ch.get("heart_scene"):
        content["visualization_candidates"] = [{
            "concept": "The human heart", "visualization_type": "anatomical_model",
            "learning_reason": "Turning the heart in 3D shows how the chambers, valves and "
            "great vessels connect."}]
    return content


def library_ready_bytes(model: Path) -> bytes:
    """The 3D library only accepts plain glTF buffers; decompress meshopt models first."""
    data = model.read_bytes()
    json_len = struct.unpack("<I", data[12:16])[0]
    required = json.loads(data[20:20 + json_len]).get("extensionsRequired", [])
    if "EXT_meshopt_compression" not in required:
        return data
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "model.glb"
        subprocess.run(["node", str(ROOT / "scripts/decompress-glb.mjs"), str(model), str(out)], check=True)
        return out.read_bytes()


def upload_heart(t: Client, model: Path) -> dict[str, Any]:
    mine = [m for m in t.call("GET", "/assets") if m["name"] == HEART_ASSET_NAME and m.get("can_manage")]
    ready = next((m for m in mine if m["review_status"] == "approved" and m["latest_version"] >= 1), None)
    if ready:
        print(f"  ok    3D library asset {ready['slug']} (existing)")
        return t.call("GET", f"/assets/{ready['id']}")
    data = library_ready_bytes(model)
    asset = mine[0] if mine else t.call("POST", "/assets", {
        "name": HEART_ASSET_NAME,
        "description": "Anatomical heart with chambers, great vessels and coronary vessels. "
        "Powers the interactive 3D heart (with CT scan) and the AR page scan.",
        "category": "anatomy", "subject": "biology", "license_name": "CC-BY-4.0",
        "attribution_text": "Beyond Books heart model."}, (201,))
    up = t.call("POST", f"/assets/{asset['id']}/versions/upload-url", {"size_bytes": len(data)}, (201,))
    t.put_bytes(up["url"], data, up.get("headers") or {"Content-Type": "model/gltf-binary"})
    t.call("POST", f"/assets/{asset['id']}/versions/{up['version_number']}/complete")
    asset = t.call("POST", f"/assets/{asset['id']}/review", {
        "decision": "approved", "notes": "Seeded demo model for the circulatory system course."})
    print(f"  ok    3D library asset {asset['slug']} (v{asset['latest_version']}, approved)")
    return asset


def heart_scene_spec(asset: dict[str, Any]) -> dict[str, Any]:
    versions = asset.get("versions") or []
    node_names: list[str] = versions[0].get("metadata_json", {}).get("node_names", []) if versions else []
    components = []
    for prefix, label in HEART_PARTS.items():
        mesh = next((n for n in node_names if n.startswith(prefix)), None)
        if mesh:
            components.append({"component_id": re.sub(r"(?<!^)(?=[A-Z])", "_", prefix).lower(),
                               "mesh_name": mesh, "label": label, "actions": ["highlight"]})
    return {"scene_id": "circulatory_heart", "title": "The human heart",
            "asset_refs": [{"asset_id": asset["slug"], "version": asset["latest_version"]}],
            "components": components, "controls": ["rotate", "zoom", "select_component"],
            # The heart is ~2 units across; the viewer starts halfway between min and max distance.
            "camera": {"preset": "front", "min_distance": 1, "max_distance": 5}}


def update_content(t: Client, cid: str) -> None:
    """Bring an existing course's objectives and lesson content in line with this script."""
    by_title = {ch["title"]: ch for ch in CHAPTERS}
    for chapter in t.call("GET", f"/courses/{cid}/chapters"):
        ch = by_title.get(chapter["title"])
        if ch is None:
            continue
        detail = t.call("GET", f"/chapters/{chapter['id']}")
        current = [o["objective_text"] for o in sorted(detail.get("objectives") or [], key=lambda o: o["position"])]
        if current != ch["objectives"]:
            t.call("PUT", f"/chapters/{chapter['id']}/objectives", [{"text": o} for o in ch["objectives"]])
            print(f"  ok    objectives updated: '{ch['title']}' ({len(ch['objectives'])})")
        for summary in t.call("GET", f"/chapters/{chapter['id']}/lessons"):
            if summary["title"] != ch["lesson"]:
                continue
            lesson = t.call("GET", f"/lessons/{summary['id']}")
            wanted = lesson_content(ch)
            have = {k: lesson["content"].get(k) or [] for k in ("sections", "summary", "visualization_candidates")}
            norm = lambda c: json.dumps({k: [{kk: vv for kk, vv in x.items() if vv not in ([], None)} if isinstance(x, dict) else x for x in (c.get(k) or [])] for k in ("sections", "summary", "visualization_candidates")}, sort_keys=True)
            if norm(have) == norm(wanted) and not lesson.get("has_unpublished_changes"):
                continue
            t.call("PATCH", f"/lessons/{lesson['id']}", {"expected_version": lesson["version"], "content": wanted})
            t.call("POST", f"/lessons/{lesson['id']}/publish")
            print(f"  ok    lesson updated + published: '{ch['lesson']}' ({len(wanted['sections'])} sections)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument("--teacher", default="teacher@example.com:teacher-demo-123", help="email:password")
    ap.add_argument("--student", default="student@example.com:student-demo-123", help="email:password")
    ap.add_argument("--model", type=Path, default=ROOT / "frontend/public/models/heart.glb")
    ap.add_argument("--update-content", action="store_true",
                    help="if the course exists, update its objectives and lesson content to match this script")
    a = ap.parse_args()
    t, s = Client(a.base_url), Client(a.base_url)
    print(f"Seeding '{COURSE_TITLE}' into {a.base_url}")

    ensure_account(t, a.teacher, "teacher", "Ms. Rivera")
    student_email = ensure_account(s, a.student, "student", "Sam Lee")

    existing = next((c for c in t.call("GET", "/courses") if c["title"] == COURSE_TITLE), None)
    if existing and t.call("GET", f"/courses/{existing['id']}/chapters"):
        t.call("POST", f"/courses/{existing['id']}/enrollments", {"student_email": student_email})
        print(f"  ok    course already exists ({existing['id']}); student enrolled")
        if a.update_content:
            update_content(t, existing["id"])
        return

    if not a.model.is_file():
        sys.exit(f"heart model not found: {a.model}")
    if existing:
        cid = existing["id"]
        print(f"  ok    resuming empty course {cid}")
    else:
        cid = t.call("POST", "/courses", {
            "title": COURSE_TITLE, "subject": "Biology", "grade_level": "Grade 8",
            "description": "Follow blood on its journey through the heart, lungs and body."}, (201,))["id"]
        print(f"  ok    course {cid}")

    heart_asset = upload_heart(t, a.model)
    first_chapter = None
    for ch in CHAPTERS:
        chapter = t.call("POST", f"/courses/{cid}/chapters", {"title": ch["title"]}, (201,))
        first_chapter = first_chapter or chapter
        t.call("PUT", f"/chapters/{chapter['id']}/objectives", [{"text": o} for o in ch["objectives"]])
        lesson = t.call("POST", f"/chapters/{chapter['id']}/lessons",
                        {"title": ch["lesson"], "content": lesson_content(ch)}, (201,))
        t.call("POST", f"/lessons/{lesson['id']}/publish")
        if ch.get("heart_scene"):
            scene = t.call("POST", f"/lessons/{lesson['id']}/scenes",
                           {"spec": heart_scene_spec(heart_asset)}, (201,))
            t.call("POST", f"/scenes/{scene['id']}/publish")
            print(f"  ok    3D scene on '{ch['lesson']}' ({len(scene['spec']['components'])} labelled parts)")
        t.call("PATCH", f"/chapters/{chapter['id']}", {"status": "published"})
        print(f"  ok    chapter '{ch['title']}' + lesson '{ch['lesson']}'")

    assert first_chapter is not None
    quiz = t.call("POST", f"/chapters/{first_chapter['id']}/assessments",
                  {"title": "Check your heart knowledge"}, (201,))
    t.call("PUT", f"/assessments/{quiz['id']}/questions",
           {"expected_version": quiz["version"], "content": {"questions": QUIZ}})
    t.call("POST", f"/assessments/{quiz['id']}/publish")
    print(f"  ok    quiz '{quiz['title']}' ({len(QUIZ)} questions)")

    t.call("PATCH", f"/courses/{cid}", {"status": "published"})
    t.call("POST", f"/courses/{cid}/enrollments", {"student_email": student_email})
    print(f"  ok    course published; {student_email} enrolled")


if __name__ == "__main__":
    main()
