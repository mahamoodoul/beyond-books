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
export type Title = string;
export type AttributionText = string;
export type Category = string | null;
export type Description1 = string;
export type LicenseName = string;
export type Name = string;
export type SchoolId = string | null;
export type SourceUrl = string | null;
export type Subject = string | null;
export type AttributionText1 = string;
export type CanManage = boolean;
export type Category1 = string | null;
export type CreatedAt = string;
export type Description2 = string;
export type Id = string;
export type LatestVersion = number;
export type LicenseName1 = string;
export type Name1 = string;
export type Provider = string;
export type ReviewNotes = string | null;
export type ReviewStatus = string;
export type Slug = string;
export type SourceUrl1 = string | null;
export type Subject1 = string | null;
export type CreatedAt1 = string;
export type ErrorMessage = string | null;
export type FileSizeBytes = number;
export type Status = string;
export type VersionNumber = number;
export type Versions = AssetVersionOut[];
export type Visibility = string;
export type AssetId = string;
export type Version = number;
export type Decision = "approved" | "rejected";
export type Notes = string | null;
export type Method = string;
export type Url = string;
export type VersionNumber1 = number;
export type SizeBytes = number;
export type MaxDistance = number;
export type MinDistance = number;
export type CameraPreset = "front" | "side" | "top" | "three_quarter";
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CameraPreset".
 */
export type CameraPreset1 = "front" | "side" | "top" | "three_quarter";
export type Description3 = string;
/**
 * @maxItems 20
 */
export type SourceRefs1 = ChapterSourceRef[];
export type Title1 = string;
export type CourseId = string;
export type Description4 = string;
export type Id1 = string;
export type Id2 = string;
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
export type Title2 = string;
export type UpdatedAt = string;
export type CourseId1 = string;
export type Description5 = string;
export type Id3 = string;
export type Position2 = number;
export type SourceRefs4 = {
  [k: string]: unknown;
}[];
export type Title3 = string;
export type UpdatedAt1 = string;
export type Description6 = string | null;
export type Position3 = number | null;
export type SourceRefs5 = ChapterSourceRef[] | null;
export type Title4 = string | null;
export type AcademicYear = string | null;
export type Name2 = string;
export type SchoolId1 = string;
export type Email = string;
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ClassroomRole".
 */
export type ClassroomRole = "teacher" | "student";
export type DisplayName = string;
export type Email1 = string;
export type Id4 = string;
export type AcademicYear1 = string | null;
export type CreatedAt2 = string;
export type Id5 = string;
export type Name3 = string;
export type SchoolId2 = string;
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ComponentAction".
 */
export type ComponentAction =
  "highlight" | "show_explanation" | "toggle_visibility" | "focus_camera";
export type Description7 = string;
export type GradeLevel = string | null;
export type SchoolId3 = string | null;
export type Subject2 = string | null;
export type Title5 = string;
export type CanManage1 = boolean;
export type CreatedAt3 = string;
export type Description8 = string;
export type GradeLevel1 = string | null;
export type Id6 = string;
export type SchoolId4 = string | null;
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CourseStatus".
 */
export type CourseStatus = "draft" | "published" | "archived";
export type Subject3 = string | null;
export type Title6 = string;
export type UpdatedAt2 = string;
export type Description9 = string | null;
export type GradeLevel2 = string | null;
export type Subject4 = string | null;
export type Title7 = string | null;
export type CourseId2 = string;
export type CreatedAt4 = string;
export type ErrorMessage1 = string | null;
export type Id7 = string;
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
export type Title8 = string;
export type AttemptCount = number;
export type CreatedAt5 = string;
export type ErrorCode = string | null;
export type ErrorMessage2 = string | null;
export type FinishedAt = string | null;
export type Id8 = string;
export type JobType = string;
export type Result = {
  [k: string]: unknown;
} | null;
export type Status1 = string;
export type TargetId = string;
export type TargetType = string;
export type ExpiresInS = number;
export type Url1 = string;
export type ClassroomId = string | null;
export type StudentEmail = string | null;
export type AlreadyEnrolled = number;
export type Enrolled = number;
export type ClassroomId1 = string | null;
export type EnrolledAt = string;
export type Name4 = string;
export type Prompt = string;
export type SchoolId5 = string | null;
export type Subject5 = string | null;
export type JobId = string;
export type JobStatus = string;
export type DefaultComponents = string[];
export type Description10 = string;
export type Name5 = string;
export type Kind = string;
export type Max = number | null;
export type Min = number | null;
export type Name6 = string;
export type Params = GeneratorParamOut[];
export type Location = (string | number)[];
export type Message = string;
export type ErrorType = string;
export type Detail = ValidationError[];
export type Environment = string;
export type Status2 = string;
export type SchemaVersion = "1.0";
export type BodyMarkdown = string;
/**
 * @maxItems 30
 */
