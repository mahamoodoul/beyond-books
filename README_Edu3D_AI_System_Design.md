# Beyond Books --- Complete System Design

> **Turn textbooks into interactive 3D learning experiences.**\
> System architecture, database design, AI workflows, 3D modelling,
> frontend/backend design, security, team collaboration and
> implementation roadmap.

**Status:** Proposed engineering blueprint; architecture decisions
require team approval.\
**Product:** Multi-tenant educational SaaS.\
**Initial scale:** 50--100 pilot users.\
**Team:** Four developers in one shared repository.\
**Architecture:** Modular monolith + asynchronous workers + replaceable
AI/3D providers.

------------------------------------------------------------------------

## 1. Executive Summary

Beyond Books transforms textbooks, PDFs and educational references into
structured, chapter-based courses enriched with interactive 3D models,
animations, quizzes and short-answer assessments.

Teachers upload source materials. The platform extracts and analyses the
content, proposes chapters and learning objectives, generates editable
lessons, identifies concepts that benefit from visualization, and
creates structured 3D scene specifications. The browser renders approved
assets and interactions. Students learn chapter by chapter, complete
assessments and receive feedback. Teachers review student and classroom
performance and identify concepts that may need further explanation.

The differentiator is **teacher-controlled AI-assisted 3D learning**,
not simply document summarization or a chatbot.

### Product principles

1.  Teacher review and approval before publishing AI-generated content.
2.  Source-grounded learning with page references where possible.
3.  3D scenes represent learning objectives, components, interactions
    and guided explanations---not just a model file.
4.  Search/reuse approved assets before generating new ones.
5.  LLMs return validated structured data; never execute arbitrary
    generated code.
6.  PDF, AI and 3D generation run asynchronously.
7.  Start with a modular monolith; extract services only when justified.
8.  Security, school boundaries and student privacy are foundational.
9.  Track AI tokens, 3D credits, storage, bandwidth and cost per course.
10. Shared contracts enable four developers to work in parallel.

### MVP vertical slice

1.  Teacher creates a course and uploads a Biology PDF or text
    reference.
2.  AI proposes chapters and learning objectives.
3.  Teacher reviews and approves a chapter.
4.  AI generates a lesson and 3D scene plan.
5.  The scene uses an approved GLB model or a procedural model.
6.  Student explores the model, plays an animation and reads
    explanations.
7.  Student completes a quiz and short-answer question.
8.  Incorrect answers show explanations and links to relevant learning
    material.
9.  Teacher sees results and a basic knowledge-gap insight.

For the first demo, use one licensed existing model or a procedural
scene. Do not make unrestricted text-to-3D generation a dependency for
the first end-to-end workflow.

------------------------------------------------------------------------

## 2. Users and Capabilities

### Teacher

-   Create and manage courses, chapters and lessons.
-   Upload PDFs, textbook extracts and pasted references.
-   Review extracted text and source page references.
-   Generate, edit and approve lessons and learning objectives.
-   Request visualization recommendations and 3D scenes.
-   Preview models, labels, interactions and animations.
-   Generate and customize quizzes, answer keys and rubrics.
-   Create classrooms and invite students.
-   Publish, unpublish and version course content.
-   Review individual and classroom performance.
-   Override AI-suggested short-answer scores.

### Student

-   Access assigned courses and chapters.
-   Read lessons, explanations and summaries.
-   Rotate, zoom and interact with 3D models.
-   Select components and view labels/explanations.
-   Play, pause, restart and step through animations.
-   Complete quizzes and short-answer assessments.
-   Receive feedback and use **Explain Further**.
-   Review attempts and track progress.

### School administrator (future-ready)

-   Manage school membership, teachers, students and classrooms.
-   Review permitted school-level usage and learning analytics.
-   Configure organization settings, retention and institutional access.

------------------------------------------------------------------------

## 3. Technology Stack

The stack below is the recommended baseline. Verify current provider
pricing, quotas, API capabilities, commercial terms and regional
availability before implementation.

  --------------------------------------------------------------------------
  Layer             Technology          Responsibility     MVP
  ----------------- ------------------- ------------------ -----------------
  Frontend          React, TypeScript,  Web application    Yes
                    Vite                                   

  UI                Tailwind CSS,       Design system      Yes
                    shadcn/ui                              

  Routing           React Router        Navigation         Yes

  Server state      TanStack Query      API cache and      Yes
                                        mutations          

  Client state      Zustand             Local UI/3D state  Optional
                                        where needed       

  Forms             React Hook Form,    Form validation    Recommended
                    Zod                                    

  3D renderer       Three.js, React     Browser 3D         Yes
                    Three Fiber                            

  3D helpers        @react-three/drei   Controls/loaders   Recommended

  Backend           Python, FastAPI     REST API and       Yes
                                        business logic     

  Validation        Pydantic            API and AI schemas Yes

  ORM/migrations    SQLAlchemy 2,       Data access and    Yes
                    Alembic             schema evolution   

  Database          PostgreSQL          Structured data    Yes

  Vector search     pgvector            Textbook retrieval When RAG is added

  Object storage    AWS S3              PDFs, images, GLB  Pilot
                                        assets             

  Queue/cache       Redis               Queue broker and   Yes
                                        cache              

  Workers           Celery              Long-running jobs  Yes

  LLM               OpenAI API          Analysis and       Yes
                                        generation         

  Orchestration     LangGraph           Stateful AI        Recommended
                                        workflows          

  PDF               PyMuPDF             Text/page          Yes
                                        extraction         

  OCR               AWS Textract or     Scanned pages      When needed
                    equivalent                             

  3D generation     Tripo/Meshy         Optional model     Later
                    adapters            generation         

  Procedural 3D     Three.js            Geometry and       Yes
                                        simulations        

  Asset preparation Blender when        Advanced           Not runtime
                    required            editing/rigging    

  Containers        Docker, Compose     Local/dev          Yes
                                        deployment         

  CI/CD             GitHub Actions      Quality and        Yes
                                        deployment         

  Cloud             AWS                 Pilot hosting      Pilot
  --------------------------------------------------------------------------

### Architecture choice: modular monolith

Start with one backend application, one primary database and separate
background worker processes. Keep domain modules isolated. This is
easier for a four-person team to build, test and operate than premature
microservices.

Do not introduce Kubernetes, Kafka or multiple databases for the initial
pilot without a demonstrated need.

### Provider abstraction

Hide external services behind internal interfaces: - `LLMProvider` -
`ThreeDGenerationProvider` - `ObjectStorageProvider` -
`DocumentExtractionProvider` - `EmbeddingProvider`

Business logic must not depend on provider-specific response formats.
Normalize responses into internal contracts.

------------------------------------------------------------------------

## 4. High-Level System Architecture

``` mermaid
flowchart TB
    U[Teacher / Student / Admin]
    FE[React + TypeScript]
    API[FastAPI Modular Monolith]
    AUTH[Identity and Authorization]
    EDU[Courses, Chapters and Lessons]
    DOC[Document Processing]
    AI[AI Orchestration]
    THREE[3D Assets and Scenes]
    ASSESS[Assessment and Evaluation]
    ANALYTICS[Progress and Analytics]
    DB[(PostgreSQL + pgvector)]
    S3[(Private S3)]
    REDIS[(Redis)]
    WORKER[Celery Workers]
    LLM[LLM Provider Adapter]
    MODEL[Tripo / Meshy Adapter]
    VIEWER[React Three Fiber]
    OBS[Logs, Metrics and Audit]

    U --> FE --> API
    API --> AUTH
    API --> EDU
    API --> DOC
    API --> AI
    API --> THREE
    API --> ASSESS
    API --> ANALYTICS
    AUTH --> DB
    EDU --> DB
    DOC --> DB
    DOC --> S3
    AI --> DB
    AI --> REDIS
    THREE --> DB
    THREE --> S3
    ASSESS --> DB
    ANALYTICS --> DB
    REDIS --> WORKER
    WORKER --> DOC
    WORKER --> AI
    WORKER --> THREE
    WORKER --> ASSESS
    AI --> LLM
    THREE --> MODEL
    FE --> VIEWER
    VIEWER --> S3
    API --> OBS
    WORKER --> OBS
```

