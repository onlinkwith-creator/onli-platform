import fs from "node:fs/promises";

async function readEnvFile(path) {
  try {
    const text = await fs.readFile(path, "utf8");
    return Object.fromEntries(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [
            line.slice(0, index),
            line.slice(index + 1).replace(/^['"]|['"]$/g, ""),
          ];
        })
    );
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

const env = {
  ...(await readEnvFile(".env.local")),
  ...(await readEnvFile(".env.private.local")),
  ...(await readEnvFile("src/.env.private.local")),
};

const supabaseUrl = env.VITE_SUPABASE_URL;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN;

if (!supabaseUrl) {
  throw new Error("VITE_SUPABASE_URL is missing from .env.local");
}

if (!accessToken) {
  throw new Error(
    "SUPABASE_ACCESS_TOKEN is required. Add it to .env.private.local or pass it as an environment variable."
  );
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const sql = await fs.readFile(
  "supabase/migrations/20260508123000_allow_public_request_submissions.sql",
  "utf8"
);

const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  }
);

const resultText = await response.text();

if (!response.ok) {
  throw new Error(
    `Failed to apply RLS policy (${response.status}): ${resultText}`
  );
}

console.log(`Applied requests insert policy to Supabase project ${projectRef}.`);