export type KeyTerms = string[];
export type DocumentId1 = string;
export type Page = number;
/**
 * @maxItems 30
 */
export type SourceRefs6 = SourceRef[];
export type Title9 = string;
/**
 * @maxItems 40
 */
export type Sections = LessonSection[];
/**
 * @maxItems 20
 */
export type Summary = string[];
export type Concept = string;
export type LearningReason = string;
export type VisualizationType =
  "anatomical_model" | "procedural_geometry" | "simulation" | "process_animation" | "diagram";
/**
 * @maxItems 10
 */
export type VisualizationCandidates = VisualizationCandidate[];
export type Title10 = string;
export type ChapterId = string;
export type HasUnpublishedChanges = boolean;
export type Id9 = string;
export type Origin = string;
export type Position4 = number;
export type PublishedVersion = number | null;
export type Status3 = string;
export type Title11 = string;
export type UpdatedAt3 = string;
export type Version1 = number;
export type HasUnpublishedChanges1 = boolean;
export type Id10 = string;
export type Origin1 = string;
export type Position5 = number;
export type PublishedVersion1 = number | null;
export type Status4 = string;
export type Title12 = string;
export type Version2 = number;
/**
 * Optimistic concurrency check.
 */
export type ExpectedVersion = number;
export type Title13 = string | null;
export type ChangeSource = string;
export type CreatedAt6 = string;
export type Title14 = string;
export type VersionNumber2 = number;
export type Email2 = string;
export type Password = string;
/**
 * @maxItems 20
 */
export type SourceRefs7 = {
  [k: string]: unknown;
}[];
export type Text = string;
export type CreatedAt7 = string;
export type Id11 = string;
export type Model = string;
export type PromptId = string;
export type PromptVersion = string;
export type Status5 = string;
export type ExtractedText = string;
export type ExtractionMethod = string;
export type PageNumber = number;
export type QualityStatus = string;
export type Items = PageOut[];
export type Total = number;
export type Generator = string;
export type AccountType1 = "teacher" | "student";
export type DisplayName1 = string;
export type Email3 = string;
export type Password1 = string;
export type AssetId1 = string;
export type AttributionText2 = string;
export type LicenseName2 = string;
export type Name7 = string;
export type NodeNames = string[];
export type SourceUrl2 = string | null;
export type Url2 = string;
export type Version3 = number;
export type Assets = ResolvedAsset[];
export type SceneId = string;
/**
 * @maxItems 50
 */
export type AnimationRefs = string[];
/**
 * @maxItems 20
 */
export type AssetRefs = AssetRef[];
/**
 * @maxItems 4
 */
export type Actions = ComponentAction[];
export type ComponentId = string;
export type ExplanationRef = string | null;
export type Label = string;
export type MeshName = string;
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
/**
 * @maxItems 20
 */
export type Procedural = ProceduralSource[];
export type SceneId1 = string;
export type SchemaVersion1 = "1.0";
export type Title15 = string;
export type Version4 = number;
export type Warnings = string[];
export type HasUnpublishedChanges2 = boolean;
export type Id12 = string;
export type LessonId = string;
export type Origin2 = string;
export type PlanningRationale = string | null;
export type PublishedVersion2 = number | null;
export type Status6 = string;
export type Title16 = string;
export type UpdatedAt4 = string;
export type Version5 = number;
export type Warnings1 = string[];
export type ExpectedVersion1 = number;
export type Name8 = string;
export type Slug1 = string;
export type Email4 = string;
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SchoolRole".
 */
