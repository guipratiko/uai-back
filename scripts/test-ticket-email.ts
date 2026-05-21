/**
 * Envia e-mail de teste com imagem do ingresso (QR + layout Uai Tickets)
 *
 * Uso: npm run email:test-ticket -- seu@email.com
 */
import "dotenv/config";
import { config } from "../src/config";
import { sendTicketsEmail } from "../src/services/email.service";

async function main() {
  const to = process.argv[2]?.trim() || process.env.TEST_EMAIL_TO?.trim();
  if (!to?.includes("@")) {
    console.error("Uso: npm run email:test-ticket -- seu@email.com");
    process.exit(1);
  }
  if (!config.smtp.enabled) {
    console.error("Defina SMTP_ENABLED=true no .env");
    process.exit(1);
  }

  await sendTicketsEmail(to, "Guilherme Teste", "ORD-TESTE-EMAIL", [
    {
      code: "TKT-DEMO01",
      eventTitle: "Rock in Minas 2026",
      eventDate: "2026-09-05",
      eventTime: "14:00",
      venue: "Expominas",
      city: "Belo Horizonte",
      ticketName: "Passe 3 Dias",
      qrValue: "UAI-ORD-TESTE-EMAIL-TKT-DEMO01",
      holderName: "Guilherme Teste",
    },
  ]);

  console.log(`E-mail de ingresso (com imagem) enviado para ${to}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
