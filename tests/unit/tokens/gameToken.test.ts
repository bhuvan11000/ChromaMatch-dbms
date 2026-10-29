import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GAME_TOKEN_TTL_SECONDS } from "@/lib/config/constants";
import { signGameToken, verifyGameToken, type GameTokenRound } from "@/lib/tokens/gameToken";

import { resetAuthEnv, stubAuthEnv, tamperToken } from "../support/auth";
import {
  FIXED_SHARED_TARGETS,
  FIXED_TARGETS,
  GAME_TEST_ISSUED_AT,
  GAME_TEST_NOW,
  mintGameToken,
  mintRawGameToken,
} from "../support/game";

beforeAll(() => {
  stubAuthEnv();
});

afterAll(() => {
  resetAuthEnv();
});

describe("game token signing and verification", () => {
  it("signs the exact §5.6.1 Global claims and verifies them", async () => {
    const { token, claims } = await signGameToken(
      { userId: 7, mode: "global", rounds: FIXED_TARGETS },
      GAME_TEST_ISSUED_AT,
    );

    const issuedAt = Math.floor(GAME_TEST_ISSUED_AT.getTime() / 1000);

    expect(claims).toMatchObject({
      typ: "game",
      aud: "chromamatch-game",
      sub: "7",
      mode: "global",
      rounds: FIXED_TARGETS,
      iat: issuedAt,
      exp: issuedAt + GAME_TOKEN_TTL_SECONDS,
    });
    expect(claims.jti).toEqual(expect.any(String));
    expect(claims).not.toHaveProperty("cid");
    expect(claims).not.toHaveProperty("rid");

    await expect(verifyGameToken(token, { userId: 7, now: GAME_TEST_NOW })).resolves.toEqual(
      claims,
    );
  });

  it("signs Daily and Room context and records color numbers", async () => {
    const daily = await mintGameToken({ mode: "daily" });
    const dailyClaims = await verifyGameToken(daily.token, {
      userId: 7,
      now: GAME_TEST_NOW,
    });

    expect(dailyClaims).toMatchObject({
      mode: "daily",
      cid: 118,
      cdate: "2026-10-29",
      rounds: FIXED_SHARED_TARGETS,
    });
    expect(dailyClaims.rounds.map((round) => round.n)).toEqual([3, 1, 2]);
    expect(dailyClaims).not.toHaveProperty("rid");

    const room = await mintGameToken({ mode: "room", tmr: 10 });
    const roomClaims = await verifyGameToken(room.token, {
      userId: 7,
      now: GAME_TEST_NOW,
    });

    expect(roomClaims).toMatchObject({
      mode: "room",
      rid: 7,
      tmr: 10,
      rounds: FIXED_SHARED_TARGETS,
    });
    expect(roomClaims).not.toHaveProperty("cid");
  });

  it("rejects a tampered signature", async () => {
    const { token } = await mintGameToken();

    await expect(
      verifyGameToken(tamperToken(token), { userId: 7, now: GAME_TEST_NOW }),
    ).rejects.toMatchObject({ code: "TOKEN_INVALID", status: 400 });
  });

  it("rejects an expired token with TOKEN_EXPIRED", async () => {
    const issuedAt = new Date(GAME_TEST_NOW.getTime() - (GAME_TOKEN_TTL_SECONDS + 1) * 1000);
    const { token } = await signGameToken(
      { userId: 7, mode: "global", rounds: FIXED_TARGETS },
      issuedAt,
    );

    await expect(verifyGameToken(token, { userId: 7, now: GAME_TEST_NOW })).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
      status: 400,
    });
  });

  it("rejects a token issued to another user", async () => {
    const { token } = await mintGameToken({ userId: 7 });

    await expect(verifyGameToken(token, { userId: 8, now: GAME_TEST_NOW })).rejects.toMatchObject({
      code: "TOKEN_USER_MISMATCH",
      status: 400,
    });
  });

  it("rejects a game submitted before the minimum elapsed time", async () => {
    const { token } = await signGameToken(
      { userId: 7, mode: "global", rounds: FIXED_TARGETS },
      GAME_TEST_NOW,
    );

    await expect(
      verifyGameToken(token, {
        userId: 7,
        now: new Date(GAME_TEST_NOW.getTime() + 12_000),
      }),
    ).rejects.toMatchObject({ code: "SUBMISSION_TOO_FAST", status: 400 });

    await expect(
      verifyGameToken(token, {
        userId: 7,
        now: new Date(GAME_TEST_NOW.getTime() + 13_000),
      }),
    ).resolves.toMatchObject({ sub: "7" });
  });

  it("rejects a wrong typ claim", async () => {
    const token = await mintRawGameToken({ typ: "session" });

    await expect(verifyGameToken(token, { userId: 7, now: GAME_TEST_NOW })).rejects.toMatchObject({
      code: "TOKEN_INVALID",
    });
  });

  it("rejects a wrong audience", async () => {
    const token = await mintRawGameToken({ audience: "some-other-app" });

    await expect(verifyGameToken(token, { userId: 7, now: GAME_TEST_NOW })).rejects.toMatchObject({
      code: "TOKEN_INVALID",
    });
  });

  it("rejects a token without exactly 3 rounds", async () => {
    const twoRounds: GameTokenRound[] = FIXED_TARGETS.slice(0, 2);
    const token = await mintRawGameToken({ rounds: twoRounds });

    await expect(verifyGameToken(token, { userId: 7, now: GAME_TEST_NOW })).rejects.toMatchObject({
      code: "TOKEN_INVALID",
    });
  });

  it("rejects an invalid color number permutation", async () => {
    const duplicateNumbers: GameTokenRound[] = [
      { ...FIXED_TARGETS[0], n: 1 },
      { ...FIXED_TARGETS[1], n: 1 },
      { ...FIXED_TARGETS[2], n: 2 },
    ];
    const token = await mintRawGameToken({
      mode: "daily",
      rounds: duplicateNumbers,
      extra: { cid: 118, cdate: "2026-10-29" },
    });

    await expect(verifyGameToken(token, { userId: 7, now: GAME_TEST_NOW })).rejects.toMatchObject({
      code: "TOKEN_INVALID",
    });
  });
});
