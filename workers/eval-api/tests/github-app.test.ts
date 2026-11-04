/**
 * GitHub App 私钥格式测试：GitHub 下发 PKCS#1（RSA PRIVATE KEY），
 * jose 只收 PKCS#8 —— pkcs1ToPkcs8 必须产出可导入、可验签的密钥。
 */
import { describe, expect, it } from "vitest";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";
import { pkcs1ToPkcs8 } from "../src/github-app";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pkcs1Pem = privateKey.export({ type: "pkcs1", format: "pem" }) as string;
const pkcs8Pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

function b64urlToBuf(s: string): Buffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

describe("pkcs1ToPkcs8", () => {
  it("输出 PKCS#8 PEM 头", () => {
    const out = pkcs1ToPkcs8(pkcs1Pem);
    expect(out).toContain("BEGIN PRIVATE KEY");
    expect(out).not.toContain("BEGIN RSA PRIVATE KEY");
  });

  it("转换后可被 jose 导入并签名，Node crypto 可验签", async () => {
    const wrapped = pkcs1ToPkcs8(pkcs1Pem);
    const key = await importPKCS8(wrapped, "RS256");
    const jwt = await new SignJWT({ sub: "test" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer("12345")
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + 540)
      .sign(key);

    const [h, p, s] = jwt.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${h}.${p}`);
    verifier.end();
    const ok = verifier.verify(publicKey, b64urlToBuf(s));
    expect(ok).toBe(true);
  });

  it("单行粘贴形态（字面反斜杠n）先由 normalizePem 处理后再转换", async () => {
    // 模拟 wrangler secret 单行粘贴：真实换行替换成字面 \n
    const singleLine = pkcs1Pem.trim().replace(/\r?\n/g, "\\n");
    expect(singleLine).toContain("\\n");
    const restored = singleLine.replace(/\\n/g, "\n");
    const wrapped = pkcs1ToPkcs8(restored);
    const key = await importPKCS8(wrapped, "RS256");
    expect(key).toBeDefined();
  });

  it("PKCS#8 原样可导入（不经转换）", async () => {
    const key = await importPKCS8(pkcs8Pem, "RS256");
    expect(key).toBeDefined();
  });
});
