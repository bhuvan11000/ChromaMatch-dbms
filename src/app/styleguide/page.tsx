import { notFound } from "next/navigation";

import { StyleguideShowcase } from "./StyleguideShowcase";

export const metadata = {
  title: "Styleguide · ChromaMatch",
};

export default function StyleguidePage() {
  // Dev-only workshop. The production build resolves NODE_ENV statically, so
  // this route becomes a 404 and the showcase never ships.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <StyleguideShowcase />;
}
