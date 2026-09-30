import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { issueUserToken } from "@/lib/userToken";
import { APP_BASE_URL } from "@/lib/appUrl";
import { isProductionRuntime } from "@/lib/isProduction";

const ACTIVATION_TTL_MS = 72 * 60 * 60_000;

export type ProvisionPayment = {
  providerPaymentId: string;
  providerCustomerId?: string;
  amountPaise: number;
  currency: string;
};

export type ProvisionOutcome =
  | { outcome: "provisioned"; organizationId: string; slug: string }
  // Already PROVISIONED — a replayed/duplicate confirmation, not an error.
  | { outcome: "duplicate" }
  | { outcome: "needs_attention"; reason: string };

// TODO(email infra phase): replace both of these with lib/email.ts's
// sendEmail() once a real provider exists — gated to non-production for
// the same reason as app/api/activate/resend/route.ts's identical interim
// pattern (the activation link is a bearer credential; never log it in
// production where nothing would ever deliver it anyway).
function logWorkspaceReadyEmail(email: string, slug: string, rawToken: string) {
  if (!isProductionRuntime()) {
    console.info(
      `[provision] workspace-ready email for ${email}: org=${slug} activate=${APP_BASE_URL}/activate?token=${rawToken}`,
    );
  }
}
function sendOpsAlert(message: string) {
  console.error(`[ops-alert] ${message}`);
}

/**
 * Which unique constraint a P2002 tripped. This Prisma version (driver
 * adapters, e.g. PrismaPg) doesn't populate the classic `err.meta.target`
 * field-name array at all — the actual detail lives nested under
 * `err.meta.driverAdapterError.cause.constraint.fields`, which is
 * adapter-internal and not worth depending on. `err.meta.modelName` is
 * documented, stable, and sufficient here: within this transaction only
 * Organization.slug and User.email are unique-constrained, so which model
 * failed unambiguously identifies which one collided.
 */
function uniqueConstraintReason(err: Prisma.PrismaClientKnownRequestError): string {
  const modelName = (err.meta as { modelName?: string } | undefined)?.modelName;
  if (modelName === "User") return "email_taken";
  if (modelName === "Organization") return "slug_taken";
  return "unique_constraint";
}

/**
 * The one idempotent function that turns a confirmed payment into a real
 * Organization + admin User — shared by the webhook (app/api/billing/
 * webhook/route.ts) and the status-poll fallback (app/api/signup/status/
 * route.ts), so there is exactly one code path that can ever provision a
 * paid signup, however the confirmation arrived.
 *
 * Safe to call more than once for the same checkout: the atomic claim
 * below (PENDING|CANCELLED -> PROVISIONED, requiring exactly one row
 * affected) is what makes a replayed webhook or an overlapping poll a
 * no-op instead of a double-provision.
 */
export async function provisionPaidSignup(checkoutId: string, payment: ProvisionPayment): Promise<ProvisionOutcome> {
  const checkout = await prisma.signupCheckout.findUnique({ where: { id: checkoutId } });
  if (!checkout) {
    sendOpsAlert(`provisionPaidSignup called with unknown checkout id ${checkoutId}`);
    return { outcome: "needs_attention", reason: "checkout_not_found" };
  }
  if (checkout.status === "PROVISIONED") {
    return { outcome: "duplicate" };
  }
  if (checkout.status === "NEEDS_ATTENTION") {
    return { outcome: "needs_attention", reason: checkout.attentionReason ?? "unknown" };
  }

  // Integrity check — never trust the caller's amount/currency over the
  // server-computed quote frozen on this row at checkout time.
  if (payment.amountPaise !== checkout.amountPaise || payment.currency !== checkout.currency) {
    await prisma.signupCheckout.update({
      where: { id: checkout.id },
      data: { status: "NEEDS_ATTENTION", attentionReason: "amount_mismatch" },
    });
    sendOpsAlert(
      `Amount mismatch for checkout ${checkout.publicRef}: expected ${checkout.amountPaise} ${checkout.currency}, got ${payment.amountPaise} ${payment.currency}`,
    );
    return { outcome: "needs_attention", reason: "amount_mismatch" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const claim = await tx.signupCheckout.updateMany({
        where: { id: checkout.id, status: { in: ["PENDING", "CANCELLED"] } },
        data: { status: "PROVISIONED", paidAt: new Date(), providerPaymentId: payment.providerPaymentId },
      });
      if (claim.count !== 1) {
        // Lost the race to a concurrent call (or a duplicate delivery
        // arriving between the read above and this claim) — not an error.
        return { alreadyClaimed: true as const };
      }

      const organization = await tx.organization.create({
        data: {
          name: checkout.organizationName,
          slug: checkout.slug,
          planTier: checkout.planId,
          seatLimit: checkout.seats,
          billingCustomerId: payment.providerCustomerId,
        },
      });
      // Eager, not lazy — same precedent as app/api/register/route.ts.
      await tx.appSettings.create({ data: { organizationId: organization.id } });
      const admin = await tx.user.create({
        data: {
          organizationId: organization.id,
          name: checkout.adminName,
          email: checkout.adminEmail,
          role: "ADMIN",
          employeeCode: "ADM001",
          passwordHash: null,
          isOwner: true,
        },
      });
      const rawToken = await issueUserToken(tx, admin.id, "ACCOUNT_ACTIVATION", ACTIVATION_TTL_MS);

      await tx.signupCheckout.update({
        where: { id: checkout.id },
        data: { organizationId: organization.id, adminUserId: admin.id, provisionedAt: new Date() },
      });

      return { alreadyClaimed: false as const, organization, adminEmail: admin.email, rawToken };
    });

    if (result.alreadyClaimed) {
      return { outcome: "duplicate" };
    }

    try {
      logWorkspaceReadyEmail(result.adminEmail, result.organization.slug, result.rawToken);
      await prisma.signupCheckout.update({ where: { id: checkout.id }, data: { activationEmailSentAt: new Date() } });
    } catch (err) {
      // Provisioning already succeeded and committed — a failed email is
      // logged for ops to chase, not a reason to undo the organization.
      console.error("[provision] Failed to record/send activation email:", err);
      sendOpsAlert(`Provisioned ${checkout.slug} but failed to send the activation email — resend manually.`);
    }

    return { outcome: "provisioned", organizationId: result.organization.id, slug: result.organization.slug };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // The slug or email got taken by something else between checkout and
      // payment confirmation (e.g. another signup, or a hand-created row) —
      // the transaction above already rolled back, so no half-provisioned
      // org exists. Never provision silently into the wrong state.
      const reason = uniqueConstraintReason(err);
      await prisma.signupCheckout.update({
        where: { id: checkout.id },
        data: { status: "NEEDS_ATTENTION", attentionReason: reason },
      });
      sendOpsAlert(`Checkout ${checkout.publicRef} paid but could not provision (${reason}) — needs manual resolution.`);
      return { outcome: "needs_attention", reason };
    }
    throw err;
  }
}
