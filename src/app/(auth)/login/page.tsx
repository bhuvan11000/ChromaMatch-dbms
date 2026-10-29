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
  loginSchema,
  type AuthUserResponse,
  type LoginInput,
} from "@/lib/schemas/auth";

type LoginField = "email" | "password";
type LoginErrors = Partial<Record<LoginField, string>>;

interface AuthResponse {
  user: AuthUserResponse;
}

function fieldError(schema: ZodType, value: string): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState<Record<LoginField, string>>({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<LoginErrors>({});

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) =>
      apiClient.post<AuthResponse>("/auth/login", input, {
        schema: authResponseSchema,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      router.replace("/home");
      router.refresh();
    },
  });

  function updateField(field: LoginField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  function validateField(field: LoginField) {
    const schema = field === "email" ? loginSchema.shape.email : loginSchema.shape.password;
    setErrors((current) => ({ ...current, [field]: fieldError(schema, values[field]) }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loginMutation.reset();

    const result = loginSchema.safeParse(values);
    if (!result.success) {
      const nextErrors: LoginErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if ((field === "email" || field === "password") && !nextErrors[field]) {
          nextErrors[field] = issue.message;
        }
      }
      setErrors(nextErrors);

      if (nextErrors.email) emailRef.current?.focus();
      else if (nextErrors.password) passwordRef.current?.focus();
      return;
    }

    setErrors({});
    loginMutation.mutate(result.data);
  }

  const serverError =
    loginMutation.error instanceof ApiError
      ? loginMutation.error.message
      : loginMutation.error
        ? "We could not sign you in. Please try again."
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
        <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome back</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to keep your colour streak going.
        </p>
      </div>

      <form noValidate onSubmit={handleSubmit} className="space-y-5">
        <Input
          ref={emailRef}
          id="login-email"
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
          id="login-password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          value={values.password}
          error={errors.password}
          onChange={(event) => updateField("password", event.target.value)}
          onBlur={() => validateField("password")}
          required
        />

        <ErrorMessage message={serverError} title="Sign in failed" />

        <Button
          type="submit"
          className="w-full"
          loading={loginMutation.isPending}
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to ChromaMatch?{" "}
        <Link
          href="/register"
          className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none"
        >
          Create an account
        </Link>
      </p>
    </Card>
  );
}
