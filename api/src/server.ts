import { app } from "./app.ts";
import { config } from "./config.ts";
import { programarLimpieza } from "./limpieza.ts";

app.listen(config.port, () => {
  console.log(`API del Copiloto contable en http://localhost:${config.port}/api`);
  programarLimpieza();
});
