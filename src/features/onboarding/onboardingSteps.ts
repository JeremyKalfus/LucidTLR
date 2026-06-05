import type { OnboardingStep } from "../../domain/forms";

export const ONBOARDING_FORM_ID = "lucidtlr-onboarding-v1";
export const STUDY_PARTICIPATION_QUESTION_ID = "study_participation";
export const STUDY_OPT_IN_VALUE = "opt_in";
export const STUDY_OPT_OUT_VALUE = "opt_out";

export const onboardingSteps: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome",
    purpose: "Set expectations without therapeutic claims.",
    questions: [
      {
        id: "welcome_copy",
        type: "info",
        prompt:
          "LucidTLR is a dream-training app built around targeted lucidity reactivation, or TLR. Before sleep, you practice a cue while rehearsing the idea of noticing that you are dreaming.",
      },
      {
        id: "welcome_tlr_copy",
        type: "info",
        prompt:
          "Later in the night, LucidTLR may play that learned cue again. The goal is to gently reactivate the lucid-dreaming mindset during sleep.",
      },
      {
        id: "welcome_modes_copy",
        type: "info",
        prompt:
          "Phone Mode uses your phone beside the bed. Watch Mode remains visible as a planned Apple Watch option, but it is disabled in this build.",
      },
      {
        id: "welcome_setup_copy",
        type: "info",
        prompt:
          "This setup asks about sleep timing, dream recall, sound sensitivity, goals, and whether you want to use LucidTLR privately or anonymously share structured app data for research.",
      },
      {
        id: "welcome_expectations_copy",
        type: "info",
        prompt:
          "Results are not guaranteed. The main risk is possible sleep disruption. LucidTLR is not a medical treatment.",
      },
    ],
  },
  {
    id: "mode_selection",
    title: "Mode selection",
    purpose: "Choose the sensing and cueing mode.",
    questions: [
      {
        id: "mode",
        type: "single_choice",
        prompt:
          "Choose your mode. Phone Mode is available now. Watch Mode is planned and remains visible, but cannot start nights in this build. Results are not guaranteed.",
        required: true,
        options: [
          {
            value: "phone",
            label: "Phone only",
            note: "iPhone/Android, phone beside pillow.",
          },
          {
            value: "watch",
            label: "Phone + Apple Watch",
            note: "Planned; disabled in this build.",
          },
        ],
      },
    ],
  },
  {
    id: "consent_privacy",
    title: "Study participation",
    purpose: "Keep study participation optional and explicit.",
    questions: [
      {
        id: STUDY_PARTICIPATION_QUESTION_ID,
        type: "single_choice",
        prompt:
          "LucidTLR can be used privately. You can also choose to anonymously share structured app data with CNL at Northwestern University to support lucid dreaming research.",
        required: true,
        options: [
          {
            value: STUDY_OPT_IN_VALUE,
            label: "Opt in to the study",
            note: "Anonymously share my data with CNL at Northwestern University",
          },
          {
            value: STUDY_OPT_OUT_VALUE,
            label: "Opt out of the study",
            note: "Keep all of my data local",
          },
        ],
      },
      {
        id: "privacy_copy",
        type: "info",
        prompt: "You can change this later in Settings.",
      },
    ],
  },
  {
    id: "baseline_sleep",
    title: "Baseline sleep profile",
    purpose: "Record sleep timing and late-night REM feasibility context.",
    questions: [
      {
        id: "typical_bedtime",
        type: "time",
        prompt: "What is your typical bedtime?",
      },
      {
        id: "typical_wake_time",
        type: "time",
        prompt: "What is your typical wake time?",
      },
      {
        id: "typical_sleep_duration_hours",
        type: "single_choice",
        prompt: "How long do you usually sleep?",
        options: [
          { value: "lt_6", label: "<6 hours" },
          { value: "6_7", label: "6-7 hours" },
          { value: "7_8", label: "7-8 hours" },
          { value: "8_plus", label: "8+ hours" },
        ],
      },
      {
        id: "can_fall_back_asleep_after_waking",
        type: "single_choice",
        prompt: "If you wake during the night, can you fall back asleep?",
        options: [
          { value: "usually_yes", label: "Usually yes" },
          { value: "sometimes", label: "Sometimes" },
          { value: "rarely", label: "Rarely" },
        ],
      },
      {
        id: "sleep_schedule_regularity",
        type: "single_choice",
        prompt: "How regular is your sleep schedule?",
        options: [
          { value: "regular", label: "Regular" },
          { value: "somewhat_regular", label: "Somewhat regular" },
          { value: "irregular", label: "Irregular" },
        ],
      },
      {
        id: "sleep_guidance_copy",
        type: "info",
        prompt:
          "TLR may work better if you sleep long enough to reach late-night REM. If sounds wake you and you cannot return to sleep, use caution.",
      },
    ],
  },
  {
    id: "dream_profile",
    title: "Dream/lucidity profile",
    purpose: "Record dream recall and prior lucid-dream experience.",
    questions: [
      {
        id: "dream_recall_frequency",
        type: "single_choice",
        prompt: "How often do you remember dreams?",
        options: [
          { value: "rarely", label: "Rarely" },
          { value: "less_than_1_per_week", label: "Less than 1/week" },
          { value: "1_2_per_week", label: "1-2/week" },
          { value: "3_4_per_week", label: "3-4/week" },
          { value: "most_mornings", label: "Most mornings" },
        ],
      },
      {
        id: "prior_lucid_dream_frequency",
        type: "single_choice",
        prompt: "How often have you had lucid dreams?",
        options: [
          { value: "never", label: "Never" },
          { value: "once_ever", label: "Once ever" },
          { value: "a_few_times_ever", label: "A few times ever" },
          { value: "yearly", label: "Yearly" },
          { value: "monthly", label: "Monthly" },
          { value: "weekly_or_more", label: "Weekly or more" },
        ],
      },
      {
        id: "prior_lucid_dream_count",
        type: "number",
        prompt: "About how many lucid dreams have you had?",
      },
      {
        id: "nightmare_or_bad_dream_frequency_optional",
        type: "single_choice",
        prompt: "Optional: how often do you have nightmares or bad dreams?",
        options: [
          { value: "prefer_not_to_answer", label: "Prefer not to answer" },
          { value: "rarely", label: "Rarely" },
          { value: "sometimes", label: "Sometimes" },
          { value: "often", label: "Often" },
        ],
      },
      {
        id: "dream_journal_habit",
        type: "single_choice",
        prompt: "Do you keep a dream journal?",
        options: [
          { value: "never", label: "Never" },
          { value: "sometimes", label: "Sometimes" },
          { value: "regularly", label: "Regularly" },
        ],
      },
    ],
  },
  {
    id: "sound_sensitivity",
    title: "Sound sensitivity + sleep environment",
    purpose: "Choose hidden sensitivity defaults without making protocol decisions in UI.",
    questions: [
      {
        id: "sound_sensitivity",
        type: "single_choice",
        prompt: "How sensitive are you to sound while sleeping?",
        options: [
          { value: "very_sensitive_light_sleeper", label: "Very sensitive / light sleeper" },
          { value: "average", label: "Average" },
          { value: "hard_to_wake", label: "Hard to wake" },
        ],
      },
      {
        id: "hearing_difficulty",
        type: "single_choice",
        prompt: "Do you have hearing difficulty?",
        options: [
          { value: "no", label: "No" },
          { value: "mild", label: "Mild" },
          { value: "significant", label: "Significant" },
        ],
      },
      {
        id: "sleep_partner_present",
        type: "single_choice",
        prompt: "Do you usually sleep near a partner?",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ],
      },
      {
        id: "phone_placement_comfort",
        type: "single_choice",
        prompt: "Are you comfortable placing your phone beside your pillow?",
        options: [
          { value: "yes", label: "Yes" },
          { value: "not_sure", label: "Not sure" },
          { value: "no", label: "No" },
        ],
      },
      {
        id: "uses_sleep_audio",
        type: "single_choice",
        prompt: "Do you usually use sleep audio?",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ],
      },
    ],
  },
  {
    id: "goals",
    title: "Goals",
    purpose: "Record goals without promising outcomes.",
    questions: [
      {
        id: "goals",
        type: "multi_choice",
        prompt: "What are your goals?",
        options: [
          { value: "lucid_dreaming", label: "Lucid dreaming" },
          { value: "dream_recall", label: "Dream recall" },
          { value: "curiosity", label: "Curiosity" },
          { value: "creativity", label: "Creativity" },
          { value: "self_exploration", label: "Self-exploration" },
          { value: "research_contribution", label: "Research contribution" },
          { value: "nightmare_related_interest", label: "Nightmare-related interest" },
          { value: "other", label: "Other" },
        ],
      },
      {
        id: "nightmare_claims_copy",
        type: "info",
        prompt: "This app is not a nightmare treatment or medical device.",
      },
    ],
  },
  {
    id: "permissions",
    title: "Permissions",
    purpose: "Request only permissions needed for the selected mode.",
    questions: [
      {
        id: "phone_permissions",
        type: "permission_summary",
        mode: "phone",
        prompt: "Phone Mode needs audio, motion, and notifications if needed.",
      },
      {
        id: "watch_permissions",
        type: "permission_summary",
        mode: "watch",
        prompt:
          "Watch Mode is planned and disabled in this build; no Watch runtime permissions are requested for it now.",
      },
      {
        id: "excluded_permissions_copy",
        type: "info",
        prompt:
          "LucidTLR does not request location, contacts, texts, or advertising ID.",
      },
    ],
  },
];
