import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { config } from "../config";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!config.smtp.enabled) return null;
  if (!config.smtp.host || !config.smtp.user) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }
  return transporter;
}

type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendMail(input: SendMailInput): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) {
    console.info("[email] SMTP desabilitado — e-mail não enviado:", input.subject, "→", input.to);
    return false;
  }

  await transport.sendMail({
    from: `"${config.smtp.fromName}" <${config.smtp.from}>`,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  return true;
}

type TicketEmailItem = {
  code: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  venue: string;
  city: string;
  ticketName: string;
  qrValue: string;
};

export async function sendTicketsEmail(
  to: string,
  buyerName: string,
  orderId: string,
  tickets: TicketEmailItem[],
) {
  const ticketsHtml = tickets
    .map(
      (t) => `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #eee;">
          <strong>${t.eventTitle}</strong><br/>
          <span style="color:#666;font-size:14px;">
            ${t.ticketName} · ${t.eventDate} às ${t.eventTime}<br/>
            ${t.venue}, ${t.city}
          </span><br/>
          <span style="font-family:monospace;font-size:13px;color:#7c3aed;">
            Código: ${t.code}
          </span>
        </td>
      </tr>`,
    )
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b;">
      <h1 style="color:#7c3aed;">Seus ingressos — Uai Tickets</h1>
      <p>Olá, <strong>${buyerName}</strong>!</p>
      <p>Seu pedido <strong>${orderId}</strong> foi confirmado. Apresente os códigos abaixo na entrada:</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0;">
        ${ticketsHtml}
      </table>
      <p style="font-size:14px;color:#64748b;">
        Você também pode acessar seus ingressos em
        <a href="${config.frontendUrl}/conta/ingressos" style="color:#7c3aed;">Minha conta</a>.
      </p>
    </div>`;

  const text = tickets
    .map(
      (t) =>
        `${t.eventTitle} - ${t.ticketName}\n${t.eventDate} ${t.eventTime} - ${t.venue}\nCódigo: ${t.code}\n`,
    )
    .join("\n");

  return sendMail({
    to,
    subject: `Ingressos confirmados — pedido ${orderId}`,
    html,
    text: `Olá ${buyerName},\n\nPedido ${orderId}:\n\n${text}`,
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