export type SchoolRole = "school_admin" | "teacher" | "student";
export type JoinedAt = string;
export type CreatedAt8 = string;
export type Id13 = string;
export type Name9 = string;
export type Slug2 = string;
export type ExpectedVersion2 = number;
export type Instruction = string | null;
export type CourseId3 = string;
export type Text1 = string;
export type Title17 = string;
export type Method1 = string;
export type Url3 = string;
export type CourseId4 = string;
export type Filename = string;
export type MimeType1 = "application/pdf" | "text/plain" | "text/markdown";
export type SizeBytes2 = number;
export type Title18 = string | null;
export type CreatedAt9 = string;
export type DisplayName2 = string;
export type Email5 = string;
export type Id14 = string;
export type DisplayName3 = string;

export interface Api {
  AIUsageOut?: AIUsageOut;
  AccountType?: AccountType;
  ApplyOutlineRequest?: ApplyOutlineRequest;
  AssetCreate?: AssetCreate;
  AssetOut?: AssetOut;
  AssetRef?: AssetRef;
  AssetReview?: AssetReview;
  AssetUploadResponse?: AssetUploadResponse;
  AssetVersionOut?: AssetVersionOut;
  AssetVersionUploadRequest?: AssetVersionUploadRequest;
  Camera?: Camera;
  CameraPreset?: CameraPreset1;
  ChapterCreate?: ChapterCreate;
  ChapterDetail?: ChapterDetail;
  ChapterOut?: ChapterOut;
  ChapterSourceRef?: ChapterSourceRef;
  ChapterUpdate?: ChapterUpdate;
  ClassroomCreate?: ClassroomCreate;
  ClassroomMemberAdd?: ClassroomMemberAdd;
  ClassroomMemberOut?: ClassroomMemberOut;
  ClassroomOut?: ClassroomOut;
  ClassroomRole?: ClassroomRole;
  ComponentAction?: ComponentAction;
  CourseCreate?: CourseCreate;
  CourseOut?: CourseOut;
  CourseStatus?: CourseStatus;
  CourseUpdate?: CourseUpdate;
  DocumentJobResponse?: DocumentJobResponse;
  DocumentOut?: DocumentOut;
  DocumentStatus?: DocumentStatus;
  DownloadUrl?: DownloadUrl;
  EnrollRequest?: EnrollRequest;
  EnrollResult?: EnrollResult;
  EnrollmentOut?: EnrollmentOut;
  GenerationRequest?: GenerationRequest;
  GenerationResponse?: GenerationResponse;
  GeneratorOut?: GeneratorOut;
  GeneratorParamOut?: GeneratorParamOut;
  HTTPValidationError?: HTTPValidationError;
  HealthResponse?: HealthResponse;
  JobOut?: JobOut;
  LessonContent?: LessonContent;
  LessonCreate?: LessonCreate;
  LessonOut?: LessonOut;
  LessonSection?: LessonSection;
  LessonSummary?: LessonSummary;
  LessonUpdate?: LessonUpdate;
  LessonVersionOut?: LessonVersionOut;
  LoginRequest?: LoginRequest;
  ObjectiveIn?: ObjectiveIn;
  ObjectiveOut?: ObjectiveOut;
  OutlineChapterIn?: OutlineChapterIn;
  OutlineProposalOut?: OutlineProposalOut;
  PageList?: PageList;
  PageOut?: PageOut;
  ProceduralSource?: ProceduralSource;
  PublishStatus?: PublishStatus;
  RegisterRequest?: RegisterRequest;
  ResolvedAsset?: ResolvedAsset;
  ResolvedScene?: ResolvedScene;
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
  SourceRef?: SourceRef;
  TextDocumentRequest?: TextDocumentRequest;
  UploadInstructions?: UploadInstructions;
  UploadUrlRequest?: UploadUrlRequest;
  UploadUrlResponse?: UploadUrlResponse;
  UserOut?: UserOut;
  UserSummary?: UserSummary;
  UserUpdate?: UserUpdate;
  ValidationError?: ValidationError;
  VisualizationCandidate?: VisualizationCandidate;
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
  title: Title;
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
 * via the `definition` "AssetCreate".
 */
export interface AssetCreate {
  attribution_text?: AttributionText;
  category?: Category;
  description?: Description1;
  license_name: LicenseName;
  name: Name;
  school_id?: SchoolId;
  source_url?: SourceUrl;
  subject?: Subject;
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
  description: Description2;
  id: Id;
  latest_version: LatestVersion;
  license_name: LicenseName1;
  name: Name1;
  provider: Provider;
  review_notes: ReviewNotes;
  review_status: ReviewStatus;
  slug: Slug;
  source_url: SourceUrl1;
  subject: Subject1;
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
  status: Status;
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
  version: Version;
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
  description?: Description3;
  source_refs?: SourceRefs1;
  title: Title1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterDetail".
 */
export interface ChapterDetail {
  course_id: CourseId;
  description: Description4;
  id: Id1;
  objectives?: Objectives1;
  position: Position1;
  source_refs: SourceRefs3;
  status: PublishStatus;
  title: Title2;
  updated_at: UpdatedAt;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ObjectiveOut".
 */
export interface ObjectiveOut {
  id: Id2;
  objective_text: ObjectiveText;
  position: Position;
  source_refs: SourceRefs2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterOut".
 */
export interface ChapterOut {
  course_id: CourseId1;
  description: Description5;
  id: Id3;
  position: Position2;
  source_refs: SourceRefs4;
  status: PublishStatus;
  title: Title3;
  updated_at: UpdatedAt1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterUpdate".
 */
export interface ChapterUpdate {
  description?: Description6;
  position?: Position3;
  source_refs?: SourceRefs5;
  status?: PublishStatus | null;
  title?: Title4;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ClassroomCreate".
 */
export interface ClassroomCreate {
  academic_year?: AcademicYear;
  name: Name2;
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
  id: Id4;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ClassroomOut".
 */
export interface ClassroomOut {
  academic_year: AcademicYear1;
  created_at: CreatedAt2;
  id: Id5;
  name: Name3;
  school_id: SchoolId2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CourseCreate".
 */
export interface CourseCreate {
  description?: Description7;
  grade_level?: GradeLevel;
  school_id?: SchoolId3;
  subject?: Subject2;
  title: Title5;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CourseOut".
 */
export interface CourseOut {
  can_manage?: CanManage1;
  created_at: CreatedAt3;
  description: Description8;
  grade_level: GradeLevel1;
  id: Id6;
  school_id: SchoolId4;
  status: CourseStatus;
  subject: Subject3;
  title: Title6;
  updated_at: UpdatedAt2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CourseUpdate".
 */
export interface CourseUpdate {
  description?: Description9;
  grade_level?: GradeLevel2;
  status?: CourseStatus | null;
  subject?: Subject4;
  title?: Title7;
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
  course_id: CourseId2;
  created_at: CreatedAt4;
  error_message: ErrorMessage1;
  id: Id7;
  mime_type: MimeType;
  original_filename: OriginalFilename;
  page_count: PageCount;
  pages_needing_ocr: PagesNeedingOcr;
  processing_status: DocumentStatus;
  size_bytes: SizeBytes1;
  title: Title8;
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
  id: Id8;
  job_type: JobType;
  result: Result;
  status: Status1;
  target_id: TargetId;
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
  enrolled: Enrolled;
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
 * via the `definition` "GenerationRequest".
 */
export interface GenerationRequest {
  name: Name4;
  prompt: Prompt;
  school_id?: SchoolId5;
  subject?: Subject5;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "GenerationResponse".
 */
export interface GenerationResponse {
  asset: AssetOut;
  job_id: JobId;
  job_status: JobStatus;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "GeneratorOut".
 */
export interface GeneratorOut {
  default_components: DefaultComponents;
  description: Description10;
  name: Name5;
  params: Params;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "GeneratorParamOut".
 */
export interface GeneratorParamOut {
  kind: Kind;
  max: Max;
  min: Min;
  name: Name6;
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
  msg: Message;
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
  status: Status2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonContent".
 */
export interface LessonContent {
  schema_version?: SchemaVersion;
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
  source_refs?: SourceRefs6;
  title: Title9;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SourceRef".
 */
export interface SourceRef {
  document_id: DocumentId1;
  page: Page;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "VisualizationCandidate".
 */
export interface VisualizationCandidate {
  concept: Concept;
  learning_reason: LearningReason;
  visualization_type: VisualizationType;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonCreate".
 */
export interface LessonCreate {
  content?: LessonContent;
  title: Title10;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonOut".
 */
export interface LessonOut {
  chapter_id: ChapterId;
  content: LessonContent;
  has_unpublished_changes: HasUnpublishedChanges;
  id: Id9;
  origin: Origin;
  position: Position4;
  published_version: PublishedVersion;
  status: Status3;
  title: Title11;
  updated_at: UpdatedAt3;
  version: Version1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonSummary".
 */
export interface LessonSummary {
  has_unpublished_changes: HasUnpublishedChanges1;
  id: Id10;
  origin: Origin1;
  position: Position5;
  published_version: PublishedVersion1;
  status: Status4;
  title: Title12;
  version: Version2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonUpdate".
 */
export interface LessonUpdate {
  content?: LessonContent | null;
  expected_version: ExpectedVersion;
  title?: Title13;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonVersionOut".
 */
export interface LessonVersionOut {
  change_source: ChangeSource;
  created_at: CreatedAt6;
  title: Title14;
  version_number: VersionNumber2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LoginRequest".
 */
export interface LoginRequest {
  email: Email2;
  password: Password;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ObjectiveIn".
 */
export interface ObjectiveIn {
  source_refs?: SourceRefs7;
  text: Text;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "OutlineProposalOut".
 */
export interface OutlineProposalOut {
  created_at: CreatedAt7;
  id: Id11;
  model: Model;
  output: Output;
  prompt_id: PromptId;
  prompt_version: PromptVersion;
  status: Status5;
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
  items: Items;
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
 * A trusted, prebuilt procedural generator in the renderer (design §7.1-A).
 *
 * `generator` must exist in the renderer's allowlisted registry; params are flat scalars only.
 *
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ProceduralSource".
 */
export interface ProceduralSource {
  generator: Generator;
  params?: Params1;
}
export interface Params1 {
  /**
   * This interface was referenced by `Params1`'s JSON-Schema definition
   * via the `patternProperty` "^[a-z][a-z0-9_]{0,63}$".
   */
  [k: string]: number | boolean | string;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "RegisterRequest".
 */
export interface RegisterRequest {
  account_type: AccountType1;
  display_name: DisplayName1;
  email: Email3;
  password: Password1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ResolvedAsset".
 */
export interface ResolvedAsset {
  asset_id: AssetId1;
  attribution_text: AttributionText2;
  license_name: LicenseName2;
  name: Name7;
  node_names: NodeNames;
  source_url: SourceUrl2;
  url: Url2;
  version: Version3;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ResolvedScene".
 */
export interface ResolvedScene {
  assets: Assets;
  scene_id: SceneId;
  spec: SceneSpec;
  version: Version4;
  warnings: Warnings;
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
  procedural?: Procedural;
  scene_id: SceneId1;
  schema_version?: SchemaVersion1;
  title: Title15;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SceneComponent".
 */
export interface SceneComponent {
  actions?: Actions;
  component_id: ComponentId;
  explanation_ref?: ExplanationRef;
  label: Label;
  mesh_name: MeshName;
}
export interface Explanations {
  /**
   * This interface was referenced by `Explanations`'s JSON-Schema definition
   * via the `patternProperty` "^[a-z][a-z0-9_]{0,63}$".
   */
  [k: string]: string;
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
 * via the `definition` "SceneOut".
 */
export interface SceneOut {
  has_unpublished_changes: HasUnpublishedChanges2;
  id: Id12;
  lesson_id: LessonId;
  origin?: Origin2;
  planning_rationale?: PlanningRationale;
  published_version: PublishedVersion2;
  spec: SceneSpec;
  status: Status6;
  title: Title16;
  updated_at: UpdatedAt4;
  version: Version5;
  warnings?: Warnings1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SceneUpdate".
 */
export interface SceneUpdate {
  expected_version: ExpectedVersion1;
  spec: SceneSpec;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SchoolCreate".
 */
export interface SchoolCreate {
  name: Name8;
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
  created_at: CreatedAt8;
  id: Id13;
  my_role?: SchoolRole | null;
  name: Name9;
  slug: Slug2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SectionRegenerateRequest".
 */
export interface SectionRegenerateRequest {
  expected_version: ExpectedVersion2;
  instruction?: Instruction;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "TextDocumentRequest".
 */
export interface TextDocumentRequest {
  course_id: CourseId3;
  text: Text1;
  title: Title17;
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
  course_id: CourseId4;
  filename: Filename;
  mime_type: MimeType1;
  size_bytes: SizeBytes2;
  title?: Title18;
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
  created_at: CreatedAt9;
  display_name: DisplayName2;
  email: Email5;
  id: Id14;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "UserUpdate".
 */
export interface UserUpdate {
  display_name: DisplayName3;
}
