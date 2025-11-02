import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_NAME = 101;
const ERR_INVALID_LOCATION = 102;
const ERR_PRODUCER_ALREADY_EXISTS = 103;
const ERR_PRODUCER_NOT_FOUND = 104;
const ERR_INVALID_CAPACITY = 105;
const ERR_INVALID_ENERGY_TYPE = 106;
const ERR_INVALID_TIMESTAMP = 107;
const ERR_MAX_PRODUCERS_EXCEEDED = 108;
const ERR_INVALID_STATUS = 109;
const ERR_AUTHORITY_NOT_SET = 110;

interface Producer {
  name: string;
  location: string;
  energyType: string;
  capacity: number;
  registrationTimestamp: number;
  status: string;
  owner: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ProducerRegistryMock {
  state: {
    nextProducerId: number;
    maxProducers: number;
    authorityContract: string | null;
    registrationFee: number;
    producers: Map<number, Producer>;
    producersByName: Map<string, number>;
  } = {
    nextProducerId: 0,
    maxProducers: 10000,
    authorityContract: null,
    registrationFee: 500,
    producers: new Map(),
    producersByName: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1OWNER";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextProducerId: 0,
      maxProducers: 10000,
      authorityContract: null,
      registrationFee: 500,
      producers: new Map(),
      producersByName: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1OWNER";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (this.state.authorityContract) return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setRegistrationFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: false };
    this.state.registrationFee = newFee;
    return { ok: true, value: true };
  }

  registerProducer(
    name: string,
    location: string,
    energyType: string,
    capacity: number,
    registrationTimestamp: number
  ): Result<number> {
    if (this.state.nextProducerId >= this.state.maxProducers)
      return { ok: false, value: ERR_MAX_PRODUCERS_EXCEEDED };
    if (!name || name.length > 100)
      return { ok: false, value: ERR_INVALID_NAME };
    if (!location || location.length > 100)
      return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["solar", "wind", "hydro"].includes(energyType))
      return { ok: false, value: ERR_INVALID_ENERGY_TYPE };
    if (capacity <= 0) return { ok: false, value: ERR_INVALID_CAPACITY };
    if (registrationTimestamp < this.blockHeight)
      return { ok: false, value: ERR_INVALID_TIMESTAMP };
    if (this.state.producersByName.has(name))
      return { ok: false, value: ERR_PRODUCER_ALREADY_EXISTS };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    this.stxTransfers.push({
      amount: this.state.registrationFee,
      from: this.caller,
      to: this.state.authorityContract,
    });
    const producerId = this.state.nextProducerId;
    const producer: Producer = {
      name,
      location,
      energyType,
      capacity,
      registrationTimestamp,
      status: "pending",
      owner: this.caller,
    };
    this.state.producers.set(producerId, producer);
    this.state.producersByName.set(name, producerId);
    this.state.nextProducerId++;
    return { ok: true, value: producerId };
  }

  updateProducerStatus(producerId: number, newStatus: string): Result<boolean> {
    const producer = this.state.producers.get(producerId);
    if (!producer) return { ok: false, value: false };
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: false };
    if (!["active", "pending", "suspended"].includes(newStatus))
      return { ok: false, value: false };
    this.state.producers.set(producerId, { ...producer, status: newStatus });
    return { ok: true, value: true };
  }

  updateProducerDetails(
    producerId: number,
    newName: string,
    newLocation: string,
    newCapacity: number
  ): Result<boolean> {
    const producer = this.state.producers.get(producerId);
    if (!producer) return { ok: false, value: false };
    if (producer.owner !== this.caller) return { ok: false, value: false };
    if (!newName || newName.length > 100) return { ok: false, value: false };
    if (!newLocation || newLocation.length > 100)
      return { ok: false, value: false };
    if (newCapacity <= 0) return { ok: false, value: false };
    if (newName !== producer.name && this.state.producersByName.has(newName))
      return { ok: false, value: false };
    this.state.producersByName.delete(producer.name);
    this.state.producersByName.set(newName, producerId);
    this.state.producers.set(producerId, {
      ...producer,
      name: newName,
      location: newLocation,
      capacity: newCapacity,
    });
    return { ok: true, value: true };
  }

  getProducer(producerId: number): Producer | null {
    return this.state.producers.get(producerId) || null;
  }

  getProducerByName(name: string): number | null {
    return this.state.producersByName.get(name) || null;
  }

  getProducerCount(): Result<number> {
    return { ok: true, value: this.state.nextProducerId };
  }

  isProducerRegistered(name: string): Result<boolean> {
    return { ok: true, value: this.state.producersByName.has(name) };
  }
}

