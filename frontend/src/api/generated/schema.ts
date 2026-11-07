/* AUTO-GENERATED from backend OpenAPI — do not edit. Run `npm run api:types`. */

/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AccountType".
 */
export type AccountType = "teacher" | "student";
export type Description = string;
export type DocumentId = string;
export type PageEnd = number;
export type PageStart = number;
/**
 * @maxItems 20
 */
export type SourceRefs = ChapterSourceRef[];
export type Title = string;
export type CourseId = string;
export type Description1 = string;
export type Id = string;
export type Id1 = string;
export type ObjectiveText = string;
export type Position = number;
export type SourceRefs1 = {
  [k: string]: unknown;
}[];
export type Objectives = ObjectiveOut[];
export type Position1 = number;
export type SourceRefs2 = {
  [k: string]: unknown;
}[];
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "PublishStatus".
 */
export type PublishStatus = "draft" | "published";
export type Title1 = string;
export type UpdatedAt = string;
export type CourseId1 = string;
export type Description2 = string;
export type Id2 = string;
export type Position2 = number;
export type SourceRefs3 = {
  [k: string]: unknown;
}[];
export type Title2 = string;
export type UpdatedAt1 = string;
export type Description3 = string | null;
export type Position3 = number | null;
export type SourceRefs4 = ChapterSourceRef[] | null;
export type Title3 = string | null;
export type AcademicYear = string | null;
export type Name = string;
export type SchoolId = string;
export type Email = string;
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ClassroomRole".
 */
export type ClassroomRole = "teacher" | "student";
export type DisplayName = string;
export type Email1 = string;
export type Id3 = string;
export type AcademicYear1 = string | null;
export type CreatedAt = string;
export type Id4 = string;
export type Name1 = string;
export type SchoolId1 = string;
export type Description4 = string;
export type GradeLevel = string | null;
export type SchoolId2 = string | null;
export type Subject = string | null;
export type Title4 = string;
export type CanManage = boolean;
export type CreatedAt1 = string;
export type Description5 = string;
export type GradeLevel1 = string | null;
export type Id5 = string;
export type SchoolId3 = string | null;
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CourseStatus".
 */
export type CourseStatus = "draft" | "published" | "archived";
export type Subject1 = string | null;
export type Title5 = string;
export type UpdatedAt2 = string;
export type Description6 = string | null;
export type GradeLevel2 = string | null;
export type Subject2 = string | null;
export type Title6 = string | null;
export type CourseId2 = string;
export type CreatedAt2 = string;
export type ErrorMessage = string | null;
export type Id6 = string;
export type MimeType = string;
export type OriginalFilename = string;
export type PageCount = number | null;
export type PagesNeedingOcr = number;
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "DocumentStatus".
 */
export type DocumentStatus = "pending_upload" | "uploaded" | "processing" | "ready" | "failed";
export type SizeBytes = number;
export type Title7 = string;
export type AttemptCount = number;
export type CreatedAt3 = string;
export type ErrorCode = string | null;
export type ErrorMessage1 = string | null;
export type FinishedAt = string | null;
export type Id7 = string;
export type JobType = string;
export type Result = {
  [k: string]: unknown;
} | null;
export type Status = string;
export type TargetId = string;
export type TargetType = string;
export type ClassroomId = string | null;
export type StudentEmail = string | null;
export type AlreadyEnrolled = number;
export type Enrolled = number;
export type ClassroomId1 = string | null;
export type EnrolledAt = string;
export type Location = (string | number)[];
export type Message = string;
export type ErrorType = string;
export type Detail = ValidationError[];
export type Environment = string;
export type Status1 = string;
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
export type SourceRefs5 = SourceRef[];
export type Title8 = string;
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
export type Title9 = string;
export type ChapterId = string;
export type HasUnpublishedChanges = boolean;
export type Id8 = string;
export type Origin = string;
export type Position4 = number;
export type PublishedVersion = number | null;
export type Status2 = string;
export type Title10 = string;
export type UpdatedAt3 = string;
export type Version = number;
export type HasUnpublishedChanges1 = boolean;
export type Id9 = string;
export type Origin1 = string;
export type Position5 = number;
export type PublishedVersion1 = number | null;
export type Status3 = string;
export type Title11 = string;
export type Version1 = number;
/**
 * Optimistic concurrency check.
 */