### Responsibilities

-   **Frontend:** teacher/student workflows and 3D viewer.
-   **FastAPI:** authentication integration, authorization, business
    rules and APIs.
-   **PostgreSQL:** structured records and relationships.
-   **S3:** binary files and generated assets.
-   **Redis/Celery:** asynchronous job execution and transient cache.
-   **AI module:** agent orchestration, prompts, retrieval and output
    validation.
-   **3D module:** asset registry, provider adapters and scene
    specifications.
-   **Observability:** request IDs, job logs, metrics, audit and cost
    tracking.

Normal reads and writes use the API. Expensive operations return a job
ID and run in workers. Use polling for the MVP; add SSE when useful. Use
WebSockets only for genuinely bidirectional interactions.

------------------------------------------------------------------------

## 5. Backend Module Architecture

Suggested internal structure:

``` text
backend/app/
  api/
  core/
  database/
  modules/
    authentication/
    users/
    organizations/
    classrooms/
    courses/
    documents/
    chapters/
    lessons/
    ai_engine/
    three_d/
    animations/
    assessments/
    evaluations/
    progress/
    analytics/
    notifications/
    operations/
  integrations/
    openai/
    tripo/
    meshy/
    aws/
  workers/
  schemas/
```

A module may contain `api.py`, `schemas.py`, `models.py`,
`repository.py`, `service.py`, `permissions.py`, `tasks.py`,
`exceptions.py` and `tests/` as needed.

  -----------------------------------------------------------------------
  Module                  Owns                    Must not own
  ----------------------- ----------------------- -----------------------
  Authentication          Login/session           Course access rules
                          integration             

  Users                   Profiles and lifecycle  School membership logic

  Organizations           Schools and memberships Lesson content

  Courses                 Courses, enrolments,    Binary file storage
                          publication             

  Documents               Upload metadata,        Assessment grading
                          extraction, chunks      

  AI engine               Agent workflows and     Frontend concerns
                          prompts                 

  3D                      Assets, scenes,         Course authorization
                          provider adapters       duplication

  Animations              Animation definitions   Renderer implementation
                          and steps               

  Assessments             Questions, rubrics,     Analytics aggregation
                          attempts                

  Evaluations             AI suggestions and      Unreviewed final
                          teacher overrides       grading authority

  Progress                Completion evidence     UI rendering

  Analytics               Aggregation and         Source-of-truth student
                          insights                answers

  Operations              Jobs, usage and audit   Domain content
                                                  ownership
  -----------------------------------------------------------------------

Dependency direction: API routes call services; services enforce domain
rules and call repositories/interfaces; repositories own database
queries; adapters implement provider interfaces. Workers call
application services. Avoid circular imports and business logic in route
handlers.

------------------------------------------------------------------------

## 6. AI System Design

### 6.1 Agent workflow

``` mermaid
flowchart TD
    PDF[PDF / Text Reference]
    EX[Extract text, headings and page references]
    CH[Normalize and chunk]
    DA[Document Analysis Agent]
    REVIEW[Teacher reviews outline]
    LG[Lesson Generation Agent]
    SP[3D Scene Planning Agent]
    AP[Animation Planning Agent]
    AG[Assessment Generation Agent]
    VAL[Schema and source validation]
    APPROVE[Teacher review and approval]
    PUB[Publish chapter]

    PDF --> EX --> CH --> DA --> REVIEW
    REVIEW --> LG
    LG --> SP
    LG --> AP
    LG --> AG
    SP --> VAL
    AP --> VAL
    AG --> VAL
    LG --> VAL
    VAL --> APPROVE --> PUB
```

### 6.2 Agents and contracts

  -----------------------------------------------------------------------
  Agent                   Input                   Output
  ----------------------- ----------------------- -----------------------
  Document Analysis       Extracted text and      Subject, level,
                          metadata                chapters, topics,
                                                  objectives, source refs

  Course Generator        Approved outline and    Course/chapter
                          source passages         structure

  Lesson Generator        Chapter passages and    Explanations, examples,
                          objectives              terms, summary

  3D Scene Planner        Lesson concepts and     Versioned scene
                          asset catalogue         specification

  Animation Planner       Concepts and scene      Validated animation
                          components              steps

  Assessment Generator    Objectives and source   Questions, answer keys,
                          passages                explanations, rubrics

  Answer Evaluator        Student answer and      Suggested score,
                          approved rubric         feedback, missing
                                                  concepts, confidence

  Explain Further         Question, misconception Explanation and
                          and lesson context      revision recommendation

  Learning Analytics      Aggregated performance  Teacher-facing insights
                          evidence                
  -----------------------------------------------------------------------

One LLM can initially power multiple logical agents with distinct
prompts and schemas. Do not deploy a separate model/service for every
agent without evidence.

### 6.3 PDF and RAG pipeline

1.  Create document record.
2.  Issue short-lived pre-signed S3 upload URL.
3.  Browser uploads directly to private S3.
4.  Backend verifies upload metadata and queues extraction.
5.  PyMuPDF extracts text by page; OCR is used for image-only or
    poor-quality pages.
6.  Normalize text and preserve page references.
7.  Store pages and chunks with tenant/document ownership.
8.  Create embeddings in pgvector when semantic retrieval is enabled.
9.  Retrieve only relevant chunks for the selected chapter/task.
10. Pass retrieved passages as untrusted reference data to the agent.

RAG does not guarantee correctness. Require source references,
validation and teacher review.

### 6.4 AI safety and output validation

-   Separate system instructions from retrieved document text.
-   Treat uploaded content as untrusted; it may contain prompt
    injection.
-   Restrict agent tools and permissions.
-   Use Pydantic schemas and enumerated actions.
-   Never execute LLM-produced JavaScript, Python, SQL or shell
    commands.
-   Apply token/output limits, timeouts and retry policies.
-   Store prompt version, model, provider request ID, usage and output
    version.
-   Avoid sending unnecessary student personal data to LLM providers.
-   Regenerate only the changed section when possible.

### 6.5 Example lesson contract

``` json
{
  "schema_version": "1.0",
  "chapter_title": "The Circulatory System",
  "learning_objectives": [
    {
      "id": "lo_01",
      "text": "Identify the main chambers of the heart",
      "source_refs": [{"document_id": "uuid", "page": 12}]
    }
  ],
  "sections": [
    {
      "title": "The human heart",
      "body_markdown": "The heart is a muscular organ...",
      "key_terms": ["atrium", "ventricle"],
      "source_refs": [{"document_id": "uuid", "page": 12}]
    }
  ],
  "summary": ["The heart has four chambers..."],
  "visualization_candidates": [
    {
      "concept": "Heart chambers",
      "visualization_type": "anatomical_model",
      "learning_reason": "Students need to distinguish spatial structures."
    }
  ]
}
```

The example is an internal illustrative contract, not a
provider-specific payload. Pydantic is the canonical backend schema;
generate JSON Schema/TypeScript types for consumers.

------------------------------------------------------------------------

## 7. 3D Modelling and Scene Engine

The 3D engine must distinguish an **asset**, **scene**, **interaction**
and **animation**.

### 7.1 Three asset strategies

**A. Procedural 3D --- LLM + Three.js**

Use for predictable, mathematically defined scenes: - Geometry and
solids. - Solar-system demonstrations. - Basic molecules and atom
diagrams. - Physics experiments. - Mechanical demonstrations. - Spatial
concepts.

The LLM returns a declarative specification. A trusted renderer maps
allowed specification types to prebuilt components and algorithms.

**B. AI-generated assets --- Tripo/Meshy**

Use when procedural modelling is unsuitable and an appropriate asset
does not exist. Provider adapters must handle job creation, status,
output normalization, download, validation, cost and licensing metadata.

Do not assume generated models are scientifically accurate, correctly
segmented, rigged or suitable for every interaction. Verify provider
documentation, commercial rights, output formats, quotas and API terms.

**C. Existing reviewed asset library**

Prefer this for anatomy, skeletons, organs, complex machinery and
scientific models. Record license, attribution, source, allowed use and
review status.

### 7.2 Scene specification

LLMs must not generate arbitrary Three.js applications. They return a
versioned declarative scene document:

