/**
 * Testa envio SMTP com as variáveis do .env
 *
 * Uso:
 *   npm run email:test -- seu@email.com
 *   TEST_EMAIL_TO=seu@email.com npm run email:test
 */
import "dotenv/config";
import { config } from "../src/config";
import { sendMail, verifySmtpConnection } from "../src/services/email.service";

async function main() {
  const to = process.argv[2]?.trim() || process.env.TEST_EMAIL_TO?.trim();

  if (!to || !to.includes("@")) {
    console.error("\nInforme o destinatário:\n");
    console.error("  npm run email:test -- guilherme@exemplo.com\n");
    console.error("  TEST_EMAIL_TO=guilherme@exemplo.com npm run email:test\n");
    process.exit(1);
  }

  if (!config.smtp.enabled) {
    console.error("\nSMTP_ENABLED=false no .env — defina SMTP_ENABLED=true\n");
    process.exit(1);
  }

  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    console.error("\nPreencha SMTP_HOST, SMTP_USER e SMTP_PASS no .env\n");
    process.exit(1);
  }

  console.log("\n--- Configuração SMTP ---");
  console.log({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    user: config.smtp.user,
    from: config.smtp.from,
    debug: config.smtp.debug,
  });
  console.log(`\nDestinatário: ${to}\n`);

  console.log("1/2 Verificando conexão...");
  await verifySmtpConnection();

  const now = new Date().toISOString();
  console.log("2/2 Enviando e-mail de teste...");

  await sendMail({
    to,
    subject: `[Uai Tickets] Teste SMTP ${now}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h1 style="color:#7c3aed;">Teste de e-mail</h1>
        <p>Se você recebeu esta mensagem, o SMTP está funcionando.</p>
        <p style="color:#64748b;font-size:14px;">Enviado em ${now}</p>
      </div>`,
    text: `Teste Uai Tickets SMTP\nEnviado em ${now}\n`,
  });

  console.log("\nConcluído. Verifique a caixa de entrada e o spam.\n");
  console.log("Se não chegar: painel Umbler → caixa Enviados + DNS SPF/DKIM do domínio.\n");
}

main().catch((err) => {
  console.error("\nFalha no teste de e-mail:\n", err);
  process.exit(1);
});
