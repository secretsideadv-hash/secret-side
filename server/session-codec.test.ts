/** The session cookie must not be readable or editable by the player. */
import { describe, expect, it } from "vitest";
import { buildSentinelContent, stopId } from "@/features/engine/__fixtures__/sentinel-content";
import { checkIn, startSession } from "@/features/engine/session";
import { sealJson, unsealJson } from "./crypto";
import { decodeSession, encodeSession } from "./session-codec";

const SECRET = "test-secret-test-secret-test-secret-1234";
const OTHER_SECRET = "another-secret-another-secret-another-99";
const content = buildSentinelContent();
const NOW = new Date("2026-11-23T20:00:00.000Z");
const session = checkIn(startSession({ id: "sess-123", content, now: NOW }), content, {
  stopId: stopId(1),
  method: "manual",
  now: NOW,
});

describe("session cookie codec", () => {
  it("round-trips a session", () => {
    expect(decodeSession(encodeSession(session, SECRET), SECRET)).toEqual(session);
  });

  it("is not readable: no plaintext in the token or its decoded bytes", () => {
    const token = encodeSession(session, SECRET);
    const bytes = Buffer.from(token, "base64url").toString("latin1");
    // Multi-character markers only: random ciphertext bytes can contain any single character.
    for (const plain of ["sess-123", "stopid", "arrived", "currentPosition", '{"id"']) {
      expect(token).not.toContain(plain);
      expect(bytes).not.toContain(plain);
    }
  });

  it("uses a fresh IV each time, so identical sessions don't produce identical tokens", () => {
    expect(encodeSession(session, SECRET)).not.toBe(encodeSession(session, SECRET));
  });

  it("is not editable: flipping any byte is rejected", () => {
    const raw = Buffer.from(encodeSession(session, SECRET), "base64url");
    for (let i = 0; i < raw.length; i += 7) {
      const tampered = Buffer.from(raw);
      tampered[i] = tampered[i]! ^ 0x01;
      expect(decodeSession(tampered.toString("base64url"), SECRET), `byte ${i}`).toBeNull();
    }
  });

  it("rejects truncated, extended and garbage tokens", () => {
    const token = encodeSession(session, SECRET);
    expect(decodeSession(token.slice(0, -4), SECRET)).toBeNull();
    expect(decodeSession(`${token}AAAA`, SECRET)).toBeNull();
    expect(decodeSession("", SECRET)).toBeNull();
    expect(decodeSession("not-a-token", SECRET)).toBeNull();
    expect(decodeSession(Buffer.from(JSON.stringify(session)).toString("base64url"), SECRET)).toBeNull();
  });

  it("rejects tokens sealed with another secret or for another purpose", () => {
    expect(decodeSession(encodeSession(session, OTHER_SECRET), SECRET)).toBeNull();
    expect(decodeSession(sealJson(session, SECRET, "some-other-cookie"), SECRET)).toBeNull();
  });

  it("rejects a validly sealed payload that isn't a session", () => {
    const forged = sealJson({ id: "sess-123", score: 99999 }, SECRET, "session-cookie");
    expect(unsealJson(forged, SECRET, "session-cookie")).toBeTruthy();
    expect(decodeSession(forged, SECRET)).toBeNull();
  });

  it("stays well under the 4 KB cookie limit for a 5-stop session", () => {
    expect(encodeSession(session, SECRET).length).toBeLessThan(2500);
  });
});