``` json
{
  "schema_version": "1.0",
  "scene_id": "scene_heart_01",
  "title": "Explore the Human Heart",
  "learning_objective_ids": ["lo_01"],
  "asset_refs": [{"asset_id": "human_heart_v1", "version": 1}],
  "camera": {
    "preset": "three_quarter",
    "min_distance": 2,
    "max_distance": 12
  },
  "components": [
    {
      "component_id": "left_ventricle",
      "mesh_name": "left_ventricle",
      "label": "Left ventricle",
      "actions": ["highlight", "show_explanation"],
      "explanation_ref": "explanation_left_ventricle"
    }
  ],
  "controls": ["rotate", "zoom", "select_component"],
  "animation_refs": ["blood_flow_01"]
}
```

The renderer resolves asset IDs and mesh names against approved asset
metadata. Do not trust arbitrary URLs or executable content in scene
JSON.

### 7.3 Scene architecture

``` mermaid
flowchart TD
    SPEC[Validated Scene Specification]
    RESOLVE[Scene Resolver]
    REG[Asset Registry and Version]
    LOAD[GLB Loader]
    VIEW[React Three Fiber Scene]
    INT[Raycast and Component Interaction]
    LABEL[Labels and Explanations]
    ANIM[Animation Timeline]
    EVENT[Learning Events]

    SPEC --> RESOLVE --> REG --> LOAD --> VIEW
    VIEW --> INT
    INT --> LABEL
    VIEW --> ANIM
    INT --> EVENT
    ANIM --> EVENT
```

### 7.4 Asset metadata

PostgreSQL stores: - Asset ID/version, name, description, subject and
category. - S3 object key, preview key, format, size and content hash. -
Component/mesh identifiers and supported interactions. - Animation
capabilities. - Provider/generation job. - License, source and
attribution. - Review/validation status and timestamps.

S3 stores GLB/glTF, textures, previews and other binary data.

### 7.5 Full-body anatomy experience

Plan a reusable human-body scene with selectable: - Skeletal system. -
Muscular system. - Circulatory system. - Respiratory system. - Digestive
system. - Nervous system. - Urinary system.

Capabilities: - Full-body overview. - System selection and
visibility/opacity controls. - Organ/component selection. - Labels and
explanations. - Camera focus. - Guided animations and checkpoints.

**Accuracy requirement:** use medically reviewed, properly licensed base
assets. Do not rely on unrestricted text-to-3D generation for a
complete, anatomically accurate body, organ connections, vessels or
nerves.

### 7.6 Animation engine

Animation instructions are validated data, not code. Initial allowlisted
actions may include: - `highlight_component` - `set_visibility` -
`set_opacity` - `move_along_path` - `rotate_component` -
`show_flow_particles` - `camera_focus` - `show_annotation` - `wait`

Example:

``` json
{
  "schema_version": "1.0",
  "animation_id": "blood_flow_01",
  "title": "Blood flow through the heart",
  "steps": [
    {
      "step": 1,
      "target_component": "right_atrium",
      "action": "highlight_component",
      "duration_ms": 2500,
      "explanation": "Blood enters the right atrium."
    },
    {
      "step": 2,
      "target_component": "right_ventricle",
      "action": "highlight_component",
      "duration_ms": 2500,
      "explanation": "Blood moves into the right ventricle."
    }
  ]
}
```

The renderer validates that targets exist and durations are bounded.
Provide play, pause, resume, restart, step-forward and reduced-motion
support.

### 7.7 3D performance

-   GLB/glTF as the standard format.
-   Compress geometry/textures where supported.
-   Apply polygon and texture budgets.
-   Lazy-load scenes and assets.
-   Load only selected anatomy systems where possible.
-   Use LOD when beneficial.
-   Dispose GPU resources on unmount.
-   Do not load large models on dashboard pages.
-   Test on representative student devices and mobile networks.
-   Provide accessible text explanations as an alternative to 3D.

------------------------------------------------------------------------

## 8. Database Design

### 8.1 Principles

-   PostgreSQL is the structured source of truth.
-   UUID primary keys and UTC timestamps.
-   Foreign keys, explicit deletion behavior and useful indexes.
-   JSONB only for versioned, schema-validated flexible documents such
    as scene specifications and AI output snapshots.
-   Store binaries in S3, not PostgreSQL.
-   Scope school-owned data by tenant.
-   Enforce authorization in application services; consider RLS as
    defense in depth.
-   Use Alembic migrations for every schema change.
-   Define retention and deletion policies.

### 8.2 Entity groups

  --------------------------------------------------------------------------
  Domain                  Tables                     Purpose
  ----------------------- -------------------------- -----------------------
  Identity                users, user_profiles,      Accounts and
                          roles, permissions,        authorization
                          role_permissions,          
                          user_roles                 

  Organization            schools,                   Tenancy and classrooms
                          school_memberships,        
                          classrooms,                
                          classroom_memberships,     
                          invitations                

  Learning                courses,                   Curriculum
                          course_enrollments,        
                          chapters, lessons,         
                          learning_objectives,       
                          lesson_versions            

  Documents               source_documents,          Sources and retrieval
                          document_pages,            
                          document_chunks            

  3D                      three_d_assets,            Models and scenes
                          three_d_asset_versions,    
                          three_d_scenes,            
                          three_d_scene_components   

  Animation               animations,                Guided sequences
                          animation_versions,        
                          animation_steps            

  Assessment              assessments, questions,    Questions and rubrics
                          answer_options,            
                          question_rubrics           

  Student work            assessment_attempts,       Submissions and
                          student_answers,           evaluation
                          evaluation_results         

  Progress                lesson_progress,           Learning evidence
                          chapter_progress,          
                          learning_gap_records       

  AI operations           ai_generation_jobs,        Execution and cost
                          ai_prompt_versions,        
                          ai_output_versions,        
                          ai_usage_records           

  Platform operations     audit_logs, notifications, Reliability and
                          idempotency_records        security
  --------------------------------------------------------------------------

### 8.3 ER diagram

``` mermaid
erDiagram
    USERS ||--o{ SCHOOL_MEMBERSHIPS : belongs_to
    SCHOOLS ||--o{ SCHOOL_MEMBERSHIPS : has
    SCHOOLS ||--o{ CLASSROOMS : contains
    CLASSROOMS ||--o{ CLASSROOM_MEMBERSHIPS : has
    USERS ||--o{ CLASSROOM_MEMBERSHIPS : joins

    USERS ||--o{ COURSES : creates
    SCHOOLS o|--o{ COURSES : owns
    COURSES ||--o{ COURSE_ENROLLMENTS : has
    USERS ||--o{ COURSE_ENROLLMENTS : enrolls
    COURSES ||--o{ CHAPTERS : contains
    CHAPTERS ||--o{ LESSONS : contains
    CHAPTERS ||--o{ LEARNING_OBJECTIVES : defines
    COURSES ||--o{ SOURCE_DOCUMENTS : references
    SOURCE_DOCUMENTS ||--o{ DOCUMENT_PAGES : extracts
    SOURCE_DOCUMENTS ||--o{ DOCUMENT_CHUNKS : chunks

    LESSONS ||--o{ THREE_D_SCENES : includes
    THREE_D_SCENES ||--o{ THREE_D_SCENE_COMPONENTS : contains
    THREE_D_ASSETS ||--o{ THREE_D_ASSET_VERSIONS : versions
    THREE_D_SCENES }o--o{ THREE_D_ASSETS : uses
    THREE_D_SCENES ||--o{ ANIMATIONS : includes
    ANIMATIONS ||--o{ ANIMATION_STEPS : contains

    CHAPTERS ||--o{ ASSESSMENTS : has
    ASSESSMENTS ||--o{ QUESTIONS : contains
    QUESTIONS ||--o{ ANSWER_OPTIONS : offers
    QUESTIONS ||--o{ QUESTION_RUBRICS : defines
    USERS ||--o{ ASSESSMENT_ATTEMPTS : submits
    ASSESSMENTS ||--o{ ASSESSMENT_ATTEMPTS : receives
    ASSESSMENT_ATTEMPTS ||--o{ STUDENT_ANSWERS : contains
    STUDENT_ANSWERS ||--o{ EVALUATION_RESULTS : evaluated_by

    USERS ||--o{ LESSON_PROGRESS : tracks
    LESSONS ||--o{ LESSON_PROGRESS : records
    USERS ||--o{ CHAPTER_PROGRESS : tracks
    CHAPTERS ||--o{ CHAPTER_PROGRESS : records
```

