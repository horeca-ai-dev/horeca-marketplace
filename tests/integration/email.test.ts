/**
 * sendEmail() against Mailpit (D2-B4). Needs `docker compose -f docker-compose.dev.yml up -d`
 * (Mailpit: SMTP on 1025, web UI and API on 8025). Open http://127.0.0.1:8025 to see the e-mail.
 */
import { afterAll, describe, expect, it } from "vitest";
import { env } from "@/env.core";
import { closeEmail, sendEmail } from "@/server/email/send";

// Mailpit's HTTP API runs on the same host as its SMTP server, port 8025.
const mailpitApi = `http://${new URL(env.SMTP_URL).hostname}:8025/api/v1`;

afterAll(() => {
  closeEmail();
});

describe("sendEmail", () => {
  it("delivers an e-mail to Mailpit with our sender, subject and text", async () => {
    const subject = `D2-B4 test ${Date.now().toString(36)}`;
    await sendEmail({
      to: "buyer@example.test",
      subject,
      text: "Hello from the worker.",
    });

    const res = await fetch(
      `${mailpitApi}/search?query=${encodeURIComponent(`subject:"${subject}"`)}`,
    );
    const found = (await res.json()) as {
      messages: {
        Subject: string;
        From: { Address: string };
        To: { Address: string }[];
        Snippet: string;
      }[];
    };
    expect(found.messages).toHaveLength(1);
    const [message] = found.messages;
    expect(message?.To[0]?.Address).toBe("buyer@example.test");
    expect(env.EMAIL_FROM).toContain(message?.From.Address ?? "missing");
    expect(message?.Snippet).toContain("Hello from the worker.");
  });
});
