import { describe, it, expect, beforeEach } from "vitest";
import { uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_CERT_ID = 101;
const ERR_CERT_NOT_ACTIVE = 102;
const ERR_INVALID_RECEIVER = 103;
const ERR_AUTHORITY_NOT_SET = 104;
const ERR_MINTER_NOT_SET = 105;
const ERR_INVALID_TIMESTAMP = 106;
const ERR_ALREADY_LOCKED = 107;
const ERR_NOT_LOCKED = 108;
const ERR_INVALID_FEE = 109;

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

interface TransferLock {
  certId: number;
  sender: string;
  receiver: string;
  timestamp: number;
  status: string;
}

interface Result {
  ok: boolean;
  value: boolean | number;
}

class TransferHandlerMock {
  state: {
    authorityContract: string | null;
    minterContract: string | null;
    transferFee: number;
    transferLocks: Map<number, TransferLock>;
  } = {
    authorityContract: null,
    minterContract: null,
    transferFee: 100,
    transferLocks: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1OWNER";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];
  certificates: Map<number, Certificate> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      authorityContract: null,
      minterContract: null,
      transferFee: 100,
      transferLocks: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1OWNER";
    this.stxTransfers = [];
    this.certificates = new Map();
  }

  setAuthorityContract(contractPrincipal: string): Result {
    if (this.state.authorityContract) return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMinterContract(contractPrincipal: string): Result {
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: false };
    this.state.minterContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setTransferFee(newFee: number): Result {
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: false };
    if (newFee < 0) return { ok: false, value: ERR_INVALID_FEE };
    this.state.transferFee = newFee;
    return { ok: true, value: true };
  }

  getCertificate(certId: number): Certificate | null {
    return this.certificates.get(certId) || null;
  }

  updateCertificateOwner(certId: number, newOwner: string): Result {
    const cert = this.certificates.get(certId);
    if (!cert) return { ok: false, value: ERR_INVALID_CERT_ID };
    if (cert.owner !== this.caller)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (cert.status !== "active")
      return { ok: false, value: ERR_CERT_NOT_ACTIVE };
    this.certificates.set(certId, { ...cert, owner: newOwner });
    return { ok: true, value: true };
  }

  lockTransfer(certId: number, receiver: string, timestamp: number): Result {
    if (!this.state.minterContract)
      return { ok: false, value: ERR_MINTER_NOT_SET };
    const cert = this.getCertificate(certId);
    if (!cert) return { ok: false, value: ERR_INVALID_CERT_ID };
    if (cert.status !== "active")
      return { ok: false, value: ERR_CERT_NOT_ACTIVE };
    if (cert.owner !== this.caller)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (receiver === this.caller)
      return { ok: false, value: ERR_INVALID_RECEIVER };
    if (this.state.transferLocks.has(certId))
      return { ok: false, value: ERR_ALREADY_LOCKED };
    if (timestamp < this.blockHeight)
      return { ok: false, value: ERR_INVALID_TIMESTAMP };
    this.state.transferLocks.set(certId, {
      certId,
      sender: this.caller,
      receiver,
      timestamp: this.blockHeight,
      status: "locked",
    });
    return { ok: true, value: true };
  }

  executeTransfer(certId: number): Result {
    if (!this.state.minterContract)
      return { ok: false, value: ERR_MINTER_NOT_SET };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    const lock = this.state.transferLocks.get(certId);
    if (!lock) return { ok: false, value: ERR_NOT_LOCKED };
    if (lock.sender !== this.caller)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.stxTransfers.push({
      amount: this.state.transferFee,
      from: this.caller,
      to: this.state.authorityContract,
    });
    const result = this.updateCertificateOwner(certId, lock.receiver);
    if (!result.ok) return result;
    this.state.transferLocks.set(certId, { ...lock, status: "executed" });
    return { ok: true, value: true };
  }

  cancelTransfer(certId: number): Result {
    const lock = this.state.transferLocks.get(certId);
    if (!lock) return { ok: false, value: ERR_NOT_LOCKED };
    if (lock.sender !== this.caller)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.transferLocks.set(certId, { ...lock, status: "cancelled" });
    return { ok: true, value: true };
  }

  getTransferLock(certId: number): TransferLock | null {
    return this.state.transferLocks.get(certId) || null;
  }

  getTransferFee(): Result {
    return { ok: true, value: this.state.transferFee };
  }

  isCertLocked(certId: number): Result {
    return { ok: true, value: this.state.transferLocks.has(certId) };
  }
}

describe("TransferHandler", () => {
  let contract: TransferHandlerMock;

  beforeEach(() => {
    contract = new TransferHandlerMock();
    contract.reset();
    contract.certificates.set(0, {
      energyAmount: 1000,
      productionTimestamp: 10,
      mintTimestamp: 0,
      producer: "ST1PRODUCER",
      energyType: "solar",
      location: "SiteA",
      metadataHash: "hash123",
      status: "active",
      owner: "ST1OWNER",
    });
  });

  it("rejects cancel for non-locked certificate", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.setMinterContract("ST1MINTER");
    const result = contract.cancelTransfer(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_LOCKED);
  });

  it("sets transfer fee successfully", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.caller = "ST1AUTH";
    const result = contract.setTransferFee(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.transferFee).toBe(200);
  });

  it("rejects invalid transfer fee", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.caller = "ST1AUTH";
    const result = contract.setTransferFee(-1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_FEE);
  });

  it("returns correct transfer fee", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.caller = "ST1AUTH";
    contract.setTransferFee(200);
    const result = contract.getTransferFee();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(200);
  });
});
