import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/** Fully-qualified names dos contratos da suíte (evita ambiguidade de artifacts). */
export const FQ = {
  Token: "@tokenysolutions/t-rex/contracts/token/Token.sol:Token",
  IR: "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistry.sol:IdentityRegistry",
  TREXFactory: "@tokenysolutions/t-rex/contracts/factory/TREXFactory.sol:TREXFactory",
  ClaimIssuer: "@onchain-id/solidity/contracts/ClaimIssuer.sol:ClaimIssuer",
  IdFactory: "@onchain-id/solidity/contracts/factory/IdFactory.sol:IdFactory",
  Identity: "@onchain-id/solidity/contracts/Identity.sol:Identity",
};

export interface TrexParams {
  idFactoryAddress: string;
  identityRegistryAddress: string;
  identityStorageAddress?: string;
  claimIssuerAddress: string;
  trexFactoryAddress: string;
  complianceAddress: string;
  kycClaimTopic: string;
}

export function addressKey(addr: string): string {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [addr]));
}

/**
 * Carrega os endereços da suíte. Lê `trex-params.json` (objeto keyed por chainId,
 * ou o objeto direto da chain). O caminho pode vir de TREX_PARAMS.
 * O signer (agente) vem da conta configurada no hardhat.config (DEPLOYER_PK).
 */
export async function loadCtx(): Promise<{ chainId: string; params: TrexParams; agent: any }> {
  const chainId = (await ethers.provider.getNetwork()).chainId.toString();
  const file = process.env.TREX_PARAMS || path.resolve(__dirname, "../trex-params.json");
  if (!fs.existsSync(file)) {
    throw new Error(`trex-params não encontrado em ${file}. Crie a partir do output do deploy-suite (cp trex-params.example.json trex-params.json).`);
  }
  const all = JSON.parse(fs.readFileSync(file, "utf-8"));
  const params: TrexParams = all[chainId] || all;
  if (!params?.identityRegistryAddress) {
    throw new Error(`trex-params sem dados para a chain ${chainId}.`);
  }
  const [agent] = await ethers.getSigners();
  return { chainId, params, agent };
}

/**
 * Garante uma identidade verificada para `wallet` (custodial: o agente é management
 * key e assina tudo). Idempotente. country = ISO 3166-1 numérico (BR=76).
 */
export async function ensureIdentity(
  params: TrexParams,
  agent: any,
  wallet: string,
  country: number
): Promise<string> {
  const idFactory = await ethers.getContractAt(FQ.IdFactory, params.idFactoryAddress, agent);
  const ir = await ethers.getContractAt(FQ.IR, params.identityRegistryAddress, agent);

  if (await ir.isVerified(wallet)) {
    return await idFactory.getIdentity(wallet);
  }

  let idAddr: string = await idFactory.getIdentity(wallet);
  if (!idAddr || idAddr === ethers.ZeroAddress) {
    const salt = `axia-id-${wallet}`;
    await (await idFactory.createIdentityWithManagementKeys(wallet, salt, [addressKey(agent.address)])).wait();
    idAddr = await idFactory.getIdentity(wallet);
  }

  const identity = await ethers.getContractAt(FQ.Identity, idAddr, agent);
  const topic = BigInt(params.kycClaimTopic);
  const data = ethers.toUtf8Bytes("KYC approved by Axia");
  const dataHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256", "bytes"], [idAddr, topic, data])
  );
  // agent == claimSigner == purpose-3 key do ClaimIssuer (setado no deploy).
  const signature = await agent.signMessage(ethers.getBytes(dataHash));
  try {
    await (await identity.addClaim(topic, 1, params.claimIssuerAddress, signature, data, "")).wait();
  } catch (e: any) {
    if (!String(e?.message ?? e).toLowerCase().includes("already")) { throw e; }
  }

  if (!(await ir.isVerified(wallet))) {
    await (await ir.registerIdentity(wallet, idAddr, country)).wait();
  }
  return idAddr;
}
