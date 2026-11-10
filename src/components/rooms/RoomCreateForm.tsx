"use client";

import { useId, useState, type FormEvent } from "react";

import { Button, ErrorMessage } from "@/components/ui";
import {
  ROOM_ATTEMPT_OPTIONS,
  ROOM_MAX_SIZE,
  ROOM_MIN_SIZE,
  ROOM_TIMER_OPTIONS,
} from "@/lib/config/constants";
import { createRoomRequestSchema, type CreateRoomRequest } from "@/lib/schemas/rooms";

export interface RoomCreateFormProps {
  onSubmit: (values: CreateRoomRequest) => void;
  pending?: boolean;
  /** Server-side message (e.g. an `ApiError`), shown inline. */
  error?: string | null;
}

interface OptionGroupProps<T extends string | number | null> {
  legend: string;
  name: string;
  value: T;
  options: readonly T[];
  format: (option: T) => string;
  onChange: (option: T) => void;
  disabled?: boolean;
}

/** Radio pills. The selected option gets a check mark and bold text, not just colour. */
function OptionGroup<T extends string | number | null>({
  legend,
  name,
  value,
  options,
  format,
  onChange,
  disabled,
}: OptionGroupProps<T>) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-1.5 font-mono text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={String(option)} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={String(option)}
              checked={option === value}
              onChange={() => onChange(option)}
              className="peer sr-only"
            />
            <span className="inline-flex min-h-11 min-w-12 items-center justify-center gap-1.5 rounded-[0.55rem] border-2 border-border bg-card px-3.5 py-2 font-mono text-[11px] font-bold tracking-[0.02em] transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:font-bold peer-checked:shadow-[0_2px_0_var(--primary-lip)] peer-checked:before:content-['✓'] peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:opacity-55">
              {format(option)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const SIZE_OPTIONS = Array.from(
  { length: ROOM_MAX_SIZE - ROOM_MIN_SIZE + 1 },
  (_, index) => ROOM_MIN_SIZE + index,
);

/**
 * Create-room form. Validates with the same Zod schema the route uses; the
 * parent performs the request (this component never talks to the API).
 */
export function RoomCreateForm({ onSubmit, pending = false, error = null }: RoomCreateFormProps) {
  const sizeId = useId();
  const [roomSize, setRoomSize] = useState<number>(4);
  const [timerSeconds, setTimerSeconds] = useState<CreateRoomRequest["timerSeconds"]>(null);
  const [attemptsLimit, setAttemptsLimit] = useState<CreateRoomRequest["attemptsLimit"]>(3);
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = createRoomRequestSchema.safeParse({ roomSize, timerSeconds, attemptsLimit });
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? "Check the room settings.");
      return;
    }

    setValidationError(null);
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5" aria-label="Create a room">
      <div>
        <label
          htmlFor={sizeId}
          className="mb-1.5 block font-mono text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase"
        >
          Players ({ROOM_MIN_SIZE}–{ROOM_MAX_SIZE})
        </label>
        <select
          id={sizeId}
          value={roomSize}
          disabled={pending}
          onChange={(event) => setRoomSize(Number(event.target.value))}
          className="min-h-11 w-full rounded-[0.6rem] border-2 border-input-border bg-input px-3 py-2.5 text-sm font-medium text-foreground shadow-[inset_0_2px_0_rgb(0_0_0/0.12)] transition-colors hover:border-input-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none sm:w-44"
        >
          {SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} players
            </option>
          ))}
        </select>
      </div>

      <OptionGroup
        legend="Guess timer"
        name="timer"
        value={timerSeconds}
        options={ROOM_TIMER_OPTIONS}
        format={(option) => (option === null ? "No timer" : `${option}s`)}
        onChange={(option) => setTimerSeconds(option as CreateRoomRequest["timerSeconds"])}
        disabled={pending}
      />

      <OptionGroup
        legend="Attempts per player"
        name="attempts"
        value={attemptsLimit}
        options={ROOM_ATTEMPT_OPTIONS}
        format={(option) => `${option} attempts`}
        onChange={(option) => setAttemptsLimit(option)}
        disabled={pending}
      />

      <ErrorMessage message={validationError ?? error} />

      <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
        Create room
      </Button>
    </form>
  );
}