### 8.4 Table-level baseline

The following fields are the logical baseline; refine SQL types,
constraints and nullability in migrations.

**`users`** - `id UUID PK` - `email CITEXT UNIQUE NOT NULL` -
`identity_subject` for managed identity integration - `display_name`,
`status`, `email_verified_at` - `created_at`, `updated_at`

If using a managed identity provider, store its stable subject and do
not duplicate password management.

**`schools`** - `id UUID PK`, `name`, `slug`, `status`, timestamps.

**`school_memberships`** - `id UUID PK`, `school_id FK`, `user_id FK`,
`role_id FK`, `status`, `joined_at`. - Unique membership per
school/user.

**`classrooms`** - `id UUID PK`, `school_id FK`, `name`,
`academic_year`, `created_by FK`, `status`.

**`classroom_memberships`** - `id UUID PK`, `classroom_id FK`,
`user_id FK`, `membership_role`, `status`. - Unique classroom/user.

**`courses`** - `id UUID PK`, nullable `school_id FK`, `created_by FK`,
`title`, `description`, `subject`, `grade_level`, `status`,
`current_version`, timestamps.

**`course_enrollments`** - `id UUID PK`, `course_id FK`,
`student_id FK`, nullable `classroom_id FK`, `status`, `enrolled_at`. -
Unique course/student relationship as defined by product rules.

**`source_documents`** - `id UUID PK`, `course_id FK`, `uploaded_by FK`,
`original_filename`, `mime_type`, `size_bytes`, `s3_bucket`, `s3_key`,
`checksum`, `processing_status`, `page_count`, `created_at`.

**`document_pages`** - `id UUID PK`, `source_document_id FK`,
`page_number`, `extracted_text`, `extraction_method`,
`quality_status`. - Unique document/page.

**`document_chunks`** - `id UUID PK`, `source_document_id FK`,
`page_start`, `page_end`, `chunk_index`, `content`, `token_count`,
optional pgvector `embedding`, metadata JSONB. - Index document lookup
and vector retrieval.

**`chapters`** - `id UUID PK`, `course_id FK`, `title`, `description`,
`position`, `status`, `version`, timestamps.

**`lessons`** - `id UUID PK`, `chapter_id FK`, `title`, `position`,
`content_json JSONB`, `status`, `version`, timestamps.

**`learning_objectives`** - `id UUID PK`, `chapter_id FK`,
`objective_text`, `position`, `source_refs JSONB`, `created_at`.

**`lesson_versions`** - `id UUID PK`, `lesson_id FK`, `version_number`,
`content_snapshot JSONB`, `created_by`, `created_at`.

**`three_d_assets`** - `id UUID PK`, nullable `owner_school_id`,
`created_by`, `name`, `description`, `category`, `subject`,
`storage_key`, `preview_key`, `format`, `file_size_bytes`,
`content_hash`, `license_name`, `source_url`, `attribution_text`,
`review_status`, `provider`, `created_at`.

**`three_d_asset_versions`** - `id UUID PK`, `asset_id FK`,
`version_number`, `storage_key`, `metadata_json JSONB`, `created_at`. -
Unique asset/version.

**`three_d_scenes`** - `id UUID PK`, `lesson_id FK`, `title`,
`schema_version`, `scene_spec JSONB`, `status`, `version`, timestamps.

**`three_d_scene_components`** - `id UUID PK`, `scene_id FK`,
`component_key`, nullable `asset_id FK`, `mesh_name`, `label`,
`actions JSONB`, `explanation`. - Unique scene/component key.

**`animations`** - `id UUID PK`, `scene_id FK`, `title`,
`schema_version`, `animation_spec JSONB`, `status`, `version`.

**`animation_steps`** - `id UUID PK`, `animation_id FK`, `step_number`,
`target_component`, `action_type`, `parameters JSONB`, `duration_ms`,
`explanation`. - Unique animation/step.

**`assessments`** - `id UUID PK`, `chapter_id FK`, `title`,
`assessment_type`, `passing_score`, `max_attempts`, `status`, `version`.

**`questions`** - `id UUID PK`, `assessment_id FK`, `question_type`,
`question_text`, `points`, `difficulty`, `explanation_correct`,
`explanation_general`, nullable `learning_objective_id FK`, `position`,
`version`.

**`answer_options`** - `id UUID PK`, `question_id FK`, `option_text`,
`is_correct`, `position`. - Never expose correctness fields to students
before submission.

**`question_rubrics`** - `id UUID PK`, `question_id FK`,
`rubric_version`, `criteria_json JSONB`, `max_score`, `created_at`.

**`assessment_attempts`** - `id UUID PK`, `assessment_id FK`,
`student_id FK`, `attempt_number`, `status`, `started_at`,
`submitted_at`, `score`, `max_score`, `rubric_snapshot_version`.

**`student_answers`** - `id UUID PK`, `attempt_id FK`, `question_id FK`,
nullable `selected_option_id FK`, nullable `answer_text`,
`submitted_at`.

**`evaluation_results`** - `id UUID PK`, `student_answer_id FK`,
`rubric_version`, `suggested_score`, `final_score`, `feedback`,
`missing_concepts JSONB`, `confidence`, `review_status`, nullable
`reviewed_by FK`, `created_at`. - Keep AI suggestion and teacher-final
score separate.

**Progress** - `lesson_progress`: user, lesson, status, completion time,
last activity. - `chapter_progress`: user, chapter, status, completion
time, summary. - Unique user/target constraints.

**`ai_generation_jobs`** - `id UUID PK`, nullable `school_id`,
`requested_by`, `job_type`, `target_type`, `target_id`, `provider`,
`provider_task_id`, `status`, `attempt_count`, `input_snapshot JSONB`,
`output_reference`, `error_code`, lifecycle timestamps.

**`ai_usage_records`** - `id UUID PK`, `job_id FK`, `provider`, `model`,
`input_tokens`, `output_tokens`, `credits_used`, `estimated_cost`,
`currency`, `recorded_at`.

**`audit_logs`** - `id UUID PK`, nullable `actor_user_id`, nullable
`school_id`, `action`, `resource_type`, `resource_id`, `outcome`, safe
metadata JSONB, `created_at`.

### 8.5 Indexing

Start with indexes on: - All frequently joined/authorized foreign
keys. - `users.email`. - `school_memberships(school_id, user_id)`. -
`classroom_memberships(classroom_id, user_id)`. -
`courses(school_id, status)`. - `chapters(course_id, position)`. -
`lessons(chapter_id, position)`. -
`source_documents(course_id, processing_status)`. -
`document_chunks(source_document_id, chunk_index)`. -
`assessment_attempts(student_id, submitted_at)`. -
`student_answers(attempt_id, question_id)`. -
`lesson_progress(user_id, lesson_id)`. -
`ai_generation_jobs(status, created_at)`. -
`audit_logs(school_id, created_at)`.

Add vector indexes based on the selected pgvector operator and measured
retrieval workload. Validate query plans with representative data.

### 8.6 Tenant isolation

-   Resolve tenant context from authenticated membership, not
    client-supplied `school_id` alone.
-   Validate ownership on every object access.
-   Scope repository queries by tenant.
-   Consider PostgreSQL RLS as defense in depth.
-   If using RLS, set tenant context transactionally and test
    connection-pool behavior.
-   Test cross-tenant access explicitly.
-   Define teacher-owned draft behavior before school association.

------------------------------------------------------------------------

## 9. API Design

Use versioned REST endpoints under `/api/v1`.

### Conventions

-   JSON request/response.
-   UUID identifiers.
-   UTC ISO 8601 timestamps.
-   Consistent error envelope.
-   Pagination and allowlisted filtering/sorting.
-   Pydantic validation.
-   Object-level authorization in services.
-   Idempotency for retryable create/submit operations where needed.
-   No provider keys or secrets in browser responses.

Example error:

``` json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found.",
    "request_id": "req_123",
    "details": []
  }
}
```

