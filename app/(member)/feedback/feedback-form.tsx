"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/inputs";
import { ErrorText } from "@/components/ui/text";

export function FeedbackForm() {
  const [type, setType] = useState<"bug" | "feedback">("bug");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, body }),
      });
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(resBody.error ?? "Failed to submit.");
        return;
      }
      setBody("");
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="Type" htmlFor="feedback-type">
        <Select
          id="feedback-type"
          value={type}
          onChange={(e) => {
            setType(e.target.value as "bug" | "feedback");
            setSubmitted(false);
          }}
        >
          <option value="bug">Something&apos;s broken</option>
          <option value="feedback">General feedback</option>
        </Select>
      </Field>

      <Field label="Details" htmlFor="feedback-body" helper="What happened, and what did you expect instead?">
        <Textarea
          id="feedback-body"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setSubmitted(false);
          }}
          rows={6}
          maxLength={5000}
          required
          placeholder={type === "bug" ? "I tapped RSVP and got an error..." : "It would help if..."}
        />
      </Field>

      {error && <ErrorText>{error}</ErrorText>}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={loading} disabled={!body.trim()}>
          Submit
        </Button>
        {submitted && <span className="text-sm text-success">Thanks — sent to the team.</span>}
      </div>
    </form>
  );
}
