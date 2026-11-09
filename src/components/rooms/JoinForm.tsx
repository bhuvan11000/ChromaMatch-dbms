"use client";

import { useState, type FormEvent } from "react";

import { Button, ErrorMessage, Input } from "@/components/ui";
import { ROOM_CODE_LENGTH } from "@/lib/config/constants";
import { joinRoomRequestSchema } from "@/lib/schemas/rooms";

export interface JoinFormProps {
  onSubmit: (code: string) => void;
  pending?: boolean;
  error?: string | null;
}

/** Join-by-code form: trims and upper-cases, then validates with the route's schema. */
export function JoinForm({ onSubmit, pending = false, error = null }: JoinFormProps) {
  const [code, setCode] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = joinRoomRequestSchema.safeParse({ code });
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? "Enter a valid room code.");
      return;
    }

    setValidationError(null);
    onSubmit(parsed.data.code);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-label="Join a room">
      <Input
        label="Room code"
        name="code"
        value={code}
        onChange={(event) => setCode(event.target.value.toUpperCase())}
        maxLength={ROOM_CODE_LENGTH + 2}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="ABCD2345"
        hint="8 characters. Ask the host for it."
        error={validationError ?? undefined}
        disabled={pending}
        className="font-mono tracking-[0.2em] uppercase"
      />

      <ErrorMessage message={error} />

      <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
        Join room
      </Button>
    </form>
  );
}
