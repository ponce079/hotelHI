import express from "express";
import { articulosRouter } from "./modules/articulos/articulos.routes.js";
import { articuloDepositoRouter } from "./modules/articulo-deposito/articulo-deposito.routes.js";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/articulos", articulosRouter);
app.use("/api/articulo-depositos", articuloDepositoRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});