### Endpoint map

  ------------------------------------------------------------------------
  Domain                              Example endpoints
  ----------------------------------- ------------------------------------
  Auth                                `POST /auth/login`, `/auth/logout`,
                                      `/auth/refresh`

  User                                `GET /users/me`, `PATCH /users/me`

  Schools                             `GET /schools`, `POST /schools`,
                                      `GET /schools/{id}`

  Classrooms                          `POST /classrooms`,
                                      `GET /classrooms/{id}`,
                                      `POST /classrooms/{id}/members`

  Courses                             `POST /courses`, `GET /courses`,
                                      `GET /courses/{id}`,
                                      `PATCH /courses/{id}`

  Enrolment                           `POST /courses/{id}/enrollments`,
                                      `GET /courses/{id}/students`

  Documents                           `POST /documents/upload-url`,
                                      `POST /documents/{id}/complete`,
                                      `GET /documents/{id}`

  Jobs                                `GET /jobs/{id}`

  Chapters                            `POST /courses/{id}/chapters`,
                                      `PATCH /chapters/{id}`,
                                      `POST /chapters/{id}/generate`

  Lessons                             `GET /chapters/{id}/lessons`,
                                      `PATCH /lessons/{id}`,
                                      `POST /lessons/{id}/publish`

  Scenes                              `POST /lessons/{id}/scenes`,
                                      `GET /scenes/{id}`,
                                      `PATCH /scenes/{id}`

  Assets                              `GET /assets`,
                                      `POST /assets/generation-jobs`,
                                      `GET /assets/{id}`

  Animations                          `POST /scenes/{id}/animations`,
                                      `GET /animations/{id}`

  Assessments                         `POST /chapters/{id}/assessments`,
                                      `GET /assessments/{id}`

  Submissions                         `POST /assessments/{id}/attempts`,
                                      `POST /attempts/{id}/submit`

  Evaluation                          `GET /answers/{id}/feedback`,
                                      `POST /evaluations/{id}/review`

  Progress                            `GET /students/me/progress`,
                                      `GET /courses/{id}/progress`

  Analytics                           `GET /classrooms/{id}/analytics`,
                                      `GET /students/{id}/insights`
  ------------------------------------------------------------------------

This is an endpoint map, not the final OpenAPI contract. Generate
TypeScript API types from FastAPI OpenAPI or a controlled shared schema
package. Backend Pydantic schemas remain canonical.

------------------------------------------------------------------------

## 10. Asynchronous Jobs and 3D API Handling

Never keep an HTTP request open while a provider generates a model or a
large AI workflow completes.

### Job lifecycle

``` mermaid
stateDiagram-v2
    [*] --> QUEUED
    QUEUED --> PROCESSING
    PROCESSING --> VALIDATING
    VALIDATING --> COMPLETED
    PROCESSING --> RETRYING: transient failure
    RETRYING --> PROCESSING
    PROCESSING --> FAILED: permanent or exhausted
    VALIDATING --> FAILED: invalid output
    QUEUED --> CANCELLED
```

### 3D generation workflow

1.  Teacher requests a model or scene.
2.  Search the approved asset library first.
3.  If no suitable asset exists, create a generation job.
4.  Queue Celery task.
5.  Worker calls provider adapter.
6.  Persist provider task ID and normalized status.
7.  Poll with bounded backoff or use verified webhook support.
8.  Download completed output to controlled temporary storage.
9.  Validate file type, size and GLB structure.
10. Inspect metadata and optimize where safe.
11. Upload to private S3.
12. Create asset/version records.
13. Mark job complete and notify frontend.
14. Teacher previews and approves before publication.

Reliability requirements: - Bounded retries with exponential backoff and
jitter. - Distinguish transient and permanent errors. - Provider request
timeouts and rate-limit handling. - Idempotent job processing. - Avoid
duplicate billing on retry by checking provider task state. - Record
provider request IDs and cost evidence. - Do not assume webhook support
until verified. - Provide failed-job inspection and safe retry.

For MVP, poll `GET /api/v1/jobs/{id}` at a controlled interval. Add SSE
when useful.

------------------------------------------------------------------------

## 11. Frontend Architecture and 3D UX

### 11.1 Visual direction

Create a premium, immersive but academically trustworthy learning
product: - 3D content is the visual focus. - Clean typography and strong
hierarchy. - Calm academic palette, deep navy and neutral surfaces. -
Restrained accent colors and subtle motion. - Readable chapter
navigation and lesson content. - Responsive teacher and student
experiences. - Accessible controls and keyboard navigation. - Clear
loading, empty, error and generation states.

Avoid excessive gradients and distracting animation.

### 11.2 Teacher pages

1.  Dashboard and recent courses.
2.  Course library and course creation.
3.  Source upload and extraction status.
4.  Chapter outline review.
5.  AI generation progress.
6.  Chapter/lesson editor.
7.  3D asset library.
8.  Scene preview/editor.
9.  Animation preview.
10. Assessment and rubric builder.
11. Classroom/student management.
12. Student/class analytics.
13. Settings.

### 11.3 Student pages

1.  Dashboard and assigned courses.
2.  Course overview.
3.  Chapter navigation.
4.  Lesson viewer.
5.  Full-screen 3D learning environment.
6.  Quiz and short-answer interface.
7.  Explain Further feedback.
8.  Results and assessment history.
9.  Personal progress and revision recommendations.

### 11.4 3D classroom layout

``` text
+---------------------------------------------------------------+
| Course / Chapter breadcrumb                   Progress / Exit |
+--------------------+--------------------------+---------------+
| Chapter navigation|                          | Explanation   |
| Learning steps     |       3D VIEWPORT        | / Labels      |
|                    |                          | Selected part |
+--------------------+--------------------------+---------------+
| Animation timeline       Play / Pause / Step       Fullscreen |
+---------------------------------------------------------------+
```

On mobile, use a collapsible chapter drawer and bottom sheet for
explanations/controls. Do not simply shrink the desktop layout.

### 11.5 Frontend folders

``` text
frontend/src/
  app/
    router/
    providers/
    layouts/
  features/
    auth/
    dashboard/
    courses/
    documents/
    chapters/
    lessons/
    three-d/
    animations/
    assessments/
    progress/
    analytics/
    classrooms/
  components/
    ui/
    feedback/
    navigation/
  api/
    client.ts
    generated/
  hooks/
  stores/
  schemas/
  styles/
  types/
  tests/
```

3D module:

``` text
features/three-d/
  components/
    SceneCanvas.tsx
    SceneToolbar.tsx
    ComponentLabel.tsx
    ExplanationPanel.tsx
    AnimationTimeline.tsx
  runtime/
    SceneResolver.ts
    AssetLoader.ts
    InteractionRegistry.ts
    AnimationRunner.ts
    ResourceDisposer.ts
  schemas/
    scene.schema.ts
    animation.schema.ts
  hooks/
  tests/
```

The runtime consumes validated contracts. It does not own educational
prompts.

------------------------------------------------------------------------

## 12. Security Architecture and Threat Model

Security is required from Phase 0.

### Authentication

-   Use a managed identity service such as AWS Cognito if regional, UX
    and cost requirements fit.
-   Alternatively use a proven identity library and secure session
    design.
-   Email verification where appropriate.
-   Secure reset and logout.
-   Short-lived access tokens and carefully handled refresh sessions.
-   Rate limiting and optional MFA/SSO later.
-   Never implement password cryptography casually.

### Authorization

-   Central permission service/dependency.
-   Role and permission model.
-   Object-level authorization for every course, document, asset and
    student record.
-   Students access only enrolled/published content and their own
    submissions.
-   Teachers access only permitted courses/classrooms.
-   School admins are organization-scoped.
-   Never trust role, user ID or school ID supplied by the client.
-   Test IDOR explicitly.

### Data and file security

-   TLS in transit; encryption at rest.
-   Private S3 buckets and short-lived signed URLs.
-   Upload size and content-type allowlists.
-   Validate file signatures, not only extensions.
-   Scan uploads where appropriate.
-   Prevent path traversal and unsafe archive extraction.
-   Use Secrets Manager or equivalent.
-   Never commit secrets.
-   Minimize personal data in logs.

