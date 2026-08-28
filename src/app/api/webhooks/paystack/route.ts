import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paystack";
import { finalizePaystackPayment } from "@/lib/paystack-payments";
import {
  finalizeAnalyticsCheckout,
  handleChargeSuccessRenewal,
  handleInvoicePaymentFailed,
  handleSubscriptionCreate,
  handleSubscriptionDisable,
} from "@/lib/analytics-billing";

type PaystackEvent = {
  event?: string;
  data?: {
    reference?: string;
    plan?: { plan_code?: string } | null;
    subscription_code?: string;
    customer?: { customer_code?: string };
    next_payment_date?: string;
  };
};

/**
 * Paystack webhook — the authoritative confirmation path for both one-off invoice
 * payments and Analytics subscription billing (the browser callbacks are same-tab
 * conveniences, not to be trusted on their own). Always acknowledge with 200 once
 * the signature checks out, even for an event type we don't act on, so Paystack
 * doesn't keep retrying.
 *
 * Dispatch for charge.success: our own references are prefixed so we can tell a
 * one-off invoice payment, an initial subscription checkout, and a Paystack-generated
 * recurring renewal charge apart without any extra lookups.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!(await verifyWebhookSignature(rawBody, signature))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let event: PaystackEvent | null = null;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true });
  }

  try {
    const data = event?.data;
    switch (event?.event) {
      case "charge.success": {
        const reference = data?.reference ?? "";
        if (reference.startsWith("jdl-inv-")) {
          await finalizePaystackPayment(reference);
        } else if (reference.startsWith("jdl-sub-")) {
          await finalizeAnalyticsCheckout(reference);
        } else if (data?.plan) {
          await handleChargeSuccessRenewal({ customer: data.customer });
        }
        break;
      }
      case "subscription.create":
        await handleSubscriptionCreate({
          subscription_code: data?.subscription_code,
          customer: data?.customer,
          plan: data?.plan,
          next_payment_date: data?.next_payment_date,
        });
        break;
      case "subscription.disable":
        await handleSubscriptionDisable({ subscription_code: data?.subscription_code, customer: data?.customer });
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed({ customer: data?.customer });
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("paystack webhook:", err);
  }

  return NextResponse.json({ received: true });
}
