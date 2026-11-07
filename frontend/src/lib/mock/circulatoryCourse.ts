import type { Chapter, Course, Question } from "@/lib/types";

const chapters: Chapter[] = [
  {
    id: "heart-structure",
    title: "Meet your heart",
    status: "Approved",
    lesson: {
      id: "heart-structure-lesson",
      title: "A powerful pump",
      objectives: ["Identify the four chambers of the heart", "Trace the path blood takes through the heart"],
      explanation: "Your heart is a muscular pump about the size of your fist. Four chambers work together: the right atrium and ventricle receive blood from the body and send it to the lungs; the left atrium and ventricle receive oxygen-rich blood and pump it around the body. One-way valves keep the blood moving in the right direction.",
      keyTerms: [
        { id: "atrium", term: "Atrium", definition: "An upper heart chamber that receives blood." },
        { id: "ventricle", term: "Ventricle", definition: "A lower heart chamber that pumps blood out." },
        { id: "valve", term: "Valve", definition: "A flap that prevents blood from flowing backward." },
      ],
      examples: ["The right ventricle pumps blood to the lungs.", "The left ventricle has a thicker wall because it pumps blood around the whole body."],
      summary: "Four chambers and one-way valves keep blood moving through the heart.",
    },
    model: {
      url: null,
      alt: "Illustrated cutaway of a heart showing four chambers, the aorta and pulmonary vessels.",
      description: "A simplified heart model with chambers that can be selected to follow the flow of blood.",
      hotspots: [
        { id: "right-atrium", label: "Right atrium", explanation: "Receives oxygen-poor blood returning from the body.", position: { x: 0.37, y: 0.35, z: 0 } },
        { id: "right-ventricle", label: "Right ventricle", explanation: "Pumps oxygen-poor blood to the lungs.", position: { x: 0.38, y: 0.62, z: 0 } },
        { id: "left-atrium", label: "Left atrium", explanation: "Receives oxygen-rich blood from the lungs.", position: { x: 0.64, y: 0.35, z: 0 } },
        { id: "left-ventricle", label: "Left ventricle", explanation: "Pumps oxygen-rich blood around the body.", position: { x: 0.63, y: 0.62, z: 0 } },
        { id: "aorta", label: "Aorta", explanation: "The largest artery carries blood from the left ventricle to the body.", position: { x: 0.58, y: 0.13, z: 0 } },
      ],
      animationSteps: [
        { id: "body-return", caption: "Blood returns from the body.", lessonText: "Oxygen-poor blood enters the right atrium.", activeParts: ["right-atrium"] },
        { id: "to-lungs", caption: "The right side sends blood to the lungs.", lessonText: "The right ventricle pumps blood to the lungs to collect oxygen.", activeParts: ["right-atrium", "right-ventricle"] },
        { id: "from-lungs", caption: "Fresh oxygen enters the left side.", lessonText: "Oxygen-rich blood flows from the lungs into the left atrium.", activeParts: ["left-atrium"] },
        { id: "to-body", caption: "The left ventricle sends blood around the body.", lessonText: "The left ventricle pushes oxygen-rich blood into the aorta.", activeParts: ["left-atrium", "left-ventricle", "aorta"] },
      ],
    },
    questions: [],
  },
  {
    id: "blood-vessels",
    title: "The highway system",
    status: "Reviewed",
    lesson: {
      id: "blood-vessels-lesson",
      title: "A network for every cell",
      objectives: ["Compare arteries, veins and capillaries", "Explain how materials move between blood and cells"],
      explanation: "Blood travels through a branching network of vessels. Arteries carry blood away from the heart, veins return it, and tiny capillaries connect the two. Their thin walls let oxygen, nutrients and waste move between the blood and nearby cells.",
      keyTerms: [
        { id: "artery", term: "Artery", definition: "A blood vessel that carries blood away from the heart." },
        { id: "vein", term: "Vein", definition: "A blood vessel that returns blood to the heart." },
        { id: "capillary", term: "Capillary", definition: "A tiny vessel where materials move between blood and cells." },
      ],
      examples: ["The pulmonary artery carries blood toward the lungs.", "Capillary networks wrap around tissues to deliver oxygen."],
      summary: "Arteries go away, veins return, and capillaries exchange materials with cells.",
    },
    model: { url: null, alt: "Three blood-vessel types shown as a branching network.", description: "A branching vessel network shows arteries, veins and capillaries.", hotspots: [], animationSteps: [] },
    questions: [],
  },
  {
    id: "blood-components",
    title: "What blood carries",
    status: "Reviewed",
    lesson: {
      id: "blood-components-lesson",
      title: "More than a red liquid",
      objectives: ["Name the main components of blood", "Connect each component to its job"],
      explanation: "Blood is a living tissue made of plasma, red blood cells, white blood cells and platelets. Red cells carry oxygen, white cells help defend the body, and platelets help seal a cut. Plasma carries these components and many dissolved substances.",
      keyTerms: [
        { id: "plasma", term: "Plasma", definition: "The liquid part of blood that carries cells and dissolved materials." },
        { id: "red-cell", term: "Red blood cell", definition: "A cell that carries oxygen around the body." },
        { id: "platelet", term: "Platelet", definition: "A cell fragment that helps blood clot." },
      ],
      examples: ["Red blood cells contain haemoglobin, which binds oxygen.", "Platelets gather at a damaged vessel to help form a clot."],
      summary: "Blood components work together to transport, protect and repair.",
    },
    model: { url: null, alt: "Blood components illustrated in plasma.", description: "A magnified view of red and white blood cells and platelets.", hotspots: [], animationSteps: [] },
    questions: [],
  },
  {
    id: "lungs-circulation",
    title: "A breath of oxygen",
    status: "Draft",
    lesson: {
      id: "lungs-circulation-lesson",
      title: "The lungs and circulation",
      objectives: ["Describe gas exchange in the lungs", "Explain why blood visits the lungs"],
      explanation: "At the lungs, oxygen moves from inhaled air into the blood, while carbon dioxide moves from blood into the air to be breathed out. This exchange refreshes the blood before the heart sends it to the body.",
      keyTerms: [
        { id: "oxygen", term: "Oxygen", definition: "A gas cells use to release energy from food." },
        { id: "gas-exchange", term: "Gas exchange", definition: "The movement of oxygen and carbon dioxide between air and blood." },
      ],
      examples: ["Oxygen diffuses into nearby capillaries around the air sacs.", "Carbon dioxide leaves the blood and is exhaled."],
      summary: "The lungs add oxygen to blood and remove carbon dioxide.",
    },
    model: { url: null, alt: "Lungs and heart connected by pulmonary blood vessels.", description: "A simple diagram shows the lungs exchanging gases with blood.", hotspots: [], animationSteps: [] },
    questions: [],
  },
  {
    id: "healthy-heart",
    title: "Keeping the heart healthy",
    status: "Draft",
    lesson: {
      id: "healthy-heart-lesson",
      title: "Small habits, strong heart",
      objectives: ["Name habits that support heart health", "Explain how exercise changes heart rate"],
      explanation: "Regular movement strengthens the heart muscle. Balanced food, sleep and not smoking also support the circulatory system. During exercise, muscles need more oxygen, so heart rate rises to deliver oxygen-rich blood faster.",
      keyTerms: [
        { id: "heart-rate", term: "Heart rate", definition: "The number of heartbeats in one minute." },
        { id: "pulse", term: "Pulse", definition: "The pressure wave felt as the heart pumps blood through arteries." },
      ],
      examples: ["Your pulse rises when you run and gradually slows as you rest.", "A short walk is one way to add more movement to the day."],
      summary: "Healthy habits support the heart, and exercise makes it pump faster for a while.",
    },
    model: { url: null, alt: "Heart-rate illustration before and after exercise.", description: "A simple pulse visual compares resting and active heart rates.", hotspots: [], animationSteps: [] },
    questions: [],
  },
];

