import crypto from "crypto";
import fs from "fs";
import path from "path";

const filePath = path.join(process.cwd(), "data", "scripts.json");

export function saveScript(script: unknown) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const scripts = JSON.parse(raw);

  scripts.push({
    id: crypto.randomUUID(),
    ...((script as Record<string, unknown>) || {}),
    createdAt: new Date().toISOString()
  });

  fs.writeFileSync(filePath, JSON.stringify(scripts, null, 2));
}

export function getScripts() {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}
