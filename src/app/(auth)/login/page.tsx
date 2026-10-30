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
    <Card elevated className="relative overflow-hidden p-5 sm:p-7">
      <TestStrip size="sm" mystery />

      <div className="mt-6">
        <Wordmark size="md" />
        <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome back, <span className="text-primary">colourist</span>.
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Your palette missed you.</p>
      </div>

      <form noValidate onSubmit={handleSubmit} className="mt-6 space-y-5">
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
          size="lg"
          className="w-full"
          loading={loginMutation.isPending}
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? (
            "Signing in…"
          ) : (
            <>
              Sign in
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

      <p className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link
          href="/register"
          className="rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none"
        >
          Make an account
        </Link>
      </p>
    </Card>
  );
}