const firstQuestions: Question[] = [
  {
    id: "q-heart-chambers",
    type: "multiple-choice",
    chapterId: "heart-structure",
    prompt: "Which chamber pumps oxygen-rich blood to the body?",
    options: ["Right atrium", "Right ventricle", "Left atrium", "Left ventricle"],
    correctAnswer: 3,
    explanation: "The left ventricle pumps oxygen-rich blood into the aorta and around the body.",
  },
  {
    id: "q-valves",
    type: "true-false",
    chapterId: "heart-structure",
    prompt: "Heart valves help prevent blood from flowing backward.",
    correctAnswer: true,
    explanation: "Valves open and close to keep blood moving in one direction.",
  },
  {
    id: "q-artery",
    type: "fill-blank",
    chapterId: "blood-vessels",
    prompt: "A blood vessel that carries blood away from the heart is an ____.",
    correctAnswer: "artery",
    acceptedAnswers: ["artery", "an artery"],
    explanation: "Arteries carry blood away from the heart.",
  },
  {
    id: "q-explain-flow",
    type: "short-answer",
    chapterId: "heart-structure",
    prompt: "In a sentence or two, explain how blood travels from the body to the lungs and back to the body.",
    rubric: { criteria: ["Names the right side before the lungs", "Mentions oxygen pickup in the lungs", "Names the left side returning blood to the body"], maximumScore: 3 },
    sampleAnswer: "Blood enters the right side of the heart and is pumped to the lungs. After picking up oxygen, it returns to the left side, which pumps it around the body.",
    explanation: "The right side sends blood to the lungs; the left side sends oxygen-rich blood to the body.",
  },
];

chapters[0]!.questions = firstQuestions.filter((question) => question.chapterId === chapters[0]!.id);
chapters[1]!.questions = firstQuestions.filter((question) => question.chapterId === chapters[1]!.id);

export const circulatoryCourse: Course = {
  id: "circulatory-system",
  title: "The Circulatory System",
  subject: "Biology",
  grade: "Grade 8",
  description: "Follow blood on its journey through the heart, lungs and body.",
  sourceName: "Grade 8 Biology — Unit 4.pdf",
  status: "Published",
  chapters,
};
