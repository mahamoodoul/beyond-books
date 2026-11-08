/* AUTO-GENERATED from backend OpenAPI — do not edit. Run `npm run api:types`. */

export type Calls = number;
export type EstimatedCostUsd = number | null;
export type InputTokens = number;
export type OutputTokens = number;
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AccountType".
 */
export type AccountType = "teacher" | "student";
export type Id = string;
export type JoinCode = string | null;
export type Role = "teacher" | "student";
export type SchoolName = string | null;
export type Status = string;
export type Subject = string | null;
export type Title = string;
export type Id1 = string;
export type JoinCode1 = string | null;
export type Name = string;
export type Role1 = string;
export type Courses = AffiliationCourse[];
export type Schools = AffiliationSchool[];
export type AnimationId = string;
export type SchemaVersion = "1.0";
/**
 * @minItems 1
 * @maxItems 200
 */
export type Steps = [
  (
    | HighlightStep
    | SetVisibilityStep
    | SetOpacityStep
    | MoveAlongPathStep
    | RotateComponentStep
    | FlowParticlesStep
    | CameraFocusStep
    | AnnotationStep
    | WaitStep
  ),
  ...(
    | HighlightStep
    | SetVisibilityStep
    | SetOpacityStep
    | MoveAlongPathStep
    | RotateComponentStep
    | FlowParticlesStep
    | CameraFocusStep
    | AnnotationStep
    | WaitStep
  )[]
];
export type Action = "highlight_component";
export type DurationMs = number;
export type Explanation = string | null;
export type Step = number;
export type TargetComponent = string;
export type Action1 = "set_visibility";
export type DurationMs1 = number;
export type Explanation1 = string | null;
export type Step1 = number;
export type TargetComponent1 = string;
export type Visible = boolean;
export type Action2 = "set_opacity";
export type DurationMs2 = number;
export type Explanation2 = string | null;
export type Opacity = number;
export type Step2 = number;
export type TargetComponent2 = string;
export type Action3 = "move_along_path";
export type DurationMs3 = number;
export type Explanation3 = string | null;
export type PathId = string;
export type Step3 = number;
export type TargetComponent3 = string;
export type Action4 = "rotate_component";
export type Axis = "x" | "y" | "z";
export type Degrees = number;
export type DurationMs4 = number;
export type Explanation4 = string | null;
export type Step4 = number;
export type TargetComponent4 = string;
export type Action5 = "show_flow_particles";
export type DurationMs5 = number;
export type Explanation5 = string | null;
export type PathId1 = string;
export type Step5 = number;
export type TargetComponent5 = string;
export type Action6 = "camera_focus";
export type DurationMs6 = number;
export type Explanation6 = string | null;
export type Step6 = number;
export type TargetComponent6 = string;
export type Action7 = "show_annotation";
export type DurationMs7 = number;
export type Explanation7 = string;
export type Step7 = number;
export type TargetComponent7 = string | null;
export type Action8 = "wait";
export type DurationMs8 = number;
export type Explanation8 = string | null;
export type Step8 = number;
export type Title1 = string;
export type Id2 = string;
export type Origin = string;
export type Problems = string[];
export type SceneId = string;
export type Title2 = string;
export type Version = number;
export type ExpectedVersion = number;
export type AnswerText = string | null;
export type QuestionKey = string;
export type SelectedOptionKey = string | null;
export type AiFeedback = string | null;
export type AiSuggestedScore = number | null;
export type AnswerId = string;
export type AnswerText1 = string | null;
export type AutoScore = number | null;
export type CorrectOptionKey = string | null;
export type EvaluationStatus = string | null;
export type ExplainFurther = {
  [k: string]: unknown;
} | null;
export type Explanation9 = string | null;
export type FinalScore = number | null;
export type IsCorrect = boolean | null;
export type LessonId = string | null;
export type MissingConcepts = string[];
export type Points = number;
export type QuestionKey1 = string;
export type QuestionText = string;
export type QuestionType = string;
export type SelectedOptionKey1 = string | null;
export type TeacherFeedback = string | null;
/**
 * @minItems 1
 * @maxItems 50
 */
export type Chapters = [OutlineChapterIn, ...OutlineChapterIn[]];
export type Description = string;
/**
 * @maxItems 20
 */
export type Objectives = string[];
export type DocumentId = string;
export type PageEnd = number;
export type PageStart = number;
/**
 * @maxItems 20
 */
export type SourceRefs = ChapterSourceRef[];
export type Title3 = string;
/**
 * @minItems 2
 * @maxItems 10
 */
export type Chapters1 = [OutlineChapterIn, OutlineChapterIn, ...OutlineChapterIn[]];
/**
 * Delete the original chapter (only if it has no content)
 */
export type RemoveOriginal = boolean;
export type CaseSensitive = boolean;
export type ClozeText = string;
export type Difficulty = "easy" | "medium" | "hard";
/**
 * @maxItems 6
 */
export type Distractors = string[];
export type ExplanationCorrect = string;
export type ExplanationGeneral = string;
export type Key = string | null;
export type Text = string;
/**
 * @maxItems 10
 */
export type Items = ItemIn[];
export type Key1 = string | null;
export type LearningObjectiveId = string | null;
export type LessonId1 = string | null;
export type ModelAnswer = string;
export type NumericAnswer = number | null;
export type IsCorrect1 = boolean;
export type Key2 = string | null;
export type Text1 = string;
/**
 * @maxItems 8
 */
export type Options = OptionIn[];
export type Key3 = string | null;
export type Match = string;
export type Prompt = string;
/**
 * @maxItems 10
 */
export type Pairs = PairIn[];
export type Points1 = number;
export type QuestionText1 = string;
export type QuestionType1 =
  | "mcq"
  | "true_false"
  | "multiple_select"
  | "short_answer"
  | "fill_blanks"
  | "matching"
  | "ordering"
  | "numeric"
  | "hotspot_3d";
export type Description1 = string;
export type Points2 = number;
/**
 * @maxItems 10
 */
export type Rubric = Criterion[];
export type SceneId1 = string | null;
/**
 * @maxItems 10
 */
export type TargetComponentIds = string[];
export type Tolerance = number;
export type Unit = string;
/**
 * @maxItems 50
 */
export type Questions = QuestionIn[];
export type SchemaVersion1 = "1.0";
export type MaxAttempts = number;
export type PassingScore = number;
export type AllowBack = boolean;
export type Layout = "all" | "one_per_page";
export type PartialCredit = boolean;
export type QuestionsPerAttempt = number | null;
export type RevealAnswers = "after_submit" | "after_last_attempt" | "never";
export type ShuffleOptions = boolean;
export type ShuffleQuestions = boolean;
export type TimeLimitMinutes = number | null;
export type Title4 = string;
export type AssessmentId = string;
export type AvgScoreRate = number | null;
export type GradedAttempts = number;
export type PassRate = number | null;
export type PendingReviews = number;
export type AvgScoreRate1 = number | null;
export type Count = number;
export type OptionKey = string;
export type Text2 = string;
export type CommonWrong = OptionCount[];
export type QuestionKey2 = string;
export type QuestionText2 = string;
export type QuestionType2 = string;
export type Responses = number;
export type Suppressed = boolean;
export type Questions1 = QuestionStat[];
export type StudentsAttempted = number;
export type Title5 = string;
export type ChapterId = string;
export type HasUnpublishedChanges = boolean;
export type Id3 = string;
export type MaxAttempts1 = number;
export type MaxScore = number;
export type Origin1 = string;
export type PassingScore1 = number;
export type PublishedVersion = number | null;
export type QuestionCount = number;
export type QuestionsPerAttempt1 = number;
export type Status1 = string;
export type Title6 = string;
export type Version1 = number;
export type MaxAttempts2 = number | null;
export type PassingScore2 = number | null;
export type Title7 = string | null;
export type AttributionText = string;
export type Category = string | null;
export type Description2 = string;
export type LicenseName = string;
export type Name1 = string;
export type SchoolId = string | null;
export type SourceUrl = string | null;
export type Subject1 = string | null;
export type AttributionText1 = string;
export type CanManage = boolean;
export type Category1 = string | null;
export type CreatedAt = string;
export type Description3 = string;
export type Id4 = string;
export type LatestVersion = number;
export type LicenseName1 = string;
export type Name2 = string;
export type Provider = string;
export type ReviewNotes = string | null;
export type ReviewStatus = string;
export type Slug = string;
export type SourceUrl1 = string | null;
export type Subject2 = string | null;
export type CreatedAt1 = string;
export type ErrorMessage = string | null;
export type FileSizeBytes = number;
export type Status2 = string;
export type VersionNumber = number;
export type Versions = AssetVersionOut[];
export type Visibility = string;
export type AssetId = string;
export type Version2 = number;
export type Decision = "approved" | "rejected";
export type Notes = string | null;
export type Method = string;
export type Url = string;
export type VersionNumber1 = number;
export type SizeBytes = number;
export type Answers = AnswerResult[];
export type AssessmentId1 = string;
export type AssessmentTitle = string;
export type AttemptId = string;
export type AttemptNumber = number;
export type MaxScore1 = number;
export type Passed = boolean | null;
export type PassingScore3 = number;
export type ProvisionalScore = number | null;
export type Score = number | null;
export type Status3 = string;
export type SubmittedAt = string | null;
export type AttemptId1 = string;
export type AttemptNumber1 = number;
export type MaxScore2 = number;
export type PendingReviews1 = number;
export type ProvisionalScore1 = number | null;
export type Score1 = number | null;
export type Status4 = string;
export type StudentId = string;
export type StudentName = string;
export type SubmittedAt1 = string | null;
export type AttemptsUsed = number;
export type ChapterId1 = string;
export type HasUnpublishedChanges1 = boolean;
export type Id5 = string;
export type MaxAttempts3 = number;
export type MaxScore3 = number;
export type Origin2 = string;
export type PassingScore4 = number;
export type PublishedVersion1 = number | null;
export type QuestionCount1 = number;
export type Key4 = string;
export type Key5 = string;
export type Text3 = string;
export type Options1 = StudentOption[];
export type Points3 = number;
export type QuestionText3 = string;
export type QuestionType3 = string;
export type Questions2 = StudentQuestion[];
export type QuestionsPerAttempt2 = number;
export type Status5 = string;
export type Title8 = string;
export type Version3 = number;
export type AttemptId2 = string;
export type AttemptNumber2 = number;
export type Description4 = string;
export type InScene = boolean;
export type Label = string;
export type MeshName = string;
export type Source = string;
export type MaxDistance = number;
export type MinDistance = number;
export type CameraPreset = "front" | "side" | "top" | "three_quarter";
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CameraPreset".
 */
