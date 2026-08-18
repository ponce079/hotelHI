import { Router } from "express";
import { postArticulo, getArticulos, getArticuloPorId } from "./articulos.controller.js";

export const articulosRouter = Router();

articulosRouter.post("/", postArticulo);
articulosRouter.get("/", getArticulos);
articulosRouter.get("/:id", getArticuloPorId);
