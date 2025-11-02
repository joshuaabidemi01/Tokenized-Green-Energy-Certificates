import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_AMOUNT = 101;
const ERR_INVALID_TIMESTAMP = 102;
const ERR_ALREADY_MINTED = 103;
const ERR_PRODUCER_NOT_REGISTERED = 104;
const ERR_ORACLE_NOT_VERIFIED = 105;
const ERR_INVALID_CERT_ID = 106;
const ERR_INVALID_ENERGY_TYPE = 107;
const ERR_INVALID_LOCATION = 108;
const ERR_INVALID_METADATA = 109;
const ERR_MAX_CERTS_EXCEEDED = 110;

interface Certificate {
  energyAmount: number;
  productionTimestamp: number;
  mintTimestamp: number;
  producer: string;
  energyType: string;
  location: string;
  metadataHash: string;
  status: string;
  owner: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class CertificateMinterMock {
  state: {
    nextCertId: number;
    maxCerts: number;
    authorityContract: string | null;
    producerRegistryContract: string | null;
    oracleContract: string | null;
    certificates: Map<number, Certificate>;
    certificateByHash: Map<string, number>;
  } = {
    nextCertId: 0,
    maxCerts: 100000,
    authorityContract: null,
    producerRegistryContract: null,
    oracleContract: null,
    certificates: new Map(),
    certificateByHash: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1PRODUCER";
  producers: Set<string> = new Set(["ST1PRODUCER"]);
  oracles: Set<string> = new Set(["ST1ORACLE"]);

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextCertId: 0,
      maxCerts: 100000,
      authorityContract: null,
      producerRegistryContract: null,
      oracleContract: null,
      certificates: new Map(),
      certificateByHash: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1PRODUCER";
    this.producers = new Set(["ST1PRODUCER"]);
    this.oracles = new Set(["ST1ORACLE"]);
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (this.state.authorityContract) return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setProducerRegistry(contractPrincipal: string): Result<boolean> {
    if (this.caller !== this.state.authorityContract) return { ok: false, value: false };
    this.state.producerRegistryContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setOracleContract(contractPrincipal: string): Result<boolean> {
    if (this.caller !== this.state.authorityContract) return { ok: false, value: false };
    this.state.oracleContract = contractPrincipal;
    return { ok: true, value: true };
  }

  mintCertificate(
    energyAmount: number,
    productionTimestamp: number,
    energyType: string,
    location: string,
    metadataHash: string,
    oracle: string
  ): Result<number> {
    if (this.state.nextCertId >= this.state.maxCerts) return { ok: false, value: ERR_MAX_CERTS_EXCEEDED };
    if (energyAmount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (productionTimestamp < this.blockHeight) return { ok: false, value: ERR_INVALID_TIMESTAMP };
    if (!["solar", "wind", "hydro"].includes(energyType)) return { ok: false, value: ERR_INVALID_ENERGY_TYPE };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!metadataHash || metadataHash.length > 256) return { ok: false, value: ERR_INVALID_METADATA };
    if (!this.producers.has(this.caller)) return { ok: false, value: ERR_PRODUCER_NOT_REGISTERED };
    if (oracle !== this.state.oracleContract) return { ok: false, value: ERR_ORACLE_NOT_VERIFIED };
    if (this.state.certificateByHash.has(metadataHash)) return { ok: false, value: ERR_ALREADY_MINTED };
    const certId = this.state.nextCertId;
    const certificate: Certificate = {
      energyAmount,
      productionTimestamp,
      mintTimestamp: this.blockHeight,
      producer: this.caller,
      energyType,
      location,
      metadataHash,
      status: "active",
      owner: this.caller,
    };
    this.state.certificates.set(certId, certificate);
    this.state.certificateByHash.set(metadataHash, certId);
    this.state.nextCertId++;
    return { ok: true, value: certId };
  }

  updateCertificateOwner(certId: number, newOwner: string): Result<boolean> {
    const cert = this.state.certificates.get(certId);
    if (!cert) return { ok: false, value: false };
    if (cert.owner !== this.caller) return { ok: false, value: false };
    if (cert.status !== "active") return { ok: false, value: false };
    this.state.certificates.set(certId, { ...cert, owner: newOwner });
    return { ok: true, value: true };
  }

  getCertificate(certId: number): Certificate | null {
    return this.state.certificates.get(certId) || null;
  }

  getCertificateByHash(hash: string): number | null {
    return this.state.certificateByHash.get(hash) || null;
  }

  getCertCount(): Result<number> {
    return { ok: true, value: this.state.nextCertId };
  }

  isCertRegistered(hash: string): Result<boolean> {
    return { ok: true, value: this.state.certificateByHash.has(hash) };
  }
}

describe("CertificateMinter", () => {
  let contract: CertificateMinterMock;

  beforeEach(() => {
    contract = new CertificateMinterMock();
    contract.reset();
  });

  it("rejects non-registered producer", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.setProducerRegistry("ST1REG");
    contract.setOracleContract("ST1ORACLE");
    contract.producers.clear();
    const result = contract.mintCertificate(1000, 10, "solar", "SiteA", "hash123", "ST1ORACLE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PRODUCER_NOT_REGISTERED);
  });

  it("rejects invalid oracle", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.setProducerRegistry("ST1REG");
    contract.setOracleContract("ST1ORACLE");
    const result = contract.mintCertificate(1000, 10, "solar", "SiteA", "hash123", "ST2FAKE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ORACLE_NOT_VERIFIED);
  });

  it("rejects invalid energy amount", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.setProducerRegistry("ST1REG");
    contract.setOracleContract("ST1ORACLE");
    const result = contract.mintCertificate(0, 10, "solar", "SiteA", "hash123", "ST1ORACLE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AMOUNT);
  });

  it("rejects invalid energy type", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.setProducerRegistry("ST1REG");
    contract.setOracleContract("ST1ORACLE");
    const result = contract.mintCertificate(1000, 10, "invalid", "SiteA", "hash123", "ST1ORACLE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ENERGY_TYPE);
  });

  it("rejects owner update by non-owner", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.setProducerRegistry("ST1REG");
    contract.setOracleContract("ST1ORACLE");
    contract.mintCertificate(1000, 10, "solar", "SiteA", "hash123", "ST1ORACLE");
    contract.caller = "ST2FAKE";
    const result = contract.updateCertificateOwner(0, "ST3NEW");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects owner update for non-existent certificate", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.setProducerRegistry("ST1REG");
    contract.setOracleContract("ST1ORACLE");
    const result = contract.updateCertificateOwner(99, "ST2NEW");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});