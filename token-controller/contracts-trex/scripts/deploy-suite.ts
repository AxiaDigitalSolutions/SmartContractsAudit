import { ethers } from "hardhat";

/**
 * Bootstrap da suíte ERC-3643 (T-REX) por chain — deploy-once.
 *
 * Stand up da infra compartilhada (implementations + Implementation Authority +
 * ONCHAINID IdFactory + TREXFactory + ClaimIssuer da Axia) e de UMA suíte
 * "shared-identity" que materializa os registries compartilhados (IR/IRS/CTR/TIR
 * + ModularCompliance). Os endereços resultantes alimentam `trexParameters`
 * (secret manager) consumido pelo TokenController.
 *
 * Local (verificação):   npx hardhat run scripts/deploy-suite.ts
 * Polygon (produção):    npx hardhat run scripts/deploy-suite.ts --network polygon
 *   (configure `networks.polygon` + a conta operadora no hardhat.config)
 *
 * As CHAVES (agentPrivateKey, claimSigningKey) NÃO são impressas — o operador as
 * preenche no secret manager; aqui só derivamos/expomos os ENDEREÇOS.
 */

const FQ = {
  Token: "@tokenysolutions/t-rex/contracts/token/Token.sol:Token",
  CTR: "@tokenysolutions/t-rex/contracts/registry/implementation/ClaimTopicsRegistry.sol:ClaimTopicsRegistry",
  IR: "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistry.sol:IdentityRegistry",
  IRS: "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistryStorage.sol:IdentityRegistryStorage",
  TIR: "@tokenysolutions/t-rex/contracts/registry/implementation/TrustedIssuersRegistry.sol:TrustedIssuersRegistry",
  MC: "@tokenysolutions/t-rex/contracts/compliance/modular/ModularCompliance.sol:ModularCompliance",
  TREXIA: "@tokenysolutions/t-rex/contracts/proxy/authority/TREXImplementationAuthority.sol:TREXImplementationAuthority",
  TREXFactory: "@tokenysolutions/t-rex/contracts/factory/TREXFactory.sol:TREXFactory",
  ClaimIssuer: "@onchain-id/solidity/contracts/ClaimIssuer.sol:ClaimIssuer",
  IdFactory: "@onchain-id/solidity/contracts/factory/IdFactory.sol:IdFactory",
  Identity: "@onchain-id/solidity/contracts/Identity.sol:Identity",
  OIDImplAuthority: "@onchain-id/solidity/contracts/proxy/ImplementationAuthority.sol:ImplementationAuthority",
};

const KYC_TOPIC = 1n;
const KEY_PURPOSE_CLAIM = 3;
const KEY_TYPE_ECDSA = 1;

