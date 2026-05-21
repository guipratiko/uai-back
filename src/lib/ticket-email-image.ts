import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import sharp from "sharp";
import { config } from "../config";

export type TicketEmailData = {
  code: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  venue: string;
  city: string;
  state?: string;
  ticketName: string;
  qrValue: string;
  holderName: string;
};

const W = 600;
const H = 880;
const FONT_FAMILY = "UaiTicket";

let embeddedFontCss: string | null = null;

function loadEmbeddedFontFaces(): string {
  if (embeddedFontCss) return embeddedFontCss;

  const base = path.join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf");
  const regularPath = path.join(base, "DejaVuSans.ttf");
  const boldPath = path.join(base, "DejaVuSans-Bold.ttf");

  if (!fs.existsSync(regularPath) || !fs.existsSync(boldPath)) {
    console.warn("[ticket-image] Fontes DejaVu não encontradas; texto do ingresso pode falhar no Docker");
    embeddedFontCss = "";
    return embeddedFontCss;
  }

  const regular = fs.readFileSync(regularPath).toString("base64");
  const bold = fs.readFileSync(boldPath).toString("base64");

  embeddedFontCss = `
    @font-face {
      font-family: '${FONT_FAMILY}';
      font-weight: 400;
      font-style: normal;
      src: url('data:font/ttf;base64,${regular}') format('truetype');
    }
    @font-face {
      font-family: '${FONT_FAMILY}';
      font-weight: 700;
      font-style: normal;
      src: url('data:font/ttf;base64,${bold}') format('truetype');
    }
  `;
  return embeddedFontCss;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function formatEventDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const months = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  return `${String(d).padStart(2, "0")} ${months[m - 1]} ${y}`;
}

async function loadLogoPng(): Promise<Buffer | null> {
  const candidates = [
    path.join(process.cwd(), "assets", "logo.png"),
    path.join(process.cwd(), "..", "frontend", "public", "img", "AGENTS.png"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return sharp(file).resize({ height: 48 }).png().toBuffer();
    }
  }
  try {
    const url = `${config.frontendUrl.replace(/\/$/, "")}/img/AGENTS.png`;
    const res = await fetch(url);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      return sharp(buf).resize({ height: 48 }).png().toBuffer();
    }
  } catch {
    /* sem logo */
  }
  return null;
}

export async function generateTicketPng(ticket: TicketEmailData): Promise<Buffer> {
  const logo = await loadLogoPng();
  const qrSize = 240;
  const qrBuffer = await QRCode.toBuffer(ticket.qrValue, {
    type: "png",
    width: qrSize,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#2d1045", light: "#ffffff" },
  });

  const title = escapeXml(truncate(ticket.eventTitle, 42));
  const ticketName = escapeXml(truncate(ticket.ticketName, 36));
  const when = escapeXml(`${formatEventDate(ticket.eventDate)} · ${ticket.eventTime}`);
  const where = escapeXml(truncate(`${ticket.venue}, ${ticket.city}`, 48));
  const holder = escapeXml(truncate(ticket.holderName, 40));
  const code = escapeXml(ticket.code);
  const fontFaces = loadEmbeddedFontFaces();
  const ff = `${FONT_FAMILY}, sans-serif`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style><![CDATA[${fontFaces}]]></style>
    <linearGradient id="hdr" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6d2d96"/>
      <stop offset="55%" stop-color="#8b3ab8"/>
      <stop offset="100%" stop-color="#2d1045"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="28" fill="#ffffff"/>
  <rect width="${W}" height="188" rx="28" fill="url(#hdr)"/>
  <rect y="160" width="${W}" height="28" fill="#ffffff"/>
  ${logo ? "" : `<text x="32" y="52" font-family="${ff}" font-size="22" font-weight="700" fill="#ffffff">Uai Tickets</text>`}
  <rect x="430" y="28" width="138" height="32" rx="16" fill="#c06ee2"/>
  <text x="499" y="50" text-anchor="middle" font-family="${ff}" font-size="13" font-weight="700" fill="#ffffff">VÁLIDO</text>
  <text x="32" y="118" font-family="${ff}" font-size="26" font-weight="700" fill="#ffffff">${title}</text>
  <text x="32" y="148" font-family="${ff}" font-size="15" fill="#e4cff0">${ticketName}</text>
  <rect x="24" y="200" width="${W - 48}" height="320" rx="16" fill="#faf7fc" stroke="#e4cff0" stroke-width="2"/>
  <text x="48" y="248" font-family="${ff}" font-size="13" font-weight="700" fill="#8b3ab8">DATA E HORÁRIO</text>
  <text x="48" y="276" font-family="${ff}" font-size="17" fill="#1e293b">${when}</text>
  <text x="48" y="318" font-family="${ff}" font-size="13" font-weight="700" fill="#8b3ab8">LOCAL</text>
  <text x="48" y="346" font-family="${ff}" font-size="17" fill="#1e293b">${where}</text>
  <text x="48" y="388" font-family="${ff}" font-size="13" font-weight="700" fill="#8b3ab8">TITULAR</text>
  <text x="48" y="416" font-family="${ff}" font-size="17" font-weight="700" fill="#1e293b">${holder}</text>
  <text x="48" y="456" font-family="${ff}" font-size="13" font-weight="700" fill="#8b3ab8">CÓDIGO</text>
  <text x="48" y="484" font-family="${ff}" font-size="18" font-weight="700" fill="#6d2d96">${code}</text>
  <rect x="168" y="540" width="264" height="264" rx="16" fill="#ffffff" stroke="#ddb3f0" stroke-width="2"/>
  <text x="${W / 2}" y="828" text-anchor="middle" font-family="${ff}" font-size="12" fill="#64748b">Apresente este QR Code na entrada</text>
  <text x="${W / 2}" y="852" text-anchor="middle" font-family="${ff}" font-size="11" fill="#94a3b8">Ingresso digital · Não compartilhe</text>
</svg>`;

  const composites: sharp.OverlayOptions[] = [
    { input: qrBuffer, top: 552, left: 180 },
  ];

  if (logo) {
    composites.unshift({ input: logo, top: 28, left: 32 });
  }

  return sharp(Buffer.from(svg))
    .png()
    .composite(composites)
    .toBuffer();
}

export type TicketEmailAttachment = {
  filename: string;
  content: Buffer;
  cid: string;
};

export async function buildTicketEmailAssets(
  tickets: TicketEmailData[],
): Promise<{ ticketBlocksHtml: string; attachments: TicketEmailAttachment[] }> {
  const attachments: TicketEmailAttachment[] = [];
  const blocks: string[] = [];

  for (let i = 0; i < tickets.length; i++) {
    const png = await generateTicketPng(tickets[i]);
    const cid = `ticket-${i}`;
    const filename = `ingresso-${tickets[i].code}.png`;
    attachments.push({ filename, content: png, cid });
    blocks.push(`
      <div style="margin:0 auto 28px;max-width:600px;text-align:center;">
        <img src="cid:${cid}" alt="Ingresso ${tickets[i].code.replace(/"/g, "")}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border-radius:20px;border:2px dashed #ddb3f0;" />
      </div>`);
  }

  return { ticketBlocksHtml: blocks.join("\n"), attachments };
}