### AI threats

  -----------------------------------------------------------------------
  Threat                              Control
  ----------------------------------- -----------------------------------
  Prompt injection in PDF             Treat document as untrusted data;
                                      isolate instructions

  Hallucinated content                Source references, validation and
                                      teacher review

  Unsafe generated actions            Enumerated schema actions; no
                                      arbitrary code

  Cross-school retrieval leak         Tenant-scoped retrieval and
                                      authorization

  Student data sent to model          Minimize/redact; review provider
                                      terms and lawful basis

  Excessive API spend                 Quotas, rate limits and budgets

  Malicious asset metadata            Sanitize metadata and validate
                                      files

  Incorrect AI grading                Versioned rubrics, confidence,
                                      teacher override and audit
  -----------------------------------------------------------------------

### Student privacy and GDPR

-   Establish controller/processor roles and appropriate data-processing
    agreements.
-   Define lawful basis and purpose limitation with school customers.
-   Minimize student data.
-   Define retention, export and deletion.
-   Restrict analytics to authorized staff.
-   Do not use identifiable student data to train models without a valid
    legal basis and authorization.
-   Evaluate whether a DPIA is required.
-   Use age-appropriate notices and controls.
-   Review applicable Norwegian and EU requirements with qualified
    privacy/legal advisers before school deployment.

### Security tests

-   Cross-school access.
-   Student access to another student's answer.
-   Teacher access to unassigned classroom.
-   Unpublished content access.
-   Forged asset IDs.
-   Expired signed URLs.
-   Malformed/oversized PDFs.
-   Prompt injection in document text.
-   Invalid scene actions and unknown component IDs.
-   Secret leakage in logs and API responses.

------------------------------------------------------------------------

## 13. Performance and Cost Strategy

### Cost drivers

  -----------------------------------------------------------------------
  Area                    Driver                  Control
  ----------------------- ----------------------- -----------------------
  LLM                     Tokens and model        Retrieval, caching,
                          selection               model routing and
                                                  output limits

  3D generation           Provider credits and    Reuse, asset search and
                          quality                 approval

  OCR                     Pages processed         Run only when
                                                  extraction is
                                                  inadequate

  S3                      Storage/downloads       Compression, lifecycle
                                                  and deduplication

  CDN/egress              GLB and texture         Optimization and
                          delivery                caching

  Compute                 API and worker runtime  Small containers and
                                                  queue limits

  Database                Capacity and queries    Indexes, pooling and
                                                  optimization

  Redis                   Queue/cache usage       TTLs and bounded queues
  -----------------------------------------------------------------------

### Cost controls

-   Reuse approved assets where licensing permits.
-   Search asset library before generation.
-   Generate once, review once and publish versioned assets.
-   Cache lessons and reusable explanations.
-   Regenerate only changed sections.
-   Use lower-cost models for simple tasks where quality permits.
-   Set per-school and global budgets.
-   Track cost per course, chapter, asset and activity.
-   Warn teachers before expensive regeneration.

Do not state a fixed monthly cost before choosing AWS region, database
sizing, traffic, storage, model usage, 3D generation volume and egress.
Prepare development, pilot and growth estimates using current provider
calculators.

### Proposed pilot performance objectives

These are targets to validate, not guarantees: - Common API reads: p95
under 500 ms at pilot load, excluding external providers. - Normal API
writes: p95 under 800 ms at pilot load. - Dashboard usable content:
target under 3 seconds on representative broadband. - Optimized 3D scene
first usable render: target under 5 seconds on representative devices. -
No large GLB download on pages that do not use 3D.

Measure before optimizing.

------------------------------------------------------------------------

## 14. Monorepo and Four-Developer Collaboration

### 14.1 Repository structure

``` text
edu3d-ai/
  frontend/
    src/
    public/
    tests/
    package.json
  backend/
    app/
      api/
      core/
      database/
      modules/
      integrations/
      workers/
      schemas/
    migrations/
    tests/
    pyproject.toml
  packages/
    api-contracts/
    three-d-contracts/
  infrastructure/
    docker/
    aws/
    monitoring/
  scripts/
  docs/
  .github/
    workflows/
  docker-compose.yml
  .env.example
  .gitignore
  README.md
```

Backend Pydantic/OpenAPI is the source of truth for REST types.
`three-d-contracts` holds versioned scene/animation schemas and
generated TypeScript types.

### 14.2 Team allocation

  -----------------------------------------------------------------------
  Developer               Ownership               Deliverables
  ----------------------- ----------------------- -----------------------
  1 --- Frontend/UX       `frontend/`             Teacher/student UI,
                                                  design system, course
                                                  workflows, 3D viewer
                                                  integration

  2 --- Backend/DB        Backend core modules    FastAPI, database,
                          and migrations          identity,
                                                  course/document APIs,
                                                  permissions

  3 --- AI                AI engine and AI        RAG, LangGraph,
                          integrations            prompts,
                                                  lesson/assessment
                                                  generation, evaluation

  4 --- 3D                3D frontend runtime, 3D Scene runtime, asset
                          contracts and provider  library, provider
                          adapter in coordination integration, animations
                          with backend            
  -----------------------------------------------------------------------

### 14.3 Collaboration rules

-   Record architectural decisions as ADRs.
-   Backend owns REST/OpenAPI contracts.
-   AI owns prompt and agent contracts, reviewed against canonical
    schemas.
-   3D owns rendering and animation contracts, reviewed with AI/backend.
-   Frontend consumes generated API types and scene contracts.
-   One designated migration owner merges schema changes.
-   Shared contract changes require review by affected developers.
-   Short-lived feature branches and pull requests.
-   No direct pushes to `main`.
-   CI must pass before merge.
-   Keep PRs small and update documentation.

### 14.4 Definition of done

A feature is done only when acceptance criteria pass, authorization is
tested, loading/empty/error states exist, tests pass, API/schema docs
are updated, migrations are included if needed, logs contain no secrets,
and the feature is integrated with main.

------------------------------------------------------------------------

## 15. Dependency-Based Implementation Roadmap

Phases are ordered by technical dependencies. Work can be parallelized
after contracts are agreed.

### Phase 0 --- Architecture and foundation

**Objective:** Agree on architecture and establish collaboration.

Tasks: - Approve stack and module boundaries. - Define API/error
conventions. - Define identity and tenant model. - Define
scene/animation schemas. - Create monorepo and branch protection. - Add
linting, formatting, type checking and CI. - Add Docker Compose. -
Create ADR process and developer instructions.

Deliverables: repo skeleton, architecture docs, CI, local environment
and shared contracts.

**Dependencies:** None.\
**Owners:** All, coordinated by technical lead.\
**Exit:** All developers can run the same repo; contracts are approved.

### Phase 1 --- Identity, database and app foundation

Tasks: - PostgreSQL and migrations. - FastAPI and React shells. -
Identity provider integration. - User, role and permission model. -
School/classroom foundations. - Authorization dependencies and tenant
scoping. - Audit baseline. - Generated API types.

Deliverables: login, protected routes, migration baseline, permission
tests.

**Dependencies:** Phase 0.\
**Lead:** Backend/DB; frontend integrates.\
**Exit:** Test users can sign in and access only authorized resources.

### Phase 2 --- Course, document and chapter foundations

Tasks: - Course CRUD and ownership. - Classroom/enrolment foundations. -
Private S3 and upload URL flow. - Document metadata and completion
endpoint. - PDF extraction and page text storage. - Chapter and lesson
CRUD. - Basic teacher course editor. - Document processing
status/errors.

Deliverables: teacher creates course, uploads PDF, inspects extraction
and manages chapters.

**Dependencies:** Phase 1.\
**Exit:** Secure course and source-document lifecycle works without AI.

### Phase 3 --- AI course and lesson generation

Tasks: - LLM provider interface. - Prompt/version registry. - LangGraph
workflow. - Document analysis and chapter outline agents. - Lesson
generation. - Pydantic schemas and validation. - Source
references/RAG. - Celery generation jobs. - Teacher review/edit/approve
UI. - Token and cost logging.

Deliverables: PDF-to-outline and chapter-to-lesson workflows, citations,
section regeneration and approval gate.

