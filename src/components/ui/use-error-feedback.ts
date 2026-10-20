"use client";

import { useCallback, useState, type SetStateAction } from "react";

export function useErrorFeedback(initialMessage = "") {
  const [feedback, setFeedback] = useState({
    message: initialMessage,
    attempt: 0,
  });
  const setError = useCallback((value: SetStateAction<string>) => {
    setFeedback((previous) => ({
      message: typeof value === "function" ? value(previous.message) : value,
      attempt: previous.attempt + 1,
    }));
  }, []);
  return [feedback.message, setError, feedback.attempt] as const;
}
