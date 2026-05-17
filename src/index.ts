import { assertConfig, config } from "./config";
import { createApp } from "./app";

assertConfig();

const app = createApp();

app.listen(config.port, () => {
  console.log(`Uai Tickets API em http://localhost:${config.port}`);
});
