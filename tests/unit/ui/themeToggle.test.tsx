import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ThemeToggle } from "@/components/ui";

describe("ThemeToggle", () => {
  it("renders a stable, accessible control before the client resolves the theme", () => {
    const html = renderToStaticMarkup(<ThemeToggle />);

    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain('data-testid="theme-toggle"');
    expect(html).toContain('aria-label="Switch colour theme"');
    expect(html).toContain('title="Switch colour theme"');
  });
});
