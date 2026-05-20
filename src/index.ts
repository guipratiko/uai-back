import { assertConfig, config } from "./config";
import { createApp } from "./app";
import { verifySmtpConnection } from "./services/email.service";

assertConfig();

const app = createApp();

app.listen(config.port, () => {
  console.log(`Uai Tickets API em http://localhost:${config.port}`);
  if (config.smtp.enabled) {
    void verifySmtpConnection();
  }
});
