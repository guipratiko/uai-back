import nodemailer from "nodemailer";
import type { Attachment } from "nodemailer/lib/mailer";
import type { Transporter } from "nodemailer";
import {
  buildTicketEmailAssets,
  type TicketEmailData,
} from "../lib/ticket-email-image";
import { config } from "../config";

let transporter: Transporter | null = null;

/** Porta 587 = STARTTLS (secure: false). Porta 465 = SSL implícito (secure: true). */
function resolveSmtpSecure(port: number, envSecure: boolean): boolean {
  if (port === 465) return true;
  if (port === 587 || port === 25) return false;
  return envSecure;
}

function buildTransportOptions() {
  const port = config.smtp.port;
  const secure = resolveSmtpSecure(port, config.smtp.secure);
  if (config.smtp.secure && (port === 587 || port === 25)) {
    console.warn(
      "[email] SMTP_SECURE=true com porta",
      port,
      "— usando STARTTLS (secure: false). Defina SMTP_SECURE=false no .env.",
    );
  }
  return {
    host: config.smtp.host,
    port,
    secure,
    requireTLS: port === 587,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
    tls: {
      minVersion: "TLSv1.2" as const,
      servername: config.smtp.host,
    },
    logger: config.smtp.debug,
    debug: config.smtp.debug,
  };
}

/** Remetente alinhado ao login SMTP (exigido por Umbler e reduz spam). */
function resolveFromAddress(): string {
  const user = config.smtp.user.trim();
  const from = config.smtp.from.trim();
  if (from && from.toLowerCase() !== user.toLowerCase()) {
    console.warn(
      "[email] EMAIL_FROM difere de SMTP_USER — enviando como SMTP_USER para melhor entrega",
      { emailFrom: from, smtpUser: user },
    );
  }
  return user || from;
}

function getTransporter(): Transporter | null {
  if (!config.smtp.enabled) return null;
  if (!config.smtp.host || !config.smtp.user) return null;
  if (!transporter) {
    const options = buildTransportOptions();
    console.info("[email] SMTP", {
      host: options.host,
      port: options.port,
      secure: options.secure,
      requireTLS: options.requireTLS,
      user: options.auth?.user,
    });
    transporter = nodemailer.createTransport(options);
  }
  return transporter;
}

export async function verifySmtpConnection(): Promise<void> {
  const transport = getTransporter();
  if (!transport) return;
  try {
    await transport.verify();
    console.info("[email] Conexão SMTP verificada (auth OK)");
  } catch (err) {
    console.error("[email] Falha na verificação SMTP:", err);
  }
}

type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Attachment[];
};

export async function sendMail(input: SendMailInput): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) {
    console.info("[email] SMTP desabilitado — e-mail não enviado:", input.subject, "→", input.to);
    return false;
  }

  const fromEmail = resolveFromAddress();

  try {
    const info = await transport.sendMail({
      from: `"${config.smtp.fromName}" <${fromEmail}>`,
      replyTo: fromEmail,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments,
    });
    console.info("[email] Handoff SMTP OK", {
      subject: input.subject,
      to: input.to,
      from: fromEmail,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    });
    if (info.rejected?.length) {
      console.error("[email] Destinatário rejeitado pelo servidor SMTP:", info.rejected);
    }
    return true;
  } catch (err) {
    console.error("[email] Falha ao enviar:", input.subject, "→", input.to, err);
    throw err;
  }
}

export type TicketEmailItem = TicketEmailData;

export async function sendTicketsEmail(
  to: string,
  buyerName: string,
  orderId: string,
  tickets: TicketEmailItem[],
) {
  const ticketData: TicketEmailData[] = tickets.map((t) => ({
    ...t,
    holderName: t.holderName || buyerName,
  }));

  const { ticketBlocksHtml, attachments } = await buildTicketEmailAssets(ticketData);

  const html = `
    <div style="margin:0;padding:24px 12px;background:#f3ebf9;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:640px;margin:0 auto;">
        <p style="margin:0 0 8px;font-size:14px;color:#8b3ab8;font-weight:600;text-align:center;">Uai Tickets</p>
        <h1 style="margin:0 0 12px;font-size:22px;color:#2d1045;text-align:center;">Seus ingressos</h1>
        <p style="margin:0 0 24px;font-size:15px;color:#475569;text-align:center;line-height:1.5;">
          Olá, <strong style="color:#1e293b;">${buyerName}</strong>!<br/>
          Pedido <strong style="color:#6d2d96;">${orderId}</strong> confirmado.
          Apresente cada ingresso abaixo na entrada do evento.
        </p>
        ${ticketBlocksHtml}
        <p style="margin:24px 0 0;font-size:13px;color:#64748b;text-align:center;">
          Também disponível em
          <a href="${config.frontendUrl}/conta/ingressos" style="color:#8b3ab8;font-weight:600;">Minha conta</a>
        </p>
      </div>
    </div>`;

  const text = ticketData
    .map(
      (t) =>
        `${t.eventTitle} - ${t.ticketName}\n${t.eventDate} ${t.eventTime}\n${t.venue}, ${t.city}\nTitular: ${t.holderName}\nCódigo: ${t.code}\nQR: ${t.qrValue}\n`,
    )
    .join("\n---\n");

  const nodemailerAttachments: Attachment[] = attachments.map((a) => ({
    filename: a.filename,
    content: a.content,
    cid: a.cid,
  }));

  return sendMail({
    to,
    subject: `Ingressos confirmados — pedido ${orderId}`,
    html,
    text: `Olá ${buyerName},\n\nPedido ${orderId}:\n\n${text}`,
    attachments: nodemailerAttachments,
  });
}

export async function sendPasswordResetEmail(to: string, name: string, token: string) {
  const resetUrl = `${config.frontendUrl}/redefinir-senha?token=${token}`;
  const hours = config.passwordResetExpiresHours;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b;">
      <h1 style="color:#7c3aed;">Recuperação de senha</h1>
      <p>Olá, <strong>${name}</strong>!</p>
      <p>Recebemos uma solicitação para redefinir sua senha no Uai Tickets.</p>
      <p style="margin:28px 0;">
        <a href="${resetUrl}"
           style="background:#7c3aed;color:#fff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:600;">
          Redefinir senha
        </a>
      </p>
      <p style="font-size:14px;color:#64748b;">
        Este link expira em ${hours} hora(s). Se você não solicitou, ignore este e-mail.
      </p>
      <p style="font-size:12px;color:#94a3b8;word-break:break-all;">${resetUrl}</p>
    </div>`;

  return sendMail({
    to,
    subject: "Redefinir senha — Uai Tickets",
    html,
    text: `Olá ${name},\n\nRedefina sua senha: ${resetUrl}\n\nExpira em ${hours} hora(s).`,
  });
}
