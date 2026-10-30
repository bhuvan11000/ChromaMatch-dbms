"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { ZodType } from "zod";

import { Button, Card, ErrorMessage, Input, TestStrip, Wordmark } from "@/components/ui";
import { SESSION_QUERY_KEY } from "@/hooks/useSession";
import { ApiError, apiClient } from "@/lib/api-client";
import {
  authResponseSchema,
  registerSchema,
  type AuthUserResponse,
  type RegisterInput,
} from "@/lib/schemas/auth";

type RegisterField = "username" | "email" | "password";
type RegisterErrors = Partial<Record<RegisterField, string>>;

interface AuthResponse {
  user: AuthUserResponse;
}

function fieldError(schema: ZodType, value: string): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

export default function RegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const usernameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState<Record<RegisterField, string>>({
    username: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<RegisterErrors>({});

  const registerMutation = useMutation({
    mutationFn: (input: RegisterInput) =>
      apiClient.post<AuthResponse>("/auth/register", input, {
        schema: authResponseSchema,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      router.replace("/home");
      router.refresh();
    },
  });

  function updateField(field: RegisterField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  function validateField(field: RegisterField) {
    const schema =
      field === "username"
        ? registerSchema.shape.username
        : field === "email"
          ? registerSchema.shape.email
          : registerSchema.shape.password;
    setErrors((current) => ({ ...current, [field]: fieldError(schema, values[field]) }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    registerMutation.reset();

    const result = registerSchema.safeParse(values);
    if (!result.success) {
      const nextErrors: RegisterErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (
          (field === "username" || field === "email" || field === "password") &&
          !nextErrors[field]
        ) {
          nextErrors[field] = issue.message;
        }
      }
      setErrors(nextErrors);

      if (nextErrors.username) usernameRef.current?.focus();
      else if (nextErrors.email) emailRef.current?.focus();
      else if (nextErrors.password) passwordRef.current?.focus();
      return;
    }

    setErrors({});
    registerMutation.mutate(result.data);
  }

  const serverError =
    registerMutation.error instanceof ApiError
      ? registerMutation.error.message
      : registerMutation.error
        ? "We could not create your account. Please try again."
        : null;

  return (
    <Card elevated className="relative overflow-hidden p-0">
      <div aria-hidden="true" className="cm-spectrum-bar h-1.5 w-full" />

      <div className="p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
            Studio pass / 02
          </p>
          <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-primary uppercase">
            New colourist
          </p>
        </div>

        <TestStrip size="sm" mystery className="mt-4 -rotate-1" />

        <div className="mt-6">
          <Wordmark size="md" />
          <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
            Fresh <span className="text-primary">eyes</span> wanted.
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Three colours. Five seconds. No take-backs.
          </p>
        </div>

        <form noValidate onSubmit={handleSubmit} className="mt-6 space-y-5">
          <Input
            ref={usernameRef}
            id="register-username"
            name="username"
            type="text"
            label="Username"
            autoComplete="username"
            placeholder="colourhunter"
            hint="Letters, numbers, underscores."
            value={values.username}
            error={errors.username}
            onChange={(event) => updateField("username", event.target.value)}
            onBlur={() => validateField("username")}
            required
          />

          <Input
            ref={emailRef}
            id="register-email"
            name="email"
            type="email"
            label="Email"
            autoComplete="email"
            placeholder="you@example.com"
            value={values.email}
            error={errors.email}
            onChange={(event) => updateField("email", event.target.value)}
            onBlur={() => validateField("email")}
            required
          />

          <Input
            ref={passwordRef}
            id="register-password"
            name="password"
            type="password"
            label="Password"
            autoComplete="new-password"
            hint="8+ characters."
            value={values.password}
            error={errors.password}
            onChange={(event) => updateField("password", event.target.value)}
            onBlur={() => validateField("password")}
            required
          />

          <ErrorMessage message={serverError} title="Registration failed" />

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={registerMutation.isPending}
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? (
              "Creating account…"
            ) : (
              <>
                Count me in
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="none"
                  className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none"
                >
                  <path
                    d="M4 10h11M10.5 5.5 15 10l-4.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </>
            )}
          </Button>
        </form>

        <p className="mt-6 border-t border-dashed border-border pt-4 text-center text-sm text-muted-foreground">
          Already in?{" "}
          <Link
            href="/login"
            className="rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none"
          >
            Sign in
          </Link>
        </p>
      </div>
    </Card>
  );
}
