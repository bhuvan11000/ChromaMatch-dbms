import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthCabinet } from "@/components/auth/AuthCabinet";

describe("AuthCabinet", () => {
  it("renders the terminal chrome, heading and form slot", () => {
    const html = renderToStaticMarkup(
      <AuthCabinet
        index={1}
        title="Welcome back."
        subtitle="Sign in to keep your scores and streak."
        footer={<a href="/register">Make an account</a>}
      >
        <form aria-label="Sign in">
          <input aria-label="Email" />
        </form>
      </AuthCabinet>,
    );

    expect(html).toContain("cm-cabinet");
    expect(html).toContain("Player access");
    expect(html).toContain("01 / 02");
    expect(html).toContain("cm-test-strip");
    expect(html).toContain("Welcome back.");
    expect(html).toContain("Sign in to keep your scores and streak.");
    expect(html).toContain('aria-label="Sign in"');
    expect(html).toContain('aria-label="Email"');
    expect(html).toContain('href="/register"');
    expect(html).toContain("Make an account");
  });
});