function addressKey(addr: string): string {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [addr]));
}

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  // Em produção, agente e issuer podem ser a mesma conta operadora.
  const issuerSigner = signers[1] ?? deployer;
  const net = await ethers.provider.getNetwork();
  const chainId = net.chainId.toString();

  console.log(`\n=== Bootstrap ERC-3643 — chain ${chainId} ===`);
  console.log(`deployer:     ${deployer.address}`);
  console.log(`issuerSigner: ${issuerSigner.address}\n`);

  // Deploy + AGUARDA mineração + loga (essencial em mainnet: sem isso, o passo
  // seguinte roda antes do contrato existir on-chain e reverte).
  const dep = async (label: string, factory: string, ...args: any[]) => {
    const c = await (await ethers.getContractFactory(factory)).deploy(...args);
    await c.waitForDeployment();
    console.log(`  ✓ ${label}: ${await c.getAddress()}`);
    return c;
  };

  console.log("[1/6] Implementações T-REX");
  const tokenImpl = await dep("Token", FQ.Token);
  const ctrImpl = await dep("ClaimTopicsRegistry", FQ.CTR);
  const irImpl = await dep("IdentityRegistry", FQ.IR);
  const irsImpl = await dep("IdentityRegistryStorage", FQ.IRS);
  const tirImpl = await dep("TrustedIssuersRegistry", FQ.TIR);
  const mcImpl = await dep("ModularCompliance", FQ.MC);

  console.log("[2/6] TREX Implementation Authority + versão 4.0.0");
  const trexIA = await dep("TREXImplementationAuthority", FQ.TREXIA, true, ethers.ZeroAddress, ethers.ZeroAddress);
  await (await trexIA.addAndUseTREXVersion(
    { major: 4, minor: 0, patch: 0 },
    {
      tokenImplementation: await tokenImpl.getAddress(),
      ctrImplementation: await ctrImpl.getAddress(),
      irImplementation: await irImpl.getAddress(),
      irsImplementation: await irsImpl.getAddress(),
      tirImplementation: await tirImpl.getAddress(),
      mcImplementation: await mcImpl.getAddress(),
    }
  )).wait();
  console.log("  ✓ versão 4.0.0 registrada");

  console.log("[3/6] ONCHAINID (Identity impl + Authority + IdFactory)");
  const identityImpl = await dep("Identity impl", FQ.Identity, deployer.address, true);
  const oidAuthority = await dep("OID ImplementationAuthority", FQ.OIDImplAuthority, await identityImpl.getAddress());
  const idFactory = await dep("IdFactory", FQ.IdFactory, await oidAuthority.getAddress());

  console.log("[4/6] TREX Factory");
  const factory = await dep("TREXFactory", FQ.TREXFactory, await trexIA.getAddress(), await idFactory.getAddress());
  await (await idFactory.addTokenFactory(await factory.getAddress())).wait();
  console.log("  ✓ TREXFactory autorizada no IdFactory");

  console.log("[5/6] Claim Issuer (Axia)");
  const claimIssuer = await dep("ClaimIssuer", FQ.ClaimIssuer, issuerSigner.address);
  await (await claimIssuer.connect(issuerSigner).addKey(addressKey(issuerSigner.address), KEY_PURPOSE_CLAIM, KEY_TYPE_ECDSA)).wait();
  console.log("  ✓ claim key (purpose 3) adicionada");
  console.log("[6/6] Deploy da suíte shared-identity…");

  // 6. Suíte "shared-identity": materializa os registries compartilhados da chain.
  const salt = `axia-shared-identity-${chainId}`;
  await (await factory.deployTREXSuite(
    salt,
    {
      owner: deployer.address,
      name: "Axia Shared Identity",
      symbol: "AXSI",
      decimals: 18,
      irs: ethers.ZeroAddress,
      ONCHAINID: ethers.ZeroAddress,
      irAgents: [deployer.address],
      tokenAgents: [deployer.address],
      complianceModules: [],
      complianceSettings: [],
    },
    {
      claimTopics: [KYC_TOPIC],
      issuers: [await claimIssuer.getAddress()],
      issuerClaims: [[KYC_TOPIC]],
    }
  )).wait();

  const sharedToken = await ethers.getContractAt(FQ.Token, await factory.getToken(salt));
  const ir = await ethers.getContractAt(FQ.IR, await sharedToken.identityRegistry());
  const identityRegistryAddress = await ir.getAddress();
  const identityStorageAddress = await ir.identityStorage();
  const complianceAddress = await sharedToken.compliance();

  // 7. trexParameters (cole no secret manager; chaves preenchidas pelo operador)
  const trexParameters = {
    [chainId]: {
      idFactoryAddress: await idFactory.getAddress(),
      identityRegistryAddress,
      identityStorageAddress,
      claimIssuerAddress: await claimIssuer.getAddress(),
      trexFactoryAddress: await factory.getAddress(),
      complianceAddress,
      kycClaimTopic: KYC_TOPIC.toString(),
      agentPrivateKey: "<<PREENCHER: chave do agente (owner IdFactory + agente IR + mgmt key)>>",
      claimSigningKey: "<<PREENCHER: chave purpose-3 que assina claims KYC>>",
    },
  };

  console.log("=== trexParameters (secret manager) ===");
  console.log(JSON.stringify(trexParameters, null, 2));
  console.log("\nLembretes operacionais:");
  console.log(" - Registrar a malha custodial (TKN_OWNER, sinks) como identidades institucionais na IR.");
  console.log(" - Suítes fungíveis futuras devem passar irs=identityStorageAddress p/ compartilhar identidades.");
  console.log(" - agentPrivateKey precisa ser owner do IdFactory e agente do IR (transferir/addAgent se diferente do deployer).\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
