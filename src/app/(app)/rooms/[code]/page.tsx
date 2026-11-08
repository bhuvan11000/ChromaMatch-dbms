"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { RoomAttempt, RoomPanel } from "@/components/rooms";
import { Button, ErrorMessage, Modal, Spinner } from "@/components/ui";
import { ApiError, apiClient } from "@/lib/api-client";
import { roomPollInterval } from "@/lib/roomPolling";
import {
  leaveRoomResponseSchema,
  roomStateResponseSchema,
  type LeaveRoomResponse,
  type RoomState,
} from "@/lib/schemas/rooms";

function messageOf(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Please try again.";
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = String(params.code ?? "").trim().toUpperCase();
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryKey = ["room", code] as const;

  const [playing, setPlaying] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const room = useQuery<RoomState>({
    queryKey,
    queryFn: ({ signal }) =>
      apiClient.get<RoomState>(`/rooms/${code}`, { schema: roomStateResponseSchema, signal }),
    refetchInterval: (query) => roomPollInterval(query.state.data?.status),
    retry: (failureCount, error) => {
      // 401/403/404 will not fix themselves; transient errors retry briefly.
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return false;
      return failureCount < 2;
    },
  });

  const start = useMutation({
    mutationFn: () =>
      apiClient.post<RoomState>(`/rooms/${code}/start`, undefined, {
        schema: roomStateResponseSchema,
      }),
    onSuccess: (state) => {
      queryClient.setQueryData(queryKey, state);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const leave = useMutation({
    mutationFn: () =>
      apiClient.post<LeaveRoomResponse>(`/rooms/${code}/leave`, undefined, {
        schema: leaveRoomResponseSchema,
      }),
    onSuccess: (result) => {
      setConfirmLeave(false);

      if (result.room === null) {
        // A non-creator left the lobby: their membership row is gone.
        queryClient.removeQueries({ queryKey });
        router.replace("/rooms");
        return;
      }

      queryClient.setQueryData(queryKey, result.room);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/rooms/${code}`);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable (insecure context); the code is on screen.
      setCopied(false);
      return;
    }

    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2500);
  }

  function exitAttempt() {
    setPlaying(false);
    void queryClient.invalidateQueries({ queryKey });
  }

  if (playing) {
    return <RoomAttempt roomCode={code} onExit={exitAttempt} />;
  }

  if (room.isPending) {
    return (
      <main className="mx-auto grid min-h-[50dvh] w-full max-w-3xl place-items-center px-4">
        <Spinner label="Loading room" />
      </main>
    );
  }

  if (room.isError || !room.data) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <ErrorMessage
          title="Could not load this room"
          message={messageOf(room.error) ?? "Something went wrong."}
          onRetry={() => void room.refetch()}
        />
        <Link
          href="/rooms"
          className="mt-4 inline-block font-semibold text-primary underline-offset-4 hover:underline"
        >
          Back to rooms
        </Link>
      </main>
    );
  }

  const state = room.data;
  const isLobby = state.status === "lobby";
  const leaveWarning = isLobby
    ? state.me.isCreator
      ? "This cancels the room for everyone."
      : "You will be removed from the lobby."
    : "You forfeit remaining attempts, keep your best score, and cannot rejoin.";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/rooms"
        className="mb-4 inline-flex min-h-9 items-center font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        ← Rooms
      </Link>

      <RoomPanel
        state={state}
        onStart={() => start.mutate()}
        onLeave={() => setConfirmLeave(true)}
        onPlay={() => setPlaying(true)}
        onCopyLink={() => void copyInviteLink()}
        copied={copied}
        starting={start.isPending}
        actionError={messageOf(start.error) ?? messageOf(leave.error)}
      />

      <Modal
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Leave this room?"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmLeave(false)}>
              Stay
            </Button>
            <Button variant="danger" loading={leave.isPending} onClick={() => leave.mutate()}>
              Leave room
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{leaveWarning}</p>
      </Modal>
    </main>
  );
}
