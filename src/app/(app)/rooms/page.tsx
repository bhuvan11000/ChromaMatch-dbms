"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { JoinForm, RoomCreateForm } from "@/components/rooms";
import { Card } from "@/components/ui";
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
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/home"
        className="inline-flex min-h-9 items-center font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        ← Home
      </Link>

      <header className="mt-3">
        <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
          Custom rooms
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          A private code and bragging rights.
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Everyone in the room gets the same three colours. Best score wins.
        </p>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card className="min-w-0 p-5 sm:p-6">
          <h2 className="text-lg font-bold tracking-tight">Create a room</h2>
          <div className="mt-4">
            <RoomCreateForm
              onSubmit={(values) => create.mutate(values)}
              pending={create.isPending}
              error={messageOf(create.error)}
            />
          </div>
        </Card>

        <Card className="min-w-0 p-5 sm:p-6">
          <h2 className="text-lg font-bold tracking-tight">Join with a code</h2>
          <div className="mt-4">
            <JoinForm
              onSubmit={(code) => join.mutate({ code })}
              pending={join.isPending}
              error={messageOf(join.error)}
            />
          </div>
        </Card>
      </div>
    </main>
  );
}
