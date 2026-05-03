import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { env } from "../config/env.js";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "APP_ERROR"
  ) {
    super(message);
  }
}

export function notFound(message = "Resource not found") {
  return new AppError(404, message, "NOT_FOUND");
}

export function badRequest(message = "Invalid request") {
  return new AppError(400, message, "BAD_REQUEST");
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Invalid request payload.",
      details: error.flatten()
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.code,
      message: error.message
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return res.status(404).json({
      error: "NOT_FOUND",
      message: "Resource not found."
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return res.status(409).json({
      error: "CONFLICT",
      message: "A record with that unique value already exists."
    });
  }

  console.error("Unhandled route error", error);

  const message = env.NODE_ENV === "production"
    ? "Unexpected server error."
    : (error instanceof Error ? error.message : "Unexpected server error.");
  return res.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message
  });
}
