import { Router } from "express";
import { postArticuloDeposito, getArticuloDepositos } from "./articulo-deposito.controller.js";

export const articuloDepositoRouter = Router();

articuloDepositoRouter.post("/", postArticuloDeposito);
articuloDepositoRouter.get("/", getArticuloDepositos);
