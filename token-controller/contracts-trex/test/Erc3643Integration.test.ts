import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// Fully-qualified names — evita ambiguidade de artifacts entre T-REX e ONCHAINID.
const FQ = {
  Token: "@tokenysolutions/t-rex/contracts/token/Token.sol:Token",
  CTR: "@tokenysolutions/t-rex/contracts/registry/implementation/ClaimTopicsRegistry.sol:ClaimTopicsRegistry",
  IR: "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistry.sol:IdentityRegistry",
  IRS: "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistryStorage.sol:IdentityRegistryStorage",
  TIR: "@tokenysolutions/t-rex/contracts/registry/implementation/TrustedIssuersRegistry.sol:TrustedIssuersRegistry",
  MC: "@tokenysolutions/t-rex/contracts/compliance/modular/ModularCompliance.sol:ModularCompliance",
  TREXIA: "@tokenysolutions/t-rex/contracts/proxy/authority/TREXImplementationAuthority.sol:TREXImplementationAuthority",
  TREXFactory: "@tokenysolutions/t-rex/contracts/factory/TREXFactory.sol:TREXFactory",
  Identity: "@onchain-id/solidity/contracts/Identity.sol:Identity",
  ClaimIssuer: "@onchain-id/solidity/contracts/ClaimIssuer.sol:ClaimIssuer",
  IdFactory: "@onchain-id/solidity/contracts/factory/IdFactory.sol:IdFactory",
  OIDImplAuthority: "@onchain-id/solidity/contracts/proxy/ImplementationAuthority.sol:ImplementationAuthority",
};

const KYC_TOPIC = 1n; // claim topic exigido (KYC)
const COUNTRY_BR = 76; // ISO 3166-1 numérico
const CLAIM_SCHEME_ECDSA = 1;
const KEY_PURPOSE_CLAIM = 3;
const KEY_TYPE_ECDSA = 1;

function addressKey(addr: string): string {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [addr]));
}