**Dependencies:** Phases 1--2.\
**Lead:** AI, supported by backend and frontend.\
**Exit:** Content is editable, schema-valid, source-grounded and
unpublished until approved.

### Phase 4 --- 3D viewer, asset registry and scene contracts

Tasks: - Finalize scene JSON schema. - Asset metadata and license
fields. - GLB loader and React Three Fiber canvas. - Orbit/zoom
controls. - Component selection and labels. - Explanation panel. - Scene
resolver and validation. - One approved GLB and one procedural scene. -
Resource cleanup and loading/error states.

Deliverables: working 3D classroom and selectable components.

**Dependencies:** Phase 1 contracts; lesson integration from Phase 3.
Viewer can use fixtures in parallel.\
**Exit:** Validated scene renders and interactions work.

### Phase 5 --- Scene planning and provider integration

Tasks: - 3D scene planning agent. - Asset search/reuse. - Provider
adapter interface. - Tripo/Meshy adapters after API verification. -
Celery generation jobs. - Provider task status and retries. - Output
download and validation. - GLB storage and asset versioning. - Cost
tracking and teacher preview.

Deliverables: AI proposes scene; system reuses or generates asset;
teacher reviews it.

**Dependencies:** Phases 2--4.\
**Exit:** Provider details remain behind adapters; jobs are traceable
and recoverable.

### Phase 6 --- Animation engine

Tasks: - Animation schema and action registry. - Timeline runner. -
Highlight/visibility/camera/annotation actions. - Guided step
explanations. - Playback controls. - Reduced-motion support. - Animation
validation and tests.

Deliverables: one complete guided educational animation.

**Dependencies:** Phase 4; Phase 5 for generated assets where needed.\
**Exit:** Only supported actions execute and all targets are validated.

### Phase 7 --- Student learning and progress

Tasks: - Student dashboard and course access. - Chapter navigation and
lesson viewer. - 3D classroom integration. - Lesson completion events. -
Chapter progress and revision navigation. - Responsive/accessibility
improvements.

Deliverables: student completes a published chapter and progress
persists.

**Dependencies:** Phases 1--4; Phase 6 for animation-enabled lessons.\
**Exit:** Full student learning workflow works.

### Phase 8 --- Assessments and Explain Further

Tasks: - Assessment/question models. - Assessment generation. -
Multiple-choice and short-answer UI. - Answer keys and editable
rubrics. - Submission/attempt lifecycle. - AI evaluation. - Separate
suggested score from final score. - Explain Further. - Link feedback to
lesson/scene. - Teacher review and override. - Assessment history.

Deliverables: quiz, short-answer feedback, explanation and auditable
teacher override.

**Dependencies:** Phases 2--3 and 7.\
**Exit:** Secure, traceable assessment workflow with versioned rubric.

### Phase 9 --- Teacher analytics and knowledge gaps

Tasks: - Student performance views. - Chapter/objective performance. -
Common incorrect responses. - Incomplete work. - Knowledge-gap
records. - Teacher insights and revision recommendations. - Privacy
thresholds for aggregated views.

Deliverables: individual progress and classroom concept-level insight.

**Dependencies:** Phase 8 and persisted progress.\
**Exit:** Analytics derive from stored evidence and enforce
authorization.

### Phase 10 --- Pilot hardening and deployment

Tasks: - Threat-model review. - Cross-tenant and IDOR tests. - Upload
and asset validation. - Rate limits and quotas. - Secrets manager. -
Backup and restore tests. - S3 access/lifecycle policies. - Monitoring
and logging. - Performance and GLB optimization. - CI/CD deployment. -
Production configuration and rollback. - Privacy review with qualified
advisers.

Deliverables: deployed pilot, runbook, security results, restore
evidence and cost limits.

**Dependencies:** Core phases 1--9. Security work continues from Phase
1.\
**Exit:** Observable, recoverable pilot with no known critical
authorization/security issues.

### Phase 11 --- Future improvements

-   Full-body anatomy library.
-   More subjects and curriculum mapping.
-   Multilingual learning.
-   Voice narration and speech interaction.
-   Personalized AI tutoring and adaptive difficulty.
-   Advanced scientific simulations.
-   Collaborative 3D classrooms.
-   LMS integrations.
-   School SSO and institutional reporting.
-   VR/AR.
-   Content marketplace.
-   Subscription/billing.
-   Advanced school analytics.
-   Mobile applications if validated by usage.

------------------------------------------------------------------------

## 16. Parallel Work Plan

  ---------------------------------------------------------------------------------------------------------
  Phase          Developer 1:      Developer 2: Backend/DB Developer 3: AI                Developer 4: 3D
                 Frontend                                                                 
  -------------- ----------------- ----------------------- ------------------------------ -----------------
  0              UI shell and      Repo/backend/DB         AI contracts                   Scene contracts
                 standards         foundation                                             and 3D spike

  1              Auth/dashboard    Identity, permissions,  Prompt/schema design           Viewer prototype
                 shell             migrations                                             with fixtures

  2              Course/document   Course, S3 and PDF APIs Extraction/analysis            Asset
                 UI                                        preparation                    registry/viewer
                                                                                          foundation

  3              AI review/editor  Job APIs and            Agents, RAG, generation        Scene planner
                 UI                persistence                                            contract

  4              3D classroom UI   Asset/scene APIs        Scene output integration       Viewer, resolver,
                                                                                          interactions

  5              Generation        Provider jobs and       Scene planning quality         Tripo/Meshy
                 progress UI       storage                                                adapters

  6              Animation         Animation persistence   Animation plan generation      Timeline and
                 controls                                                                 action runtime

  7              Student learning  Progress APIs           Learning context               3D learning
                 UI                                                                       integration

  8              Assessment UI     Submission/evaluation   Questions/evaluation/Explain   Scene-linked
                                   APIs                    Further                        revision

  9              Analytics UI      Aggregation APIs        Insight generation             3D engagement
                                                                                          events if useful

  10             UX/performance QA Security/deployment     AI safety/cost QA              Asset/rendering
                                                                                          QA
  ---------------------------------------------------------------------------------------------------------

### Contract freeze points

Before parallel implementation, approve: 1. Phase 0: repository, API
conventions and domain boundaries. 2. Phase 1: identity and tenant
contracts. 3. Phase 2: course, chapter, lesson and document contracts.
4. Phase 3: AI job and generated lesson contracts. 5. Phase 4: asset,
scene and animation contracts. 6. Phase 8: assessment, submission and
evaluation contracts.

Contract changes after a freeze require an ADR and coordination with
affected developers.

------------------------------------------------------------------------

## 17. Testing and Quality Assurance

### Backend

-   Unit and service tests.
-   Database/repository integration tests.
-   API contract tests.
-   Permission and tenant isolation tests.
-   Celery task tests.
-   Retry/idempotency tests.
-   Migration tests from an empty database.

### Frontend

-   Component and form tests.
-   Route authorization tests.
-   API loading/error/empty states.
-   Course and assessment workflow tests.
-   3D interaction tests.
-   Accessibility checks.

### AI

-   Schema conformance.
-   Source citation coverage.
-   Unsupported-claim review.
-   Prompt-injection tests.
-   Question/answer consistency.
-   Rubric evaluation consistency.
-   Explain Further usefulness.
-   Token, cost and latency tracking.
-   Human-reviewed regression fixtures.

### 3D

-   Valid/invalid GLB loading.
-   Missing asset handling.
-   Unknown component handling.
-   Scene schema validation.
-   Animation target validation.
-   GPU resource cleanup.
-   Browser/mobile performance.
-   Reduced-motion behavior.

### End-to-end acceptance

``` mermaid
flowchart TD
    T[Teacher registers]
    C[Creates course]
    U[Uploads PDF]
    A[AI extracts chapters]
    R[Teacher reviews]
    L[AI generates lesson]
    S[AI plans 3D scene]
    P[Teacher approves and publishes]
    ST[Student opens course]
    V[Student explores 3D]
    Q[Student completes assessment]
    F[Student receives feedback]
    AN[Teacher reviews analytics]

    T --> C --> U --> A --> R --> L --> S --> P
    P --> ST --> V --> Q --> F --> AN
```

------------------------------------------------------------------------

## 18. Infrastructure and Deployment

### Local development