export type CameraPreset1 = "front" | "side" | "top" | "three_quarter";
export type Description5 = string;
/**
 * @maxItems 20
 */
export type SourceRefs1 = ChapterSourceRef[];
export type Title9 = string;
export type AiInstructions = string;
export type CourseId = string;
export type Description6 = string;
export type Id6 = string;
export type Id7 = string;
export type ObjectiveText = string;
export type Position = number;
export type SourceRefs2 = {
  [k: string]: unknown;
}[];
export type Objectives1 = ObjectiveOut[];
export type Position1 = number;
export type SourceRefs3 = {
  [k: string]: unknown;
}[];
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "PublishStatus".
 */
export type PublishStatus = "draft" | "published";
export type Title10 = string;
export type UpdatedAt = string;
export type JobId = string | null;
export type LessonId2 = string;
export type LessonTitle = string;
export type Reason = string | null;
export type Status6 = string;
/**
 * Skip lessons that already have a scene
 */
export type OnlyMissing = boolean;
export type Items1 = ChapterGenerateItem[];
export type CourseId1 = string;
export type Description7 = string;
export type Id8 = string;
export type Position2 = number;
export type SourceRefs4 = {
  [k: string]: unknown;
}[];
export type Title11 = string;
export type UpdatedAt1 = string;
export type CourseId2 = string;
export type Description8 = string;
export type Id9 = string;
export type Lessons = number;
export type Objectives2 = number;
export type Position3 = number;
export type PublishedLessons = number;
export type Quizzes = number;
export type Scenes = number;
export type SourceRefs5 = {
  [k: string]: unknown;
}[];
export type Title12 = string;
export type UpdatedAt2 = string;
export type Explained = number;
export type LessonId3 = string;
export type LessonPosition = number;
export type LessonTitle1 = string;
export type Parts = number;
export type HasUnpublishedChanges2 = boolean;
export type Id10 = string;
export type LessonId4 = string;
export type Origin3 = string;
export type PlanningRationale = string | null;
export type PublishedVersion2 = number | null;
/**
 * @maxItems 50
 */
export type AnimationRefs = string[];
/**
 * @maxItems 20
 */
export type AssetRefs = AssetRef[];
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ComponentAction".
 */
export type ComponentAction =
  "highlight" | "show_explanation" | "toggle_visibility" | "focus_camera";
/**
 * @maxItems 4
 */
export type Actions = ComponentAction[];
export type ComponentId = string;
export type ExplanationRef = string | null;
export type Label1 = string;
export type MeshName1 = string;
/**
 * @maxItems 200
 */
export type Components = SceneComponent[];
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SceneControl".
 */
export type SceneControl = "rotate" | "zoom" | "pan" | "select_component";
export type Controls = SceneControl[];
/**
 * @maxItems 50
 */
export type LearningObjectiveIds = string[];
export type Generator = string;
/**
 * @maxItems 20
 */
export type Procedural = ProceduralSource[];
export type SceneId2 = string;
export type SchemaVersion2 = "1.0";
export type Title13 = string;
export type Status7 = string;
export type Title14 = string;
export type UpdatedAt3 = string;
export type Version4 = number;
export type Warnings = string[];
export type Characters = number;
export type DocumentId1 = string;
export type DocumentTitle = string;
export type PageEnd1 = number;
export type PageStart1 = number;
export type Text4 = string;
export type Passages = SourcePassageOut[];
export type Strategy = string;
export type Truncated = boolean;
export type AiInstructions1 = string | null;
export type Description9 = string | null;
export type Position4 = number | null;
export type SourceRefs6 = ChapterSourceRef[] | null;
export type Title15 = string | null;
export type AcademicYear = string | null;
export type Name3 = string;
export type SchoolId1 = string;
export type Email = string;
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ClassroomRole".
 */
export type ClassroomRole = "teacher" | "student";
export type DisplayName = string;
export type Email1 = string;
export type Id11 = string;
export type AcademicYear1 = string | null;
export type CreatedAt2 = string;
export type Id12 = string;
export type Name4 = string;
export type SchoolId2 = string;
export type Concept = string;
export type Count1 = number;
export type Assessments = AssessmentStat[];
export type CompletedLessons = number;
export type DisplayName1 = string;
export type GapObjectives = number;
export type Reasons = string[];
export type StudentId1 = string;
export type Attention = StudentAttention[];
export type AvgCompletionRate = number | null;
export type AvgScoreRate2 = number | null;
export type CourseId3 = string;
export type Enrolled = number;
export type Kind = string;
export type Message = string;
export type Severity = string;
export type TargetId = string | null;
export type Insights = Insight[];
export type ChapterTitle = string;
export type Completed = number;
export type CompletionRate = number | null;
export type LessonId5 = string;
export type Title16 = string;
export type Lessons1 = LessonStat[];
export type MinGroupSize = number;
export type MissingConcepts1 = ConceptCount[];
export type AvgMastery = number | null;
export type ChapterTitle1 = string;
export type Developing = number;
export type Gaps = number;
export type Mastered = number;
export type ObjectiveId = string;
export type StudentsWithEvidence = number;
export type Text5 = string;
export type Objectives3 = ObjectiveStat[];
export type Suppressed1 = boolean;
export type TotalLessons = number;
export type Description10 = string;
export type GradeLevel = string | null;
export type SchoolId3 = string | null;
export type Subject3 = string | null;
export type Title17 = string;
export type CanManage1 = boolean;
export type CreatedAt3 = string;
export type Description11 = string;
export type GradeLevel1 = string | null;
export type Id13 = string;
export type JoinCode2 = string | null;
export type SchoolId4 = string | null;
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CourseStatus".
 */
export type CourseStatus = "draft" | "published" | "archived";
export type Subject4 = string | null;
export type Title18 = string;
export type UpdatedAt4 = string;
export type CanManage2 = boolean;
export type Description12 = string;
export type Id14 = string;
export type Id15 = string;
export type Position5 = number;
export type Progress = string;
export type Published = boolean;
export type SceneCount = number;
export type Title19 = string;
export type Lessons2 = OutlineLesson[];
export type Position6 = number;
export type Progress1 = string;
export type Published1 = boolean;
export type Title20 = string;
export type Chapters2 = OutlineChapter[];
export type CompletedLessons1 = number;
export type CourseId4 = string;
export type NextLessonId = string | null;
export type Title21 = string;
export type TotalLessons1 = number;
export type CompletedLessons2 = number;
export type CourseId5 = string;
export type LastActivityAt = string | null;
export type NextLessonId1 = string | null;
export type Title22 = string;
export type TotalLessons2 = number;
export type Description13 = string | null;
export type GradeLevel2 = string | null;
export type Subject5 = string | null;
export type Title23 = string | null;
export type Password = string;
export type CourseId6 = string;
export type CreatedAt4 = string;
export type ErrorMessage1 = string | null;
export type Id16 = string;
export type MimeType = string;
export type OriginalFilename = string;
export type PageCount = number | null;
export type PagesNeedingOcr = number;
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "DocumentStatus".
 */
export type DocumentStatus = "pending_upload" | "uploaded" | "processing" | "ready" | "failed";
export type SizeBytes1 = number;
export type Title24 = string;
export type AttemptCount = number;
export type CreatedAt5 = string;
export type ErrorCode = string | null;
export type ErrorMessage2 = string | null;
export type FinishedAt = string | null;
export type Id17 = string;
export type JobType = string;
export type Result = {
  [k: string]: unknown;
} | null;
export type Status8 = string;
export type TargetId1 = string;
export type TargetType = string;
export type ExpiresInS = number;
export type Url1 = string;
export type ClassroomId = string | null;
export type StudentEmail = string | null;
export type AlreadyEnrolled = number;
export type Enrolled1 = number;
export type ClassroomId1 = string | null;
export type EnrolledAt = string;
/**
 * @minItems 1
 * @maxItems 50
 */
export type Events = [EventIn, ...EventIn[]];
export type AnimationId1 = string | null;
export type ComponentId1 = string | null;
export type EventType =
  | "lesson_opened"
  | "scene_opened"
  | "component_selected"
  | "animation_started"
  | "animation_completed";
export type LessonId6 = string;
export type SceneId3 = string | null;
export type Recorded = number;
export type Text6 = string;
export type AssetId1 = string;
export type AssetName = string;
export type CreatedAt6 = string;
export type ErrorMessage3 = string | null;
export type FinishedAt1 = string | null;
export type HasModel = boolean;
export type JobId1 = string;
export type LessonId7 = string | null;
export type LessonTitle2 = string | null;
export type PromptPreview = string;
export type Provider1 = string;
export type SceneId4 = string | null;
export type Status9 = string;
/**
 * Save the finished model into this lesson as a draft scene
 */
export type LessonId8 = string | null;
export type Name5 = string;
export type Prompt1 = string;
/**
 * Default if omitted
 */
