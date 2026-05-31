import * as React from "react";
import type { TextInputProps } from "react-native";

import { TextField } from "./TextField";

type DraftTextFieldProps = Omit<TextInputProps, "onChangeText" | "value"> & {
  height?: number;
  isValidDraft: (value: string) => boolean;
  onValidDraftChange: (value: string) => void;
  value: string;
};

export function DraftTextField({
  isValidDraft,
  onBlur,
  onFocus,
  onValidDraftChange,
  value,
  ...props
}: DraftTextFieldProps) {
  const [isFocused, setIsFocused] = React.useState(false);
  const [draftValue, setDraftValue] = React.useState(value);
  const draftValueRef = React.useRef(value);

  const syncDraftValue = React.useCallback((nextValue: string) => {
    draftValueRef.current = nextValue;
    setDraftValue(nextValue);
  }, []);

  React.useEffect(() => {
    if (!isFocused) {
      syncDraftValue(value);
    }
  }, [isFocused, syncDraftValue, value]);

  const handleFocus: TextInputProps["onFocus"] = (event) => {
    syncDraftValue(value);
    setIsFocused(true);
    onFocus?.(event);
  };

  const handleChangeText = (nextValue: string) => {
    setIsFocused(true);
    syncDraftValue(nextValue);

    if (isValidDraft(nextValue)) {
      onValidDraftChange(nextValue);
    }
  };

  const handleBlur: TextInputProps["onBlur"] = (event) => {
    const latestDraftValue = draftValueRef.current;

    if (isValidDraft(latestDraftValue)) {
      onValidDraftChange(latestDraftValue);
    } else {
      syncDraftValue(value);
    }

    setIsFocused(false);
    onBlur?.(event);
  };

  return (
    <TextField
      {...props}
      value={isFocused ? draftValue : value}
      onBlur={handleBlur}
      onChangeText={handleChangeText}
      onFocus={handleFocus}
    />
  );
}
