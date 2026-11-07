/* AUTO-GENERATED from backend OpenAPI — do not edit. Run `npm run api:types`. */

/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "AccountType".
 */
export type AccountType = "teacher" | "student";
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
export type Id = string;
export type AcademicYear1 = string | null;
export type CreatedAt = string;
export type Id1 = string;
export type Name1 = string;
export type SchoolId1 = string;
export type Location = (string | number)[];
export type Message = string;
export type ErrorType = string;
export type Detail = ValidationError[];
export type Environment = string;
export type Status = string;
export type Email2 = string;
export type Password = string;
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
export type CreatedAt1 = string;
export type Id2 = string;
export type Name3 = string;
export type Slug1 = string;
export type CreatedAt2 = string;
export type DisplayName2 = string;
export type Email5 = string;
export type Id3 = string;
export type DisplayName3 = string;

export interface Api {
  AccountType?: AccountType;
  ClassroomCreate?: ClassroomCreate;
  ClassroomMemberAdd?: ClassroomMemberAdd;
  ClassroomMemberOut?: ClassroomMemberOut;
  ClassroomOut?: ClassroomOut;
  ClassroomRole?: ClassroomRole;
  HTTPValidationError?: HTTPValidationError;
  HealthResponse?: HealthResponse;
  LoginRequest?: LoginRequest;
  RegisterRequest?: RegisterRequest;
  SchoolCreate?: SchoolCreate;
  SchoolMemberAdd?: SchoolMemberAdd;
  SchoolMemberOut?: SchoolMemberOut;
  SchoolOut?: SchoolOut;
  SchoolRole?: SchoolRole;
  UserOut?: UserOut;
  UserSummary?: UserSummary;
  UserUpdate?: UserUpdate;
  ValidationError?: ValidationError;
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
  id: Id;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "ClassroomOut".
 */
export interface ClassroomOut {
  academic_year: AcademicYear1;
  created_at: CreatedAt;
  id: Id1;
  name: Name1;
  school_id: SchoolId1;
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
  status: Status;
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
  created_at: CreatedAt1;
  id: Id2;
  my_role?: SchoolRole | null;
  name: Name3;
  slug: Slug1;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "UserOut".
 */
export interface UserOut {
  account_type: AccountType;
  created_at: CreatedAt2;
  display_name: DisplayName2;
  email: Email5;
  id: Id3;
}
/**
 * This interface was referenced by `Api`'s JSON-Schema
 * via the `definition` "UserUpdate".
 */
export interface UserUpdate {
  display_name: DisplayName3;
}
