import { NextResponse } from "next/server";

// Placeholder: session gating is implemented in the auth step (Architecture §5.5).
export function middleware() {
  return NextResponse.next();
}
