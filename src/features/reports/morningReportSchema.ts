export type MorningReportFieldType = "boolean" | "nullable_boolean" | "rating";

export interface MorningReportField {
  id: string;
  label: string;
  type: MorningReportFieldType;
  required: boolean;
}

export const MORNING_LUCIDITY_DETAIL_FORM_ID =
  "morning-lucidity-detail-v1";

export const MORNING_REPORT_OPTIONAL_LUCIDITY_STORAGE = {
  table: "questionnaire_responses",
  formId: MORNING_LUCIDITY_DETAIL_FORM_ID,
  sessionLinked: true,
} as const;

export const MORNING_REPORT_CORE_FIELDS: MorningReportField[] = [
  {
    id: "remembered_dream",
    label: "Remembered a dream",
    type: "boolean",
    required: true,
  },
  {
    id: "lucid_dream",
    label: "Had a lucid dream",
    type: "nullable_boolean",
    required: false,
  },
  {
    id: "heard_cue",
    label: "Heard the cue",
    type: "nullable_boolean",
    required: false,
  },
  {
    id: "cue_incorporated",
    label: "Cue appeared in the dream",
    type: "nullable_boolean",
    required: false,
  },
  {
    id: "cue_woke_user",
    label: "Cue woke me",
    type: "nullable_boolean",
    required: false,
  },
  {
    id: "returned_to_sleep",
    label: "Returned to sleep after waking",
    type: "nullable_boolean",
    required: false,
  },
  {
    id: "sleep_quality_rating",
    label: "Sleep quality",
    type: "rating",
    required: false,
  },
];

export const MORNING_REPORT_OPTIONAL_LUCIDITY_FIELDS: MorningReportField[] = [
  {
    id: "aware_was_dreaming",
    label: "Aware I was dreaming",
    type: "nullable_boolean",
    required: false,
  },
  {
    id: "recognized_unreality",
    label: "Recognized something unreal",
    type: "nullable_boolean",
    required: false,
  },
  {
    id: "could_make_choices",
    label: "Could make choices",
    type: "nullable_boolean",
    required: false,
  },
  {
    id: "could_control_actions",
    label: "Could control actions",
    type: "nullable_boolean",
    required: false,
  },
  {
    id: "remembered_waking_intention",
    label: "Remembered waking intention",
    type: "nullable_boolean",
    required: false,
  },
];