export type Provider2 = string | null;
export type SchoolId5 = string | null;
export type Subject6 = string | null;
export type JobId2 = string;
export type JobStatus = string;
export type DefaultComponents = string[];
export type Description14 = string;
export type Name6 = string;
export type Kind1 = string;
export type Max = number | null;
export type Min = number | null;
export type Name7 = string;
export type Params1 = GeneratorParamOut[];
export type Location = (string | number)[];
export type Message1 = string;
export type ErrorType = string;
export type Detail = ValidationError[];
export type Environment = string;
export type Status10 = string;
export type AsStudent = string;
export type AsTeacher = string;
export type Code = string;
export type GradeLevel3 = string | null;
export type Id18 = string;
export type Kind2 = "school" | "course";
export type Name8 = string;
export type SchoolName1 = string | null;
export type Subject7 = string | null;
export type TeacherName = string | null;
export type Code1 = string;
export type Joined = string[];
export type Kind3 = "school" | "course";
export type Name9 = string;
export type ChapterId2 = string | null;
export type CourseId7 = string | null;
export type Goal = {
  [k: string]: unknown;
} | null;
export type Instructions = string;
export type Kind4 = string;
export type Palette = {
  [k: string]: unknown;
} | null;
export type Title25 = string;
export type Description15 = string;
export type Kind5 = string;
export type Title26 = string;
export type CanManage3 = boolean;
export type ChapterId3 = string | null;
export type ChapterTitle2 = string | null;
export type CourseId8 = string | null;
export type CourseTitle = string | null;
export type CreatedAt7 = string;
export type Id19 = string;
export type Instructions1 = string;
export type Kind6 = string;
export type Achieved = string[];
export type CompletedAt = string | null;
export type Id20 = string;
export type Interactions = number;
export type LastActivityAt1 = string;
export type StartedAt = string;
export type Status11 = string;
export type Status12 = string;
export type StudentsCompleted = number;
export type StudentsStarted = number;
export type Title27 = string;
export type UpdatedAt5 = string;
export type VisibilityNote = string | null;
export type ChapterId4 = string | null;
export type Id21 = string;
export type Kind7 = string;
export type SessionStatus = string | null;
export type Status13 = string;
export type Title28 = string;
export type ChapterId5 = string | null;
export type ClearChapter = boolean;
export type ClearCourse = boolean;
export type CourseId9 = string | null;
export type Goal3 = {
  [k: string]: unknown;
} | null;
export type Instructions2 = string | null;
export type Palette2 = {
  [k: string]: unknown;
} | null;
export type Status14 = ("draft" | "published") | null;
export type Title29 = string | null;
export type SchemaVersion3 = "1.0";
export type BodyMarkdown = string;
/**
 * @maxItems 30
 */
export type KeyTerms = string[];
export type DocumentId2 = string;
export type Page = number;
/**
 * @maxItems 30
 */
export type SourceRefs7 = SourceRef[];
export type Title30 = string;
/**
 * @maxItems 40
 */
export type Sections = LessonSection[];
/**
 * @maxItems 20
 */
export type Summary = string[];
export type Concept1 = string;
export type LearningReason = string;
export type VisualizationType =
  "anatomical_model" | "procedural_geometry" | "simulation" | "process_animation" | "diagram";
/**
 * @maxItems 10
 */
export type VisualizationCandidates = VisualizationCandidate[];
export type Title31 = string;
export type ChapterId6 = string;
export type HasUnpublishedChanges3 = boolean;
export type Id22 = string;
export type Origin4 = string;
export type Position7 = number;
export type PublishedVersion3 = number | null;
export type Status15 = string;
export type Title32 = string;
export type UpdatedAt6 = string;
export type Version5 = number;
export type CompletedAt1 = string | null;
export type LessonId9 = string;
export type Status16 = string;
export type HasUnpublishedChanges4 = boolean;
export type Id23 = string;
export type Origin5 = string;
export type Position8 = number;
export type PublishedVersion4 = number | null;
export type Status17 = string;
export type Title33 = string;
export type Version6 = number;
/**
 * Optimistic concurrency check.
 */
export type ExpectedVersion1 = number;
export type Title34 = string | null;
export type ChangeSource = string;
export type CreatedAt8 = string;
export type Title35 = string;
export type VersionNumber2 = number;
export type Email2 = string;
export type Password1 = string;
/**
 * @maxItems 20
 */
export type SourceRefs8 = {
  [k: string]: unknown;
}[];
export type Text7 = string;
export type EvidenceCount = number;
export type Mastery = number | null;
export type ObjectiveId1 = string;
export type Status18 = string;
export type Text8 = string;
export type CreatedAt9 = string;
export type Id24 = string;
export type Model = string;
export type PromptId = string;
export type PromptVersion = string;
export type Status19 = string;
export type ExtractedText = string;
export type ExtractionMethod = string;
export type PageNumber = number;
export type QualityStatus = string;
export type Items2 = PageOut[];
export type Total = number;
/**
 * Node name of the part
 */
export type Part = string;
export type Action9 = "explain_deeper" | "simplify" | "compare" | "quiz_question";
export type CompareWith = string | null;
export type ComponentId2 = string;
export type Description16 = string | null;
export type Label2 = string | null;
export type Status20 = "in_progress" | "completed";
export type CreatedAt10 = string;
export type Edited = boolean;
export type Focus = string | null;
export type Id25 = string;
export type Level = string | null;
export type Parts1 = {
  [k: string]: unknown;
}[];
export type Prompt2 = string;
export type Subject8 = string | null;
export type Title36 = string;
export type Topic = string;
export type UpdatedAt7 = string;
/**
 * What to emphasise
 */
export type Focus1 = string | null;
/**
 * e.g. Year 9, university
 */
export type Level1 = string | null;
export type Subject9 = string | null;
export type Topic1 = string;
export type Prompt3 = string | null;
export type Title37 = string | null;
export type Message2 = string;
export type Name10 = string;
export type Ok = boolean;
export type IncludeCourse = boolean;
export type AssessmentsPublished = number;
export type ChapterStatus = string;
export type CourseStatus1 = string;
export type LessonsPublished = number;
export type ScenesPublished = number;
export type Id26 = string;
export type Kind8 = string;
export type Reason1 = string;
export type Title38 = string;
export type Skipped = SkippedItem[];
export type ExpectedVersion2 = number;
export type Database = string;
export type Queue = string;
export type Status21 = string;
export type LessonId10 = string;
export type LessonTitle3 = string;
export type Reason2 = string;
export type AccountType1 = "teacher" | "student";
export type DisplayName2 = string;
export type Email3 = string;
export type JoinCode3 = string | null;
export type Password2 = string;
export type AssetId2 = string;
export type AttributionText2 = string;
export type LicenseName2 = string;
export type Name11 = string;
export type NodeNames = string[];
export type Parts2 = {
  [k: string]: string;
}[];
export type SourceUrl2 = string | null;
export type Tour = {
  [k: string]: unknown;
} | null;
export type Url2 = string;
export type Version7 = number;
export type Animations = AnimationSpec[];
export type Assets = ResolvedAsset[];
export type SceneId5 = string;
export type Version8 = number;
export type Warnings1 = string[];
export type FinalScore1 = number;
export type TeacherFeedback1 = string | null;
export type AnswerText2 = string | null;
export type AttemptId3 = string;
export type Confidence = number | null;
export type EvaluationId = string;
export type Feedback = string | null;
export type MissingConcepts2 = string[];
export type ModelAnswer1 = string;
export type Points4 = number;
export type QuestionKey3 = string;
export type QuestionText4 = string;
export type Rubric1 = {
  [k: string]: unknown;
}[];
export type Status22 = string;
export type StudentName1 = string;
export type SuggestedScore = number | null;
export type ExpectedVersion3 = number;
export type Name12 = string;
export type Slug1 = string;
export type Email4 = string;
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SchoolRole".
 */
export type SchoolRole = "school_admin" | "teacher" | "student";
export type JoinedAt = string;
export type CreatedAt11 = string;
export type Id27 = string;
export type JoinCode4 = string | null;
export type Name13 = string;
export type Slug2 = string;
export type ExpectedVersion4 = number;
export type Instruction = string | null;
export type Achieved1 = string[];
export type GoalMet = boolean;
export type Message3 = string;
export type Text9 = string;
export type Enabled = boolean;
export type Model1 = string | null;
export type VoiceId = string | null;
export type Attempts = number;
export type AvgScoreRate3 = number | null;
export type CompletedLessons3 = number;
export type CourseId10 = string;
export type DisplayName3 = string;
export type Objectives4 = ObjectiveMastery[];
export type Recommendations = Recommendation[];
export type StudentId2 = string;
export type TotalLessons3 = number;
export type CompletedChapters = number;
export type CompletedLessons4 = number;
export type DisplayName4 = string;
export type Email5 = string;
export type LastActivityAt2 = string | null;
export type StudentId3 = string;
export type TotalLessons4 = number;
export type Achieved2 = number;
export type CompletedAt2 = string | null;
export type DisplayName5 = string;
export type Flag = string | null;
export type GoalMet1 = boolean;
export type Interactions1 = number;
export type LastActivityAt3 = string;
export type StartedAt1 = string;
export type Status23 = string;
export type StudentId4 = string;
export type Summary1 = string;
export type Total1 = number;
export type ChapterTitle3 = string;
export type CourseId11 = string;
export type CourseTitle1 = string;
export type LessonId11 = string;
export type LessonTitle4 = string;
export type SceneId6 = string;
export type Subject10 = string | null;
export type Title39 = string;
/**
 * @maxItems 50
 */
