/* AUTO-GENERATED from packages/three-d-contracts — do not edit. Run `npm run contracts:types`. */

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
    | PlayClipStep
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
    | PlayClipStep
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
export type Action9 = "play_clip";
export type Clip = string;
export type DurationMs9 = number;
export type Explanation9 = string | null;
export type Loop = boolean;
export type Speed = number;
export type Step9 = number;
export type Title = string;

export interface AnimationSpec {
  animation_id: AnimationId;
  schema_version?: SchemaVersion;
  steps: Steps;
  title: Title;
}
export interface HighlightStep {
  action: Action;
  duration_ms: DurationMs;
  explanation?: Explanation;
  step: Step;
  target_component: TargetComponent;
}
export interface SetVisibilityStep {
  action: Action1;
  duration_ms: DurationMs1;
  explanation?: Explanation1;
  step: Step1;
  target_component: TargetComponent1;
  visible: Visible;
}
export interface SetOpacityStep {
  action: Action2;
  duration_ms: DurationMs2;
  explanation?: Explanation2;
  opacity: Opacity;
  step: Step2;
  target_component: TargetComponent2;
}
export interface MoveAlongPathStep {
  action: Action3;
  duration_ms: DurationMs3;
  explanation?: Explanation3;
  path_id: PathId;
  step: Step3;
  target_component: TargetComponent3;
}
export interface RotateComponentStep {
  action: Action4;
  axis: Axis;
  degrees: Degrees;
  duration_ms: DurationMs4;
  explanation?: Explanation4;
  step: Step4;
  target_component: TargetComponent4;
}
export interface FlowParticlesStep {
  action: Action5;
  duration_ms: DurationMs5;
  explanation?: Explanation5;
  path_id: PathId1;
  step: Step5;
  target_component: TargetComponent5;
}
export interface CameraFocusStep {
  action: Action6;
  duration_ms: DurationMs6;
  explanation?: Explanation6;
  step: Step6;
  target_component: TargetComponent6;
}
export interface AnnotationStep {
  action: Action7;
  duration_ms: DurationMs7;
  explanation: Explanation7;
  step: Step7;
  target_component?: TargetComponent7;
}
export interface WaitStep {
  action: Action8;
  duration_ms: DurationMs8;
  explanation?: Explanation8;
  step: Step8;
}
/**
 * Play an animation clip baked into the model (e.g. an engine cycle). The clip keeps
 * running through the following steps until the animation ends or another clip starts, so
 * later steps can explain what is moving. Clip names are checked by the viewer, which skips
 * a clip the model does not have.
 */
export interface PlayClipStep {
  action: Action9;
  clip: Clip;
  duration_ms: DurationMs9;
  explanation?: Explanation9;
  loop?: Loop;
  speed?: Speed;
  step: Step9;
}
