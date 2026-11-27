import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

function request(cookie?: string) {
  return new NextRequest("http://localhost:3000/buyer/orders", {
    headers: cookie ? { cookie } : {},
  });
}

describe("proxy", () => {
  it("redirects a request without a session cookie to /login", () => {
    const response = proxy(request());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("ignores unrelated cookies", () => {
    expect(proxy(request("theme=dark")).headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });

  it.each(["better-auth.session_token", "__Secure-better-auth.session_token"])(
    "lets a request with %s through (the layout validates it)",
    (name) => {
      const response = proxy(request(`${name}=abc.def`));
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );
});