export type ExpectedVersion = number;
export type Title12 = string | null;
export type ChangeSource = string;
export type CreatedAt4 = string;
export type Title13 = string;
export type VersionNumber = number;
export type Email2 = string;
export type Password = string;
/**
 * @maxItems 20
 */
export type SourceRefs6 = {
  [k: string]: unknown;
}[];
export type Text = string;
export type ExtractedText = string;
export type ExtractionMethod = string;
export type PageNumber = number;
export type QualityStatus = string;
export type Items = PageOut[];
export type Total = number;
export type AccountType1 = "teacher" | "student";
export type DisplayName1 = string;
export type Email3 = string;
export type Password1 = string;
export type Name2 = string;
export type Slug = string;
export type Email4 = string;
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "SchoolRole".
 */
export type SchoolRole = "school_admin" | "teacher" | "student";
export type JoinedAt = string;
export type CreatedAt5 = string;
export type Id10 = string;
export type Name3 = string;
export type Slug1 = string;
export type CourseId3 = string;
export type Text1 = string;
export type Title14 = string;
export type Method = string;
export type Url = string;
export type CourseId4 = string;
export type Filename = string;
export type MimeType1 = "application/pdf" | "text/plain" | "text/markdown";
export type SizeBytes1 = number;
export type Title15 = string | null;
export type CreatedAt6 = string;
export type DisplayName2 = string;
export type Email5 = string;
export type Id11 = string;
export type DisplayName3 = string;