describe("ERC-3643 (T-REX) — integração ponta a ponta", () => {
  async function deploySuiteFixture() {
    const [deployer, tokenOwner, issuerSigner, alice, bob, charlie] = await ethers.getSigners();

    // 1. Implementações T-REX
    const tokenImpl = await (await ethers.getContractFactory(FQ.Token)).deploy();
    const ctrImpl = await (await ethers.getContractFactory(FQ.CTR)).deploy();
    const irImpl = await (await ethers.getContractFactory(FQ.IR)).deploy();
    const irsImpl = await (await ethers.getContractFactory(FQ.IRS)).deploy();
    const tirImpl = await (await ethers.getContractFactory(FQ.TIR)).deploy();
    const mcImpl = await (await ethers.getContractFactory(FQ.MC)).deploy();

    // 2. TREX Implementation Authority (referência) + versão
    const trexIA = await (await ethers.getContractFactory(FQ.TREXIA)).deploy(
      true,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await trexIA.addAndUseTREXVersion(
      { major: 4, minor: 0, patch: 0 },
      {
        tokenImplementation: await tokenImpl.getAddress(),
        ctrImplementation: await ctrImpl.getAddress(),
        irImplementation: await irImpl.getAddress(),
        irsImplementation: await irsImpl.getAddress(),
        tirImplementation: await tirImpl.getAddress(),
        mcImplementation: await mcImpl.getAddress(),
      }
    );

    // 3. ONCHAINID: implementação + authority + IdFactory
    const identityImpl = await (await ethers.getContractFactory(FQ.Identity)).deploy(deployer.address, true);
    const oidAuthority = await (await ethers.getContractFactory(FQ.OIDImplAuthority)).deploy(
      await identityImpl.getAddress()
    );
    const idFactory = await (await ethers.getContractFactory(FQ.IdFactory)).deploy(
      await oidAuthority.getAddress()
    );

    // 4. TREX Factory + permissão para criar ONCHAINIDs de token
    const factory = await (await ethers.getContractFactory(FQ.TREXFactory)).deploy(
      await trexIA.getAddress(),
      await idFactory.getAddress()
    );
    await idFactory.addTokenFactory(await factory.getAddress());

    // 5. Claim Issuer (Axia = trusted issuer) com chave de claim (purpose 3)
    const claimIssuer = await (await ethers.getContractFactory(FQ.ClaimIssuer)).deploy(issuerSigner.address);
    await claimIssuer.connect(issuerSigner).addKey(addressKey(issuerSigner.address), KEY_PURPOSE_CLAIM, KEY_TYPE_ECDSA);

    // 6. Deploy da suíte (token + registries + compliance) via factory
    const salt = "axia-crowdfunding-1";
    await factory.deployTREXSuite(
      salt,
      {
        owner: tokenOwner.address,
        name: "Axia Regulated Token",
        symbol: "AXRT",
        decimals: 18,
        irs: ethers.ZeroAddress,
        ONCHAINID: ethers.ZeroAddress,
        irAgents: [tokenOwner.address],
        tokenAgents: [tokenOwner.address],
        complianceModules: [],
        complianceSettings: [],
      },
      {
        claimTopics: [KYC_TOPIC],
        issuers: [await claimIssuer.getAddress()],
        issuerClaims: [[KYC_TOPIC]],
      }
    );

    const tokenAddr = await factory.getToken(salt);
    const token = await ethers.getContractAt(FQ.Token, tokenAddr);
    const ir = await ethers.getContractAt(FQ.IR, await token.identityRegistry());

    return { deployer, tokenOwner, issuerSigner, alice, bob, charlie, idFactory, claimIssuer, token, ir };
  }

  // Helper: cria ONCHAINID, adiciona claim KYC assinado pela Axia e registra no IR.
  async function onboardInvestor(ctx: any, wallet: any, saltSuffix: string) {
    const { deployer, tokenOwner, issuerSigner, idFactory, claimIssuer, ir } = ctx;

    await idFactory.connect(deployer).createIdentity(wallet.address, `oid-${saltSuffix}`);
    const idAddr = await idFactory.getIdentity(wallet.address);
    const identity = await ethers.getContractAt(FQ.Identity, idAddr);

    const claimData = ethers.toUtf8Bytes("KYC approved by Axia");
    const dataHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256", "bytes"], [idAddr, KYC_TOPIC, claimData])
    );
    const signature = await issuerSigner.signMessage(ethers.getBytes(dataHash));

    await identity
      .connect(wallet)
      .addClaim(KYC_TOPIC, CLAIM_SCHEME_ECDSA, await claimIssuer.getAddress(), signature, claimData, "");

    await ir.connect(tokenOwner).registerIdentity(wallet.address, idAddr, COUNTRY_BR);
    return idAddr;
  }

  it("deploya a suíte 3643 com token, identity registry e compliance", async () => {
    const { token, ir } = await loadFixture(deploySuiteFixture);
    expect(await token.getAddress()).to.properAddress;
    expect(await token.symbol()).to.equal("AXRT");
    expect(await ir.getAddress()).to.properAddress;
  });

  it("verifica investidor após ONCHAINID + claim KYC + registro", async () => {
    const ctx = await loadFixture(deploySuiteFixture);
    expect(await ctx.ir.isVerified(ctx.alice.address)).to.equal(false);
    await onboardInvestor(ctx, ctx.alice, "alice");
    expect(await ctx.ir.isVerified(ctx.alice.address)).to.equal(true);
  });

  it("minta para investidor verificado e bloqueia não verificado", async () => {
    const ctx = await loadFixture(deploySuiteFixture);
    await onboardInvestor(ctx, ctx.alice, "alice");

    await ctx.token.connect(ctx.tokenOwner).mint(ctx.alice.address, ethers.parseEther("100"));
    expect(await ctx.token.balanceOf(ctx.alice.address)).to.equal(ethers.parseEther("100"));

    // charlie não passou por KYC → mint reverte
    await expect(
      ctx.token.connect(ctx.tokenOwner).mint(ctx.charlie.address, ethers.parseEther("1"))
    ).to.be.revertedWith("Identity is not verified.");
  });

  it("transfere entre verificados e bloqueia transferência para não verificado", async () => {
    const ctx = await loadFixture(deploySuiteFixture);
    await onboardInvestor(ctx, ctx.alice, "alice");
    await onboardInvestor(ctx, ctx.bob, "bob");

    await ctx.token.connect(ctx.tokenOwner).mint(ctx.alice.address, ethers.parseEther("100"));
    await ctx.token.connect(ctx.tokenOwner).unpause();

    await ctx.token.connect(ctx.alice).transfer(ctx.bob.address, ethers.parseEther("40"));
    expect(await ctx.token.balanceOf(ctx.bob.address)).to.equal(ethers.parseEther("40"));

    // transferência para charlie (sem KYC) reverte por compliance/identidade
    await expect(
      ctx.token.connect(ctx.alice).transfer(ctx.charlie.address, ethers.parseEther("1"))
    ).to.be.revertedWith("Transfer not possible");
  });

  it("congela carteira e impede a transferência (freeze 3643)", async () => {
    const ctx = await loadFixture(deploySuiteFixture);
    await onboardInvestor(ctx, ctx.alice, "alice");
    await onboardInvestor(ctx, ctx.bob, "bob");

    await ctx.token.connect(ctx.tokenOwner).mint(ctx.alice.address, ethers.parseEther("100"));
    await ctx.token.connect(ctx.tokenOwner).unpause();
    await ctx.token.connect(ctx.tokenOwner).setAddressFrozen(ctx.alice.address, true);

    await expect(
      ctx.token.connect(ctx.alice).transfer(ctx.bob.address, ethers.parseEther("1"))
    ).to.be.revertedWith("wallet is frozen");
  });
});