describe("ProducerRegistry", () => {
  let contract: ProducerRegistryMock;

  beforeEach(() => {
    contract = new ProducerRegistryMock();
    contract.reset();
  });

  it("registers a producer successfully", () => {
    contract.setAuthorityContract("ST1AUTH");
    const result = contract.registerProducer(
      "SolarFarm",
      "SiteA",
      "solar",
      1000,
      10
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const producer = contract.getProducer(0);
    expect(producer?.name).toBe("SolarFarm");
    expect(producer?.location).toBe("SiteA");
    expect(producer?.energyType).toBe("solar");
    expect(producer?.capacity).toBe(1000);
    expect(producer?.registrationTimestamp).toBe(10);
    expect(producer?.status).toBe("pending");
    expect(producer?.owner).toBe("ST1OWNER");
    expect(contract.stxTransfers).toEqual([
      { amount: 500, from: "ST1OWNER", to: "ST1AUTH" },
    ]);
  });

  it("rejects duplicate producer names", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.registerProducer("SolarFarm", "SiteA", "solar", 1000, 10);
    const result = contract.registerProducer(
      "SolarFarm",
      "SiteB",
      "wind",
      2000,
      10
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PRODUCER_ALREADY_EXISTS);
  });

  it("rejects registration without authority contract", () => {
    const result = contract.registerProducer(
      "SolarFarm",
      "SiteA",
      "solar",
      1000,
      10
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_SET);
  });

  it("rejects invalid name", () => {
    contract.setAuthorityContract("ST1AUTH");
    const result = contract.registerProducer("", "SiteA", "solar", 1000, 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_NAME);
  });

  it("rejects invalid energy type", () => {
    contract.setAuthorityContract("ST1AUTH");
    const result = contract.registerProducer(
      "SolarFarm",
      "SiteA",
      "invalid",
      1000,
      10
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ENERGY_TYPE);
  });

  it("rejects invalid capacity", () => {
    contract.setAuthorityContract("ST1AUTH");
    const result = contract.registerProducer(
      "SolarFarm",
      "SiteA",
      "solar",
      0,
      10
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CAPACITY);
  });

  it("rejects invalid timestamp", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.blockHeight = 20;
    const result = contract.registerProducer(
      "SolarFarm",
      "SiteA",
      "solar",
      1000,
      10
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TIMESTAMP);
  });

  it("updates producer status successfully", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.registerProducer("SolarFarm", "SiteA", "solar", 1000, 10);
    contract.caller = "ST1AUTH";
    const result = contract.updateProducerStatus(0, "active");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const producer = contract.getProducer(0);
    expect(producer?.status).toBe("active");
  });

  it("rejects status update by non-authority", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.registerProducer("SolarFarm", "SiteA", "solar", 1000, 10);
    contract.caller = "ST2FAKE";
    const result = contract.updateProducerStatus(0, "active");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects invalid status", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.registerProducer("SolarFarm", "SiteA", "solar", 1000, 10);
    contract.caller = "ST1AUTH";
    const result = contract.updateProducerStatus(0, "invalid");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("updates producer details successfully", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.registerProducer("SolarFarm", "SiteA", "solar", 1000, 10);
    const result = contract.updateProducerDetails(0, "WindFarm", "SiteB", 2000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const producer = contract.getProducer(0);
    expect(producer?.name).toBe("WindFarm");
    expect(producer?.location).toBe("SiteB");
    expect(producer?.capacity).toBe(2000);
  });

  it("rejects details update by non-owner", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.registerProducer("SolarFarm", "SiteA", "solar", 1000, 10);
    contract.caller = "ST2FAKE";
    const result = contract.updateProducerDetails(0, "WindFarm", "SiteB", 2000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects details update for non-existent producer", () => {
    contract.setAuthorityContract("ST1AUTH");
    const result = contract.updateProducerDetails(
      99,
      "WindFarm",
      "SiteB",
      2000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct producer count", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.registerProducer("SolarFarm", "SiteA", "solar", 1000, 10);
    contract.registerProducer("WindFarm", "SiteB", "wind", 2000, 10);
    const result = contract.getProducerCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks producer existence correctly", () => {
    contract.setAuthorityContract("ST1AUTH");
    contract.registerProducer("SolarFarm", "SiteA", "solar", 1000, 10);
    const result = contract.isProducerRegistered("SolarFarm");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.isProducerRegistered("NonExistent");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });
});
