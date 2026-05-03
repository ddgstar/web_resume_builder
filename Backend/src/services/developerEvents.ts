import { prisma } from "../db/prisma.js";

export async function addDeveloperEvent(category: string, title: string, detail = "", jobID?: string) {
  await prisma.developerEvent.create({
    data: { category, title, detail, jobID }
  });
}

