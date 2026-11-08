"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { DailyGameView } from "@/components/game";
import { dailyTodayKey } from "@/hooks/useDailyToday";
import { useGameMachine } from "@/hooks/useGameMachine";

export default function DailyPlayPage() {
  const machine = useGameMachine({ mode: "daily" });
  const queryClient = useQueryClient();
  const result = machine.state.result;

  useEffect(() => {
    // A finished Daily changes today's best and the streak shown on /home.
    if (result !== null) {
      void queryClient.invalidateQueries({ queryKey: dailyTodayKey });
    }
  }, [result, queryClient]);

  return <DailyGameView {...machine} />;
}