export interface Api {
  AccountType?: AccountType;
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
  CourseCreate?: CourseCreate;
  CourseOut?: CourseOut;
  CourseStatus?: CourseStatus;
  CourseUpdate?: CourseUpdate;
  DocumentJobResponse?: DocumentJobResponse;
  DocumentOut?: DocumentOut;
  DocumentStatus?: DocumentStatus;
  EnrollRequest?: EnrollRequest;
  EnrollResult?: EnrollResult;
  EnrollmentOut?: EnrollmentOut;
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
  PageList?: PageList;
  PageOut?: PageOut;
  PublishStatus?: PublishStatus;
  RegisterRequest?: RegisterRequest;
  SchoolCreate?: SchoolCreate;
  SchoolMemberAdd?: SchoolMemberAdd;
  SchoolMemberOut?: SchoolMemberOut;
  SchoolOut?: SchoolOut;
  SchoolRole?: SchoolRole;
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
 * via the `definition` "ChapterCreate".
 */
export interface ChapterCreate {
  description?: Description;
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
 * via the `definition` "ChapterDetail".
 */
export interface ChapterDetail {
  course_id: CourseId;
  description: Description1;
  id: Id;
  objectives?: Objectives;
  position: Position1;
  source_refs: SourceRefs2;
  status: PublishStatus;
  title: Title1;
  updated_at: UpdatedAt;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ObjectiveOut".
 */
export interface ObjectiveOut {
  id: Id1;
  objective_text: ObjectiveText;
  position: Position;
  source_refs: SourceRefs1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterOut".
 */
export interface ChapterOut {
  course_id: CourseId1;
  description: Description2;
  id: Id2;
  position: Position2;
  source_refs: SourceRefs3;
  status: PublishStatus;
  title: Title2;
  updated_at: UpdatedAt1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ChapterUpdate".
 */
export interface ChapterUpdate {
  description?: Description3;
  position?: Position3;
  source_refs?: SourceRefs4;
  status?: PublishStatus | null;
  title?: Title3;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ClassroomCreate".
 */
export interface ClassroomCreate {
  academic_year?: AcademicYear;
  name: Name;
  school_id: SchoolId;
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
  id: Id3;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ClassroomOut".
 */
export interface ClassroomOut {
  academic_year: AcademicYear1;
  created_at: CreatedAt;
  id: Id4;
  name: Name1;
  school_id: SchoolId1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CourseCreate".
 */
export interface CourseCreate {
  description?: Description4;
  grade_level?: GradeLevel;
  school_id?: SchoolId2;
  subject?: Subject;
  title: Title4;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CourseOut".
 */
export interface CourseOut {
  can_manage?: CanManage;
  created_at: CreatedAt1;
  description: Description5;
  grade_level: GradeLevel1;
  id: Id5;
  school_id: SchoolId3;
  status: CourseStatus;
  subject: Subject1;
  title: Title5;
  updated_at: UpdatedAt2;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "CourseUpdate".
 */
export interface CourseUpdate {
  description?: Description6;
  grade_level?: GradeLevel2;
  status?: CourseStatus | null;
  subject?: Subject2;
  title?: Title6;
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
  created_at: CreatedAt2;
  error_message: ErrorMessage;
  id: Id6;
  mime_type: MimeType;
  original_filename: OriginalFilename;
  page_count: PageCount;
  pages_needing_ocr: PagesNeedingOcr;
  processing_status: DocumentStatus;
  size_bytes: SizeBytes;
  title: Title7;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "JobOut".
 */
export interface JobOut {
  attempt_count: AttemptCount;
  created_at: CreatedAt3;
  error_code: ErrorCode;
  error_message: ErrorMessage1;
  finished_at: FinishedAt;
  id: Id7;
  job_type: JobType;
  result: Result;
  status: Status;
  target_id: TargetId;
  target_type: TargetType;
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
  status: Status1;
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
  source_refs?: SourceRefs5;
  title: Title8;
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
  title: Title9;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonOut".
 */
export interface LessonOut {
  chapter_id: ChapterId;
  content: LessonContent;
  has_unpublished_changes: HasUnpublishedChanges;
  id: Id8;
  origin: Origin;
  position: Position4;
  published_version: PublishedVersion;
  status: Status2;
  title: Title10;
  updated_at: UpdatedAt3;
  version: Version;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonSummary".
 */
export interface LessonSummary {
  has_unpublished_changes: HasUnpublishedChanges1;
  id: Id9;
  origin: Origin1;
  position: Position5;
  published_version: PublishedVersion1;
  status: Status3;
  title: Title11;
  version: Version1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonUpdate".
 */
export interface LessonUpdate {
  content?: LessonContent | null;
  expected_version: ExpectedVersion;
  title?: Title12;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "LessonVersionOut".
 */
export interface LessonVersionOut {
  change_source: ChangeSource;
  created_at: CreatedAt4;
  title: Title13;
  version_number: VersionNumber;
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
  source_refs?: SourceRefs6;
  text: Text;
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
 * via the `definition` "SchoolCreate".
 */
export interface SchoolCreate {
  name: Name2;
  slug: Slug;
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
  created_at: CreatedAt5;
  id: Id10;
  my_role?: SchoolRole | null;
  name: Name3;
  slug: Slug1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "TextDocumentRequest".
 */
export interface TextDocumentRequest {
  course_id: CourseId3;
  text: Text1;
  title: Title14;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "UploadInstructions".
 */
export interface UploadInstructions {
  headers: Headers;
  method: Method;
  url: Url;
}
export interface Headers {
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
  size_bytes: SizeBytes1;
  title?: Title15;
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
  created_at: CreatedAt6;
  display_name: DisplayName2;
  email: Email5;
  id: Id11;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "UserUpdate".
 */
export interface UserUpdate {
  display_name: DisplayName3;
}
