"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { ZodType } from "zod";

import { Button, Card, ErrorMessage, Input } from "@/components/ui";
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
    <Card className="p-6 sm:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="size-8 rounded-lg bg-linear-to-br from-primary via-fuchsia-500 to-amber-400 shadow-sm"
          />
          <span className="text-xs font-semibold tracking-[0.24em] text-muted-foreground uppercase">
            ChromaMatch
          </span>
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
          Create your account
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Three colours, three rounds, one daily streak.
        </p>
      </div>

      <form noValidate onSubmit={handleSubmit} className="space-y-5">
        <Input
          ref={usernameRef}
          id="register-username"
          name="username"
          type="text"
          label="Username"
          autoComplete="username"
          placeholder="colourhunter"
          hint="3–30 characters: letters, numbers, and underscores."
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
          hint="At least 8 characters."
          value={values.password}
          error={errors.password}
          onChange={(event) => updateField("password", event.target.value)}
          onBlur={() => validateField("password")}
          required
        />

        <ErrorMessage message={serverError} title="Registration failed" />

        <Button
          type="submit"
          className="w-full"
          loading={registerMutation.isPending}
          disabled={registerMutation.isPending}
        >
          {registerMutation.isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none"
        >
          Sign in
        </Link>
      </p>
    </Card>
  );
}
