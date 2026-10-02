import fs from "node:fs";
import path from "node:path";

const required = [
  "BETA_ANDROID_KEYSTORE_BASE64",
  "BETA_ANDROID_KEYSTORE_PASSWORD",
  "BETA_ANDROID_KEY_ALIAS",
  "BETA_ANDROID_KEY_PASSWORD",
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing GitHub Actions secret: ${name}`);
  }
}

const androidRoot = path.resolve("android");
const appDir = path.join(androidRoot, "app");
const keystorePath = path.join(appDir, "beta-release.keystore");

fs.writeFileSync(
  keystorePath,
  Buffer.from(process.env.BETA_ANDROID_KEYSTORE_BASE64, "base64"),
  { mode: 0o600 }
);

const gradlePath = path.join(appDir, "build.gradle");
let gradle = fs.readFileSync(gradlePath, "utf8");

const releaseSigningBlock = `    release {
        storeFile file(System.getenv("BETA_ANDROID_KEYSTORE_PATH"))
        storePassword System.getenv("BETA_ANDROID_KEYSTORE_PASSWORD")
        keyAlias System.getenv("BETA_ANDROID_KEY_ALIAS")
        keyPassword System.getenv("BETA_ANDROID_KEY_PASSWORD")
    }
`;

if (!/signingConfigs\s*\{/.test(gradle)) {
  throw new Error("Could not find signingConfigs block in generated android/app/build.gradle");
}

if (!gradle.includes('System.getenv("BETA_ANDROID_KEYSTORE_PATH")')) {
  gradle = gradle.replace(/(signingConfigs\s*\{)/, `$1\n${releaseSigningBlock}`);
}

const releaseType = /(release\s*\{[\s\S]*?)(signingConfig\s+signingConfigs\.debug)/m;
if (releaseType.test(gradle)) {
  gradle = gradle.replace(releaseType, "$1signingConfig signingConfigs.release");
} else if (!/release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.release/m.test(gradle)) {
  throw new Error("Could not configure release signingConfig");
}

fs.writeFileSync(gradlePath, gradle, "utf8");
process.stdout.write("Persistent Beta signing configured.\n");
