import nodemailer from "nodemailer";

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM_EMAIL,
} = process.env;

let cachedTransport = null;

function getTransport() {
  if (cachedTransport) return cachedTransport;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM_EMAIL) {
    console.warn("SMTP not fully configured; email sending disabled.");
    return null;
  }

  const secure = String(SMTP_SECURE).toLowerCase() === "true";
  const port = Number(SMTP_PORT) || 587;

  cachedTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return cachedTransport;
}

export async function sendMail({ to, subject, text, html, attachments }) {
  const transport = getTransport();
  if (!transport) {
    console.warn("sendMail called but SMTP transport is not available");
    return { sent: false, reason: "smtp_not_configured" };
  }

  const info = await transport.sendMail({
    from: SMTP_FROM_EMAIL,
    to,
    subject,
    text,
    html,
    attachments: attachments || [],
  });

  return { sent: true, messageId: info.messageId };
}
