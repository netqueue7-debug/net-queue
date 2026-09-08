import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { InvalidPhoneNumberError, normalizeUsPhone } from "@/lib/auth/otp";
import { prisma } from "@/lib/db";

// Twilio's standard opt-out/opt-in reply keywords (case-insensitive, exact
// match after trimming) that its Advanced Opt-Out feature recognizes on a
// Messaging Service. This webhook keeps our own smsOptedOutAt in sync with
// whatever Twilio told the subscriber, independent of whether Advanced
// Opt-Out is turned on for TWILIO_MESSAGING_SERVICE_SID — configure this
// route as that Messaging Service's "Incoming Messages" webhook in the
// Twilio console; nothing here registers it automatically.
const STOP_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_KEYWORDS = new Set(["START", "YES", "UNSTOP"]);

function emptyTwiml(): NextResponse {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    throw new Error("TWILIO_AUTH_TOKEN is not set.");
  }

  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}${request.nextUrl.pathname}`;

  const signature = request.headers.get("x-twilio-signature") ?? "";
  if (!twilio.validateRequest(authToken, signature, url, params)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  const body = (params.Body ?? "").trim().toUpperCase();
  const isStop = STOP_KEYWORDS.has(body);
  const isStart = START_KEYWORDS.has(body);

  if (params.From && (isStop || isStart)) {
    try {
      const normalized = normalizeUsPhone(params.From);
      await prisma.user.updateMany({
        where: { phone: normalized },
        data: { smsOptedOutAt: isStop ? new Date() : null },
      });
    } catch (e) {
      if (!(e instanceof InvalidPhoneNumberError)) throw e;
    }
  }

  // HELP, and anything else, needs no local state change — we're not
  // generating the subscriber-facing reply here, just keeping our own
  // records honest about STOP/START.
  return emptyTwiml();
}
