import type { ReactNode } from "react";

import { TestStrip } from "@/components/ui";

export interface AuthCabinetProps {
  /** 1-based terminal number shown in the marquee. */
  index: number;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

/** The access terminal shared by sign-in and registration. */
export function AuthCabinet({ index, title, subtitle, children, footer }: AuthCabinetProps) {
  return (
    <div className="cm-cabinet cm-pop overflow-hidden p-0">
      <div className="cm-marquee flex items-center justify-between gap-3 px-5 pt-4 pb-2.5">
        <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/65 uppercase">
          Player access
        </p>
        <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-white/40 uppercase">
          0{index} / 02
        </p>
      </div>

      <div className="p-5 sm:p-6">
        <div className="mb-5 max-w-[15rem] -rotate-1">
          <TestStrip size="sm" mystery />
        </div>

        <h1 className="cm-stencil text-3xl leading-none sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

        <div className="mt-5">{children}</div>
      </div>

      <div className="border-t-2 border-dashed border-border/45 px-5 py-4 text-center">
        {footer}
      </div>
    </div>
  );
}
