import app from "./app";
import { logger } from "./lib/logger";
import { otomatikFaturaUret } from "./lib/otomatikFaturaUret";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

const GUNLUK_INTERVAL = 24 * 60 * 60 * 1000;
const schedulerCalistir = () =>
  otomatikFaturaUret().catch((err) =>
    logger.error({ err }, "Otomatik fatura uretimi basarisiz"),
  );
schedulerCalistir();
setInterval(schedulerCalistir, GUNLUK_INTERVAL);
