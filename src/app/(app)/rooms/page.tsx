"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { JoinForm, RoomCreateForm } from "@/components/rooms";
import { ModeGlyph } from "@/components/ui";
import { ApiError, apiClient } from "@/lib/api-client";
import {
  roomStateResponseSchema,
  type CreateRoomRequest,
  type JoinRoomRequest,
  type RoomState,
} from "@/lib/schemas/rooms";

function messageOf(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Please try again.";
}

export default function RoomsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  function openRoom(state: RoomState) {
    queryClient.setQueryData(["room", state.code], state);
    void queryClient.invalidateQueries({ queryKey: ["room", state.code] });
    router.push(`/rooms/${state.code}`);
  }

  const create = useMutation({
    mutationFn: (values: CreateRoomRequest) =>
      apiClient.post<RoomState>("/rooms", values, { schema: roomStateResponseSchema }),
    onSuccess: openRoom,
  });

  const join = useMutation({
    mutationFn: (values: JoinRoomRequest) =>
      apiClient.post<RoomState>("/rooms/join", values, { schema: roomStateResponseSchema }),
    onSuccess: openRoom,
  });

  return (
    <div className="mx-auto w-full max-w-4xl">
      <section className="cm-cabinet cm-rise overflow-hidden p-0">
        <div className="cm-marquee flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2.5 sm:px-7">
          <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/60 uppercase">
            Custom rooms // Link-up
          </p>
          <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-white/45 uppercase">
            2–10 players
          </p>
        </div>

        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-7">
          <ModeGlyph kind="room" size="lg" />
          <div>
            <h1 className="cm-stencil text-4xl leading-none sm:text-5xl">Rooms</h1>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              Everyone gets the same three colours. Best score wins.
            </p>
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="cm-console-card flex flex-col rounded-[1rem] bg-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-extrabold tracking-tight">Create a room</h2>
            <span className="font-mono text-[8px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
              Host
            </span>
          </div>
          <div className="mt-5">
            <RoomCreateForm
              onSubmit={(values) => create.mutate(values)}
              pending={create.isPending}
              error={messageOf(create.error)}
            />
          </div>
        </section>

        <section className="cm-console-card flex flex-col rounded-[1rem] bg-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-extrabold tracking-tight">Join with a code</h2>
            <span className="font-mono text-[8px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
              Player
            </span>
          </div>
          <div className="mt-5">
            <JoinForm
              onSubmit={(code) => join.mutate({ code })}
              pending={join.isPending}
              error={messageOf(join.error)}
            />
          </div>
          <p className="mt-auto pt-6 font-mono text-[9px] leading-relaxed tracking-[0.06em] text-muted-foreground">
            Ask the host for the 8-character code.
          </p>
        </section>
      </div>
    </div>
  );
}
