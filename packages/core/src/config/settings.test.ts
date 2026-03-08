import { describe, it, expect } from "vitest";
import { getAuthorityForDomain, DOMAIN_AUTHORITY_MAP } from "./settings.js";

describe("getAuthorityForDomain", () => {
  it("returns usopc_governance for usopc.org", () => {
    expect(getAuthorityForDomain("https://usopc.org/bylaws")).toBe(
      "usopc_governance",
    );
  });

  it("returns usopc_governance for teamusa.org", () => {
    expect(getAuthorityForDomain("https://teamusa.org/athletes")).toBe(
      "usopc_governance",
    );
  });

  it("returns anti_doping_national for usada.org", () => {
    expect(getAuthorityForDomain("https://usada.org/testing")).toBe(
      "anti_doping_national",
    );
  });

  it("returns anti_doping_national for wada-ama.org", () => {
    expect(getAuthorityForDomain("https://wada-ama.org/en/resources")).toBe(
      "anti_doping_national",
    );
  });

  it("returns independent_office for safesport.org", () => {
    expect(getAuthorityForDomain("https://safesport.org/report")).toBe(
      "independent_office",
    );
  });

  it("returns independent_office for uscenterforsafesport.org", () => {
    expect(
      getAuthorityForDomain("https://uscenterforsafesport.org/policies"),
    ).toBe("independent_office");
  });

  it("returns international_rule for olympics.com", () => {
    expect(getAuthorityForDomain("https://olympics.com/ioc/charter")).toBe(
      "international_rule",
    );
  });

  it("returns international_rule for paralympic.org", () => {
    expect(getAuthorityForDomain("https://paralympic.org/rules")).toBe(
      "international_rule",
    );
  });

  it("returns international_rule for IF domains", () => {
    expect(getAuthorityForDomain("https://worldathletics.org/rules")).toBe(
      "international_rule",
    );
    expect(getAuthorityForDomain("https://fis-ski.com/regulations")).toBe(
      "international_rule",
    );
  });

  it("strips www. prefix before matching", () => {
    expect(getAuthorityForDomain("https://www.usopc.org/bylaws")).toBe(
      "usopc_governance",
    );
    expect(getAuthorityForDomain("https://www.usada.org/testing")).toBe(
      "anti_doping_national",
    );
  });

  it("matches subdomains via parent domain", () => {
    expect(getAuthorityForDomain("https://news.usopc.org/article")).toBe(
      "usopc_governance",
    );
    expect(getAuthorityForDomain("https://docs.usada.org/guide")).toBe(
      "anti_doping_national",
    );
  });

  it("returns educational_guidance for unknown domains", () => {
    expect(getAuthorityForDomain("https://example.com/blog")).toBe(
      "educational_guidance",
    );
    expect(getAuthorityForDomain("https://random-blog.net/post")).toBe(
      "educational_guidance",
    );
  });

  it("returns educational_guidance for invalid URLs", () => {
    expect(getAuthorityForDomain("not-a-url")).toBe("educational_guidance");
    expect(getAuthorityForDomain("")).toBe("educational_guidance");
  });
});

describe("DOMAIN_AUTHORITY_MAP", () => {
  it("has entries for all trusted USOPC domains", () => {
    expect(DOMAIN_AUTHORITY_MAP["usopc.org"]).toBe("usopc_governance");
    expect(DOMAIN_AUTHORITY_MAP["teamusa.org"]).toBe("usopc_governance");
  });

  it("has entries for anti-doping domains", () => {
    expect(DOMAIN_AUTHORITY_MAP["usada.org"]).toBe("anti_doping_national");
    expect(DOMAIN_AUTHORITY_MAP["wada-ama.org"]).toBe("anti_doping_national");
  });
});
