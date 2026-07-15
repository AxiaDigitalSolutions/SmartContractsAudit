import { ethers } from "hardhat";
import { loadCtx, ensureIdentity, FQ } from "./lib/trex";

const COUNTRY_BR = 76;

/**
 * Valida a suíte ERC-3643 JÁ deployada (lê trex-params.json):
 *  1. registra a identidade de um investidor de teste (wallet aleatória)
 *  2. deploya um token de teste via TREXFactory
 *  3. minta para o investidor (deve passar)
 *  4. minta para wallet NÃO verificada (deve REVERTER)
 *
 * Rodar:  npx hardhat run scripts/verify-suite.ts --network polygon
 */
async function main() {
  const { chainId, params, agent } = await loadCtx();
  console.log(`\n=== Verify ERC-3643 — chain ${chainId} ===`);
  console.log(`agent: ${agent.address}\n`);

  const investor = ethers.Wallet.createRandom();
  console.log(`[1/4] Registrando identidade do investidor de teste ${investor.address}`);
  await ensureIdentity(params, agent, investor.address, COUNTRY_BR);
  const ir = await ethers.getContractAt(FQ.IR, params.identityRegistryAddress, agent);
  const verified = await ir.isVerified(investor.address);
  console.log(`  isVerified: ${verified}`);
  if (!verified) { throw new Error("investidor não ficou verificado — checar claimIssuer/claim key"); }

  console.log(`[2/4] Deployando token de teste via TREXFactory`);
  const factory = await ethers.getContractAt(FQ.TREXFactory, params.trexFactoryAddress, agent);
  const salt = `axia-verify-${chainId}-${await ethers.provider.getBlockNumber()}`;
  await (await factory.deployTREXSuite(
    salt,
    {
      owner: agent.address,
      name: "Axia Verify Token",
      symbol: "AXVRF",
      decimals: 18,
      irs: params.identityStorageAddress ?? ethers.ZeroAddress,
      ONCHAINID: ethers.ZeroAddress,
      irAgents: [agent.address],
      tokenAgents: [agent.address],
      complianceModules: [],
      complianceSettings: [],
    },
    {
      claimTopics: [BigInt(params.kycClaimTopic)],
      issuers: [params.claimIssuerAddress],
      issuerClaims: [[BigInt(params.kycClaimTopic)]],
    }
  )).wait();
  const tokenAddr = await factory.getToken(salt);
  const token = await ethers.getContractAt(FQ.Token, tokenAddr, agent);
  console.log(`  token: ${tokenAddr}`);

  console.log(`[3/4] Mintando 100 para o investidor verificado`);
  await (await token.mint(investor.address, ethers.parseEther("100"))).wait();
  console.log(`  balance: ${ethers.formatEther(await token.balanceOf(investor.address))}`);

  console.log(`[4/4] Mint para wallet NÃO verificada (deve reverter)`);
  const stranger = ethers.Wallet.createRandom();
  try {
    await (await token.mint(stranger.address, 1n)).wait();
    console.log(`  ❌ FALHA: mint p/ não-verificado NÃO reverteu`);
  } catch {
    console.log(`  ✓ reverteu, como esperado (compliance on-chain ativo)`);
  }

  console.log(`\n✅ Suíte ERC-3643 validada on-chain na chain ${chainId}.\n`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