export type Answers1 = AnswerIn[];
export type ChapterId7 = string;
export type HasUnpublishedChanges5 = boolean;
export type Id28 = string;
export type MaxAttempts4 = number;
export type MaxScore4 = number;
export type Origin6 = string;
export type PassingScore5 = number;
export type PublishedVersion5 = number | null;
export type QuestionCount2 = number;
export type QuestionsPerAttempt3 = number;
export type Status24 = string;
export type Title40 = string;
export type Version9 = number;
export type CourseId12 = string;
export type Text10 = string;
export type Title41 = string;
export type Description17 = string;
export type IsDefault = boolean;
export type Name14 = string;
export type Method1 = string;
export type Url3 = string;
export type CourseId13 = string;
export type Filename = string;
export type MimeType1 = "application/pdf" | "text/plain" | "text/markdown";
export type SizeBytes2 = number;
export type Title42 = string | null;
export type CreatedAt12 = string;
export type DisplayName6 = string;
export type Email6 = string;
export type Id29 = string;
export type DisplayName7 = string;

export interface Api {
  AIUsageOut?: AIUsageOut;
  AccountType?: AccountType;
  AffiliationCourse?: AffiliationCourse;
  AffiliationSchool?: AffiliationSchool;
  Affiliations?: Affiliations;
  AnimationCreate?: AnimationCreate;
  AnimationOut?: AnimationOut;
  AnimationSpec?: AnimationSpec;
  AnimationUpdate?: AnimationUpdate;
  AnnotationStep?: AnnotationStep;
  AnswerIn?: AnswerIn;
  AnswerResult?: AnswerResult;
  ApplyOutlineRequest?: ApplyOutlineRequest;
  ApplySplitRequest?: ApplySplitRequest;
  AssessmentContent?: AssessmentContent;
  AssessmentCreate?: AssessmentCreate;
  AssessmentStat?: AssessmentStat;
  AssessmentSummary?: AssessmentSummary;
  AssessmentUpdate?: AssessmentUpdate;
  AssetCreate?: AssetCreate;
  AssetOut?: AssetOut;
  AssetRef?: AssetRef;
  AssetReview?: AssetReview;
  AssetUploadResponse?: AssetUploadResponse;
  AssetVersionOut?: AssetVersionOut;
  AssetVersionUploadRequest?: AssetVersionUploadRequest;
  AttemptResult?: AttemptResult;
  AttemptRow?: AttemptRow;
  AttemptStart?: AttemptStart;
  AvailablePart?: AvailablePart;
  Camera?: Camera;
  CameraFocusStep?: CameraFocusStep;
  CameraPreset?: CameraPreset1;
  ChapterCreate?: ChapterCreate;
  ChapterDetail?: ChapterDetail;
  ChapterGenerateItem?: ChapterGenerateItem;
  ChapterGenerateRequest?: ChapterGenerateRequest;
  ChapterGenerateResult?: ChapterGenerateResult;
  ChapterOut?: ChapterOut;
  ChapterOverview?: ChapterOverview;
  ChapterSceneOut?: ChapterSceneOut;
  ChapterSourceOut?: ChapterSourceOut;
  ChapterSourceRef?: ChapterSourceRef;
  ChapterUpdate?: ChapterUpdate;
  ClassroomCreate?: ClassroomCreate;
  ClassroomMemberAdd?: ClassroomMemberAdd;
  ClassroomMemberOut?: ClassroomMemberOut;
  ClassroomOut?: ClassroomOut;
  ClassroomRole?: ClassroomRole;
  ComponentAction?: ComponentAction;
  ConceptCount?: ConceptCount;
  CourseAnalytics?: CourseAnalytics;
  CourseCreate?: CourseCreate;
  CourseOut?: CourseOut;
  CourseOutline?: CourseOutline;
  CourseProgressSummary?: CourseProgressSummary;
  CourseStatus?: CourseStatus;
  CourseUpdate?: CourseUpdate;
  Criterion?: Criterion;
  DeleteAccountRequest?: DeleteAccountRequest;
  DocumentJobResponse?: DocumentJobResponse;
  DocumentOut?: DocumentOut;
  DocumentStatus?: DocumentStatus;
  DownloadUrl?: DownloadUrl;
  EnrollRequest?: EnrollRequest;
  EnrollResult?: EnrollResult;
  EnrollmentOut?: EnrollmentOut;
  EventBatch?: EventBatch;
  EventIn?: EventIn;
  EventResult?: EventResult;
  ExplainSelectionRequest?: ExplainSelectionRequest;
  FlowParticlesStep?: FlowParticlesStep;
  GenerationJobOut?: GenerationJobOut;
  GenerationRequest?: GenerationRequest;
  GenerationResponse?: GenerationResponse;
  GeneratorOut?: GeneratorOut;
  GeneratorParamOut?: GeneratorParamOut;
  HTTPValidationError?: HTTPValidationError;
  HealthResponse?: HealthResponse;
  HighlightStep?: HighlightStep;
  Insight?: Insight;
  ItemIn?: ItemIn;
  JobOut?: JobOut;
  JoinPreview?: JoinPreview;
  JoinRequest?: JoinRequest;
  JoinResult?: JoinResult;
  LabCreate?: LabCreate;
  LabKindOut?: LabKindOut;
  LabOut?: LabOut;
  LabSummary?: LabSummary;
  LabUpdate?: LabUpdate;
  LessonContent?: LessonContent;
  LessonCreate?: LessonCreate;
  LessonOut?: LessonOut;
  LessonProgressOut?: LessonProgressOut;
  LessonSection?: LessonSection;
  LessonStat?: LessonStat;
  LessonSummary?: LessonSummary;
  LessonUpdate?: LessonUpdate;
  LessonVersionOut?: LessonVersionOut;
  LoginRequest?: LoginRequest;
  MoveAlongPathStep?: MoveAlongPathStep;
  ObjectiveIn?: ObjectiveIn;
  ObjectiveMastery?: ObjectiveMastery;
  ObjectiveOut?: ObjectiveOut;
  ObjectiveStat?: ObjectiveStat;
  OptionCount?: OptionCount;
  OptionIn?: OptionIn;
  OutlineChapter?: OutlineChapter;
  OutlineChapterIn?: OutlineChapterIn;
  OutlineLesson?: OutlineLesson;
  OutlineProposalOut?: OutlineProposalOut;
  PageList?: PageList;
  PageOut?: PageOut;
  PairIn?: PairIn;
  PartDeepDiveRequest?: PartDeepDiveRequest;
  PartInsightRequest?: PartInsightRequest;
  PartUpdate?: PartUpdate;
  ProceduralSource?: ProceduralSource;
  ProgressUpdate?: ProgressUpdate;
  PromptDraftOut?: PromptDraftOut;
  PromptDraftRequest?: PromptDraftRequest;
  PromptDraftUpdate?: PromptDraftUpdate;
  ProviderHealthOut?: ProviderHealthOut;
  PublishChapterRequest?: PublishChapterRequest;
  PublishChapterResult?: PublishChapterResult;
  PublishStatus?: PublishStatus;
  QuestionIn?: QuestionIn;
  QuestionStat?: QuestionStat;
  QuestionsUpdate?: QuestionsUpdate;
  QuizSettings?: QuizSettings;
  ReadinessResponse?: ReadinessResponse;
  Recommendation?: Recommendation;
  RegisterRequest?: RegisterRequest;
  ResolvedAsset?: ResolvedAsset;
  ResolvedScene?: ResolvedScene;
  ReviewDecision?: ReviewDecision;
  ReviewItem?: ReviewItem;
  RotateComponentStep?: RotateComponentStep;
  SceneComponent?: SceneComponent;
  SceneControl?: SceneControl;
  SceneCreate?: SceneCreate;
  SceneOut?: SceneOut;
  SceneSpec?: SceneSpec;
  SceneUpdate?: SceneUpdate;
  SchoolCreate?: SchoolCreate;
  SchoolMemberAdd?: SchoolMemberAdd;
  SchoolMemberOut?: SchoolMemberOut;
  SchoolOut?: SchoolOut;
  SchoolRole?: SchoolRole;
  SectionRegenerateRequest?: SectionRegenerateRequest;
  SessionOut?: SessionOut;
  SessionPut?: SessionPut;
  SessionResult?: SessionResult;
  SetOpacityStep?: SetOpacityStep;
  SetVisibilityStep?: SetVisibilityStep;
  SkippedItem?: SkippedItem;
  SourcePassageOut?: SourcePassageOut;
  SourceRef?: SourceRef;
  SpeechIn?: SpeechIn;
  SpeechStatus?: SpeechStatus;
  StudentAssessment?: StudentAssessment;
  StudentAttention?: StudentAttention;
  StudentInsights?: StudentInsights;
  StudentOption?: StudentOption;
  StudentProgressRow?: StudentProgressRow;
  StudentQuestion?: StudentQuestion;
  StudentSessionRow?: StudentSessionRow;
  StudioSceneOut?: StudioSceneOut;
  SubmitRequest?: SubmitRequest;
  TeacherAssessment?: TeacherAssessment;
  TextDocumentRequest?: TextDocumentRequest;
  ThreeDProviderOut?: ThreeDProviderOut;
  UploadInstructions?: UploadInstructions;
  UploadUrlRequest?: UploadUrlRequest;
  UploadUrlResponse?: UploadUrlResponse;
  UserOut?: UserOut;
  UserSummary?: UserSummary;
  UserUpdate?: UserUpdate;
  ValidationError?: ValidationError;
  VisualizationCandidate?: VisualizationCandidate;
  WaitStep?: WaitStep;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AIUsageOut".
 */
export interface AIUsageOut {
  calls: Calls;
  estimated_cost_usd: EstimatedCostUsd;
  input_tokens: InputTokens;
  output_tokens: OutputTokens;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AffiliationCourse".
 */
export interface AffiliationCourse {
  id: Id;
  join_code?: JoinCode;
  role: Role;
  school_name?: SchoolName;
  status: Status;
  subject?: Subject;
  title: Title;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AffiliationSchool".
 */
export interface AffiliationSchool {
  id: Id1;
  join_code?: JoinCode1;
  name: Name;
  role: Role1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "Affiliations".
 */
export interface Affiliations {
  courses: Courses;
  schools: Schools;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AnimationCreate".
 */
export interface AnimationCreate {
  spec: AnimationSpec;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AnimationSpec".
 */
export interface AnimationSpec {
  animation_id: AnimationId;
  schema_version?: SchemaVersion;
  steps: Steps;
  title: Title1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "HighlightStep".
 */
export interface HighlightStep {
  action: Action;
  duration_ms: DurationMs;
  explanation?: Explanation;
  step: Step;
  target_component: TargetComponent;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SetVisibilityStep".
 */
export interface SetVisibilityStep {
  action: Action1;
  duration_ms: DurationMs1;
  explanation?: Explanation1;
  step: Step1;
  target_component: TargetComponent1;
  visible: Visible;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SetOpacityStep".
 */
export interface SetOpacityStep {
  action: Action2;
  duration_ms: DurationMs2;
  explanation?: Explanation2;
  opacity: Opacity;
  step: Step2;
  target_component: TargetComponent2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "MoveAlongPathStep".
 */
export interface MoveAlongPathStep {
  action: Action3;
  duration_ms: DurationMs3;
  explanation?: Explanation3;
  path_id: PathId;
  step: Step3;
  target_component: TargetComponent3;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "RotateComponentStep".
 */
export interface RotateComponentStep {
  action: Action4;
  axis: Axis;
  degrees: Degrees;
  duration_ms: DurationMs4;
  explanation?: Explanation4;
  step: Step4;
  target_component: TargetComponent4;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "FlowParticlesStep".
 */
export interface FlowParticlesStep {
  action: Action5;
  duration_ms: DurationMs5;
  explanation?: Explanation5;
  path_id: PathId1;
  step: Step5;
  target_component: TargetComponent5;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CameraFocusStep".
 */
export interface CameraFocusStep {
  action: Action6;
  duration_ms: DurationMs6;
  explanation?: Explanation6;
  step: Step6;
  target_component: TargetComponent6;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AnnotationStep".
 */
export interface AnnotationStep {
  action: Action7;
  duration_ms: DurationMs7;
  explanation: Explanation7;
  step: Step7;
  target_component?: TargetComponent7;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "WaitStep".
 */
export interface WaitStep {
  action: Action8;
  duration_ms: DurationMs8;
  explanation?: Explanation8;
  step: Step8;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AnimationOut".
 */
export interface AnimationOut {
  id: Id2;
  origin: Origin;
  problems?: Problems;
  scene_id: SceneId;
  spec: AnimationSpec;
  title: Title2;
  version: Version;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AnimationUpdate".
 */
export interface AnimationUpdate {
  expected_version: ExpectedVersion;
  spec: AnimationSpec;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AnswerIn".
 */
export interface AnswerIn {
  answer_text?: AnswerText;
  question_key: QuestionKey;
  selected_option_key?: SelectedOptionKey;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AnswerResult".
 */
export interface AnswerResult {
  ai_feedback: AiFeedback;
  ai_suggested_score: AiSuggestedScore;
  answer_id: AnswerId;
  answer_text: AnswerText1;
  auto_score: AutoScore;
  correct_option_key: CorrectOptionKey;
  evaluation_status: EvaluationStatus;
  explain_further: ExplainFurther;
  explanation: Explanation9;
  final_score: FinalScore;
  is_correct: IsCorrect;
  lesson_id: LessonId;
  missing_concepts: MissingConcepts;
  points: Points;
  question_key: QuestionKey1;
  question_text: QuestionText;
  question_type: QuestionType;
  selected_option_key: SelectedOptionKey1;
  teacher_feedback: TeacherFeedback;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ApplyOutlineRequest".
 */
export interface ApplyOutlineRequest {
  chapters: Chapters;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "OutlineChapterIn".
 */
export interface OutlineChapterIn {
  description?: Description;
  objectives?: Objectives;
  source_refs?: SourceRefs;
  title: Title3;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterSourceRef".
 */
export interface ChapterSourceRef {
  document_id: DocumentId;
  page_end: PageEnd;
  page_start: PageStart;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ApplySplitRequest".
 */
export interface ApplySplitRequest {
  chapters: Chapters1;
  remove_original?: RemoveOriginal;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AssessmentContent".
 */
export interface AssessmentContent {
  questions?: Questions;
  schema_version?: SchemaVersion1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "QuestionIn".
 */
export interface QuestionIn {
  case_sensitive?: CaseSensitive;
  cloze_text?: ClozeText;
  difficulty?: Difficulty;
  distractors?: Distractors;
  explanation_correct?: ExplanationCorrect;
  explanation_general?: ExplanationGeneral;
  items?: Items;
  key?: Key1;
  learning_objective_id?: LearningObjectiveId;
  lesson_id?: LessonId1;
  model_answer?: ModelAnswer;
  numeric_answer?: NumericAnswer;
  options?: Options;
  pairs?: Pairs;
  points?: Points1;
  question_text: QuestionText1;
  question_type: QuestionType1;
  rubric?: Rubric;
  scene_id?: SceneId1;
  target_component_ids?: TargetComponentIds;
  tolerance?: Tolerance;
  unit?: Unit;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ItemIn".
 */
export interface ItemIn {
  key?: Key;
  text: Text;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "OptionIn".
 */
export interface OptionIn {
  is_correct?: IsCorrect1;
  key?: Key2;
  text: Text1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "PairIn".
 */
export interface PairIn {
  key?: Key3;
  match: Match;
  prompt: Prompt;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "Criterion".
 */
export interface Criterion {
  description: Description1;
  points: Points2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AssessmentCreate".
 */
export interface AssessmentCreate {
  max_attempts?: MaxAttempts;
  passing_score?: PassingScore;
  settings?: QuizSettings;
  title: Title4;
}
/**
 * Delivery settings, frozen into each published version.
 *
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "QuizSettings".
 */
export interface QuizSettings {
  allow_back?: AllowBack;
  layout?: Layout;
  partial_credit?: PartialCredit;
  questions_per_attempt?: QuestionsPerAttempt;
  reveal_answers?: RevealAnswers;
  shuffle_options?: ShuffleOptions;
  shuffle_questions?: ShuffleQuestions;
  time_limit_minutes?: TimeLimitMinutes;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AssessmentStat".
 */
export interface AssessmentStat {
  assessment_id: AssessmentId;
  avg_score_rate: AvgScoreRate;
  graded_attempts: GradedAttempts;
  pass_rate: PassRate;
  pending_reviews: PendingReviews;
  questions: Questions1;
  students_attempted: StudentsAttempted;
  title: Title5;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "QuestionStat".
 */
export interface QuestionStat {
  avg_score_rate: AvgScoreRate1;
  common_wrong: CommonWrong;
  question_key: QuestionKey2;
  question_text: QuestionText2;
  question_type: QuestionType2;
  responses: Responses;
  suppressed: Suppressed;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "OptionCount".
 */
export interface OptionCount {
  count: Count;
  option_key: OptionKey;
  text: Text2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AssessmentSummary".
 */
export interface AssessmentSummary {
  chapter_id: ChapterId;
  has_unpublished_changes: HasUnpublishedChanges;
  id: Id3;
  max_attempts: MaxAttempts1;
  max_score: MaxScore;
  origin: Origin1;
  passing_score: PassingScore1;
  published_version: PublishedVersion;
  question_count: QuestionCount;
  questions_per_attempt: QuestionsPerAttempt1;
  settings: QuizSettings;
  status: Status1;
  title: Title6;
  version: Version1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AssessmentUpdate".
 */
export interface AssessmentUpdate {
  max_attempts?: MaxAttempts2;
  passing_score?: PassingScore2;
  settings?: QuizSettings | null;
  title?: Title7;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AssetCreate".
 */
export interface AssetCreate {
  attribution_text?: AttributionText;
  category?: Category;
  description?: Description2;
  license_name: LicenseName;
  name: Name1;
  school_id?: SchoolId;
  source_url?: SourceUrl;
  subject?: Subject1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AssetOut".
 */
export interface AssetOut {
  attribution_text: AttributionText1;
  can_manage?: CanManage;
  category: Category1;
  created_at: CreatedAt;
  description: Description3;
  id: Id4;
  latest_version: LatestVersion;
  license_name: LicenseName1;
  name: Name2;
  provider: Provider;
  review_notes: ReviewNotes;
  review_status: ReviewStatus;
  slug: Slug;
  source_url: SourceUrl1;
  subject: Subject2;
  versions?: Versions;
  visibility: Visibility;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AssetVersionOut".
 */
export interface AssetVersionOut {
  created_at: CreatedAt1;
  error_message: ErrorMessage;
  file_size_bytes: FileSizeBytes;
  metadata_json: MetadataJson;
  status: Status2;
  version_number: VersionNumber;
}
export interface MetadataJson {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AssetRef".
 */
export interface AssetRef {
  asset_id: AssetId;
  version: Version2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AssetReview".
 */
export interface AssetReview {
  decision: Decision;
  notes?: Notes;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AssetUploadResponse".
 */
export interface AssetUploadResponse {
  headers: Headers;
  method: Method;
  url: Url;
  version_number: VersionNumber1;
}
export interface Headers {
  [k: string]: string;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AssetVersionUploadRequest".
 */
export interface AssetVersionUploadRequest {
  size_bytes: SizeBytes;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AttemptResult".
 */
export interface AttemptResult {
  answers: Answers;
  assessment_id: AssessmentId1;
  assessment_title: AssessmentTitle;
  attempt_id: AttemptId;
  attempt_number: AttemptNumber;
  max_score: MaxScore1;
  passed: Passed;
  passing_score: PassingScore3;
  provisional_score: ProvisionalScore;
  score: Score;
  status: Status3;
  submitted_at: SubmittedAt;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AttemptRow".
 */
export interface AttemptRow {
  attempt_id: AttemptId1;
  attempt_number: AttemptNumber1;
  max_score: MaxScore2;
  pending_reviews: PendingReviews1;
  provisional_score: ProvisionalScore1;
  score: Score1;
  status: Status4;
  student_id: StudentId;
  student_name: StudentName;
  submitted_at: SubmittedAt1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AttemptStart".
 */
export interface AttemptStart {
  assessment: StudentAssessment;
  attempt_id: AttemptId2;
  attempt_number: AttemptNumber2;
}
/**
 * No answer keys, rubrics or explanations before submission.
 *
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "StudentAssessment".
 */
export interface StudentAssessment {
  attempts_used: AttemptsUsed;
  chapter_id: ChapterId1;
  has_unpublished_changes: HasUnpublishedChanges1;
  id: Id5;
  max_attempts: MaxAttempts3;
  max_score: MaxScore3;
  origin: Origin2;
  passing_score: PassingScore4;
  published_version: PublishedVersion1;
  question_count: QuestionCount1;
  questions: Questions2;
  questions_per_attempt: QuestionsPerAttempt2;
  settings: QuizSettings;
  status: Status5;
  title: Title8;
  version: Version3;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "StudentQuestion".
 */
export interface StudentQuestion {
  key: Key4;
  options: Options1;
  points: Points3;
  question_text: QuestionText3;
  question_type: QuestionType3;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "StudentOption".
 */
export interface StudentOption {
  key: Key5;
  text: Text3;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AvailablePart".
 */
export interface AvailablePart {
  description: Description4;
  in_scene: InScene;
  label: Label;
  mesh_name: MeshName;
  source: Source;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "Camera".
 */
export interface Camera {
  max_distance?: MaxDistance;
  min_distance?: MinDistance;
  preset?: CameraPreset;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterCreate".
 */
export interface ChapterCreate {
  description?: Description5;
  source_refs?: SourceRefs1;
  title: Title9;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterDetail".
 */
export interface ChapterDetail {
  ai_instructions?: AiInstructions;
  course_id: CourseId;
  description: Description6;
  id: Id6;
  objectives?: Objectives1;
  position: Position1;
  source_refs: SourceRefs3;
  status: PublishStatus;
  title: Title10;
  updated_at: UpdatedAt;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ObjectiveOut".
 */
export interface ObjectiveOut {
  id: Id7;
  objective_text: ObjectiveText;
  position: Position;
  source_refs: SourceRefs2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterGenerateItem".
 */
export interface ChapterGenerateItem {
  job_id: JobId;
  lesson_id: LessonId2;
  lesson_title: LessonTitle;
  reason?: Reason;
  status: Status6;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterGenerateRequest".
 */
export interface ChapterGenerateRequest {
  only_missing?: OnlyMissing;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterGenerateResult".
 */
export interface ChapterGenerateResult {
  items: Items1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterOut".
 */
export interface ChapterOut {
  course_id: CourseId1;
  description: Description7;
  id: Id8;
  position: Position2;
  source_refs: SourceRefs4;
  status: PublishStatus;
  title: Title11;
  updated_at: UpdatedAt1;
}
/**
 * A chapter card on the course page: status plus what is inside it.
 *
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterOverview".
 */
export interface ChapterOverview {
  course_id: CourseId2;
  description: Description8;
  id: Id9;
  lessons?: Lessons;
  objectives?: Objectives2;
  position: Position3;
  published_lessons?: PublishedLessons;
  quizzes?: Quizzes;
  scenes?: Scenes;
  source_refs: SourceRefs5;
  status: PublishStatus;
  title: Title12;
  updated_at: UpdatedAt2;
}
/**
 * A scene in the chapter 3D Studio board, with its lesson and readiness.
 *
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterSceneOut".
 */
export interface ChapterSceneOut {
  explained: Explained;
  lesson_id: LessonId3;
  lesson_position: LessonPosition;
  lesson_title: LessonTitle1;
  parts: Parts;
  scene: SceneOut;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SceneOut".
 */
export interface SceneOut {
  has_unpublished_changes: HasUnpublishedChanges2;
  id: Id10;
  lesson_id: LessonId4;
  origin?: Origin3;
  planning_rationale?: PlanningRationale;
  published_version: PublishedVersion2;
  spec: SceneSpec;
  status: Status7;
  title: Title14;
  updated_at: UpdatedAt3;
  version: Version4;
  warnings?: Warnings;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SceneSpec".
 */
export interface SceneSpec {
  animation_refs?: AnimationRefs;
  asset_refs?: AssetRefs;
  camera?: Camera;
  components?: Components;
  controls?: Controls;
  explanations?: Explanations;
  learning_objective_ids?: LearningObjectiveIds;
  paths?: Paths;
  procedural?: Procedural;
  scene_id: SceneId2;
  schema_version?: SchemaVersion2;
  title: Title13;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SceneComponent".
 */
export interface SceneComponent {
  actions?: Actions;
  component_id: ComponentId;
  explanation_ref?: ExplanationRef;
  label: Label1;
  mesh_name: MeshName1;
}
export interface Explanations {
  /**
   * This interface was referenced by `Explanations`'s JSON-Schema definition
   * via the `patternProperty` "^[a-z][a-z0-9_]{0,63}$".
   */
  [k: string]: string;
}
export interface Paths {
  /**
   * This interface was referenced by `Paths`'s JSON-Schema definition
   * via the `patternProperty` "^[a-z][a-z0-9_]{0,63}$".
   */
  [k: string]: [number, number, number, ...number[]][];
}
/**
 * A trusted, prebuilt procedural generator in the renderer (design §7.1-A).
 *
 * `generator` must exist in the renderer's allowlisted registry; params are flat scalars only.
 *
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ProceduralSource".
 */
export interface ProceduralSource {
  generator: Generator;
  params?: Params;
}
export interface Params {
  /**
   * This interface was referenced by `Params`'s JSON-Schema definition
   * via the `patternProperty` "^[a-z][a-z0-9_]{0,63}$".
   */
  [k: string]: number | boolean | string;
}
/**
 * The textbook text the AI reads for this chapter (shown in the chapter studio).
 *
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterSourceOut".
 */
export interface ChapterSourceOut {
  characters: Characters;
  passages: Passages;
  strategy: Strategy;
  truncated: Truncated;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SourcePassageOut".
 */
export interface SourcePassageOut {
  document_id: DocumentId1;
  document_title: DocumentTitle;
  page_end: PageEnd1;
  page_start: PageStart1;
  text: Text4;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterUpdate".
 */
export interface ChapterUpdate {
  ai_instructions?: AiInstructions1;
  description?: Description9;
  position?: Position4;
  source_refs?: SourceRefs6;
  status?: PublishStatus | null;
  title?: Title15;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ClassroomCreate".
 */
export interface ClassroomCreate {
  academic_year?: AcademicYear;
  name: Name3;
  school_id: SchoolId1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ClassroomMemberAdd".
 */
export interface ClassroomMemberAdd {
  email: Email;
  role: ClassroomRole;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ClassroomMemberOut".
 */
export interface ClassroomMemberOut {
  role: ClassroomRole;
  user: UserSummary;
}
/**
 * Minimal user view for other users (no timestamps).
 *
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "UserSummary".
 */
export interface UserSummary {
  display_name: DisplayName;
  email: Email1;
  id: Id11;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ClassroomOut".
 */
export interface ClassroomOut {
  academic_year: AcademicYear1;
  created_at: CreatedAt2;
  id: Id12;
  name: Name4;
  school_id: SchoolId2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ConceptCount".
 */
export interface ConceptCount {
  concept: Concept;
  count: Count1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CourseAnalytics".
 */
export interface CourseAnalytics {
  assessments: Assessments;
  attention: Attention;
  avg_completion_rate: AvgCompletionRate;
  avg_score_rate: AvgScoreRate2;
  course_id: CourseId3;
  enrolled: Enrolled;
  insights: Insights;
  lessons: Lessons1;
  min_group_size: MinGroupSize;
  missing_concepts: MissingConcepts1;
  objectives: Objectives3;
  suppressed: Suppressed1;
  total_lessons: TotalLessons;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "StudentAttention".
 */
export interface StudentAttention {
  completed_lessons: CompletedLessons;
  display_name: DisplayName1;
  gap_objectives: GapObjectives;
  reasons: Reasons;
  student_id: StudentId1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "Insight".
 */
export interface Insight {
  kind: Kind;
  message: Message;
  severity: Severity;
  target_id?: TargetId;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonStat".
 */
export interface LessonStat {
  chapter_title: ChapterTitle;
  completed: Completed;
  completion_rate: CompletionRate;
  lesson_id: LessonId5;
  title: Title16;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ObjectiveStat".
 */
export interface ObjectiveStat {
  avg_mastery: AvgMastery;
  chapter_title: ChapterTitle1;
  developing: Developing;
  gaps: Gaps;
  mastered: Mastered;
  objective_id: ObjectiveId;
  students_with_evidence: StudentsWithEvidence;
  text: Text5;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CourseCreate".
 */
export interface CourseCreate {
  description?: Description10;
  grade_level?: GradeLevel;
  school_id?: SchoolId3;
  subject?: Subject3;
  title: Title17;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CourseOut".
 */
export interface CourseOut {
  can_manage?: CanManage1;
  created_at: CreatedAt3;
  description: Description11;
  grade_level: GradeLevel1;
  id: Id13;
  join_code?: JoinCode2;
  school_id: SchoolId4;
  status: CourseStatus;
  subject: Subject4;
  title: Title18;
  updated_at: UpdatedAt4;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CourseOutline".
 */
export interface CourseOutline {
  can_manage: CanManage2;
  chapters: Chapters2;
  completed_lessons: CompletedLessons1;
  course_id: CourseId4;
  next_lesson_id: NextLessonId;
  title: Title21;
  total_lessons: TotalLessons1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "OutlineChapter".
 */
export interface OutlineChapter {
  description: Description12;
  id: Id14;
  lessons: Lessons2;
  position: Position6;
  progress: Progress1;
  published: Published1;
  title: Title20;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "OutlineLesson".
 */
export interface OutlineLesson {
  id: Id15;
  position: Position5;
  progress: Progress;
  published: Published;
  scene_count?: SceneCount;
  title: Title19;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CourseProgressSummary".
 */
export interface CourseProgressSummary {
  completed_lessons: CompletedLessons2;
  course_id: CourseId5;
  last_activity_at: LastActivityAt;
  next_lesson_id: NextLessonId1;
  title: Title22;
  total_lessons: TotalLessons2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CourseUpdate".
 */
export interface CourseUpdate {
  description?: Description13;
  grade_level?: GradeLevel2;
  status?: CourseStatus | null;
  subject?: Subject5;
  title?: Title23;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "DeleteAccountRequest".
 */
export interface DeleteAccountRequest {
  password: Password;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "DocumentJobResponse".
 */
export interface DocumentJobResponse {
  document: DocumentOut;
  job: JobOut;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "DocumentOut".
 */
export interface DocumentOut {
  course_id: CourseId6;
  created_at: CreatedAt4;
  error_message: ErrorMessage1;
  id: Id16;
  mime_type: MimeType;
  original_filename: OriginalFilename;
  page_count: PageCount;
  pages_needing_ocr: PagesNeedingOcr;
  processing_status: DocumentStatus;
  size_bytes: SizeBytes1;
  title: Title24;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "JobOut".
 */
export interface JobOut {
  attempt_count: AttemptCount;
  created_at: CreatedAt5;
  error_code: ErrorCode;
  error_message: ErrorMessage2;
  finished_at: FinishedAt;
  id: Id17;
  job_type: JobType;
  result: Result;
  status: Status8;
  target_id: TargetId1;
  target_type: TargetType;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "DownloadUrl".
 */
export interface DownloadUrl {
  expires_in_s: ExpiresInS;
  url: Url1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "EnrollRequest".
 */
export interface EnrollRequest {
  classroom_id?: ClassroomId;
  student_email?: StudentEmail;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "EnrollResult".
 */
export interface EnrollResult {
  already_enrolled: AlreadyEnrolled;
  enrolled: Enrolled1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "EnrollmentOut".
 */
export interface EnrollmentOut {
  classroom_id: ClassroomId1;
  enrolled_at: EnrolledAt;
  student: UserSummary;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "EventBatch".
 */
export interface EventBatch {
  events: Events;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "EventIn".
 */
export interface EventIn {
  animation_id?: AnimationId1;
  component_id?: ComponentId1;
  event_type: EventType;
  lesson_id: LessonId6;
  scene_id?: SceneId3;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "EventResult".
 */
export interface EventResult {
  recorded: Recorded;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ExplainSelectionRequest".
 */
export interface ExplainSelectionRequest {
  text: Text6;
}
/**
 * A 3D generation in the library's "In progress" list (running or recently finished).
 *
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "GenerationJobOut".
 */
export interface GenerationJobOut {
  asset_id: AssetId1;
  asset_name: AssetName;
  created_at: CreatedAt6;
  error_message: ErrorMessage3;
  finished_at: FinishedAt1;
  has_model: HasModel;
  job_id: JobId1;
  lesson_id?: LessonId7;
  lesson_title?: LessonTitle2;
  prompt_preview: PromptPreview;
  provider: Provider1;
  scene_id?: SceneId4;
  status: Status9;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "GenerationRequest".
 */
export interface GenerationRequest {
  lesson_id?: LessonId8;
  name: Name5;
  prompt: Prompt1;
  provider?: Provider2;
  school_id?: SchoolId5;
  subject?: Subject6;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "GenerationResponse".
 */
export interface GenerationResponse {
  asset: AssetOut;
  job_id: JobId2;
  job_status: JobStatus;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "GeneratorOut".
 */
export interface GeneratorOut {
  default_components: DefaultComponents;
  description: Description14;
  name: Name6;
  params: Params1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "GeneratorParamOut".
 */
export interface GeneratorParamOut {
  kind: Kind1;
  max: Max;
  min: Min;
  name: Name7;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "HTTPValidationError".
 */
export interface HTTPValidationError {
  detail?: Detail;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ValidationError".
 */
export interface ValidationError {
  ctx?: Context;
  input?: Input;
  loc: Location;
  msg: Message1;
  type: ErrorType;
}
export interface Context {}
export interface Input {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "HealthResponse".
 */
export interface HealthResponse {
  environment: Environment;
  status: Status10;
}
/**
 * What a code unlocks, shown before an account is created or a code is applied.
 *
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "JoinPreview".
 */
export interface JoinPreview {
  as_student: AsStudent;
  as_teacher: AsTeacher;
  code: Code;
  grade_level?: GradeLevel3;
  id: Id18;
  kind: Kind2;
  name: Name8;
  school_name?: SchoolName1;
  subject?: Subject7;
  teacher_name?: TeacherName;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "JoinRequest".
 */
export interface JoinRequest {
  code: Code1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "JoinResult".
 */
export interface JoinResult {
  joined: Joined;
  kind: Kind3;
  name: Name9;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LabCreate".
 */
export interface LabCreate {
  chapter_id?: ChapterId2;
  course_id?: CourseId7;
  goal?: Goal;
  instructions?: Instructions;
  kind?: Kind4;
  palette?: Palette;
  title: Title25;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LabKindOut".
 */
export interface LabKindOut {
  default_goal: DefaultGoal;
  default_palette: DefaultPalette;
  description: Description15;
  kind: Kind5;
  options: Options2;
  title: Title26;
}
export interface DefaultGoal {
  [k: string]: unknown;
}
export interface DefaultPalette {
  [k: string]: unknown;
}
export interface Options2 {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LabOut".
 */
export interface LabOut {
  can_manage: CanManage3;
  chapter_id: ChapterId3;
  chapter_title: ChapterTitle2;
  course_id: CourseId8;
  course_title: CourseTitle;
  created_at: CreatedAt7;
  goal: Goal1;
  id: Id19;
  instructions: Instructions1;
  kind: Kind6;
  palette: Palette1;
  session?: SessionOut | null;
  status: Status12;
  students_completed?: StudentsCompleted;
  students_started?: StudentsStarted;
  title: Title27;
  updated_at: UpdatedAt5;
  visibility_note?: VisibilityNote;
}
export interface Goal1 {
  [k: string]: unknown;
}
export interface Palette1 {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SessionOut".
 */
export interface SessionOut {
  achieved: Achieved;
  completed_at: CompletedAt;
  id: Id20;
  interactions: Interactions;
  last_activity_at: LastActivityAt1;
  result: Result1;
  started_at: StartedAt;
  state: State;
  status: Status11;
}
export interface Result1 {
  [k: string]: unknown;
}
export interface State {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LabSummary".
 */
export interface LabSummary {
  chapter_id: ChapterId4;
  goal: Goal2;
  id: Id21;
  kind: Kind7;
  session_status?: SessionStatus;
  status: Status13;
  title: Title28;
}
export interface Goal2 {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LabUpdate".
 */
export interface LabUpdate {
  chapter_id?: ChapterId5;
  clear_chapter?: ClearChapter;
  clear_course?: ClearCourse;
  course_id?: CourseId9;
  goal?: Goal3;
  instructions?: Instructions2;
  palette?: Palette2;
  status?: Status14;
  title?: Title29;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonContent".
 */
export interface LessonContent {
  schema_version?: SchemaVersion3;
  sections?: Sections;
  summary?: Summary;
  visualization_candidates?: VisualizationCandidates;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonSection".
 */
export interface LessonSection {
  body_markdown: BodyMarkdown;
  key_terms?: KeyTerms;
  source_refs?: SourceRefs7;
  title: Title30;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SourceRef".
 */
export interface SourceRef {
  document_id: DocumentId2;
  page: Page;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "VisualizationCandidate".
 */
export interface VisualizationCandidate {
  concept: Concept1;
  learning_reason: LearningReason;
  visualization_type: VisualizationType;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonCreate".
 */
export interface LessonCreate {
  content?: LessonContent;
  title: Title31;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonOut".
 */
export interface LessonOut {
  chapter_id: ChapterId6;
  content: LessonContent;
  has_unpublished_changes: HasUnpublishedChanges3;
  id: Id22;
  origin: Origin4;
  position: Position7;
  published_version: PublishedVersion3;
  status: Status15;
  title: Title32;
  updated_at: UpdatedAt6;
  version: Version5;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonProgressOut".
 */
export interface LessonProgressOut {
  completed_at: CompletedAt1;
  lesson_id: LessonId9;
  status: Status16;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonSummary".
 */
export interface LessonSummary {
  has_unpublished_changes: HasUnpublishedChanges4;
  id: Id23;
  origin: Origin5;
  position: Position8;
  published_version: PublishedVersion4;
  status: Status17;
  title: Title33;
  version: Version6;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonUpdate".
 */
export interface LessonUpdate {
  content?: LessonContent | null;
  expected_version: ExpectedVersion1;
  title?: Title34;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonVersionOut".
 */
export interface LessonVersionOut {
  change_source: ChangeSource;
  created_at: CreatedAt8;
  title: Title35;
  version_number: VersionNumber2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LoginRequest".
 */
export interface LoginRequest {
  email: Email2;
  password: Password1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ObjectiveIn".
 */
export interface ObjectiveIn {
  source_refs?: SourceRefs8;
  text: Text7;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ObjectiveMastery".
 */
export interface ObjectiveMastery {
  evidence_count: EvidenceCount;
  mastery: Mastery;
  objective_id: ObjectiveId1;
  status: Status18;
  text: Text8;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "OutlineProposalOut".
 */
export interface OutlineProposalOut {
  created_at: CreatedAt9;
  id: Id24;
  model: Model;
  output: Output;
  prompt_id: PromptId;
  prompt_version: PromptVersion;
  status: Status19;
  validation: Validation;
}
export interface Output {
  [k: string]: unknown;
}
export interface Validation {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "PageList".
 */
export interface PageList {
  items: Items2;
  total: Total;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "PageOut".
 */
export interface PageOut {
  extracted_text: ExtractedText;
  extraction_method: ExtractionMethod;
  page_number: PageNumber;
  quality_status: QualityStatus;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "PartDeepDiveRequest".
 */
export interface PartDeepDiveRequest {
  part: Part;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "PartInsightRequest".
 */
export interface PartInsightRequest {
  action: Action9;
  compare_with?: CompareWith;
  component_id: ComponentId2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "PartUpdate".
 */
export interface PartUpdate {
  description?: Description16;
  label?: Label2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ProgressUpdate".
 */
export interface ProgressUpdate {
  status: Status20;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "PromptDraftOut".
 */
export interface PromptDraftOut {
  created_at: CreatedAt10;
  edited: Edited;
  focus: Focus;
  id: Id25;
  level: Level;
  parts: Parts1;
  prompt: Prompt2;
  subject: Subject8;
  title: Title36;
  topic: Topic;
  updated_at: UpdatedAt7;
}
/**
 * Topic for an AI-written, in-depth 3D build brief (3D library).
 *
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "PromptDraftRequest".
 */
export interface PromptDraftRequest {
  focus?: Focus1;
  level?: Level1;
  subject?: Subject9;
  topic: Topic1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "PromptDraftUpdate".
 */
export interface PromptDraftUpdate {
  prompt?: Prompt3;
  title?: Title37;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ProviderHealthOut".
 */
export interface ProviderHealthOut {
  message: Message2;
  name: Name10;
  ok: Ok;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "PublishChapterRequest".
 */
export interface PublishChapterRequest {
  include_course?: IncludeCourse;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "PublishChapterResult".
 */
export interface PublishChapterResult {
  assessments_published: AssessmentsPublished;
  chapter_status: ChapterStatus;
  course_status: CourseStatus1;
  lessons_published: LessonsPublished;
  scenes_published: ScenesPublished;
  skipped: Skipped;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SkippedItem".
 */
export interface SkippedItem {
  id: Id26;
  kind: Kind8;
  reason: Reason1;
  title: Title38;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "QuestionsUpdate".
 */
export interface QuestionsUpdate {
  content: AssessmentContent;
  expected_version: ExpectedVersion2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ReadinessResponse".
 */
export interface ReadinessResponse {
  database: Database;
  queue: Queue;
  status: Status21;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "Recommendation".
 */
export interface Recommendation {
  lesson_id: LessonId10;
  lesson_title: LessonTitle3;
  reason: Reason2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "RegisterRequest".
 */
export interface RegisterRequest {
  account_type: AccountType1;
  display_name: DisplayName2;
  email: Email3;
  join_code?: JoinCode3;
  password: Password2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ResolvedAsset".
 */
export interface ResolvedAsset {
  asset_id: AssetId2;
  attribution_text: AttributionText2;
  insights?: Insights1;
  license_name: LicenseName2;
  name: Name11;
  node_names: NodeNames;
  parts?: Parts2;
  source_url: SourceUrl2;
  tour?: Tour;
  url: Url2;
  version: Version7;
}
export interface Insights1 {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ResolvedScene".
 */
export interface ResolvedScene {
  animations?: Animations;
  assets: Assets;
  scene_id: SceneId5;
  spec: SceneSpec;
  version: Version8;
  warnings: Warnings1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ReviewDecision".
 */
export interface ReviewDecision {
  final_score: FinalScore1;
  teacher_feedback?: TeacherFeedback1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ReviewItem".
 */
export interface ReviewItem {
  answer_text: AnswerText2;
  attempt_id: AttemptId3;
  confidence: Confidence;
  evaluation_id: EvaluationId;
  feedback: Feedback;
  missing_concepts: MissingConcepts2;
  model_answer: ModelAnswer1;
  points: Points4;
  question_key: QuestionKey3;
  question_text: QuestionText4;
  rubric: Rubric1;
  status: Status22;
  student_name: StudentName1;
  suggested_score: SuggestedScore;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SceneCreate".
 */
export interface SceneCreate {
  spec: SceneSpec;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SceneUpdate".
 */
export interface SceneUpdate {
  expected_version: ExpectedVersion3;
  spec: SceneSpec;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SchoolCreate".
 */
export interface SchoolCreate {
  name: Name12;
  slug: Slug1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SchoolMemberAdd".
 */
export interface SchoolMemberAdd {
  email: Email4;
  role: SchoolRole;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SchoolMemberOut".
 */
export interface SchoolMemberOut {
  joined_at: JoinedAt;
  role: SchoolRole;
  user: UserSummary;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SchoolOut".
 */
export interface SchoolOut {
  created_at: CreatedAt11;
  id: Id27;
  join_code?: JoinCode4;
  my_role?: SchoolRole | null;
  name: Name13;
  slug: Slug2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SectionRegenerateRequest".
 */
export interface SectionRegenerateRequest {
  expected_version: ExpectedVersion4;
  instruction?: Instruction;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SessionPut".
 */
export interface SessionPut {
  state: State1;
}
export interface State1 {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SessionResult".
 */
export interface SessionResult {
  achieved: Achieved1;
  goal_met: GoalMet;
  message: Message3;
  result: Result2;
  session: SessionOut | null;
}
export interface Result2 {
  [k: string]: unknown;
}
/**
 * Text to read aloud: one tour step (part name, explanation, link to the topic).
 *
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SpeechIn".
 */
export interface SpeechIn {
  text: Text9;
}
/**
 * Whether voice narration is available on this server (an ElevenLabs key is configured).
 *
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SpeechStatus".
 */
export interface SpeechStatus {
  enabled: Enabled;
  model?: Model1;
  voice_id?: VoiceId;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "StudentInsights".
 */
export interface StudentInsights {
  attempts: Attempts;
  avg_score_rate: AvgScoreRate3;
  completed_lessons: CompletedLessons3;
  course_id: CourseId10;
  display_name: DisplayName3;
  objectives: Objectives4;
  recommendations: Recommendations;
  student_id: StudentId2;
  total_lessons: TotalLessons3;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "StudentProgressRow".
 */
export interface StudentProgressRow {
  completed_chapters: CompletedChapters;
  completed_lessons: CompletedLessons4;
  display_name: DisplayName4;
  email: Email5;
  last_activity_at: LastActivityAt2;
  student_id: StudentId3;
  total_lessons: TotalLessons4;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "StudentSessionRow".
 */
export interface StudentSessionRow {
  achieved: Achieved2;
  completed_at: CompletedAt2;
  display_name: DisplayName5;
  flag: Flag;
  goal_met: GoalMet1;
  interactions: Interactions1;
  last_activity_at: LastActivityAt3;
  started_at: StartedAt1;
  status: Status23;
  student_id: StudentId4;
  summary: Summary1;
  total: Total1;
}
/**
 * A published 3D scene a student can open in the Studio (from their enrolled courses).
 *
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "StudioSceneOut".
 */
export interface StudioSceneOut {
  chapter_title: ChapterTitle3;
  course_id: CourseId11;
  course_title: CourseTitle1;
  lesson_id: LessonId11;
  lesson_title: LessonTitle4;
  scene_id: SceneId6;
  subject: Subject10;
  title: Title39;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SubmitRequest".
 */
export interface SubmitRequest {
  answers: Answers1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "TeacherAssessment".
 */
export interface TeacherAssessment {
  chapter_id: ChapterId7;
  content: AssessmentContent;
  has_unpublished_changes: HasUnpublishedChanges5;
  id: Id28;
  max_attempts: MaxAttempts4;
  max_score: MaxScore4;
  origin: Origin6;
  passing_score: PassingScore5;
  published_version: PublishedVersion5;
  question_count: QuestionCount2;
  questions_per_attempt: QuestionsPerAttempt3;
  settings: QuizSettings;
  status: Status24;
  title: Title40;
  version: Version9;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "TextDocumentRequest".
 */
export interface TextDocumentRequest {
  course_id: CourseId12;
  text: Text10;
  title: Title41;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ThreeDProviderOut".
 */
export interface ThreeDProviderOut {
  description: Description17;
  is_default: IsDefault;
  name: Name14;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "UploadInstructions".
 */
export interface UploadInstructions {
  headers: Headers1;
  method: Method1;
  url: Url3;
}
export interface Headers1 {
  [k: string]: string;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "UploadUrlRequest".
 */
export interface UploadUrlRequest {
  course_id: CourseId13;
  filename: Filename;
  mime_type: MimeType1;
  size_bytes: SizeBytes2;
  title?: Title42;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "UploadUrlResponse".
 */
export interface UploadUrlResponse {
  document: DocumentOut;
  upload: UploadInstructions;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "UserOut".
 */
export interface UserOut {
  account_type: AccountType;
  created_at: CreatedAt12;
  display_name: DisplayName6;
  email: Email6;
  id: Id29;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "UserUpdate".
 */
export interface UserUpdate {
  display_name: DisplayName7;
}