Docker Compose should provide: - PostgreSQL with pgvector extension. -
Redis. - FastAPI. - Celery worker. - React frontend.

Provide seed data and sample assets with clear licenses. Use separate
credentials and `.env` files per environment; commit only
`.env.example`.

### Initial AWS pilot

Potential components: - Managed container hosting for FastAPI. -
Separate worker container/process for Celery. - Managed PostgreSQL. -
Managed Redis if justified. - Private S3 bucket. - CDN for cacheable
assets; private assets still require authorization. - Secrets Manager. -
CloudWatch or equivalent logs/metrics. - GitHub Actions for CI/CD.

Select exact AWS services after comparing region, service availability,
operational burden and current prices. Do not use Kubernetes for the
initial pilot.

### Environments

-   `local`: Docker Compose and test credentials.
-   `development`: shared integration.
-   `staging`: production-like acceptance.
-   `production`: restricted access and controlled releases.

Each environment has separate credentials, buckets, databases and
provider keys.

### CI/CD

On pull request: 1. Format/lint. 2. Frontend type check. 3. Backend
lint/type checks. 4. Unit tests. 5. Integration tests where configured.
6. OpenAPI and scene schema validation. 7. Build images. 8.
Dependency/security scanning.

On release: 1. Build immutable images. 2. Deploy staging. 3. Smoke
tests. 4. Approve production. 5. Apply backward-compatible migrations.
6. Deploy API and workers. 7. Verify health and monitor. 8. Keep
rollback procedure.

------------------------------------------------------------------------

## 19. Monitoring and Operations

Track: - API latency and error rates. - Database connections and slow
queries. - Celery queue depth and task age. - Job success/failure/retry
rates. - LLM token usage and cost. - 3D provider credits and latency. -
Asset download latency/failures. - 3D load time and client
performance. - Assessment evaluation latency. - Authentication failures
and suspicious access.

Use request/correlation IDs across API calls and background jobs.

Never log passwords, tokens, provider secrets or unnecessary student
data.

Create runbooks for: - Provider outage. - Stuck generation job. - Queue
backlog. - PDF extraction failure. - Invalid GLB output. - Database
restore. - Compromised credentials. - Unexpected AI cost spike.

------------------------------------------------------------------------

## 20. Future Architecture Extensions

  -----------------------------------------------------------------------
  Capability                          Foundation required now
  ----------------------------------- -----------------------------------
  Full-body anatomy                   Asset versioning, component IDs,
                                      visibility and camera focus

  New 3D providers                    Provider adapter and normalized
                                      jobs

  More LLM providers                  LLM adapter and prompt versioning

  Adaptive learning                   Objectives, answer evidence and
                                      progress history

  Personalized tutoring               Tenant-scoped RAG and student
                                      privacy

  Voice explanations                  Lesson contracts and audio storage

  Multilingual learning               Locale-aware content versions

  VR/AR                               Device-independent scene specs and
                                      interaction abstraction

  LMS integration                     Stable course/user identifiers and
                                      integration API

  Content marketplace                 Asset licensing, ownership and
                                      attribution

  School subscriptions                Organization ownership, usage
                                      metering and billing boundaries

  Collaborative learning              Classroom membership and real-time
                                      event model

  Advanced analytics                  Event definitions, privacy
                                      thresholds and aggregation
  -----------------------------------------------------------------------

Potential future service extraction candidates---only when
justified---include document processing, AI orchestration, 3D generation
and analytics workers.

------------------------------------------------------------------------

## 21. Required Documentation

Maintain these files under `docs/`:

1.  `SYSTEM_OVERVIEW.md`
2.  `SYSTEM_ARCHITECTURE.md`
3.  `DATABASE_DESIGN.md`
4.  `DATABASE_ER_DIAGRAM.md`
5.  `API_SPECIFICATION.md`
6.  `AI_AGENT_ARCHITECTURE.md`
7.  `AI_PROMPT_AND_SCHEMA_DESIGN.md`
8.  `THREE_D_ENGINE_DESIGN.md`
9.  `THREE_D_ASSET_PIPELINE.md`
10. `ANIMATION_ENGINE_DESIGN.md`
11. `FRONTEND_DESIGN.md`
12. `BACKEND_ARCHITECTURE.md`
13. `SECURITY_ARCHITECTURE.md`
14. `INFRASTRUCTURE_AND_DEPLOYMENT.md`
15. `COST_ESTIMATION.md`
16. `DEVELOPMENT_ROADMAP.md`
17. `TEAM_RESPONSIBILITY.md`
18. `CODING_STANDARDS.md`
19. `TESTING_STRATEGY.md`
20. `FUTURE_ENHANCEMENTS.md`

This README is the high-level source of truth. Detailed documents expand
it and must not contradict it.

------------------------------------------------------------------------

## 22. Open Decisions Requiring Approval

Do not invent answers to these decisions. Record approved decisions as
Architecture Decision Records (ADRs).

1.  **Identity:** Cognito or another managed identity provider? Confirm
    UX, region, cost and integration.
2.  **Tenant model:** School organizations immediately, or teacher-owned
    courses first with school ownership supported in the schema?
3.  **LLM:** Confirm current OpenAI model, structured output support,
    data controls and pricing.
4.  **Orchestration:** Is LangGraph justified for the first workflow, or
    is a simpler orchestrator sufficient?
5.  **3D providers:** Verify Tripo/Meshy API capabilities, commercial
    rights, pricing, formats, polling/webhooks and rate limits.
6.  **Spline:** Prototype/authoring only, or a defined production role?
    Do not assume it replaces the custom runtime.
7.  **Anatomy:** Select a medically reviewed, licensed asset source
    before full-body anatomy work.
8.  **Assessment policy:** AI advisory only, or may it contribute to
    final scores under teacher-controlled settings?
9.  **Privacy:** Confirm age group, school/customer responsibilities,
    retention, lawful basis and agreements.
10. **Cloud region:** Select based on customer requirements, data
    residency, availability and cost.
11. **Pilot scope:** Select one subject and one complete chapter.
12. **Budget:** Set monthly LLM, 3D generation, cloud and bandwidth
    limits.

------------------------------------------------------------------------

## 23. MVP Definition of Done

The MVP is successful when a teacher can upload a source, generate and
edit a chapter, publish a lesson with an interactive 3D experience, and
see how students performed.

### Must work end to end

-   Teacher authentication and course creation.
-   PDF upload and extraction.
-   Chapter outline generation.
-   Teacher editing and approval.
-   Lesson generation with source references.
-   One interactive 3D scene using a known GLB or procedural model.
-   At least one guided animation.
-   Chapter quiz and short-answer question.
-   Answer explanation and Explain Further.
-   Student progress persistence.
-   Basic teacher performance view.
-   Secure access checks and auditable AI/3D jobs.

### Explicitly out of scope for first MVP

-   Unrestricted generation of every scientifically accurate 3D model.
-   Full anatomy library across all body systems.
-   VR/AR.
-   Complex collaborative editing.
-   Full school administration suite.
-   Billing automation.
-   Microservices and Kubernetes.
-   Autonomous grading without teacher oversight.

------------------------------------------------------------------------

## 24. Final Engineering Direction

Beyond Books is built around four connected capabilities:

1.  **Educational intelligence:** Understand source material and produce
    accurate, structured learning content.
2.  **3D scene intelligence:** Decide what should be visualized and
    express it as a safe, versioned scene specification.
3.  **Interactive rendering:** Resolve approved assets and render
    reliable 3D interactions and animations.
4.  **Learning evidence:** Assess student understanding and provide
    useful, reviewable feedback.

The critical system contract is the **versioned 3D scene specification**
between the AI workflow, backend asset registry and frontend renderer.
The AI team should not implement rendering, and the 3D team should not
own educational prompts.

The critical operational contract is the **asynchronous generation job**
between API, workers and external providers. Every long-running
operation must be traceable, retry-safe, cost-aware and recoverable.

The critical educational contract is the **teacher-approved content and
rubric version**. Published content and student evaluations must retain
the versions on which they were based.

Build a complete vertical slice first, then expand by dependency. Prefer
one reliable, accurate and polished chapter experience over many
incomplete features.

**Upload. Generate. Explore. Understand. Assess. Improve.**
