import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { InvalidPhoneNumberError } from "@/lib/auth/otp";

const sendOtp = vi.fn(async () => {});
const checkOtp = vi.fn(async () => true);
vi.mock("@/lib/auth/otp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/otp")>("@/lib/auth/otp");
  return {
    ...actual,
    sendOtp: (...args: Parameters<typeof sendOtp>) => sendOtp(...args),
    checkOtp: (...args: Parameters<typeof checkOtp>) => checkOtp(...args),
  };
});

const { requestPhoneChange, confirmPhoneChange, PhoneAlreadyInUseError, SamePhoneError, InvalidOtpError } = await import(
  "@/lib/settings/phone"
);

describe("settings: phone change", () => {
  const userPhone = "+15555550301";
  const otherPhone = "+15555550302";
  const newPhone = "+15555550303";
  let userId: string;

  beforeEach(async () => {
    sendOtp.mockClear();
    checkOtp.mockClear();
    checkOtp.mockResolvedValue(true);
    const user = await prisma.user.create({ data: { phone: userPhone } });
    userId = user.id;
    await prisma.user.create({ data: { phone: otherPhone } });
  });

  afterEach(async () => {
    await prisma.otpSendAttempt.deleteMany({ where: { phone: { in: [userPhone, otherPhone, newPhone] } } });
    await prisma.user.deleteMany({ where: { phone: { in: [userPhone, otherPhone, newPhone] } } });
  });

  it("rejects requesting a change to the same phone without sending an OTP", async () => {
    await expect(requestPhoneChange({ id: userId, phone: userPhone }, userPhone, "1.2.3.4")).rejects.toBeInstanceOf(SamePhoneError);
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it("rejects a phone already used by another account without sending an OTP", async () => {
    await expect(requestPhoneChange({ id: userId, phone: userPhone }, otherPhone, "1.2.3.4")).rejects.toBeInstanceOf(
      PhoneAlreadyInUseError,
    );
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it("rejects an invalid phone number without sending an OTP", async () => {
    await expect(requestPhoneChange({ id: userId, phone: userPhone }, "123", "1.2.3.4")).rejects.toBeInstanceOf(InvalidPhoneNumberError);
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it("sends an OTP to a free, different phone number", async () => {
    await requestPhoneChange({ id: userId, phone: userPhone }, newPhone, "1.2.3.4");
    expect(sendOtp).toHaveBeenCalledWith(newPhone);
  });

  it("rejects an incorrect code and never updates the phone", async () => {
    checkOtp.mockResolvedValueOnce(false);
    await expect(confirmPhoneChange(userId, newPhone, "000000")).rejects.toBeInstanceOf(InvalidOtpError);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.phone).toBe(userPhone);
  });

  it("updates the phone on a correct code", async () => {
    await confirmPhoneChange(userId, newPhone, "123456");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.phone).toBe(newPhone);
  });

  it("rejects the confirm step at the DB level if the number was claimed in the meantime (race)", async () => {
    // Simulates two users requesting the same number concurrently: both
    // pass requestPhoneChange's pre-check, but only one can win the DB's
    // unique constraint at confirm time.
    await prisma.user.update({ where: { phone: otherPhone }, data: { phone: newPhone } });

    await expect(confirmPhoneChange(userId, newPhone, "123456")).rejects.toBeInstanceOf(PhoneAlreadyInUseError);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.phone).toBe(userPhone);
  });
});
